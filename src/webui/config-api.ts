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
import type { Config, LLMProviderConfig, MemoryConfig } from "../interfaces.js";
import { ok, fail } from "./utils/response.js";
import { readEnvFile, writeEnvVars } from "./utils/env-file.js";

const CONFIG_PATH = "config.yaml";
const PERSONA_PATH = "persona.yaml";

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

  // Resolve LLM provider keys
  const providers: Record<string, LLMProviderConfig> = {};
  for (const [name, p] of Object.entries(config.llm?.providers ?? {})) {
    providers[name] = { ...p, apiKey: resolve(p.apiKey) };
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

  return { ...config, llm: { ...config.llm, providers }, memory };
}

/**
 * Extract API keys from config and return (keys, configWithRefs).
 * Keys are written to .env, config gets ${VAR} references.
 */
function extractApiKeys(config: Config): { keys: Record<string, string>; clean: Config } {
  const keys: Record<string, string> = {};

  // Extract LLM provider keys
  const providers: Record<string, LLMProviderConfig> = {};
  for (const [name, p] of Object.entries(config.llm?.providers ?? {})) {
    if (p.apiKey && !p.apiKey.startsWith("${")) {
      const envKey = `LLM_${name.toUpperCase()}_API_KEY`;
      keys[envKey] = p.apiKey;
      providers[name] = { ...p, apiKey: `\${${envKey}}` };
    } else {
      providers[name] = p;
    }
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

  return { keys, clean: { ...config, llm: { ...config.llm, providers }, memory } };
}

// ── Routes ──

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

      // Extract API keys → .env, replace with ${VAR} refs
      const { keys, clean } = extractApiKeys(config);

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
   * GET /api/persona — Read current persona config
   */
  app.get("/api/persona", async (_request, reply) => {
    try {
      if (!existsSync(PERSONA_PATH)) {
        return reply.send(ok({ default: "", users: {} }));
      }

      const content = readFileSync(PERSONA_PATH, "utf-8");
      const config = parseYaml(content) as { default?: string; users?: Record<string, string> };

      return reply.send(ok({
        default: config.default || "",
        users: config.users || {},
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(500).send(fail(message));
    }
  });

  /**
   * PUT /api/persona — Save persona config to file
   */
  app.put("/api/persona", async (request, reply) => {
    try {
      const { default: defaultPersona, users } = request.body as {
        default?: string;
        users?: Record<string, string>;
      };

      const config: Record<string, unknown> = {};
      if (defaultPersona) {
        config.default = defaultPersona;
      }
      if (users && Object.keys(users).length > 0) {
        config.users = users;
      }

      const yaml = stringifyYaml(config, { indent: 2 });
      writeFileSync(PERSONA_PATH, yaml, "utf-8");

      return reply.send(ok(undefined));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(500).send(fail(message));
    }
  });
}
