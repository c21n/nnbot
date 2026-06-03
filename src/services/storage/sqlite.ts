/**
 * SQLite Storage Implementation (using sql.js)
 *
 * Implements both IKVStorage and IConversationStorage interfaces.
 * Uses sql.js (pure JavaScript) instead of better-sqlite3 to avoid native compilation issues.
 */

import initSqlJs, { type Database } from "sql.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { dirname } from "path";
import type {
  IKVStorage,
  IConversationStorage,
  ConversationMessage,
} from "../../interfaces.js";

export class SQLiteStorage implements IKVStorage, IConversationStorage {
  private db: Database;
  private dbPath: string;

  private constructor(db: Database, dbPath: string) {
    this.db = db;
    this.dbPath = dbPath;
  }

  static async create(dbPath: string = "data/bot.db"): Promise<SQLiteStorage> {
    // Ensure directory exists
    mkdirSync(dirname(dbPath), { recursive: true });

    const SQL = await initSqlJs();

    let db: Database;
    if (existsSync(dbPath)) {
      const buffer = readFileSync(dbPath);
      db = new SQL.Database(buffer);
    } else {
      db = new SQL.Database();
    }

    const storage = new SQLiteStorage(db, dbPath);
    storage.initTables();
    return storage;
  }

  private initTables(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS kv_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_conversations_user_id
        ON conversations(user_id)
    `);

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_conversations_timestamp
        ON conversations(timestamp)
    `);

    this.save();
  }

  private save(): void {
    const data = this.db.export();
    const buffer = Buffer.from(data);
    writeFileSync(this.dbPath, buffer);
  }

  // ============ KV Storage ============

  async set(key: string, value: unknown, _ttl?: number): Promise<void> {
    this.db.run(
      "INSERT OR REPLACE INTO kv_store (key, value) VALUES (?, ?)",
      [key, JSON.stringify(value)]
    );
    this.save();
  }

  async get(key: string): Promise<unknown | null> {
    const stmt = this.db.prepare("SELECT value FROM kv_store WHERE key = ?");
    stmt.bind([key]);

    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      try {
        return JSON.parse(row.value as string);
      } catch {
        return row.value;
      }
    }

    stmt.free();
    return null;
  }

  async delete(key: string): Promise<void> {
    this.db.run("DELETE FROM kv_store WHERE key = ?", [key]);
    this.save();
  }

  async exists(key: string): Promise<boolean> {
    const stmt = this.db.prepare(
      "SELECT 1 FROM kv_store WHERE key = ?"
    );
    stmt.bind([key]);
    const exists = stmt.step();
    stmt.free();
    return exists;
  }

  // ============ Conversation Storage ============

  async saveMessage(
    userId: string,
    role: string,
    content: string
  ): Promise<void> {
    this.db.run(
      "INSERT INTO conversations (user_id, role, content) VALUES (?, ?, ?)",
      [userId, role, content]
    );
    this.save();
  }

  async getHistory(
    userId: string,
    limit: number = 10
  ): Promise<ConversationMessage[]> {
    const stmt = this.db.prepare(
      `SELECT role, content, timestamp
       FROM conversations
       WHERE user_id = ?
       ORDER BY timestamp DESC
       LIMIT ?`
    );
    stmt.bind([userId, limit]);

    const results: ConversationMessage[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push({
        role: row.role as string,
        content: row.content as string,
        timestamp: row.timestamp as string,
      });
    }
    stmt.free();

    // Reverse to get chronological order
    return results.reverse();
  }

  async clearHistory(userId: string): Promise<void> {
    this.db.run("DELETE FROM conversations WHERE user_id = ?", [userId]);
    this.save();
  }

  // ============ Cleanup ============

  async close(): Promise<void> {
    this.save();
    this.db.close();
  }
}
