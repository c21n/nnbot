/**
 * Persona Service
 *
 * Manages bot personality from persona.yaml file.
 * Hot-reloads: changes take effect without restart.
 * Handles various YAML formats gracefully.
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { parse as parseYaml } from "yaml";
import type { IKVStorage } from "../interfaces.js";

const PERSONA_FILE = "persona.yaml";
const USER_PERSONA_PREFIX = "persona:user:";

const DEFAULT_PERSONA = `你是一个友好的助手。请用简洁、友好的方式回答问题。
如果用户问你是谁，你是 NNBot，一个基于大语言模型的聊天机器人。`;

interface PersonaConfig {
  default?: string;
  users?: Record<string, string>;
}

export class PersonaService {
  private configPath: string;

  constructor(private storage: IKVStorage) {
    this.configPath = resolve(process.cwd(), PERSONA_FILE);
  }

  /**
   * Load persona config from file (hot-reload)
   */
  private loadConfig(): PersonaConfig {
    try {
      if (!existsSync(this.configPath)) {
        console.warn(`\x1b[33m[Persona] ${PERSONA_FILE} not found, using default\x1b[0m`);
        return {};
      }

      const content = readFileSync(this.configPath, "utf-8");
      const parsed = parseYaml(content);

      if (!parsed || typeof parsed !== "object") {
        return {};
      }

      // Handle various formats
      const config: PersonaConfig = {};

      // Extract default persona
      if (typeof parsed.default === "string") {
        config.default = parsed.default;
      } else if (parsed.default && typeof parsed.default === "object") {
        // Handle case where user writes default without |
        config.default = this.extractText(parsed.default);
      }

      // Extract user personas
      if (parsed.users && typeof parsed.users === "object") {
        config.users = {};
        for (const [userId, persona] of Object.entries(parsed.users)) {
          if (typeof persona === "string") {
            config.users[userId] = persona;
          } else if (persona && typeof persona === "object") {
            config.users[userId] = this.extractText(persona);
          }
        }
      }

      return config;
    } catch (error) {
      console.error(`\x1b[31m[Persona] Failed to load ${this.configPath}: ${error}\x1b[0m`);
      return {};
    }
  }

  /**
   * Extract text from various object formats
   */
  private extractText(obj: unknown): string {
    if (typeof obj === "string") {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.join("\n");
    }
    if (obj && typeof obj === "object") {
      // Try common properties
      const o = obj as Record<string, unknown>;
      if (typeof o.text === "string") return o.text;
      if (typeof o.content === "string") return o.content;
      if (typeof o.value === "string") return o.value;
    }
    return String(obj);
  }

  /**
   * Get persona for a user
   * Priority: user database > user config file > default config file > hardcoded default
   */
  async getPersona(userId: string): Promise<string> {
    // 1. Try user custom persona from database (set via /persona-set command)
    const userPersona = await this.storage.get(`${USER_PERSONA_PREFIX}${userId}`);
    if (userPersona && typeof userPersona === "string") {
      return userPersona;
    }

    // 2. Try user persona from config file
    const config = this.loadConfig();
    if (config.users?.[userId]) {
      return config.users[userId];
    }

    // 3. Try default persona from config file
    if (config.default) {
      return config.default;
    }

    // 4. Hardcoded default
    return DEFAULT_PERSONA;
  }

  /**
   * Get default persona from config file
   */
  getDefaultPersona(): string {
    const config = this.loadConfig();
    return config.default || DEFAULT_PERSONA;
  }

  /**
   * Set custom persona for a user (stored in database)
   */
  async setUserPersona(userId: string, persona: string): Promise<void> {
    await this.storage.set(`${USER_PERSONA_PREFIX}${userId}`, persona);
  }

  /**
   * Reset user persona (remove from database, will fall back to config file)
   */
  async resetUserPersona(userId: string): Promise<void> {
    await this.storage.delete(`${USER_PERSONA_PREFIX}${userId}`);
  }
}
