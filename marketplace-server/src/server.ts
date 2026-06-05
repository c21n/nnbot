/**
 * Marketplace Server Entry Point
 *
 * Fastify server with all routes and middleware.
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import cookie from '@fastify/cookie';
import { getConfig } from './config.js';
import { testConnection, closePool } from './db/connection.js';
import { registerAuthMiddleware } from './auth/middleware.js';
import { registerAuthRoutes } from './api/auth.js';
import { registerPluginRoutes } from './api/plugins.js';
import { registerVersionRoutes } from './api/versions.js';
import { registerSearchRoutes } from './api/search.js';
import { createLogger } from './utils/logger.js';

const logger = createLogger('Server');

/**
 * Start server
 */
async function start(): Promise<void> {
  const config = getConfig();

  // Create Fastify instance
  const fastify = Fastify({
    logger: {
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
    },
  });

  try {
    // Register plugins
    const originStr = Array.isArray(config.server.cors.origin)
      ? config.server.cors.origin.join(',')
      : config.server.cors.origin;
    const allowedOrigins = originStr.split(',').map((s: string) => s.trim());
    await fastify.register(cors, {
      origin: (origin: string | undefined, cb: (err: Error | null, allow: boolean) => void) => {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) {
          cb(null, true);
          return;
        }
        // Check if origin is in allowed list
        if (allowedOrigins.includes(origin)) {
          cb(null, true);
        } else {
          cb(new Error('Not allowed by CORS'), false);
        }
      },
      credentials: config.server.cors.credentials,
    });

    await fastify.register(multipart, {
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
      },
    });

    await fastify.register(cookie, {
      secret: config.jwt.secret, // for cookies signature
    });

    // Register auth middleware
    registerAuthMiddleware(fastify);

    // Register routes
    await registerAuthRoutes(fastify);
    await registerPluginRoutes(fastify);
    await registerVersionRoutes(fastify);
    await registerSearchRoutes(fastify);

    // Health check endpoint
    fastify.get('/health', async () => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    });

    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      logger.error('Failed to connect to database');
      process.exit(1);
    }

    // Start server
    await fastify.listen({
      host: config.server.host,
      port: config.server.port,
    });

    logger.info(`Server started on ${config.server.host}:${config.server.port}`);

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down...');
      await fastify.close();
      await closePool();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (err) {
    console.error('Failed to start server:', err);
    logger.error('Failed to start server', err);
    process.exit(1);
  }
}

// Start server
start();
