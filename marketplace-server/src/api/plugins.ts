/**
 * Plugin API Routes
 *
 * RESTful API endpoints for plugin management.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getPluginService } from '../services/plugin-service.js';
import { authMiddleware, optionalAuthMiddleware } from '../auth/middleware.js';
import type {
  CreatePluginRequest,
  UpdatePluginRequest,
  PublishVersionRequest,
  PluginFilters,
  ApiResponse,
} from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('PluginAPI');

// Validation schemas
const CreatePluginSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  displayName: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  category: z.string().max(50).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  license: z.string().max(50).optional(),
  homepage: z.string().url().optional(),
  repository: z.string().url().optional(),
  icon: z.string().url().optional(),
});

const UpdatePluginSchema = z.object({
  displayName: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  category: z.string().max(50).optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  license: z.string().max(50).optional(),
  homepage: z.string().url().optional(),
  repository: z.string().url().optional(),
  icon: z.string().url().optional(),
});

const PublishVersionSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  changelog: z.string().max(5000).optional(),
  dependencies: z.array(z.object({
    pluginId: z.string(),
    versionRange: z.string(),
    optional: z.boolean(),
  })).optional(),
  permissions: z.array(z.object({
    name: z.string(),
    description: z.string(),
    required: z.boolean(),
  })).optional(),
});

/**
 * Register plugin routes
 */
export async function registerPluginRoutes(fastify: FastifyInstance): Promise<void> {
  const pluginService = getPluginService();

  /**
   * GET /api/plugins
   * List plugins with search and filters
   */
  fastify.get('/api/plugins', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string' },
          category: { type: 'string' },
          tags: { type: 'string' },
          minRating: { type: 'number' },
          sortBy: { type: 'string', enum: ['downloads', 'rating', 'updated', 'created'] },
          sortOrder: { type: 'string', enum: ['asc', 'desc'] },
          page: { type: 'integer', minimum: 1 },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const query = request.query as {
      q?: string;
      category?: string;
      tags?: string;
      minRating?: number;
      sortBy?: string;
      sortOrder?: string;
      page?: number;
      limit?: number;
    };

    const filters: PluginFilters = {
      category: query.category,
      tags: query.tags ? query.tags.split(',') : undefined,
      minRating: query.minRating,
      sortBy: query.sortBy as PluginFilters['sortBy'],
      sortOrder: query.sortOrder as PluginFilters['sortOrder'],
      page: query.page,
      limit: query.limit,
    };

    const plugins = await pluginService.searchPlugins(query.q || '', filters);

    const response: ApiResponse<typeof plugins> = {
      success: true,
      data: plugins,
    };

    return reply.send(response);
  });

  /**
   * GET /api/plugins/popular
   * Get popular plugins
   */
  fastify.get('/api/plugins/popular', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 50 },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { limit } = request.query as { limit?: number };
    const plugins = await pluginService.getPopularPlugins(limit);

    const response: ApiResponse<typeof plugins> = {
      success: true,
      data: plugins,
    };

    return reply.send(response);
  });

  /**
   * GET /api/plugins/recommended
   * Get recommended plugins
   */
  fastify.get('/api/plugins/recommended', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 50 },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { limit } = request.query as { limit?: number };
    const plugins = await pluginService.getRecommendedPlugins(limit);

    const response: ApiResponse<typeof plugins> = {
      success: true,
      data: plugins,
    };

    return reply.send(response);
  });

  /**
   * GET /api/plugins/:id
   * Get plugin detail
   */
  fastify.get('/api/plugins/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const plugin = await pluginService.getPluginDetail(decodeURIComponent(id));

    if (!plugin) {
      return reply.status(404).send({
        success: false,
        error: 'Plugin not found',
      });
    }

    const response: ApiResponse<typeof plugin> = {
      success: true,
      data: plugin,
    };

    return reply.send(response);
  });

  /**
   * POST /api/plugins
   * Create a new plugin
   */
  fastify.post('/api/plugins', {
    preHandler: [authMiddleware],
    schema: {
      body: {
        type: 'object',
        required: ['name', 'displayName'],
        properties: {
          name: { type: 'string' },
          displayName: { type: 'string' },
          description: { type: 'string' },
          category: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          license: { type: 'string' },
          homepage: { type: 'string' },
          repository: { type: 'string' },
          icon: { type: 'string' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.userId;
    const body = request.body as CreatePluginRequest;

    // Validate input
    const validation = CreatePluginSchema.safeParse(body);
    if (!validation.success) {
      return reply.status(400).send({
        success: false,
        error: validation.error.errors[0].message,
      });
    }

    try {
      const plugin = await pluginService.createPlugin(userId, validation.data);

      const response: ApiResponse<typeof plugin> = {
        success: true,
        data: plugin,
      };

      return reply.status(201).send(response);
    } catch (err) {
      const error = err as Error;
      logger.error('Failed to create plugin', error.message);

      return reply.status(400).send({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * PUT /api/plugins/:id
   * Update a plugin
   */
  fastify.put('/api/plugins/:id', {
    preHandler: [authMiddleware],
    schema: {
      body: {
        type: 'object',
        properties: {
          displayName: { type: 'string' },
          description: { type: 'string' },
          category: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          license: { type: 'string' },
          homepage: { type: 'string' },
          repository: { type: 'string' },
          icon: { type: 'string' },
        },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const userId = request.user!.userId;
    const body = request.body as UpdatePluginRequest;

    // Validate input
    const validation = UpdatePluginSchema.safeParse(body);
    if (!validation.success) {
      return reply.status(400).send({
        success: false,
        error: validation.error.errors[0].message,
      });
    }

    try {
      const plugin = await pluginService.updatePlugin(
        decodeURIComponent(id),
        userId,
        validation.data
      );

      const response: ApiResponse<typeof plugin> = {
        success: true,
        data: plugin,
      };

      return reply.send(response);
    } catch (err) {
      const error = err as Error;
      logger.error('Failed to update plugin', error.message);

      const status = error.message.includes('not found') ? 404 :
                     error.message.includes('Not authorized') ? 403 : 400;

      return reply.status(status).send({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * DELETE /api/plugins/:id
   * Delete a plugin
   */
  fastify.delete('/api/plugins/:id', {
    preHandler: [authMiddleware],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const userId = request.user!.userId;

    try {
      await pluginService.deletePlugin(decodeURIComponent(id), userId);

      return reply.send({
        success: true,
        message: 'Plugin deleted',
      });
    } catch (err) {
      const error = err as Error;
      logger.error('Failed to delete plugin', error.message);

      const status = error.message.includes('not found') ? 404 :
                     error.message.includes('Not authorized') ? 403 : 400;

      return reply.status(status).send({
        success: false,
        error: error.message,
      });
    }
  });
}
