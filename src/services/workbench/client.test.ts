import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkbenchApiClient } from "./client.js";

describe("WorkbenchApiClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls the knowledge endpoint with the configured bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ query: "年假", results: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new WorkbenchApiClient({
      enabled: true,
      baseUrl: "http://127.0.0.1:4177/",
      accessToken: "token-1",
    });

    await client.searchKnowledge("年假", 2);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4177/api/knowledge/search?q=%E5%B9%B4%E5%81%87&limit=2",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
    const requestOptions = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = requestOptions.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer token-1");
    expect(headers.get("Accept")).toBe("application/json");
  });

  it("reads the current workbench capability catalog", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        version: 1,
        readOnly: true,
        capabilities: [],
      }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new WorkbenchApiClient({
      enabled: true,
      baseUrl: "http://127.0.0.1:4177/",
    });

    await expect(client.getCapabilities()).resolves.toMatchObject({
      version: 1,
      readOnly: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4177/api/assistant/capabilities",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
  });

  it("downloads a ranking image and converts it to a channel attachment", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(Buffer.from("image-bytes"), {
          status: 200,
          headers: {
            "content-type": "image/png",
            "content-disposition": "inline; filename=ranking.png",
          },
        }),
      ),
    );

    const client = new WorkbenchApiClient({
      enabled: true,
      baseUrl: "http://127.0.0.1:4177",
    });

    const image = await client.getPerformanceRankingImage("teams", { team: "营销一部" });

    expect(image.base64).toBe("aW1hZ2UtYnl0ZXM=");
    expect(image.md5).toHaveLength(32);
    expect(image.fileName).toBe("ranking.png");
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:4177/api/performance/rankings/teams/export-image?team=%E8%90%A5%E9%94%80%E4%B8%80%E9%83%A8",
      expect.objectContaining({ headers: expect.any(Headers) }),
    );
  });

  it("turns non-success responses into a typed API error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "工作台不可用" }), { status: 503 }),
      ),
    );

    const client = new WorkbenchApiClient({
      enabled: true,
      baseUrl: "http://127.0.0.1:4177",
    });

    await expect(client.searchKnowledge("测试")).rejects.toMatchObject({
      name: "WorkbenchApiError",
      status: 503,
      message: "工作台不可用",
    });
  });
});
