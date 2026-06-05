/**
 * Marketplace Client Type Definitions
 *
 * Types for the NNBot marketplace client.
 */

// ============ Plugin Metadata ============

/**
 * Plugin metadata from market API
 */
export interface PluginMetadata {
  readonly id: string;
  readonly name: string;
  readonly displayName: string;
  readonly description: string;
  readonly version: string;
  readonly author: string;
  readonly category: string;
  readonly tags: readonly string[];
  readonly downloads: number;
  readonly rating: number;
  readonly ratingCount: number;
  readonly updatedAt: string;
  readonly icon?: string;
  readonly homepage?: string;
}

/**
 * Plugin detail from market API
 */
export interface PluginDetail extends PluginMetadata {
  readonly readme: string;
  readonly changelog: string;
  readonly versions: readonly PluginVersionInfo[];
  readonly dependencies: readonly PluginDependency[];
  readonly permissions: readonly PluginPermission[];
  readonly license: string;
  readonly repository?: string;
}

/**
 * Plugin version info
 */
export interface PluginVersionInfo {
  readonly version: string;
  readonly releasedAt: string;
  readonly changelog: string;
  readonly downloadUrl: string;
  readonly checksum: string;
}

/**
 * Plugin dependency
 */
export interface PluginDependency {
  readonly pluginId: string;
  readonly versionRange: string;
  readonly optional: boolean;
}

/**
 * Plugin permission
 */
export interface PluginPermission {
  readonly name: string;
  readonly description: string;
  readonly required: boolean;
}

// ============ Search & Filter ============

/**
 * Plugin filters for search
 */
export interface PluginFilters {
  readonly category?: string;
  readonly tags?: readonly string[];
  readonly minRating?: number;
  readonly sortBy?: 'downloads' | 'rating' | 'updated' | 'created';
  readonly sortOrder?: 'asc' | 'desc';
  readonly page?: number;
  readonly limit?: number;
}

// ============ Install/Uninstall Results ============

/**
 * Install result
 */
export interface InstallResult {
  readonly success: boolean;
  readonly pluginId: string;
  readonly version: string;
  readonly message: string;
  readonly error?: string;
}

/**
 * Uninstall result
 */
export interface UninstallResult {
  readonly success: boolean;
  readonly pluginId: string;
  readonly message: string;
  readonly error?: string;
}

/**
 * Update result
 */
export interface UpdateResult {
  readonly success: boolean;
  readonly pluginId: string;
  readonly oldVersion: string;
  readonly newVersion: string;
  readonly message: string;
  readonly error?: string;
}

/**
 * Update info
 */
export interface UpdateInfo {
  readonly pluginId: string;
  readonly currentVersion: string;
  readonly latestVersion: string;
  readonly changelog: string;
  readonly updatedAt: string;
}

// ============ Installed Plugin ============

/**
 * Installed plugin info (local storage)
 */
export interface InstalledPlugin {
  readonly pluginId: string;
  readonly name: string;
  readonly version: string;
  readonly installedAt: string;
  readonly updatedAt: string;
  readonly enabled: boolean;
  readonly hasUpdate: boolean;
  readonly latestVersion?: string;
}

// ============ API Response ============

/**
 * API response wrapper
 */
export interface ApiResponse<T> {
  readonly success: boolean;
  readonly data?: T;
  readonly error?: string;
  readonly meta?: {
    readonly total: number;
    readonly page: number;
    readonly limit: number;
  };
}

// ============ Interfaces ============

/**
 * Marketplace client interface
 */
export interface IMarketplaceClient {
  /**
   * Search plugins
   */
  searchPlugins(query: string, filters?: PluginFilters): Promise<PluginMetadata[]>;

  /**
   * Get plugin detail
   */
  getPluginDetail(pluginId: string): Promise<PluginDetail | null>;

  /**
   * Get popular plugins
   */
  getPopularPlugins(limit?: number): Promise<PluginMetadata[]>;

  /**
   * Get recommended plugins
   */
  getRecommendedPlugins(limit?: number): Promise<PluginMetadata[]>;

  /**
   * Get version list
   */
  getVersions(pluginId: string): Promise<PluginVersionInfo[]>;

  /**
   * Download plugin file
   */
  downloadPlugin(pluginId: string, version: string): Promise<Buffer>;
}

/**
 * Plugin installer interface
 */
export interface IPluginInstaller {
  /**
   * Install plugin
   */
  install(pluginId: string, version?: string): Promise<InstallResult>;

  /**
   * Uninstall plugin
   */
  uninstall(pluginId: string): Promise<UninstallResult>;

  /**
   * Get installed plugins
   */
  getInstalledPlugins(): Promise<InstalledPlugin[]>;

  /**
   * Check if plugin is installed
   */
  isInstalled(pluginId: string): Promise<boolean>;
}

/**
 * Plugin updater interface
 */
export interface IPluginUpdater {
  /**
   * Check updates for all installed plugins
   */
  checkUpdates(): Promise<UpdateInfo[]>;

  /**
   * Update single plugin
   */
  update(pluginId: string): Promise<UpdateResult>;

  /**
   * Update all plugins
   */
  updateAll(): Promise<UpdateResult[]>;
}

/**
 * Marketplace configuration
 */
export interface MarketplaceConfig {
  /** Market API base URL */
  readonly apiUrl: string;
  /** Plugins directory path */
  readonly pluginsDir: string;
  /** Installed plugins data file path */
  readonly dataFile: string;
  /** Auto-check updates interval (ms) */
  readonly autoCheckInterval: number;
  /** Max retry count for downloads */
  readonly maxRetries: number;
}
