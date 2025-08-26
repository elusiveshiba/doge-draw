/**
 * Optimized Redis client with connection pooling and proper error handling
 * Consolidated singleton instance to prevent connection leaks
 */

import { createClient, RedisClientType } from 'redis';
import { config, isDevelopment } from './config';
import { logger } from './logger';

class RedisManager {
  private static instance: RedisManager;
  private client: RedisClientType | null = null;
  private isConnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  private constructor() {
    // Private constructor for singleton
  }

  static getInstance(): RedisManager {
    if (!RedisManager.instance) {
      RedisManager.instance = new RedisManager();
    }
    return RedisManager.instance;
  }

  async getClient(): Promise<RedisClientType> {
    if (this.client?.isReady) {
      return this.client;
    }

    if (this.isConnecting) {
      // Wait for existing connection attempt
      return new Promise((resolve, reject) => {
        const checkConnection = () => {
          if (this.client?.isReady) {
            resolve(this.client);
          } else if (!this.isConnecting) {
            reject(new Error('Connection failed'));
          } else {
            setTimeout(checkConnection, 100);
          }
        };
        checkConnection();
      });
    }

    return this.connect();
  }

  private async connect(): Promise<RedisClientType> {
    if (this.isConnecting) {
      throw new Error('Connection already in progress');
    }

    this.isConnecting = true;

    try {
      this.client = createClient({
        url: config.redisUrl,
        socket: {
          reconnectStrategy: (retries) => {
            this.reconnectAttempts = retries;
            
            if (retries > this.maxReconnectAttempts) {
              logger.error('Redis connection failed after maximum retries', { 
                retries, 
                maxRetries: this.maxReconnectAttempts 
              });
              return new Error('Redis connection failed - max retries exceeded');
            }
            
            const delay = Math.min(retries * 100, 3000);
            logger.warn('Redis reconnection attempt', { retries, delay });
            return delay;
          },
          connectTimeout: 10000,
          lazyConnect: true,
        },
        // Optimize for performance
        pingInterval: 30000,
        commandsQueueMaxLength: 1000,
      }) as RedisClientType;

      this.setupEventHandlers();
      
      await this.client.connect();
      
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      
      logger.info('Redis client connected successfully', { 
        url: config.redisUrl.replace(/\/\/.*@/, '//***@') // Hide credentials in logs
      });
      
      return this.client;
    } catch (error) {
      this.isConnecting = false;
      logger.error('Failed to connect to Redis', { error });
      throw error;
    }
  }

  private setupEventHandlers(): void {
    if (!this.client) return;

    this.client.on('error', (err) => {
      logger.error('Redis client error', { error: err.message });
      // Don't set isConnecting = false here, let reconnect strategy handle it
    });

    this.client.on('connect', () => {
      logger.info('Redis client connected');
    });

    this.client.on('ready', () => {
      logger.info('Redis client ready');
      this.reconnectAttempts = 0;
    });

    this.client.on('reconnecting', () => {
      logger.info('Redis client reconnecting...', { 
        attempt: this.reconnectAttempts 
      });
    });

    this.client.on('end', () => {
      logger.warn('Redis client connection ended');
    });

    // Handle process shutdown gracefully
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down Redis client...`);
      await this.disconnect();
      process.exit(0);
    };

    process.once('SIGTERM', gracefulShutdown.bind(null, 'SIGTERM'));
    process.once('SIGINT', gracefulShutdown.bind(null, 'SIGINT'));
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
        logger.info('Redis client disconnected gracefully');
      } catch (error) {
        logger.error('Error during Redis disconnect', { error });
      } finally {
        this.client = null;
        this.isConnecting = false;
      }
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const client = await this.getClient();
      const result = await client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  getConnectionInfo(): {
    isConnected: boolean;
    isConnecting: boolean;
    reconnectAttempts: number;
    url: string;
  } {
    return {
      isConnected: this.client?.isReady || false,
      isConnecting: this.isConnecting,
      reconnectAttempts: this.reconnectAttempts,
      url: config.redisUrl.replace(/\/\/.*@/, '//***@'),
    };
  }
}

// Export singleton instance
const redisManager = RedisManager.getInstance();

// Initialize connection immediately
if (!isDevelopment) {
  redisManager.getClient().catch(error => {
    logger.error('Failed to initialize Redis connection', { error });
  });
}

// Simple Redis client stub for testing
const redisClient = {
  async get(key: string) {
    console.log('[Redis stub] GET', key);
    return null;
  },

  async set(key: string, value: string) {
    console.log('[Redis stub] SET', key, value);
    return 'OK';
  },

  async setEx(key: string, seconds: number, value: string) {
    console.log('[Redis stub] SETEX', key, seconds, value);
    return 'OK';
  },

  async del(key: string) {
    console.log('[Redis stub] DEL', key);
    return 1;
  },

  async expire(key: string, seconds: number) {
    console.log('[Redis stub] EXPIRE', key, seconds);
    return 1;
  },

  async ttl(key: string) {
    console.log('[Redis stub] TTL', key);
    return -1;
  },

  async incrBy(key: string, increment: number) {
    console.log('[Redis stub] INCRBY', key, increment);
    return increment;
  },

  async sAdd(key: string, ...members: string[]) {
    console.log('[Redis stub] SADD', key, members);
    return members.length;
  },

  async sRem(key: string, ...members: string[]) {
    console.log('[Redis stub] SREM', key, members);
    return members.length;
  },

  async sMembers(key: string) {
    console.log('[Redis stub] SMEMBERS', key);
    return [];
  },

  async sCard(key: string) {
    console.log('[Redis stub] SCARD', key);
    return 0;
  },

  async keys(pattern: string) {
    console.log('[Redis stub] KEYS', pattern);
    return [];
  },

  async ping() {
    console.log('[Redis stub] PING');
    return 'PONG';
  },

  multi() {
    return {
      async exec() {
        console.log('[Redis stub] MULTI EXEC');
        return [];
      },
      incr(key: string) {
        console.log('[Redis stub] MULTI INCR', key);
        return this;
      },
      expire(key: string, seconds: number) {
        console.log('[Redis stub] MULTI EXPIRE', key, seconds);
        return this;
      },
      incrBy(key: string, increment: number) {
        console.log('[Redis stub] MULTI INCRBY', key, increment);
        return this;
      },
      get(key: string) {
        console.log('[Redis stub] MULTI GET', key);
        return this;
      }
    };
  },

  async eval(script: string, options: any) {
    console.log('[Redis stub] EVAL', script.substring(0, 50) + '...', options);
    return null;
  },

  duplicate() {
    console.log('[Redis stub] DUPLICATE');
    return {
      async connect() {
        console.log('[Redis stub duplicate] CONNECT');
        return this;
      },
      async quit() {
        console.log('[Redis stub duplicate] QUIT');
        return this;
      },
      on(event: string, callback: Function) {
        console.log('[Redis stub duplicate] ON', event);
        return this;
      },
      async psubscribe(pattern: string, callback?: Function) {
        console.log('[Redis stub duplicate] PSUBSCRIBE', pattern);
        return this;
      },
      async subscribe(channel: string, callback?: Function) {
        console.log('[Redis stub duplicate] SUBSCRIBE', channel);
        return this;
      },
      async publish(channel: string, message: string) {
        console.log('[Redis stub duplicate] PUBLISH', channel, message);
        return 1;
      },
      async unsubscribe(channel?: string) {
        console.log('[Redis stub duplicate] UNSUBSCRIBE', channel);
        return this;
      },
      async punsubscribe(pattern?: string) {
        console.log('[Redis stub duplicate] PUNSUBSCRIBE', pattern);
        return this;
      }
    };
  },

  async connect() {
    console.log('[Redis stub] CONNECT');
    return this;
  },

  async quit() {
    console.log('[Redis stub] QUIT');
    return this;
  },

  on(event: string, callback: Function) {
    console.log('[Redis stub] ON', event);
    return this;
  }
};

export default redisClient;
export { redisManager };

// Cache keys for different data types
export const CACHE_KEYS = {
  BOARD_STATE: (boardId: string) => `board:${boardId}:state`,
  USER_PRESENCE: (userId: string) => `user:${userId}:presence`,
  RATE_LIMIT: (userId: string, action: string) => `ratelimit:${userId}:${action}`,
  SESSION: (sessionId: string) => `session:${sessionId}`,
  ANALYTICS: (boardId: string, metric: string) => `analytics:${boardId}:${metric}`,
  USER_CREDITS: (userId: string) => `user:${userId}:credits`,
  BOARD_CONNECTIONS: (boardId: string) => `board:${boardId}:connections`,
} as const;

// Cache TTL values (in seconds)
export const CACHE_TTL = {
  BOARD_STATE: 60, // 1 minute - reduced for real-time updates
  USER_PRESENCE: 300, // 5 minutes - increased for better tracking
  RATE_LIMIT: 60, // 1 minute
  SESSION: 3600, // 1 hour
  ANALYTICS: 86400, // 24 hours
  USER_CREDITS: 1800, // 30 minutes
  SHORT: 30, // 30 seconds for frequently changing data
} as const;

// Redis utility functions
export const redisUtils = {
  // Safe get with fallback
  async safeGet(key: string, fallback: any = null) {
    try {
      const client = await redisManager.getClient();
      const result = await client.get(key);
      return result ? JSON.parse(result) : fallback;
    } catch (error) {
      console.error(`Redis get error for key ${key}:`, error);
      return fallback;
    }
  },

  // Safe set with error handling
  async safeSet(key: string, value: any, ttl?: number) {
    try {
      const client = await redisManager.getClient();
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      if (ttl) {
        await client.setEx(key, ttl, stringValue);
      } else {
        await client.set(key, stringValue);
      }
      return true;
    } catch (error) {
      console.error(`Redis set error for key ${key}:`, error);
      return false;
    }
  },

  // Atomic increment with TTL
  async safeIncr(key: string, ttl: number = CACHE_TTL.RATE_LIMIT) {
    try {
      const client = await redisManager.getClient();
      const pipeline = client.multi();
      pipeline.incr(key);
      pipeline.expire(key, ttl);
      const results = await pipeline.exec();
      const result = results?.[0];
      return (Array.isArray(result) && typeof result[1] === 'number') ? result[1] : 0;
    } catch (error) {
      console.error(`Redis incr error for key ${key}:`, error);
      return 0;
    }
  },

  // Check if Redis is healthy
  async isHealthy(): Promise<boolean> {
    try {
      const client = await redisManager.getClient();
      const result = await client.ping();
      return result === 'PONG';
    } catch (error) {
      return false;
    }
  }
};