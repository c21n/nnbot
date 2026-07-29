import { describe, expect, it } from "vitest";
import { ProviderManager } from "./provider-manager.js";

describe("ProviderManager", () => {
  it("falls back to the provider default model when embedding modelId is omitted", () => {
    const manager = new ProviderManager({
      list: [
        {
          id: "siliconflow",
          type: "openai",
          baseUrl: "https://api.siliconflow.cn/v1",
          defaultModel: "BAAI/bge-m3",
        },
      ],
      defaults: {
        embedding: { providerId: "siliconflow", dimension: 1024 },
      },
    });

    const embedding = manager.getEmbedding("siliconflow");

    expect((embedding as unknown as { model: string }).model).toBe("BAAI/bge-m3");
  });
});
