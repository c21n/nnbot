/**
 * AI Workbench integration plugin.
 *
 * The plugin exposes read-only Workbench API capabilities as model tools.
 * Business logic remains in ai-workbench; nnbot only translates tool calls.
 */

import { createPlugin } from "../core/create-plugin.js";
import { logger } from "../core/logger.js";
import { WorkbenchApiClient } from "../services/workbench/client.js";
import {
  WorkbenchKnowledgeTool,
  WorkbenchPerformanceTool,
  WorkbenchPolicyMatchTool,
} from "../services/tools/builtin/workbench.js";
import type { IToolFactory } from "../services/tools/types.js";

export default createPlugin({
  name: "workbench",
  // This plugin only registers model tools and does not handle chat events.
  hooks: {},
  description: "智能业务工作台 API 工具",

  async onLoad(services) {
    const config = services.config.workbench;
    if (!config?.enabled) {
      logger.info("[workbench] Disabled in config");
      return;
    }

    const client = new WorkbenchApiClient(config);
    const factories: IToolFactory[] = [
      {
        name: "workbench_knowledge_search",
        description: "检索智能业务工作台知识库",
        tags: ["workbench", "knowledge", "search"],
        keywords: [
          "知识库", "公司制度", "制度", "流程", "内部资料", "业务资料",
          "年假", "报销", "合同", "专利资料", "项目资料", "申报材料",
        ],
        create: () => new WorkbenchKnowledgeTool(client),
      },
      {
        name: "workbench_policy_match",
        description: "匹配工作台政策项目",
        tags: ["workbench", "policy", "match"],
        keywords: ["匹配政策", "政策匹配", "能否申报", "能申报", "可申报", "申报资格", "申报项目"],
        create: () => new WorkbenchPolicyMatchTool(client),
      },
      {
        name: "workbench_performance_ranking",
        description: "查询工作台业绩排行榜",
        tags: ["workbench", "performance", "ranking"],
        keywords: ["排行榜", "业绩排名", "业绩榜", "业绩排行", "排名"],
        create: () => new WorkbenchPerformanceTool(client),
      },
    ];

    for (const factory of factories) {
      services.toolRegistry.registerFactory(factory);
    }

    logger.info(`[workbench] Registered ${factories.length} API tool factories (${config.baseUrl})`);
  },
});
