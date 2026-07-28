import { describe, expect, it } from "vitest";
import type { LLMChatOptions } from "../../interfaces.js";
import type { ITool, ToolContext } from "./types.js";
import { runToolLoop } from "./tool-loop.js";

describe("runToolLoop", () => {
  it("requires the first tool call and returns to auto afterwards", async () => {
    const choices: Array<LLMChatOptions["toolChoice"]> = [];
    let callCount = 0;
    const tool: ITool = {
      name: "performance",
      description: "test tool",
      parameters: {},
      active: true,
      execute: async () => ({ success: true, content: "tool result" }),
    };

    const result = await runToolLoop(
      [],
      [tool],
      {} as ToolContext,
      {
        chatWithTools: async (_messages, _tools, options) => {
          choices.push(options?.toolChoice);
          callCount += 1;
          if (callCount === 1) {
            return {
              content: null,
              toolCalls: [{ id: "call-1", name: "performance", arguments: {} }],
              done: false,
            };
          }
          return { content: "done", toolCalls: [], done: true };
        },
      },
      { requireToolCall: true },
    );

    expect(choices).toEqual(["required", "auto"]);
    expect(result.content).toBe("done");
  });
});
