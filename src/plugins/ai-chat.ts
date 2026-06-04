/**
 * AI Chat Plugin
 *
 * Handles conversations using LLM with context memory, persona, and summary compression.
 * Uses class format with createPlugin wrapper for compatibility with PluginLoader.
 */

import type {
  Event,
  Response,
  ILLMService,
  IStorage,
  LLMMessage,
  AIChatHooks,
  PluginServices,
} from "../interfaces.js";
import { PersonaService } from "../services/persona.js";
import { OpenAICompatibleService } from "../services/llm/openai.js";
import { createPlugin } from "../core/create-plugin.js";
import { PLUGIN_PRIORITY } from "../constants.js";
import { logger } from "../core/logger.js";
import { runToolLoop, type IToolRegistry, type ToolContext } from "../services/tools/index.js";
import { shouldEnableTools } from "../services/tools/tool-filter.js";


/**
 * AI Chat Plugin implementation
 * Uses class for complex internal state and methods
 */
class AIChatPluginImpl {
  readonly name = "ai_chat";
  readonly version = "1.0.0";
  readonly description = "AI 对话插件 - 支持上下文、人格设定、摘要压缩和工具调用";
  readonly priority = PLUGIN_PRIORITY.AI_CHAT;

  private persona!: PersonaService;
  private historyLimit!: number;
  private compressThreshold!: number;
  private llm!: ILLMService;
  private storage!: IStorage;
  private hooks: AIChatHooks = {};
  private toolRegistry!: IToolRegistry;
  private config!: PluginServices["config"];

  /**
   * Initialize plugin with services
   */
  async initialize(services: PluginServices): Promise<void> {
    this.storage = services.storage;
    this.persona = new PersonaService(services.storage);
    this.historyLimit = services.config.context?.historyLimit ?? 10;
    this.compressThreshold = services.config.context?.summaryCompressThreshold ?? 10;
    this.hooks = services.hooks;
    this.toolRegistry = services.toolRegistry;
    this.config = services.config;

    // Check for plugin-specific LLM config
    const pluginConfig = services.config.plugins?.ai_chat;
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
    } else {
      logger.info("[ai_chat] 使用默认 LLM 配置");
      this.llm = services.llm;
    }
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
      let contextMessages: Array<LLMMessage>;
      let summary = "";

      // Only compress when excess rounds exceed threshold
      const excessMessages = allHistory.length - messageLimit;
      const excessRounds = Math.floor(excessMessages / 2);
      if (excessRounds >= this.compressThreshold && this.hooks.compressConversation) {
        // Need to compress older messages
        const oldMessages = allHistory.slice(0, excessMessages);
        const newMessages = allHistory.slice(excessMessages);

        // Delegate compression to memory system
        summary = await this.hooks.compressConversation(oldMessages, "");

        // Build context with summary + recent messages
        contextMessages = [
          ...(summary ? [{ role: "user" as const, content: `[历史摘要] ${summary}` }] : []),
          ...newMessages.map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
        ] as LLMMessage[];

        logger.plugin("ai_chat", `压缩: ${excessRounds} 轮 → 摘要`);
      } else {
        // No compression needed
        contextMessages = allHistory.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }));
      }

      // Build messages array
      const messages: LLMMessage[] = [
        { role: "system", content: systemPrompt },
        ...contextMessages,
        { role: "user", content: `${userInfo}\n\n用户说: ${event.message}` },
      ];

      // Apply beforeLLM hook
      let finalMessages = messages;
      if (this.hooks.beforeLLM) {
        finalMessages = await this.hooks.beforeLLM(messages, event);
      }

      // Call LLM (with or without tools)
      const rounds = Math.floor(contextMessages.length / 2);
      logger.plugin("ai_chat", `上下文: ${rounds} 轮${summary ? ' + 摘要' : ''}`);

      let reply: string;
      const allActiveTools = this.toolRegistry.getActiveTools();
      const hasToolSupport = typeof this.llm.chatWithTools === "function";

      // Smart tool filtering based on user intent
      const toolFilter = shouldEnableTools(
        event.message,
        allActiveTools.map(t => t.name)
      );

      // Filter tools based on intent
      const activeTools = toolFilter.shouldUseTools
        ? allActiveTools.filter(t => toolFilter.filteredTools.includes(t.name))
        : [];

      if (hasToolSupport && activeTools.length > 0) {
        // Use tool loop
        logger.plugin("ai_chat", `工具调用已启用: ${activeTools.map((t) => t.name).join(", ")} (${toolFilter.reason})`);

        const toolContext: ToolContext = {
          event,
          llm: this.llm,
          storage: this.storage,
          config: this.config,
          timeout: 30000,  // default, overridden by ToolLoopConfig.toolTimeout if set
        };

        reply = await runToolLoop(
          finalMessages,
          activeTools,
          toolContext,
          { chatWithTools: (msgs, tools) => this.llm.chatWithTools!(msgs, tools) },
          { maxSteps: 10, toolTimeout: 30000, logToolCalls: true }
        );
      } else {
        // Plain chat (no tools)
        if (!toolFilter.shouldUseTools) {
          logger.plugin("ai_chat", `跳过工具: ${toolFilter.reason}`);
        }
        reply = await this.llm.chat(finalMessages);
      }

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

// Create plugin wrapper using createPlugin
const aiChatImpl = new AIChatPluginImpl();

export default createPlugin({
  name: "ai_chat",
  description: "AI 对话插件 - 支持上下文、人格设定和摘要压缩",
  priority: PLUGIN_PRIORITY.AI_CHAT,

  async onLoad(services) {
    await aiChatImpl.initialize(services);
  },

  async handle(event) {
    return aiChatImpl.handle(event);
  },

  help() {
    return aiChatImpl.help();
  },
});

// Export class for backward compatibility (admin plugin access)
export { AIChatPluginImpl as AIChatPlugin };
