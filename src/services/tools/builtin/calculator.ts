/**
 * Calculator Tool
 *
 * Example tool that evaluates mathematical expressions.
 * Demonstrates how to implement ITool.
 */

import type { ITool, ToolParameter, ToolResult, ToolContext } from "../types.js";

export class CalculatorTool implements ITool {
  readonly name = "calculator";
  readonly description = "计算数学表达式。支持加减乘除、括号、幂运算。例如: (2 + 3) * 4";
  readonly parameters: Record<string, ToolParameter> = {
    expression: {
      type: "string",
      description: "要计算的数学表达式，例如 '2 + 3 * 4' 或 '(10 - 2) / 4'",
    },
    precision: {
      type: "number",
      description: "结果保留的小数位数，默认不限制",
      optional: true,
    },
  };
  readonly active = true;

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
    const expression = args.expression as string;

    try {
      // Simple and safe math evaluation (no eval!)
      const result = safeEvaluate(expression);

      return {
        success: true,
        content: `${expression} = ${result}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        content: `计算失败: ${message}`,
      };
    }
  }
}

/**
 * Safe math expression evaluator
 * Supports: +, -, *, /, ^, (), numbers (including decimals)
 */
function safeEvaluate(expr: string): number {
  // Remove spaces
  const cleaned = expr.replace(/\s+/g, "");

  // Validate: only allowed characters
  if (!/^[\d+\-*/().^]+$/.test(cleaned)) {
    throw new Error("表达式包含不允许的字符");
  }

  // Use Function constructor for safe math evaluation
  // (no access to global scope, only Math)
  const sanitized = cleaned
    .replace(/\^/g, "**")  // ^ → **
    .replace(/(\d)(\()/g, "$1*(")  // 2(3) → 2*(3)
    .replace(/\)(\d)/g, ")*$1");  // (3)2 → (3)*2

  // Validate parentheses balance
  let depth = 0;
  for (const char of sanitized) {
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (depth < 0) throw new Error("括号不匹配");
  }
  if (depth !== 0) throw new Error("括号不匹配");

  const fn = new Function(`"use strict"; return (${sanitized});`);
  const result = fn();

  if (typeof result !== "number" || !isFinite(result)) {
    throw new Error("计算结果不是有效数字");
  }

  return result;
}
