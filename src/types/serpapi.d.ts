/**
 * Type declarations for serpapi package
 * The package doesn't ship with TypeScript types
 */

declare module "serpapi" {
  interface SerpApiParameters {
    api_key?: string;
    engine?: string;
    q?: string;
    num?: number;
    hl?: string;
    gl?: string;
    timeout?: number;
    [key: string]: unknown;
  }

  interface SerpApiSearchMetadata {
    id: string;
    status: string;
    json_endpoint: string;
    created_at: string;
    processed_at: string;
    google_url: string;
    raw_html_file: string;
    total_time_taken: number;
  }

  interface SerpApiSearchInformation {
    query: string;
    showing_results_for?: string;
    total_results: number;
    time_taken_displayed: number;
    organic_results_state: string;
  }

  interface SerpApiOrganicResult {
    position: number;
    title: string;
    link: string;
    redirect_link?: string;
    displayed_link: string;
    thumbnail?: string;
    favicon?: string;
    snippet?: string;
    snippet_highlighted_words?: string[];
    sitelinks?: {
      inline?: Array<{ title: string; link: string }>;
      expanded?: Array<{ title: string; link: string; description: string }>;
    };
    source?: string;
  }

  interface SerpApiResponse {
    search_metadata: SerpApiSearchMetadata;
    search_parameters: SerpApiParameters;
    search_information: SerpApiSearchInformation;
    organic_results?: SerpApiOrganicResult[];
    answer_box?: Record<string, unknown>;
    knowledge_graph?: Record<string, unknown>;
    inline_images?: Array<Record<string, unknown>>;
    related_questions?: Array<Record<string, unknown>>;
    related_searches?: Array<{ query: string; link: string }>;
    pagination?: {
      current: number;
      next?: string;
      other_pages?: Record<string, string>;
    };
    [key: string]: unknown;
  }

  /**
   * Get JSON response from SerpAPI
   * @param parameters Search parameters
   * @returns Promise with search results
   */
  export function getJson(parameters: SerpApiParameters): Promise<SerpApiResponse>;

  /**
   * Get JSON response from SerpAPI with callback
   * @param parameters Search parameters
   * @param callback Optional callback function
   * @returns Promise with search results
   */
  export function getJson(
    parameters: SerpApiParameters,
    callback?: (data: SerpApiResponse) => void
  ): Promise<SerpApiResponse>;

  /**
   * Get JSON response by engine name
   * @param engine Search engine name (e.g., "google", "bing")
   * @param parameters Search parameters (without engine)
   * @returns Promise with search results
   */
  export function getJson(
    engine: string,
    parameters: Omit<SerpApiParameters, "engine">
  ): Promise<SerpApiResponse>;

  /**
   * Get HTML response from SerpAPI
   * @param parameters Search parameters
   * @returns Promise with HTML string
   */
  export function getHtml(parameters: SerpApiParameters): Promise<string>;

  /**
   * Get account information
   * @param parameters Parameters with optional api_key
   * @returns Promise with account info
   */
  export function getAccount(parameters?: Pick<SerpApiParameters, "api_key" | "timeout">): Promise<Record<string, unknown>>;

  /**
   * Get supported locations
   * @param parameters Parameters with optional query and limit
   * @returns Promise with locations array
   */
  export function getLocations(parameters?: Pick<SerpApiParameters, "q" | "limit" | "timeout">): Promise<Array<Record<string, unknown>>>;

  /**
   * Get JSON by search ID (for async searches)
   * @param searchId Search ID from previous response
   * @param parameters Parameters with optional api_key
   * @returns Promise with search results
   */
  export function getJsonBySearchId(
    searchId: string,
    parameters?: Pick<SerpApiParameters, "api_key" | "timeout">
  ): Promise<SerpApiResponse>;

  /**
   * Get HTML by search ID (for async searches)
   * @param searchId Search ID from previous response
   * @param parameters Parameters with optional api_key
   * @returns Promise with HTML string
   */
  export function getHtmlBySearchId(
    searchId: string,
    parameters?: Pick<SerpApiParameters, "api_key" | "timeout">
  ): Promise<string>;

  export class InvalidArgumentError extends Error {}
  export class InvalidTimeoutError extends Error {}
  export class MissingApiKeyError extends Error {}

  export const config: {
    api_key?: string;
    timeout?: number;
  };
}
