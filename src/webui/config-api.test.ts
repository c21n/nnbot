import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configApi } from "./config-api.js";

describe("provider connection test API", () => {
  let app: FastifyInstance;
  let upstream: Server;
  let upstreamUrl: string;

  beforeEach(async () => {
    upstream = createServer((request, response) => {
      if (request.url !== "/v1/chat/completions" || request.method !== "POST") {
        response.writeHead(404);
        response.end();
        return;
      }

      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
          model?: string;
          messages?: Array<{ content?: string }>;
        };

        if (request.headers.authorization !== "Bearer test-key") {
          response.writeHead(401, { "Content-Type": "application/json" });
          response.end(JSON.stringify({ error: { message: "invalid api key" } }));
          return;
        }

        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({
          model: payload.model,
          choices: [{ message: { content: payload.messages?.[0]?.content ? "OK" : "" } }],
        }));
      });
    });

    await new Promise<void>((resolve, reject) => {
      upstream.once("error", reject);
      upstream.listen(0, "127.0.0.1", resolve);
    });
    const address = upstream.address() as AddressInfo;
    upstreamUrl = `http://127.0.0.1:${address.port}`;

    app = Fastify({ logger: false });
    await app.register(configApi);
  });

  afterEach(async () => {
    await app.close();
    await new Promise<void>((resolve, reject) => {
      upstream.close(error => (error ? reject(error) : resolve()));
    });
  });

  it("sends a real chat request with the configured model and returns the preview", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/providers/test",
      payload: {
        baseUrl: `${upstreamUrl}/v1`,
        apiKey: "test-key",
        model: "demo-model",
        type: "openai",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      success: true,
      data: { model: "demo-model", preview: "OK" },
    });
  });

  it("returns a safe error when the provider rejects the key", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/providers/test",
      payload: {
        baseUrl: `${upstreamUrl}/v1`,
        apiKey: "wrong-key",
        model: "demo-model",
        type: "openai",
      },
    });

    const body = response.json() as { success: boolean; error?: string };
    expect(response.statusCode).toBe(200);
    expect(body.success).toBe(false);
    expect(body.error).toContain("HTTP 401");
    expect(body.error).not.toContain("wrong-key");
  });
});
