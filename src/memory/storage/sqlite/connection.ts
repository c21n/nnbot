import Database from 'better-sqlite3'
import { config } from '../../config/index.js'
import { mkdirSync } from 'fs'
import { dirname } from 'path'

let db: Database.Database | null = null

export function getSqliteConnection(): Database.Database {
  if (db) return db

  // 确保目录存在
  const dbPath = config.sqlite.path
  mkdirSync(dirname(dbPath), { recursive: true })

  db = new Database(dbPath)

  // 启用 WAL 模式
  db.pragma('journal_mode=WAL')
  db.pragma('busy_timeout=5000')

  // 初始化表
  initTables(db)

  return db
}

function initTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      summarized INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch() * 1000)
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      group_id TEXT,
      created_at INTEGER NOT NULL,
      last_active_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_last_active ON sessions(last_active_at);

    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id TEXT PRIMARY KEY,
      basic_info TEXT DEFAULT '{}',
      preferences TEXT DEFAULT '{}',
      habits TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS summary_indices (
      session_id TEXT PRIMARY KEY,
      last_summarized_index INTEGER DEFAULT 0,
      updated_at INTEGER DEFAULT (unixepoch() * 1000)
    );

    CREATE TABLE IF NOT EXISTS user_index (
      user_id TEXT PRIMARY KEY,
      last_seen_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_id TEXT DEFAULT '',
      platform TEXT DEFAULT '',
      type TEXT DEFAULT 'context',
      importance REAL DEFAULT 0.5,
      timestamp INTEGER NOT NULL,
      text TEXT NOT NULL,
      keywords TEXT DEFAULT '',
      created_at INTEGER NOT NULL,
      last_accessed_at INTEGER NOT NULL,
      access_count INTEGER DEFAULT 0,
      is_latest INTEGER DEFAULT 0,
      key TEXT DEFAULT '',
      group_id TEXT DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id);
    CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
    CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at);
  `)
}

export function closeSqlite(): void {
  if (db) {
    db.close()
    db = null
  }
}
