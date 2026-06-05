/**
 * Tool Registry
 *
 * Central registry for all tools. Tools register here, and the tool loop
 * queries active tools before each LLM call.
 *
 * Borrowed from AstrBot:
 * - Conditional activation (tools can be disabled by config)
 * - Single registry accessed by all components
 *
 * Improved:
 * - No decorator magic, just register() calls
 * - getActiveTools() filters at query time, not registration time
 */

import type { ITool, IToolFactory, IToolRegistry, OpenAIToolSchema, AnthropicToolSchema } from "./types.js";
import { GLOBAL_EXCLUDE_PATTERNS } from "./types.js";
import { toolToOpenAISchema, toolToAnthropicSchema } from "./schema-adapter.js";
import { logger } from "../../core/logger.js";

export class ToolRegistry implements IToolRegistry {
  private readonly tools = new Map<string, ITool>();
  private readonly factories = new Map<string, IToolFactory>();
  private readonly factoryCache = new Map<string, ITool>();

  register(tool: ITool): void {
    if (this.tools.has(tool.name)) {
      logger.warn(`[ToolRegistry] Overwriting existing tool: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
    logger.info(`[ToolRegistry] Registered tool: ${tool.name} (active=${tool.active})`);
  }

  unregister(name: string): void {
    if (this.tools.delete(name)) {
      logger.info(`[ToolRegistry] Unregistered tool: ${name}`);
    }
    // Also clear factory and cache
    if (this.factories.has(name)) {
      this.factories.delete(name);
      this.factoryCache.delete(name);
      logger.info(`[ToolRegistry] Unregistered factory: ${name}`);
    }
  }

  getTool(name: string): ITool | undefined {
    return this.tools.get(name) ?? this.factoryCache.get(name);
  }

  getActiveTools(): ITool[] {
    const directTools = Array.from(this.tools.values()).filter((t) => t.active);
    const cachedTools = Array.from(this.factoryCache.values()).filter((t) => t.active);
    // Merge, avoiding duplicates (direct tools take precedence)
    const seen = new Set(directTools.map(t => t.name));
    return [...directTools, ...cachedTools.filter(t => !seen.has(t.name))];
  }

  getOpenAISchemas(): OpenAIToolSchema[] {
    return this.getActiveTools().map(toolToOpenAISchema);
  }

  getAnthropicSchemas(): AnthropicToolSchema[] {
    return this.getActiveTools().map(toolToAnthropicSchema);
  }

  registerFactory(factory: IToolFactory): void {
    if (this.factories.has(factory.name)) {
      logger.warn(`[ToolRegistry] Overwriting existing factory: ${factory.name}`);
      // Clear cache when factory is overwritten
      this.factoryCache.delete(factory.name);
    }
    this.factories.set(factory.name, factory);
    logger.info(`[ToolRegistry] Registered factory: ${factory.name} (keywords=${factory.keywords.join(",")})`);
  }

  async getToolsForIntent(message: string): Promise<ITool[]> {
    const msg = message.trim();

    // Global exclude check
    if (msg === "" || GLOBAL_EXCLUDE_PATTERNS.some(p => p.test(msg))) {
      return [];
    }

    const matched: ITool[] = [];

    for (const factory of this.factories.values()) {
      // Check keywords (case-insensitive contains match)
      const triggered = factory.keywords.some(kw => msg.toLowerCase().includes(kw.toLowerCase()));
      if (!triggered) continue;

      // Check cache first
      const cached = this.factoryCache.get(factory.name);
      if (cached) {
        matched.push(cached);
        continue;
      }

      // Lazy instantiation
      try {
        const tool = await factory.create();
        this.factoryCache.set(factory.name, tool);
        matched.push(tool);
        logger.info(`[ToolRegistry] Lazy-created tool: ${factory.name}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`[ToolRegistry] Failed to create tool from factory ${factory.name}: ${msg}`);
        // Skip this factory, continue with others
      }
    }

    return matched;
  }
}

/**
 * Global singleton tool registry
 *
 * Plugins register tools here during onLoad().
 * ai-chat plugin reads from here before each LLM call.
 */
export const toolRegistry = new ToolRegistry();
