/**
 * AI Chat Plugin
 *
 * Handles conversations using LLM with context memory, persona, and summary compression.
 */

import type {
  IPlugin,
  Event,
  Response,
  ILLMService,
  IConversationStorage,
  Config,
  AIChatHooks,
} from "../interfaces.js";
import { PersonaService } from "../services/persona.js";
import { OpenAICompatibleService } from "../services/llm/openai.js";
import { logger } from "../core/logger.js";

const SUMMARY_PROMPT = `请将以下对话压缩成一段简短的摘要，保留关键信息（用户的需求、重要的事实、结论等）。
摘要应该简洁，不超过100字。
只输出摘要，不要其他内容。

对话内容：`;

export class AIChatPlugin implements IPlugin {
  readonly name = "ai_chat";
  readonly version = "1.0.0";
  readonly description = "AI 对话插件 - 支持上下文、人格设定和摘要压缩";

  private persona: PersonaService;
  private historyLimit: number;
  private kvStorage: { get: (key: string) => Promise<unknown | null>; set: (key: string, value: unknown) => Promise<void>; delete: (key: string) => Promise<void> };
  private llm: ILLMService;
  private summaryLlm: ILLMService;

  constructor(
    defaultLlm: ILLMService,
    private storage: IConversationStorage,
    kvStorage: { get: (key: string) => Promise<unknown | null>; set: (key: string, value: unknown) => Promise<void>; delete: (key: string) => Promise<void> },
    private config: Config,
    private hooks: AIChatHooks = {}
  ) {
    this.persona = new PersonaService(kvStorage);
    this.historyLimit = config.context?.historyLimit ?? 10;
    this.kvStorage = kvStorage;

    // Check for plugin-specific LLM config
    const pluginConfig = config.plugins?.ai_chat;
    if (pluginConfig?.llm) {
      logger.info("[ai_chat] 使用独立 LLM 配置");
      this.llm = new OpenAICompatibleService(
        pluginConfig.llm.baseUrl,
        pluginConfig.llm.apiKey,
        {
          model: pluginConfig.llm.model,
          temperature: pluginConfig.llm.temperature,
          maxTokens: pluginConfig.llm.maxTokens,
        }
      );
      this.summaryLlm = this.llm;
    } else {
      logger.info("[ai_chat] 使用默认 LLM 配置");
      this.llm = defaultLlm;
      this.summaryLlm = defaultLlm;
    }
  }

  async onLoad(): Promise<void> {
    // Nothing to initialize
  }

  async onUnload(): Promise<void> {
    // Nothing to cleanup
  }

  async handle(event: Event): Promise<Response | null> {
    // Skip commands (handled by admin plugin)
    if (event.message.startsWith("/")) {
      return null;
    }

    // Only handle direct messages (not group messages)
    // Group messages require @mention to trigger
    if (event.groupId && !event.message.startsWith("@")) {
      return null;
    }

    try {
      // Get persona for this user
      const systemPrompt = await this.persona.getPersona(event.userId);

      // Build user info context
      const userInfo = this.buildUserInfo(event);

      // Get conversation history
      const messageLimit = this.historyLimit * 2;
      const allHistory = await this.storage.getHistory(event.userId, 100); // Get more for compression

      // Compress if needed
      let contextMessages: Array<{ role: "user" | "assistant"; content: string }>;
      let summary = await this.getSummary(event.userId);

      if (allHistory.length > messageLimit) {
        // Need to compress older messages
        const oldMessages = allHistory.slice(0, allHistory.length - messageLimit);
        const newMessages = allHistory.slice(allHistory.length - messageLimit);

        // Generate summary of old messages
        const newSummary = await this.generateSummary(oldMessages, summary);

        // Save new summary
        await this.saveSummary(event.userId, newSummary);
        summary = newSummary;

        // Build context with summary + recent messages
        contextMessages = [
          ...(summary ? [{ role: "user" as const, content: `[历史摘要] ${summary}` }] : []),
          ...newMessages.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        ];

        logger.plugin("ai_chat", `压缩: ${oldMessages.length} 条 → 摘要`);
        logger.debug(`[摘要] ${summary}`);
      } else {
        // No compression needed
        contextMessages = allHistory.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));
      }

      // Build messages array
      const messages = [
        { role: "system" as const, content: systemPrompt },
        ...contextMessages,
        { role: "user" as const, content: `${userInfo}\n\n用户说: ${event.message}` },
      ];

      // Apply beforeLLM hook
      let finalMessages = messages;
      if (this.hooks.beforeLLM) {
        finalMessages = await this.hooks.beforeLLM(messages, event);
      }

      // Call LLM
      const rounds = Math.floor(contextMessages.length / 2);
      logger.plugin("ai_chat", `上下文: ${rounds} 轮${summary ? ' + 摘要' : ''}`);
      let reply = await this.llm.chat(finalMessages);

      // Apply afterLLM hook
      if (this.hooks.afterLLM) {
        reply = await this.hooks.afterLLM(reply, event);
      }

      // Save conversation
      await this.storage.saveMessage(event.userId, "user", event.message);
      await this.storage.saveMessage(event.userId, "assistant", reply);

      return {
        content: reply,
        replyTo: true,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`\x1b[31m[AI] LLM call failed: ${msg}\x1b[0m`);
      return null;
    }
  }

  help(): string {
    return "直接发送消息即可与 AI 对话。支持上下文记忆、人格设定和摘要压缩。";
  }

  /**
   * Get persona service (for admin plugin)
   */
  getPersonaService(): PersonaService {
    return this.persona;
  }

  /**
   * Get saved summary
   */
  private async getSummary(userId: string): Promise<string> {
    const summary = await this.kvStorage.get(`summary:${userId}`);
    return (summary as string) || "";
  }

  /**
   * Save summary
   */
  private async saveSummary(userId: string, summary: string): Promise<void> {
    await this.kvStorage.set(`summary:${userId}`, summary);
  }

  /**
   * Generate summary from old messages
   */
  private async generateSummary(
    messages: Array<{ role: string; content: string }>,
    existingSummary: string
  ): Promise<string> {
    // Format messages for summary
    const conversationText = messages
      .map((m) => `${m.role === "user" ? "用户" : "助手"}: ${m.content}`)
      .join("\n");

    // Include existing summary if available
    const prompt = existingSummary
      ? `${SUMMARY_PROMPT}\n之前的摘要: ${existingSummary}\n\n新的对话:\n${conversationText}`
      : `${SUMMARY_PROMPT}\n${conversationText}`;

    try {
      const summary = await this.summaryLlm.chat([
        { role: "user", content: prompt }
      ]);
      return summary.trim();
    } catch (error) {
      logger.error("生成摘要失败");
      return existingSummary;
    }
  }

  /**
   * Build user info context for LLM
   */
  private buildUserInfo(event: Event): string {
    const parts: string[] = [];

    parts.push(`[用户信息]`);
    parts.push(`用户ID: ${event.userId}`);
    parts.push(`昵称: ${event.nickname}`);

    if (event.groupId) {
      parts.push(`群组ID: ${event.groupId}`);
      if (event.groupName) {
        parts.push(`群组名: ${event.groupName}`);
      }
      parts.push(`场景: 群聊`);
    } else {
      parts.push(`场景: 私聊`);
    }

    return parts.join("\n");
  }
}
