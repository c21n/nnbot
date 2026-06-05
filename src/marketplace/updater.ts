/**
 * Plugin Updater
 *
 * Handles plugin update checking and execution.
 */

import type {
  IPluginUpdater,
  UpdateInfo,
  UpdateResult,
  InstalledPlugin,
} from './types.js';
import { getMarketplaceClient } from './client.js';
import { getPluginInstaller } from './installer.js';
import { createLogger } from '../core/logger.js';

const logger = createLogger('PluginUpdater');

/**
 * Plugin updater implementation
 */
export class PluginUpdater implements IPluginUpdater {
  private client = getMarketplaceClient();
  private installer = getPluginInstaller();

  /**
   * Check updates for all installed plugins
   */
  async checkUpdates(): Promise<UpdateInfo[]> {
    try {
      logger.info('Checking for plugin updates...');

      const installed = await this.installer.getInstalledPlugins();
      const updates: UpdateInfo[] = [];

      for (const plugin of installed) {
        try {
          const versions = await this.client.getVersions(plugin.pluginId);
          const latestVersion = versions[0];

          if (latestVersion && latestVersion.version !== plugin.version) {
            updates.push({
              pluginId: plugin.pluginId,
              currentVersion: plugin.version,
              latestVersion: latestVersion.version,
              changelog: latestVersion.changelog,
              updatedAt: latestVersion.releasedAt,
            });
          }
        } catch (err) {
          const error = err as Error;
          logger.warn(`Failed to check updates for ${plugin.pluginId}: ${error.message}`);
        }
      }

      logger.info(`Found ${updates.length} plugin updates`);
      return updates;
    } catch (err) {
      const error = err as Error;
      logger.error('Failed to check updates', error.message);
      throw new Error('Failed to check updates');
    }
  }

  /**
   * Update single plugin
   */
  async update(pluginId: string): Promise<UpdateResult> {
    try {
      logger.info(`Updating plugin: ${pluginId}`);

      // Get installed plugin
      const installed = await this.installer.getInstalledPlugins();
      const plugin = installed.find(p => p.pluginId === pluginId);

      if (!plugin) {
        return {
          success: false,
          pluginId,
          oldVersion: '',
          newVersion: '',
          message: 'Not installed',
          error: `Plugin ${pluginId} is not installed`,
        };
      }

      // Get latest version
      const versions = await this.client.getVersions(pluginId);
      const latestVersion = versions[0];

      if (!latestVersion || latestVersion.version === plugin.version) {
        return {
          success: false,
          pluginId,
          oldVersion: plugin.version,
          newVersion: plugin.version,
          message: 'Already up to date',
          error: `Plugin ${pluginId} is already at the latest version`,
        };
      }

      // Uninstall old version
      await this.installer.uninstall(pluginId);

      // Install new version
      const installResult = await this.installer.install(pluginId, latestVersion.version);

      if (!installResult.success) {
        return {
          success: false,
          pluginId,
          oldVersion: plugin.version,
          newVersion: latestVersion.version,
          message: 'Update failed',
          error: installResult.error,
        };
      }

      logger.info(`Plugin updated: ${pluginId} ${plugin.version} -> ${latestVersion.version}`);

      return {
        success: true,
        pluginId,
        oldVersion: plugin.version,
        newVersion: latestVersion.version,
        message: `Plugin ${pluginId} updated from ${plugin.version} to ${latestVersion.version}`,
      };
    } catch (err) {
      const error = err as Error;
      logger.error(`Failed to update plugin: ${error.message}`);

      return {
        success: false,
        pluginId,
        oldVersion: '',
        newVersion: '',
        message: 'Update failed',
        error: error.message,
      };
    }
  }

  /**
   * Update all plugins
   */
  async updateAll(): Promise<UpdateResult[]> {
    try {
      logger.info('Updating all plugins...');

      const updates = await this.checkUpdates();
      const results: UpdateResult[] = [];

      for (const update of updates) {
        const result = await this.update(update.pluginId);
        results.push(result);
      }

      const successCount = results.filter(r => r.success).length;
      logger.info(`Updated ${successCount}/${results.length} plugins`);

      return results;
    } catch (err) {
      const error = err as Error;
      logger.error('Failed to update all plugins', error.message);
      throw new Error('Failed to update all plugins');
    }
  }
}

/**
 * Singleton plugin updater instance
 */
let updaterInstance: PluginUpdater | null = null;

/**
 * Get plugin updater instance
 */
export function getPluginUpdater(): PluginUpdater {
  if (!updaterInstance) {
    updaterInstance = new PluginUpdater();
  }
  return updaterInstance;
}
