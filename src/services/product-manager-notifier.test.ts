import { afterEach, describe, expect, it, vi } from "vitest";
import type { Event, IStorage } from "../interfaces.js";
import { ProductManagerNotifier } from "./product-manager-notifier.js";

const event: Event = {
  type: "group_message" as Event["type"],
  userId: "user-1",
  nickname: "测试用户",
  groupId: "group-1",
  groupName: "产品群",
  message: "评估这个需求的可行性",
  timestamp: 0,
  raw: {},
};

const storage = {
  set: vi.fn().mockResolvedValue(undefined),
} as unknown as IStorage;

describe("ProductManagerNotifier", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records the request and sends a private WeCom app message", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ errcode: 0, access_token: "token-1" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ errcode: 0 })));
    vi.stubGlobal("fetch", fetchMock);

    const notifier = new ProductManagerNotifier({
      enabled: true,
      ownerUserId: "owner-1",
      corpId: "corp-1",
      agentId: "1000032",
      secret: "secret-1",
    }, storage);

    await notifier.record(event, "可行，但需要先确认数据来源。");

    expect(storage.set).toHaveBeenCalledWith(
      expect.stringMatching(/^product-manager:request:/),
      expect.objectContaining({ request: event.message }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const request = fetchMock.mock.calls[1][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      touser: "owner-1",
      agentid: 1000032,
      msgtype: "text",
    });
  });

  it("keeps recording when private notification is disabled", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const notifier = new ProductManagerNotifier({
      enabled: false,
      ownerUserId: "",
      corpId: "",
      agentId: "",
      secret: "",
    }, storage);

    await notifier.record(event, "答复");

    expect(storage.set).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
