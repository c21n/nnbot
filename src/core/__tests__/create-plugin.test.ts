/**
 * Tests for createPlugin factory function
 *
 * TDD: These tests define the expected behavior before implementation.
 */

import { describe, it, expect, vi } from "vitest";
import type { Event, Response, PluginServices, PluginDefinition } from "../../interfaces.js";
import { EventType } from "../../interfaces.js";

// Import will fail until we implement createPlugin
const { createPlugin } = await import("../create-plugin.js");

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

function createMockServices(): PluginServices {
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
    config: {} as any,
    pluginManager: {
      register: vi.fn(),
      unregister: vi.fn(),
      dispatch: vi.fn(),
      getPlugins: vi.fn().mockReturnValue([]),
      getPlugin: vi.fn(),
    },
  };
}

// ============ createPlugin Basic Tests ============

describe("createPlugin", () => {
  it("should create plugin with minimal definition", () => {
    const plugin = createPlugin({
      name: "test",
      handle: async () => null,
    });

    expect(plugin.name).toBe("test");
    expect(plugin.description).toBe("");
    expect(plugin.version).toBe("1.0.0");
    expect(plugin.help()).toBe("");
  });

  it("should create plugin with all options", () => {
    const onLoad = vi.fn();
    const onUnload = vi.fn();

    const plugin = createPlugin({
      name: "full",
      description: "A full plugin",
      version: "2.0.0",
      priority: 42,
      help: "Help text",
      handle: async () => ({ content: "reply" }),
      onLoad,
      onUnload,
    });

    expect(plugin.name).toBe("full");
    expect(plugin.description).toBe("A full plugin");
    expect(plugin.version).toBe("2.0.0");
    expect(plugin.help()).toBe("Help text");
  });

  it("should use default values when optional fields omitted", () => {
    const plugin = createPlugin({
      name: "defaults",
      handle: async () => null,
    });

    expect(plugin.description).toBe("");
    expect(plugin.version).toBe("1.0.0");
    expect(plugin.help()).toBe("");
  });

  it("should throw when name is empty", () => {
    expect(() =>
      createPlugin({
        name: "",
        handle: async () => null,
      })
    ).toThrow("Plugin name is required");
  });

  it("should throw when name is missing", () => {
    expect(() =>
      createPlugin({
        handle: async () => null,
      } as any)
    ).toThrow("Plugin name is required");
  });

  it("should throw when handle is not a function", () => {
    expect(() =>
      createPlugin({
        name: "test",
        handle: "not a function" as any,
      })
    ).toThrow("Plugin handle function is required");
  });

  it("should throw when handle is missing", () => {
    expect(() =>
      createPlugin({
        name: "test",
      } as any)
    ).toThrow("Plugin handle function is required");
  });
});

// ============ Service Injection Tests ============

describe("createPlugin service injection", () => {
  it("should throw when handle called before services set", async () => {
    const plugin = createPlugin({
      name: "test",
      handle: async () => null,
    });

    const event = createMockEvent();
    await expect(plugin.handle(event)).rejects.toThrow("Plugin not registered");
  });

  it("should pass services to handle", async () => {
    const handleFn = vi.fn().mockResolvedValue(null);
    const plugin = createPlugin({
      name: "test",
      handle: handleFn,
    });

    const services = createMockServices();
    // Internal method to set services
    (plugin as any).setServices(services);

    const event = createMockEvent();
    await plugin.handle(event);

    expect(handleFn).toHaveBeenCalledWith(event, services);
  });

  it("should pass services to onLoad", async () => {
    const onLoadFn = vi.fn();
    const plugin = createPlugin({
      name: "test",
      handle: async () => null,
      onLoad: onLoadFn,
    });

    const services = createMockServices();
    (plugin as any).setServices(services);

    await plugin.onLoad();

    expect(onLoadFn).toHaveBeenCalledWith(services);
  });

  it("should call onUnload without services", async () => {
    const onUnloadFn = vi.fn();
    const plugin = createPlugin({
      name: "test",
      handle: async () => null,
      onUnload: onUnloadFn,
    });

    await plugin.onUnload();

    expect(onUnloadFn).toHaveBeenCalled();
  });
});

// ============ Priority Constants Tests ============

describe("PLUGIN_PRIORITY", () => {
  it("should have correct values", async () => {
    const { PLUGIN_PRIORITY } = await import("../../constants.js");

    expect(PLUGIN_PRIORITY.ADMIN).toBe(10);
    expect(PLUGIN_PRIORITY.RULE_MATCH).toBe(50);
    expect(PLUGIN_PRIORITY.AI_CHAT).toBe(100);
    expect(PLUGIN_PRIORITY.DEFAULT).toBe(100);
  });

  it("should have ADMIN < RULE_MATCH < AI_CHAT", async () => {
    const { PLUGIN_PRIORITY } = await import("../../constants.js");

    expect(PLUGIN_PRIORITY.ADMIN).toBeLessThan(PLUGIN_PRIORITY.RULE_MATCH);
    expect(PLUGIN_PRIORITY.RULE_MATCH).toBeLessThan(PLUGIN_PRIORITY.AI_CHAT);
  });
});
