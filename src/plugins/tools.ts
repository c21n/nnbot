/**
 * Tools Plugin
 *
 * Registers built-in tool factories with the tool registry.
 * Auto-loaded by PluginLoader from src/plugins/ directory.
 *
 * To add a new built-in tool:
 * 1. Create the tool class in src/services/tools/builtin/
 * 2. Add a factory in this plugin's onLoad()
 */

import { createPlugin } from "../core/create-plugin.js";
import { CalculatorTool } from "../services/tools/builtin/calculator.js";
import { WebSearchTool } from "../services/tools/builtin/web-search.js";
import type { IToolFactory } from "../services/tools/types.js";
import { logger } from "../core/logger.js";

export default createPlugin({
  name: "tools",
  description: "内置工具注册插件",

  // hooks 是必需的，添加空对象以满足 createPlugin 要求
  hooks: {},

  async onLoad(services) {
    // Calculator factory
    const calculatorFactory: IToolFactory = {
      name: "calculator",
      description: "数学计算器",
      tags: ["math"],
      keywords: ["计算", "多少", "加", "减", "乘", "除", "算一下", "calculate", "compute"],
      create: () => new CalculatorTool(),
    };
    services.toolRegistry.registerFactory(calculatorFactory);

    // Web search factory (only if enabled)
    const searchConfig = services.config.tools?.search;
    if (searchConfig?.enabled !== false) {
      const searchFactory: IToolFactory = {
        name: "web_search",
        description: "网页搜索",
        tags: ["search"],
        keywords: [
          "搜", "搜索", "查", "查询", "查找", "找一下", "搜一下",
          "search", "look up", "find",
          "最新", "新闻", "消息", "动态", "更新",
          "latest", "news", "update",
          "今天", "昨天", "最近", "现在", "目前",
          "today", "yesterday", "recent", "now", "current",
          "多少钱", "价格", "股价", "天气", "比分",
          "price", "stock", "weather", "score",
        ],
        create: () => new WebSearchTool({
          provider: (searchConfig?.provider as any) ?? "duckduckgo",
          apiKey: searchConfig?.apiKey ?? process.env.SERPAPI_API_KEY,
          defaultLimit: searchConfig?.defaultLimit ?? 5,
          region: searchConfig?.region,
          fallback: searchConfig?.fallback as any,
        }),
      };
      services.toolRegistry.registerFactory(searchFactory);
    }

    logger.info(`[tools] 已注册工具工厂`);
  },
});
