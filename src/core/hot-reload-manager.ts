/**
 * Hot Reload Manager
 *
 * Watches plugin directory for file changes and triggers reload.
 * Implements debouncing to handle rapid file modifications.
 */

import { watch, type FSWatcher } from "fs";
import { stat } from "fs/promises";
import { extname, basename, join } from "path";
import type {
  IPluginManager,
  IPluginLoader,
  PluginServices,
  IHotReloadManager,
} from "../interfaces.js";
import { logger } from "./logger.js";

/**
 * Manages file watching and plugin hot-reloading
 */
export class HotReloadManager implements IHotReloadManager {
  private watcher: FSWatcher | null = null;
  private debounceMap: Map<string, NodeJS.Timeout> = new Map();
  private readonly DEBOUNCE_MS = 500;

  constructor(
    private pluginManager: IPluginManager,
    private loader: IPluginLoader,
    private services: PluginServices
  ) {}

  /**
   * Start watching directory for plugin file changes
   *
   * @param dir - Absolute path to plugins directory
   * @throws Error if directory doesn't exist
   */
  async startWatching(dir: string): Promise<void> {
    // Don't start if already watching
    if (this.watcher) {
      return;
    }

    // Verify directory exists
    const dirStat = await stat(dir);
    if (!dirStat.isDirectory()) {
      throw new Error(`${dir} is not a directory`);
    }

    this.dir = dir;

    // Start watching
    this.watcher = watch(dir, (eventType, filename) => {
      if (filename) {
        this.handleFileChange(filename, eventType);
      }
    });

    logger.info(`[HotReload] Watching ${dir} for changes`);
  }

  /**
   * Stop watching for file changes
   */
  stopWatching(): void {
    // Clear all pending debounced reloads
    for (const timeout of this.debounceMap.values()) {
      clearTimeout(timeout);
    }
    this.debounceMap.clear();

    // Close watcher
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      logger.info("[HotReload] Stopped watching");
    }
  }

  /**
   * Check if currently watching
   */
  isWatching(): boolean {
    return this.watcher !== null;
  }

  /**
   * Handle a file change event with debouncing
   */
  private handleFileChange(filename: string, eventType: string): void {
    const ext = extname(filename);

    // Only process .ts and .js files
    if (ext !== ".ts" && ext !== ".js") {
      return;
    }

    // Clear existing timeout for this file
    const existing = this.debounceMap.get(filename);
    if (existing) {
      clearTimeout(existing);
    }

    // Set new timeout
    const timeout = setTimeout(() => {
      this.debounceMap.delete(filename);
      this.processFileChange(filename, eventType);
    }, this.DEBOUNCE_MS);

    this.debounceMap.set(filename, timeout);
  }

  /**
   * Process a debounced file change
   */
  private async processFileChange(
    filename: string,
    _eventType: string
  ): Promise<void> {
    const filePath = join(this.dir, filename);
    const pluginName = basename(filename, extname(filename));

    try {
      // Check if file still exists (might be deleted)
      let fileExists = true;
      try {
        await stat(filePath);
      } catch {
        fileExists = false;
      }

      if (!fileExists) {
        // File deleted - unload plugin
        await this.handlePluginRemoved(pluginName);
      } else {
        // File changed/added - reload or load plugin
        await this.handlePluginUpdated(filePath, pluginName);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        `[HotReload] Failed to process ${filename}: ${message}`
      );
    }
  }

  /**
   * Handle a plugin file being updated
   */
  private async handlePluginUpdated(
    filePath: string,
    pluginName: string
  ): Promise<void> {
    const existingPlugin = this.pluginManager.getPlugin(pluginName);

    if (existingPlugin) {
      // Reload existing plugin
      logger.info(`[HotReload] Reloading plugin "${pluginName}"`);

      try {
        await this.pluginManager.unregister(existingPlugin);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn(
          `[HotReload] Failed to unload "${pluginName}": ${message}`
        );
      }

      // Load new version
      const newPlugin = await this.loader.loadPlugin(filePath, this.services);
      if (newPlugin) {
        await this.pluginManager.register(newPlugin);
        logger.info(`[HotReload] Plugin "${pluginName}" reloaded successfully`);
      } else {
        logger.warn(
          `[HotReload] Failed to load new version of "${pluginName}"`
        );
      }
    } else {
      // New plugin - load it
      logger.info(`[HotReload] Loading new plugin "${pluginName}"`);
      const plugin = await this.loader.loadPlugin(filePath, this.services);
      if (plugin) {
        await this.pluginManager.register(plugin);
        logger.info(`[HotReload] Plugin "${pluginName}" loaded successfully`);
      }
    }
  }

  /**
   * Handle a plugin file being removed
   */
  private async handlePluginRemoved(pluginName: string): Promise<void> {
    const plugin = this.pluginManager.getPlugin(pluginName);

    if (plugin) {
      logger.info(`[HotReload] Unloading plugin "${pluginName}" (file removed)`);
      try {
        await this.pluginManager.unregister(plugin);
        logger.info(`[HotReload] Plugin "${pluginName}" unloaded`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(
          `[HotReload] Failed to unload "${pluginName}": ${message}`
        );
      }
    }
  }

  // Internal state
  private dir: string = "";
}
