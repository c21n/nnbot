/**
 * Marketplace Commands
 *
 * /plugin command handler for marketplace operations.
 */

import type { Event, Response, PluginServices } from '../interfaces.js';
import { getMarketplaceClient } from './client.js';
import { getPluginInstaller } from './installer.js';
import { getPluginUpdater } from './updater.js';
import { createLogger } from '../core/logger.js';

const logger = createLogger('MarketplaceCommands');

/**
 * Parse command arguments
 */
function parseArgs(message: string): { command: string; args: string[] } {
  const parts = message.trim().split(/\s+/);
  const command = parts[0]?.toLowerCase() || '';
  const args = parts.slice(1);
  return { command, args };
}

/**
 * Format plugin list for display
 */
function formatPluginList(plugins: Array<{ name: string; version: string; description?: string }>): string {
  if (plugins.length === 0) {
    return 'No plugins found.';
  }

  return plugins
    .map(p => `• ${p.name} v${p.version}${p.description ? ` - ${p.description}` : ''}`)
    .join('\n');
}

/**
 * Format search results for display
 */
function formatSearchResults(plugins: Array<{ id: string; displayName: string; version: string; downloads: number; rating: number }>): string {
  if (plugins.length === 0) {
    return 'No plugins found.';
  }

  return plugins
    .map(p => `• ${p.displayName} (${p.id}) v${p.version}\n  ⬇️ ${p.downloads} | ⭐ ${p.rating.toFixed(1)}`)
    .join('\n\n');
}

/**
 * Handle /plugin commands
 */
export async function handlePluginCommand(
  event: Event,
  services: PluginServices
): Promise<Response | null> {
  const { command, args } = parseArgs(event.message);

  // Check if this is a /plugin command
  if (command !== '/plugin') {
    return null;
  }

  const subCommand = args[0]?.toLowerCase();
  const subArgs = args.slice(1);

  try {
    switch (subCommand) {
      case 'search':
        return await handleSearch(subArgs);
      case 'info':
        return await handleInfo(subArgs);
      case 'install':
        return await handleInstall(subArgs);
      case 'uninstall':
        return await handleUninstall(subArgs);
      case 'update':
        return await handleUpdate(subArgs);
      case 'list':
        return await handleList();
      case 'popular':
        return await handlePopular();
      case 'recommended':
        return await handleRecommended();
      case 'help':
        return handleHelp();
      default:
        return {
          content: `Unknown command: /plugin ${subCommand}\nType /plugin help for available commands.`,
        };
    }
  } catch (err) {
    const error = err as Error;
    logger.error(`Command failed: ${error.message}`);
    return {
      content: `❌ Error: ${error.message}`,
    };
  }
}

/**
 * Handle /plugin search
 */
async function handleSearch(args: string[]): Promise<Response> {
  if (args.length === 0) {
    return {
      content: 'Usage: /plugin search <query>',
    };
  }

  const query = args.join(' ');
  const client = getMarketplaceClient();
  const plugins = await client.searchPlugins(query);

  return {
    content: `🔍 Search results for "${query}":\n\n${formatSearchResults(plugins)}`,
  };
}

/**
 * Handle /plugin info
 */
async function handleInfo(args: string[]): Promise<Response> {
  if (args.length === 0) {
    return {
      content: 'Usage: /plugin info <plugin-id>',
    };
  }

  const pluginId = args[0];
  const client = getMarketplaceClient();
  const detail = await client.getPluginDetail(pluginId);

  if (!detail) {
    return {
      content: `❌ Plugin not found: ${pluginId}`,
    };
  }

  const lines = [
    `📦 ${detail.displayName} (${detail.id})`,
    `Version: ${detail.version}`,
    `Author: ${detail.author}`,
    `Category: ${detail.category || 'Uncategorized'}`,
    `Downloads: ${detail.downloads} | Rating: ⭐ ${detail.rating.toFixed(1)} (${detail.ratingCount} reviews)`,
    '',
    detail.description,
    '',
    `License: ${detail.license || 'Not specified'}`,
  ];

  if (detail.homepage) {
    lines.push(`Homepage: ${detail.homepage}`);
  }

  if (detail.repository) {
    lines.push(`Repository: ${detail.repository}`);
  }

  if (detail.tags.length > 0) {
    lines.push(`Tags: ${detail.tags.join(', ')}`);
  }

  return {
    content: lines.join('\n'),
  };
}

/**
 * Handle /plugin install
 */
async function handleInstall(args: string[]): Promise<Response> {
  if (args.length === 0) {
    return {
      content: 'Usage: /plugin install <plugin-id> [version]',
    };
  }

  const pluginId = args[0];
  const version = args[1];

  const installer = getPluginInstaller();
  const result = await installer.install(pluginId, version);

  if (result.success) {
    return {
      content: `✅ ${result.message}`,
    };
  } else {
    return {
      content: `❌ ${result.message}: ${result.error}`,
    };
  }
}

/**
 * Handle /plugin uninstall
 */
async function handleUninstall(args: string[]): Promise<Response> {
  if (args.length === 0) {
    return {
      content: 'Usage: /plugin uninstall <plugin-id>',
    };
  }

  const pluginId = args[0];
  const installer = getPluginInstaller();
  const result = await installer.uninstall(pluginId);

  if (result.success) {
    return {
      content: `✅ ${result.message}`,
    };
  } else {
    return {
      content: `❌ ${result.message}: ${result.error}`,
    };
  }
}

/**
 * Handle /plugin update
 */
async function handleUpdate(args: string[]): Promise<Response> {
  const updater = getPluginUpdater();

  if (args.length === 0 || args[0] === '--all') {
    // Update all
    const results = await updater.updateAll();

    if (results.length === 0) {
      return {
        content: '✅ All plugins are up to date.',
      };
    }

    const lines = results.map(r => {
      if (r.success) {
        return `✅ ${r.pluginId}: ${r.oldVersion} -> ${r.newVersion}`;
      } else {
        return `❌ ${r.pluginId}: ${r.error}`;
      }
    });

    return {
      content: `Plugin updates:\n${lines.join('\n')}`,
    };
  }

  // Update single plugin
  const pluginId = args[0];
  const result = await updater.update(pluginId);

  if (result.success) {
    return {
      content: `✅ ${result.message}`,
    };
  } else {
    return {
      content: `❌ ${result.message}: ${result.error}`,
    };
  }
}

/**
 * Handle /plugin list
 */
async function handleList(): Promise<Response> {
  const installer = getPluginInstaller();
  const plugins = await installer.getInstalledPlugins();

  if (plugins.length === 0) {
    return {
      content: 'No plugins installed.',
    };
  }

  const lines = plugins.map(p => {
    const status = p.enabled ? '✅' : '⏸️';
    const update = p.hasUpdate ? ` (update available: ${p.latestVersion})` : '';
    return `${status} ${p.name} v${p.version}${update}`;
  });

  return {
    content: `Installed plugins:\n${lines.join('\n')}`,
  };
}

/**
 * Handle /plugin popular
 */
async function handlePopular(): Promise<Response> {
  const client = getMarketplaceClient();
  const plugins = await client.getPopularPlugins(10);

  return {
    content: `🔥 Popular plugins:\n\n${formatSearchResults(plugins)}`,
  };
}

/**
 * Handle /plugin recommended
 */
async function handleRecommended(): Promise<Response> {
  const client = getMarketplaceClient();
  const plugins = await client.getRecommendedPlugins(10);

  return {
    content: `⭐ Recommended plugins:\n\n${formatSearchResults(plugins)}`,
  };
}

/**
 * Handle /plugin help
 */
function handleHelp(): Response {
  const help = `
📦 Plugin Marketplace Commands

/plugin search <query>          Search plugins
/plugin info <plugin-id>        View plugin details
/plugin install <plugin-id>     Install plugin
/plugin uninstall <plugin-id>   Uninstall plugin
/plugin update <plugin-id>      Update single plugin
/plugin update --all            Update all plugins
/plugin list                    List installed plugins
/plugin popular                 View popular plugins
/plugin recommended             View recommended plugins
/plugin help                    Show this help
  `.trim();

  return {
    content: help,
  };
}
