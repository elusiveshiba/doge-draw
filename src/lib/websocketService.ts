/**
 * WebSocket service for API routes
 * Provides centralized WebSocket broadcasting without global pollution
 */

import { wsManager, PixelUpdateData, BoardStatusData } from './websocket';
import { logger } from './logger';

class WebSocketService {
  private static instance: WebSocketService;

  private constructor() {
    // Private constructor for singleton
  }

  static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  /**
   * Broadcast pixel update to all connected clients
   */
  async broadcastPixelUpdate(data: PixelUpdateData): Promise<void> {
    try {
      logger.info('WebSocket service: Starting pixel update broadcast', { data });
      
      // Check if WebSocket server is available by calling the broadcast method directly
      // The wsManager will handle the check internally
      logger.info('WebSocket service: Calling wsManager.broadcastPixelUpdate');
      await wsManager.broadcastPixelUpdate(data);
      logger.info('WebSocket service: Pixel update broadcasted successfully via WebSocket service', { 
        boardId: data.boardId, 
        x: data.x, 
        y: data.y 
      });
    } catch (error) {
      logger.error('WebSocket service: Failed to broadcast pixel update', { error, data });
    }
  }

  /**
   * Broadcast multiple pixel updates efficiently
   */
  async broadcastPixelBatch(pixels: PixelUpdateData[]): Promise<void> {
    try {
      logger.info('WebSocket service: Starting pixel batch broadcast', { pixelCount: pixels.length });
      
      // Use the batch method - the proxy should handle method availability
      await wsManager.broadcastPixelBatch(pixels);
      logger.info('WebSocket service: Pixel batch broadcasted successfully', { 
        pixelCount: pixels.length 
      });
    } catch (error) {
      logger.error('WebSocket service: Failed to broadcast pixel batch', { 
        error: error instanceof Error ? error.message : error,
        errorStack: error instanceof Error ? error.stack : undefined,
        pixelCount: pixels.length 
      });
      
      // Fallback: broadcast pixels individually with small delays to allow server-side batching
      logger.info('WebSocket service: Falling back to individual pixel broadcasts', { pixelCount: pixels.length });
      for (let i = 0; i < pixels.length; i++) {
        const pixel = pixels[i];
        await this.broadcastPixelUpdate(pixel);
        
        // Small delay to allow server-side batching to collect them
        if (i < pixels.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 5));
        }
      }
    }
  }

  /**
   * Broadcast pixel hidden event
   */
  async broadcastPixelHidden(boardId: string, x: number, y: number): Promise<void> {
    try {
      await wsManager.broadcastPixelHidden(boardId, x, y);
      logger.debug('Pixel hidden event broadcasted', { boardId, x, y });
    } catch (error) {
      logger.error('Failed to broadcast pixel hidden', { error, boardId, x, y });
    }
  }

  /**
   * Broadcast board status change
   */
  async broadcastBoardStatus(data: BoardStatusData): Promise<void> {
    try {
      await wsManager.broadcastBoardStatus(data);
      logger.debug('Board status broadcasted', { data });
    } catch (error) {
      logger.error('Failed to broadcast board status', { error, data });
    }
  }

  /**
   * Broadcast credits update to user
   */
  async broadcastCreditsUpdate(userId: string, newCredits: number): Promise<void> {
    try {
      await wsManager.broadcastCreditsUpdate(userId, newCredits);
      logger.debug('Credits update broadcasted via WebSocket service', { userId, newCredits });
    } catch (error) {
      logger.error('Failed to broadcast credits update', { error, userId, newCredits });
    }
  }

  /**
   * Get WebSocket connection statistics
   */
  getStats(): {
    connected: number;
    boards: number;
    totalConnections: number;
  } | null {
    try {
      return wsManager.getStats();
    } catch (error) {
      logger.error('Failed to get WebSocket stats', { error });
      return null;
    }
  }

  /**
   * Check if WebSocket service is available
   */
  isAvailable(): boolean {
    try {
      return wsManager && wsManager['io'] !== null;
    } catch {
      return false;
    }
  }

  /**
   * Broadcast general message to board room
   */
  async broadcastToBoard(boardId: string, eventName: string, payload: any): Promise<void> {
    try {
      const io = wsManager['io'];
      if (io) {
        io.to(`board-${boardId}`).emit(eventName, payload);
        logger.debug('Custom event broadcasted to board', { boardId, eventName });
      } else {
        logger.warn('WebSocket server not available for custom broadcast');
      }
    } catch (error) {
      logger.error('Failed to broadcast custom event', { error, boardId, eventName });
    }
  }
}

// Export singleton instance
export const webSocketService = WebSocketService.getInstance();

// Export types for convenience
export type { PixelUpdateData, BoardStatusData } from './websocket';