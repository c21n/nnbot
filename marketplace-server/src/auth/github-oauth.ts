/**
 * GitHub OAuth Handler
 *
 * Handles GitHub OAuth flow.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getGitHubService } from '../services/github-service.js';
import { query } from '../db/connection.js';
import { generateToken } from './jwt.js';
import { getConfig } from '../config.js';
import { createLogger } from '../utils/logger.js';
import type { GitHubUser, AuthResponse } from '../types/index.js';

const logger = createLogger('OAuth');

/**
 * Register OAuth routes
 */
export async function registerOAuthRoutes(fastify: FastifyInstance): Promise<void> {
  const github = getGitHubService();
  const config = getConfig();

  // Generate random state for OAuth
  function generateState(): string {
    return Math.random().toString(36).substring(2, 15) +
           Math.random().toString(36).substring(2, 15);
  }

  /**
   * GET /api/auth/github
   * Redirect to GitHub OAuth
   */
  fastify.get('/api/auth/github', async (request: FastifyRequest, reply: FastifyReply) => {
    const state = generateState();

    // Store state in session/cookie for verification
    reply.setCookie('oauth_state', state, {
      path: '/',
      httpOnly: true,
      secure: config.server.cors.origin !== 'http://localhost:3000',
      sameSite: 'lax',
      maxAge: 600, // 10 minutes
    });

    const url = github.getOAuthUrl(state);
    return reply.redirect(url);
  });

  /**
   * GET /api/auth/github/callback
   * Handle OAuth callback
   */
  fastify.get('/api/auth/github/callback', async (request: FastifyRequest, reply: FastifyReply) => {
    const { code, state } = request.query as { code?: string; state?: string };

    // Verify state
    const cookies = request.cookies as Record<string, string>;
    const storedState = cookies.oauth_state;

    if (!state || state !== storedState) {
      logger.warn('Invalid OAuth state');
      return reply.status(400).send({
        success: false,
        error: 'Invalid OAuth state',
      });
    }

    // Clear state cookie
    reply.clearCookie('oauth_state', { path: '/' });

    if (!code) {
      return reply.status(400).send({
        success: false,
        error: 'Missing OAuth code',
      });
    }

    try {
      // Exchange code for token
      const tokenResponse = await github.exchangeCode(code);

      // Get user info
      const githubUser = await github.getUserInfo(tokenResponse.access_token);

      // Upsert user in database
      const user = await upsertUser(githubUser);

      // Generate JWT
      const token = generateToken({
        userId: user.id,
        username: user.username,
        githubId: user.github_id,
      });

      const response: AuthResponse = {
        token,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.display_name,
          avatarUrl: user.avatar_url,
        },
      };

      // Redirect to frontend with token
      const redirectUrl = new URL(config.server.cors.origin as string);
      redirectUrl.searchParams.set('token', token);

      return reply.redirect(redirectUrl.toString());
    } catch (err) {
      logger.error('OAuth callback failed', err);
      return reply.status(500).send({
        success: false,
        error: 'OAuth callback failed',
      });
    }
  });
}

/**
 * Upsert user in database
 */
async function upsertUser(githubUser: GitHubUser): Promise<{
  id: number;
  github_id: number;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}> {
  const sql = `
    INSERT INTO users (github_id, username, display_name, email, avatar_url, bio)
    VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (github_id) DO UPDATE SET
      username = EXCLUDED.username,
      display_name = EXCLUDED.display_name,
      email = EXCLUDED.email,
      avatar_url = EXCLUDED.avatar_url,
      bio = EXCLUDED.bio,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id, github_id, username, display_name, avatar_url
  `;

  const result = await query(sql, [
    githubUser.id,
    githubUser.login,
    githubUser.name,
    githubUser.email,
    githubUser.avatar_url,
    githubUser.bio,
  ]);

  return result.rows[0] as any;
}
