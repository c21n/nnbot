/**
 * Tool Calling Module
 *
 * Public API for the tool calling system.
 */

// Types
export type {
  ToolParameter,
  ToolResult,
  ToolAttachment,
  ToolLoopResult,
  ToolContext,
  ITool,
  IToolFactory,
  IToolRegistry,
  LLMToolCall,
  LLMResponse,
  ToolLoopConfig,
  OpenAIToolSchema,
  AnthropicToolSchema,
} from "./types.js";

// Constants
export { GLOBAL_EXCLUDE_PATTERNS } from "./types.js";

// Core modules
export { ToolRegistry, toolRegistry } from "./tool-registry.js";
export { executeTool, executeAllTools } from "./tool-executor.js";
export { runToolLoop, collectDirectMessages } from "./tool-loop.js";
export { validateParameters } from "./parameter-validator.js";
export type { ValidationError, ValidationResult } from "./parameter-validator.js";
export { toolToOpenAISchema, toolToAnthropicSchema } from "./schema-adapter.js";
