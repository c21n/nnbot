/**
 * Memory Adapter
 *
 * Bridges nniaomemory's MemoryPlugin to nnbot's AIChatHooks.
 * Injects long-term memories into LLM context and stores conversations for memory extraction.
 */

import type { AIChatHooks, LLMMessage, Event } from "../interfaces.js";
import { logger } from "../core/logger.js";

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

export interface MemoryAdapterConfig {
  enabled: boolean;
  siliconflowApiKey: string;
  deepseekApiKey: string;
}

export class MemoryAdapter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private plugin: any = null;
  private enabled: boolean;
  private lastUserMessage = new Map<string, string>();

  constructor(private config: MemoryAdapterConfig) {
    this.enabled = config.enabled;
  }

  async initialize(): Promise<void> {
    if (!this.enabled) {
      logger.info("[Memory] Disabled");
      return;
    }

    try {
      const mod = (await import("nniaomemory")) as unknown as MemoryModule;

      // Initialize storage (nniaomemory uses singletons, reads .env automatically)
      mod.getSqliteConnection();

      const messageRepo = new mod.SqliteMessageRepository();
      const sessionRepo = new mod.SqliteSessionRepository();
      const profileRepo = new mod.SqliteProfileRepository();
      const summaryRepo = new mod.SummaryRepository();
      const userIndexRepo = new mod.SqliteUserIndexRepository();

      // ChromaDB with SQLite fallback
      const chromaRepo = new mod.ChromaMemoryRepository();
      const sqliteRepo = new mod.SqliteMemoryRepository();
      const memoryRepo = new mod.ResilientMemoryRepository(chromaRepo, sqliteRepo);

      // External providers
      const embeddingProvider = new mod.SiliconFlowEmbedding(this.config.siliconflowApiKey);
      const llmProvider = new mod.DeepSeekLLM(this.config.deepseekApiKey);
      const lock = new mod.MemoryLock();

      this.plugin = new mod.MemoryPlugin({
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

      await this.plugin.initialize();
      logger.info("[Memory] Initialized");
    } catch (error) {
      logger.error("[Memory] Failed to initialize", error);
      this.enabled = false;
    }
  }

  async shutdown(): Promise<void> {
    if (this.plugin) {
      await this.plugin.shutdown();
    }
  }

  /**
   * Generate AIChatHooks for AIChatPlugin.
   */
  getHooks(): AIChatHooks {
    if (!this.enabled || !this.plugin) {
      return {};
    }

    return {
      beforeLLM: async (messages: LLMMessage[], event: Event) => {
        return this.beforeLLM(messages, event);
      },
      afterLLM: async (response: string, event: Event) => {
        return this.afterLLM(response, event);
      },
    };
  }

  /**
   * Get the underlying MemoryPlugin (for admin commands, etc.)
   */
  getPlugin() {
    return this.plugin;
  }

  // ---- hooks ----

  private async beforeLLM(messages: LLMMessage[], event: Event): Promise<LLMMessage[]> {
    const sessionId = this.buildSessionId(event);

    // Capture user message for afterLLM
    const userMsg = messages.find((m) => m.role === "user");
    if (userMsg) {
      this.lastUserMessage.set(event.userId, userMsg.content);
    }

    try {
      const result = await this.plugin!.beforeChat({
        userId: event.userId,
        sessionId,
        userMessage: event.message,
        systemPrompt: messages.find((m) => m.role === "system")?.content ?? "",
      });

      // Replace system prompt with memory-enhanced version
      return messages.map((m) =>
        m.role === "system"
          ? { ...m, content: result.systemPrompt }
          : m
      );
    } catch (error) {
      logger.error("[Memory] beforeLLM failed", error);
      return messages;
    }
  }

  private async afterLLM(response: string, event: Event): Promise<string> {
    const sessionId = this.buildSessionId(event);
    const userMessage = this.lastUserMessage.get(event.userId) ?? event.message;

    // Fire-and-forget: don't block the response
    this.plugin!.afterChat({
      userId: event.userId,
      sessionId,
      userMessage,
      assistantMessage: response,
    }).catch((error: unknown) => {
      logger.error("[Memory] afterChat failed", error);
    });

    return response;
  }

  /**
   * Build a stable sessionId from event context.
   * Groups messages by user + day for memory retrieval and summary generation.
   */
  private buildSessionId(event: Event): string {
    const date = new Date(event.timestamp).toISOString().slice(0, 10);
    const scope = event.groupId ? `group:${event.groupId}` : "private";
    return `${event.userId}:${scope}:${date}`;
  }
}
