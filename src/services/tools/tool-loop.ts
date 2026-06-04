/**
 * Tool Loop
 *
 * The core loop that coordinates LLM and tool execution:
 *   1. Send messages + tools to LLM
 *   2. If LLM returns tool calls → execute them → append results → repeat
 *   3. If LLM returns text → done
 *
 * Borrowed from AstrBot's tool_loop_agent pattern.
 * Improved:
 * - Tool loop is a standalone module, not embedded in agent
 * - No agent construction inside tool layer
 * - Clean separation: LLM decides, tools execute, loop orchestrates
 */

import type { LLMMessage, ILLMService } from "../../interfaces.js";
import type {
  ITool,
  ToolContext,
  ToolLoopConfig,
  ToolResult,
} from "./types.js";
import { executeAllTools } from "./tool-executor.js";
import { logger } from "../../core/logger.js";

/** Default max steps */
const DEFAULT_MAX_STEPS = 10;

/**
 * Run the tool calling loop
 *
 * @param messages - Conversation history
 * @param tools - Available tools
 * @param context - Tool context
 * @param llm - LLM service (must have chatWithTools)
 * @param config - Loop configuration
 * @returns Final text response from LLM
 */
export async function runToolLoop(
  messages: LLMMessage[],
  tools: ITool[],
  context: ToolContext,
  llm: Pick<ILLMService, "chatWithTools">,
  config?: ToolLoopConfig
): Promise<string> {
  const maxSteps = config?.maxSteps ?? DEFAULT_MAX_STEPS;
  const logToolCalls = config?.logToolCalls ?? true;

  // Apply toolTimeout from config (overrides context.timeout)
  const effectiveContext: ToolContext = config?.toolTimeout
    ? { ...context, timeout: config.toolTimeout }
    : context;

  // Build tool map for fast lookup
  const toolMap = new Map<string, ITool>();
  for (const tool of tools) {
    toolMap.set(tool.name, tool);
  }

  // Working copy of messages (we'll append tool results)
  const workingMessages = [...messages];

  for (let step = 0; step < maxSteps; step++) {
    if (logToolCalls) {
      logger.info(`[ToolLoop] Step ${step + 1}/${maxSteps}`);
    }

    // 1. Call LLM
    const response = await llm.chatWithTools!(workingMessages, tools);

    // 2. If done (no tool calls), return the content
    if (response.done || response.toolCalls.length === 0) {
      if (logToolCalls) {
        logger.info(`[ToolLoop] LLM 返回最终回复`);
      }
      return response.content ?? "";
    }

    // 3. Execute tool calls
    if (logToolCalls) {
      const names = response.toolCalls.map((c) => c.name).join(", ");
      logger.info(`[ToolLoop] LLM 请求调用工具: ${names}`);
    }

    // Add assistant message with tool calls to history
    workingMessages.push({
      role: "assistant",
      content: response.content ?? "",
      toolCalls: response.toolCalls,
    });

    // Execute all tool calls
    const results = await executeAllTools(toolMap, response.toolCalls, effectiveContext);

    // 4. Handle direct messages (send to user via event)
    for (const result of results) {
      if (result.directMessage) {
        logger.info(`[ToolLoop] 工具发送直接消息: ${result.directMessage.slice(0, 50)}...`);
        // Store directMessage in metadata for ai-chat plugin to send
        // (ToolLoop doesn't own the event sending mechanism)
      }
    }

    // 5. Add tool results to messages
    for (let i = 0; i < response.toolCalls.length; i++) {
      const call = response.toolCalls[i];
      const result = results[i];

      workingMessages.push({
        role: "tool" as const,
        toolCallId: call.id,
        content: formatToolResult(result),
      });
    }
  }

  // Max steps reached
  logger.warn(`[ToolLoop] 达到最大步数 ${maxSteps}，停止循环`);
  return "抱歉，任务处理步骤过多，未能完成。请尝试简化你的请求。";
}

/**
 * Collect all direct messages from tool results
 * Called by ai-chat plugin to send to user after tool loop completes
 */
export function collectDirectMessages(results: ToolResult[]): string[] {
  return results
    .filter((r) => r.directMessage)
    .map((r) => r.directMessage!);
}

/**
 * Format tool result for LLM consumption
 *
 * Keeps it simple: just the content string.
 * Success/failure is indicated in the content itself.
 */
function formatToolResult(result: ToolResult): string {
  if (result.success) {
    return result.content;
  }
  return `[错误] ${result.content}`;
}
