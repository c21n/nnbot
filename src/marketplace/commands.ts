/**
 * Marketplace Commands (v2)
 *
 * /plugin command handler using MarketplaceService.
 */

import type { Event, Response } from "../interfaces.js";
import type { MarketplaceService } from "./service.js";
import { logger } from "../core/logger.js";

function parseArgs(message: string): { command: string; args: string[] } {
  const parts = message.trim().split(/\s+/);
  const command = parts[0]?.toLowerCase() || "";
  const args = parts.slice(1);
  return { command, args };
}

function formatSearchResults(
  plugins: Array<{ id: string; display_name: string; version: string; description?: string }>
): string {
  if (plugins.length === 0) return "No plugins found.";
  return plugins
    .map(
      (p) =>
        `• ${p.display_name} (${p.id}) v${p.version}${p.description ? `\n  ${p.description}` : ""}`
    )
    .join("\n\n");
}

/**
 * Handle /plugin commands.
 * Returns null if the event is not a /plugin command.
 */
export async function handlePluginCommand(
  event: Event,
  service: MarketplaceService
): Promise<Response | null> {
  const { command, args } = parseArgs(event.message);
  if (command !== "/plugin") return null;

  const sub = args[0]?.toLowerCase();
  const subArgs = args.slice(1);

  try {
    switch (sub) {
      case "search":
        return await handleSearch(subArgs, service);
      case "info":
        return await handleInfo(subArgs, service);
      case "install":
        return await handleInstall(subArgs, service);
      case "uninstall":
        return await handleUninstall(subArgs, service);
      case "update":
        return await handleUpdate(subArgs, service);
      case "list":
        return await handleList(service);
      case "help":
        return handleHelp();
      default:
        return {
          content: `Unknown command: /plugin ${sub}\nType /plugin help for available commands.`,
        };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[MarketplaceCommands] Error: ${msg}`);
    return { content: `❌ Error: ${msg}` };
  }
}

async function handleSearch(
  args: string[],
  service: MarketplaceService
): Promise<Response> {
  if (args.length === 0) {
    return { content: "Usage: /plugin search <keyword>" };
  }

  const keyword = args.join(" ").toLowerCase();
  const data = await service.getOnlinePlugins();

  const results = Object.entries(data)
    .filter(([, entry]) => {
      const searchable =
        `${entry.name} ${entry.display_name} ${entry.description} ${entry.author}`.toLowerCase();
      return searchable.includes(keyword);
    })
    .map(([id, entry]) => ({
      id,
      display_name: entry.display_name,
      version: entry.version,
      description: entry.description,
    }));

  return {
    content: `🔍 Search results for "${keyword}":\n\n${formatSearchResults(results)}`,
  };
}

async function handleInfo(
  args: string[],
  service: MarketplaceService
): Promise<Response> {
  if (args.length === 0) {
    return { content: "Usage: /plugin info <plugin-id>" };
  }

  const pluginId = args[0];
  const entry = await service.getOnlinePluginDetail(pluginId);

  if (!entry) {
    return { content: `❌ Plugin not found: ${pluginId}` };
  }

  const installed = (await service.getInstalledPlugins()).find(
    (p) => p.pluginId === pluginId
  );
  const status = installed
    ? `✅ Installed (v${installed.version})`
    : "⬇️ Not installed";

  const lines = [
    `📦 ${entry.display_name} (${pluginId})`,
    `Version: ${entry.version}`,
    `Author: ${entry.author}`,
    `Status: ${status}`,
    "",
    entry.description,
    "",
    `Repo: ${entry.repo}`,
  ];

  if (entry.category) lines.push(`Category: ${entry.category}`);
  if (entry.tags?.length) lines.push(`Tags: ${entry.tags.join(", ")}`);

  return { content: lines.join("\n") };
}

async function handleInstall(
  args: string[],
  service: MarketplaceService
): Promise<Response> {
  if (args.length === 0) {
    return { content: "Usage: /plugin install <plugin-id>" };
  }

  const pluginId = args[0];
  const result = await service.install(pluginId);

  return {
    content: result.success
      ? `✅ ${result.message}`
      : `❌ ${result.message}: ${result.error}`,
  };
}

async function handleUninstall(
  args: string[],
  service: MarketplaceService
): Promise<Response> {
  if (args.length === 0) {
    return { content: "Usage: /plugin uninstall <plugin-id>" };
  }

  const pluginId = args[0];
  const result = await service.uninstall(pluginId);

  return {
    content: result.success
      ? `✅ ${result.message}`
      : `❌ ${result.message}: ${result.error}`,
  };
}

async function handleUpdate(
  args: string[],
  service: MarketplaceService
): Promise<Response> {
  if (args.length === 0 || args[0] === "--all") {
    const results = await service.updateAll();

    if (results.length === 0) {
      return { content: "✅ All plugins are up to date." };
    }

    const lines = results.map((r) =>
      r.success
        ? `✅ ${r.pluginId}: ${r.oldVersion} → ${r.newVersion}`
        : `❌ ${r.pluginId}: ${r.error}`
    );
    return { content: `Plugin updates:\n${lines.join("\n")}` };
  }

  const pluginId = args[0];
  const result = await service.update(pluginId);

  return {
    content: result.success
      ? `✅ ${result.message}`
      : `❌ ${result.message}: ${result.error}`,
  };
}

async function handleList(service: MarketplaceService): Promise<Response> {
  const plugins = await service.getInstalledPlugins();

  if (plugins.length === 0) {
    return { content: "No plugins installed." };
  }

  const lines = plugins.map((p) => {
    const status = p.enabled ? "✅" : "⏸️";
    return `${status} ${p.name} v${p.version}`;
  });

  return { content: `Installed plugins:\n${lines.join("\n")}` };
}

function handleHelp(): Response {
  return {
    content: [
      "📦 Plugin Marketplace Commands",
      "",
      "/plugin search <keyword>     Search online plugins",
      "/plugin info <plugin-id>     View plugin details",
      "/plugin install <plugin-id>  Install plugin",
      "/plugin uninstall <id>       Uninstall plugin",
      "/plugin update [plugin-id]   Update plugin (or --all)",
      "/plugin list                 List installed plugins",
      "/plugin help                 Show this help",
    ].join("\n"),
  };
}
