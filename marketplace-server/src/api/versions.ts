/**
 * Version API Routes
 *
 * RESTful API endpoints for plugin version management.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getPluginService } from '../services/plugin-service.js';
import { authMiddleware } from '../auth/middleware.js';
import type { ApiResponse } from '../types/index.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('VersionAPI');

/**
 * Register version routes
 */
export async function registerVersionRoutes(fastify: FastifyInstance): Promise<void> {
  const pluginService = getPluginService();

  /**
   * GET /api/plugins/:id/versions
   * Get all versions for a plugin
   */
  fastify.get('/api/plugins/:id/versions', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };

    try {
      const versions = await pluginService.getVersions(decodeURIComponent(id));

      const response: ApiResponse<typeof versions> = {
        success: true,
        data: versions,
      };

      return reply.send(response);
    } catch (err) {
      const error = err as Error;
      logger.error('Failed to get versions', error.message);

      return reply.status(404).send({
        success: false,
        error: 'Plugin not found',
      });
    }
  });

  /**
   * GET /api/plugins/:id/versions/:version
   * Get specific version
   */
  fastify.get('/api/plugins/:id/versions/:version', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, version } = request.params as { id: string; version: string };

    try {
      const versions = await pluginService.getVersions(decodeURIComponent(id));
      const versionInfo = versions.find(v => v.version === version);

      if (!versionInfo) {
        return reply.status(404).send({
          success: false,
          error: 'Version not found',
        });
      }

      const response: ApiResponse<typeof versionInfo> = {
        success: true,
        data: versionInfo,
      };

      return reply.send(response);
    } catch (err) {
      const error = err as Error;
      logger.error('Failed to get version', error.message);

      return reply.status(404).send({
        success: false,
        error: 'Plugin not found',
      });
    }
  });

  /**
   * POST /api/plugins/:id/versions
   * Publish a new version
   */
  fastify.post('/api/plugins/:id/versions', {
    preHandler: [authMiddleware],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    const userId = request.user!.userId;

    // Handle multipart form data
    const parts = request.parts();
    const fields: Record<string, string> = {};
    let fileBuffer: Buffer | null = null;
    let fileName: string | null = null;

    for await (const part of parts) {
      if (part.type === 'file') {
        // Read file
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) {
          chunks.push(chunk);
        }
        fileBuffer = Buffer.concat(chunks);
        fileName = part.filename;
      } else {
        // Store field
        fields[part.fieldname] = part.value as string;
      }
    }

    if (!fileBuffer) {
      return reply.status(400).send({
        success: false,
        error: 'Plugin file is required',
      });
    }

    // Validate version format
    const version = fields.version;
    if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid version format (must be semver)',
      });
    }

    // Parse dependencies and permissions
    let dependencies = [];
    let permissions = [];

    try {
      if (fields.dependencies) {
        dependencies = JSON.parse(fields.dependencies);
      }
      if (fields.permissions) {
        permissions = JSON.parse(fields.permissions);
      }
    } catch {
      return reply.status(400).send({
        success: false,
        error: 'Invalid JSON in dependencies or permissions',
      });
    }

    // Calculate checksum
    const crypto = await import('crypto');
    const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

    try {
      const versionInfo = await pluginService.publishVersion(
        decodeURIComponent(id),
        userId,
        {
          version,
          changelog: fields.changelog,
          file: fileBuffer,
          checksum,
          dependencies,
          permissions,
        }
      );

      const response: ApiResponse<typeof versionInfo> = {
        success: true,
        data: versionInfo,
      };

      return reply.status(201).send(response);
    } catch (err) {
      const error = err as Error;
      logger.error('Failed to publish version', error.message);

      const status = error.message.includes('not found') ? 404 :
                     error.message.includes('Not authorized') ? 403 :
                     error.message.includes('already exists') ? 409 :
                     error.message.includes('scan failed') ? 422 : 400;

      return reply.status(status).send({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/plugins/:id/download/:version
   * Download a plugin version (redirect to GitHub Releases)
   */
  fastify.get('/api/plugins/:id/download/:version', async (request: FastifyRequest, reply: FastifyReply) => {
    const { id, version } = request.params as { id: string; version: string };

    try {
      const downloadUrl = await pluginService.getDownloadUrl(
        decodeURIComponent(id),
        version
      );

      if (!downloadUrl) {
        return reply.status(404).send({
          success: false,
          error: 'Version not found',
        });
      }

      // Record download
      const userId = request.user?.userId;
      const ipAddress = request.ip;
      const userAgent = request.headers['user-agent'];

      await pluginService.recordDownload(
        decodeURIComponent(id),
        version,
        userId,
        ipAddress,
        userAgent
      );

      // Redirect to download URL
      return reply.redirect(302, downloadUrl);
    } catch (err) {
      const error = err as Error;
      logger.error('Failed to download plugin', error.message);

      return reply.status(500).send({
        success: false,
        error: 'Download failed',
      });
    }
  });
}
