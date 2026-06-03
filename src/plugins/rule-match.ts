/**
 * Rule Match Plugin
 *
 * Handles messages using pattern matching and predefined replies.
 * Uses createPlugin factory for v2 plugin format.
 */

import { createPlugin } from "../core/create-plugin.js";
import { PLUGIN_PRIORITY } from "../constants.js";
import type { Rule } from "../interfaces.js";

/**
 * Compile rules into RegExp patterns
 * Returns compiled rules or empty array on error
 */
function compileRules(rules: Rule[]): Array<{ pattern: RegExp; reply: string }> {
  const compiled: Array<{ pattern: RegExp; reply: string }> = [];

  for (const rule of rules) {
    try {
      compiled.push({
        pattern: new RegExp(rule.pattern, "i"),
        reply: rule.reply,
      });
    } catch (error) {
      console.error(`Invalid rule pattern: ${rule.pattern}`, error);
    }
  }

  return compiled;
}

export default createPlugin({
  name: "rule_match",
  description: "规则匹配插件 - 基于正则的自动回复",
  priority: PLUGIN_PRIORITY.RULE_MATCH,

  async handle(event, { config }) {
    // Skip commands (handled by admin plugin)
    if (event.message.startsWith("/")) {
      return null;
    }

    // Compile rules from config
    const rules = compileRules(config.rules);

    // Match rules
    for (const rule of rules) {
      if (rule.pattern.test(event.message)) {
        // Simple variable replacement
        const reply = rule.reply
          .replace("{time}", new Date().toLocaleTimeString("zh-CN"))
          .replace("{date}", new Date().toLocaleDateString("zh-CN"))
          .replace("{user}", event.userId);

        return {
          content: reply,
          replyTo: false,
        };
      }
    }

    return null;
  },

  help() {
    return `规则匹配插件
基于正则表达式的自动回复
支持变量: {time}, {date}, {user}`;
  },
});
