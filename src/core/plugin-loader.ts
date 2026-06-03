/**
 * Plugin Loader
 *
 * Handles directory scanning and dynamic plugin import.
 * Filters files, validates plugins, and sorts by priority.
 */

import { readdir, stat, mkdir } from "fs/promises";
import { join, extname, basename } from "path";
import type {
  IPlugin,
  PluginServices,
  IPluginLoader,
} from "../interfaces.js";
import { PLUGIN_PRIORITY } from "../constants.js";
import { logger } from "./logger.js";

/**
 * Plugin loader implementation
 * Scans directories and dynamically imports plugin files
 */
export class PluginLoader implements IPluginLoader {
  /**
   * Load all plugins from a directory
   *
   * @param dir - Absolute path to plugins directory
   * @param services - Services to inject into plugins
   * @returns Array of loaded plugins (sorted by priority)
   */
  async loadFromDir(
    dir: string,
    services: PluginServices
  ): Promise<IPlugin[]> {
    // Ensure directory exists
    await this.ensureDir(dir);

    // Read directory contents
    const files = await readdir(dir);

    // Filter valid plugin files
    const pluginFiles = files.filter((file) => this.isValidPluginFile(file));

    // Load each plugin
    const plugins: IPlugin[] = [];
    for (const file of pluginFiles) {
      const filePath = join(dir, file);
      const plugin = await this.loadPlugin(filePath, services);
      if (plugin) {
        plugins.push(plugin);
      }
    }

    // Sort by priority, then by name
    plugins.sort((a, b) => this.comparePlugins(a, b));

    return plugins;
  }

  /**
   * Load a single plugin file
   *
   * @param filePath - Absolute path to plugin file
   * @param services - Services to inject
   * @returns Loaded plugin or null if failed
   */
  async loadPlugin(
    filePath: string,
    services: PluginServices
  ): Promise<IPlugin | null> {
    try {
      // Dynamic import
      const mod = await import(filePath);

      // Check for default export
      if (!mod.default) {
        logger.warn(`[PluginLoader] No default export in ${filePath}`);
        return null;
      }

      const plugin = mod.default;

      // Validate plugin structure
      if (!this.isValidPlugin(plugin)) {
        logger.warn(`[PluginLoader] Invalid plugin in ${filePath}`);
        return null;
      }

      // Set services (internal method from createPlugin)
      if (typeof plugin.setServices === "function") {
        plugin.setServices(services);
      }

      // Call onLoad
      await plugin.onLoad();

      return plugin;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`[PluginLoader] Failed to load ${filePath}: ${message}`);
      return null;
    }
  }

  /**
   * Check if a filename is a valid plugin file
   * Only .ts and .js files, excluding __tests__, index, and _ prefixed
   */
  private isValidPluginFile(file: string): boolean {
    const ext = extname(file);
    const name = basename(file, ext);

    // Only .ts and .js files
    if (ext !== ".ts" && ext !== ".js") {
      return false;
    }

    // Skip index files
    if (name === "index") {
      return false;
    }

    // Skip underscore prefixed files
    if (name.startsWith("_")) {
      return false;
    }

    return true;
  }

  /**
   * Validate that an object looks like a plugin
   */
  private isValidPlugin(obj: unknown): boolean {
    if (!obj || typeof obj !== "object") {
      return false;
    }

    const p = obj as Record<string, unknown>;

    return (
      typeof p.name === "string" &&
      p.name.length > 0 &&
      typeof p.handle === "function"
    );
  }

  /**
   * Compare plugins by priority, then by name
   */
  private comparePlugins(a: IPlugin, b: IPlugin): number {
    // Access priority from internal property (set by createPlugin)
    const pa = (a as unknown as Record<string, unknown>).priority as number ??
      PLUGIN_PRIORITY.DEFAULT;
    const pb = (b as unknown as Record<string, unknown>).priority as number ??
      PLUGIN_PRIORITY.DEFAULT;

    if (pa !== pb) {
      return pa - pb; // priority ascending
    }

    return a.name.localeCompare(b.name); // name alphabetical
  }

  /**
   * Ensure a directory exists, create if not
   */
  private async ensureDir(dir: string): Promise<void> {
    try {
      const dirStat = await stat(dir);
      if (!dirStat.isDirectory()) {
        throw new Error(`${dir} exists but is not a directory`);
      }
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        "code" in err &&
        (err as NodeJS.ErrnoException).code === "ENOENT"
      ) {
        logger.warn(`[PluginLoader] Creating directory: ${dir}`);
        await mkdir(dir, { recursive: true });
      } else {
        throw err;
      }
    }
  }
}
