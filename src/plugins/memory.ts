/**
 * Memory Plugin
 *
 * Long-term memory via internal memory module.
 * Provides AIChatHooks to inject memories into LLM context
 * and store conversations for memory extraction.
 */

import { createPlugin } from "../core/create-plugin.js";
import { PLUGIN_PRIORITY } from "../constants.js";
import { logger } from "../core/logger.js";
import type { AIChatHooks, LLMMessage, Event, PluginServices } from "../interfaces.js";
import {
  MemoryPlugin,
  SiliconFlowEmbedding,
  DeepSeekLLM,
  MemoryLock,
  getSqliteConnection,
  SqliteMessageRepository,
  SqliteSessionRepository,
  SqliteProfileRepository,
  SummaryRepository,
  SqliteUserIndexRepository,
  VectraMemoryRepository,
  BM25Service,
  setCustomLogger,
} from "../memory/index.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let plugin: any = null;
let isEnabled = false;
const lastUserMessage = new Map<string, string>();

function buildSessionId(event: Event): string {
  const date = new Date(event.timestamp).toISOString().slice(0, 10);
  const scope = event.groupId ? `group:${event.groupId}` : "private";
  return `${event.userId}:${scope}:${date}`;
}

export default createPlugin({
  name: "memory",
  description: "Long-term memory via internal memory module",
  priority: PLUGIN_PRIORITY.AI_CHAT - 1, // Before ai_chat

  async onLoad(services: PluginServices) {
    const config = services.config;
    const enabled = config.plugins.enabled.includes("memory");

    if (!enabled) {
      logger.info("[Memory] Disabled");
      return;
    }

    const memoryConfig = config.memory;
    if (!memoryConfig?.enabled) {
      logger.info("[Memory] Disabled in config");
      return;
    }

    const siliconflowKey = memoryConfig.embedding?.apiKey ?? "";
    const deepseekKey = memoryConfig.llm?.apiKey ?? "";

    if (!siliconflowKey) {
      logger.warn("[Memory] Missing embedding API key, disabled");
      return;
    }

    if (!deepseekKey) {
      logger.warn("[Memory] Missing LLM API key, disabled");
      return;
    }

    try {
      // Redirect memory module logs through CHATBOT's logger for consistent format
      setCustomLogger(logger);

      // Apply config overrides
      if (memoryConfig.sqlite?.path) {
        process.env.SQLITE_PATH = memoryConfig.sqlite.path;
      }
      if (memoryConfig.redis?.url) {
        process.env.REDIS_URL = memoryConfig.redis.url;
      }

      getSqliteConnection();

      const messageRepo = new SqliteMessageRepository();
      const sessionRepo = new SqliteSessionRepository();
      const profileRepo = new SqliteProfileRepository();
      const summaryRepo = new SummaryRepository();
      const userIndexRepo = new SqliteUserIndexRepository();

      const bm25Service = new BM25Service();
      const memoryRepo = new VectraMemoryRepository(bm25Service);

      const embeddingProvider = new SiliconFlowEmbedding(siliconflowKey);
      const llmProvider = new DeepSeekLLM(deepseekKey);
      const lock = new MemoryLock();

      plugin = new MemoryPlugin({
        messageRepo,
        memoryRepo,
        summaryRepo,
        profileRepo,
        sessionRepo,
        userIndexRepo,
        embeddingProvider,
        llmProvider,
        lock,
        bm25Service,
      });

      await plugin.initialize();
      isEnabled = true;
      logger.info("[Memory] Initialized");
    } catch (error) {
      logger.error(`[Memory] Failed to initialize: ${error}`);
      isEnabled = false;
    }
  },

  async onUnload() {
    if (plugin) {
      await plugin.shutdown();
      plugin = null;
      isEnabled = false;
      lastUserMessage.clear();
    }
  },

  hooks: {
    beforeLLM: async (messages: LLMMessage[], event: Event): Promise<LLMMessage[]> => {
      if (!isEnabled || !plugin) {
        return messages;
      }

      const sessionId = buildSessionId(event);

      // Capture user message for afterLLM
      const userMsg = messages.find((m) => m.role === "user");
      if (userMsg) {
        lastUserMessage.set(event.userId, userMsg.content);
      }

      try {
        const result = await plugin.beforeChat({
          userId: event.userId,
          sessionId,
          userMessage: event.message,
          systemPrompt: messages.find((m) => m.role === "system")?.content ?? "",
        });

        return messages.map((m) =>
          m.role === "system" ? { ...m, content: result.systemPrompt } : m
        );
      } catch (error) {
        logger.error(`[Memory] beforeLLM failed: ${error}`);
        return messages;
      }
    },

    afterLLM: async (response: string, event: Event): Promise<string> => {
      if (!isEnabled || !plugin) {
        return response;
      }

      const sessionId = buildSessionId(event);
      const userMessage = lastUserMessage.get(event.userId) ?? event.message;

      // Fire-and-forget: don't block the response
      plugin.afterChat({
        userId: event.userId,
        sessionId,
        userMessage,
        assistantMessage: response,
      }).catch((error: unknown) => {
        logger.error(`[Memory] afterChat failed: ${error}`);
      });

      return response;
    },

    compressConversation: async (
      messages: Array<{ role: string; content: string }>,
      existingSummary: string
    ): Promise<string> => {
      if (!isEnabled || !plugin) {
        return existingSummary;
      }
      return plugin.compressConversation(messages, existingSummary);
    },
  } satisfies AIChatHooks,

  async handle() {
    // Memory plugin does not handle events directly
    return null;
  },
});
