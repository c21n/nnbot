import { describe, expect, it } from "vitest";
import { EventType, type Event, type Response } from "../interfaces.js";
import { MessageBuffer } from "./message-buffer.js";

describe("MessageBuffer", () => {
  it("keeps the responder from the original channel", async () => {
    const responses: Array<{ channel: string; content: string }> = [];
    const buffer = new MessageBuffer(5, async (event, responder) => {
      await responder(event, { content: `reply: ${event.message}` });
    });
    const event: Event = {
      type: EventType.PRIVATE_MESSAGE,
      userId: "user-1",
      nickname: "User",
      groupId: null,
      groupName: null,
      message: "hello",
      timestamp: Date.now(),
      raw: { channel: "wecom" },
    };
    const responder = async (replyEvent: Event, response: Response): Promise<void> => {
      responses.push({ channel: String(replyEvent.raw.channel), content: response.content });
    };

    buffer.add(event, responder);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(responses).toEqual([{ channel: "wecom", content: "reply: hello" }]);
  });
});
