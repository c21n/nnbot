/**
 * Logger Utility
 *
 * Pino logger with pretty printing for development.
 */

import pino from 'pino';

/**
 * Create logger instance
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      }
    : undefined,
});

/**
 * Create child logger with context
 */
export function createLogger(context: string): pino.Logger {
  return logger.child({ context });
}
