import type { ITool, ToolAttachment, ToolContext, ToolParameter, ToolResult } from "../types.js";
import { WorkbenchApiClient, type WorkbenchApiError } from "../../workbench/client.js";

const MAX_KNOWLEDGE_LIMIT = 10;
const MAX_POLICY_RESULTS = 20;
const MAX_POLICY_EVIDENCE = 30;
const MAX_RANKING_ROWS = 50;

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
