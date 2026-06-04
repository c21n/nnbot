/**
 * Schema Adapter
 *
 * Converts ITool definitions to LLM-provider-specific schemas.
 * Strategy pattern: each provider has its own conversion function.
 *
 * Borrowed from AstrBot's ToolSet.openai_schema() / anthropic_schema().
 * Improved: separate module, easy to add new providers.
 */

import type {
  ITool,
  ToolParameter,
  OpenAIToolSchema,
  AnthropicToolSchema,
} from "./types.js";

/**
 * Convert ITool to OpenAI function calling schema
 */
export function toolToOpenAISchema(tool: ITool): OpenAIToolSchema {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object",
        properties: convertParameters(tool.parameters),
        required: extractRequired(tool.parameters),
      },
    },
  };
}

/**
 * Convert ITool to Anthropic tool schema
 */
export function toolToAnthropicSchema(tool: ITool): AnthropicToolSchema {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: "object",
      properties: convertParameters(tool.parameters),
      required: extractRequired(tool.parameters),
    },
  };
}

/**
 * Convert ToolParameter map to JSON Schema properties
 */
function convertParameters(
  params: Record<string, ToolParameter>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [name, param] of Object.entries(params)) {
    result[name] = convertSingleParameter(param);
  }

  return result;
}

/**
 * Convert a single ToolParameter to JSON Schema
 */
function convertSingleParameter(param: ToolParameter): Record<string, unknown> {
  const schema: Record<string, unknown> = {
    type: param.type,
    description: param.description,
  };

  if (param.enum) {
    schema.enum = param.enum;
  }

  if (param.type === "array" && param.items) {
    schema.items = convertSingleParameter(param.items);
  }

  if (param.type === "object" && param.properties) {
    schema.properties = convertParameters(param.properties);
    if (param.required) {
      schema.required = param.required;
    }
  }

  return schema;
}

/**
 * Extract required field names from parameters
 * Only includes parameters where optional !== true
 */
function extractRequired(
  params: Record<string, ToolParameter>
): string[] | undefined {
  const required = Object.entries(params)
    .filter(([, param]) => param.optional !== true)
    .map(([name]) => name);
  return required.length > 0 ? required : undefined;
}
