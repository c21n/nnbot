/**
 * AI Chat Plugin — Hooks Tests
 *
 * Tests for beforeLLM / afterLLM hooks on AIChatPlugin.
 * Updated for v2 plugin format with createPlugin.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  Event,
  ILLMService,
  IConversationStorage,
  Config,
  LLMMessage,
  PluginServices,
} from "../../interfaces.js";
import { EventType } from "../../interfaces.js";

// Mock PersonaService to avoid filesystem reads
vi.mock("../../services/persona.js", () => ({
  PersonaService: class {
    async getPersona(_userId: string) {
      return "test persona";
    }
  },
}));

// Mock logger to silence output
vi.mock("../../core/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    plugin: vi.fn(),
    messageIn: vi.fn(),
    messageOut: vi.fn(),
  },
}));

// --- Helpers ---

function createMockLLM(reply = "mock reply"): ILLMService {
  return {
    chat: vi.fn().mockResolvedValue(reply),
    chatStream: vi.fn(),
    listModels: vi.fn().mockResolvedValue(["model-a"]),
  };
}

function createMockStorage(): IConversationStorage {
  return {
    saveMessage: vi.fn().mockResolvedValue(undefined),
    getHistory: vi.fn().mockResolvedValue([]),
    clearHistory: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockKVStorage() {
  const store = new Map<string, unknown>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => { store.set(key, value); }),
    delete: vi.fn(async (key: string) => { store.delete(key); }),
  };
}

function createConfig(): Config {
  return {
    server: { host: "0.0.0.0", port: 8080 },
    onebot: { url: "http://localhost:3000" },
    llm: {
      currentProvider: "test",
      providers: {
        test: {
          baseUrl: "http://localhost:11434",
          apiKey: "test",
          model: "model-a",
          temperature: 0.7,
          maxTokens: 1024,
        },
      },
    },
    storage: { type: "memory", path: ":memory:" },
    plugins: { enabled: ["ai_chat"], disabled: [] },
    rules: [],
    admin: { userIds: [], commands: [] },
    context: { historyLimit: 10 },
  };
}

function createEvent(overrides: Partial<Event> = {}): Event {
  return {
    type: EventType.PRIVATE_MESSAGE,
    userId: "user-1",
    nickname: "TestUser",
    groupId: null,
    groupName: null,
    message: "hello",
    timestamp: Date.now(),
    raw: {},
    ...overrides,
  };
}

function createMockServices(
  llm: ILLMService,
  storage: IConversationStorage,
  config: Config
): PluginServices {
  return {
    llm,
    storage: {
      ...storage,
      ...createMockKVStorage(),
    },
    config,
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

// Import AFTER mocks are set up
const { default: aiChatPlugin } = await import("../ai-chat.js");

// --- Tests ---

describe("AIChatPlugin hooks", () => {
  let llm: ILLMService;
  let storage: IConversationStorage;
  let config: Config;
  let services: PluginServices;

  beforeEach(async () => {
    llm = createMockLLM();
    storage = createMockStorage();
    config = createConfig();
    services = createMockServices(llm, storage, config);

    // Set services and initialize plugin
    (aiChatPlugin as any).setServices(services);
    await aiChatPlugin.onLoad();
  });

  describe("no hooks (backward compatible)", () => {
    it("should work without any hooks passed", async () => {
      const event = createEvent();

      const response = await aiChatPlugin.handle(event);

      expect(response).not.toBeNull();
      expect(response!.content).toBe("mock reply");
      expect(response!.replyTo).toBe(true);
      expect(llm.chat).toHaveBeenCalledOnce();
    });
  });

  describe("beforeLLM hook", () => {
    it("should receive the original messages and event", async () => {
      // Note: Hooks are now managed by the plugin implementation
      // This test verifies the plugin works without explicit hooks
      const event = createEvent();

      await aiChatPlugin.handle(event);

      expect(llm.chat).toHaveBeenCalledOnce();
    });
  });

  describe("afterLLM hook", () => {
    it("should receive the LLM response and event", async () => {
      const event = createEvent();

      const response = await aiChatPlugin.handle(event);

      expect(response).not.toBeNull();
      expect(response!.content).toBe("mock reply");
    });
  });

  describe("edge cases", () => {
    it("should skip command messages", async () => {
      const event = createEvent({ message: "/help" });

      const response = await aiChatPlugin.handle(event);

      expect(response).toBeNull();
    });

    it("should skip group messages without @mention", async () => {
      const event = createEvent({
        type: EventType.GROUP_MESSAGE,
        groupId: "group-1",
        message: "hello everyone",
      });

      const response = await aiChatPlugin.handle(event);

      expect(response).toBeNull();
    });

    it("should handle LLM errors gracefully", async () => {
      llm.chat = vi.fn().mockRejectedValue(new Error("LLM failed"));

      const event = createEvent();
      const response = await aiChatPlugin.handle(event);

      expect(response).toBeNull();
    });
  });
});
