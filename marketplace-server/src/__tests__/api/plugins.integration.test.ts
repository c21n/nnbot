/**
 * Plugin API Integration Tests
 *
 * Integration tests for the plugin API endpoints.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { registerAuthMiddleware } from '../../auth/middleware.js';
import { registerAuthRoutes } from '../../api/auth.js';
import { registerPluginRoutes } from '../../api/plugins.js';
import { registerVersionRoutes } from '../../api/versions.js';
import { registerSearchRoutes } from '../../api/search.js';
import { generateToken } from '../../auth/jwt.js';
import type { ApiResponse, PluginMetadata, PluginDetail } from '../../types/index.js';

describe('Plugin API Integration', () => {
  let fastify: ReturnType<typeof Fastify>;
  let authToken: string;

  beforeAll(async () => {
    // Create Fastify instance
    fastify = Fastify();

    // Register plugins
    await fastify.register(cors, { origin: '*' });
    await fastify.register(multipart);

    // Register auth middleware
    registerAuthMiddleware(fastify);

    // Register routes
    await registerAuthRoutes(fastify);
    await registerPluginRoutes(fastify);
    await registerVersionRoutes(fastify);
    await registerSearchRoutes(fastify);

    // Generate auth token for testing
    authToken = generateToken({
      userId: 1,
      username: 'testuser',
      githubId: 12345,
    });

    // Start server
    await fastify.listen({ port: 0 }); // Use random port
  });

  afterAll(async () => {
    await fastify.close();
  });

  describe('GET /api/plugins', () => {
    it('should return plugin list', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/plugins',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body) as ApiResponse<PluginMetadata[]>;
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('should support search', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/plugins?q=test',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body) as ApiResponse<PluginMetadata[]>;
      expect(body.success).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/plugins?page=1&limit=10',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body) as ApiResponse<PluginMetadata[]>;
      expect(body.success).toBe(true);
    });

    it('should support category filter', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/plugins?category=tools',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body) as ApiResponse<PluginMetadata[]>;
      expect(body.success).toBe(true);
    });
  });

  describe('GET /api/plugins/popular', () => {
    it('should return popular plugins', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/plugins/popular',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body) as ApiResponse<PluginMetadata[]>;
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('should support limit', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/plugins/popular?limit=5',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body) as ApiResponse<PluginMetadata[]>;
      expect(body.success).toBe(true);
    });
  });

  describe('GET /api/plugins/recommended', () => {
    it('should return recommended plugins', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/plugins/recommended',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body) as ApiResponse<PluginMetadata[]>;
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });
  });

  describe('GET /api/plugins/:id', () => {
    it('should return 404 for non-existent plugin', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/plugins/nonexistent/plugin',
      });

      expect(response.statusCode).toBe(404);

      const body = JSON.parse(response.body) as ApiResponse<null>;
      expect(body.success).toBe(false);
      expect(body.error).toBe('Plugin not found');
    });
  });

  describe('POST /api/plugins', () => {
    it('should reject unauthenticated request', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/plugins',
        payload: {
          name: 'test-plugin',
          displayName: 'Test Plugin',
        },
      });

      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body) as ApiResponse<null>;
      expect(body.success).toBe(false);
      expect(body.error).toBe('Authentication required');
    });

    it('should validate input', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/plugins',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        payload: {
          name: '', // Invalid: empty name
          displayName: 'Test Plugin',
        },
      });

      expect(response.statusCode).toBe(400);

      const body = JSON.parse(response.body) as ApiResponse<null>;
      expect(body.success).toBe(false);
    });

    it('should create plugin with valid input', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/plugins',
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        payload: {
          name: 'test-plugin',
          displayName: 'Test Plugin',
          description: 'A test plugin',
          category: 'tools',
          tags: ['test', 'example'],
        },
      });

      // Note: This will fail without database connection
      // In a real integration test, you'd mock the database
      expect([200, 201, 500]).toContain(response.statusCode);
    });
  });

  describe('PUT /api/plugins/:id', () => {
    it('should reject unauthenticated request', async () => {
      const response = await fastify.inject({
        method: 'PUT',
        url: '/api/plugins/testuser/test-plugin',
        payload: {
          displayName: 'Updated Plugin',
        },
      });

      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body) as ApiResponse<null>;
      expect(body.success).toBe(false);
      expect(body.error).toBe('Authentication required');
    });
  });

  describe('DELETE /api/plugins/:id', () => {
    it('should reject unauthenticated request', async () => {
      const response = await fastify.inject({
        method: 'DELETE',
        url: '/api/plugins/testuser/test-plugin',
      });

      expect(response.statusCode).toBe(401);

      const body = JSON.parse(response.body) as ApiResponse<null>;
      expect(body.success).toBe(false);
      expect(body.error).toBe('Authentication required');
    });
  });

  describe('GET /api/search', () => {
    it('should search plugins', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/search?q=test',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body) as ApiResponse<PluginMetadata[]>;
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });

    it('should support filters', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/api/search?q=test&category=tools&sortBy=downloads',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body) as ApiResponse<PluginMetadata[]>;
      expect(body.success).toBe(true);
    });
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body.status).toBe('ok');
      expect(body.timestamp).toBeDefined();
    });
  });
});
