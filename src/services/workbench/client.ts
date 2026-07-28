import type { WorkbenchConfig } from "../../interfaces.js";
import { createHash } from "node:crypto";

export interface KnowledgeEvidence {
  readonly chunkId: string;
  readonly documentId: string;
  readonly title: string;
  readonly category?: string | null;
  readonly sourcePath?: string | null;
  readonly sourceUrl?: string | null;
  readonly sectionTitle?: string | null;
  readonly score?: number;
  readonly snippet?: string;
}

export interface KnowledgeSearchResponse {
  readonly query: string;
  readonly results: readonly KnowledgeEvidence[];
}

export interface PolicyMatchResponse {
  readonly matchRunId?: string;
  readonly asOfDate?: string;
  readonly total: number;
  readonly evidence?: readonly Record<string, unknown>[];
  readonly results: readonly Record<string, unknown>[];
}

export interface PerformanceRankingResponse {
  readonly rows: readonly Record<string, unknown>[];
}

export interface PerformanceRankingImage {
  readonly base64: string;
  readonly md5: string;
  readonly fileName: string;
  readonly contentType: string;
}

export class WorkbenchApiError extends Error {
  readonly status: number;
  readonly endpoint: string;

  constructor(endpoint: string, status: number, message: string) {
    super(message);
    this.name = "WorkbenchApiError";
    this.status = status;
    this.endpoint = endpoint;
  }
}

export class WorkbenchApiClient {
  private readonly baseUrl: string;
  private readonly accessToken?: string;
  private readonly timeoutMs: number;

  constructor(config: WorkbenchConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.accessToken = config.accessToken;
    this.timeoutMs = config.timeoutMs ?? 30_000;

    if (!this.baseUrl) {
      throw new Error("workbench.baseUrl 不能为空");
    }
  }

  searchKnowledge(query: string, limit = 6): Promise<KnowledgeSearchResponse> {
    const params = new URLSearchParams({
      q: query,
      limit: String(limit),
    });
    return this.request<KnowledgeSearchResponse>(`/api/knowledge/search?${params.toString()}`);
  }

  matchPolicyProjects(
    companyProfile: Record<string, unknown>,
    filters: Record<string, unknown> = {},
  ): Promise<PolicyMatchResponse> {
    return this.request<PolicyMatchResponse>("/api/policy/matches", {
      method: "POST",
      body: JSON.stringify({ companyProfile, filters }),
    });
  }

  getPerformanceRankings(
    view: "teams" | "people",
    filters: Record<string, string> = {},
  ): Promise<PerformanceRankingResponse> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }

    const query = params.toString();
    return this.request<PerformanceRankingResponse>(
      `/api/performance/rankings/${view}${query ? `?${query}` : ""}`,
    );
  }

  async getPerformanceRankingImage(
    view: "teams" | "people",
    filters: Record<string, string> = {},
  ): Promise<PerformanceRankingImage> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }

    const query = params.toString();
    const endpoint = `/api/performance/rankings/${view}/export-image${query ? `?${query}` : ""}`;
    const response = await this.requestBinary(endpoint);
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentDisposition = response.headers.get("content-disposition") ?? "";
    const fileNameMatch = contentDisposition.match(/filename="?([^";]+)"?/i);

    return {
      base64: buffer.toString("base64"),
      md5: createHash("md5").update(buffer).digest("hex"),
      fileName: fileNameMatch?.[1] ? decodeURIComponent(fileNameMatch[1]) : `performance-${view}.png`,
      contentType: response.headers.get("content-type")?.split(";", 1)[0] || "image/png",
    };
  }

  private async request<T>(endpoint: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (init.body) headers.set("Content-Type", "application/json");
    if (this.accessToken) headers.set("Authorization", `Bearer ${this.accessToken}`);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...init,
        headers,
        signal: controller.signal,
      });
      const text = await response.text();
      const payload = parseJson(text);

      if (!response.ok) {
        throw new WorkbenchApiError(
          endpoint,
          response.status,
          readErrorMessage(payload) || `工作台请求失败（HTTP ${response.status}）`,
        );
      }

      return payload as T;
    } catch (error) {
      if (error instanceof WorkbenchApiError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new WorkbenchApiError(endpoint, 408, "工作台请求超时");
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new WorkbenchApiError(endpoint, 0, `工作台连接失败：${message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private async requestBinary(endpoint: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const headers = new Headers({ Accept: "image/png" });
    if (this.accessToken) headers.set("Authorization", `Bearer ${this.accessToken}`);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers,
        signal: controller.signal,
      });
      if (!response.ok) {
        const text = await response.text();
        const payload = parseJson(text);
        throw new WorkbenchApiError(
          endpoint,
          response.status,
          readErrorMessage(payload) || `工作台请求失败（HTTP ${response.status}）`,
        );
      }
      return response;
    } catch (error) {
      if (error instanceof WorkbenchApiError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new WorkbenchApiError(endpoint, 408, "工作台请求超时");
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new WorkbenchApiError(endpoint, 0, `工作台连接失败：${message}`);
    } finally {
      clearTimeout(timer);
    }
  }
}

function parseJson(value: string): unknown {
  if (!value) return {};
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function readErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  return typeof record.error === "string" ? record.error : null;
}
