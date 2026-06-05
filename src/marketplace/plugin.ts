/**
 * Marketplace Plugin
 *
 * NNBot plugin for marketplace integration.
 */

import { createPlugin } from '../core/create-plugin.js';
import { PLUGIN_PRIORITY } from '../constants.js';
import { handlePluginCommand } from './commands.js';
import { getPluginUpdater } from './updater.js';
import { createLogger } from '../core/logger.js';
import type { PluginServices, Event, Response } from '../interfaces.js';

const logger = createLogger('Marketplace');

/**
 * Marketplace plugin definition
 */
export default createPlugin({
  name: 'marketplace',
  description: 'Plugin marketplace for discovering and managing plugins',
  priority: PLUGIN_PRIORITY.LOW, // Low priority, runs after other plugins

  /**
   * Handle /plugin commands
   */
  async handle(event: Event, services: PluginServices): Promise<Response | null> {
    // Only handle /plugin commands
    if (!event.message.startsWith('/plugin')) {
      return null;
    }

    return handlePluginCommand(event, services);
  },

  /**
   * Plugin lifecycle: loaded
   */
  async onLoad(services: PluginServices): Promise<void> {
    logger.info('Marketplace plugin loaded');

    // Start auto-update checker
    startAutoUpdateChecker();
  },

  /**
   * Plugin lifecycle: unloaded
   */
  async onUnload(): Promise<void> {
    logger.info('Marketplace plugin unloaded');

    // Stop auto-update checker
    stopAutoUpdateChecker();
  },

  /**
   * Help text
   */
  help(): string {
    return `
📦 Plugin Marketplace

Commands:
  /plugin search <query>          Search plugins
  /plugin info <plugin-id>        View plugin details
  /plugin install <plugin-id>     Install plugin
  /plugin uninstall <plugin-id>   Uninstall plugin
  /plugin update <plugin-id>      Update single plugin
  /plugin update --all            Update all plugins
  /plugin list                    List installed plugins
  /plugin popular                 View popular plugins
  /plugin recommended             View recommended plugins
  /plugin help                    Show help
    `.trim();
  },
});

/**
 * Auto-update checker
 */
let updateCheckerInterval: NodeJS.Timeout | null = null;

function startAutoUpdateChecker(): void {
  // Check for updates every 24 hours
  const interval = 24 * 60 * 60 * 1000;

  updateCheckerInterval = setInterval(async () => {
    try {
      logger.info('Checking for plugin updates...');
      const updater = getPluginUpdater();
      const updates = await updater.checkUpdates();

      if (updates.length > 0) {
        logger.info(`Found ${updates.length} plugin updates`);
        // TODO: Notify user about updates
      }
    } catch (err) {
      const error = err as Error;
      logger.error('Auto-update check failed', error.message);
    }
  }, interval);

  // Run initial check after 5 minutes
  setTimeout(async () => {
    try {
      const updater = getPluginUpdater();
      const updates = await updater.checkUpdates();
      if (updates.length > 0) {
        logger.info(`Found ${updates.length} plugin updates`);
      }
    } catch (err) {
      // Ignore initial check errors
    }
  }, 5 * 60 * 1000);
}

function stopAutoUpdateChecker(): void {
  if (updateCheckerInterval) {
    clearInterval(updateCheckerInterval);
    updateCheckerInterval = null;
  }
}
