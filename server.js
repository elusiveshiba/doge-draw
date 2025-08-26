/**
 * Optimized server with proper error handling and resource management
 * Uses centralized configuration and removes global variable pollution
 */

import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';

const dev = process.env.NODE_ENV !== 'production'
const hostname = process.env.HOSTNAME || '0.0.0.0'
const port = parseInt(process.env.PORT || '6832', 10)

// Prepare the Next.js app
const app = next({ dev, hostname, port })
const handle = app.getRequestHandler()

// Server state management
class ServerManager {
  constructor() {
    this.server = null
    this.wsManager = null
    this.isShuttingDown = false
  }

  async initialize() {
    try {
      // Import after Next.js is prepared to ensure proper module resolution
      const { wsManager } = await import('./src/lib/websocket.js')
      const { logger } = await import('./src/lib/logger.js')
      const { config } = await import('./src/lib/config.js')
      
      this.logger = logger
      this.config = config

      // Create HTTP server
      this.server = createServer(async (req, res) => {
        try {
          const parsedUrl = parse(req.url, true)
          await handle(req, res, parsedUrl)
        } catch (err) {
          this.logger.error('Request handling error', { 
            url: req.url, 
            method: req.method,
            error: err.message 
          })
          res.statusCode = 500
          res.end('Internal server error')
        }
      })

      // Initialize WebSocket manager
      this.wsManager = wsManager
      await this.wsManager.initialize(this.server)

      // Setup graceful shutdown
      this.setupGracefulShutdown()

      // Setup server error handling
      this.setupErrorHandling()

      // Start server
      await new Promise((resolve, reject) => {
        this.server.listen(port, hostname, (err) => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      })

      this.logger.info('Server started successfully', {
        hostname,
        port,
        environment: dev ? 'development' : 'production',
        nodeVersion: process.version,
        pid: process.pid
      })

    } catch (error) {
      console.error('Failed to initialize server:', error)
      process.exit(1)
    }
  }

  setupErrorHandling() {
    // Server error handling
    this.server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        this.logger.error(`Port ${port} is already in use`, { port, hostname })
        process.exit(1)
      } else {
        this.logger.error('Server error', { error: error.message })
      }
    })

    this.server.on('clientError', (err, socket) => {
      this.logger.warn('Client error', { error: err.message })
      if (socket.writable) {
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
      }
    })

    // Process error handling
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught exception', { error: error.message, stack: error.stack })
      this.gracefulShutdown('UNCAUGHT_EXCEPTION')
    })

    process.on('unhandledRejection', (reason, promise) => {
      this.logger.error('Unhandled rejection', { 
        reason: reason instanceof Error ? reason.message : reason,
        promise: promise.toString() 
      })
      this.gracefulShutdown('UNHANDLED_REJECTION')
    })
  }

  setupGracefulShutdown() {
    const signals = ['SIGTERM', 'SIGINT', 'SIGUSR2']
    
    signals.forEach((signal) => {
      process.on(signal, () => {
        this.logger.info(`Received ${signal}, initiating graceful shutdown...`)
        this.gracefulShutdown(signal)
      })
    })
  }

  async gracefulShutdown(reason) {
    if (this.isShuttingDown) {
      this.logger.warn('Shutdown already in progress')
      return
    }

    this.isShuttingDown = true
    this.logger.info('Starting graceful shutdown', { reason })

    // Set a timeout for force shutdown
    const forceShutdownTimeout = setTimeout(() => {
      this.logger.error('Force shutdown due to timeout')
      process.exit(1)
    }, 30000) // 30 seconds

    try {
      // Close server to stop accepting new connections
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(() => {
            this.logger.info('HTTP server closed')
            resolve()
          })
        })
      }

      // Close WebSocket connections
      if (this.wsManager) {
        await this.wsManager.shutdown()
      }

      // Close database connections
      const { prisma } = await import('./src/lib/prisma.js')
      await prisma.$disconnect()
      this.logger.info('Database connections closed')

      // Close Redis connections
      const { redisManager } = await import('./src/lib/redis.js')
      await redisManager.disconnect()

      clearTimeout(forceShutdownTimeout)
      this.logger.info('Graceful shutdown completed')
      process.exit(0)

    } catch (error) {
      this.logger.error('Error during graceful shutdown', { error: error.message })
      clearTimeout(forceShutdownTimeout)
      process.exit(1)
    }
  }

  // Health check endpoint for load balancers
  async healthCheck() {
    try {
      const { redisManager } = await import('./src/lib/redis.js')
      const { dbManager } = await import('./src/lib/prisma.js')

      const [redisHealth, dbHealth] = await Promise.all([
        redisManager.isHealthy(),
        dbManager.isHealthy()
      ])

      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        redis: redisHealth ? 'healthy' : 'unhealthy',
        database: dbHealth ? 'healthy' : 'unhealthy',
        websocket: this.wsManager ? this.wsManager.getStats() : null
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      }
    }
  }
}

// Initialize and start server
async function startServer() {
  try {
    await app.prepare()
    
    const serverManager = new ServerManager()
    await serverManager.initialize()
    
    // Make health check available globally for API routes if needed
    global.serverHealth = () => serverManager.healthCheck()

  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

// Start the server
startServer()