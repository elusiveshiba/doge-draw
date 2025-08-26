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

class WebSocketManager {
  private io: SocketIOServer | null = null;
  private connectionTracker = new Map<string, Set<string>>(); // boardId -> Set<socketId>
  private userConnections = new Map<string, string>(); // socketId -> userId
  private cleanupInterval?: NodeJS.Timeout;

  async initialize(server: HTTPServer): Promise<SocketIOServer> {
    logger.info('WebSocket manager: initialize called', { 
      hasExistingIo: !!this.io, 
      existingIoType: this.io ? typeof this.io : 'null' 
    });
    
    if (this.io) {
      logger.warn('WebSocket server already initialized');
      return this.io;
    }

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
      this.io = new SocketIOServer(server, {
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
          const { boardId, userId } = data;

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

          logger.info('Socket joined board', { socketId: socket.id, boardId, userId });

          // Send board state
          const boardState = await BoardCache.getOrSetBoardState(boardId);
          if (boardState) {
            socket.emit('board-state', {
              type: 'BOARD_STATE',
              payload: boardState
            });
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

    // Handle adapter errors
    if (this.io.adapter && typeof this.io.adapter.on === 'function') {
      this.io.adapter.on('error', (error) => {
        logger.error('Socket.IO adapter error', { error });
      });
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

  // Public API methods for server-side broadcasting
  async broadcastPixelUpdate(data: PixelUpdateData): Promise<void> {
    logger.info('WebSocket manager: Starting broadcastPixelUpdate', { data });
    
    // Check if WebSocket server is ready
    if (!this.io) {
      logger.warn('WebSocket server not initialized, cannot broadcast pixel update');
      return;
    }

    try {
      const roomName = `board-${data.boardId}`;
      logger.info('WebSocket manager: Broadcasting to room', { roomName, data });
      
      this.io.to(roomName).emit('pixel-update', {
        type: 'PIXEL_UPDATE',
        payload: {
          ...data,
          timestamp: Date.now()
        }
      });

      logger.info('WebSocket manager: Event emitted, invalidating cache');
      // Invalidate cache
      await BoardCache.invalidateBoardState(data.boardId);
      
      logger.info('WebSocket manager: Server-side pixel update broadcasted successfully', { boardId: data.boardId, x: data.x, y: data.y });
    } catch (error) {
      logger.error('WebSocket manager: Error broadcasting pixel update', { error, data });
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
  } {
    return {
      hasIo: !!this.io,
      ioType: this.io ? typeof this.io : 'null',
      isInitialized: this.io !== null,
      connectionCount: this.io?.engine?.clientsCount || 0
    };
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down WebSocket server...');

    try {
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
      }

      if (this.io) {
        // Close all connections gracefully
        this.io.close();
        this.io = null;
      }

      this.connectionTracker.clear();
      this.userConnections.clear();

      logger.info('WebSocket server shut down successfully');
    } catch (error) {
      logger.error('Error during WebSocket shutdown', { error });
    }
  }
}

// Export singleton instance
export const wsManager = new WebSocketManager();