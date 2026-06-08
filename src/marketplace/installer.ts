/**
 * Plugin Installer (v2)
 *
 * Handles plugin install/uninstall/update via GitHub zip downloads.
 * No external API dependency — downloads directly from GitHub.
 */

import { readFile, writeFile, mkdir, rm, rename, access, readdir, stat } from "fs/promises";
import { join } from "path";
import axios from "axios";
import type {
  InstallResult,
  UninstallResult,
  UpdateResult,
  UpdateInfo,
  InstalledPluginRecord,
  RegistryPluginEntry,
  RegistryData,
} from "./types.js";
import { logger } from "../core/logger.js";

const MAX_RETRIES = 3;
const MAX_PLUGIN_SIZE_BYTES = 16 * 1024 * 1024; // 16MB

/**
 * Parse a GitHub URL into author/repo/branch.
 * Supports: https://github.com/author/repo(.git)?(/tree/branch)?
 */
function parseGithubUrl(url: string): { author: string; repo: string; branch?: string } {
  const cleaned = url.replace(/\/+$/, "");
  const match = cleaned.match(
    /^https:\/\/github\.com\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)(?:\.git)?(?:\/tree\/([a-zA-Z0-9_-]+))?$/
  );
  if (!match) {
    throw new Error(`Invalid GitHub URL: ${url}`);
  }
  return { author: match[1], repo: match[2], branch: match[3] };
}

/**
 * Derive a directory name from a GitHub repo URL.
 * e.g. "https://github.com/foo/bar-plugin" → "bar_plugin"
 */
function repoToDirName(url: string): string {
  const { repo } = parseGithubUrl(url);
  return repo.replace(/-/g, "_").toLowerCase();
}

/**
 * Download a file from URL to disk with retry.
 */
async function downloadFile(url: string, destPath: string, retries = MAX_RETRIES): Promise<void> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 60000,
        maxContentLength: MAX_PLUGIN_SIZE_BYTES,
      });

      const data = Buffer.from(response.data);
      if (data.length > MAX_PLUGIN_SIZE_BYTES) {
        throw new Error(
          `Plugin package exceeds 16MB limit (${(data.length / 1024 / 1024).toFixed(1)}MB)`
        );
      }

      await mkdir(join(destPath, ".."), { recursive: true });
      await writeFile(destPath, data);
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      logger.warn(
        `[Installer] Download attempt ${attempt}/${retries} failed: ${lastError.message}`
      );
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }
  throw lastError || new Error("Download failed after max retries");
}

/**
 * Get the zipball URL for the latest release of a GitHub repo.
 * Falls back to the default branch archive if no releases.
 */
async function getLatestReleaseZipUrl(repoUrl: string, proxy?: string): Promise<string> {
  const { author, repo, branch } = parseGithubUrl(repoUrl);

  if (branch) {
    const url = `https://github.com/${author}/${repo}/archive/refs/heads/${branch}.zip`;
    return proxy ? `${proxy}/${url}` : url;
  }

  try {
    const apiUrl = `https://api.github.com/repos/${author}/${repo}/releases`;
    const response = await axios.get<Array<{ zipball_url: string }>>(apiUrl, {
      timeout: 10000,
      headers: { Accept: "application/vnd.github.v3+json" },
    });
    if (response.data.length > 0) {
      const zipUrl = response.data[0].zipball_url;
      return proxy ? `${proxy}/${zipUrl}` : zipUrl;
    }
  } catch {
    // No releases or API error — fall through
  }

  const url = `https://github.com/${author}/${repo}/archive/refs/heads/master.zip`;
  return proxy ? `${proxy}/${url}` : url;
}

/**
 * Extract a zip file to a target directory.
 * Handles the root directory offset that GitHub zips have.
 */
async function extractZip(zipPath: string, targetDir: string): Promise<void> {
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");
  const execFileAsync = promisify(execFile);

  await mkdir(targetDir, { recursive: true });

  if (process.platform === "win32") {
    await execFileAsync("powershell", [
      "-Command",
      `Expand-Archive -Path "${zipPath}" -DestinationPath "${targetDir}" -Force`,
    ]);
  } else {
    await execFileAsync("unzip", ["-o", zipPath, "-d", targetDir]);
  }

  // GitHub zips have a single root directory (e.g., repo-hash/).
  // Flatten: move contents up one level.
  const entries = await readdir(targetDir);
  const dirs: string[] = [];
  for (const entry of entries) {
    const s = await stat(join(targetDir, entry));
    if (s.isDirectory()) {
      dirs.push(entry);
    }
  }

  if (dirs.length === 1 && entries.length === 1) {
    const innerDir = join(targetDir, dirs[0]);
    const innerEntries = await readdir(innerDir);
    for (const entry of innerEntries) {
      await rename(join(innerDir, entry), join(targetDir, entry));
    }
    await rm(innerDir, { recursive: true, force: true });
  }
}

// ============ Installer Class ============

export interface PluginInstallerOptions {
  readonly pluginsDir: string;
  readonly dataFile: string;
}

/**
 * Plugin installer — handles install, uninstall, update operations.
 */
export class PluginInstaller {
  private readonly pluginsDir: string;
  private readonly dataFile: string;

  constructor(opts: PluginInstallerOptions) {
    this.pluginsDir = opts.pluginsDir;
    this.dataFile = opts.dataFile;
  }

  /**
   * Install a plugin from registry entry.
   */
  async install(
    pluginId: string,
    entry: RegistryPluginEntry,
    opts?: { proxy?: string }
  ): Promise<InstallResult> {
    try {
      const existing = await this.getInstalledPlugin(pluginId);
      if (existing) {
        return {
          success: false,
          pluginId,
          version: existing.version,
          message: "Already installed",
          error: `Plugin "${pluginId}" is already installed (v${existing.version}). Uninstall first.`,
        };
      }

      const dirName = repoToDirName(entry.repo);
      const targetDir = join(this.pluginsDir, dirName);

      try {
        await access(targetDir);
        return {
          success: false,
          pluginId,
          version: entry.version,
          message: "Directory conflict",
          error: `Directory "${dirName}" already exists. Remove it manually or uninstall first.`,
        };
      } catch {
        // Directory doesn't exist — good
      }

      let downloadUrl: string;
      if (entry.download_url) {
        downloadUrl = entry.download_url;
        if (opts?.proxy) downloadUrl = `${opts.proxy}/${downloadUrl}`;
      } else {
        downloadUrl = await getLatestReleaseZipUrl(entry.repo, opts?.proxy);
      }

      logger.info(`[Installer] Downloading ${pluginId} from ${downloadUrl}`);
      const zipPath = join(this.pluginsDir, `${dirName}.zip`);
      await downloadFile(downloadUrl, zipPath);

      logger.info(`[Installer] Extracting ${pluginId} to ${targetDir}`);
      await extractZip(zipPath, targetDir);
      await rm(zipPath, { force: true });

      const now = new Date().toISOString();
      await this.recordInstallation({
        pluginId,
        name: entry.name,
        version: entry.version,
        repo: entry.repo,
        installedAt: now,
        updatedAt: now,
        enabled: true,
      });

      logger.info(`[Installer] Plugin "${pluginId}" v${entry.version} installed`);
      return {
        success: true,
        pluginId,
        version: entry.version,
        message: `Plugin "${pluginId}" v${entry.version} installed successfully`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[Installer] Install failed for ${pluginId}: ${msg}`);
      return { success: false, pluginId, version: entry.version, message: "Installation failed", error: msg };
    }
  }

  /**
   * Uninstall a plugin.
   */
  async uninstall(pluginId: string): Promise<UninstallResult> {
    try {
      const installed = await this.getInstalledPlugin(pluginId);
      if (!installed) {
        return { success: false, pluginId, message: "Not installed", error: `Plugin "${pluginId}" is not installed` };
      }

      const dirName = repoToDirName(installed.repo);
      const targetDir = join(this.pluginsDir, dirName);

      try {
        await rm(targetDir, { recursive: true, force: true });
        logger.info(`[Installer] Removed directory ${targetDir}`);
      } catch (err) {
        logger.warn(`[Installer] Failed to remove directory: ${err instanceof Error ? err.message : err}`);
      }

      await this.removeInstallation(pluginId);
      logger.info(`[Installer] Plugin "${pluginId}" uninstalled`);

      return { success: true, pluginId, message: `Plugin "${pluginId}" uninstalled successfully` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[Installer] Uninstall failed for ${pluginId}: ${msg}`);
      return { success: false, pluginId, message: "Uninstallation failed", error: msg };
    }
  }

  /**
   * Update a plugin to the latest version.
   */
  async update(
    pluginId: string,
    latestEntry: RegistryPluginEntry,
    opts?: { proxy?: string }
  ): Promise<UpdateResult> {
    try {
      const installed = await this.getInstalledPlugin(pluginId);
      if (!installed) {
        return { success: false, pluginId, oldVersion: "", newVersion: "", message: "Not installed", error: `Plugin "${pluginId}" is not installed` };
      }

      if (installed.version === latestEntry.version) {
        return { success: false, pluginId, oldVersion: installed.version, newVersion: installed.version, message: "Already up to date" };
      }

      const dirName = repoToDirName(installed.repo);
      const targetDir = join(this.pluginsDir, dirName);
      const backupDir = join(this.pluginsDir, `${dirName}.bak`);

      // Backup old version
      try {
        await access(targetDir);
        await rename(targetDir, backupDir);
      } catch {
        // No old directory
      }

      try {
        let downloadUrl: string;
        if (latestEntry.download_url) {
          downloadUrl = latestEntry.download_url;
          if (opts?.proxy) downloadUrl = `${opts.proxy}/${downloadUrl}`;
        } else {
          downloadUrl = await getLatestReleaseZipUrl(latestEntry.repo, opts?.proxy);
        }

        const zipPath = join(this.pluginsDir, `${dirName}.zip`);
        await downloadFile(downloadUrl, zipPath);
        await extractZip(zipPath, targetDir);
        await rm(zipPath, { force: true });

        await this.recordInstallation({
          ...installed,
          version: latestEntry.version,
          updatedAt: new Date().toISOString(),
        });

        await rm(backupDir, { recursive: true, force: true }).catch(() => {});

        logger.info(`[Installer] Plugin "${pluginId}" updated: ${installed.version} → ${latestEntry.version}`);
        return { success: true, pluginId, oldVersion: installed.version, newVersion: latestEntry.version, message: `Updated from ${installed.version} to ${latestEntry.version}` };
      } catch (err) {
        logger.warn(`[Installer] Update failed, rolling back ${pluginId}`);
        try {
          await rm(targetDir, { recursive: true, force: true }).catch(() => {});
          await rename(backupDir, targetDir);
        } catch {
          logger.error(`[Installer] Rollback failed for ${pluginId}`);
        }
        throw err;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[Installer] Update failed for ${pluginId}: ${msg}`);
      return { success: false, pluginId, oldVersion: "", newVersion: "", message: "Update failed", error: msg };
    }
  }

  /**
   * Check for updates across all installed plugins.
   */
  async checkUpdates(registry: RegistryData): Promise<UpdateInfo[]> {
    const installed = await this.getInstalledPlugins();
    const updates: UpdateInfo[] = [];

    for (const plugin of installed) {
      const entry = registry[plugin.pluginId];
      if (entry && entry.version !== plugin.version) {
        updates.push({
          pluginId: plugin.pluginId,
          currentVersion: plugin.version,
          latestVersion: entry.version,
          updatedAt: entry.updated_at ?? "",
        });
      }
    }

    return updates;
  }

  /**
   * Get all installed plugins.
   */
  async getInstalledPlugins(): Promise<InstalledPluginRecord[]> {
    try {
      const raw = await readFile(this.dataFile, "utf-8");
      return JSON.parse(raw) as InstalledPluginRecord[];
    } catch {
      return [];
    }
  }

  async getInstalledPlugin(pluginId: string): Promise<InstalledPluginRecord | null> {
    const plugins = await this.getInstalledPlugins();
    return plugins.find((p) => p.pluginId === pluginId) ?? null;
  }

  async setEnabled(pluginId: string, enabled: boolean): Promise<void> {
    const plugins = await this.getInstalledPlugins();
    const index = plugins.findIndex((p) => p.pluginId === pluginId);
    if (index === -1) {
      throw new Error(`Plugin "${pluginId}" is not installed`);
    }
    plugins[index] = { ...plugins[index], enabled };
    await this.writeInstallData(plugins);
  }

  private async recordInstallation(record: InstalledPluginRecord): Promise<void> {
    const plugins = await this.getInstalledPlugins();
    const index = plugins.findIndex((p) => p.pluginId === record.pluginId);
    if (index >= 0) {
      plugins[index] = record;
    } else {
      plugins.push(record);
    }
    await this.writeInstallData(plugins);
  }

  private async removeInstallation(pluginId: string): Promise<void> {
    const plugins = await this.getInstalledPlugins();
    const filtered = plugins.filter((p) => p.pluginId !== pluginId);
    await this.writeInstallData(filtered);
  }

  private async writeInstallData(plugins: InstalledPluginRecord[]): Promise<void> {
    await mkdir(join(this.dataFile, ".."), { recursive: true });
    await writeFile(this.dataFile, JSON.stringify(plugins, null, 2), "utf-8");
  }
}
