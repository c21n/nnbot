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
