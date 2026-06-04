/**
 * Search Providers
 *
 * Multiple search API providers with unified interface.
 * Supports: SerpAPI, Bing, Google, Tavily, DuckDuckGo, Brave
 */

import { getJson, type SerpApiResponse } from "serpapi";
import { logger } from "../../../core/logger.js";

// ============ Types ============

export type SearchProvider =
  | "serpapi"
  | "bing"
  | "google"
  | "tavily"
  | "duckduckgo"
  | "brave";

export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
  source?: string;
}

export interface SearchProviderConfig {
  provider: SearchProvider;
  apiKey?: string;
  defaultLimit?: number;
  region?: string;
}

export interface SearchOptions {
  query: string;
  limit: number;
  language: string;
  timeout: number;
}

// ============ Provider Interface ============

interface ISearchProvider {
  readonly name: SearchProvider;
  readonly requiresApiKey: boolean;
  search(options: SearchOptions): Promise<SearchResult[]>;
}

// ============ Provider Implementations ============

class SerpApiProvider implements ISearchProvider {
  readonly name = "serpapi" as const;
  readonly requiresApiKey = true;

  constructor(
    private apiKey: string,
    private _region?: string
  ) {}

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const params: Record<string, string | number> = {
      q: options.query,
      num: options.limit,
      api_key: this.apiKey,
      engine: "google",
      timeout: options.timeout,
    };

    if (options.language !== "auto") {
      params.hl = options.language;
    }
    if (this._region) {
      params.gl = this._region;
    }

    const response: SerpApiResponse = await getJson(params);

    if (!response.organic_results) {
      return [];
    }

    return response.organic_results.slice(0, options.limit).map((item) => ({
      title: item.title ?? "",
      snippet: item.snippet ?? "",
      url: item.link ?? "",
      source: "serpapi",
    }));
  }
}

class BingProvider implements ISearchProvider {
  readonly name = "bing" as const;
  readonly requiresApiKey = true;

  constructor(private apiKey: string) {}

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const params = new URLSearchParams({
      q: options.query,
      count: String(options.limit),
      mkt: this.getMarket(options.language),
    });

    const response = await fetch(
      `https://api.bing.microsoft.com/v7.0/search?${params}`,
      {
        headers: {
          "Ocp-Apim-Subscription-Key": this.apiKey,
        },
        signal: AbortSignal.timeout(options.timeout),
      }
    );

    if (!response.ok) {
      throw new Error(`Bing API error: ${response.status}`);
    }

    const data = (await response.json()) as any;
    const results = data.webPages?.value ?? [];

    return results.slice(0, options.limit).map((item: any) => ({
      title: item.name ?? "",
      snippet: item.snippet ?? "",
      url: item.url ?? "",
      source: "bing",
    }));
  }

  private getMarket(language: string): string {
    const markets: Record<string, string> = {
      zh: "zh-CN",
      en: "en-US",
      ja: "ja-JP",
      ko: "ko-KR",
    };
    return markets[language] ?? "en-US";
  }
}

class GoogleProvider implements ISearchProvider {
  readonly name = "google" as const;
  readonly requiresApiKey = true;

  constructor(
    private apiKey: string,
    private cx: string
  ) {}

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const params = new URLSearchParams({
      key: this.apiKey,
      cx: this.cx,
      q: options.query,
      num: String(options.limit),
      lr: this.getLanguage(options.language),
    });

    const response = await fetch(
      `https://www.googleapis.com/customsearch/v1?${params}`,
      { signal: AbortSignal.timeout(options.timeout) }
    );

    if (!response.ok) {
      throw new Error(`Google API error: ${response.status}`);
    }

    const data = (await response.json()) as any;
    const results = data.items ?? [];

    return results.slice(0, options.limit).map((item: any) => ({
      title: item.title ?? "",
      snippet: item.snippet ?? "",
      url: item.link ?? "",
      source: "google",
    }));
  }

  private getLanguage(language: string): string {
    const languages: Record<string, string> = {
      zh: "lang_zh-CN",
      en: "lang_en",
      ja: "lang_ja",
      ko: "lang_ko",
    };
    return languages[language] ?? "";
  }
}

class TavilyProvider implements ISearchProvider {
  readonly name = "tavily" as const;
  readonly requiresApiKey = true;

  constructor(private apiKey: string) {}

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: this.apiKey,
        query: options.query,
        max_results: options.limit,
        search_depth: "basic",
        include_answer: false,
      }),
      signal: AbortSignal.timeout(options.timeout),
    });

    if (!response.ok) {
      throw new Error(`Tavily API error: ${response.status}`);
    }

    const data = (await response.json()) as any;
    const results = data.results ?? [];

    return results.slice(0, options.limit).map((item: any) => ({
      title: item.title ?? "",
      snippet: item.content ?? "",
      url: item.url ?? "",
      source: "tavily",
    }));
  }
}

class DuckDuckGoProvider implements ISearchProvider {
  readonly name = "duckduckgo" as const;
  readonly requiresApiKey = false;

  async search(options: SearchOptions): Promise<SearchResult[]> {
    // DuckDuckGo Instant Answer API (limited but free)
    const params = new URLSearchParams({
      q: options.query,
      format: "json",
      no_html: "1",
      skip_disambig: "1",
    });

    const response = await fetch(
      `https://api.duckduckgo.com/?${params}`,
      { signal: AbortSignal.timeout(options.timeout) }
    );

    if (!response.ok) {
      throw new Error(`DuckDuckGo API error: ${response.status}`);
    }

    const data = (await response.json()) as any;
    const results: SearchResult[] = [];

    // Abstract (main result)
    if (data.AbstractText && data.AbstractURL) {
      results.push({
        title: data.Heading ?? options.query,
        snippet: data.AbstractText,
        url: data.AbstractURL,
        source: "duckduckgo",
      });
    }

    // Related topics
    const topics = data.RelatedTopics ?? [];
    for (const topic of topics.slice(0, options.limit - results.length)) {
      if (topic.FirstURL && topic.Text) {
        results.push({
          title: topic.Text.split(" - ")[0] ?? "",
          snippet: topic.Text,
          url: topic.FirstURL,
          source: "duckduckgo",
        });
      }
    }

    // If no results, try with HTML scraping fallback
    if (results.length === 0) {
      return this.scrapeSearch(options);
    }

    return results.slice(0, options.limit);
  }

  private async scrapeSearch(options: SearchOptions): Promise<SearchResult[]> {
    // Fallback: use DuckDuckGo HTML search
    const params = new URLSearchParams({
      q: options.query,
    });

    const response = await fetch(
      `https://html.duckduckgo.com/html/?${params}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; nnbot/1.0)",
        },
        signal: AbortSignal.timeout(options.timeout),
      }
    );

    if (!response.ok) {
      return [];
    }

    const html = await response.text();
    const results: SearchResult[] = [];

    // Simple regex parsing (not ideal but works for basic cases)
    const resultRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([^<]+)<\/a>/g;
    let match;

    while ((match = resultRegex.exec(html)) !== null && results.length < options.limit) {
      results.push({
        title: this.decodeHtml(match[2]),
        snippet: this.decodeHtml(match[3]),
        url: match[1],
        source: "duckduckgo",
      });
    }

    return results;
  }

  private decodeHtml(html: string): string {
    return html
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }
}

class BraveProvider implements ISearchProvider {
  readonly name = "brave" as const;
  readonly requiresApiKey = true;

  constructor(private apiKey: string) {}

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const params = new URLSearchParams({
      q: options.query,
      count: String(options.limit),
    });

    if (options.language !== "auto") {
      params.set("search_lang", options.language);
    }

    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?${params}`,
      {
        headers: {
          "X-Subscription-Token": this.apiKey,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(options.timeout),
      }
    );

    if (!response.ok) {
      throw new Error(`Brave API error: ${response.status}`);
    }

    const data = (await response.json()) as any;
    const results = data.web?.results ?? [];

    return results.slice(0, options.limit).map((item: any) => ({
      title: item.title ?? "",
      snippet: item.description ?? "",
      url: item.url ?? "",
      source: "brave",
    }));
  }
}

// ============ Provider Factory ============

export class SearchProviderFactory {
  private providers: Map<SearchProvider, ISearchProvider> = new Map();

  constructor(config: SearchProviderConfig) {
    this.initializeProviders(config);
  }

  private initializeProviders(config: SearchProviderConfig): void {
    const apiKey = config.apiKey ?? "";

    // SerpAPI
    if (apiKey) {
      this.providers.set(
        "serpapi",
        new SerpApiProvider(apiKey, config.region)
      );
    }

    // Bing
    const bingKey = process.env.BING_API_KEY ?? apiKey;
    if (bingKey) {
      this.providers.set("bing", new BingProvider(bingKey));
    }

    // Google
    const googleKey = process.env.GOOGLE_API_KEY ?? apiKey;
    const googleCx = process.env.GOOGLE_CX ?? "";
    if (googleKey && googleCx) {
      this.providers.set(
        "google",
        new GoogleProvider(googleKey, googleCx)
      );
    }

    // Tavily
    const tavilyKey = process.env.TAVILY_API_KEY ?? apiKey;
    if (tavilyKey) {
      this.providers.set("tavily", new TavilyProvider(tavilyKey));
    }

    // DuckDuckGo (always available, no API key needed)
    this.providers.set("duckduckgo", new DuckDuckGoProvider());

    // Brave
    const braveKey = process.env.BRAVE_API_KEY ?? apiKey;
    if (braveKey) {
      this.providers.set("brave", new BraveProvider(braveKey));
    }
  }

  getProvider(name: SearchProvider): ISearchProvider | undefined {
    return this.providers.get(name);
  }

  getAvailableProviders(): SearchProvider[] {
    return Array.from(this.providers.keys());
  }

  isAvailable(name: SearchProvider): boolean {
    return this.providers.has(name);
  }

  async search(
    providerName: SearchProvider,
    options: SearchOptions
  ): Promise<SearchResult[]> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`搜索源 "${providerName}" 不可用`);
    }
    return provider.search(options);
  }

  async searchWithFallback(
    primaryProvider: SearchProvider,
    fallbackProvider: SearchProvider | undefined,
    options: SearchOptions
  ): Promise<{ results: SearchResult[]; provider: SearchProvider }> {
    try {
      const results = await this.search(primaryProvider, options);
      return { results, provider: primaryProvider };
    } catch (error) {
      if (fallbackProvider && this.isAvailable(fallbackProvider)) {
        logger.warn(
          `[search] ${primaryProvider} failed, trying ${fallbackProvider}: ${error}`
        );
        const results = await this.search(fallbackProvider, options);
        return { results, provider: fallbackProvider };
      }
      throw error;
    }
  }
}
