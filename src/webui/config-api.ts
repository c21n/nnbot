/**
 * Config API — Fastify plugin
 *
 * Provides REST endpoints for reading and writing config.yaml,
 * fetching available models from LLM providers,
 * and managing persona configuration.
 *
 * API keys are stored in .env, config.yaml uses ${VAR} references.
 */

import type { FastifyInstance } from "fastify";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import axios from "axios";
import type { Config, LLMProviderConfig, MemoryConfig, ToolsConfig } from "../interfaces.js";
import type { ProvidersConfig } from "../providers/types.js";
import { ok, fail } from "./utils/response.js";
import { readEnvFile, writeEnvVars } from "./utils/env-file.js";

const CONFIG_PATH = "config.yaml";

// ── Helpers ──

/**
 * Resolve ${VAR} references in config by reading from env vars / .env
 */
function resolveEnvRefs(config: Config): Config {
  const env = readEnvFile();
  const resolve = (val: string | undefined): string => {
    if (!val) return "";
    const match = val.match(/^\$\{(.+)\}$/);
    if (match) return env[match[1]] ?? process.env[match[1]] ?? "";
    return val;
  };

  // Resolve LLM provider keys (legacy format)
  const llmProviders: Record<string, LLMProviderConfig> = {};
  for (const [name, p] of Object.entries(config.llm?.providers ?? {})) {
    llmProviders[name] = { ...p, apiKey: resolve(p.apiKey) };
  }

  // Resolve unified providers keys
  let providers: ProvidersConfig | undefined;
  if (config.providers) {
    providers = {
      list: config.providers.list.map(p => ({
        ...p,
        apiKey: resolve(p.apiKey),
      })),
      defaults: config.providers.defaults,
    };
  }

  // Resolve memory keys
  let memory: MemoryConfig | undefined;
  if (config.memory) {
    const embedding = config.memory.embedding
      ? { ...config.memory.embedding, apiKey: resolve(config.memory.embedding.apiKey) }
      : undefined;
    const llm = config.memory.llm
      ? { ...config.memory.llm, apiKey: resolve(config.memory.llm.apiKey) }
      : undefined;
    memory = { ...config.memory, ...(embedding ? { embedding } : {}), ...(llm ? { llm } : {}) };
  }

  // Resolve tools search key
  let tools: ToolsConfig | undefined;
  if (config.tools?.search) {
    tools = {
      ...config.tools,
      search: {
        ...config.tools.search,
        apiKey: resolve(config.tools.search.apiKey),
      },
    };
  }

  const resolvedWecom = config.wecom
    ? {
        ...config.wecom,
        botId: resolve(config.wecom.botId),
        secret: "",
        secretConfigured: Boolean(resolve(config.wecom.secret)),
      }
    : undefined;

  return {
    ...config,
    llm: { ...config.llm, providers: llmProviders },
    providers,
    memory,
    tools,
    ...(resolvedWecom ? { wecom: resolvedWecom } : {}),
  };
}

/**
 * Extract API keys from config and return (keys, configWithRefs).
 * Keys are written to .env, config gets ${VAR} references.
 */
function extractApiKeys(config: Config): { keys: Record<string, string>; clean: Config } {
  const keys: Record<string, string> = {};

  // Extract LLM provider keys (legacy format)
  const llmProviders: Record<string, LLMProviderConfig> = {};
  for (const [name, p] of Object.entries(config.llm?.providers ?? {})) {
    if (p.apiKey && !p.apiKey.startsWith("${")) {
      const envKey = `LLM_${name.toUpperCase()}_API_KEY`;
      keys[envKey] = p.apiKey;
      llmProviders[name] = { ...p, apiKey: `\${${envKey}}` };
    } else {
      llmProviders[name] = p;
    }
  }

  // Extract unified providers keys
  let providers: ProvidersConfig | undefined = config.providers;
  if (providers) {
    providers = {
      list: providers.list.map(p => {
        if (p.apiKey && !p.apiKey.startsWith("${")) {
          const envKey = `PROVIDER_${p.id.toUpperCase()}_API_KEY`;
          keys[envKey] = p.apiKey;
          return { ...p, apiKey: `\${${envKey}}` };
        }
        return p;
      }),
      defaults: providers.defaults,
    };
  }

  // Extract memory keys
  let memory: MemoryConfig | undefined = config.memory;
  if (memory) {
    const updates: Partial<MemoryConfig> = {};

    if (memory.embedding?.apiKey && !memory.embedding.apiKey.startsWith("${")) {
      keys.SILICONFLOW_API_KEY = memory.embedding.apiKey;
      updates.embedding = { ...memory.embedding, apiKey: "${SILICONFLOW_API_KEY}" };
    }

    if (memory.llm?.apiKey && !memory.llm.apiKey.startsWith("${")) {
      keys.DEEPSEEK_API_KEY = memory.llm.apiKey;
      updates.llm = { ...memory.llm, apiKey: "${DEEPSEEK_API_KEY}" };
    }

    if (Object.keys(updates).length > 0) {
      memory = { ...memory, ...updates };
    }
  }

  // Extract tools search key
  let tools: ToolsConfig | undefined = config.tools;
  if (tools?.search?.apiKey && !tools.search.apiKey.startsWith("${")) {
    const provider = tools.search.provider.toUpperCase();
    const envKey = `${provider}_API_KEY`;
    keys[envKey] = tools.search.apiKey;
    tools = {
      ...tools,
      search: { ...tools.search, apiKey: `\${${envKey}}` },
    };
  }

  let wecom = config.wecom;
  if (wecom) {
    const { secretConfigured: _secretConfigured, ...wecomInput } = config.wecom as NonNullable<Config["wecom"]> & {
      secretConfigured?: boolean;
    };
    wecom = { ...wecomInput };

    if (wecom.botId && !wecom.botId.startsWith("${")) {
      keys.WECOM_BOT_ID = wecom.botId;
      wecom.botId = "${WECOM_BOT_ID}";
    }

    if (wecom.secret && !wecom.secret.startsWith("${")) {
      keys.WECOM_BOT_SECRET = wecom.secret;
      wecom.secret = "${WECOM_BOT_SECRET}";
    }
  }

  return {
    keys,
    clean: {
      ...config,
      llm: { ...config.llm, providers: llmProviders },
      providers,
      memory,
      tools,
      wecom,
    },
  };
}

// ── Routes ──

type ProviderTestRequest = {
  baseUrl?: string;
  apiKey?: string;
  type?: "openai" | "ollama";
  model?: string;
};

function normalizeProviderTestUrl(baseUrl: string, type: "openai" | "ollama"): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Base URL 格式不正确");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Base URL 只支持 HTTP 或 HTTPS");
  }

  if (type === "ollama" && !/\/v1$/i.test(trimmed)) {
    return `${trimmed}/v1`;
  }

  return trimmed;
}

function getStringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getProviderTestError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const responseData = error.response?.data as {
      error?: unknown;
      message?: unknown;
    } | undefined;
    const errorObject = responseData?.error;
    const detail = getStringValue(
      typeof errorObject === "string"
        ? errorObject
        : (errorObject as { message?: unknown } | undefined)?.message
    ) ?? getStringValue(responseData?.message);

    if (status) {
      return detail
        ? `模型服务返回 HTTP ${status}: ${detail.slice(0, 180)}`
        : `模型服务返回 HTTP ${status}`;
    }

    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      return "连接模型服务超时，请检查地址、网络和服务状态";
    }

    return "无法连接到模型服务，请检查 Base URL 和网络";
  }

  if (error instanceof Error) return error.message;
  return "模型连接测试失败";
}

export async function configApi(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/config — Read current config
   */
  app.get("/api/config", async (_request, reply) => {
    try {
      if (!existsSync(CONFIG_PATH)) {
        return reply.send(ok({
          server: { host: "0.0.0.0", port: 8080 },
          onebot: { url: "http://127.0.0.1:3000" },
          llm: { currentProvider: "", providers: {} },
          storage: { type: "sqlite", path: "data/bot.db" },
          plugins: { enabled: [], disabled: [] },
          admin: { userIds: [], commands: [] },
          context: { historyLimit: 10 },
          rules: [],
        }));
      }

      const content = readFileSync(CONFIG_PATH, "utf-8");
      const raw = parseYaml(content) as Config;

      // Resolve ${VAR} references so WebUI shows actual values
      const config = resolveEnvRefs(raw);

      return reply.send(ok(config));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(500).send(fail(message));
    }
  });

  /**
   * PUT /api/config — Save config to file
   *
   * API keys are extracted and written to .env,
   * config.yaml stores ${VAR} references.
   */
  app.put("/api/config", async (request, reply) => {
    try {
      const config = request.body as Config;

      if (!config.server || !config.llm) {
        return reply.status(400).send(fail("Missing required config sections"));
      }

      // Preserve masked Enterprise WeChat secrets when the WebUI leaves them blank.
      const storedConfig = existsSync(CONFIG_PATH)
        ? parseYaml(readFileSync(CONFIG_PATH, "utf-8")) as Config
        : undefined;
      const storedWecom = storedConfig?.wecom;
      const storedLLMProviders = storedConfig?.llm?.providers ?? {};
      const storedProviders = new Map(
        (storedConfig?.providers?.list ?? []).map(provider => [provider.id, provider])
      );
      const configToSave: Config = {
        ...config,
        llm: {
          ...config.llm,
          providers: Object.fromEntries(
            Object.entries(config.llm.providers ?? {}).map(([id, provider]) => [
              id,
              {
                ...provider,
                // Keep an existing env reference when the WebUI leaves the key blank.
                apiKey: provider.apiKey || storedLLMProviders[id]?.apiKey || "",
              },
            ])
          ),
        },
        ...(config.providers
          ? {
              providers: {
                ...config.providers,
                list: config.providers.list.map(provider => ({
                  ...provider,
                  // Keep an existing env reference when the WebUI leaves the key blank.
                  apiKey: provider.apiKey || storedProviders.get(provider.id)?.apiKey,
                })),
              },
            }
          : {}),
        ...(config.wecom && storedWecom
          ? {
              wecom: {
                ...config.wecom,
                botId: config.wecom.botId || storedWecom.botId,
                secret: config.wecom.secret || storedWecom.secret,
              },
            }
          : {}),
      };

      // Extract API keys to .env, replace with ${VAR} refs.
      const { keys, clean } = extractApiKeys(configToSave);

      if (Object.keys(keys).length > 0) {
        writeEnvVars(keys);
      }

      const yaml = stringifyYaml(clean, { indent: 2 });
      writeFileSync(CONFIG_PATH, yaml, "utf-8");

      return reply.send(ok(undefined));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(500).send(fail(message));
    }
  });

  /**
   * POST /api/llm/models — Fetch available models from an LLM provider
   */
  app.post("/api/llm/models", async (request, reply) => {
    const { baseUrl, apiKey } = request.body as {
      baseUrl?: string;
      apiKey?: string;
    };

    if (!baseUrl) {
      return reply.status(400).send(fail("baseUrl is required"));
    }

    try {
      const client = axios.create({
        baseURL: baseUrl,
        headers: {
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          "Content-Type": "application/json",
        },
        timeout: 10000,
      });

      const response = await client.get("/models");
      const models = (response.data.data ?? response.data) as Array<{
        id: string;
      }>;

      return reply.send(ok(models.map((m) => m.id)));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.send(fail(message));
    }
  });

  /**
   * POST /api/providers/models — Fetch models from a provider (supports both OpenAI and Ollama)
   */
  app.post("/api/providers/models", async (request, reply) => {
    const { baseUrl, apiKey, type } = request.body as {
      baseUrl?: string;
      apiKey?: string;
      type?: "openai" | "ollama";
    };

    if (!baseUrl) {
      return reply.status(400).send(fail("baseUrl is required"));
    }

    try {
      const providerType = type || "openai";
      let models: string[] = [];

      if (providerType === "ollama") {
        // Ollama uses /api/tags endpoint
        const client = axios.create({
          baseURL: baseUrl,
          timeout: 10000,
        });
        const response = await client.get("/api/tags");
        models = (response.data.models ?? []).map((m: { name: string }) => m.name);
      } else {
        // OpenAI-compatible uses /models endpoint
        const client = axios.create({
          baseURL: baseUrl,
          headers: {
            ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
            "Content-Type": "application/json",
          },
          timeout: 10000,
        });
        const response = await client.get("/models");
        const rawModels = (response.data.data ?? response.data) as Array<{ id: string }>;
        models = rawModels.map((m) => m.id);
      }

      return reply.send(ok(models));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.send(fail(message));
    }
  });

  /**
   * POST /api/providers/test — Test a provider endpoint and a model with a short chat request
   */
  app.post("/api/providers/test", async (request, reply) => {
    const body = (request.body ?? {}) as ProviderTestRequest;
    const type = body.type === "ollama" ? "ollama" : "openai";
    const baseUrl = body.baseUrl?.trim() ?? "";
    const model = body.model?.trim() ?? "";
    const apiKey = body.apiKey?.trim() ?? "";

    if (!baseUrl) {
      return reply.status(400).send(fail("请填写 Base URL"));
    }
    if (!model) {
      return reply.status(400).send(fail("请填写要测试的模型 ID"));
    }

    let endpoint: string;
    try {
      endpoint = normalizeProviderTestUrl(baseUrl, type);
    } catch (error) {
      return reply.status(400).send(fail(error instanceof Error ? error.message : "Base URL 无效"));
    }

    const startedAt = Date.now();

    try {
      const client = axios.create({
        baseURL: endpoint,
        headers: {
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          "Content-Type": "application/json",
        },
        timeout: 15000,
      });
      const response = await client.post("/chat/completions", {
        model,
        messages: [{ role: "user", content: "Reply with OK only." }],
        temperature: 0,
        max_tokens: 8,
      });

      const responseData = response.data as {
        model?: unknown;
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const preview = getStringValue(responseData.choices?.[0]?.message?.content);

      if (!preview) {
        return reply.send(fail("模型接口已响应，但没有返回文本"));
      }

      return reply.send(ok({
        model: getStringValue(responseData.model) ?? model,
        latencyMs: Date.now() - startedAt,
        preview: preview.slice(0, 240),
      }));
    } catch (error) {
      return reply.send(fail(getProviderTestError(error)));
    }
  });

  /** Persona customization is intentionally disabled for the fixed workbench policy. */
  app.all("/api/persona", async (_request, reply) => (
    reply.status(404).send(fail("自定义人格已关闭，机器人使用统一系统提示词。"))
  ));
}
