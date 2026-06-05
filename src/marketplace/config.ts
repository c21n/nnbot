/**
 * Marketplace Configuration
 *
 * Configuration for the marketplace client.
 */

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { MarketplaceConfig } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Default marketplace configuration
 */
const DEFAULT_CONFIG: MarketplaceConfig = {
  apiUrl: process.env.MARKETPLACE_API_URL || 'http://localhost:3001',
  pluginsDir: join(__dirname, '..', '..', 'plugins'),
  dataFile: join(__dirname, '..', '..', 'data', 'installed-plugins.json'),
  autoCheckInterval: 24 * 60 * 60 * 1000, // 24 hours
  maxRetries: 3,
};

/**
 * Get marketplace configuration
 */
export function getMarketplaceConfig(): MarketplaceConfig {
  return {
    ...DEFAULT_CONFIG,
    apiUrl: process.env.MARKETPLACE_API_URL || DEFAULT_CONFIG.apiUrl,
    pluginsDir: process.env.PLUGINS_DIR || DEFAULT_CONFIG.pluginsDir,
    dataFile: process.env.MARKETPLACE_DATA_FILE || DEFAULT_CONFIG.dataFile,
  };
}
