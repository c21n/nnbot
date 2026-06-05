/**
 * Plugin Service
 *
 * Core business logic for plugin management.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  IPluginService,
  PluginMetadata,
  PluginDetail,
  PluginVersionInfo,
  CreatePluginRequest,
  UpdatePluginRequest,
  PublishVersionRequest,
  PluginFilters,
} from '../types/index.js';
import { query, getClient } from '../db/connection.js';
import { getScannerService } from './scanner-service.js';
import { getGitHubService } from './github-service.js';
import { getConfig } from '../config.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('PluginService');

/**
 * Plugin service implementation
 */
export class PluginService implements IPluginService {
  private config = getConfig();

  /**
   * Search plugins
   */
  async searchPlugins(queryStr: string, filters?: PluginFilters): Promise<PluginMetadata[]> {
    const page = filters?.page || 1;
    const limit = Math.min(filters?.limit || 20, 100);
    const offset = (page - 1) * limit;

    let sql = `
      SELECT
        p.plugin_id as id,
        p.name,
        p.display_name as "displayName",
        p.description,
        p.latest_version as version,
        u.username as author,
        p.category,
        p.tags,
        p.downloads,
        p.rating,
        p.rating_count as "ratingCount",
        p.updated_at as "updatedAt",
        p.icon,
        p.homepage
      FROM plugins p
      JOIN users u ON p.author_id = u.id
      WHERE 1=1
    `;
    const params: unknown[] = [];
    let paramIndex = 1;

    // Full-text search
    if (queryStr) {
      sql += ` AND to_tsvector('english', p.name || ' ' || p.display_name || ' ' || COALESCE(p.description, '')) @@ plainto_tsquery('english', $${paramIndex})`;
      params.push(queryStr);
      paramIndex++;
    }

    // Category filter
    if (filters?.category) {
      sql += ` AND p.category = $${paramIndex}`;
      params.push(filters.category);
      paramIndex++;
    }

    // Tags filter
    if (filters?.tags && filters.tags.length > 0) {
      sql += ` AND p.tags && $${paramIndex}`;
      params.push(filters.tags);
      paramIndex++;
    }

    // Rating filter
    if (filters?.minRating) {
      sql += ` AND p.rating >= $${paramIndex}`;
      params.push(filters.minRating);
      paramIndex++;
    }

    // Sorting
    const sortBy = filters?.sortBy || 'downloads';
    const sortOrder = filters?.sortOrder || 'desc';
    const sortField = {
      downloads: 'p.downloads',
      rating: 'p.rating',
      updated: 'p.updated_at',
      created: 'p.created_at',
    }[sortBy] || 'p.downloads';

    sql += ` ORDER BY ${sortField} ${sortOrder === 'asc' ? 'ASC' : 'DESC'}`;
    sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await query<PluginMetadata>(sql, params);
    return result.rows;
  }

  /**
   * Get plugin detail
   */
  async getPluginDetail(pluginId: string): Promise<PluginDetail | null> {
    const sql = `
      SELECT
        p.plugin_id as id,
        p.name,
        p.display_name as "displayName",
        p.description,
        p.latest_version as version,
        u.username as author,
        p.category,
        p.tags,
        p.downloads,
        p.rating,
        p.rating_count as "ratingCount",
        p.updated_at as "updatedAt",
        p.icon,
        p.homepage,
        p.license,
        p.repository
      FROM plugins p
      JOIN users u ON p.author_id = u.id
      WHERE p.plugin_id = $1
    `;

    const result = await query<PluginMetadata & { license: string | null }>(sql, [pluginId]);

    if (result.rows.length === 0) {
      return null;
    }

    const plugin = result.rows[0];

    // Get versions
    const versions = await this.getVersions(pluginId);

    // Get latest version details
    const latestVersion = versions[0];

    return {
      ...plugin,
      readme: '', // TODO: Fetch from GitHub
      changelog: latestVersion?.changelog || '',
      versions,
      dependencies: [], // TODO: Parse from latest version
      permissions: [], // TODO: Parse from latest version
      license: plugin.license || 'MIT',
    };
  }

  /**
   * Create plugin
   */
  async createPlugin(authorId: number, data: CreatePluginRequest): Promise<PluginMetadata> {
    // Generate plugin_id
    const userResult = await query<{ username: string }>(
      'SELECT username FROM users WHERE id = $1',
      [authorId]
    );

    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }

    const username = userResult.rows[0].username;
    const pluginId = `${username}/${data.name}`;

    // Check if plugin already exists
    const existing = await query(
      'SELECT id FROM plugins WHERE plugin_id = $1',
      [pluginId]
    );

    if (existing.rows.length > 0) {
      throw new Error('Plugin already exists');
    }

    // Insert plugin
    const sql = `
      INSERT INTO plugins (
        plugin_id, name, display_name, description, category,
        tags, author_id, license, homepage, repository, icon
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING
        plugin_id as id,
        name,
        display_name as "displayName",
        description,
        latest_version as version,
        category,
        tags,
        downloads,
        rating,
        rating_count as "ratingCount",
        created_at as "updatedAt",
        icon,
        homepage
    `;

    const result = await query<PluginMetadata>(sql, [
      pluginId,
      data.name,
      data.displayName,
      data.description || null,
      data.category || null,
      data.tags || [],
      authorId,
      data.license || null,
      data.homepage || null,
      data.repository || null,
      data.icon || null,
    ]);

    logger.info(`Plugin created: ${pluginId}`);
    return result.rows[0];
  }

  /**
   * Update plugin
   */
  async updatePlugin(pluginId: string, userId: number, data: UpdatePluginRequest): Promise<PluginMetadata> {
    // Check ownership
    const plugin = await query<{ author_id: number }>(
      'SELECT author_id FROM plugins WHERE plugin_id = $1',
      [pluginId]
    );

    if (plugin.rows.length === 0) {
      throw new Error('Plugin not found');
    }

    if (plugin.rows[0].author_id !== userId) {
      throw new Error('Not authorized to update this plugin');
    }

    // Build update query
    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (data.displayName !== undefined) {
      updates.push(`display_name = $${paramIndex}`);
      params.push(data.displayName);
      paramIndex++;
    }

    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      params.push(data.description);
      paramIndex++;
    }

    if (data.category !== undefined) {
      updates.push(`category = $${paramIndex}`);
      params.push(data.category);
      paramIndex++;
    }

    if (data.tags !== undefined) {
      updates.push(`tags = $${paramIndex}`);
      params.push(data.tags);
      paramIndex++;
    }

    if (data.license !== undefined) {
      updates.push(`license = $${paramIndex}`);
      params.push(data.license);
      paramIndex++;
    }

    if (data.homepage !== undefined) {
      updates.push(`homepage = $${paramIndex}`);
      params.push(data.homepage);
      paramIndex++;
    }

    if (data.repository !== undefined) {
      updates.push(`repository = $${paramIndex}`);
      params.push(data.repository);
      paramIndex++;
    }

    if (data.icon !== undefined) {
      updates.push(`icon = $${paramIndex}`);
      params.push(data.icon);
      paramIndex++;
    }

    if (updates.length === 0) {
      throw new Error('No fields to update');
    }

    params.push(pluginId);

    const sql = `
      UPDATE plugins
      SET ${updates.join(', ')}
      WHERE plugin_id = $${paramIndex}
      RETURNING
        plugin_id as id,
        name,
        display_name as "displayName",
        description,
        latest_version as version,
        category,
        tags,
        downloads,
        rating,
        rating_count as "ratingCount",
        updated_at as "updatedAt",
        icon,
        homepage
    `;

    const result = await query<PluginMetadata>(sql, params);
    logger.info(`Plugin updated: ${pluginId}`);
    return result.rows[0];
  }

  /**
   * Delete plugin
   */
  async deletePlugin(pluginId: string, userId: number): Promise<void> {
    // Check ownership
    const plugin = await query<{ author_id: number }>(
      'SELECT author_id FROM plugins WHERE plugin_id = $1',
      [pluginId]
    );

    if (plugin.rows.length === 0) {
      throw new Error('Plugin not found');
    }

    if (plugin.rows[0].author_id !== userId) {
      throw new Error('Not authorized to delete this plugin');
    }

    await query('DELETE FROM plugins WHERE plugin_id = $1', [pluginId]);
    logger.info(`Plugin deleted: ${pluginId}`);
  }

  /**
   * Publish version
   */
  async publishVersion(
    pluginId: string,
    userId: number,
    data: PublishVersionRequest
  ): Promise<PluginVersionInfo> {
    // Check ownership
    const plugin = await query<{ id: number; author_id: number; name: string }>(
      'SELECT id, author_id, name FROM plugins WHERE plugin_id = $1',
      [pluginId]
    );

    if (plugin.rows.length === 0) {
      throw new Error('Plugin not found');
    }

    if (plugin.rows[0].author_id !== userId) {
      throw new Error('Not authorized to publish to this plugin');
    }

    // Check if version already exists
    const existing = await query(
      'SELECT id FROM plugin_versions WHERE plugin_id = $1 AND version = $2',
      [plugin.rows[0].id, data.version]
    );

    if (existing.rows.length > 0) {
      throw new Error('Version already exists');
    }

    // Scan plugin file
    const scanner = getScannerService();
    const content = data.file.toString('utf-8');
    const scanResult = await scanner.scanPlugin(content);

    if (!scanResult.passed) {
      throw new Error(`Plugin scan failed: ${scanResult.errors.map(e => e.message).join(', ')}`);
    }

    // Create GitHub release
    const github = getGitHubService();
    const owner = this.config.github.pluginRepoOwner;
    const repo = this.config.github.pluginRepoName;
    const tag = `${pluginId}@${data.version}`;
    const fileName = `${plugin.rows[0].name}-${data.version}.js`;

    const release = await github.createRelease(
      owner,
      repo,
      tag,
      `${plugin.rows[0].name} v${data.version}`,
      data.changelog || '',
      data.file,
      fileName
    );

    // Insert version
    const sql = `
      INSERT INTO plugin_versions (
        plugin_id, version, changelog, file_url, checksum, dependencies, permissions
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING
        version,
        created_at as "releasedAt",
        changelog,
        file_url as "downloadUrl",
        checksum
    `;

    const result = await query<PluginVersionInfo>(sql, [
      plugin.rows[0].id,
      data.version,
      data.changelog || null,
      release.downloadUrl,
      data.checksum,
      data.dependencies || [],
      data.permissions || [],
    ]);

    // Update latest version
    await query(
      'UPDATE plugins SET latest_version = $1 WHERE id = $2',
      [data.version, plugin.rows[0].id]
    );

    logger.info(`Version published: ${pluginId}@${data.version}`);
    return result.rows[0];
  }

  /**
   * Get versions
   */
  async getVersions(pluginId: string): Promise<PluginVersionInfo[]> {
    const sql = `
      SELECT
        pv.version,
        pv.created_at as "releasedAt",
        pv.changelog,
        pv.file_url as "downloadUrl",
        pv.checksum
      FROM plugin_versions pv
      JOIN plugins p ON pv.plugin_id = p.id
      WHERE p.plugin_id = $1
      ORDER BY pv.created_at DESC
    `;

    const result = await query<PluginVersionInfo>(sql, [pluginId]);
    return result.rows;
  }

  /**
   * Get download URL
   */
  async getDownloadUrl(pluginId: string, version: string): Promise<string | null> {
    const sql = `
      SELECT pv.file_url
      FROM plugin_versions pv
      JOIN plugins p ON pv.plugin_id = p.id
      WHERE p.plugin_id = $1 AND pv.version = $2
    `;

    const result = await query<{ file_url: string | null }>(sql, [pluginId, version]);
    return result.rows[0]?.file_url || null;
  }

  /**
   * Record download
   */
  async recordDownload(
    pluginId: string,
    version: string,
    userId?: number,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    const client = await getClient();

    try {
      await client.query('BEGIN');

      // Get plugin ID
      const pluginResult = await client.query(
        'SELECT id FROM plugins WHERE plugin_id = $1',
        [pluginId]
      );

      if (pluginResult.rows.length === 0) {
        throw new Error('Plugin not found');
      }

      const pluginDbId = pluginResult.rows[0].id;

      // Record download
      await client.query(
        'INSERT INTO downloads (plugin_id, version, user_id, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5)',
        [pluginDbId, version, userId || null, ipAddress || null, userAgent || null]
      );

      // Increment download count
      await client.query(
        'UPDATE plugins SET downloads = downloads + 1 WHERE id = $1',
        [pluginDbId]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Get popular plugins
   */
  async getPopularPlugins(limit: number = 10): Promise<PluginMetadata[]> {
    const sql = `
      SELECT
        p.plugin_id as id,
        p.name,
        p.display_name as "displayName",
        p.description,
        p.latest_version as version,
        u.username as author,
        p.category,
        p.tags,
        p.downloads,
        p.rating,
        p.rating_count as "ratingCount",
        p.updated_at as "updatedAt",
        p.icon,
        p.homepage
      FROM plugins p
      JOIN users u ON p.author_id = u.id
      ORDER BY p.downloads DESC
      LIMIT $1
    `;

    const result = await query<PluginMetadata>(sql, [limit]);
    return result.rows;
  }

  /**
   * Get recommended plugins
   */
  async getRecommendedPlugins(limit: number = 10): Promise<PluginMetadata[]> {
    const sql = `
      SELECT
        p.plugin_id as id,
        p.name,
        p.display_name as "displayName",
        p.description,
        p.latest_version as version,
        u.username as author,
        p.category,
        p.tags,
        p.downloads,
        p.rating,
        p.rating_count as "ratingCount",
        p.updated_at as "updatedAt",
        p.icon,
        p.homepage
      FROM plugins p
      JOIN users u ON p.author_id = u.id
      WHERE p.rating >= 4.0 AND p.rating_count >= 5
      ORDER BY p.rating DESC, p.downloads DESC
      LIMIT $1
    `;

    const result = await query<PluginMetadata>(sql, [limit]);
    return result.rows;
  }
}

/**
 * Singleton plugin service instance
 */
let pluginInstance: PluginService | null = null;

/**
 * Get plugin service instance
 */
export function getPluginService(): PluginService {
  if (!pluginInstance) {
    pluginInstance = new PluginService();
  }
  return pluginInstance;
}
