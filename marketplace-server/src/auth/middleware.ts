/**
 * Authentication Middleware
 *
 * Fastify middleware for JWT authentication.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken, extractToken } from './jwt.js';
import type { JWTPayload } from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('Auth');

// Extend FastifyRequest to include user
declare module 'fastify' {
  interface FastifyRequest {
    user?: JWTPayload;
  }
}

/**
 * Authentication middleware
 */
export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const token = extractToken(request.headers.authorization);

  if (!token) {
    return reply.status(401).send({
      success: false,
      error: 'Authentication required',
    });
  }

  try {
    const payload = verifyToken(token);
    request.user = payload;
  } catch (err) {
    logger.warn('Authentication failed', err);
    return reply.status(401).send({
      success: false,
      error: 'Invalid or expired token',
    });
  }
}

/**
 * Optional authentication middleware
 * Sets user if token is valid, but doesn't fail if no token
 */
export async function optionalAuthMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  const token = extractToken(request.headers.authorization);

  if (token) {
    try {
      const payload = verifyToken(token);
      request.user = payload;
    } catch {
      // Ignore invalid tokens for optional auth
    }
  }
}

/**
 * Register auth middleware as Fastify decorator
 */
export function registerAuthMiddleware(fastify: FastifyInstance): void {
  // Decorator for required auth
  fastify.decorate('authenticate', authMiddleware);

  // Decorator for optional auth
  fastify.decorate('authenticateOptional', optionalAuthMiddleware);
}

// Type declarations for decorators
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: typeof authMiddleware;
    authenticateOptional: typeof optionalAuthMiddleware;
  }
}
