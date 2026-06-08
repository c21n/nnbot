/**
 * Marketplace Plugin (v2)
 *
 * Provides:
 * 1. getMarketplaceService() — singleton service accessor
 * 2. marketplaceApi — Fastify plugin for WebUI /api/marketplace/* routes
 * 3. Default export — IPlugin for QQ /plugin commands (use via src/plugins/marketplace.ts)
 */

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createPlugin } from "../core/create-plugin.js";
import { PLUGIN_PRIORITY } from "../constants.js";
import { handlePluginCommand } from "./commands.js";
import { MarketplaceService } from "./service.js";
import { logger } from "../core/logger.js";
import type { PluginServices, Event, Response } from "../interfaces.js";
import type { FastifyInstance } from "fastify";

// ============ Service Singleton ============

let _service: MarketplaceService | null = null;

/**
 * Get or create the MarketplaceService singleton.
 */
export function getMarketplaceService(): MarketplaceService {
  if (!_service) {
    // Resolve project root: from src/marketplace/ → project root
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const rootDir = resolve(__dirname, "..", "..");
    _service = new MarketplaceService({ rootDir });
  }
  return _service;
}

// ============ QQ Plugin (IPlugin) ============

/**
 * IPlugin for handling /plugin QQ commands.
 * Export as default for PluginLoader compatibility.
 */
export default createPlugin({
  name: "marketplace",
  description: "Plugin marketplace for discovering and managing plugins",
  priority: PLUGIN_PRIORITY.DEFAULT,

  async handle(event: Event, _services: PluginServices): Promise<Response | null> {
    if (!event.message.startsWith("/plugin")) return null;
    return handlePluginCommand(event, getMarketplaceService());
  },

  async onLoad(): Promise<void> {
    logger.info("[Marketplace] Plugin loaded");
  },

  async onUnload(): Promise<void> {
    logger.info("[Marketplace] Plugin unloaded");
  },

  help(): string {
    return [
      "📦 Plugin Marketplace",
      "",
      "/plugin search <keyword>     Search online plugins",
      "/plugin info <plugin-id>     View plugin details",
      "/plugin install <plugin-id>  Install plugin",
      "/plugin uninstall <id>       Uninstall plugin",
      "/plugin update [plugin-id]   Update plugin (or --all)",
      "/plugin list                 List installed plugins",
      "/plugin help                 Show this help",
    ].join("\n");
  },
});

// ============ Fastify API Plugin (for WebUI) ============

/**
 * Fastify plugin — registers /api/marketplace/* routes for the WebUI.
 * Usage in bot.ts: await app.register(marketplaceApi)
 */
export async function marketplaceApi(app: FastifyInstance): Promise<void> {
  const service = getMarketplaceService();

  // GET /api/marketplace/plugins — list online plugins
  // Query params: q (search), sort (popular|recommended|updated), limit, force_refresh, custom_source
  app.get("/api/marketplace/plugins", async (request, reply) => {
    const raw = request.query as Record<string, string | string[]>;
    const query = {
      q: Array.isArray(raw.q) ? raw.q[0] : raw.q,
      sort: Array.isArray(raw.sort) ? raw.sort[0] : raw.sort,
      limit: Array.isArray(raw.limit) ? raw.limit[0] : raw.limit,
      force_refresh: Array.isArray(raw.force_refresh) ? raw.force_refresh[0] : raw.force_refresh,
      custom_source: Array.isArray(raw.custom_source) ? raw.custom_source[0] : raw.custom_source,
    };
    try {
      const data = await service.getOnlinePlugins({
        forceRefresh: query.force_refresh === "true",
        customSource: query.custom_source,
      });

      // Convert Record → array with id field
      let plugins = Object.entries(data).map(([id, entry]) => ({
        id,
        ...entry,
      }));

      // Search filter
      if (query.q) {
        const q = query.q.toLowerCase();
        plugins = plugins.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.display_name.toLowerCase().includes(q) ||
            p.description?.toLowerCase().includes(q) ||
            p.tags?.some((t) => t.toLowerCase().includes(q))
        );
      }

      // Sort
      const sort = query.sort ?? "updated";
      if (sort === "popular") {
        plugins.sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0));
      } else if (sort === "recommended") {
        plugins.sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return (b.stars ?? 0) - (a.stars ?? 0);
        });
      } else {
        plugins.sort(
          (a, b) =>
            (new Date(b.updated_at || 0).getTime() || 0) -
            (new Date(a.updated_at || 0).getTime() || 0)
        );
      }

      // Limit
      const limit = parseInt(query.limit ?? "", 10);
      if (!isNaN(limit) && limit > 0) {
        plugins = plugins.slice(0, limit);
      }

      return reply.send({ success: true, data: plugins });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ success: false, error: msg });
    }
  });

  // GET /api/marketplace/plugins/:id — plugin detail
  app.get("/api/marketplace/plugins/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const entry = await service.getOnlinePluginDetail(id);
      if (!entry) {
        return reply.status(404).send({ success: false, error: "Plugin not found" });
      }
      return reply.send({ success: true, data: { id, ...entry } });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ success: false, error: msg });
    }
  });

  // GET /api/marketplace/installed — list installed plugins
  app.get("/api/marketplace/installed", async (_request, reply) => {
    try {
      const plugins = await service.getInstalledPlugins();
      return reply.send({ success: true, data: plugins });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ success: false, error: msg });
    }
  });

  // GET /api/marketplace/updates — check for updates
  app.get("/api/marketplace/updates", async (_request, reply) => {
    try {
      const updates = await service.checkUpdates();
      return reply.send({ success: true, data: updates });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ success: false, error: msg });
    }
  });

  // POST /api/marketplace/install — install a plugin
  app.post("/api/marketplace/install", async (request, reply) => {
    const body = request.body as { plugin_id?: string; proxy?: string };
    if (!body.plugin_id) {
      return reply.status(400).send({ success: false, error: "plugin_id is required" });
    }
    try {
      const result = await service.install(body.plugin_id, { proxy: body.proxy });
      return reply.send(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ success: false, error: msg });
    }
  });

  // POST /api/marketplace/uninstall — uninstall a plugin
  app.post("/api/marketplace/uninstall", async (request, reply) => {
    const body = request.body as { plugin_id?: string };
    if (!body.plugin_id) {
      return reply.status(400).send({ success: false, error: "plugin_id is required" });
    }
    try {
      const result = await service.uninstall(body.plugin_id);
      return reply.send(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ success: false, error: msg });
    }
  });

  // POST /api/marketplace/update — update a plugin
  app.post("/api/marketplace/update", async (request, reply) => {
    const body = request.body as { plugin_id?: string; proxy?: string };
    if (!body.plugin_id) {
      return reply.status(400).send({ success: false, error: "plugin_id is required" });
    }
    try {
      const result = await service.update(body.plugin_id, { proxy: body.proxy });
      return reply.send(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ success: false, error: msg });
    }
  });

  // POST /api/marketplace/update-all — update all plugins
  app.post("/api/marketplace/update-all", async (request, reply) => {
    const body = (request.body ?? {}) as { proxy?: string };
    try {
      const results = await service.updateAll({ proxy: body.proxy });
      return reply.send({ success: true, data: results });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ success: false, error: msg });
    }
  });

  // POST /api/marketplace/toggle — enable/disable an installed plugin
  app.post("/api/marketplace/toggle", async (request, reply) => {
    const body = request.body as { plugin_id?: string; enabled?: boolean };
    if (!body.plugin_id) {
      return reply.status(400).send({ success: false, error: "plugin_id is required" });
    }
    if (typeof body.enabled !== "boolean") {
      return reply.status(400).send({ success: false, error: "enabled (boolean) is required" });
    }
    try {
      await service.setEnabled(body.plugin_id, body.enabled);
      return reply.send({
        success: true,
        message: `Plugin ${body.plugin_id} ${body.enabled ? "enabled" : "disabled"}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ success: false, error: msg });
    }
  });
}
