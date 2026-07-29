/**
 * BM25 keyword search using SQLite FTS5
 *
 * FTS5 provides built-in BM25 ranking and full-text search.
 * We sync memory writes to FTS5 and query with tokenized Chinese text.
 */

import { getSqliteConnection } from '../storage/sqlite/connection.js'
import { tokenize, tokenizeForFTS5 } from './tokenizer.js'
import { BM25Result } from './types.js'
import { Memory } from '../types/index.js'
import { logger } from '../utils/logger.js'

export class BM25Service {
  private initialized = false

  /**
   * Ensure FTS5 virtual table exists
   */
  initialize(): void {
    if (this.initialized) return

    const db = getSqliteConnection()

    try {
      const existingSchema = db
        .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'memories_fts'")
        .get() as { sql?: string } | undefined

      // Older builds used an external-content FTS table. Its manual delete
      // and rebuild operations can corrupt the index, so migrate it to a
      // standalone table that owns its searchable rows.
      if (existingSchema?.sql && /content\s*=\s*['\"]memories['\"]/i.test(existingSchema.sql)) {
        db.exec("DROP TABLE memories_fts")
      }

      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
          memory_id UNINDEXED,
          user_id UNINDEXED,
          text,
          tokenize='unicode61'
        )
      `)

      // Populate FTS5 from existing memories if empty
      const count = db.prepare(
        "SELECT COUNT(*) as cnt FROM memories_fts"
      ).get() as { cnt: number }

      if (count.cnt === 0) {
        this.rebuildIndex()
      }

      this.initialized = true
      logger.info('[BM25] FTS5 initialized')
    } catch (error) {
      logger.warn(`[BM25] FTS5 not available, falling back: ${error}`)
    }
  }

  /**
   * Rebuild FTS5 index from all memories in SQLite
   */
  rebuildIndex(): void {
    const db = getSqliteConnection()

    try {
      db.exec("DELETE FROM memories_fts")

      const memories = db.prepare(
        "SELECT id, user_id, text FROM memories"
      ).all() as { id: string; user_id: string; text: string }[]

      const insert = db.prepare(
        "INSERT INTO memories_fts(memory_id, user_id, text) VALUES (?, ?, ?)"
      )

      const insertMany = db.transaction((rows: { id: string; user_id: string; text: string }[]) => {
        for (const row of rows) {
          insert.run(row.id, row.user_id, tokenizeForFTS5(row.text))
        }
      })

      insertMany(memories)
      logger.info(`[BM25] Rebuilt FTS5 index: ${memories.length} documents`)
    } catch (error) {
      logger.error(`[BM25] Rebuild failed: ${error}`)
    }
  }

  /**
   * Search memories using BM25 (FTS5 MATCH)
   *
   * @param userId - filter by user
   * @param query - search query (will be tokenized)
   * @param limit - max results
   * @returns results sorted by BM25 rank (most relevant first)
   */
  search(userId: string, query: string, limit: number): BM25Result[] {
    this.initialize()

    const db = getSqliteConnection()
    const tokens = tokenize(query)

    if (tokens.length === 0) {
      return []
    }

    // Build FTS5 query: join tokens with OR for broader recall
    const ftsQuery = tokens.join(' OR ')

    try {
      const rows = db.prepare(`
        SELECT memory_id as id, bm25(memories_fts) as rank
        FROM memories_fts
        WHERE memories_fts MATCH ?
          AND user_id = ?
        ORDER BY rank
        LIMIT ?
      `).all(ftsQuery, userId, limit) as { id: string; rank: number }[]

      return rows.map(row => ({
        id: row.id,
        score: row.rank, // BM25 rank (negative, higher = more relevant)
      }))
    } catch (error) {
      logger.warn(`[BM25] Search error: ${error}`)
      return []
    }
  }

  /**
   * Sync: add memory to FTS5 index
   */
  syncSave(memory: Memory): void {
    if (!this.initialized) return

    const db = getSqliteConnection()

    try {
      // Replace an existing FTS row when a memory is re-saved.
      db.prepare(
        "DELETE FROM memories_fts WHERE memory_id = ?"
      ).run(memory.id)

      db.prepare(
        "INSERT INTO memories_fts(memory_id, user_id, text) VALUES (?, ?, ?)"
      ).run(memory.id, memory.metadata.user_id, tokenizeForFTS5(memory.text))
    } catch (error) {
      logger.warn(`[BM25] Sync save failed: ${error}`)
    }
  }

  /**
   * Sync: update memory in FTS5 index
   */
  syncUpdate(id: string, memory: Memory): void {
    if (!this.initialized) return

    const db = getSqliteConnection()

    try {
      // Delete old and insert new
      db.prepare(
        "DELETE FROM memories_fts WHERE memory_id = ?"
      ).run(id)

      db.prepare(
        "INSERT INTO memories_fts(memory_id, user_id, text) VALUES (?, ?, ?)"
      ).run(id, memory.metadata.user_id, tokenizeForFTS5(memory.text))
    } catch (error) {
      logger.warn(`[BM25] Sync update failed: ${error}`)
    }
  }

  /**
   * Sync: delete memory from FTS5 index
   */
  syncDelete(id: string): void {
    if (!this.initialized) return

    const db = getSqliteConnection()

    try {
      db.prepare(
        "DELETE FROM memories_fts WHERE memory_id = ?"
      ).run(id)
    } catch (error) {
      logger.warn(`[BM25] Sync delete failed: ${error}`)
    }
  }
}
