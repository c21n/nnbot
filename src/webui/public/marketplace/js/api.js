/**
 * Marketplace API Client
 *
 * HTTP client for marketplace API calls.
 */

const MarketplaceAPI = {
  /**
   * Market API base URL
   */
  baseUrl: window.MARKETPLACE_API_URL || 'http://localhost:3001',

  /**
   * NNBot API base URL
   */
  nnbotUrl: window.NNBOT_API_URL || '',

  /**
   * Make API request
   */
  async request(url, options = {}) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      return data;
    } catch (err) {
      console.error('API request failed:', err);
      throw err;
    }
  },

  /**
   * Search plugins
   */
  async searchPlugins(query, filters = {}) {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (filters.category) params.set('category', filters.category);
    if (filters.tags) params.set('tags', filters.tags.join(','));
    if (filters.sortBy) params.set('sortBy', filters.sortBy);
    if (filters.page) params.set('page', filters.page.toString());
    if (filters.limit) params.set('limit', filters.limit.toString());

    const response = await this.request(`${this.baseUrl}/api/search?${params.toString()}`);
    return response.data || [];
  },

  /**
   * Get plugin detail
   */
  async getPluginDetail(pluginId) {
    try {
      const response = await this.request(`${this.baseUrl}/api/plugins/${encodeURIComponent(pluginId)}`);
      return response.data || null;
    } catch (err) {
      if (err.message.includes('404')) {
        return null;
      }
      throw err;
    }
  },

  /**
   * Get popular plugins
   */
  async getPopularPlugins(limit = 10) {
    const response = await this.request(`${this.baseUrl}/api/plugins/popular?limit=${limit}`);
    return response.data || [];
  },

  /**
   * Get recommended plugins
   */
  async getRecommendedPlugins(limit = 10) {
    const response = await this.request(`${this.baseUrl}/api/plugins/recommended?limit=${limit}`);
    return response.data || [];
  },

  /**
   * Get plugin versions
   */
  async getVersions(pluginId) {
    const response = await this.request(`${this.baseUrl}/api/plugins/${encodeURIComponent(pluginId)}/versions`);
    return response.data || [];
  },

  /**
   * Install plugin (via NNBot API)
   */
  async installPlugin(pluginId, version) {
    // This would call NNBot's internal API
    // For now, we'll simulate it
    return {
      success: true,
      message: `Plugin ${pluginId} installed successfully`,
    };
  },

  /**
   * Uninstall plugin (via NNBot API)
   */
  async uninstallPlugin(pluginId) {
    // This would call NNBot's internal API
    // For now, we'll simulate it
    return {
      success: true,
      message: `Plugin ${pluginId} uninstalled successfully`,
    };
  },

  /**
   * Update plugin (via NNBot API)
   */
  async updatePlugin(pluginId) {
    // This would call NNBot's internal API
    // For now, we'll simulate it
    return {
      success: true,
      message: `Plugin ${pluginId} updated successfully`,
    };
  },

  /**
   * Get installed plugins (via NNBot API)
   */
  async getInstalledPlugins() {
    // This would call NNBot's internal API
    // For now, we'll return empty array
    return [];
  },
};

// Export for use in other scripts
window.MarketplaceAPI = MarketplaceAPI;
