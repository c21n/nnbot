/**
 * Rule Match Plugin
 *
 * Handles messages using pattern matching and predefined replies.
 */

import type { IPlugin, Event, Response, Rule } from "../interfaces.js";
import { logger } from "../core/logger.js";

export class RuleMatchPlugin implements IPlugin {
  readonly name = "rule_match";
  readonly version = "1.0.0";
  readonly description = "规则匹配插件 - 基于正则的自动回复";

  private rules: Array<{ pattern: RegExp; reply: string }> = [];

  constructor(rules: Rule[]) {
    // Compile rules into RegExp
    for (const rule of rules) {
      try {
        this.rules.push({
          pattern: new RegExp(rule.pattern, "i"),
          reply: rule.reply,
        });
      } catch (error) {
        console.error(`Invalid rule pattern: ${rule.pattern}`, error);
      }
    }
  }

  async onLoad(): Promise<void> {
    console.log(`  Loaded ${this.rules.length} rules`);
  }

  async onUnload(): Promise<void> {
    // Nothing to cleanup
  }

  async handle(event: Event): Promise<Response | null> {
    // Skip commands (handled by admin plugin)
    if (event.message.startsWith("/")) {
      return null;
    }

    for (const rule of this.rules) {
      if (rule.pattern.test(event.message)) {
        logger.plugin("rule_match");

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
  }

  help(): string {
    const ruleList = this.rules
      .map((r) => `  - ${r.pattern.source}`)
      .join("\n");
    return `规则匹配插件\n已加载规则:\n${ruleList || "  (无)"}`;
  }
}
