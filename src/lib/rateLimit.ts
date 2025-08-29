import redisClient, { CACHE_KEYS } from './redis';
import { config } from './config';
import { logger } from './logger';

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  keyPrefix: string;
  burstLimit?: number; // Allow short bursts above normal rate
  skipSuccessfulRequests?: boolean; // Only count failed requests
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

export class RateLimiter {
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  async checkLimit(userId: string, action: string, requestSuccess: boolean = true): Promise<RateLimitResult> {
    const key = CACHE_KEYS.RATE_LIMIT(userId, `${this.config.keyPrefix}:${action}`);
    const burstKey = `${key}:burst`;
    
    try {
      const pipeline = redisClient.multi();
      pipeline.get(key);
      pipeline.get(burstKey);
      const results = await pipeline.exec();
      
      const current = (Array.isArray(results?.[0]) && typeof results[0][1] === 'string') ? results[0][1] : null;
      const burstCount = (Array.isArray(results?.[1]) && typeof results[1][1] === 'string') ? results[1][1] : null;
      const now = Date.now();
      
      // Skip counting if request was successful and config says to skip
      const shouldCount = !(this.config.skipSuccessfulRequests && requestSuccess);
      
      if (!current && shouldCount) {
        // First request in window
        const windowTtl = this.config.windowMs / 1000;
        await redisClient.setEx(key, windowTtl, '1');
        
        if (this.config.burstLimit) {
          await redisClient.setEx(burstKey, Math.min(windowTtl, 60), '1'); // Burst window max 60s
        }
        
        return {
          allowed: true,
          remaining: this.config.maxRequests - 1,
          resetTime: now + this.config.windowMs
        };
      }
      
      const count = current ? parseInt(current) : 0;
      const currentBurst = burstCount ? parseInt(burstCount) : 0;
      
      // Check burst limit first if enabled
      if (this.config.burstLimit && currentBurst >= this.config.burstLimit) {
        const burstTtl = await redisClient.ttl(burstKey);
        return {
          allowed: false,
          remaining: 0,
          resetTime: now + (burstTtl * 1000),
          retryAfter: burstTtl
        };
      }
      
      // Check regular rate limit
      if (count >= this.config.maxRequests) {
        const ttl = await redisClient.ttl(key);
        return {
          allowed: false,
          remaining: 0,
          resetTime: now + (ttl * 1000),
          retryAfter: ttl
        };
      }
      
      // Increment counters if we should count this request
      if (shouldCount) {
        const incrPipeline = redisClient.multi();
        incrPipeline.incr(key);
        if (this.config.burstLimit) {
          incrPipeline.incr(burstKey);
        }
        await incrPipeline.exec();
      }
      
      return {
        allowed: true,
        remaining: this.config.maxRequests - count - (shouldCount ? 1 : 0),
        resetTime: now + this.config.windowMs
      };
      
    } catch (error) {
      logger.error('Rate limit check failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      // Allow request if Redis is down (fail open for better UX)
      return {
        allowed: true,
        remaining: this.config.maxRequests,
        resetTime: Date.now() + this.config.windowMs
      };
    }
  }

  async resetLimit(userId: string, action: string): Promise<void> {
    const key = CACHE_KEYS.RATE_LIMIT(userId, `${this.config.keyPrefix}:${action}`);
    const burstKey = `${key}:burst`;
    
    try {
      const pipeline = redisClient.multi();
      pipeline.del(key);
      if (this.config.burstLimit) {
        pipeline.del(burstKey);
      }
      await pipeline.exec();
    } catch (error) {
      logger.error('Failed to reset rate limit', { error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  // Get current usage without incrementing
  async getCurrentUsage(userId: string, action: string): Promise<{ count: number; burstCount: number }> {
    const key = CACHE_KEYS.RATE_LIMIT(userId, `${this.config.keyPrefix}:${action}`);
    const burstKey = `${key}:burst`;
    
    try {
      const pipeline = redisClient.multi();
      pipeline.get(key);
      pipeline.get(burstKey);
      const results = await pipeline.exec();
      
      const count = (Array.isArray(results?.[0]) && typeof results[0][1] === 'string') ? parseInt(results[0][1]) : 0;
      const burstCount = (Array.isArray(results?.[1]) && typeof results[1][1] === 'string') ? parseInt(results[1][1]) : 0;
      
      return { count, burstCount };
    } catch (error) {
      logger.error('Failed to get rate limit usage', { error: error instanceof Error ? error.message : 'Unknown error' });
      return { count: 0, burstCount: 0 };
    }
  }
}

// Use configuration-based rate limits
export const RATE_LIMITS = {
  PIXEL_PAINT: {
    maxRequests: config.rateLimits.pixelPaint.maxRequests,
    windowMs: config.rateLimits.pixelPaint.windowMs,
    keyPrefix: 'pixel_paint',
    burstLimit: config.rateLimits.pixelPaint.burstLimit,
    skipSuccessfulRequests: false
  },
  BOARD_JOIN: {
    maxRequests: config.rateLimits.boardJoin.maxRequests,
    windowMs: config.rateLimits.boardJoin.windowMs,
    keyPrefix: 'board_join',
    burstLimit: 5,
    skipSuccessfulRequests: true // Only count failed joins
  },
  AUTH_ATTEMPT: {
    maxRequests: config.rateLimits.auth.maxRequests,
    windowMs: config.rateLimits.auth.windowMs,
    keyPrefix: 'auth_attempt',
    skipSuccessfulRequests: true // Only count failed auth attempts
  },
  REPORT_PIXEL: {
    maxRequests: config.rateLimits.reportPixel.maxRequests,
    windowMs: config.rateLimits.reportPixel.windowMs,
    keyPrefix: 'report_pixel'
  },
  API_REQUEST: {
    maxRequests: config.rateLimits.api.maxRequests,
    windowMs: config.rateLimits.api.windowMs,
    keyPrefix: 'api_request',
    burstLimit: config.rateLimits.api.burstLimit
  }
} as const;

// Create rate limiter instances
export const rateLimiters = {
  pixelPaint: new RateLimiter(RATE_LIMITS.PIXEL_PAINT),
  boardJoin: new RateLimiter(RATE_LIMITS.BOARD_JOIN),
  authAttempt: new RateLimiter(RATE_LIMITS.AUTH_ATTEMPT),
  reportPixel: new RateLimiter(RATE_LIMITS.REPORT_PIXEL),
  apiRequest: new RateLimiter(RATE_LIMITS.API_REQUEST)
};

// Enhanced rate limiting middleware for API routes
export const createRateLimitMiddleware = (limiterKey: keyof typeof rateLimiters) => {
  return async (userId: string, success: boolean = true) => {
    const limiter = rateLimiters[limiterKey];
    return await limiter.checkLimit(userId, limiterKey, success);
  };
};

// Utility function to get user identifier from request
export const getUserIdentifier = (req: any): string => {
  // Try to get user ID from auth
  if (req.user?.id) return req.user.id;
  
  // Fallback to IP address for anonymous users
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded ? forwarded.split(',')[0] : req.connection?.remoteAddress;
  return `ip:${ip || 'unknown'}`;
};

// Express/Next.js middleware function
export const rateLimitMiddleware = (limiterType: keyof typeof rateLimiters) => {
  return async (req: any, res: any, next: any) => {
    try {
      const userId = getUserIdentifier(req);
      const result = await rateLimiters[limiterType].checkLimit(userId, limiterType);
      
      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', rateLimiters[limiterType]['config'].maxRequests);
      res.setHeader('X-RateLimit-Remaining', result.remaining);
      res.setHeader('X-RateLimit-Reset', new Date(result.resetTime).toISOString());
      
      if (!result.allowed) {
        if (result.retryAfter) {
          res.setHeader('Retry-After', result.retryAfter);
        }
        return res.status(429).json({
          error: 'Too many requests',
          message: `Rate limit exceeded. Try again in ${Math.ceil((result.retryAfter || 60))} seconds.`,
          retryAfter: result.retryAfter
        });
      }
      
      next();
    } catch (error) {
      logger.error('Rate limit middleware error', { error: error instanceof Error ? error.message : 'Unknown error' });
      // Continue on error (fail open)
      next();
    }
  };
};
