/**
 * Configuration Manager
 *
 * Loads and manages bot configuration from YAML file.
 * Supports environment variable substitution.
 */

import { readFileSync } from "fs";
import { parse as parseYaml } from "yaml";
import type { Config } from "../interfaces.js";

const DEFAULT_CONFIG: Config = {
  server: {
    host: "0.0.0.0",
    port: 8080,
  },
  onebot: {
    url: "http://127.0.0.1:3000",
    accessToken: undefined,
  },
  llm: {
    provider: "openai_compatible",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-3.5-turbo",
    temperature: 0.7,
    maxTokens: 1000,
  },
  storage: {
    type: "sqlite",
    path: "data/bot.db",
  },
  plugins: {
    enabled: ["ai_chat", "rule_match", "admin"],
    disabled: [],
  },
  rules: [],
  admin: {
    userIds: [],
    commands: ["/help", "/plugins", "/status", "/clear"],
  },
  context: {
    historyLimit: 10,
  },
};

export class ConfigManager {
  private config: Config | null = null;

  load(configPath: string = "config.yaml"): Config {
    try {
      const content = readFileSync(configPath, "utf-8");
      const raw = parseYaml(content);

      // Merge with defaults
      this.config = this.mergeConfig(DEFAULT_CONFIG, raw);

      // Substitute environment variables
      this.config = this.substituteEnvVars(this.config);

      console.log(`✓ Configuration loaded from ${configPath}`);
      return this.config;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        console.log(`⚠ Config file not found, using defaults`);
        this.config = { ...DEFAULT_CONFIG };
        return this.config;
      }
      throw error;
    }
  }

  get(): Config {
    if (!this.config) {
      return this.load();
    }
    return this.config;
  }

  private mergeConfig(defaults: Config, overrides: Partial<Config>): Config {
    return {
      server: { ...defaults.server, ...overrides.server },
      onebot: { ...defaults.onebot, ...overrides.onebot },
      llm: { ...defaults.llm, ...overrides.llm },
      storage: { ...defaults.storage, ...overrides.storage },
      plugins: { ...defaults.plugins, ...overrides.plugins },
      rules: overrides.rules ?? defaults.rules,
      admin: { ...defaults.admin, ...overrides.admin },
      context: { ...defaults.context, ...overrides.context },
    };
  }

  private substituteEnvVars(config: Config): Config {
    const substitute = (value: unknown): unknown => {
      if (typeof value === "string" && value.startsWith("${") && value.endsWith("}")) {
        const envVar = value.slice(2, -1);
        return process.env[envVar] ?? "";
      }
      return value;
    };

    return {
      ...config,
      llm: {
        ...config.llm,
        apiKey: substitute(config.llm.apiKey) as string,
      },
      onebot: {
        ...config.onebot,
        accessToken: substitute(config.onebot.accessToken) as string | undefined,
      },
    };
  }
}
