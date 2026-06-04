/**
 * Configuration Manager
 *
 * Loads and manages bot configuration from YAML file.
 * Supports environment variable substitution.
 */

import { readFileSync } from "fs";
import { parse as parseYaml } from "yaml";
import type { Config, LLMConfig, LLMProviderConfig } from "../interfaces.js";
import type { ProvidersConfig, ProviderConfig } from "../providers/types.js";

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
    messageBufferDelay: 3000,
    summaryCompressThreshold: 10,
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
      tools: overrides.tools,
      providers: overrides.providers ?? defaults.providers,
      memory: overrides.memory ?? defaults.memory,
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

    // Substitute env vars in memory config
    let memory: typeof config.memory;
    if (config.memory) {
      const embedding = config.memory.embedding
        ? { ...config.memory.embedding, apiKey: substitute(config.memory.embedding.apiKey) as string }
        : undefined;
      const llm = config.memory.llm
        ? { ...config.memory.llm, apiKey: substitute(config.memory.llm.apiKey) as string }
        : undefined;
      memory = { ...config.memory, ...(embedding ? { embedding } : {}), ...(llm ? { llm } : {}) };
    }

    // Substitute env vars in tools config
    let tools: typeof config.tools;
    if (config.tools?.search) {
      tools = {
        ...config.tools,
        search: {
          ...config.tools.search,
          apiKey: substitute(config.tools.search.apiKey) as string,
        },
      };
    }

    // Substitute env vars in providers config
    let providersConfig = config.providers;
    if (providersConfig) {
      providersConfig = {
        ...providersConfig,
        list: providersConfig.list.map(p => ({
          ...p,
          apiKey: p.apiKey ? (substitute(p.apiKey) as string) : undefined,
        })),
      };
    }

    return {
      ...config,
      llm: { ...config.llm, providers },
      onebot: {
        ...config.onebot,
        accessToken: substitute(config.onebot.accessToken) as string | undefined,
      },
      memory,
      tools,
      providers: providersConfig,
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

/**
 * Resolve unified providers config.
 * If config.providers is set, use it directly.
 * Otherwise, generate from existing llm.providers and memory config.
 */
export function resolveProvidersConfig(config: Config): ProvidersConfig {
  // If explicit providers config exists, use it
  if (config.providers) {
    return config.providers;
  }

  // Generate from existing configs
  const list: ProviderConfig[] = []
  const defaults: ProvidersConfig['defaults'] = {}

  // Migrate llm.providers
  for (const [name, provider] of Object.entries(config.llm.providers)) {
    list.push({
      id: name,
      type: 'openai',
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      defaultModel: provider.model,
    })
  }

  // Set default LLM from currentProvider
  const currentLLM = config.llm.providers[config.llm.currentProvider]
  if (currentLLM) {
    defaults.llm = {
      providerId: config.llm.currentProvider,
      modelId: currentLLM.model,
    }
  }

  // Migrate memory embedding config
  if (config.memory?.embedding?.apiKey) {
    const existingId = 'siliconflow'
    const existingProvider = list.find(p => p.id === existingId)
    if (!existingProvider) {
      list.push({
        id: existingId,
        type: 'openai',
        baseUrl: 'https://api.siliconflow.cn/v1',
        apiKey: config.memory.embedding.apiKey,
        defaultModel: config.memory.embedding.model || 'BAAI/bge-large-zh-v1.5',
      })
    }
    defaults.embedding = {
      providerId: existingId,
      modelId: config.memory.embedding.model || 'BAAI/bge-large-zh-v1.5',
      dimension: config.memory.embedding.dimension || 1024,
    }
  }

  // Migrate memory llm config
  if (config.memory?.llm?.apiKey) {
    const existingId = 'deepseek-memory'
    const existingProvider = list.find(p => p.id === 'deepseek')
    if (existingProvider) {
      // Reuse existing deepseek provider
      defaults.llm = {
        providerId: 'deepseek',
        modelId: existingProvider.defaultModel || 'deepseek-chat',
      }
    } else {
      list.push({
        id: existingId,
        type: 'openai',
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: config.memory.llm.apiKey,
        defaultModel: 'deepseek-chat',
      })
      defaults.llm = {
        providerId: existingId,
        modelId: 'deepseek-chat',
      }
    }
  }

  return { list, defaults }
}
