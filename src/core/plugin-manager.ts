/**
 * Plugin Manager
 *
 * Manages plugin lifecycle and event dispatching.
 * Follows the Single Responsibility Principle: only handles plugin management.
 */

import type {
  IPlugin,
  IPluginManager,
  Event,
  Response,
} from "../interfaces.js";

export class PluginManager implements IPluginManager {
  private plugins: IPlugin[] = [];

  async register(plugin: IPlugin): Promise<void> {
    // Check for duplicate names
    if (this.getPlugin(plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is already registered`);
    }

    this.plugins.push(plugin);
    await plugin.onLoad();

    console.log(
      `✓ Plugin "${plugin.name}" v${plugin.version} loaded`
    );
  }

  async unregister(plugin: IPlugin): Promise<void> {
    const index = this.plugins.findIndex((p) => p.name === plugin.name);

    if (index === -1) {
      throw new Error(`Plugin "${plugin.name}" is not registered`);
    }

    await plugin.onUnload();
    this.plugins.splice(index, 1);

    console.log(`✗ Plugin "${plugin.name}" unloaded`);
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
        console.error(`\x1b[31m[Plugin:${plugin.name}] ${msg}\x1b[0m`);
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
