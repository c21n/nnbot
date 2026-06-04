/**
 * Web Search Tool
 *
 * Searches the internet using multiple search providers.
 * Supports: SerpAPI, Bing, Google, Tavily, DuckDuckGo, Brave
 *
 * Configuration (config.yaml):
 *   tools:
 *     search:
 *       provider: serpapi      # 默认搜索源
 *       apiKey: ${SERPAPI_API_KEY}
 *       defaultLimit: 5
 *       region: cn
 *       fallback: duckduckgo   # 备用搜索源
 */

import type { ITool, ToolParameter, ToolResult, ToolContext } from "../types.js";
import {
  SearchProviderFactory,
  type SearchProvider,
} from "./search-providers.js";

interface SearchConfig {
  provider: SearchProvider;
  apiKey?: string;
  defaultLimit: number;
  region?: string;
  fallback?: SearchProvider;
}

export class WebSearchTool implements ITool {
  readonly name = "web_search";
  readonly description =
    "搜索互联网信息。支持多个搜索源（Google、Bing、DuckDuckGo 等）。返回标题、摘要和链接。";
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
    provider: {
      type: "string",
      description: "指定搜索源，如 'serpapi', 'bing', 'duckduckgo' 等",
      optional: true,
      enum: ["serpapi", "bing", "google", "tavily", "duckduckgo", "brave"],
    },
  };

  private config: SearchConfig;
  private factory: SearchProviderFactory;

  constructor(config?: Partial<SearchConfig>) {
    this.config = {
      provider: config?.provider ?? "serpapi",
      apiKey: config?.apiKey ?? process.env.SERPAPI_API_KEY,
      defaultLimit: config?.defaultLimit ?? 5,
      region: config?.region,
      fallback: config?.fallback,
    };

    this.factory = new SearchProviderFactory({
      provider: this.config.provider,
      apiKey: this.config.apiKey,
      region: this.config.region,
    });
  }

  get active(): boolean {
    // DuckDuckGo doesn't require API key
    return (
      this.factory.isAvailable(this.config.provider) ||
      this.factory.isAvailable("duckduckgo")
    );
  }

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const query = args.query as string;
    const limit = Math.min((args.limit as number) ?? this.config.defaultLimit, 10);
    const language = (args.language as string) ?? "auto";
    const provider = (args.provider as SearchProvider) ?? this.config.provider;

    if (!query.trim()) {
      return { success: false, content: "搜索关键词不能为空" };
    }

    try {
      const { results, provider: usedProvider } =
        await this.factory.searchWithFallback(
          provider,
          this.config.fallback,
          {
            query,
            limit,
            language,
            timeout: context.timeout,
          }
        );

      if (results.length === 0) {
        return {
          success: true,
          content: `未找到与 "${query}" 相关的结果`,
          metadata: { query, resultCount: 0, provider: usedProvider },
        };
      }

      const formatted = results
        .map(
          (r, i) =>
            `${i + 1}. **${r.title}**\n   ${r.snippet}\n   ${r.url}`
        )
        .join("\n\n");

      return {
        success: true,
        content: `搜索 "${query}" 的结果（来源: ${usedProvider}）：\n\n${formatted}`,
        metadata: {
          query,
          resultCount: results.length,
          provider: usedProvider,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        content: `搜索失败: ${message}`,
        metadata: { query, provider, error: message },
      };
    }
  }

  /**
   * Get list of available search providers
   */
  getAvailableProviders(): SearchProvider[] {
    return this.factory.getAvailableProviders();
  }
}
