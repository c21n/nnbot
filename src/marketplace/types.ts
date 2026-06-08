/**
 * Marketplace Type Definitions (v2)
 *
 * Lightweight marketplace using JSON registry + GitHub storage.
 * See specs/marketplace-v2.md for the full specification.
 */

// ============ Registry Types ============

/**
 * Single plugin entry in the registry JSON.
 */
export interface RegistryPluginEntry {
  readonly name: string;
  readonly display_name: string;
  readonly description: string;
  readonly version: string;
  readonly author: string;
  readonly repo: string;
  readonly category?: string;
  readonly tags?: readonly string[];
  readonly download_url?: string;
  readonly logo?: string;
  readonly stars?: number;
  readonly updated_at?: string;
  readonly pinned?: boolean;
  readonly nnbot_version?: string;
}

/**
 * Complete registry JSON structure.
 * Key = plugin ID (e.g. "my-plugin")
 */
export type RegistryData = Record<string, RegistryPluginEntry>;

/**
 * Cached registry file with metadata.
 */
export interface RegistryCacheFile {
  readonly timestamp: string;
  readonly md5: string;
  readonly data: RegistryData;
}

// ============ Installed Plugin ============

/**
 * Installed plugin record (persisted in data/installed-plugins.json)
 */
export interface InstalledPluginRecord {
  readonly pluginId: string;
  readonly name: string;
  readonly version: string;
  readonly repo: string;
  readonly installedAt: string;
  readonly updatedAt: string;
  readonly enabled: boolean;
}

// ============ Result Types ============

export interface InstallResult {
  readonly success: boolean;
  readonly pluginId: string;
  readonly version: string;
  readonly message: string;
  readonly error?: string;
}

export interface UninstallResult {
  readonly success: boolean;
  readonly pluginId: string;
  readonly message: string;
  readonly error?: string;
}

export interface UpdateResult {
  readonly success: boolean;
  readonly pluginId: string;
  readonly oldVersion: string;
  readonly newVersion: string;
  readonly message: string;
  readonly error?: string;
}

export interface UpdateInfo {
  readonly pluginId: string;
  readonly currentVersion: string;
  readonly latestVersion: string;
  readonly updatedAt: string;
}

// ============ Service Interface ============

/**
 * Plugin marketplace service interface.
 * Manages registry loading, plugin install/uninstall/update.
 */
export interface IMarketplaceService {
  getOnlinePlugins(opts?: {
    forceRefresh?: boolean;
    customSource?: string;
  }): Promise<RegistryData>;

  getOnlinePluginDetail(pluginId: string): Promise<RegistryPluginEntry | null>;

  install(pluginId: string, opts?: { proxy?: string }): Promise<InstallResult>;

  uninstall(pluginId: string): Promise<UninstallResult>;

  update(pluginId: string, opts?: { proxy?: string }): Promise<UpdateResult>;

  updateAll(opts?: { proxy?: string }): Promise<UpdateResult[]>;

  checkUpdates(): Promise<UpdateInfo[]>;

  getInstalledPlugins(): Promise<InstalledPluginRecord[]>;

  setEnabled(pluginId: string, enabled: boolean): Promise<void>;
}
