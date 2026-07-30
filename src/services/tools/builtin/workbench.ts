import type { ITool, ToolAttachment, ToolContext, ToolParameter, ToolResult } from "../types.js";
import { WorkbenchApiClient, type WorkbenchApiError } from "../../workbench/client.js";

const MAX_KNOWLEDGE_LIMIT = 10;
const MAX_POLICY_RESULTS = 20;
const MAX_POLICY_EVIDENCE = 30;
const MAX_RANKING_ROWS = 50;

const optionalText = (description: string): ToolParameter => ({
  type: "string",
  description,
  optional: true,
});

const optionalNumber = (description: string): ToolParameter => ({
  type: "number",
  description,
  optional: true,
});

const companyProfileProperties: Record<string, ToolParameter> = {
  region: { type: "string", description: "企业所在地区，例如广州、深圳。", optional: true },
  district: { type: "string", description: "企业所在区县。", optional: true },
  industry: { type: "string", description: "企业所属行业。", optional: true },
  annualRevenue: { type: "number", description: "企业年营业收入。", optional: true },
  employeeCount: { type: "number", description: "企业员工人数。", optional: true },
  inventionPatentCount: { type: "number", description: "发明专利数量。", optional: true },
  validPatentCount: { type: "number", description: "有效专利数量。", optional: true },
  highTechEnterprise: { type: "boolean", description: "是否为高新技术企业。", optional: true },
  specializedInnovativeEnterprise: { type: "boolean", description: "是否为专精特新企业。", optional: true },
  smallMediumEnterprise: { type: "boolean", description: "是否为中小企业。", optional: true },
};

export class WorkbenchCapabilitiesTool implements ITool {
  readonly name = "workbench_capabilities";
  readonly description = "查询当前智能业务工作台通过 API 提供的可用能力。用户询问机器人能做什么、支持什么或能否执行某项工作时必须先调用。";
  readonly parameters: Record<string, ToolParameter> = {};
  readonly active = true;

  constructor(private readonly client: WorkbenchApiClient) {}

  async execute(_args: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
    try {
      const result = await this.client.getCapabilities();
      return success(JSON.stringify(result, null, 2), {
        capabilityCount: result.capabilities.length,
        readOnly: result.readOnly,
      });
    } catch (error) {
      return workbenchFailure(error);
    }
  }
}

export class WorkbenchKnowledgeTool implements ITool {
  readonly name = "workbench_knowledge_search";
  readonly description = "检索智能业务工作台知识库中的公司制度、业务流程、政策、项目和专利资料。返回证据供主 Agent 组织回答。";
  readonly parameters: Record<string, ToolParameter> = {
    query: {
      type: "string",
      description: "明确的中文检索问题，追问时补全主题。",
    },
    limit: {
      type: "integer",
      description: "返回证据数量，默认 6，最多 10。",
      optional: true,
    },
  };
  readonly active = true;

  constructor(private readonly client: WorkbenchApiClient) {}

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
    const query = typeof args.query === "string" ? args.query.trim() : "";
    if (!query) return failure("知识库检索问题不能为空。");

    const limit = normalizeLimit(args.limit);
    try {
      const result = await this.client.searchKnowledge(query, limit);
      return success(JSON.stringify(result, null, 2), {
        resultCount: result.results.length,
      });
    } catch (error) {
      return workbenchFailure(error);
    }
  }
}

export class WorkbenchPolicyMatchTool implements ITool {
  readonly name = "workbench_policy_match";
  readonly description = "根据企业已知信息匹配智能业务工作台中已审核的政策项目，返回可申报判断、条件缺口、风险和证据。缺少信息时不要猜测。";
  readonly parameters: Record<string, ToolParameter> = {
    companyProfile: {
      type: "object",
      description: "企业基础信息，只填写用户明确提供的信息；缺少信息可以传空对象。",
      properties: companyProfileProperties,
      optional: true,
    },
    filters: {
      type: "object",
      description: "可选筛选条件。",
      properties: {
        region: { type: "string", description: "地区筛选。", optional: true },
        projectTypes: {
          type: "array",
          description: "项目类型筛选。",
          items: { type: "string", description: "项目类型。" },
          optional: true,
        },
        asOfDate: { type: "string", description: "判断日期，格式 YYYY-MM-DD。", optional: true },
      },
      optional: true,
    },
  };
  readonly active = true;

  constructor(private readonly client: WorkbenchApiClient) {}

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
    const companyProfile = asRecord(args.companyProfile) ?? {};
    const filters = asRecord(args.filters) ?? {};

    try {
      const result = await this.client.matchPolicyProjects(companyProfile, filters);
      const compact = {
        ...result,
        results: result.results.slice(0, MAX_POLICY_RESULTS),
        evidence: result.evidence?.slice(0, MAX_POLICY_EVIDENCE),
      };
      return success(JSON.stringify(compact, null, 2), {
        total: result.total,
        returnedResults: compact.results.length,
      });
    } catch (error) {
      return workbenchFailure(error);
    }
  }
}

export class WorkbenchPerformanceTool implements ITool {
  readonly name = "workbench_performance_ranking";
  readonly description = "查询智能业务工作台的团队或个人业绩排行榜，可按月份、地区和团队筛选。";
  readonly parameters: Record<string, ToolParameter> = {
    scope: {
      type: "string",
      description: "榜单范围，默认 teams；需要同时查看团队和个人时使用 both。",
      enum: ["teams", "people", "both"],
      optional: true,
    },
    batchId: { type: "string", description: "业绩批次 ID。", optional: true },
    region: { type: "string", description: "地区筛选。", optional: true },
    team: { type: "string", description: "团队筛选。", optional: true },
  };
  readonly active = true;

  constructor(private readonly client: WorkbenchApiClient) {}

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
    const scope = args.scope === "people" || args.scope === "both" ? args.scope : "teams";
    const filters = pickStringFilters(args, ["batchId", "region", "team"]);

    try {
      const rankingResults = scope === "both"
        ? await Promise.all([
            this.client.getPerformanceRankings("teams", filters),
            this.client.getPerformanceRankings("people", filters),
          ])
        : [await this.client.getPerformanceRankings(scope, filters)];

      const payload = scope === "both"
        ? {
            teams: rankingResults[0].rows.slice(0, MAX_RANKING_ROWS),
            people: rankingResults[1].rows.slice(0, MAX_RANKING_ROWS),
          }
        : {
            [scope]: rankingResults[0].rows.slice(0, MAX_RANKING_ROWS),
          };

      const imageViews: Array<"teams" | "people"> = scope === "both" ? ["teams", "people"] : [scope];
      const imageResults = await Promise.all(
        imageViews.map((imageView) => this.client.getPerformanceRankingImage(imageView, filters)),
      );
      const attachments: ToolAttachment[] = imageResults.map((image) => ({
        type: "image",
        base64: image.base64,
        md5: image.md5,
        fileName: image.fileName,
        contentType: image.contentType,
      }));

      return success(JSON.stringify({
        ...payload,
        imageExport: {
          generated: true,
          format: "png",
          count: attachments.length,
          note: "The generated image will be sent with the final channel response.",
        },
      }, null, 2), {
        scope,
        filters,
        imageCount: attachments.length,
      }, attachments);
    } catch (error) {
      return workbenchFailure(error);
    }
  }
}

const patentCaseDataProperties: Record<string, ToolParameter> = {
  companyProfile: {
    type: "object",
    description: "企业画像，只填写用户明确提供的事实。",
    optional: true,
    properties: {
      companyName: optionalText("企业名称。"),
      location: optionalText("注册地或主要经营地。"),
      industry: optionalText("所属行业。"),
      mainProducts: optionalText("主营产品或业务。"),
      coreTechnology: optionalText("核心技术。"),
      contactContext: optionalText("本次沟通背景。"),
      foundedDate: optionalText("成立时间。"),
      registeredCapital: optionalText("注册资本。"),
      targetCustomers: optionalText("目标客户。"),
      marketPosition: optionalText("市场地位或竞争情况。"),
      productRevenueProfile: optionalText("产品收入结构。"),
    },
  },
  financialProfile: {
    type: "object",
    description: "经营和财务信息；金额口径由用户提供并保持原单位。",
    optional: true,
    properties: {
      summary: optionalText("经营、财务与研发概况。"),
      annualMetrics: {
        type: "array",
        description: "年度经营指标，通常填写近三年。",
        optional: true,
        items: {
          type: "object",
          description: "单年度经营指标。",
          properties: {
            year: optionalText("年份。"),
            revenue: optionalNumber("营业收入。"),
            netProfit: optionalNumber("净利润。"),
            netAssets: optionalNumber("净资产。"),
            debtRatio: optionalNumber("资产负债率，百分比数值。"),
            rdExpense: optionalNumber("研发费用。"),
            rdExpenseRatio: optionalNumber("研发费用占比，百分比数值。"),
            highTechRevenueRatio: optionalNumber("高新技术产品或服务收入占比，百分比数值。"),
          },
        },
      },
    },
  },
  rdProfile: {
    type: "object",
    description: "研发人员、项目和研发组织信息。",
    optional: true,
    properties: {
      employeeSummary: optionalText("员工与科技人员概况。"),
      rdSummary: optionalText("研发投入概况。"),
      projectSummary: optionalText("研发项目概况。"),
      rdOrganizationSummary: optionalText("研发组织和管理机制。"),
      metrics: {
        type: "object",
        description: "研发结构化指标。",
        optional: true,
        properties: {
          employeeCount: optionalNumber("员工总数。"),
          technologyStaffCount: optionalNumber("科技人员数量。"),
          rdStaffCount: optionalNumber("研发人员数量。"),
          rdProjectCount: optionalNumber("研发项目数量。"),
        },
      },
    },
  },
  cultivationProfile: {
    type: "object",
    description: "企业培育阶段、目标项目和未来目标。",
    optional: true,
    properties: {
      currentStage: optionalText("当前发展阶段。"),
      targetPrograms: optionalText("目标项目或资质。"),
      goals: optionalText("未来培育目标。"),
    },
  },
  serviceObjective: optionalText("本次专利或培育服务目标。"),
  painPoints: optionalText("已知问题或风险。"),
  technicalDisclosure: optionalText("技术交底或技术材料摘要。"),
  supportingMaterials: optionalText("已提供或计划提供的证明材料。"),
  patentRecords: {
    type: "array",
    description: "用户提供的专利记录，不要自行补造专利号、日期或法律状态。",
    optional: true,
    items: {
      type: "object",
      description: "单条专利记录。",
      properties: {
        number: optionalText("专利号。"),
        title: optionalText("专利名称。"),
        applicant: optionalText("申请人。"),
        inventors: optionalText("发明人。"),
        applicationDate: optionalText("申请日期，使用 YYYY、YYYY-MM 或 YYYY-MM-DD。"),
        type: optionalText("专利类型。"),
        userSuppliedStatus: optionalText("用户提供的状态，例如申请中、有效、无效。"),
        sourceMaterialId: optionalText("来源材料编号；没有时不要猜。"),
      },
    },
  },
  evidenceItems: {
    type: "array",
    description: "证明材料清单，只记录用户明确提供的材料。",
    optional: true,
    items: {
      type: "object",
      description: "单条证明材料。",
      properties: {
        name: optionalText("材料名称。"),
        category: optionalText("材料类别。"),
        status: optionalText("材料状态。"),
        note: optionalText("材料备注。"),
        sourceMaterialId: optionalText("来源材料编号；没有时不要猜。"),
      },
    },
  },
};

export class WorkbenchPatentAssistantTool implements ITool {
  readonly name = "workbench_patent_assistant";
  readonly description = "调用智能业务工作台专利助手，创建或读取案件，校验资料完整性，预览并生成专利与企业培育方案。只使用用户明确提供的事实，不猜测缺失数据。";
  readonly parameters: Record<string, ToolParameter> = {
    action: {
      type: "string",
      description: "操作类型：create 创建案件，get 读取案件，validate 校验，preview 预览，export 生成 Word 或 PDF。",
      enum: ["create", "get", "validate", "preview", "export"],
    },
    caseId: {
      type: "string",
      description: "已有案件编号。读取、校验、预览或生成文件时必填。",
      optional: true,
    },
    format: {
      type: "string",
      description: "导出格式，默认 docx。",
      enum: ["docx", "pdf"],
      optional: true,
    },
    caseData: {
      type: "object",
      description: "创建案件时的结构化事实。缺少信息保持为空，不要根据常识补全。",
      optional: true,
      properties: patentCaseDataProperties,
    },
  };
  readonly active = true;

  constructor(private readonly client: WorkbenchApiClient) {}

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
    const action = typeof args.action === "string" ? args.action : "";
    const caseId = typeof args.caseId === "string" ? args.caseId.trim() : "";

    try {
      switch (action) {
        case "create": {
          const caseData = asRecord(args.caseData);
          if (!caseData) return failure("创建专利案件需要提供 caseData；缺少的字段可以不填，但不能凭空补齐。出错时请先向用户询问缺失信息。");
          const result = await this.client.createPatentCase(caseData);
          return success(JSON.stringify(summarizePatentCase(result), null, 2));
        }
        case "get":
          if (!caseId) return failure("读取专利案件需要提供 caseId。");
          return success(JSON.stringify(summarizePatentCase(await this.client.getPatentCase(caseId)), null, 2));
        case "validate":
          if (!caseId) return failure("校验专利方案需要提供 caseId。");
          return success(JSON.stringify(await this.client.validatePatentProposal(caseId), null, 2));
        case "preview":
          if (!caseId) return failure("预览专利方案需要提供 caseId。");
          return success(JSON.stringify(await this.client.previewPatentProposal(caseId), null, 2));
        case "export": {
          if (!caseId) return failure("生成专利方案文件需要提供 caseId。");
          const format = args.format === "pdf" ? "pdf" : "docx";
          const artifact = await this.client.generatePatentProposal(caseId, format);
          return success(JSON.stringify({
            caseId,
            artifactId: artifact.artifactId,
            fileName: artifact.fileName,
            contentType: artifact.contentType,
            documentMode: artifact.documentMode,
            quality: artifact.quality,
            byteLength: base64ByteLength(artifact.contentBase64),
            fileDelivery: "文件已生成。当前机器人不把文件内容放入模型上下文，请在工作台对应案件中下载。",
          }, null, 2));
        }
        default:
          return failure("专利助手 action 必须是 create、get、validate、preview 或 export。");
      }
    } catch (error) {
      return workbenchFailure(error);
    }
  }
}

function summarizePatentCase(value: Record<string, unknown>): Record<string, unknown> {
  const analysis = asRecord(value.analysis);
  return {
    id: value.id,
    status: value.status,
    companyProfile: value.companyProfile,
    serviceObjective: value.serviceObjective,
    painPoints: value.painPoints,
    financialProfile: value.financialProfile,
    rdProfile: value.rdProfile,
    cultivationProfile: value.cultivationProfile,
    patentRecords: value.patentRecords,
    evidenceItems: value.evidenceItems,
    missingFields: value.missingFields,
    statistics: value.statistics,
    analysis: analysis ? {
      dataQuality: analysis.dataQuality,
      readiness: analysis.readiness,
      policyMatches: analysis.policyMatches,
      roadmap: analysis.roadmap,
      nextActions: analysis.nextActions,
    } : undefined,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function normalizeLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value)) return 6;
  return Math.min(MAX_KNOWLEDGE_LIMIT, Math.max(1, value));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function pickStringFilters(
  args: Record<string, unknown>,
  keys: readonly string[],
): Record<string, string> {
  const filters: Record<string, string> = {};
  for (const key of keys) {
    if (typeof args[key] === "string" && args[key].trim()) filters[key] = args[key].trim();
  }
  return filters;
}

function success(
  content: string,
  metadata?: Record<string, unknown>,
  attachments?: readonly ToolAttachment[],
): ToolResult {
  return { success: true, content, metadata, attachments };
}

function failure(content: string): ToolResult {
  return { success: false, content };
}

function workbenchFailure(error: unknown): ToolResult {
  const message = error instanceof Error ? error.message : String(error);
  const status = (error as WorkbenchApiError)?.status;
  return failure(status === 408 ? "工作台响应超时，请稍后重试。" : `工作台请求失败：${message}`);
}

function base64ByteLength(value: string): number {
  if (!value) return 0;
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor(value.length * 3 / 4) - padding);
}
