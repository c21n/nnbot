/**
 * Memory Plugin
 *
 * Long-term memory via nniaomemory.
 * Provides AIChatHooks to inject memories into LLM context
 * and store conversations for memory extraction.
 */

import { createPlugin } from "../core/create-plugin.js";
import { PLUGIN_PRIORITY } from "../constants.js";
import { logger } from "../core/logger.js";
import type { AIChatHooks, LLMMessage, Event, PluginServices } from "../interfaces.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctor<T = unknown> = new (...args: any[]) => T;

interface MemoryModule {
  MemoryPlugin: Ctor;
  SiliconFlowEmbedding: Ctor;
  DeepSeekLLM: Ctor;
  MemoryLock: Ctor;
  getSqliteConnection: () => unknown;
  SqliteMessageRepository: Ctor;
  SqliteSessionRepository: Ctor;
  SqliteProfileRepository: Ctor;
  SummaryRepository: Ctor;
  SqliteUserIndexRepository: Ctor;
  ChromaMemoryRepository: Ctor;
  SqliteMemoryRepository: Ctor;
  ResilientMemoryRepository: Ctor;
}

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
  description: "Long-term memory via nniaomemory",
  priority: PLUGIN_PRIORITY.AI_CHAT - 1, // Before ai_chat

  async onLoad(services: PluginServices) {
    const config = services.config;
    const enabled = config.plugins.enabled.includes("memory");

    if (!enabled) {
      logger.info("[Memory] Disabled");
      return;
    }

    const siliconflowKey = process.env.SILICONFLOW_API_KEY ?? "";
    const deepseekKey = process.env.DEEPSEEK_API_KEY ?? "";

    if (!siliconflowKey || !deepseekKey) {
      logger.warn("[Memory] Missing API keys, disabled");
      return;
    }

    try {
      const mod = (await import("nniaomemory")) as unknown as MemoryModule;

      mod.getSqliteConnection();

      const messageRepo = new mod.SqliteMessageRepository();
      const sessionRepo = new mod.SqliteSessionRepository();
      const profileRepo = new mod.SqliteProfileRepository();
      const summaryRepo = new mod.SummaryRepository();
      const userIndexRepo = new mod.SqliteUserIndexRepository();

      const chromaRepo = new mod.ChromaMemoryRepository();
      const sqliteRepo = new mod.SqliteMemoryRepository();
      const memoryRepo = new mod.ResilientMemoryRepository(chromaRepo, sqliteRepo);

      const embeddingProvider = new mod.SiliconFlowEmbedding(siliconflowKey);
      const llmProvider = new mod.DeepSeekLLM(deepseekKey);
      const lock = new mod.MemoryLock();

      plugin = new mod.MemoryPlugin({
        messageRepo,
        memoryRepo,
        summaryRepo,
        profileRepo,
        sessionRepo,
        userIndexRepo,
        embeddingProvider,
        llmProvider,
        lock,
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
  } satisfies AIChatHooks,

  async handle() {
    // Memory plugin does not handle events directly
    return null;
  },
});
