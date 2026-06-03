/**
 * Tests for rule-match plugin (v2 format)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Event, PluginServices, Config } from "../../interfaces.js";
import { EventType } from "../../interfaces.js";

const { default: ruleMatchPlugin } = await import("../rule-match.js");

// ============ Test Helpers ============

function createMockEvent(overrides?: Partial<Event>): Event {
  return {
    type: EventType.PRIVATE_MESSAGE,
    userId: "user123",
    nickname: "TestUser",
    groupId: null,
    groupName: null,
    message: "hello",
    timestamp: Date.now(),
    raw: {},
    ...overrides,
  };
}

function createMockConfig(rules: Array<{ pattern: string; reply: string }> = []): Config {
  return {
    rules,
    server: { host: "0.0.0.0", port: 8080 },
    onebot: { url: "http://127.0.0.1:3000" },
    llm: { provider: "openai", baseUrl: "", apiKey: "", model: "", temperature: 0.7, maxTokens: 1000 },
    storage: { type: "memory", path: "" },
    plugins: { enabled: [], disabled: [] },
    admin: { userIds: [], commands: [] },
    context: { historyLimit: 10 },
  };
}

function createMockServices(config?: Config): PluginServices {
  return {
    llm: {
      chat: vi.fn().mockResolvedValue("response"),
      chatStream: vi.fn(),
      listModels: vi.fn().mockResolvedValue([]),
    },
    storage: {
      set: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      exists: vi.fn(),
      saveMessage: vi.fn(),
      getHistory: vi.fn().mockResolvedValue([]),
      clearHistory: vi.fn(),
    },
    config: config ?? createMockConfig(),
    pluginManager: {
      register: vi.fn(),
      unregister: vi.fn(),
      dispatch: vi.fn(),
      getPlugins: vi.fn().mockReturnValue([]),
      getPlugin: vi.fn(),
      getHooks: vi.fn().mockReturnValue({}),
      loadFromDir: vi.fn(),
      reloadPlugin: vi.fn(),
      reloadAll: vi.fn(),
    },
    hooks: {},
  };
}

// ============ Tests ============

describe("rule-match plugin", () => {
  let services: PluginServices;

  beforeEach(() => {
    services = createMockConfig([
      { pattern: "你好", reply: "你好！" },
      { pattern: "天气", reply: "今天天气不错" },
      { pattern: "test", reply: "用户: {user}, 时间: {time}" },
    ]);
    services = createMockServices(services);
  });

  it("should match simple pattern", async () => {
    const event = createMockEvent({ message: "你好" });

    // Set services (simulating PluginManager behavior)
    (ruleMatchPlugin as any).setServices(services);

    const response = await ruleMatchPlugin.handle(event);

    expect(response).not.toBeNull();
    expect(response!.content).toBe("你好！");
  });

  it("should not match unrelated message", async () => {
    const event = createMockEvent({ message: "再见" });

    (ruleMatchPlugin as any).setServices(services);

    const response = await ruleMatchPlugin.handle(event);

    expect(response).toBeNull();
  });

  it("should skip commands", async () => {
    const event = createMockEvent({ message: "/help" });

    (ruleMatchPlugin as any).setServices(services);

    const response = await ruleMatchPlugin.handle(event);

    expect(response).toBeNull();
  });

  it("should replace variables", async () => {
    const event = createMockEvent({ message: "test", userId: "user456" });

    (ruleMatchPlugin as any).setServices(services);

    const response = await ruleMatchPlugin.handle(event);

    expect(response).not.toBeNull();
    expect(response!.content).toContain("user456");
    expect(response!.content).toContain(":"); // time separator
  });

  it("should return help text", () => {
    expect(ruleMatchPlugin.help()).toContain("规则匹配");
  });
});
