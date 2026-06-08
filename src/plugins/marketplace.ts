/**
 * Marketplace Plugin Wrapper
 *
 * Thin wrapper that re-exports the marketplace plugin from src/marketplace/.
 * This file exists so the PluginLoader can auto-discover it in src/plugins/.
 */

export { default } from "../marketplace/plugin.js";
