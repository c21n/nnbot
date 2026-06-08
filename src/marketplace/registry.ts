/**
 * Registry Loader
 *
 * Loads plugin registry from remote JSON URLs with local MD5 cache.
 * Follows AstrBot's pattern: fetch remote → compare MD5 → cache → serve.
 */

import { createHash } from "crypto";
import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
import axios from "axios";
import type { RegistryData, RegistryCacheFile } from "./types.js";
import { logger } from "../core/logger.js";

// Default registry URLs
const DEFAULT_REGISTRY_URLS = [
  "https://raw.githubusercontent.com/c21n/NNBot-Plugins/main/registry.json",
];

const DEFAULT_MD5_URLS = [
  "https://raw.githubusercontent.com/c21n/NNBot-Plugins/main/registry-md5.json",
];

/**
 * Fetch remote MD5 hash from a URL like `{registry}-md5.json`.
 * Expected response format: { "md5": "abc123..." }
 */
async function fetchRemoteMd5(md5Url: string): Promise<string | null> {
  try {
    const response = await axios.get<{ md5: string }>(md5Url, { timeout: 10000 });
    return response.data?.md5 ?? null;
  } catch {
    return null;
  }
}

/**
 * Compute MD5 hash of a string.
 */
function computeMd5(data: string): string {
  return createHash("md5").update(data).digest("hex");
}

/**
 * Load cached registry from disk.
 * Returns null if cache doesn't exist or is corrupted.
 */
async function loadCache(cacheFile: string): Promise<RegistryCacheFile | null> {
  try {
    const raw = await readFile(cacheFile, "utf-8");
    const parsed = JSON.parse(raw) as RegistryCacheFile;
    if (parsed.data && parsed.timestamp) {
      return parsed;
    }
  } catch {
    // File doesn't exist or is corrupted
  }
  return null;
}

/**
 * Save registry data to local cache file.
 */
async function saveCache(
  cacheFile: string,
  data: RegistryData,
  md5: string
): Promise<void> {
  try {
    await mkdir(dirname(cacheFile), { recursive: true });
    const cache: RegistryCacheFile = {
      timestamp: new Date().toISOString(),
      md5,
      data,
    };
    await writeFile(cacheFile, JSON.stringify(cache, null, 2), "utf-8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`[Registry] Failed to save cache: ${msg}`);
  }
}

/**
 * Fetch registry JSON from the first successful URL.
 * Tries each URL in order; returns null if all fail.
 */
async function fetchFromUrls(urls: string[]): Promise<RegistryData | null> {
  for (const url of urls) {
    try {
      logger.info(`[Registry] Fetching from ${url}`);
      const response = await axios.get<RegistryData>(url, { timeout: 15000 });
      const data = response.data;
      if (data && typeof data === "object" && Object.keys(data).length > 0) {
        logger.info(
          `[Registry] Fetched ${Object.keys(data).length} plugins from ${url}`
        );
        return data;
      }
      logger.warn(`[Registry] Empty response from ${url}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`[Registry] Failed to fetch from ${url}: ${msg}`);
    }
  }
  return null;
}

export interface RegistryManagerOptions {
  /** Registry JSON URLs (tried in order) */
  readonly registryUrls?: readonly string[];
  /** MD5 check URLs (corresponding to registryUrls) */
  readonly md5Urls?: readonly string[];
  /** Local cache file path */
  readonly cacheFile: string;
}

/**
 * Registry manager — loads, caches, and serves plugin registry data.
 */
export class RegistryManager {
  private readonly registryUrls: readonly string[];
  private readonly md5Urls: readonly string[];
  private readonly cacheFile: string;

  constructor(opts: RegistryManagerOptions) {
    this.registryUrls = opts.registryUrls ?? DEFAULT_REGISTRY_URLS;
    this.md5Urls = opts.md5Urls ?? DEFAULT_MD5_URLS;
    this.cacheFile = opts.cacheFile;
  }

  /**
   * Load registry data.
   * - If not forced: check MD5 cache first, use cache if valid
   * - If forced or cache invalid: fetch remote, update cache
   * - If remote fails: fall back to stale cache
   */
  async load(forceRefresh = false): Promise<RegistryData> {
    // Step 1: Try cache if not forcing refresh
    if (!forceRefresh) {
      const cached = await loadCache(this.cacheFile);
      if (cached) {
        // Check if cache is still valid via remote MD5
        const isValid = await this.isCacheValid(cached.md5);
        if (isValid) {
          logger.debug("[Registry] Cache MD5 matches, using cached data");
          return cached.data;
        }
        logger.debug("[Registry] Cache MD5 mismatch, will fetch remote");
      }
    }

    // Step 2: Fetch remote
    const remoteData = await fetchFromUrls([...this.registryUrls]);
    if (remoteData) {
      // Compute and save MD5
      const remoteMd5 = await this.fetchCurrentMd5();
      const dataMd5 = remoteMd5 || computeMd5(JSON.stringify(remoteData));
      await saveCache(this.cacheFile, remoteData, dataMd5);
      return remoteData;
    }

    // Step 3: Fall back to stale cache
    const cached = await loadCache(this.cacheFile);
    if (cached) {
      logger.warn("[Registry] Remote fetch failed, using stale cache");
      return cached.data;
    }

    // Step 4: Nothing available
    logger.error("[Registry] No remote data and no cache available");
    return {};
  }

  /**
   * Check if the local cache MD5 matches the remote MD5.
   * Returns true if valid (match) or if remote MD5 is unreachable.
   */
  private async isCacheValid(localMd5: string): Promise<boolean> {
    for (const md5Url of this.md5Urls) {
      const remoteMd5 = await fetchRemoteMd5(md5Url);
      if (remoteMd5 !== null) {
        return localMd5 === remoteMd5;
      }
    }
    // Can't reach remote MD5 — assume cache is valid (degrade gracefully)
    return true;
  }

  /**
   * Fetch the current remote MD5 hash.
   */
  private async fetchCurrentMd5(): Promise<string | null> {
    for (const md5Url of this.md5Urls) {
      const md5 = await fetchRemoteMd5(md5Url);
      if (md5) return md5;
    }
    return null;
  }
}
