/**
 * Auth API Routes
 *
 * RESTful API endpoints for authentication.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { registerOAuthRoutes } from '../auth/github-oauth.js';
import { authMiddleware } from '../auth/middleware.js';
import type { ApiResponse } from '../types/index.js';
import { query } from '../db/connection.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('AuthAPI');

/**
 * Register auth routes
 */
export async function registerAuthRoutes(fastify: FastifyInstance): Promise<void> {
  // Register GitHub OAuth routes
  await registerOAuthRoutes(fastify);

  /**
   * GET /api/auth/me
   * Get current user info
   */
  fastify.get('/api/auth/me', {
    preHandler: [authMiddleware],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.userId;

    try {
      const result = await query(
        `SELECT id, username, display_name as "displayName", avatar_url as "avatarUrl"
         FROM users WHERE id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({
          success: false,
          error: 'User not found',
        });
      }

      const response: ApiResponse<typeof result.rows[0]> = {
        success: true,
        data: result.rows[0],
      };

      return reply.send(response);
    } catch (err) {
      const error = err as Error;
      logger.error('Failed to get user info', error.message);

      return reply.status(500).send({
        success: false,
        error: 'Failed to get user info',
      });
    }
  });

  /**
   * POST /api/auth/refresh
   * Refresh JWT token
   */
  fastify.post('/api/auth/refresh', {
    preHandler: [authMiddleware],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    // Token is already validated by authMiddleware
    // Generate new token with same payload
    const { generateToken } = await import('../auth/jwt.js');
    const newToken = generateToken({
      userId: request.user!.userId,
      username: request.user!.username,
      githubId: request.user!.githubId,
    });

    const response: ApiResponse<{ token: string }> = {
      success: true,
      data: { token: newToken },
    };

    return reply.send(response);
  });
}
