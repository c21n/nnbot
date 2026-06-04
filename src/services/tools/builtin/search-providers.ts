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
  | "brave"
  | "you"
  | "exa";

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
    // Try HTML search first (more reliable results)
    try {
      const results = await this.scrapeSearch(options);
      if (results.length > 0) {
        return results;
      }
    } catch {
      // Fall through to Instant Answer API
    }

    // Fallback: DuckDuckGo Instant Answer API
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

    return results.slice(0, options.limit);
  }

  private async scrapeSearch(options: SearchOptions): Promise<SearchResult[]> {
    // Use DuckDuckGo HTML search
    const params = new URLSearchParams({
      q: options.query,
      t: "h_",
      ia: "web",
    });

    const response = await fetch(
      `https://html.duckduckgo.com/html/?${params}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(options.timeout),
      }
    );

    if (!response.ok) {
      return [];
    }

    const html = await response.text();
    const results: SearchResult[] = [];

    // Parse DuckDuckGo HTML results
    const resultRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>(.*?)<\/a>/g;
    let match;

    while ((match = resultRegex.exec(html)) !== null && results.length < options.limit) {
      const title = match[2].replace(/<[^>]+>/g, "").trim();
      const snippet = match[3].replace(/<[^>]+>/g, "").trim();
      if (title && snippet) {
        results.push({
          title: this.decodeHtml(title),
          snippet: this.decodeHtml(snippet),
          url: match[1],
          source: "duckduckgo",
        });
      }
    }

    return results;
  }

  private decodeHtml(html: string): string {
    return html
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, "/");
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

/**
 * You.com Search API
 * Free tier: 100 searches/day (no API key needed for MCP mode)
 */
class YouProvider implements ISearchProvider {
  readonly name = "you" as const;
  readonly requiresApiKey = false;

  constructor(private apiKey?: string) {}

  async search(options: SearchOptions): Promise<SearchResult[]> {
    // Use You.com Search API
    const params = new URLSearchParams({
      query: options.query,
      limit: String(options.limit),
    });

    if (options.language !== "auto") {
      params.set("search_lang", options.language);
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    // API key is optional for free tier
    if (this.apiKey) {
      headers["X-API-Key"] = this.apiKey;
    }

    // Try You.com API endpoint
    const response = await fetch(
      `https://api.you.com/v1/search?${params}`,
      {
        headers,
        signal: AbortSignal.timeout(options.timeout),
      }
    );

    if (!response.ok) {
      throw new Error(`You.com API error: ${response.status}`);
    }

    const data = (await response.json()) as any;
    const results = data.hits ?? data.results ?? [];

    return results.slice(0, options.limit).map((item: any) => ({
      title: item.title ?? "",
      snippet: item.snippet ?? item.description ?? "",
      url: item.url ?? "",
      source: "you",
    }));
  }
}

/**
 * Exa.ai Search API
 * Free tier: 1,000 requests/month
 * Semantic search based on embeddings
 */
class ExaProvider implements ISearchProvider {
  readonly name = "exa" as const;
  readonly requiresApiKey = true;

  constructor(private apiKey: string) {}

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const response = await fetch(
      "https://api.exa.ai/search",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
        },
        body: JSON.stringify({
          query: options.query,
          numResults: options.limit,
          type: "neural", // Use semantic search
          contents: {
            text: true,
          },
        }),
        signal: AbortSignal.timeout(options.timeout),
      }
    );

    if (!response.ok) {
      throw new Error(`Exa API error: ${response.status}`);
    }

    const data = (await response.json()) as any;
    const results = data.results ?? [];

    return results.slice(0, options.limit).map((item: any) => ({
      title: item.title ?? "",
      snippet: item.text ?? "",
      url: item.url ?? "",
      source: "exa",
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

    // Bing (deprecated but keep for existing users)
    const bingKey = process.env.BING_API_KEY ?? apiKey;
    if (bingKey) {
      this.providers.set("bing", new BingProvider(bingKey));
    }

    // Google (closed for new registrations)
    const googleKey = process.env.GOOGLE_API_KEY ?? apiKey;
    const googleCx = process.env.GOOGLE_CX ?? "";
    if (googleKey && googleCx) {
      this.providers.set(
        "google",
        new GoogleProvider(googleKey, googleCx)
      );
    }

    // Tavily (1000 credits/month free)
    const tavilyKey = process.env.TAVILY_API_KEY ?? apiKey;
    if (tavilyKey) {
      this.providers.set("tavily", new TavilyProvider(tavilyKey));
    }

    // DuckDuckGo (always available, no API key needed)
    this.providers.set("duckduckgo", new DuckDuckGoProvider());

    // Brave ($5/month free, ~1000 searches)
    const braveKey = process.env.BRAVE_API_KEY ?? apiKey;
    if (braveKey) {
      this.providers.set("brave", new BraveProvider(braveKey));
    }

    // You.com (100/day free, no API key needed for basic usage)
    const youKey = process.env.YOU_API_KEY;
    this.providers.set("you", new YouProvider(youKey));

    // Exa.ai (1000 requests/month free)
    const exaKey = process.env.EXA_API_KEY ?? apiKey;
    if (exaKey) {
      this.providers.set("exa", new ExaProvider(exaKey));
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
