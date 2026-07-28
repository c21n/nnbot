import { describe, expect, it } from "vitest";
import { EventType } from "../../interfaces.js";
import { createWeComMarkdownReply, parseWeComMessage } from "./wecom-bot-adapter.js";

describe("Enterprise WeChat protocol helpers", () => {
  it("maps a group text callback to the shared event model", () => {
    const event = parseWeComMessage({
      cmd: "aibot_msg_callback",
      headers: { req_id: "request-1" },
      body: {
        msgid: "message-1",
        chattype: "group",
        chatid: "chat-1",
        from: { userid: "user-1" },
        msgtype: "text",
        text: { content: "@工作助手 查询政策" },
      },
    });

    expect(event).toMatchObject({
      type: EventType.GROUP_MESSAGE,
      userId: "user-1",
      groupId: "chat-1",
      message: "查询政策",
      raw: {
        channel: "wecom",
        wecom_req_id: "request-1",
        wecom_msgid: "message-1",
      },
    });
  });

  it("ignores unsupported media callbacks in the text MVP", () => {
    const event = parseWeComMessage({
      cmd: "aibot_msg_callback",
      body: {
        from: { userid: "user-1" },
        msgtype: "image",
        image: { url: "https://example.com/image.png" },
      },
    });

    expect(event).toBeNull();
  });

  it("builds a reply command with the callback request id", () => {
    expect(createWeComMarkdownReply("request-1", "**已完成**")).toEqual({
      cmd: "aibot_respond_msg",
      headers: { req_id: "request-1" },
      body: {
        msgtype: "markdown",
        markdown: { content: "**已完成**" },
      },
    });
  });
});
