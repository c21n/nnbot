/**
 * SQLite Storage Implementation (using better-sqlite3)
 *
 * Implements both IKVStorage and IConversationStorage interfaces.
 * Uses SQLite transactions and WAL mode so writes do not export the whole database.
 */

import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";
import type {
  IKVStorage,
  IConversationStorage,
  ConversationMessage,
} from "../../interfaces.js";

export class SQLiteStorage implements IKVStorage, IConversationStorage {
  private db: Database.Database;

  private constructor(db: Database.Database) {
    this.db = db;
  }

  static async create(dbPath: string = "data/bot.db"): Promise<SQLiteStorage> {
    // Ensure directory exists
    mkdirSync(dirname(dbPath), { recursive: true });

    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("busy_timeout = 5000");

    const storage = new SQLiteStorage(db);
    storage.initTables();
    return storage;
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_conversations_user_id
        ON conversations(user_id)
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_conversations_timestamp
        ON conversations(timestamp)
    `);

  }

  // ============ KV Storage ============

  async set(key: string, value: unknown, _ttl?: number): Promise<void> {
    this.db
      .prepare("INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)")
      .run(key, JSON.stringify(value));
  }

  async get(key: string): Promise<unknown | null> {
    const row = this.db
      .prepare("SELECT value FROM kv_store WHERE key = ?")
      .get(key) as { value: string } | undefined;

    if (row) {
      try {
        return JSON.parse(row.value);
      } catch {
        return row.value;
      }
    }

    return null;
  }

  async delete(key: string): Promise<void> {
    this.db.prepare("DELETE FROM kv_store WHERE key = ?").run(key);
  }

  async exists(key: string): Promise<boolean> {
    const row = this.db
      .prepare("SELECT 1 AS present FROM kv_store WHERE key = ?")
      .get(key) as { present: number } | undefined;
    return Boolean(row);
  }

  // ============ Conversation Storage ============

  async saveMessage(
    userId: string,
    role: string,
    content: string
  ): Promise<void> {
    this.db
      .prepare("INSERT INTO conversations (user_id, role, content) VALUES (?, ?, ?)")
      .run(userId, role, content);
  }

  async getHistory(
    userId: string,
    limit: number = 10
  ): Promise<ConversationMessage[]> {
    const rows = this.db.prepare(
      `SELECT role, content, timestamp
       FROM conversations
       WHERE user_id = ?
       ORDER BY id DESC
       LIMIT ?`
    ).all(userId, limit) as ConversationMessage[];

    // Reverse to get chronological order
    return rows.reverse();
  }

  async clearHistory(userId: string): Promise<void> {
    this.db.prepare("DELETE FROM conversations WHERE user_id = ?").run(userId);
  }

  // ============ Cleanup ============

  async close(): Promise<void> {
    this.db.close();
  }
}
