/**
 * Marketplace Client
 *
 * HTTP client for the plugin marketplace API.
 */

import axios, { AxiosError } from 'axios';
import type {
  IMarketplaceClient,
  PluginMetadata,
  PluginDetail,
  PluginVersionInfo,
  PluginFilters,
  ApiResponse,
} from './types.js';
import { getMarketplaceConfig } from './config.js';
import { createLogger } from '../core/logger.js';

const logger = createLogger('MarketplaceClient');

/**
 * Marketplace client implementation
 */
export class MarketplaceClient implements IMarketplaceClient {
  private config = getMarketplaceConfig();
  private baseUrl: string;

  constructor() {
    this.baseUrl = this.config.apiUrl;
  }

  /**
   * Search plugins
   */
  async searchPlugins(query: string, filters?: PluginFilters): Promise<PluginMetadata[]> {
    try {
      const params = new URLSearchParams();

      if (query) {
        params.set('q', query);
      }

      if (filters?.category) {
        params.set('category', filters.category);
      }

      if (filters?.tags) {
        params.set('tags', filters.tags.join(','));
      }

      if (filters?.minRating) {
        params.set('minRating', filters.minRating.toString());
      }

      if (filters?.sortBy) {
        params.set('sortBy', filters.sortBy);
      }

      if (filters?.sortOrder) {
        params.set('sortOrder', filters.sortOrder);
      }

      if (filters?.page) {
        params.set('page', filters.page.toString());
      }

      if (filters?.limit) {
        params.set('limit', filters.limit.toString());
      }

      const response = await axios.get<ApiResponse<PluginMetadata[]>>(
        `${this.baseUrl}/api/search?${params.toString()}`
      );

      if (!response.data.success) {
        throw new Error(response.data.error || 'Search failed');
      }

      return response.data.data || [];
    } catch (err) {
      const error = err as AxiosError;
      logger.error('Failed to search plugins', error.message);
      throw new Error('Failed to search plugins');
    }
  }

  /**
   * Get plugin detail
   */
  async getPluginDetail(pluginId: string): Promise<PluginDetail | null> {
    try {
      const response = await axios.get<ApiResponse<PluginDetail>>(
        `${this.baseUrl}/api/plugins/${encodeURIComponent(pluginId)}`
      );

      if (!response.data.success) {
        return null;
      }

      return response.data.data || null;
    } catch (err) {
      const error = err as AxiosError;
      if (error.response?.status === 404) {
        return null;
      }
      logger.error('Failed to get plugin detail', error.message);
      throw new Error('Failed to get plugin detail');
    }
  }

  /**
   * Get popular plugins
   */
  async getPopularPlugins(limit?: number): Promise<PluginMetadata[]> {
    try {
      const params = new URLSearchParams();
      if (limit) {
        params.set('limit', limit.toString());
      }

      const response = await axios.get<ApiResponse<PluginMetadata[]>>(
        `${this.baseUrl}/api/plugins/popular?${params.toString()}`
      );

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to get popular plugins');
      }

      return response.data.data || [];
    } catch (err) {
      const error = err as AxiosError;
      logger.error('Failed to get popular plugins', error.message);
      throw new Error('Failed to get popular plugins');
    }
  }

  /**
   * Get recommended plugins
   */
  async getRecommendedPlugins(limit?: number): Promise<PluginMetadata[]> {
    try {
      const params = new URLSearchParams();
      if (limit) {
        params.set('limit', limit.toString());
      }

      const response = await axios.get<ApiResponse<PluginMetadata[]>>(
        `${this.baseUrl}/api/plugins/recommended?${params.toString()}`
      );

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to get recommended plugins');
      }

      return response.data.data || [];
    } catch (err) {
      const error = err as AxiosError;
      logger.error('Failed to get recommended plugins', error.message);
      throw new Error('Failed to get recommended plugins');
    }
  }

  /**
   * Get version list
   */
  async getVersions(pluginId: string): Promise<PluginVersionInfo[]> {
    try {
      const response = await axios.get<ApiResponse<PluginVersionInfo[]>>(
        `${this.baseUrl}/api/plugins/${encodeURIComponent(pluginId)}/versions`
      );

      if (!response.data.success) {
        throw new Error(response.data.error || 'Failed to get versions');
      }

      return response.data.data || [];
    } catch (err) {
      const error = err as AxiosError;
      logger.error('Failed to get versions', error.message);
      throw new Error('Failed to get versions');
    }
  }

  /**
   * Download plugin file
   */
  async downloadPlugin(pluginId: string, version: string): Promise<Buffer> {
    const maxRetries = this.config.maxRetries;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Get download URL
        const versions = await this.getVersions(pluginId);
        const versionInfo = versions.find(v => v.version === version);

        if (!versionInfo) {
          throw new Error(`Version ${version} not found`);
        }

        // Download file
        const response = await axios.get<Buffer>(versionInfo.downloadUrl, {
          responseType: 'arraybuffer',
          timeout: 60000, // 60 seconds
        });

        return Buffer.from(response.data);
      } catch (err) {
        lastError = err as Error;
        logger.warn(`Download attempt ${attempt} failed: ${lastError.message}`);

        if (attempt < maxRetries) {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    throw lastError || new Error('Download failed after max retries');
  }
}

/**
 * Singleton marketplace client instance
 */
let clientInstance: MarketplaceClient | null = null;

/**
 * Get marketplace client instance
 */
export function getMarketplaceClient(): MarketplaceClient {
  if (!clientInstance) {
    clientInstance = new MarketplaceClient();
  }
  return clientInstance;
}
