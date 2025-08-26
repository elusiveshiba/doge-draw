/**
 * Secure environment configuration with validation
 * Ensures all required environment variables are present at startup
 */

interface Config {
  // Security
  jwtSecret: string;
  jwtExpirationTime: string;
  adminWalletAddresses: string[];
  
  // Database
  databaseUrl: string;
  
  // Redis
  redisUrl: string;
  
  // Server
  hostname: string;
  port: number;
  frontendUrl?: string;
  
  // Features
  enableWalletValidation: boolean;
  startingCredits: number;
  
  // Rate limiting
  rateLimits: {
    pixelPaint: { maxRequests: number; windowMs: number; burstLimit: number };
    auth: { maxRequests: number; windowMs: number };
    api: { maxRequests: number; windowMs: number; burstLimit: number };
    boardJoin: { maxRequests: number; windowMs: number };
    reportPixel: { maxRequests: number; windowMs: number };
  };
  
  // Caching
  cacheTtl: {
    boardState: number;
    userPresence: number;
    session: number;
    analytics: number;
    userCredits: number;
  };
}

function validateEnv(): Config {
  // Critical security check - fail fast if JWT secret is missing or insecure
  if (!process.env.NEXTAUTH_SECRET || process.env.NEXTAUTH_SECRET.length < 32) {
    throw new Error(
      'NEXTAUTH_SECRET environment variable is required and must be at least 32 characters long. ' +
      'Generate a secure secret: openssl rand -base64 32'
    );
  }
  
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  
  const adminAddresses = process.env.ADMIN_WALLET_ADDRESSES
    ? process.env.ADMIN_WALLET_ADDRESSES.split(',').map(addr => addr.trim()).filter(Boolean)
    : [];
  
  const config: Config = {
    // Security
    jwtSecret: process.env.NEXTAUTH_SECRET,
    jwtExpirationTime: process.env.JWT_EXPIRATION_TIME || '24h',
    adminWalletAddresses: adminAddresses,
    
    // Database
    databaseUrl: process.env.DATABASE_URL,
    
    // Redis
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    
    // Server
    hostname: process.env.HOSTNAME || 'localhost',
    port: parseInt(process.env.PORT || '6832', 10),
    frontendUrl: process.env.FRONTEND_URL,
    
    // Features
    enableWalletValidation: process.env.ENABLE_WALLET_VALIDATION === 'true',
    startingCredits: parseInt(process.env.STARTING_CREDITS || '1000', 10),
    
    // Rate limits - configurable via environment
    rateLimits: {
      pixelPaint: {
        maxRequests: parseInt(process.env.RATE_LIMIT_PIXEL_PAINT_MAX || '30', 10),
        windowMs: parseInt(process.env.RATE_LIMIT_PIXEL_PAINT_WINDOW || '60000', 10),
        burstLimit: parseInt(process.env.RATE_LIMIT_PIXEL_PAINT_BURST || '10', 10),
      },
      auth: {
        maxRequests: parseInt(process.env.RATE_LIMIT_AUTH_MAX || '5', 10),
        windowMs: parseInt(process.env.RATE_LIMIT_AUTH_WINDOW || '300000', 10),
      },
      api: {
        maxRequests: parseInt(process.env.RATE_LIMIT_API_MAX || '100', 10),
        windowMs: parseInt(process.env.RATE_LIMIT_API_WINDOW || '60000', 10),
        burstLimit: parseInt(process.env.RATE_LIMIT_API_BURST || '20', 10),
      },
      boardJoin: {
        maxRequests: parseInt(process.env.RATE_LIMIT_BOARD_JOIN_MAX || '20', 10),
        windowMs: parseInt(process.env.RATE_LIMIT_BOARD_JOIN_WINDOW || '60000', 10),
      },
      reportPixel: {
        maxRequests: parseInt(process.env.RATE_LIMIT_REPORT_PIXEL_MAX || '10', 10),
        windowMs: parseInt(process.env.RATE_LIMIT_REPORT_PIXEL_WINDOW || '300000', 10),
      },
    },
    
    // Cache TTL - configurable
    cacheTtl: {
      boardState: parseInt(process.env.CACHE_TTL_BOARD_STATE || '60', 10),
      userPresence: parseInt(process.env.CACHE_TTL_USER_PRESENCE || '300', 10),
      session: parseInt(process.env.CACHE_TTL_SESSION || '3600', 10),
      analytics: parseInt(process.env.CACHE_TTL_ANALYTICS || '86400', 10),
      userCredits: parseInt(process.env.CACHE_TTL_USER_CREDITS || '1800', 10),
    },
  };
  
  // Validate numeric values
  if (config.port < 1 || config.port > 65535) {
    throw new Error('PORT must be between 1 and 65535');
  }
  
  if (config.startingCredits < 0) {
    throw new Error('STARTING_CREDITS must be non-negative');
  }
  
  return config;
}

// Singleton config instance with validation
export const config = validateEnv();

// Environment type checking
export const isDevelopment = process.env.NODE_ENV === 'development';
export const isProduction = process.env.NODE_ENV === 'production';
export const isTest = process.env.NODE_ENV === 'test';

// Logging configuration
export const logLevel = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');

// Health check configuration
export const healthCheck = {
  enabled: process.env.HEALTH_CHECK_ENABLED !== 'false',
  interval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000', 10), // 30 seconds
};