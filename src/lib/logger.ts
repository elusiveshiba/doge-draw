/**
 * Structured logging system with different log levels and contexts
 * Provides consistent logging across the application
 */

import { config, isDevelopment, isProduction } from './config';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
type LogContext = Record<string, any>;

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

class Logger {
  private logLevel: LogLevel;

  constructor(logLevel: LogLevel = 'info') {
    this.logLevel = logLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels: Record<LogLevel, number> = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    };
    return levels[level] >= levels[this.logLevel];
  }

  private formatLog(level: LogLevel, message: string, context?: LogContext, error?: Error): LogEntry {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };

    if (context && Object.keys(context).length > 0) {
      entry.context = this.sanitizeContext(context);
    }

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: isDevelopment ? error.stack : undefined,
      };
    }

    return entry;
  }

  private sanitizeContext(context: LogContext): LogContext {
    const sanitized: LogContext = {};
    
    for (const [key, value] of Object.entries(context)) {
      // Remove sensitive data from logs
      if (this.isSensitiveKey(key)) {
        sanitized[key] = '[REDACTED]';
        continue;
      }

      // Limit string length to prevent log spam
      if (typeof value === 'string' && value.length > 1000) {
        sanitized[key] = value.substring(0, 1000) + '... [TRUNCATED]';
        continue;
      }

      // Handle objects recursively but limit depth
      if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.limitObjectDepth(value, 3);
        continue;
      }

      sanitized[key] = value;
    }

    return sanitized;
  }

  private isSensitiveKey(key: string): boolean {
    const sensitiveKeys = [
      'password',
      'passwordHash',
      'token',
      'secret',
      'key',
      'authorization',
      'cookie',
      'session',
    ];
    return sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive.toLowerCase()));
  }

  private limitObjectDepth(obj: any, maxDepth: number, currentDepth = 0): any {
    if (currentDepth >= maxDepth) {
      return '[MAX_DEPTH_REACHED]';
    }

    if (Array.isArray(obj)) {
      return obj.slice(0, 10).map(item => 
        typeof item === 'object' && item !== null 
          ? this.limitObjectDepth(item, maxDepth, currentDepth + 1)
          : item
      );
    }

    if (typeof obj === 'object' && obj !== null) {
      const limited: any = {};
      let keyCount = 0;
      
      for (const [key, value] of Object.entries(obj)) {
        if (keyCount >= 50) { // Limit number of keys
          limited['...'] = '[TRUNCATED]';
          break;
        }
        
        limited[key] = typeof value === 'object' && value !== null
          ? this.limitObjectDepth(value, maxDepth, currentDepth + 1)
          : value;
        
        keyCount++;
      }
      
      return limited;
    }

    return obj;
  }

  private output(entry: LogEntry): void {
    if (isProduction) {
      // In production, output structured JSON for log aggregation
      console.log(JSON.stringify(entry));
    } else {
      // In development, output human-readable format
      const { timestamp, level, message, context, error } = entry;
      const colorMap: Record<LogLevel, string> = {
        debug: '\x1b[36m', // Cyan
        info: '\x1b[32m',  // Green
        warn: '\x1b[33m',  // Yellow
        error: '\x1b[31m', // Red
      };
      const resetColor = '\x1b[0m';
      const color = colorMap[level] || '';

      let output = `${color}[${timestamp}] ${level.toUpperCase()}: ${message}${resetColor}`;
      
      if (context) {
        output += `\n${color}Context:${resetColor} ${JSON.stringify(context, null, 2)}`;
      }
      
      if (error) {
        output += `\n${color}Error:${resetColor} ${error.name}: ${error.message}`;
        if (error.stack) {
          output += `\n${color}Stack:${resetColor}\n${error.stack}`;
        }
      }

      console.log(output);
    }
  }

  debug(message: string, context?: LogContext): void {
    if (!this.shouldLog('debug')) return;
    this.output(this.formatLog('debug', message, context));
  }

  info(message: string, context?: LogContext): void {
    if (!this.shouldLog('info')) return;
    this.output(this.formatLog('info', message, context));
  }

  warn(message: string, context?: LogContext, error?: Error): void {
    if (!this.shouldLog('warn')) return;
    this.output(this.formatLog('warn', message, context, error));
  }

  error(message: string, context?: LogContext, error?: Error): void {
    if (!this.shouldLog('error')) return;
    this.output(this.formatLog('error', message, context, error));
  }

  // Performance logging
  time(label: string): void {
    if (isDevelopment) {
      console.time(label);
    }
  }

  timeEnd(label: string): void {
    if (isDevelopment) {
      console.timeEnd(label);
    }
  }

  // Create child logger with persistent context
  child(persistentContext: LogContext): Logger {
    const childLogger = new Logger(this.logLevel);
    const originalOutput = childLogger.output.bind(childLogger);
    
    childLogger.output = (entry: LogEntry) => {
      entry.context = { ...persistentContext, ...entry.context };
      originalOutput(entry);
    };
    
    return childLogger;
  }
}

// Create and export singleton logger instance
export const logger = new Logger(config.logLevel as LogLevel);

// Export class for creating specialized loggers
export { Logger };