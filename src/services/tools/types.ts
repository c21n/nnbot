/**
 * Tool Calling Types
 *
 * Core types for the tool calling system.
 * Inspired by AstrBot's unified result format, with improvements:
 * - Single ITool interface (no three-write-method confusion)
 * - Strategy pattern for schema conversion
 * - Structured ToolResult (not just string)
 */

import type { Event, ILLMService, IStorage, Config } from "../../interfaces.js";

// ============ Tool Definition ============

/**
 * Tool parameter definition (JSON Schema subset)
 */
export interface ToolParameter {
  type: "string" | "number" | "integer" | "boolean" | "array" | "object";
  description: string;
  /** Whether this parameter is optional. Default: false (required). */
  optional?: boolean;
  enum?: string[];
  items?: ToolParameter;
  properties?: Record<string, ToolParameter>;
  required?: string[];
}

/**
 * Tool execution result
 *
 * Unified return format for all tools (borrowed from AstrBot's CallToolResult).
 * Success/failure is explicit, not inferred from exceptions.
 */
export interface ToolResult {
  /** Whether the tool executed successfully */
  readonly success: boolean;
  /** Text result returned to LLM */
  readonly content: string;
  /** Optional: message sent directly to user (bypasses LLM) */
  readonly directMessage?: string;
  /** Optional: extra data for logging/debugging (not returned to LLM) */
  readonly metadata?: Record<string, unknown>;
}

/**
 * Tool execution context
 *
 * Passed to ITool.execute() so tools can access services.
 * Read-only to prevent tools from mutating shared state.
 */
export interface ToolContext {
  readonly event: Event;
  readonly llm: ILLMService;
  readonly storage: IStorage;
  readonly config: Config;
  readonly timeout: number;
}

/**
 * Tool definition interface
 *
 * All tools must implement this. Single interface, no confusion.
 * Borrowed from AstrBot's FunctionTool but simplified:
 * - No handler/callback alternative
 * - No is_background_task (Phase 2)
 * - active is a getter, not a field
 */
export interface ITool {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, ToolParameter>;
  readonly active: boolean;

  execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}

/**
 * Tool registry interface
 */
export interface IToolRegistry {
  register(tool: ITool): void;
  unregister(name: string): void;
  getTool(name: string): ITool | undefined;
  getActiveTools(): ITool[];
  getOpenAISchemas(): OpenAIToolSchema[];
  getAnthropicSchemas(): AnthropicToolSchema[];
}

// ============ LLM Tool Call ============

/**
 * Tool call request from LLM
 */
export interface LLMToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: Record<string, unknown>;
}

/**
 * LLM response with tool call support
 */
export interface LLMResponse {
  /** Text reply (when no tool calls) */
  readonly content: string | null;
  /** Tool call requests (when LLM wants to call tools) */
  readonly toolCalls: LLMToolCall[];
  /** Whether the response is final (no more tool calls) */
  readonly done: boolean;
}

// ============ Tool Loop ============

/**
 * Tool loop configuration
 */
export interface ToolLoopConfig {
  /** Max loop iterations (prevents infinite loops), default: 10 */
  readonly maxSteps?: number;
  /** Single tool call timeout in ms, default: 30000 */
  readonly toolTimeout?: number;
  /** Whether to log tool calls, default: true */
  readonly logToolCalls?: boolean;
}

// ============ Schema Formats ============

/**
 * OpenAI function calling schema
 */
export interface OpenAIToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

/**
 * Anthropic tool schema
 */
export interface AnthropicToolSchema {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}
