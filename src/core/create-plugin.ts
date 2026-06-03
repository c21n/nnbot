/**
 * createPlugin factory function
 *
 * Wraps a PluginDefinition into an IPlugin instance.
 * Services are injected at runtime by PluginManager.
 */

import type {
  IPlugin,
  Event,
  Response,
  PluginServices,
  PluginDefinition,
} from "../interfaces.js";

/**
 * Create an IPlugin from a PluginDefinition
 *
 * @param def - Plugin definition (name + handle required)
 * @returns IPlugin instance
 * @throws Error if name or handle is missing/invalid
 */
export function createPlugin(def: PluginDefinition): IPlugin {
  // Validate required fields
  if (!def.name || typeof def.name !== "string") {
    throw new Error("Plugin name is required");
  }

  if (typeof def.handle !== "function") {
    throw new Error("Plugin handle function is required");
  }

  // Internal services reference, set by PluginManager
  let _services: PluginServices | null = null;

  const plugin: IPlugin & { setServices(s: PluginServices): void } = {
    // Immutable properties with defaults
    name: def.name,
    description: def.description ?? "",
    version: def.version ?? "1.0.0",

    /**
     * Set services (called by PluginManager before onLoad/handle)
     */
    setServices(services: PluginServices): void {
      _services = services;
    },

    /**
     * Get help text
     */
    help(): string {
      return def.help ?? "";
    },

    /**
     * Lifecycle: plugin loaded
     */
    async onLoad(): Promise<void> {
      if (!_services) {
        throw new Error("Plugin not registered");
      }
      if (def.onLoad) {
        await def.onLoad(_services);
      }
    },

    /**
     * Lifecycle: plugin unloaded
     */
    async onUnload(): Promise<void> {
      if (def.onUnload) {
        await def.onUnload();
      }
    },

    /**
     * Handle an event
     */
    async handle(event: Event): Promise<Response | null> {
      if (!_services) {
        throw new Error("Plugin not registered");
      }
      return def.handle(event, _services);
    },
  };

  return plugin;
}
