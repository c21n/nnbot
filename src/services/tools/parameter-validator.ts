/**
 * Parameter Validator
 *
 * Validates tool call arguments against tool parameter definitions.
 * Catches invalid arguments before they reach tool.execute().
 *
 * This is what AstrBot lacks — AstrBot's tools do their own validation,
 * leading to inconsistent error messages.
 */

import type { ITool, ToolParameter } from "./types.js";

export interface ValidationError {
  readonly field: string;
  readonly message: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ValidationError[];
}

/**
 * Validate tool call arguments against tool parameter definitions
 *
 * @param tool - Tool definition
 * @param args - Arguments from LLM
 * @returns Validation result
 */
export function validateParameters(
  tool: ITool,
  args: Record<string, unknown>
): ValidationResult {
  const errors: ValidationError[] = [];

  // Check parameters
  for (const [name, param] of Object.entries(tool.parameters)) {
    const value = args[name];

    // Skip optional parameters that are missing
    if ((value === undefined || value === null) && param.optional === true) {
      continue;
    }

    // Required parameter missing
    if (value === undefined || value === null) {
      errors.push({ field: name, message: `缺少必填参数: ${name}` });
      continue;
    }

    // Type check
    const typeError = validateType(name, value, param);
    if (typeError) {
      errors.push(typeError);
    }
  }

  // Check for unknown parameters (warn only, don't fail)
  for (const key of Object.keys(args)) {
    if (!(key in tool.parameters)) {
      // Not an error — LLM might pass extra args, just ignore them
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate a single value against its type definition
 */
function validateType(
  field: string,
  value: unknown,
  param: ToolParameter
): ValidationError | null {
  switch (param.type) {
    case "string":
      if (typeof value !== "string") {
        return { field, message: `${field} 应为字符串，实际为 ${typeof value}` };
      }
      if (param.enum && !param.enum.includes(value)) {
        return {
          field,
          message: `${field} 的值 "${value}" 不在允许范围内: ${param.enum.join(", ")}`,
        };
      }
      return null;

    case "number":
    case "integer":
      if (typeof value !== "number") {
        return { field, message: `${field} 应为数字，实际为 ${typeof value}` };
      }
      if (param.type === "integer" && !Number.isInteger(value)) {
        return { field, message: `${field} 应为整数` };
      }
      return null;

    case "boolean":
      if (typeof value !== "boolean") {
        return { field, message: `${field} 应为布尔值，实际为 ${typeof value}` };
      }
      return null;

    case "array":
      if (!Array.isArray(value)) {
        return { field, message: `${field} 应为数组，实际为 ${typeof value}` };
      }
      if (param.items) {
        for (let i = 0; i < value.length; i++) {
          const itemError = validateType(`${field}[${i}]`, value[i], param.items);
          if (itemError) return itemError;
        }
      }
      return null;

    case "object":
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return { field, message: `${field} 应为对象` };
      }
      if (param.properties) {
        const obj = value as Record<string, unknown>;
        for (const [propName, propParam] of Object.entries(param.properties)) {
          if (propName in obj) {
            const propError = validateType(`${field}.${propName}`, obj[propName], propParam);
            if (propError) return propError;
          }
        }
      }
      return null;

    default:
      return null;
  }
}
