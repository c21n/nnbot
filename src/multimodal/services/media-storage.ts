/**
 * Media Storage Service
 *
 * Handles storage of original media files
 * Supports configurable retention and cleanup
 */

import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type {
  IMediaStorageService,
  IMediaMetadata,
  IMediaStorageStats,
  IMediaStorageConfig,
} from '../types/storage.types.js';

export class MediaStorageService implements IMediaStorageService {
  private config: IMediaStorageConfig;
  private basePath: string;

  constructor(config: IMediaStorageConfig) {
    this.config = config;
    this.basePath = path.resolve(config.path);
  }

  /**
   * Initialize storage directory
   */
  async init(): Promise<void> {
    try {
      await fs.mkdir(this.basePath, { recursive: true });
      console.log(`[MediaStorage] Initialized storage at: ${this.basePath}`);
    } catch (error) {
      console.error('[MediaStorage] Failed to initialize storage:', error);
      throw error;
    }
  }

  /**
   * Store media file
   */
  async storeMedia(
    data: Buffer,
    filename: string,
    mimeType: string,
    userId: string,
    metadata?: Readonly<Record<string, unknown>>
  ): Promise<IMediaMetadata> {
    // Generate unique ID and path
    const id = randomUUID();
    const dateStr = this.getDateString();
    const ext = this.getExtension(filename, mimeType);
    const storedFilename = `${id}${ext}`;
    const relativePath = path.join(dateStr, storedFilename);
    const fullPath = path.join(this.basePath, relativePath);

    // Ensure directory exists
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });

    // Write file
    await fs.writeFile(fullPath, data);

    // Create metadata
    const mediaMetadata: IMediaMetadata = {
      id,
      filename,
      mimeType,
      size: data.length,
      path: relativePath,
      createdAt: Date.now(),
      userId,
      sessionId: metadata?.sessionId as string | undefined,
      messageId: metadata?.messageId as string | undefined,
    };

    console.log(`[MediaStorage] Stored media: ${relativePath} (${data.length} bytes)`);
    return mediaMetadata;
  }

  /**
   * Get media file by ID
   */
  async getMedia(id: string): Promise<Buffer | null> {
    // TODO: Implement metadata storage to lookup by ID
    // For now, search by filename pattern
    try {
      const files = await this.findFilesById(id);
      if (files.length === 0) {
        return null;
      }
      return await fs.readFile(files[0]);
    } catch {
      return null;
    }
  }

  /**
   * Get media metadata by ID
   */
  async getMetadata(id: string): Promise<IMediaMetadata | null> {
    // TODO: Implement metadata storage (e.g., SQLite)
    // For now, return null
    return null;
  }

  /**
   * Delete media file by ID
   */
  async deleteMedia(id: string): Promise<boolean> {
    try {
      const files = await this.findFilesById(id);
      if (files.length === 0) {
        return false;
      }

      for (const file of files) {
        await fs.unlink(file);
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Cleanup expired media files
   */
  async cleanupExpired(): Promise<number> {
    const retentionMs = this.config.retentionDays * 24 * 60 * 60 * 1000;
    const cutoffTime = Date.now() - retentionMs;
    let cleanedCount = 0;

    try {
      const dateDirs = await this.getDateDirs();

      for (const dateDir of dateDirs) {
        const dirDate = this.parseDate(dateDir);
        if (dirDate && dirDate < cutoffTime) {
          const fullPath = path.join(this.basePath, dateDir);
          const files = await fs.readdir(fullPath);

          for (const file of files) {
            const filePath = path.join(fullPath, file);
            await fs.unlink(filePath);
            cleanedCount++;
          }

          // Remove empty directory
          await fs.rmdir(fullPath);
        }
      }

      if (cleanedCount > 0) {
        console.log(`[MediaStorage] Cleaned up ${cleanedCount} expired files`);
      }
    } catch (error) {
      console.error('[MediaStorage] Cleanup failed:', error);
    }

    return cleanedCount;
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<IMediaStorageStats> {
    let totalFiles = 0;
    let totalSize = 0;
    let oldestFile: number | undefined;
    let newestFile: number | undefined;

    try {
      const dateDirs = await this.getDateDirs();

      for (const dateDir of dateDirs) {
        const fullPath = path.join(this.basePath, dateDir);
        const files = await fs.readdir(fullPath);

        for (const file of files) {
          const filePath = path.join(fullPath, file);
          const stat = await fs.stat(filePath);

          totalFiles++;
          totalSize += stat.size;

          if (!oldestFile || stat.mtimeMs < oldestFile) {
            oldestFile = stat.mtimeMs;
          }
          if (!newestFile || stat.mtimeMs > newestFile) {
            newestFile = stat.mtimeMs;
          }
        }
      }
    } catch (error) {
      console.error('[MediaStorage] Failed to get stats:', error);
    }

    return {
      totalFiles,
      totalSize,
      oldestFile,
      newestFile,
    };
  }

  /**
   * Find files by ID (searches across date directories)
   */
  private async findFilesById(id: string): Promise<string[]> {
    const results: string[] = [];

    try {
      const dateDirs = await this.getDateDirs();

      for (const dateDir of dateDirs) {
        const fullPath = path.join(this.basePath, dateDir);
        const files = await fs.readdir(fullPath);

        for (const file of files) {
          if (file.startsWith(id)) {
            results.push(path.join(fullPath, file));
          }
        }
      }
    } catch {
      // Ignore errors
    }

    return results;
  }

  /**
   * Get list of date directories
   */
  private async getDateDirs(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.basePath, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
        .map((entry) => entry.name)
        .sort()
        .reverse();
    } catch {
      return [];
    }
  }

  /**
   * Get current date string (YYYY-MM-DD)
   */
  private getDateString(): string {
    const now = new Date();
    return now.toISOString().split('T')[0];
  }

  /**
   * Parse date string to timestamp
   */
  private parseDate(dateStr: string): number | null {
    const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return null;
    }

    const [, year, month, day] = match;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day)).getTime();
  }

  /**
   * Get file extension from filename and MIME type
   */
  private getExtension(filename: string, mimeType: string): string {
    // Try to get extension from filename
    const ext = path.extname(filename);
    if (ext) {
      return ext;
    }

    // Fallback to MIME type
    const mimeToExt: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'audio/wav': '.wav',
      'audio/mp3': '.mp3',
      'audio/ogg': '.ogg',
      'audio/m4a': '.m4a',
      'audio/opus': '.opus',
    };

    return mimeToExt[mimeType] || '.bin';
  }
}