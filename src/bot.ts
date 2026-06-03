/**
 * NNBot - Main Entry Point
 *
 * Lightweight QQ Bot with plugin system.
 */

import "dotenv/config";
import Fastify from "fastify";
import { ConfigManager } from "./core/config.js";
import { PluginManager } from "./core/plugin-manager.js";
import { MessageBuffer } from "./core/message-buffer.js";
import { logger } from "./core/logger.js";
import { SQLiteStorage } from "./services/storage/sqlite.js";
import { OpenAICompatibleService } from "./services/llm/openai.js";
import { OneBotAdapter } from "./utils/onebot.js";
import { AIChatPlugin } from "./plugins/ai-chat.js";
import { RuleMatchPlugin } from "./plugins/rule-match.js";
import { AdminPlugin } from "./plugins/admin.js";

async function main() {
  // Load configuration
  const configManager = new ConfigManager();
  const config = configManager.load();
  logger.info("Configuration loaded");

  // Initialize services
  const storage = await SQLiteStorage.create(config.storage.path);
  const llm = new OpenAICompatibleService(
    config.llm.baseUrl,
    config.llm.apiKey,
    {
      model: config.llm.model,
      temperature: config.llm.temperature,
      maxTokens: config.llm.maxTokens,
    }
  );

  // Initialize LLM (fetch available models)
  await llm.init();

  // Initialize OneBot adapter
  const onebot = new OneBotAdapter(config.onebot);

  // Test OneBot connection
  const connected = await onebot.testConnection();
  if (!connected) {
    logger.error("Failed to connect to OneBot", { url: config.onebot.url });
    process.exit(1);
  }

  const loginInfo = await onebot.getLoginInfo();
  logger.info(`Connected to OneBot as ${loginInfo.nickname} (${loginInfo.userId})`);

  // Initialize plugin manager
  const pluginManager = new PluginManager();

  // Register plugins (order matters: admin first to handle / commands)
  if (config.plugins.enabled.includes("admin")) {
    await pluginManager.register(new AdminPlugin(pluginManager, config, storage));
  }

  if (config.plugins.enabled.includes("rule_match")) {
    await pluginManager.register(new RuleMatchPlugin(config.rules));
  }

  if (config.plugins.enabled.includes("ai_chat")) {
    // Hooks are optional — pass {} or omit for no-op behavior.
    // Example: inject RAG context before LLM call
    //   hooks: {
    //     beforeLLM: async (messages, event) => {
    //       const context = await chromaDB.query(event.message);
    //       return [...messages, { role: "system", content: context }];
    //     },
    //   }
    await pluginManager.register(new AIChatPlugin(llm, storage, storage, config));
  }

  // Message buffer for handling multi-part messages
  const messageBuffer = new MessageBuffer(
    5000, // Wait 5 seconds for more messages
    async (userId, nickname, groupId, groupName, combinedMessage) => {
      // Create event and process
      const event = {
        type: groupId ? "group_message" : "private_message",
        userId,
        nickname,
        groupId,
        groupName,
        message: combinedMessage,
        timestamp: Date.now(),
        raw: {},
      };

      const response = await pluginManager.dispatch(event as any);
      if (response) {
        logger.messageOut(userId, response.content);
        await onebot.sendResponse(event as any, response);
      }
    }
  );

  // Create Fastify server
  const app = Fastify({ logger: false });

  // Health check endpoint
  app.get("/health", async () => {
    return { status: "ok", uptime: process.uptime() };
  });

  // OneBot event endpoint
  app.post("/onebot/event", async (request, reply) => {
    const data = request.body as Record<string, unknown>;

    try {
      // Parse event
      const event = onebot.parseEvent(data);

      // Skip empty messages
      if (!event.message) {
        return reply.send({ status: "ok" });
      }

      logger.messageIn(event.userId, event.nickname, event.message, event.groupId ?? undefined);

      // Commands are processed immediately, no buffering
      if (event.message.startsWith("/")) {
        const response = await pluginManager.dispatch(event);
        if (response) {
          logger.messageOut(event.userId, response.content);
          await onebot.sendResponse(event, response);
        }
      } else {
        // Other messages are buffered
        messageBuffer.add(
          event.userId,
          event.nickname,
          event.groupId,
          event.groupName,
          event.message
        );
      }

      return reply.send({ status: "ok" });
    } catch (error) {
      logger.error("Error handling event", error);
      return reply.status(500).send({ status: "error" });
    }
  });

  // Start server
  try {
    await app.listen({ port: config.server.port, host: config.server.host });
    logger.info(`Bot is running on ${config.server.host}:${config.server.port}`);
    logger.info(`Waiting for events from ${config.onebot.url}`);
  } catch (error) {
    logger.error("Failed to start server", error);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async () => {
    logger.info("Shutting down...");

    // Unload plugins
    for (const plugin of pluginManager.getPlugins()) {
      await pluginManager.unregister(plugin);
    }

    // Close storage
    await storage.close();

    // Close server
    await app.close();

    logger.info("Goodbye!");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch(console.error);
