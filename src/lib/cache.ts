import redisClient, { CACHE_KEYS, CACHE_TTL } from './redis';
import { prisma } from './prisma';
import { config } from './config';
import { logger } from './logger';

export interface BoardState {
  boardId: string;
  pixels: Array<{
    x: number;
    y: number;
    color: string;
    price: number;
    timesChanged: number;
  }>;
  lastUpdated: number;
}

export class BoardCache {
  static async getBoardState(boardId: string): Promise<BoardState | null> {
    try {
      const cached = await redisClient.get(CACHE_KEYS.BOARD_STATE(boardId));
      if (cached) {
        const state = JSON.parse(cached);
        // Return cached state if it's fresh (less than 30 seconds)
        if (Date.now() - state.lastUpdated < 30000) {
          return state;
        }
      }
      return null;
    } catch (error) {
      logger.error('Error getting cached board state', { error, boardId });
      return null;
    }
  }

  static async setBoardState(boardId: string, state: BoardState): Promise<void> {
    try {
      await redisClient.setEx(
        CACHE_KEYS.BOARD_STATE(boardId),
        config.cacheTtl.boardState,
        JSON.stringify(state)
      );
    } catch (error) {
      logger.error('Error setting cached board state', { error, boardId });
    }
  }

  static async invalidateBoardState(boardId: string): Promise<void> {
    try {
      await redisClient.del(CACHE_KEYS.BOARD_STATE(boardId));
    } catch (error) {
      logger.error('Error invalidating cached board state', { error, boardId });
    }
  }

  static async getOrSetBoardState(boardId: string): Promise<BoardState | null> {
    const lockKey = `lock:${CACHE_KEYS.BOARD_STATE(boardId)}`;
    // const maxLockWait = 5000; // 5 seconds max wait for lock (unused)
    const lockTtl = 30; // 30 seconds lock TTL
    
    try {
      // Try to get from cache first
      const cached = await this.getBoardState(boardId);
      if (cached) {
        return cached;
      }

      // Implement distributed lock to prevent cache stampede
      const lockValue = `${Date.now()}-${Math.random()}`;
      const acquired = await redisClient.set(lockKey, lockValue, {
        PX: lockTtl * 1000, // TTL in milliseconds
        NX: true // Only set if key doesn't exist
      });

      if (!acquired) {
        // Another process is already fetching, wait briefly then check cache again
        logger.debug('Lock acquisition failed, waiting for other process', { boardId });
        
        // Exponential backoff retry
        for (let attempt = 0; attempt < 5; attempt++) {
          const waitTime = Math.min(100 * Math.pow(2, attempt), 1000); // Max 1 second
          await new Promise(resolve => setTimeout(resolve, waitTime));
          
          const cachedAfterWait = await this.getBoardState(boardId);
          if (cachedAfterWait) {
            return cachedAfterWait;
          }
        }
        
        // If still no cache after waiting, fall back to database
        logger.warn('Cache miss after lock wait, falling back to direct DB query', { boardId });
      }

      // Fetch from database with optimized query
      const board = await prisma.board.findUnique({
        where: { id: boardId },
        include: {
          pixels: {
            where: { isHidden: false },
            select: {
              x: true,
              y: true,
              color: true,
              currentPrice: true,
              timesChanged: true,
            },
            orderBy: [
              { x: 'asc' },
              { y: 'asc' }
            ]
          }
        }
      });

      if (!board) {
        // Release lock before returning
        if (acquired) {
          await this.releaseLock(lockKey, lockValue);
        }
        return null;
      }

      const state: BoardState = {
        boardId,
        pixels: board.pixels.map(pixel => ({
          x: pixel.x,
          y: pixel.y,
          color: pixel.color,
          price: pixel.currentPrice,
          timesChanged: pixel.timesChanged
        })),
        lastUpdated: Date.now()
      };

      // Cache the result
      await this.setBoardState(boardId, state);
      
      // Release lock
      if (acquired) {
        await this.releaseLock(lockKey, lockValue);
      }
      
      return state;

    } catch (error) {
      // Always try to release lock on error
      try {
        if (lockKey) {
          await redisClient.del(lockKey);
        }
      } catch (lockError) {
        logger.error('Error releasing lock after exception', { lockError, boardId });
      }
      
      logger.error('Error fetching board state from database', { error, boardId });
      return null;
    }
  }

  private static async releaseLock(lockKey: string, lockValue: string): Promise<void> {
    try {
      // Use Lua script for atomic lock release
      const script = `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          return redis.call("DEL", KEYS[1])
        else
          return 0
        end
      `;
      
      await redisClient.eval(script, {
        keys: [lockKey],
        arguments: [lockValue]
      });
    } catch (error) {
      logger.error('Error releasing distributed lock', { error, lockKey });
    }
  }

  // Get recent pixel updates since a timestamp (for mobile reconnection)
  static async getRecentPixelUpdates(boardId: string, sinceTimestamp: number): Promise<Array<{
    x: number;
    y: number;
    color: string;
    price: number;
    timesChanged: number;
    updatedAt: number;
  }> | null> {
    try {
      // Get pixels that were updated after the given timestamp
      const recentPixels = await prisma.pixel.findMany({
        where: {
          boardId,
          isHidden: false,
          lastChangedAt: {
            gt: new Date(sinceTimestamp)
          }
        },
        select: {
          x: true,
          y: true,
          color: true,
          currentPrice: true,
          timesChanged: true,
          lastChangedAt: true
        },
        orderBy: {
          lastChangedAt: 'asc' // Oldest changes first
        }
      });

      return recentPixels.map(pixel => ({
        x: pixel.x,
        y: pixel.y,
        color: pixel.color,
        price: pixel.currentPrice,
        timesChanged: pixel.timesChanged,
        updatedAt: pixel.lastChangedAt.getTime()
      }));
    } catch (error) {
      logger.error('Error fetching recent pixel updates', { error, boardId, sinceTimestamp });
      return null;
    }
  }

  // Get board state for viewport (optimized for large boards)
  static async getViewportBoardState(
    boardId: string, 
    startX: number, 
    endX: number, 
    startY: number, 
    endY: number
  ): Promise<BoardState | null> {
    const viewportKey = `${CACHE_KEYS.BOARD_STATE(boardId)}:viewport:${startX}-${endX}-${startY}-${endY}`;
    
    try {
      // Try viewport cache first
      const cached = await redisClient.get(viewportKey);
      if (cached) {
        const state = JSON.parse(cached);
        if (Date.now() - state.lastUpdated < 15000) { // 15 second cache for viewport
          return state;
        }
      }

      // Fetch viewport data from database
      const board = await prisma.board.findUnique({
        where: { id: boardId },
        include: {
          pixels: {
            where: { 
              isHidden: false,
              x: { gte: startX, lte: endX },
              y: { gte: startY, lte: endY }
            },
            select: {
              x: true,
              y: true,
              color: true,
              currentPrice: true,
              timesChanged: true,
            }
          }
        }
      });

      if (!board) return null;

      const state: BoardState = {
        boardId,
        pixels: board.pixels.map(pixel => ({
          x: pixel.x,
          y: pixel.y,
          color: pixel.color,
          price: pixel.currentPrice,
          timesChanged: pixel.timesChanged
        })),
        lastUpdated: Date.now()
      };

      // Cache viewport data with shorter TTL
      await redisClient.setEx(viewportKey, 15, JSON.stringify(state));
      return state;

    } catch (error) {
      logger.error('Error fetching viewport board state', { error, boardId });
      return null;
    }
  }
}

export class UserPresenceCache {
  static async setUserPresence(userId: string, boardId: string, socketId?: string): Promise<void> {
    try {
      const presence = {
        userId,
        boardId,
        socketId,
        lastSeen: Date.now()
      };
      
      // Set user presence
      await redisClient.setEx(
        CACHE_KEYS.USER_PRESENCE(userId),
        config.cacheTtl.userPresence,
        JSON.stringify(presence)
      );

      // Add user to board presence set
      await redisClient.sAdd(`board:${boardId}:users`, userId);
      await redisClient.expire(`board:${boardId}:users`, config.cacheTtl.userPresence);

    } catch (error) {
      logger.error('Error setting user presence', { error, userId, boardId });
    }
  }

  static async getUserPresence(userId: string): Promise<{ userId: string; boardId: string; socketId?: string; lastSeen: number } | null> {
    try {
      const cached = await redisClient.get(CACHE_KEYS.USER_PRESENCE(userId));
      if (cached) {
        return JSON.parse(cached);
      }
      return null;
    } catch (error) {
      logger.error('Error getting user presence', { error, userId });
      return null;
    }
  }

  static async removeUserPresence(userId: string): Promise<void> {
    try {
      // Get current presence to find board
      const presence = await this.getUserPresence(userId);
      if (presence?.boardId) {
        // Remove from board users set
        await redisClient.sRem(`board:${presence.boardId}:users`, userId);
      }

      // Remove user presence
      await redisClient.del(CACHE_KEYS.USER_PRESENCE(userId));
    } catch (error) {
      logger.error('Error removing user presence', { error, userId });
    }
  }

  static async getBoardUsers(boardId: string): Promise<string[]> {
    try {
      return await redisClient.sMembers(`board:${boardId}:users`);
    } catch (error) {
      logger.error('Error getting board users', { error, boardId });
      return [];
    }
  }

  static async getBoardUserCount(boardId: string): Promise<number> {
    try {
      return await redisClient.sCard(`board:${boardId}:users`);
    } catch (error) {
      logger.error('Error getting board user count', { error, boardId });
      return 0;
    }
  }
}

export class AnalyticsCache {
  static async incrementMetric(boardId: string, metric: string, value: number = 1): Promise<void> {
    try {
      const key = CACHE_KEYS.ANALYTICS(boardId, metric);
      await redisClient.incrBy(key, value);
      await redisClient.expire(key, config.cacheTtl.analytics);
    } catch (error) {
      logger.error('Error incrementing analytics metric', { error, boardId, metric });
    }
  }

  static async getMetric(boardId: string, metric: string): Promise<number> {
    try {
      const key = CACHE_KEYS.ANALYTICS(boardId, metric);
      const value = await redisClient.get(key);
      return value ? parseInt(value) : 0;
    } catch (error) {
      logger.error('Error getting analytics metric', { error, boardId, metric });
      return 0;
    }
  }

  static async setMetric(boardId: string, metric: string, value: number): Promise<void> {
    try {
      const key = CACHE_KEYS.ANALYTICS(boardId, metric);
      await redisClient.setEx(key, config.cacheTtl.analytics, value.toString());
    } catch (error) {
      logger.error('Error setting analytics metric', { error, boardId, metric });
    }
  }

  // Batch update multiple metrics efficiently
  static async updateMetrics(boardId: string, metrics: Record<string, number>): Promise<void> {
    try {
      const pipeline = redisClient.multi();
      
      Object.entries(metrics).forEach(([metric, value]) => {
        const key = CACHE_KEYS.ANALYTICS(boardId, metric);
        pipeline.incrBy(key, value);
        pipeline.expire(key, config.cacheTtl.analytics);
      });

      await pipeline.exec();
    } catch (error) {
      logger.error('Error updating metrics batch', { error, boardId });
    }
  }
}

// Real-time stats cache
export class StatsCache {
  static async updatePixelStats(boardId: string): Promise<void> {
    try {
      // Get current pixel count from database
      const pixelCount = await prisma.pixel.count({
        where: { boardId, isHidden: false }
      });

      // Cache for quick access
      await redisClient.setEx(
        `stats:${boardId}:pixels`,
        CACHE_TTL.SHORT,
        pixelCount.toString()
      );

      // Update global stats
      await this.incrementMetric('global', 'total_pixels', 1);
    } catch (error) {
      logger.error('Error updating pixel stats', { error, boardId });
    }
  }

  static async incrementMetric(scope: string, metric: string, value: number = 1): Promise<void> {
    try {
      const key = `stats:${scope}:${metric}`;
      await redisClient.incrBy(key, value);
      await redisClient.expire(key, config.cacheTtl.analytics);
    } catch (error) {
      logger.error('Error incrementing stats metric', { error, scope, metric });
    }
  }

  static async getStats(scope: string): Promise<Record<string, number>> {
    try {
      const keys = await redisClient.keys(`stats:${scope}:*`);
      if (keys.length === 0) return {};

      const pipeline = redisClient.multi();
      keys.forEach(key => pipeline.get(key));
      
      const results = await pipeline.exec();
      const stats: Record<string, number> = {};

      keys.forEach((key: string, index: number) => {
        const metric = key.split(':')[2]; // Extract metric name
        const result = results?.[index];
        const value = (Array.isArray(result) && typeof result[1] === 'string') ? parseInt(result[1]) : 0;
        stats[metric] = value;
      });

      return stats;
    } catch (error) {
      logger.error('Error getting stats', { error, scope });
      return {};
    }
  }
}
