/**
 * Configuration Manager
 *
 * Loads and manages bot configuration from YAML file.
 * Supports environment variable substitution.
 */

import { readFileSync } from "fs";
import { parse as parseYaml } from "yaml";
import type { Config, LLMConfig, LLMProviderConfig } from "../interfaces.js";

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
    currentProvider: "default",
    providers: {
      default: {
        baseUrl: "https://api.openai.com/v1",
        apiKey: "",
        model: "gpt-3.5-turbo",
        temperature: 0.7,
        maxTokens: 1000,
      },
    },
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
      llm: this.mergeLlmConfig(defaults.llm, overrides.llm),
      storage: { ...defaults.storage, ...overrides.storage },
      plugins: { ...defaults.plugins, ...overrides.plugins },
      rules: overrides.rules ?? defaults.rules,
      admin: { ...defaults.admin, ...overrides.admin },
      context: { ...defaults.context, ...overrides.context },
    };
  }

  /**
   * Merge LLM config with backward compatibility.
   * Old flat format ({ baseUrl, apiKey, model }) is migrated to multi-provider format.
   */
  private mergeLlmConfig(defaults: LLMConfig, overrides?: Partial<LLMConfig>): LLMConfig {
    if (!overrides) return defaults;

    // Backward compat: old flat format has baseUrl but no providers
    if ("baseUrl" in overrides && !("providers" in overrides)) {
      const old = overrides as Record<string, unknown>;
      return {
        currentProvider: "default",
        providers: {
          default: {
            baseUrl: (old.baseUrl as string) ?? defaults.providers.default.baseUrl,
            apiKey: (old.apiKey as string) ?? defaults.providers.default.apiKey,
            model: (old.model as string) ?? defaults.providers.default.model,
            temperature: (old.temperature as number) ?? defaults.providers.default.temperature,
            maxTokens: (old.maxTokens as number) ?? defaults.providers.default.maxTokens,
          },
        },
      };
    }

    // New multi-provider format
    return {
      currentProvider: overrides.currentProvider ?? defaults.currentProvider,
      providers: { ...defaults.providers, ...overrides.providers },
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

    // Substitute env vars in all LLM providers
    const providers: Record<string, typeof config.llm.providers[string]> = {};
    for (const [name, provider] of Object.entries(config.llm.providers)) {
      providers[name] = {
        ...provider,
        apiKey: substitute(provider.apiKey) as string,
      };
    }

    return {
      ...config,
      llm: { ...config.llm, providers },
      onebot: {
        ...config.onebot,
        accessToken: substitute(config.onebot.accessToken) as string | undefined,
      },
    };
  }
}

/**
 * Resolve the active LLM provider config.
 * Throws if currentProvider is not found in providers.
 */
export function resolveLLMProvider(llm: LLMConfig): LLMProviderConfig & { name: string } {
  const provider = llm.providers[llm.currentProvider];
  if (!provider) {
    const available = Object.keys(llm.providers).join(", ");
    throw new Error(
      `LLM provider "${llm.currentProvider}" not found. Available: ${available}`
    );
  }
  return { name: llm.currentProvider, ...provider };
}
