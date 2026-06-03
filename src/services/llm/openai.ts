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
import type {
  ILLMService,
  LLMMessage,
  LLMChatOptions,
} from "../../interfaces.js";

export class OpenAICompatibleService implements ILLMService {
  private client: AxiosInstance;
  private defaultModel: string;
  private defaultTemperature: number;
  private defaultMaxTokens: number;
  private availableModels: string[] = [];

  constructor(
    private baseUrl: string,
    private apiKey: string,
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
      console.error("\x1b[31m[LLM] No models available\x1b[0m");
      return;
    }

    // If no model configured or configured model not found, use first available
    if (!this.defaultModel || !this.availableModels.includes(this.defaultModel)) {
      this.defaultModel = this.availableModels[0];
    }

    console.log(`\x1b[32m[LLM] Available models: ${this.availableModels.join(", ")}\x1b[0m`);
    console.log(`\x1b[32m[LLM] Using model: ${this.defaultModel}\x1b[0m`);
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

  async listModels(): Promise<string[]> {
    try {
      const response = await this.client.get("/models");
      const models = response.data.data ?? response.data;
      return models.map((model: { id: string }) => model.id);
    } catch {
      return [];
    }
  }

  getDefaultModel(): string {
    return this.defaultModel;
  }
}
