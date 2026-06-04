/**
 * .env File Reader/Writer
 *
 * Reads and writes key-value pairs to .env files.
 * Preserves comments and ordering.
 */

import { existsSync, readFileSync, writeFileSync } from "fs";

const ENV_PATH = ".env";

/** Known env var names used by the application */
export const ENV_KEYS = {
  LLM_API_KEY: "LLM_API_KEY",
  DEEPSEEK_API_KEY: "DEEPSEEK_API_KEY",
  SILICONFLOW_API_KEY: "SILICONFLOW_API_KEY",
} as const;

/**
 * Read all key-value pairs from .env file
 */
export function readEnvFile(): Record<string, string> {
  if (!existsSync(ENV_PATH)) return {};

  const content = readFileSync(ENV_PATH, "utf-8");
  const vars: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    vars[key] = value;
  }

  return vars;
}

/**
 * Write a single key-value pair to .env file.
 * Updates existing key or appends new one.
 * Preserves comments and other entries.
 */
export function writeEnvVar(key: string, value: string): void {
  let content = "";

  if (existsSync(ENV_PATH)) {
    content = readFileSync(ENV_PATH, "utf-8");
  }

  const lines = content.split("\n");
  let found = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith(`${key}=`) || trimmed.startsWith(`${key} =`)) {
      lines[i] = `${key}=${value}`;
      found = true;
      break;
    }
  }

  if (!found) {
    // Add newline before appending if file doesn't end with one
    if (content.length > 0 && !content.endsWith("\n")) {
      lines.push("");
    }
    lines.push(`${key}=${value}`);
  }

  writeFileSync(ENV_PATH, lines.join("\n"), "utf-8");

  // Also update process.env so substitution works immediately
  process.env[key] = value;
}

/**
 * Write multiple key-value pairs to .env file
 */
export function writeEnvVars(vars: Record<string, string>): void {
  for (const [key, value] of Object.entries(vars)) {
    if (value) {
      writeEnvVar(key, value);
    }
  }
}
