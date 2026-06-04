/**
 * Web Search Tool
 *
 * Searches the internet using SerpAPI (Google Search).
 * Returns structured search results with titles, snippets, and URLs.
 *
 * Configuration (config.yaml):
 *   tools:
 *     search:
 *       provider: serpapi
 *       apiKey: ${SERPAPI_API_KEY}
 *       defaultLimit: 5
 */

import type { ITool, ToolParameter, ToolResult, ToolContext } from "../types.js";
import { getJson, type SerpApiOrganicResult, type SerpApiResponse } from "serpapi";

interface SearchResult {
  title: string;
  snippet: string;
  url: string;
}

interface SearchConfig {
  apiKey: string;
  defaultLimit: number;
}

export class WebSearchTool implements ITool {
  readonly name = "web_search";
  readonly description = "搜索互联网信息。用于查找最新资讯、事实、文档等。返回标题、摘要和链接。";
  readonly parameters: Record<string, ToolParameter> = {
    query: {
      type: "string",
      description: "搜索关键词，例如 'TypeScript 泛型教程'",
    },
    limit: {
      type: "number",
      description: "返回结果数量，默认 5，最大 10",
      optional: true,
    },
    language: {
      type: "string",
      description: "搜索语言，如 'zh' 中文、'en' 英文，默认自动",
      optional: true,
      enum: ["zh", "en", "ja", "ko", "auto"],
    },
  };

  private config: SearchConfig;

  constructor(config?: Partial<SearchConfig>) {
    this.config = {
      apiKey: config?.apiKey ?? process.env.SERPAPI_API_KEY ?? "",
      defaultLimit: config?.defaultLimit ?? 5,
    };
  }

  get active(): boolean {
    return !!this.config.apiKey;
  }

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const query = args.query as string;
    const limit = Math.min((args.limit as number) ?? this.config.defaultLimit, 10);
    const language = (args.language as string) ?? "auto";

    if (!query.trim()) {
      return { success: false, content: "搜索关键词不能为空" };
    }

    try {
      const results = await this.searchWithSerpAPI(query, limit, language, context.timeout);

      if (results.length === 0) {
        return { success: true, content: `未找到与 "${query}" 相关的结果` };
      }

      const formatted = results
        .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.snippet}\n   ${r.url}`)
        .join("\n\n");

      return {
        success: true,
        content: `搜索 "${query}" 的结果：\n\n${formatted}`,
        metadata: { query, resultCount: results.length },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        content: `搜索失败: ${message}`,
      };
    }
  }

  private async searchWithSerpAPI(
    query: string,
    limit: number,
    language: string,
    timeout: number
  ): Promise<SearchResult[]> {
    const params: Record<string, string | number> = {
      q: query,
      num: limit,
      api_key: this.config.apiKey,
      engine: "google",
      timeout,
    };

    if (language !== "auto") {
      params.hl = language;
    }

    const response: SerpApiResponse = await getJson(params);

    if (!response.organic_results) {
      return [];
    }

    return response.organic_results.slice(0, limit).map((item: SerpApiOrganicResult) => ({
      title: item.title ?? "",
      snippet: item.snippet ?? "",
      url: item.link ?? "",
    }));
  }
}
