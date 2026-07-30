import { describe, expect, it, vi } from "vitest";
import {
  WorkbenchCapabilitiesTool,
  WorkbenchKnowledgeTool,
  WorkbenchPerformanceTool,
  WorkbenchPatentAssistantTool,
} from "./workbench.js";
import type { ToolContext } from "../types.js";

const context = {} as ToolContext;

describe("Workbench tools", () => {
  it("returns the live capability catalog", async () => {
    const client = {
      getCapabilities: vi.fn().mockResolvedValue({
        version: 1,
        readOnly: true,
        capabilities: [{ id: "knowledge_search", name: "知识库检索" }],
      }),
    };
    const tool = new WorkbenchCapabilitiesTool(client as never);

    const result = await tool.execute({}, context);

    expect(result.success).toBe(true);
    expect(result.content).toContain("knowledge_search");
    expect(client.getCapabilities).toHaveBeenCalledOnce();
  });

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

  it("creates a patent case from explicitly supplied facts", async () => {
    const client = {
      createPatentCase: vi.fn().mockResolvedValue({
        id: "case-1",
        status: "draft",
        companyProfile: { companyName: "示例公司" },
        missingFields: ["financialProfile"],
      }),
    };
    const tool = new WorkbenchPatentAssistantTool(client as never);

    const result = await tool.execute({
      action: "create",
      caseData: {
        companyProfile: { companyName: "示例公司" },
        serviceObjective: "输出专利培育方案",
        patentRecords: [{ number: "CN123", title: "示例专利" }],
      },
    }, context);

    expect(result.success).toBe(true);
    expect(result.content).toContain("case-1");
    expect(client.createPatentCase).toHaveBeenCalledWith({
      companyProfile: { companyName: "示例公司" },
      serviceObjective: "输出专利培育方案",
      patentRecords: [{ number: "CN123", title: "示例专利" }],
    });
  });

  it("returns patent artifact metadata without exposing base64 content", async () => {
    const client = {
      generatePatentProposal: vi.fn().mockResolvedValue({
        artifactId: "artifact-1",
        templateVersion: "patent-v1",
        fileName: "示例方案.docx",
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        contentBase64: "c2Vuc2l0aXZlLWJ5dGVz",
        documentMode: "draft",
        quality: { status: "ready" },
      }),
    };
    const tool = new WorkbenchPatentAssistantTool(client as never);

    const result = await tool.execute({
      action: "export",
      caseId: "case-1",
      format: "docx",
    }, context);

    expect(result.success).toBe(true);
    expect(result.content).toContain("示例方案.docx");
    expect(result.content).not.toContain("c2Vuc2l0aXZlLWJ5dGVz");
    expect(result.content).toContain("请在工作台对应案件中下载");
    expect(client.generatePatentProposal).toHaveBeenCalledWith("case-1", "docx");
  });
});
