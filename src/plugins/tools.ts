/**
 * Tools Plugin
 *
 * Registers built-in tools with the tool registry.
 * Auto-loaded by PluginLoader from src/plugins/ directory.
 *
 * To add a new built-in tool:
 * 1. Create the tool class in src/services/tools/builtin/
 * 2. Import and register it in this plugin's onLoad()
 */

import { createPlugin } from "../core/create-plugin.js";
import { CalculatorTool } from "../services/tools/builtin/calculator.js";
import { WebSearchTool } from "../services/tools/builtin/web-search.js";
import type { ITool } from "../services/tools/types.js";
import { logger } from "../core/logger.js";

export default createPlugin({
  name: "tools",
  description: "内置工具注册插件",

  async onLoad(services) {
    const tools: ITool[] = [new CalculatorTool()];

    // 只有启用搜索功能时才注册搜索工具
    const searchConfig = services.config.tools?.search;
    if (searchConfig?.enabled !== false) {
      tools.push(
        new WebSearchTool({
          provider: (searchConfig?.provider as any) ?? "duckduckgo",
          apiKey: searchConfig?.apiKey ?? process.env.SERPAPI_API_KEY,
          defaultLimit: searchConfig?.defaultLimit ?? 5,
          region: searchConfig?.region,
          fallback: searchConfig?.fallback as any,
        })
      );
    }

    for (const tool of tools) {
      services.toolRegistry.register(tool);
    }

    logger.info(`[tools] 已注册 ${tools.length} 个内置工具`);
  },
});
