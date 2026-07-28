import { describe, expect, it, vi } from "vitest";
import { WorkbenchKnowledgeTool, WorkbenchPerformanceTool } from "./workbench.js";
import type { ToolContext } from "../types.js";

const context = {} as ToolContext;

describe("Workbench tools", () => {
  it("returns knowledge evidence as model-readable JSON", async () => {
    const client = {
      searchKnowledge: vi.fn().mockResolvedValue({
        query: "年假",
        results: [{ title: "年假制度", snippet: "满一年" }],
      }),
    };
    const tool = new WorkbenchKnowledgeTool(client as never);

    const result = await tool.execute({ query: "年假", limit: 3 }, context);

    expect(result.success).toBe(true);
    expect(result.content).toContain("年假制度");
    expect(client.searchKnowledge).toHaveBeenCalledWith("年假", 3);
  });

  it("can request both performance ranking scopes", async () => {
    const client = {
      getPerformanceRankingImage: vi.fn()
        .mockResolvedValueOnce({ base64: "teams-image", md5: "teams-md5", fileName: "teams.png", contentType: "image/png" })
        .mockResolvedValueOnce({ base64: "people-image", md5: "people-md5", fileName: "people.png", contentType: "image/png" }),
      getPerformanceRankings: vi.fn()
        .mockResolvedValueOnce({ rows: [{ team: "营销一部" }] })
        .mockResolvedValueOnce({ rows: [{ name: "张三" }] }),
    };
    const tool = new WorkbenchPerformanceTool(client as never);

    const result = await tool.execute({ scope: "both" }, context);

    expect(result.success).toBe(true);
    expect(result.content).toContain("营销一部");
    expect(result.content).toContain("张三");
    expect(client.getPerformanceRankings).toHaveBeenCalledTimes(2);
    expect(result.attachments).toHaveLength(2);
    expect(client.getPerformanceRankingImage).toHaveBeenCalledTimes(2);
  });
});
