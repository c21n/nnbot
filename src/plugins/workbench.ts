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
  WorkbenchCapabilitiesTool,
  WorkbenchKnowledgeTool,
  WorkbenchPerformanceTool,
  WorkbenchPatentAssistantTool,
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
        name: "workbench_capabilities",
        description: "查询工作台当前可用的只读能力",
        tags: ["workbench", "capabilities", "discovery"],
        keywords: [
          "能做什么", "可以做什么", "支持什么", "支持哪些", "有什么功能", "有哪些功能",
          "有哪些工具", "具备什么能力", "你能做", "功能清单", "能力清单", "能不能查", "能否查",
          "能不能导出", "能否导出", "能查", "可以查", "能查询", "可以查询", "能导出", "可以导出", "能匹配", "可以匹配",
        ],
        create: () => new WorkbenchCapabilitiesTool(client),
      },
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
      {
        name: "workbench_patent_assistant",
        description: "创建、校验、预览和生成工作台专利方案",
        tags: ["workbench", "patent", "proposal"],
        keywords: [
          "专利助手", "专利方案", "专利项目方案", "专利布局", "专利培育",
          "培育梯度", "小巨人方案", "专精特新培育", "生成专利方案",
          "方案预览", "案件校验", "案件材料", "生成 Word", "生成 PDF",
          "生成word", "生成pdf",
        ],
        create: () => new WorkbenchPatentAssistantTool(client),
      },
    ];

    for (const factory of factories) {
      services.toolRegistry.registerFactory(factory);
    }

    logger.info(`[workbench] Registered ${factories.length} API tool factories (${config.baseUrl})`);
  },
});
