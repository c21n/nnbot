/**
 * Tool Executor
 *
 * Executes individual tool calls with:
 * - Parameter validation before execution
 * - Timeout protection
 * - Structured error handling
 * - Direct message support
 *
 * Borrowed from AstrBot's FunctionToolExecutor._execute_local().
 * Improved:
 * - Single execution path (no isinstance branching)
 * - Validation is separate module
 * - No agent construction in tool layer
 */

import type { ITool, LLMToolCall, ToolContext, ToolResult } from "./types.js";
import { validateParameters } from "./parameter-validator.js";
import { logger } from "../../core/logger.js";

/** Default tool call timeout in ms */
const DEFAULT_TIMEOUT = 30_000;

/**
 * Execute a single tool call
 *
 * @param tool - Tool to execute
 * @param toolCall - Tool call from LLM
 * @param context - Execution context
 * @returns Tool result
 */
export async function executeTool(
  tool: ITool,
  toolCall: LLMToolCall,
  context: ToolContext
): Promise<ToolResult> {
  const timeout = context.timeout || DEFAULT_TIMEOUT;

  // 1. Validate parameters
  const validation = validateParameters(tool, toolCall.arguments);
  if (!validation.valid) {
    const errorMessages = validation.errors.map((e) => e.message).join("; ");
    logger.warn(`[ToolExecutor] ${tool.name} 参数校验失败: ${errorMessages}`);
    return {
      success: false,
      content: `参数错误: ${errorMessages}`,
    };
  }

  // 2. Execute with timeout
  try {
    const result = await Promise.race([
      tool.execute(toolCall.arguments, context),
      timeoutError(timeout, tool.name),
    ]);

    // 3. Log result
    if (result.success) {
      logger.info(`[ToolExecutor] ${tool.name} 执行成功`);
    } else {
      logger.warn(`[ToolExecutor] ${tool.name} 执行失败: ${result.content}`);
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`[ToolExecutor] ${tool.name} 执行异常: ${message}`);
    return {
      success: false,
      content: `工具执行失败: ${message}`,
    };
  }
}

/**
 * Execute multiple tool calls concurrently
 *
 * Uses Promise.allSettled so one failure doesn't block others.
 * Returns results in the same order as input.
 */
export async function executeAllTools(
  tools: Map<string, ITool>,
  toolCalls: LLMToolCall[],
  context: ToolContext
): Promise<ToolResult[]> {
  const promises = toolCalls.map(async (call) => {
    const tool = tools.get(call.name);
    if (!tool) {
      logger.warn(`[ToolExecutor] 工具不存在: ${call.name}`);
      return {
        success: false,
        content: `工具 "${call.name}" 不存在。请检查可用工具列表。`,
      };
    }
    return executeTool(tool, call, context);
  });

  const results = await Promise.allSettled(promises);

  return results.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    }
    // Should not happen (executeTool catches all errors), but safety net
    logger.error(`[ToolExecutor] ${toolCalls[index].name} Promise rejected: ${result.reason}`);
    return {
      success: false,
      content: "工具执行异常",
    };
  });
}

/**
 * Create a timeout promise that rejects after ms milliseconds
 */
function timeoutError(ms: number, toolName: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`工具 "${toolName}" 执行超时 (${ms}ms)`));
    }, ms);
  });
}
