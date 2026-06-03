/**
 * AI Chat Plugin — Hooks Tests
 *
 * Tests for beforeLLM / afterLLM hooks on AIChatPlugin.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  Event,
  ILLMService,
  IConversationStorage,
  Config,
  LLMMessage,
  AIChatHooks,
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
      provider: "openai",
      baseUrl: "http://localhost:11434",
      apiKey: "test",
      model: "model-a",
      temperature: 0.7,
      maxTokens: 1024,
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

// Import AFTER mocks are set up
const { AIChatPlugin } = await import("../ai-chat.js");

// --- Tests ---

describe("AIChatPlugin hooks", () => {
  let llm: ILLMService;
  let storage: IConversationStorage;
  let kvStorage: ReturnType<typeof createMockKVStorage>;
  let config: Config;

  beforeEach(() => {
    llm = createMockLLM();
    storage = createMockStorage();
    kvStorage = createMockKVStorage();
    config = createConfig();
  });

  describe("no hooks (backward compatible)", () => {
    it("should work without any hooks passed", async () => {
      const plugin = new AIChatPlugin(llm, storage, kvStorage, config);
      const event = createEvent();

      const response = await plugin.handle(event);

      expect(response).not.toBeNull();
      expect(response!.content).toBe("mock reply");
      expect(response!.replyTo).toBe(true);
      expect(llm.chat).toHaveBeenCalledOnce();
    });
  });

  describe("beforeLLM hook", () => {
    it("should receive the original messages and event", async () => {
      const beforeLLM = vi.fn(async (messages: LLMMessage[]) => messages);
      const plugin = new AIChatPlugin(llm, storage, kvStorage, config, {
        beforeLLM,
      });

      await plugin.handle(createEvent());

      expect(beforeLLM).toHaveBeenCalledOnce();
      const [messages, event] = beforeLLM.mock.calls[0];
      // messages: [system, user]
      expect(messages.length).toBe(2);
      expect(messages[0].role).toBe("system");
      expect(messages[1].role).toBe("user");
      expect(event.userId).toBe("user-1");
    });

    it("should pass modified messages to LLM", async () => {
      const injected: LLMMessage = {
        role: "system",
        content: "extra context from RAG",
      };
      const beforeLLM = vi.fn(async (messages: LLMMessage[]) => [
        ...messages,
        injected,
      ]);

      const plugin = new AIChatPlugin(llm, storage, kvStorage, config, {
        beforeLLM,
      });

      await plugin.handle(createEvent());

      const llmCall = (llm.chat as ReturnType<typeof vi.fn>).mock.calls[0][0];
      // Should have: system, user, extra system (injected)
      expect(llmCall).toHaveLength(3);
      expect(llmCall[2]).toEqual(injected);
    });

    it("should allow replacing all messages", async () => {
      const beforeLLM = vi.fn(async (_messages: LLMMessage[], event: Event) => [
        { role: "system" as const, content: `custom prompt for ${event.userId}` },
        { role: "user" as const, content: "replaced question" },
      ]);

      const plugin = new AIChatPlugin(llm, storage, kvStorage, config, {
        beforeLLM,
      });

      await plugin.handle(createEvent());

      const llmCall = (llm.chat as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(llmCall).toHaveLength(2);
      expect(llmCall[0].content).toBe("custom prompt for user-1");
      expect(llmCall[1].content).toBe("replaced question");
    });
  });

  describe("afterLLM hook", () => {
    it("should receive the LLM response and event", async () => {
      const afterLLM = vi.fn(async (response: string) => response);
      const plugin = new AIChatPlugin(llm, storage, kvStorage, config, {
        afterLLM,
      });

      await plugin.handle(createEvent());

      expect(afterLLM).toHaveBeenCalledOnce();
      const [response, event] = afterLLM.mock.calls[0];
      expect(response).toBe("mock reply");
      expect(event.userId).toBe("user-1");
    });

    it("should pass modified response to storage and return", async () => {
      const afterLLM = vi.fn(async () => "filtered reply");
      const plugin = new AIChatPlugin(llm, storage, kvStorage, config, {
        afterLLM,
      });

      const response = await plugin.handle(createEvent());

      // Return value should be the modified response
      expect(response!.content).toBe("filtered reply");

      // Saved to storage should also be the modified response
      const saveCalls = (storage.saveMessage as ReturnType<typeof vi.fn>).mock.calls;
      const assistantSave = saveCalls.find((c: unknown[]) => c[1] === "assistant");
      expect(assistantSave[2]).toBe("filtered reply");
    });

    it("should allow transforming response (e.g. sensitive word filter)", async () => {
      const afterLLM = vi.fn(async (response: string) =>
        response.replace("mock", "***")
      );

      const plugin = new AIChatPlugin(llm, storage, kvStorage, config, {
        afterLLM,
      });

      const response = await plugin.handle(createEvent());

      expect(response!.content).toBe("*** reply");
    });
  });

  describe("both hooks together", () => {
    it("should execute beforeLLM → LLM → afterLLM in order", async () => {
      const callOrder: string[] = [];

      const beforeLLM = vi.fn(async (messages: LLMMessage[]) => {
        callOrder.push("beforeLLM");
        return messages;
      });

      const afterLLM = vi.fn(async (response: string) => {
        callOrder.push("afterLLM");
        return response;
      });

      // Spy on llm.chat to track order
      (llm.chat as ReturnType<typeof vi.fn>).mockImplementation(
        async (msgs: LLMMessage[]) => {
          callOrder.push("llm.chat");
          return "reply";
        }
      );

      const plugin = new AIChatPlugin(llm, storage, kvStorage, config, {
        beforeLLM,
        afterLLM,
      });

      await plugin.handle(createEvent());

      expect(callOrder).toEqual(["beforeLLM", "llm.chat", "afterLLM"]);
    });

    it("beforeLLM output feeds into LLM, LLM output feeds into afterLLM", async () => {
      const beforeLLM = vi.fn(async (messages: LLMMessage[]) => [
        ...messages,
        { role: "system" as const, content: "injected by beforeLLM" },
      ]);

      const afterLLM = vi.fn(async (response: string) =>
        `${response} + modified by afterLLM`
      );

      const plugin = new AIChatPlugin(llm, storage, kvStorage, config, {
        beforeLLM,
        afterLLM,
      });

      const response = await plugin.handle(createEvent());

      // LLM received the injected message
      const llmInput = (llm.chat as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(llmInput.at(-1).content).toBe("injected by beforeLLM");

      // afterLLM received the raw LLM output
      expect(afterLLM.mock.calls[0][0]).toBe("mock reply");

      // Final response is the afterLLM output
      expect(response!.content).toBe("mock reply + modified by afterLLM");
    });
  });

  describe("edge cases", () => {
    it("hooks should not be called when event is a command", async () => {
      const beforeLLM = vi.fn(async (m: LLMMessage[]) => m);
      const afterLLM = vi.fn(async (r: string) => r);

      const plugin = new AIChatPlugin(llm, storage, kvStorage, config, {
        beforeLLM,
        afterLLM,
      });

      const response = await plugin.handle(createEvent({ message: "/help" }));

      expect(response).toBeNull();
      expect(beforeLLM).not.toHaveBeenCalled();
      expect(afterLLM).not.toHaveBeenCalled();
    });

    it("hooks should not be called for group messages without @", async () => {
      const beforeLLM = vi.fn(async (m: LLMMessage[]) => m);
      const afterLLM = vi.fn(async (r: string) => r);

      const plugin = new AIChatPlugin(llm, storage, kvStorage, config, {
        beforeLLM,
        afterLLM,
      });

      const response = await plugin.handle(
        createEvent({ groupId: "group-1", groupName: "TestGroup" })
      );

      expect(response).toBeNull();
      expect(beforeLLM).not.toHaveBeenCalled();
      expect(afterLLM).not.toHaveBeenCalled();
    });

    it("afterLLM hook error should propagate (caught by plugin error handler)", async () => {
      const afterLLM = vi.fn(async () => {
        throw new Error("filter failed");
      });

      const plugin = new AIChatPlugin(llm, storage, kvStorage, config, {
        afterLLM,
      });

      // Plugin catches the error and returns null
      const response = await plugin.handle(createEvent());
      expect(response).toBeNull();
    });

    it("beforeLLM hook error should propagate (caught by plugin error handler)", async () => {
      const beforeLLM = vi.fn(async () => {
        throw new Error("RAG failed");
      });

      const plugin = new AIChatPlugin(llm, storage, kvStorage, config, {
        beforeLLM,
      });

      const response = await plugin.handle(createEvent());
      expect(response).toBeNull();
    });
  });
});
