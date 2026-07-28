/**
 * NNBot - Main Entry Point
 *
 * Lightweight QQ Bot with plugin system.
 * Uses PluginManager.loadFromDir for automatic plugin discovery.
 */

import "dotenv/config";
import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { resolve } from "path";
import { ConfigManager, resolveLLMProvider, resolveProvidersConfig } from "./core/config.js";
import { ProviderManager } from "./providers/provider-manager.js";
import { PluginManager } from "./core/plugin-manager.js";
import { HotReloadManager } from "./core/hot-reload-manager.js";
import { MessageBuffer } from "./core/message-buffer.js";
import { logger } from "./core/logger.js";
import { SQLiteStorage } from "./services/storage/sqlite.js";
import { OpenAICompatibleService } from "./services/llm/openai.js";
import { OneBotAdapter } from "./utils/onebot.js";
import { WeComBotAdapter } from "./channels/wecom/wecom-bot-adapter.js";
import { configApi } from "./webui/config-api.js";
import { memoryApi } from "./webui/memory-api.js";
import { marketplaceApi } from "./marketplace/plugin.js";
import { toolRegistry } from "./services/tools/index.js";
import { initMultimodalServices } from "./plugins/multimodal.js";
import type { Event, EventResponder, PluginServices, AIChatHooks } from "./interfaces.js";

const PLUGINS_DIR = resolve(import.meta.dirname, "plugins");
const WEBUI_DIR = resolve(import.meta.dirname, "webui", "public");

async function main() {
  // Load configuration
  const configManager = new ConfigManager();
  const config = configManager.load();
  logger.info("Configuration loaded");

  // Initialize services
  const storage = await SQLiteStorage.create(config.storage.path);
  const llmProvider = resolveLLMProvider(config.llm);
  const llm = new OpenAICompatibleService(
    llmProvider.baseUrl,
    llmProvider.apiKey,
    {
      model: llmProvider.model,
      temperature: llmProvider.temperature,
      maxTokens: llmProvider.maxTokens,
    }
  );

  // Initialize LLM (fetch available models)
  logger.info(`Using LLM provider: ${llmProvider.name}`);
  await llm.init();

  // Initialize unified provider manager
  const providersConfig = resolveProvidersConfig(config);
  const providerManager = new ProviderManager(providersConfig);
  logger.info(`ProviderManager: ${providersConfig.list.length} providers configured`);

  // Initialize OneBot adapter
  const onebot = new OneBotAdapter(config.onebot);

  // Test OneBot connection
  const connected = await onebot.testConnection();
  if (!connected) {
    logger.warn(
      `OneBot is unavailable at ${config.onebot.url}; starting without OneBot message capabilities`
    );
  } else {
    try {
      const loginInfo = await onebot.getLoginInfo();
      logger.info(`Connected to OneBot as ${loginInfo.nickname} (${loginInfo.userId})`);
    } catch (error) {
      logger.warn(`OneBot connection changed before login info was read: ${error}`);
    }
  }

  const wecom = config.wecom?.enabled ? new WeComBotAdapter(config.wecom) : null;

  // Initialize multimodal services
  initMultimodalServices(config, llm, onebot);
  logger.info("Multimodal services initialized");

  // Initialize plugin manager
  const pluginManager = new PluginManager();

  // Create plugin services (hooks populated after plugin load)
  const hooks: AIChatHooks = {};
  const services: PluginServices = {
    llm,
    storage,
    config,
    pluginManager,
    hooks,
    toolRegistry,
    providers: providerManager,
  };

  // Load plugins from directory (auto-discovery)
  await pluginManager.loadFromDir(PLUGINS_DIR, services);

  // Collect hooks from all plugins
  Object.assign(hooks, pluginManager.getHooks());

  logger.info(`Loaded ${pluginManager.getPlugins().length} plugins`);

  // Initialize hot reload manager
  const hotReloadManager = new HotReloadManager(pluginManager, pluginManager.getLoader(), services);
  if (process.env.NODE_ENV !== "production") {
    await hotReloadManager.startWatching(PLUGINS_DIR);
    logger.info("Hot reload enabled (development mode)");
  }

  // Message buffer for handling multi-part messages
  const dispatchEvent = async (event: Event, responder: EventResponder): Promise<void> => {
    const response = await pluginManager.dispatch(event);
    if (response) {
      logger.messageOut(event.userId, response.content);
      await responder(event, response);
    }
  };

  const messageBuffer = new MessageBuffer(
    config.context.messageBufferDelay ?? 3000,
    dispatchEvent
  );

  const handleIncomingEvent = async (
    event: Event,
    responder: EventResponder
  ): Promise<void> => {
    if (!event.message) {
      return;
    }

    logger.messageIn(event.userId, event.nickname, event.message, event.groupId ?? undefined);

    // Commands are processed immediately; normal messages use the shared buffer.
    if (event.message.startsWith("/")) {
      await dispatchEvent(event, responder);
      return;
    }

    messageBuffer.add(event, responder);
  };

  // Create Fastify server
  const app = Fastify({ logger: false });
  let restartScheduled = false;

  // WebUI: serve static files and config API
  await app.register(fastifyStatic, { root: WEBUI_DIR, prefix: "/" });
  await app.register(configApi);
  await app.register(memoryApi);
  await app.register(marketplaceApi);

  // Health check endpoint
  app.get("/health", async () => {
    return { status: "ok", uptime: process.uptime() };
  });

  app.get("/api/system/logs", async (request) => {
    const query = request.query as { limit?: string };
    const parsedLimit = Number.parseInt(query.limit ?? "100", 10);
    const limit = Number.isFinite(parsedLimit) ? parsedLimit : 100;
    return { success: true, data: logger.getRecentLogs(limit) };
  });

  // Schedule a graceful process exit; systemd restarts the service on failure.
  app.post("/api/system/restart", async (_request, reply) => {
    if (restartScheduled) {
      return reply.status(409).send({ success: false, error: "Restart already scheduled" });
    }

    restartScheduled = true;
    setTimeout(() => {
      process.kill(process.pid, "SIGTERM");
    }, 150);

    return reply.send({ success: true, data: { status: "restarting" } });
  });

  // OneBot event endpoint
  app.post("/onebot/event", async (request, reply) => {
    const data = request.body as Record<string, unknown>;

    try {
      // Parse event
      const event = onebot.parseEvent(data);
      const responder: EventResponder = async (replyEvent, response) => {
        await onebot.sendResponse(replyEvent, response);
      };
      await handleIncomingEvent(event, responder);

      return reply.send({ status: "ok" });
    } catch (error) {
      logger.error(`Error handling event: ${error}`);
      return reply.status(500).send({ status: "error" });
    }
  });

  // Start server
  try {
    await app.listen({ port: config.server.port, host: config.server.host });
    logger.info(`Bot is running on ${config.server.host}:${config.server.port}`);
    logger.info(`OneBot event endpoint: ${config.server.host}:${config.server.port}/onebot/event`);
    if (wecom) {
      wecom.start(handleIncomingEvent);
      logger.info("Enterprise WeChat smart bot channel enabled");
    }
  } catch (error) {
    logger.error(`Failed to start server: ${error}`);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down...");

    // Stop hot reload
    hotReloadManager.stopWatching();

    if (wecom) {
      await wecom.stop();
    }

    // Unload plugins
    for (const plugin of pluginManager.getPlugins()) {
      await pluginManager.unregister(plugin);
    }

    // Close storage
    await storage.close();

    // Close server
    await app.close();

    logger.info("Goodbye!");
    process.exit(restartScheduled ? 75 : 0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch(console.error);
