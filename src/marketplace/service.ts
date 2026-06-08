/**
 * Marketplace Service (v2)
 *
 * Main service that assembles RegistryManager + PluginInstaller.
 * Implements the IMarketplaceService interface.
 */

import { join } from "path";
import type {
  IMarketplaceService,
  RegistryData,
  RegistryPluginEntry,
  InstallResult,
  UninstallResult,
  UpdateResult,
  UpdateInfo,
  InstalledPluginRecord,
} from "./types.js";
import { RegistryManager } from "./registry.js";
import { PluginInstaller } from "./installer.js";
import { logger } from "../core/logger.js";

/**
 * Simple per-key mutex to prevent concurrent operations on the same plugin.
 */
class KeyMutex {
  private locks = new Map<string, Promise<void>>();

  async acquire(key: string): Promise<() => void> {
    while (this.locks.has(key)) {
      await this.locks.get(key);
    }

    let release!: () => void;
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(key, promise);

    return () => {
      this.locks.delete(key);
      release();
    };
  }
}

const BATCH_CONCURRENCY = 3;

export interface MarketplaceServiceOptions {
  readonly rootDir: string;
  readonly registryUrls?: readonly string[];
  readonly md5Urls?: readonly string[];
}

/**
 * Marketplace service — single entry point for all marketplace operations.
 */
export class MarketplaceService implements IMarketplaceService {
  private readonly registry: RegistryManager;
  private readonly installer: PluginInstaller;
  private readonly mutex = new KeyMutex();
  private cachedRegistry: RegistryData | null = null;
  private loadingPromise: Promise<RegistryData> | null = null;

  constructor(opts: MarketplaceServiceOptions) {
    const dataDir = join(opts.rootDir, "data");
    const pluginsDir = join(opts.rootDir, "plugins");

    this.registry = new RegistryManager({
      registryUrls: opts.registryUrls,
      md5Urls: opts.md5Urls,
      cacheFile: join(dataDir, "marketplace-cache.json"),
    });

    this.installer = new PluginInstaller({
      pluginsDir,
      dataFile: join(dataDir, "installed-plugins.json"),
    });
  }

  async getOnlinePlugins(
    opts?: { forceRefresh?: boolean; customSource?: string }
  ): Promise<RegistryData> {
    if (opts?.customSource) {
      const tempRegistry = new RegistryManager({
        registryUrls: [opts.customSource],
        md5Urls: [],
        cacheFile: join("data", `marketplace-custom-${Date.now()}.json`),
      });
      return tempRegistry.load(true);
    }

    if (!opts?.forceRefresh && this.cachedRegistry) {
      return this.cachedRegistry;
    }

    // Deduplicate concurrent requests — reuse in-flight promise
    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.loadingPromise = this.registry
      .load(opts?.forceRefresh)
      .then((data) => {
        this.cachedRegistry = data;
        return data;
      })
      .finally(() => {
        this.loadingPromise = null;
      });

    return this.loadingPromise;
  }

  async getOnlinePluginDetail(pluginId: string): Promise<RegistryPluginEntry | null> {
    const data = await this.getOnlinePlugins();
    return data[pluginId] ?? null;
  }

  async install(pluginId: string, opts?: { proxy?: string }): Promise<InstallResult> {
    const release = await this.mutex.acquire(pluginId);
    try {
      const entry = await this.getOnlinePluginDetail(pluginId);
      if (!entry) {
        return {
          success: false,
          pluginId,
          version: "",
          message: "Plugin not found",
          error: `Plugin "${pluginId}" not found in registry`,
        };
      }
      return await this.installer.install(pluginId, entry, opts);
    } finally {
      release();
    }
  }

  async uninstall(pluginId: string): Promise<UninstallResult> {
    const release = await this.mutex.acquire(pluginId);
    try {
      return await this.installer.uninstall(pluginId);
    } finally {
      release();
    }
  }

  async update(pluginId: string, opts?: { proxy?: string }): Promise<UpdateResult> {
    const release = await this.mutex.acquire(pluginId);
    try {
      const entry = await this.getOnlinePluginDetail(pluginId);
      if (!entry) {
        return {
          success: false,
          pluginId,
          oldVersion: "",
          newVersion: "",
          message: "Plugin not found in registry",
          error: `Plugin "${pluginId}" not found in registry`,
        };
      }
      return await this.installer.update(pluginId, entry, opts);
    } finally {
      release();
    }
  }

  async updateAll(opts?: { proxy?: string }): Promise<UpdateResult[]> {
    const registry = await this.getOnlinePlugins();
    const updates = await this.installer.checkUpdates(registry);

    if (updates.length === 0) {
      return [];
    }

    logger.info(`[Marketplace] Updating ${updates.length} plugins...`);

    const results: UpdateResult[] = [];
    for (let i = 0; i < updates.length; i += BATCH_CONCURRENCY) {
      const batch = updates.slice(i, i + BATCH_CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map((u) => this.update(u.pluginId, opts))
      );
      results.push(...batchResults);
    }

    const successCount = results.filter((r) => r.success).length;
    logger.info(
      `[Marketplace] Batch update: ${successCount}/${results.length} succeeded`
    );

    return results;
  }

  async checkUpdates(): Promise<UpdateInfo[]> {
    const registry = await this.getOnlinePlugins();
    return this.installer.checkUpdates(registry);
  }

  async getInstalledPlugins(): Promise<InstalledPluginRecord[]> {
    return this.installer.getInstalledPlugins();
  }

  async setEnabled(pluginId: string, enabled: boolean): Promise<void> {
    await this.installer.setEnabled(pluginId, enabled);
  }
}
