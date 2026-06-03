/**
 * Plugin Manager
 *
 * Manages plugin lifecycle and event dispatching.
 * Follows the Single Responsibility Principle: only handles plugin management.
 */

import type {
  IPlugin,
  IPluginManager,
  IPluginLoader,
  PluginServices,
  Event,
  Response,
} from "../interfaces.js";
import { PluginLoader } from "./plugin-loader.js";
import { logger } from "./logger.js";

export class PluginManager implements IPluginManager {
  private plugins: IPlugin[] = [];
  private loader: IPluginLoader;
  private dir: string = "";

  constructor(loader?: IPluginLoader) {
    this.loader = loader ?? new PluginLoader();
  }

  /**
   * Load plugins from directory and register them
   *
   * @param dir - Absolute path to plugins directory
   * @param services - Services to inject into plugins
   */
  async loadFromDir(dir: string, services: PluginServices): Promise<void> {
    this.dir = dir;
    const plugins = await this.loader.loadFromDir(dir, services);

    for (const plugin of plugins) {
      try {
        await this.register(plugin);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`[PluginManager] Failed to register "${plugin.name}": ${msg}`);
      }
    }
  }

  /**
   * Reload a specific plugin by name
   *
   * @param name - Plugin name to reload
   * @param services - Services to inject
   */
  async reloadPlugin(name: string, services: PluginServices): Promise<void> {
    const plugin = this.getPlugin(name);
    if (!plugin) {
      throw new Error(`Plugin "${name}" not found`);
    }

    // Find plugin file (search in directory)
    const { readdir } = await import("fs/promises");
    const { join, extname, basename } = await import("path");

    const files = await readdir(this.dir);
    const pluginFile = files.find((f) => {
      const ext = extname(f);
      const name = basename(f, ext);
      return name === plugin.name && (ext === ".ts" || ext === ".js");
    });

    if (!pluginFile) {
      throw new Error(`Plugin file for "${name}" not found in ${this.dir}`);
    }

    const filePath = join(this.dir, pluginFile);

    // Unload old plugin
    await this.unregister(plugin);

    // Load new version
    const newPlugin = await this.loader.loadPlugin(filePath, services);
    if (newPlugin) {
      await this.register(newPlugin);
      logger.info(`[PluginManager] Plugin "${name}" reloaded successfully`);
    } else {
      logger.warn(`[PluginManager] Failed to reload plugin "${name}"`);
    }
  }

  /**
   * Reload all plugins
   *
   * @param services - Services to inject
   */
  async reloadAll(services: PluginServices): Promise<void> {
    // Unload all plugins
    const plugins = [...this.plugins];
    for (const plugin of plugins) {
      try {
        await this.unregister(plugin);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`[PluginManager] Failed to unload "${plugin.name}": ${msg}`);
      }
    }

    // Reload from directory
    if (this.dir) {
      await this.loadFromDir(this.dir, services);
      logger.info(`[PluginManager] Reloaded ${this.plugins.length} plugins`);
    }
  }

  async register(plugin: IPlugin): Promise<void> {
    // Check for duplicate names
    if (this.getPlugin(plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is already registered`);
    }

    this.plugins.push(plugin);
    await plugin.onLoad();

    logger.info(`✓ Plugin "${plugin.name}" v${plugin.version} loaded`);
  }

  async unregister(plugin: IPlugin): Promise<void> {
    const index = this.plugins.findIndex((p) => p.name === plugin.name);

    if (index === -1) {
      throw new Error(`Plugin "${plugin.name}" is not registered`);
    }

    await plugin.onUnload();
    this.plugins.splice(index, 1);

    logger.info(`✗ Plugin "${plugin.name}" unloaded`);
  }

  async dispatch(event: Event): Promise<Response | null> {
    // Try each plugin in order
    for (const plugin of this.plugins) {
      try {
        const response = await plugin.handle(event);

        // If plugin returned a response, it handled the event
        if (response !== null) {
          return response;
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`[Plugin:${plugin.name}] ${msg}`);
        // Continue to next plugin
      }
    }

    // No plugin handled the event
    return null;
  }

  getPlugins(): IPlugin[] {
    return [...this.plugins];
  }

  getPlugin(name: string): IPlugin | undefined {
    return this.plugins.find((p) => p.name === name);
  }
}
