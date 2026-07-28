/**
 * OpenAI Compatible LLM Service
 *
 * Supports any API that follows OpenAI's chat completions format:
 * - OpenAI
 * - Azure OpenAI
 * - Ollama
 * - LocalAI
 * - Any OpenAI-compatible proxy
 */

import axios, { type AxiosInstance } from "axios";
import { randomUUID } from "crypto";
import type {
  ILLMService,
  LLMMessage,
  LLMChatOptions,
  LLMResponse,
} from "../../interfaces.js";
import type { ITool } from "../tools/types.js";
import { toolToOpenAISchema } from "../tools/schema-adapter.js";
import { logger } from "../../core/logger.js";

export class OpenAICompatibleService implements ILLMService {
  private client: AxiosInstance;
  private defaultModel: string;
  private defaultTemperature: number;
  private defaultMaxTokens: number;
  private availableModels: string[] = [];

  constructor(
    baseUrl: string,
    apiKey: string,
    options: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
    } = {}
  ) {
    this.defaultModel = options.model ?? "";
    this.defaultTemperature = options.temperature ?? 0.7;
    this.defaultMaxTokens = options.maxTokens ?? 1000;

    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      timeout: 60000,
    });
  }

  /**
   * Initialize: fetch available models and select default
   */
  async init(): Promise<void> {
    this.availableModels = await this.listModels();

    if (this.availableModels.length === 0) {
      logger.error("[LLM] No models available; check the provider API key and base URL");
      return;
    }

    // If no model configured or configured model not found, use first available
    if (!this.defaultModel || !this.availableModels.includes(this.defaultModel)) {
      this.defaultModel = this.availableModels[0];
    }

    logger.info(`[LLM] Available models: ${this.availableModels.join(", ")}`);
    logger.info(`[LLM] Using model: ${this.defaultModel}`);
  }

  async chat(
    messages: LLMMessage[],
    options?: LLMChatOptions
  ): Promise<string> {
    const response = await this.client.post("/chat/completions", {
      model: options?.model ?? this.defaultModel,
      messages,
      temperature: options?.temperature ?? this.defaultTemperature,
      max_tokens: options?.maxTokens ?? this.defaultMaxTokens,
    });

    return response.data.choices[0].message.content;
  }

  async *chatStream(
    messages: LLMMessage[],
    options?: LLMChatOptions
  ): AsyncGenerator<string> {
    const response = await this.client.post(
      "/chat/completions",
      {
        model: options?.model ?? this.defaultModel,
        messages,
        temperature: options?.temperature ?? this.defaultTemperature,
        max_tokens: options?.maxTokens ?? this.defaultMaxTokens,
        stream: true,
      },
      { responseType: "stream" }
    );

    const stream = response.data;

    for await (const chunk of stream) {
      const lines = chunk
        .toString()
        .split("\n")
        .filter((line: string) => line.trim() !== "");

      for (const line of lines) {
        const trimmedLine = line.replace(/^data: /, "");

        if (trimmedLine === "[DONE]") {
          return;
        }

        try {
          const data = JSON.parse(trimmedLine);
          const content = data.choices[0]?.delta?.content;
          if (content) {
            yield content;
          }
        } catch {
          // Skip invalid JSON lines
        }
      }
    }
  }

  async chatWithTools(
    messages: LLMMessage[],
    tools: ITool[],
    options?: LLMChatOptions
  ): Promise<LLMResponse> {
    // Convert messages to OpenAI format (handle tool role)
    const openaiMessages = messages.map((msg) => {
      if (msg.role === "tool") {
        return {
          role: "tool" as const,
          tool_call_id: msg.toolCallId,
          content: msg.content,
        };
      }
      if (msg.role === "assistant" && msg.toolCalls && msg.toolCalls.length > 0) {
        return {
          role: "assistant" as const,
          content: msg.content || null,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        };
      }
      return {
        role: msg.role,
        content: msg.content,
      };
    });

    // Convert tools to OpenAI format
    const toolSchemas = tools.map(toolToOpenAISchema);

    const response = await this.client.post("/chat/completions", {
      model: options?.model ?? this.defaultModel,
      messages: openaiMessages,
      temperature: options?.temperature ?? this.defaultTemperature,
      max_tokens: options?.maxTokens ?? this.defaultMaxTokens,
      tools: toolSchemas.length > 0 ? toolSchemas : undefined,
      tool_choice: toolSchemas.length > 0 ? "auto" : undefined,
    });

    const choice = response.data.choices[0];
    const message = choice.message;

    // Parse tool calls
    const toolCalls = (message.tool_calls ?? []).map(
      (tc: { id: string; function: { name: string; arguments: string } }) => ({
        id: tc.id || randomUUID(),
        name: tc.function.name,
        arguments: parseToolArguments(tc.function.arguments),
      })
    );

    const done = toolCalls.length === 0 || choice.finish_reason === "stop";

    return {
      content: message.content ?? null,
      toolCalls,
      done,
    };
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await this.client.get("/models");
      const models = response.data.data ?? response.data;
      return models.map((model: { id: string }) => model.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[LLM] Failed to fetch models: ${message}`);
      return [];
    }
  }

  getDefaultModel(): string {
    return this.defaultModel;
  }
}

/**
 * Parse tool arguments from JSON string
 * Returns empty object on parse failure (LLM might send malformed JSON)
 */
function parseToolArguments(jsonStr: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(jsonStr);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}
