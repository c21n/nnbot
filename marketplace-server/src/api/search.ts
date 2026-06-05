/**
 * Search API Routes
 *
 * RESTful API endpoints for plugin search.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getPluginService } from '../services/plugin-service.js';
import type { PluginFilters, ApiResponse } from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('SearchAPI');

/**
 * Register search routes
 */
export async function registerSearchRoutes(fastify: FastifyInstance): Promise<void> {
  const pluginService = getPluginService();

  /**
   * GET /api/search
   * Search plugins
   */
  fastify.get('/api/search', {
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
}
