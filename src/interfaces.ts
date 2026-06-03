/**
 * Core interfaces and types for the QQ Bot system
 *
 * This file defines all the abstract interfaces that the system depends on.
 * Following the Dependency Inversion Principle: all components depend on
 * these interfaces, not on concrete implementations.
 */

// ============ Enums ============

/**
 * Event types that the bot can handle
 */
export enum EventType {
  PRIVATE_MESSAGE = "private_message",
  GROUP_MESSAGE = "group_message",
}

// ============ Data Classes ============

/**
 * Event data class (immutable)
 * Represents an incoming message from OneBot
 */
export interface Event {
  readonly type: EventType;
  readonly userId: string;
  readonly nickname: string;
  readonly groupId: string | null;
  readonly groupName: string | null;
  readonly message: string;
  readonly timestamp: number;
  readonly raw: Record<string, unknown>;
}

/**
 * Response data class (immutable)
 * Represents a reply to send back
 */
export interface Response {
  readonly content: string;
  readonly replyTo?: boolean;
  readonly atSender?: boolean;
  readonly extra?: Record<string, unknown>;
}

// ============ Plugin Interface ============

/**
 * Plugin interface - all plugins must implement this
 */
export interface IPlugin {
  readonly name: string;
  readonly version: string;
  readonly description: string;

  /**
   * Called when the plugin is loaded
   * Use this to initialize resources
   */
  onLoad(): Promise<void>;

  /**
   * Called when the plugin is unloaded
   * Use this to cleanup resources
   */
  onUnload(): Promise<void>;

  /**
   * Handle an event
   * @returns Response if handled, null to skip and let next plugin handle
   */
  handle(event: Event): Promise<Response | null>;

  /**
   * Get plugin help information
   */
  help(): string;
}

// ============ Storage Interfaces ============

/**
 * Key-Value storage interface
 */
export interface IKVStorage {
  set(key: string, value: unknown, ttl?: number): Promise<void>;
  get(key: string): Promise<unknown | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

/**
 * Conversation storage interface
 */
export interface IConversationStorage {
  saveMessage(userId: string, role: string, content: string): Promise<void>;
  getHistory(userId: string, limit?: number): Promise<ConversationMessage[]>;
  clearHistory(userId: string): Promise<void>;
}

/**
 * Conversation message structure
 */
export interface ConversationMessage {
  role: string;
  content: string;
  timestamp: string;
}

/**
 * Combined storage interface (used by plugins)
 */
export type IStorage = IKVStorage & IConversationStorage;

// ============ LLM Interface ============

/**
 * LLM Service interface
 */
export interface ILLMService {
  /**
   * Send messages and get a complete response
   */
  chat(
    messages: LLMMessage[],
    options?: LLMChatOptions
  ): Promise<string>;

  /**
   * Send messages and get a streaming response
   */
  chatStream(
    messages: LLMMessage[],
    options?: LLMChatOptions
  ): AsyncGenerator<string>;

  /**
   * List available models
   */
  listModels(): Promise<string[]>;
}

/**
 * LLM message structure
 */
export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * LLM chat options
 */
export interface LLMChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

// ============ AI Chat Hooks ============

/**
 * Hooks for intercepting LLM calls in AIChatPlugin.
 * All hooks are optional. When absent, the pipeline passes data through unchanged.
 */
export interface AIChatHooks {
  /**
   * Called before LLM chat — can modify, append, or filter messages.
   * Return the (possibly new) messages array to pass to the LLM.
   */
  beforeLLM?: (
    messages: LLMMessage[],
    event: Event
  ) => Promise<LLMMessage[]>;

  /**
   * Called after LLM chat — can modify the response text.
   * Return the (possibly new) response string.
   */
  afterLLM?: (
    response: string,
    event: Event
  ) => Promise<string>;
}

// ============ Plugin Services ============

/**
 * Services available to plugins via handle(event, services)
 * Injected by PluginManager, not manually constructed
 */
export interface PluginServices {
  readonly llm: ILLMService;
  readonly storage: IStorage;
  readonly config: Config;
  readonly pluginManager: IPluginManager;
}

// ============ Plugin Definition ============

/**
 * Plugin definition passed to createPlugin()
 * Only name and handle are required
 */
export interface PluginDefinition {
  /** Plugin unique name (required) */
  readonly name: string;

  /** Plugin description (optional, default: "") */
  readonly description?: string;

  /** Version string (optional, default: "1.0.0") */
  readonly version?: string;

  /** Execution priority, lower = earlier (optional, default: 100) */
  readonly priority?: number;

  /** Help text (optional, default: "") */
  readonly help?: string;

  /**
   * Event handler (required)
   * @returns Response if handled, null to skip
   */
  handle(event: Event, services: PluginServices): Promise<Response | null>;

  /** Called when plugin is loaded (optional) */
  onLoad?(services: PluginServices): Promise<void>;

  /** Called when plugin is unloaded (optional) */
  onUnload?(): Promise<void>;
}

// ============ Plugin Loader Interface ============

/**
 * Plugin loader interface
 * Handles directory scanning and dynamic import
 */
export interface IPluginLoader {
  /**
   * Load all plugins from a directory
   * @param dir - Absolute path to plugins directory
   * @param services - Services to inject into plugins
   * @returns Array of loaded plugins (sorted by priority)
   */
  loadFromDir(dir: string, services: PluginServices): Promise<IPlugin[]>;

  /**
   * Load a single plugin file
   * @param filePath - Absolute path to plugin file
   * @param services - Services to inject
   * @returns Loaded plugin or null if failed
   */
  loadPlugin(filePath: string, services: PluginServices): Promise<IPlugin | null>;
}

// ============ Hot Reload Interface ============

/**
 * Hot reload manager interface
 * Manages file watching and plugin reloading
 */
export interface IHotReloadManager {
  /** Start watching directory for changes */
  startWatching(dir: string): Promise<void>;

  /** Stop watching */
  stopWatching(): void;

  /** Check if currently watching */
  isWatching(): boolean;
}

// ============ Plugin Manager Interface ============

/**
 * Plugin manager interface
 */
export interface IPluginManager {
  register(plugin: IPlugin): Promise<void>;
  unregister(plugin: IPlugin): Promise<void>;
  dispatch(event: Event): Promise<Response | null>;
  getPlugins(): IPlugin[];
  getPlugin(name: string): IPlugin | undefined;

  /** Load plugins from directory */
  loadFromDir(dir: string, services: PluginServices): Promise<void>;

  /** Reload a specific plugin by name */
  reloadPlugin(name: string, services: PluginServices): Promise<void>;

  /** Reload all plugins */
  reloadAll(services: PluginServices): Promise<void>;
}

// ============ Configuration ============

/**
 * Server configuration
 */
export interface ServerConfig {
  host: string;
  port: number;
}

/**
 * OneBot configuration
 */
export interface OneBotConfig {
  url: string;
  accessToken?: string;
}

/**
 * LLM configuration
 */
export interface LLMConfig {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

/**
 * Storage configuration
 */
export interface StorageConfig {
  type: "sqlite" | "memory";
  path: string;
}

/**
 * Plugin configuration
 */
export interface PluginConfig {
  enabled: string[];
  disabled: string[];
  ai_chat?: {
    llm?: {
      baseUrl: string;
      apiKey: string;
      model: string;
      temperature?: number;
      maxTokens?: number;
    };
  };
}

/**
 * Rule definition
 */
export interface Rule {
  pattern: string;
  reply: string;
}

/**
 * Admin configuration
 */
export interface AdminConfig {
  userIds: string[];
  commands: string[];
}

/**
 * Root configuration
 */
export interface Config {
  server: ServerConfig;
  onebot: OneBotConfig;
  llm: LLMConfig;
  storage: StorageConfig;
  plugins: PluginConfig;
  rules: Rule[];
  admin: AdminConfig;
  context: ContextConfig;
}

/**
 * Context memory configuration
 */
export interface ContextConfig {
  historyLimit: number;
}
