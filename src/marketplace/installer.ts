/**
 * Plugin Installer
 *
 * Handles plugin installation and uninstallation.
 */

import { writeFile, readFile, unlink, mkdir, access } from 'fs/promises';
import { join, basename } from 'path';
import { createHash } from 'crypto';
import type {
  IPluginInstaller,
  InstallResult,
  UninstallResult,
  InstalledPlugin,
} from './types.js';
import { getMarketplaceClient } from './client.js';
import { getMarketplaceConfig } from './config.js';
import { createLogger } from '../core/logger.js';

const logger = createLogger('PluginInstaller');

/**
 * Plugin installer implementation
 */
export class PluginInstaller implements IPluginInstaller {
  private config = getMarketplaceConfig();
  private client = getMarketplaceClient();

  /**
   * Install plugin
   */
  async install(pluginId: string, version?: string): Promise<InstallResult> {
    try {
      logger.info(`Installing plugin: ${pluginId}`);

      // Get plugin detail
      const detail = await this.client.getPluginDetail(pluginId);
      if (!detail) {
        return {
          success: false,
          pluginId,
          version: version || 'latest',
          message: 'Plugin not found',
          error: 'Plugin not found in marketplace',
        };
      }

      // Determine version to install
      const targetVersion = version || detail.version;

      // Check if already installed
      const installed = await this.getInstalledPlugin(pluginId);
      if (installed && installed.version === targetVersion) {
        return {
          success: false,
          pluginId,
          version: targetVersion,
          message: 'Already installed',
          error: `Plugin ${pluginId}@${targetVersion} is already installed`,
        };
      }

      // Download plugin file
      logger.info(`Downloading ${pluginId}@${targetVersion}`);
      const fileBuffer = await this.client.downloadPlugin(pluginId, targetVersion);

      // Verify checksum
      const versions = await this.client.getVersions(pluginId);
      const versionInfo = versions.find(v => v.version === targetVersion);

      if (versionInfo?.checksum) {
        const hash = createHash('sha256').update(fileBuffer).digest('hex');
        if (hash !== versionInfo.checksum) {
          return {
            success: false,
            pluginId,
            version: targetVersion,
            message: 'Checksum mismatch',
            error: 'Downloaded file checksum does not match',
          };
        }
      }

      // Ensure plugins directory exists
      await mkdir(this.config.pluginsDir, { recursive: true });

      // Save plugin file
      const fileName = `${detail.name}.js`;
      const filePath = join(this.config.pluginsDir, fileName);
      await writeFile(filePath, fileBuffer);

      // Record installation
      await this.recordInstallation({
        pluginId,
        name: detail.name,
        version: targetVersion,
        installedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        enabled: true,
        hasUpdate: false,
      });

      logger.info(`Plugin installed: ${pluginId}@${targetVersion}`);

      return {
        success: true,
        pluginId,
        version: targetVersion,
        message: `Plugin ${pluginId}@${targetVersion} installed successfully`,
      };
    } catch (err) {
      const error = err as Error;
      logger.error(`Failed to install plugin: ${error.message}`);

      return {
        success: false,
        pluginId,
        version: version || 'latest',
        message: 'Installation failed',
        error: error.message,
      };
    }
  }

  /**
   * Uninstall plugin
   */
  async uninstall(pluginId: string): Promise<UninstallResult> {
    try {
      logger.info(`Uninstalling plugin: ${pluginId}`);

      // Check if installed
      const installed = await this.getInstalledPlugin(pluginId);
      if (!installed) {
        return {
          success: false,
          pluginId,
          message: 'Not installed',
          error: `Plugin ${pluginId} is not installed`,
        };
      }

      // Delete plugin file
      const fileName = `${installed.name}.js`;
      const filePath = join(this.config.pluginsDir, fileName);

      try {
        await access(filePath);
        await unlink(filePath);
      } catch {
        // File may not exist, ignore
      }

      // Remove installation record
      await this.removeInstallation(pluginId);

      logger.info(`Plugin uninstalled: ${pluginId}`);

      return {
        success: true,
        pluginId,
        message: `Plugin ${pluginId} uninstalled successfully`,
      };
    } catch (err) {
      const error = err as Error;
      logger.error(`Failed to uninstall plugin: ${error.message}`);

      return {
        success: false,
        pluginId,
        message: 'Uninstallation failed',
        error: error.message,
      };
    }
  }

  /**
   * Get installed plugins
   */
  async getInstalledPlugins(): Promise<InstalledPlugin[]> {
    try {
      const data = await this.readInstallData();
      return data;
    } catch {
      return [];
    }
  }

  /**
   * Check if plugin is installed
   */
  async isInstalled(pluginId: string): Promise<boolean> {
    const installed = await this.getInstalledPlugin(pluginId);
    return installed !== null;
  }

  /**
   * Get single installed plugin
   */
  private async getInstalledPlugin(pluginId: string): Promise<InstalledPlugin | null> {
    const plugins = await this.getInstalledPlugins();
    return plugins.find(p => p.pluginId === pluginId) || null;
  }

  /**
   * Record plugin installation
   */
  private async recordInstallation(plugin: InstalledPlugin): Promise<void> {
    const plugins = await this.getInstalledPlugins();
    const index = plugins.findIndex(p => p.pluginId === plugin.pluginId);

    if (index >= 0) {
      plugins[index] = plugin;
    } else {
      plugins.push(plugin);
    }

    await this.writeInstallData(plugins);
  }

  /**
   * Remove installation record
   */
  private async removeInstallation(pluginId: string): Promise<void> {
    const plugins = await this.getInstalledPlugins();
    const filtered = plugins.filter(p => p.pluginId !== pluginId);
    await this.writeInstallData(filtered);
  }

  /**
   * Read installation data from file
   */
  private async readInstallData(): Promise<InstalledPlugin[]> {
    try {
      const data = await readFile(this.config.dataFile, 'utf-8');
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  /**
   * Write installation data to file
   */
  private async writeInstallData(plugins: InstalledPlugin[]): Promise<void> {
    const dir = join(this.config.dataFile, '..');
    await mkdir(dir, { recursive: true });
    await writeFile(this.config.dataFile, JSON.stringify(plugins, null, 2));
  }
}

/**
 * Singleton plugin installer instance
 */
let installerInstance: PluginInstaller | null = null;

/**
 * Get plugin installer instance
 */
export function getPluginInstaller(): PluginInstaller {
  if (!installerInstance) {
    installerInstance = new PluginInstaller();
  }
  return installerInstance;
}
