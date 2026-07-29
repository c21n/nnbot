/**
 * Tool loop that coordinates LLM calls and local tool execution.
 */

import type { LLMChatOptions, LLMMessage } from "../../interfaces.js";
import type {
  ITool,
  ToolAttachment,
  ToolContext,
  ToolLoopConfig,
  ToolLoopResult,
  ToolResult,
} from "./types.js";
import { executeAllTools } from "./tool-executor.js";
import { logger } from "../../core/logger.js";
import { wrapToolDataForModel } from "../response-guard.js";

const DEFAULT_MAX_STEPS = 10;

export async function runToolLoop(
  messages: LLMMessage[],
  tools: ITool[],
  context: ToolContext,
  llm: { chatWithTools: (messages: LLMMessage[], tools: ITool[], options?: LLMChatOptions) => Promise<{
    content: string | null;
    toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
    done: boolean;
  }> },
  config?: ToolLoopConfig,
): Promise<ToolLoopResult> {
  const maxSteps = config?.maxSteps ?? DEFAULT_MAX_STEPS;
  const logToolCalls = config?.logToolCalls ?? true;
  const effectiveContext = config?.toolTimeout
    ? { ...context, timeout: config.toolTimeout }
    : context;
  const toolMap = new Map(tools.map((tool) => [tool.name, tool]));
  const workingMessages = [...messages];
  const attachments = new Map<string, ToolAttachment>();

  for (let step = 0; step < maxSteps; step += 1) {
    if (logToolCalls) logger.info(`[ToolLoop] Step ${step + 1}/${maxSteps}`);

    const response = await llm.chatWithTools(workingMessages, tools, {
      toolChoice: step === 0 && config?.requireToolCall ? "required" : "auto",
    });
    if (response.done || response.toolCalls.length === 0) {
      return {
        content: response.content ?? "",
        attachments: [...attachments.values()],
      };
    }

    if (logToolCalls) {
      logger.info(`[ToolLoop] Tool calls: ${response.toolCalls.map((call) => call.name).join(", ")}`);
    }

    workingMessages.push({
      role: "assistant",
      content: response.content ?? "",
      toolCalls: response.toolCalls,
    });

    const results = await executeAllTools(toolMap, response.toolCalls, effectiveContext);
    collectAttachments(results, attachments);

    for (let index = 0; index < response.toolCalls.length; index += 1) {
      const call = response.toolCalls[index];
      const result = results[index];
      workingMessages.push({
        role: "tool" as const,
        toolCallId: call.id,
        content: formatToolResult(result),
      });
    }
  }

  logger.warn(`[ToolLoop] Reached maximum steps: ${maxSteps}`);
  return {
    content: "抱歉，任务处理步骤过多，未能完成。请尝试简化你的请求。",
    attachments: [...attachments.values()],
  };
}

function collectAttachments(results: readonly ToolResult[], attachments: Map<string, ToolAttachment>): void {
  for (const result of results) {
    for (const attachment of result.attachments ?? []) {
      attachments.set(attachment.md5, attachment);
    }
  }
}

export function collectDirectMessages(results: ToolResult[]): string[] {
  return results
    .filter((result) => result.directMessage)
    .map((result) => result.directMessage!);
}

function formatToolResult(result: ToolResult): string {
  return wrapToolDataForModel(result.success ? result.content : `[工具错误] ${result.content}`);
}
