/**
 * Centralized Prisma client with optimized configuration
 * Singleton pattern with proper connection management
 */

import { PrismaClient } from '@prisma/client';
import { config, isDevelopment, isProduction, healthCheck } from './config';
import { logger } from './logger';

// Global reference for Next.js hot reload persistence
const globalForPrisma = globalThis as unknown as { 
  prisma: PrismaClient | undefined 
};

// Prisma logging configuration based on environment
const getLogConfig = () => {
  if (isDevelopment) {
    return ['query', 'info', 'warn', 'error'] as const;
  }
  if (isProduction) {
    return ['error'] as const;
  }
  return ['error'] as const;
};

// Create optimized Prisma client
function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    datasources: {
      db: {
        url: config.databaseUrl,
      },
    },
    log: getLogConfig(),
    // Optimize connection pool for concurrent usage
    // These can be overridden via DATABASE_URL parameters
  });
}

// Singleton instance
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// Persist for hot reload in development
if (isDevelopment) {
  globalForPrisma.prisma = prisma;
}

// Connection management and health monitoring
class DatabaseManager {
  private static instance: DatabaseManager;
  private healthCheckInterval?: NodeJS.Timeout;
  private isConnected = false;

  private constructor() {
    this.setupEventHandlers();
  }

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  private setupEventHandlers(): void {
    // Handle graceful shutdown
    process.on('SIGTERM', this.gracefulShutdown.bind(this));
    process.on('SIGINT', this.gracefulShutdown.bind(this));

    // Monitor connection health in production
    if (isProduction && healthCheck.enabled) {
      this.startHealthCheck();
    }
  }

  private async gracefulShutdown(): Promise<void> {
    logger.info('Shutting down database connections...');
    
    try {
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
      }

      await prisma.$disconnect();
      this.isConnected = false;
      logger.info('Database connections closed successfully');
    } catch (error) {
      logger.error('Error during database shutdown', { error });
    }
  }

  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await prisma.$queryRaw`SELECT 1`;
        if (!this.isConnected) {
          this.isConnected = true;
          logger.info('Database connection healthy');
        }
      } catch (error) {
        this.isConnected = false;
        logger.error('Database health check failed', { error });
      }
    }, healthCheck.interval);
  }

  async isHealthy(): Promise<boolean> {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  async getStats(): Promise<{
    isConnected: boolean;
    connectionCount?: number;
  }> {
    try {
      // Get connection count (PostgreSQL specific)
      const result = await prisma.$queryRaw<[{ count: bigint }]>`
        SELECT count(*) as count 
        FROM pg_stat_activity 
        WHERE datname = current_database()
      `;
      
      return {
        isConnected: this.isConnected,
        connectionCount: Number(result[0]?.count || 0),
      };
    } catch (error) {
      logger.error('Failed to get database stats', { error });
      return {
        isConnected: false,
      };
    }
  }
}

// Initialize database manager
export const dbManager = DatabaseManager.getInstance();

// Utility functions for common operations
export const dbUtils = {
  /**
   * Execute operation with retry logic
   */
  async withRetry<T>(
    operation: () => Promise<T>, 
    maxRetries = 3,
    delayMs = 1000
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        logger.warn(`Database operation failed, attempt ${attempt}/${maxRetries}`, {
          error: lastError.message,
          attempt,
          maxRetries,
        });
        
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
        }
      }
    }
    
    throw lastError!;
  },

  /**
   * Check if error is a connection error that should be retried
   */
  isRetryableError(error: any): boolean {
    if (!error) return false;
    
    const message = error.message || '';
    const retryableMessages = [
      'Connection terminated',
      'Connection lost',
      'Connection refused',
      'timeout',
      'ECONNRESET',
      'ENOTFOUND',
    ];
    
    return retryableMessages.some(msg => 
      message.toLowerCase().includes(msg.toLowerCase())
    );
  },

  /**
   * Get database connection info
   */
  getConnectionInfo(): { url: string; isProduction: boolean } {
    const url = new URL(config.databaseUrl);
    // Remove password from logs
    url.password = '[REDACTED]';
    
    return {
      url: url.toString(),
      isProduction,
    };
  }
};

// Export types for convenience
export type { PrismaClient } from '@prisma/client'; 