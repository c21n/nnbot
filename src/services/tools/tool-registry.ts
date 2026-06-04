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

import type { ITool, IToolRegistry, OpenAIToolSchema, AnthropicToolSchema } from "./types.js";
import { toolToOpenAISchema, toolToAnthropicSchema } from "./schema-adapter.js";
import { logger } from "../../core/logger.js";

export class ToolRegistry implements IToolRegistry {
  private readonly tools = new Map<string, ITool>();

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
  }

  getTool(name: string): ITool | undefined {
    return this.tools.get(name);
  }

  getActiveTools(): ITool[] {
    return Array.from(this.tools.values()).filter((t) => t.active);
  }

  getOpenAISchemas(): OpenAIToolSchema[] {
    return this.getActiveTools().map(toolToOpenAISchema);
  }

  getAnthropicSchemas(): AnthropicToolSchema[] {
    return this.getActiveTools().map(toolToAnthropicSchema);
  }
}

/**
 * Global singleton tool registry
 *
 * Plugins register tools here during onLoad().
 * ai-chat plugin reads from here before each LLM call.
 */
export const toolRegistry = new ToolRegistry();
