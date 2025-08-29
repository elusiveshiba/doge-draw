/**
 * Centralized WebSocket connection management
 * Eliminates connection leaks and provides proper error handling
 */

import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { createAdapter } from '@socket.io/redis-adapter';
import redisClient from './redis';
import { config, isDevelopment } from './config';
import { logger } from './logger';
import { prisma } from './prisma';
import { BoardCache } from './cache';

export interface PixelUpdateData {
  boardId: string;
  x: number;
  y: number;
  color: string;
  newPrice: number;
  userId: string;
}

export interface BoardStatusData {
  boardId: string;
  status: 'active' | 'frozen' | 'inactive';
}

// Declare global type for Node.js
declare global {
  var __wsManager: WebSocketManager | undefined;
}

class WebSocketManager {
  private static globalInstance: WebSocketManager | null = null;
  private io: SocketIOServer | null = null;
  private connectionTracker = new Map<string, Set<string>>(); // boardId -> Set<socketId>
  private userConnections = new Map<string, string>(); // socketId -> userId
  private cleanupInterval?: NodeJS.Timeout;
  private isInitializing = false;
  private initializationPromise: Promise<SocketIOServer> | null = null;
  
  // Pixel batching system
  private pixelBatchBuffer = new Map<string, PixelUpdateData[]>(); // boardId -> PixelUpdateData[]
  private pixelBatchTimers = new Map<string, NodeJS.Timeout>(); // boardId -> timeout
  private readonly BATCH_DELAY = 50; // 50ms batching window
  private readonly MAX_BATCH_SIZE = 50; // Maximum pixels per batch

  async initialize(server: HTTPServer): Promise<SocketIOServer> {
    logger.info('WebSocket manager: initialize called', { 
      hasExistingIo: !!this.io, 
      existingIoType: this.io ? typeof this.io : 'null',
      isInitializing: this.isInitializing
    });
    
    // Set this as the global instance using both static and global
    WebSocketManager.globalInstance = this;
    global.__wsManager = this;
    
    // If already initialized, return existing instance
    if (this.io) {
      logger.info('WebSocket server already initialized, returning existing instance');
      return this.io;
    }
    
    // If initialization is in progress, wait for it
    if (this.isInitializing && this.initializationPromise) {
      logger.info('WebSocket initialization in progress, waiting...');
      return await this.initializationPromise;
    }
    
    // Start initialization
    this.isInitializing = true;
    this.initializationPromise = this._doInitialize(server);
    
    try {
      const result = await this.initializationPromise;
      return result;
    } finally {
      this.isInitializing = false;
      this.initializationPromise = null;
    }
  }

  private async _doInitialize(server: HTTPServer): Promise<SocketIOServer> {
    try {
      // Create Redis adapter clients
      logger.info('Creating Redis adapter clients...');
      const pubClient = redisClient.duplicate();
      const subClient = redisClient.duplicate();

      logger.info('Connecting Redis clients...');
      await Promise.all([pubClient.connect(), subClient.connect()]);
      logger.info('Redis clients connected successfully');

      // Initialize Socket.IO with optimized configuration
      logger.info('Initializing Socket.IO server...');
      const ioInstance = new SocketIOServer(server, {
        cors: {
          origin: isDevelopment ? '*' : (config.frontendUrl ? [config.frontendUrl] : false),
          methods: ['GET', 'POST'],
          credentials: true,
        },
        adapter: createAdapter(pubClient, subClient),
        transports: ['websocket', 'polling'],
        allowEIO3: true,
        pingTimeout: 60000,
        pingInterval: 25000,
        // Connection limits
        maxHttpBufferSize: 1e6, // 1MB
        // Cleanup options
        cleanupEmptyChildNamespaces: true,
      });
      
      // Store the instance only after successful creation
      this.io = ioInstance;
      
      logger.info('Socket.IO server created successfully', { 
        ioType: typeof this.io, 
        hasIo: !!this.io 
      });

      logger.info('Setting up event handlers...');
      this.setupEventHandlers();
      logger.info('Starting cleanup timer...');
      this.startCleanupTimer();

      logger.info('WebSocket server initialized successfully', {
        transports: ['websocket', 'polling'],
        pingTimeout: 60000,
        pingInterval: 25000,
      });

      return this.io;
    } catch (error) {
      // Clear the io instance on error
      this.io = null;
      logger.error('Failed to initialize WebSocket server', { error });
      throw error;
    }
  }

  private setupEventHandlers(): void {
    if (!this.io) return;

    this.io.on('connection', (socket) => {
      logger.info('Client connected', { socketId: socket.id })
      console.log('🔌 WebSocket client connected:', socket.id);

      // Rate limiting per socket
      const rateLimiter = new Map<string, number[]>();

      const checkRateLimit = (event: string, maxRequests = 30, windowMs = 60000): boolean => {
        const now = Date.now();
        const windowStart = now - windowMs;
        
        if (!rateLimiter.has(event)) {
          rateLimiter.set(event, []);
        }
        
        const requests = rateLimiter.get(event)!;
        // Remove old requests
        while (requests.length > 0 && requests[0] < windowStart) {
          requests.shift();
        }
        
        if (requests.length >= maxRequests) {
          logger.warn('Socket rate limit exceeded', { 
            socketId: socket.id, 
            event, 
            requests: requests.length 
          });
          socket.emit('error', { 
            type: 'RATE_LIMIT_EXCEEDED', 
            message: 'Too many requests' 
          });
          return false;
        }
        
        requests.push(now);
        return true;
      };

      // Handle board joining with proper validation
      socket.on('join-board', async (data) => {
        if (!checkRateLimit('join-board', 10, 60000)) return;

        try {
          const { boardId, userId, lastUpdateTimestamp } = data;

          if (!boardId || typeof boardId !== 'string') {
            socket.emit('error', { type: 'INVALID_BOARD_ID', message: 'Invalid board ID' });
            return;
          }

          // Validate board exists and is active
          const board = await prisma.board.findUnique({
            where: { id: boardId },
            select: { id: true, isActive: true, isFrozen: true }
          });

          if (!board || !board.isActive) {
            socket.emit('error', { type: 'BOARD_NOT_FOUND', message: 'Board not found or inactive' });
            return;
          }

          // Leave previous rooms
          await this.leaveAllBoards(socket);

          // Join new board room
          const roomName = `board-${boardId}`;
          socket.join(roomName);

          // Track connection
          this.trackConnection(boardId, socket.id);
          if (userId) {
            this.userConnections.set(socket.id, userId);
          }

          logger.info('Socket joined board', { 
            socketId: socket.id, 
            boardId, 
            userId,
            lastUpdateTimestamp: lastUpdateTimestamp || 'none'
          });

          // Send board state (full or incremental)
          const boardState = await BoardCache.getOrSetBoardState(boardId);
          if (boardState) {
            // If client provides lastUpdateTimestamp, check if we can send incremental update
            if (lastUpdateTimestamp && typeof lastUpdateTimestamp === 'number') {
              const timeSinceUpdate = Date.now() - lastUpdateTimestamp;
              const isStaleConnection = timeSinceUpdate > 30000; // 30 seconds threshold
              
              if (isStaleConnection) {
                logger.info('Stale connection detected, sending full board refresh', {
                  socketId: socket.id,
                  lastUpdateTimestamp,
                  timeSinceUpdate
                });
                
                // Send full board state for stale connections
                socket.emit('board-refresh', {
                  type: 'BOARD_REFRESH',
                  payload: {
                    ...boardState,
                    reason: 'stale_connection'
                  }
                });
              } else {
                // Try to send incremental updates for recent connections
                const recentUpdates = await BoardCache.getRecentPixelUpdates(boardId, lastUpdateTimestamp);
                
                if (recentUpdates && recentUpdates.length > 0) {
                  logger.info('Sending incremental pixel updates', {
                    socketId: socket.id,
                    updateCount: recentUpdates.length,
                    timeSinceUpdate
                  });
                  
                  socket.emit('pixel-updates', {
                    type: 'PIXEL_UPDATES',
                    payload: {
                      boardId,
                      updates: recentUpdates,
                      syncTimestamp: Date.now()
                    }
                  });
                } else {
                  // No updates or error fetching updates, send full state
                  socket.emit('board-state', {
                    type: 'BOARD_STATE',
                    payload: boardState
                  });
                }
              }
            } else {
              // No timestamp provided, send regular board state
              socket.emit('board-state', {
                type: 'BOARD_STATE',
                payload: boardState
              });
            }
          }

          // Send connection count
          const connectionCount = this.getConnectionCount(boardId);
          this.io!.to(roomName).emit('connection-count', {
            type: 'CONNECTION_COUNT',
            payload: { boardId, count: connectionCount }
          });

        } catch (error) {
          logger.error('Error handling join-board', { error, socketId: socket.id });
          socket.emit('error', { type: 'SERVER_ERROR', message: 'Failed to join board' });
        }
      });

      // Handle pixel painting notifications
      socket.on('pixel-painted', async (data: PixelUpdateData) => {
        if (!checkRateLimit('pixel-painted', 50, 60000)) return;

        try {
          const { boardId, x, y, color, newPrice, userId } = data;

          // Validate data
          if (!boardId || typeof x !== 'number' || typeof y !== 'number' || !color || !userId) {
            logger.warn('Invalid pixel-painted data', { data, socketId: socket.id });
            return;
          }

          // Broadcast to board room
          const roomName = `board-${boardId}`;
          socket.to(roomName).emit('pixel-update', {
            type: 'PIXEL_UPDATE',
            payload: {
              boardId,
              x,
              y,
              color,
              newPrice,
              userId,
              timestamp: Date.now()
            }
          });

          // Invalidate cache
          await BoardCache.invalidateBoardState(boardId);

          logger.debug('Pixel update broadcasted', { boardId, x, y, userId });

        } catch (error) {
          logger.error('Error handling pixel-painted', { error, data });
        }
      });

      // Handle credit updates
      socket.on('credits-updated', (data) => {
        if (!checkRateLimit('credits-updated', 20, 60000)) return;

        try {
          const { userId, newCredits } = data;

          if (!userId || typeof newCredits !== 'number') {
            logger.warn('Invalid credits-updated data', { data, socketId: socket.id });
            return;
          }

          // Broadcast to all user's connections (could be multiple tabs)
          this.io!.emit('credits-update', {
            type: 'CREDITS_UPDATE',
            payload: {
              userId,
              newCredits,
              timestamp: Date.now()
            }
          });

        } catch (error) {
          logger.error('Error handling credits-updated', { error, data });
        }
      });

      // Handle ping/pong for connection health
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
      });

      // Handle client requesting board sync (for when they detect they're out of sync)
      socket.on('request-sync', async (data) => {
        if (!checkRateLimit('request-sync', 5, 60000)) return;

        try {
          const { boardId, lastKnownTimestamp } = data;
          
          if (!boardId) {
            socket.emit('error', { type: 'INVALID_REQUEST', message: 'Board ID required for sync' });
            return;
          }

          logger.info('Client requesting board sync', {
            socketId: socket.id,
            boardId,
            lastKnownTimestamp: lastKnownTimestamp || 'none'
          });

          // Get current board state
          const boardState = await BoardCache.getOrSetBoardState(boardId);
          if (!boardState) {
            socket.emit('error', { type: 'BOARD_NOT_FOUND', message: 'Board not found' });
            return;
          }

          // Always send full refresh when explicitly requested
          socket.emit('board-refresh', {
            type: 'BOARD_REFRESH',
            payload: {
              ...boardState,
              reason: 'client_requested',
              syncTimestamp: Date.now()
            }
          });

          logger.info('Board sync sent to client', {
            socketId: socket.id,
            boardId,
            pixelCount: boardState.pixels.length
          });

        } catch (error) {
          logger.error('Error handling sync request', { error, socketId: socket.id });
          socket.emit('error', { type: 'SYNC_ERROR', message: 'Failed to sync board state' });
        }
      });

      // Handle client heartbeat to track activity
      socket.on('heartbeat', (data) => {
        if (!checkRateLimit('heartbeat', 20, 60000)) return;
        
        try {
          const { boardId, timestamp } = data;
          
          // Update user presence if we have the info
          const userId = this.userConnections.get(socket.id);
          if (userId && boardId) {
            // Store last activity timestamp in socket data
            socket.data = socket.data || {};
            socket.data.lastActivity = timestamp || Date.now();
            socket.data.boardId = boardId;
            
            logger.debug('Heartbeat received', {
              socketId: socket.id,
              userId,
              boardId,
              timestamp
            });
          }
        } catch (error) {
          logger.debug('Error handling heartbeat', { error, socketId: socket.id });
        }
      });

      // Handle disconnection
      socket.on('disconnect', async (reason) => {
        logger.debug('Client disconnected', { socketId: socket.id, reason });

        try {
          // Clean up tracking
          await this.leaveAllBoards(socket);
          this.userConnections.delete(socket.id);
          rateLimiter.clear();
        } catch (error) {
          logger.error('Error during disconnect cleanup', { error, socketId: socket.id });
        }
      });

      // Global error handler
      socket.on('error', (error) => {
        logger.error('Socket error', { error, socketId: socket.id });
      });
    });

    // Handle adapter errors if available
    try {
      const adapter = this.io.adapter();
      if (adapter && typeof adapter.on === 'function') {
        adapter.on('error', (error: any) => {
          logger.error('Socket.IO adapter error', { error });
        });
      }
    } catch (error) {
      logger.debug('Could not set up adapter error handling', { error });
    }
  }

  private async leaveAllBoards(socket: any): Promise<void> {
    for (const [boardId, socketIds] of this.connectionTracker.entries()) {
      if (socketIds.has(socket.id)) {
        socketIds.delete(socket.id);
        
        // Update connection count for remaining clients
        const roomName = `board-${boardId}`;
        const connectionCount = socketIds.size;
        
        this.io!.to(roomName).emit('connection-count', {
          type: 'CONNECTION_COUNT',
          payload: { boardId, count: connectionCount }
        });
        
        // Clean up empty board tracking
        if (socketIds.size === 0) {
          this.connectionTracker.delete(boardId);
        }
      }
    }
  }

  private trackConnection(boardId: string, socketId: string): void {
    if (!this.connectionTracker.has(boardId)) {
      this.connectionTracker.set(boardId, new Set());
    }
    this.connectionTracker.get(boardId)!.add(socketId);
  }

  private getConnectionCount(boardId: string): number {
    return this.connectionTracker.get(boardId)?.size || 0;
  }

  private startCleanupTimer(): void {
    // Clean up stale connections every 5 minutes
    this.cleanupInterval = setInterval(() => {
      try {
        let cleaned = 0;
        
        for (const [boardId, socketIds] of this.connectionTracker.entries()) {
          // Remove sockets that are no longer connected
          for (const socketId of socketIds) {
            if (!this.io!.sockets.sockets.has(socketId)) {
              socketIds.delete(socketId);
              cleaned++;
            }
          }
          
          // Clean up empty board tracking
          if (socketIds.size === 0) {
            this.connectionTracker.delete(boardId);
          }
        }
        
        if (cleaned > 0) {
          logger.info('Cleaned up stale WebSocket connections', { cleaned });
        }
      } catch (error) {
        logger.error('Error during WebSocket cleanup', { error });
      }
    }, 300000); // 5 minutes
  }

  // Batch pixel updates for efficient broadcasting
  private addPixelToBatch(data: PixelUpdateData): void {
    const { boardId } = data;
    
    // Initialize batch buffer for board if needed
    if (!this.pixelBatchBuffer.has(boardId)) {
      this.pixelBatchBuffer.set(boardId, []);
    }
    
    const batch = this.pixelBatchBuffer.get(boardId)!;
    
    // Check for duplicate pixel in current batch (overwrite with latest)
    const existingIndex = batch.findIndex(p => p.x === data.x && p.y === data.y);
    if (existingIndex !== -1) {
      batch[existingIndex] = data;
    } else {
      batch.push(data);
    }
    
    // Flush immediately if batch is full
    if (batch.length >= this.MAX_BATCH_SIZE) {
      this.flushPixelBatch(boardId);
      return;
    }
    
    // Only set timer if none exists yet (don't reset existing timer)
    if (!this.pixelBatchTimers.has(boardId)) {
      this.pixelBatchTimers.set(boardId, setTimeout(() => {
        this.flushPixelBatch(boardId);
      }, this.BATCH_DELAY));
    }
  }
  
  private async flushPixelBatch(boardId: string): Promise<void> {
    const batch = this.pixelBatchBuffer.get(boardId);
    if (!batch || batch.length === 0) return;
    
    // Clear timer and reset batch
    const timer = this.pixelBatchTimers.get(boardId);
    if (timer) {
      clearTimeout(timer);
      this.pixelBatchTimers.delete(boardId);
    }
    this.pixelBatchBuffer.set(boardId, []); // Reset batch
    
    if (!this.io) return;
    
    try {
      const roomName = `board-${boardId}`;
      
      if (batch.length === 1) {
        // Single pixel - use existing single pixel event
        this.io.to(roomName).emit('pixel-update', {
          type: 'PIXEL_UPDATE',
          payload: {
            ...batch[0],
            timestamp: Date.now()
          }
        });
      } else {
        // Multiple pixels - use batch event
        this.io.to(roomName).emit('pixel-batch-update', {
          type: 'PIXEL_BATCH_UPDATE',
          payload: {
            boardId,
            updates: batch.map(pixel => ({
              ...pixel,
              timestamp: Date.now()
            }))
          }
        });
      }
      
      // Invalidate cache
      await BoardCache.invalidateBoardState(boardId);
      
      logger.info('Pixel batch broadcasted successfully', { 
        boardId, 
        batchSize: batch.length 
      });
    } catch (error) {
      logger.error('Error broadcasting pixel batch', { error, boardId, batchSize: batch.length });
    }
  }

  // Broadcast multiple pixels efficiently
  async broadcastPixelBatch(pixels: PixelUpdateData[]): Promise<void> {
    if (pixels.length === 0) return;
    
    const boardId = pixels[0].boardId;
    logger.info('WebSocket manager: Starting batch pixel update broadcast', { 
      boardId,
      pixelCount: pixels.length 
    });
    
    if (!this.io) {
      logger.warn('WebSocket server not initialized, cannot broadcast pixel batch');
      return;
    }

    try {
      // Add all pixels to the batch at once
      for (const pixel of pixels) {
        this.addPixelToBatch(pixel);
      }
      
      // Force flush the batch immediately
      await this.flushPixelBatch(boardId);
      
      logger.info('WebSocket manager: Pixel batch broadcast completed', { 
        boardId, 
        pixelCount: pixels.length 
      });
    } catch (error) {
      logger.error('WebSocket manager: Error broadcasting pixel batch', { error, boardId, pixelCount: pixels.length });
      throw error;
    }
  }

  // Public API methods for server-side broadcasting
  async broadcastPixelUpdate(data: PixelUpdateData): Promise<void> {
    logger.info('WebSocket manager: Starting broadcastPixelUpdate', { 
      data,
      instanceId: this.constructor.name,
      hasIo: !!this.io 
    });
    
    // Check if WebSocket server is ready with enhanced logging
    const status = this.getStatus();
    logger.info('WebSocket manager: Current status', { status });
    
    if (!this.io) {
      logger.warn('WebSocket server not initialized, cannot broadcast pixel update', { 
        status,
        instanceDetails: {
          ioValue: this.io,
          ioType: typeof this.io,
          isInitializing: this.isInitializing,
          hasInitPromise: !!this.initializationPromise
        }
      });
      return;
    }

    try {
      // Add to batch instead of immediate broadcast
      this.addPixelToBatch(data);
      
      const currentBatchSize = this.pixelBatchBuffer.get(data.boardId)?.length || 0;
      
      logger.info('WebSocket manager: Pixel added to batch', { 
        boardId: data.boardId, 
        x: data.x, 
        y: data.y,
        currentBatchSize
      });

      // If we have multiple pixels and no timer is running, flush after a very short delay
      if (currentBatchSize >= 2 && !this.pixelBatchTimers.has(data.boardId)) {
        setTimeout(() => {
          this.flushPixelBatch(data.boardId);
        }, 10); // 10ms delay for multiple pixels
      }
    } catch (error) {
      logger.error('WebSocket manager: Error adding pixel to batch', { error, data, status });
      throw error; // Re-throw to allow caller to handle
    }
  }

  async broadcastPixelHidden(boardId: string, x: number, y: number): Promise<void> {
    if (!this.io) return;

    try {
      const roomName = `board-${boardId}`;
      this.io.to(roomName).emit('pixel-hidden', {
        type: 'PIXEL_HIDDEN',
        payload: { boardId, x, y, timestamp: Date.now() }
      });

      await BoardCache.invalidateBoardState(boardId);
    } catch (error) {
      logger.error('Error broadcasting pixel hidden', { error, boardId, x, y });
    }
  }

  async broadcastBoardStatus(data: BoardStatusData): Promise<void> {
    if (!this.io) return;

    try {
      const roomName = `board-${data.boardId}`;
      this.io.to(roomName).emit('board-status', {
        type: 'BOARD_STATUS',
        payload: {
          ...data,
          timestamp: Date.now()
        }
      });
    } catch (error) {
      logger.error('Error broadcasting board status', { error, data });
    }
  }

  async broadcastCreditsUpdate(userId: string, newCredits: number): Promise<void> {
    if (!this.io) return;

    try {
      // Broadcast to all connected clients (since credits updates are user-specific)
      this.io.emit('credits-update', {
        type: 'CREDITS_UPDATE',
        payload: {
          userId,
          newCredits,
          timestamp: Date.now()
        }
      });
      
      logger.debug('Credits update broadcasted', { userId, newCredits });
    } catch (error) {
      logger.error('Error broadcasting credits update', { error, userId, newCredits });
    }
  }

  getStats(): {
    connected: number;
    boards: number;
    totalConnections: number;
  } {
    let totalConnections = 0;
    for (const socketIds of this.connectionTracker.values()) {
      totalConnections += socketIds.size;
    }

    return {
      connected: this.io?.engine?.clientsCount || 0,
      boards: this.connectionTracker.size,
      totalConnections,
    };
  }

  // Debug method to check WebSocket server status
  getStatus(): {
    hasIo: boolean;
    ioType: string;
    isInitialized: boolean;
    connectionCount: number;
    isInitializing: boolean;
    hasValidSockets: boolean;
  } {
    return {
      hasIo: !!this.io,
      ioType: this.io ? typeof this.io : 'null',
      isInitialized: this.io !== null && !this.isInitializing,
      connectionCount: this.io?.engine?.clientsCount || 0,
      isInitializing: this.isInitializing,
      hasValidSockets: !!(this.io?.sockets)
    };
  }

  // Static method to get the global instance
  static getGlobalInstance(): WebSocketManager | null {
    // Try both static and global approaches
    const instance = WebSocketManager.globalInstance || global.__wsManager || null;
    logger.debug('WebSocketManager.getGlobalInstance called', {
      hasStaticInstance: !!WebSocketManager.globalInstance,
      hasGlobalInstance: !!global.__wsManager,
      returningInstance: !!instance,
      instanceHasIo: instance ? !!(instance as any).io : false
    });
    return instance;
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down WebSocket server...');

    try {
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }

      // Clear all batch timers and flush remaining batches
      for (const [boardId, timer] of this.pixelBatchTimers.entries()) {
        clearTimeout(timer);
        await this.flushPixelBatch(boardId); // Flush any remaining pixels
      }
      this.pixelBatchTimers.clear();
      this.pixelBatchBuffer.clear();

      if (this.io) {
        // Close all connections gracefully
        this.io.close();
        this.io = null;
      }

      this.connectionTracker.clear();
      this.userConnections.clear();

      // Clear global instances if this is it
      if (WebSocketManager.globalInstance === this) {
        WebSocketManager.globalInstance = null;
      }
      if (global.__wsManager === this) {
        global.__wsManager = undefined;
      }

      logger.info('WebSocket server shut down successfully');
    } catch (error) {
      logger.error('Error during WebSocket shutdown', { error });
    }
  }
}

// Create singleton instance
const _defaultWsManager = new WebSocketManager();

// Export function that returns the global instance if available, otherwise the default
export const wsManager = new Proxy(_defaultWsManager, {
  get(target, prop) {
    const globalInstance = WebSocketManager.getGlobalInstance();
    const instance = globalInstance || target;
    
    // Debug logging for critical methods
    if (prop === 'broadcastPixelUpdate' || prop === 'broadcastPixelBatch') {
      logger.info(`WebSocket proxy: accessing ${String(prop)}`, {
        hasGlobalInstance: !!globalInstance,
        usingTarget: !globalInstance,
        globalHasIo: globalInstance ? !!(globalInstance as any).io : false,
        targetHasIo: !!(target as any).io
      });
    }
    
    const value = instance[prop as keyof WebSocketManager];
    return typeof value === 'function' ? value.bind(instance) : value;
  }
});