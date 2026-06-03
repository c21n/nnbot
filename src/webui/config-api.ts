/**
 * Config API — Fastify plugin
 *
 * Provides REST endpoints for reading and writing config.yaml,
 * fetching available models from LLM providers,
 * and managing persona configuration.
 */

import type { FastifyInstance } from "fastify";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import axios from "axios";
import type { Config } from "../interfaces.js";

const CONFIG_PATH = "config.yaml";
const PERSONA_PATH = "persona.yaml";

export async function configApi(app: FastifyInstance): Promise<void> {
  /**
   * GET /api/config — Read current config
   */
  app.get("/api/config", async (_request, reply) => {
    try {
      const content = readFileSync(CONFIG_PATH, "utf-8");
      const config = parseYaml(content) as Config;
      return reply.send({ success: true, data: config });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(500).send({ success: false, error: message });
    }
  });

  /**
   * PUT /api/config — Save config to file
   */
  app.put("/api/config", async (request, reply) => {
    try {
      const config = request.body as Config;

      if (!config.server || !config.llm) {
        return reply.status(400).send({
          success: false,
          error: "Missing required config sections",
        });
      }

      const yaml = stringifyYaml(config, { indent: 2 });
      writeFileSync(CONFIG_PATH, yaml, "utf-8");

      return reply.send({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(500).send({ success: false, error: message });
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
      return reply.status(400).send({
        success: false,
        error: "baseUrl is required",
      });
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

      return reply.send({
        success: true,
        data: models.map((m) => m.id),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.send({ success: false, error: message });
    }
  });

  /**
   * GET /api/persona — Read current persona config
   */
  app.get("/api/persona", async (_request, reply) => {
    try {
      if (!existsSync(PERSONA_PATH)) {
        return reply.send({
          success: true,
          data: { default: "", users: {} },
        });
      }

      const content = readFileSync(PERSONA_PATH, "utf-8");
      const config = parseYaml(content) as { default?: string; users?: Record<string, string> };

      return reply.send({
        success: true,
        data: {
          default: config.default || "",
          users: config.users || {},
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(500).send({ success: false, error: message });
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

      return reply.send({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return reply.status(500).send({ success: false, error: message });
    }
  });
}
