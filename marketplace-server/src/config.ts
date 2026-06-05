/**
 * Configuration Management
 *
 * Loads and validates configuration from environment variables.
 */

import dotenv from 'dotenv';
import type { Config } from './types/index.js';

// Load .env file
dotenv.config();

/**
 * Get environment variable with validation
 */
function getEnv(key: string, required: boolean = true): string {
  const value = process.env[key];
  if (!value && required) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || '';
}

/**
 * Get boolean environment variable
 */
function getEnvBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

/**
 * Get number environment variable
 */
function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const num = parseInt(value, 10);
  if (isNaN(num)) {
    throw new Error(`Invalid number for environment variable ${key}: ${value}`);
  }
  return num;
}

/**
 * Load and validate configuration
 */
export function loadConfig(): Config {
  const config: Config = {
    server: {
      host: getEnv('SERVER_HOST', false) || '0.0.0.0',
      port: getEnvNumber('SERVER_PORT', 3001),
      cors: {
        origin: getEnv('CORS_ORIGIN', false) || 'http://localhost:3000',
        credentials: getEnvBool('CORS_CREDENTIALS', true),
      },
    },
    database: {
      host: getEnv('DB_HOST', false) || 'localhost',
      port: getEnvNumber('DB_PORT', 5432),
      database: getEnv('DB_NAME', false) || 'marketplace',
      user: getEnv('DB_USER', false) || 'postgres',
      password: getEnv('DB_PASSWORD', true),
      ssl: getEnvBool('DB_SSL', false),
    },
    github: {
      clientId: getEnv('GITHUB_CLIENT_ID', true),
      clientSecret: getEnv('GITHUB_CLIENT_SECRET', true),
      callbackUrl: getEnv('GITHUB_CALLBACK_URL', false) || 'http://localhost:3001/api/auth/github/callback',
      pluginRepoOwner: getEnv('GITHUB_PLUGIN_REPO_OWNER', true),
      pluginRepoName: getEnv('GITHUB_PLUGIN_REPO_NAME', false) || 'nnbot-plugins',
    },
    jwt: {
      secret: getEnv('JWT_SECRET', true),
      expiresIn: getEnv('JWT_EXPIRES_IN', false) || '7d',
    },
  };

  return config;
}

/**
 * Singleton config instance
 */
let configInstance: Config | null = null;

/**
 * Get configuration instance (singleton)
 */
export function getConfig(): Config {
  if (!configInstance) {
    configInstance = loadConfig();
  }
  return configInstance;
}
