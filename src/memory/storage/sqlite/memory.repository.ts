import { getSqliteConnection } from './connection'
import { IMemoryRepository, WhereClause } from '../interfaces'
import { Memory, MemoryType, SearchResult } from '../../types'

function rowToMemory(row: Record<string, unknown>): Memory {
  return {
    id: row.id as string,
    text: row.text as string,
    metadata: {
      user_id: row.user_id as string,
      session_id: row.session_id as string,
      platform: row.platform as string,
      type: (row.type as MemoryType) || 'context',
      importance: row.importance as number,
      timestamp: row.timestamp as number,
      keywords: row.keywords ? (row.keywords as string).split(',') : [],
      is_latest: row.is_latest === 1,
      key: row.key as string || undefined,
      group_id: row.group_id as string || undefined
    },
    created_at: row.created_at as number,
    last_accessed_at: row.last_accessed_at as number,
    access_count: row.access_count as number
  }
}

export class SqliteMemoryRepository implements IMemoryRepository {
  async save(memory: Memory): Promise<void> {
    const db = getSqliteConnection()
    db.prepare(`
      INSERT OR REPLACE INTO memories
      (id, user_id, session_id, platform, type, importance, timestamp, text, keywords, created_at, last_accessed_at, access_count, is_latest, key, group_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      memory.id,
      memory.metadata.user_id,
      memory.metadata.session_id || '',
      memory.metadata.platform || '',
      memory.metadata.type,
      memory.metadata.importance,
      memory.metadata.timestamp,
      memory.text,
      (memory.metadata.keywords || []).join(','),
      memory.created_at,
      memory.last_accessed_at,
      memory.access_count,
      memory.metadata.is_latest ? 1 : 0,
      memory.metadata.key || '',
      memory.metadata.group_id || ''
    )
  }

  async findById(id: string): Promise<Memory | null> {
    const db = getSqliteConnection()
    const row = db.prepare('SELECT * FROM memories WHERE id = ?').get(id)
    return row ? rowToMemory(row as Record<string, unknown>) : null
  }

  async query(_params: {
    embedding: number[]
    userId: string
    sessionId?: string
    limit: number
    where?: WhereClause
  }): Promise<SearchResult[]> {
    // SQLite fallback: no vector search, return empty
    return []
  }

  async update(id: string, data: Partial<Memory>): Promise<void> {
    const existing = await this.findById(id)
    if (!existing) return

    const merged = { ...existing, ...data, metadata: { ...existing.metadata, ...data.metadata } }
    await this.save(merged as Memory)
  }

  async delete(id: string): Promise<void> {
    const db = getSqliteConnection()
    db.prepare('DELETE FROM memories WHERE id = ?').run(id)
  }

  async deleteByUser(userId: string): Promise<number> {
    const db = getSqliteConnection()
    const result = db.prepare('DELETE FROM memories WHERE user_id = ?').run(userId)
    return result.changes
  }

  async countByUser(userId: string): Promise<number> {
    const db = getSqliteConnection()
    const row = db.prepare('SELECT COUNT(*) as count FROM memories WHERE user_id = ?').get(userId) as { count: number }
    return row.count
  }

  async getAll(userId: string): Promise<Memory[]> {
    const db = getSqliteConnection()
    const rows = db.prepare('SELECT * FROM memories WHERE user_id = ?').all(userId) as Record<string, unknown>[]
    return rows.map(rowToMemory)
  }

  async findByTimeRange(userId: string, startTime: number, endTime: number): Promise<Memory[]> {
    const db = getSqliteConnection()
    const rows = db.prepare(
      'SELECT * FROM memories WHERE user_id = ? AND created_at >= ? AND created_at <= ?'
    ).all(userId, startTime, endTime) as Record<string, unknown>[]
    return rows.map(rowToMemory)
  }

  async findByType(userId: string, type: string): Promise<Memory[]> {
    const db = getSqliteConnection()
    const rows = db.prepare(
      'SELECT * FROM memories WHERE user_id = ? AND type = ?'
    ).all(userId, type) as Record<string, unknown>[]
    return rows.map(rowToMemory)
  }

  async findByKey(userId: string, key: string): Promise<Memory[]> {
    const db = getSqliteConnection()
    const rows = db.prepare(
      'SELECT * FROM memories WHERE user_id = ? AND key = ?'
    ).all(userId, key) as Record<string, unknown>[]
    return rows.map(rowToMemory)
  }

  async deleteByTimeRange(userId: string, startTime: number, endTime: number): Promise<number> {
    const db = getSqliteConnection()
    const result = db.prepare(
      'DELETE FROM memories WHERE user_id = ? AND created_at >= ? AND created_at <= ?'
    ).run(userId, startTime, endTime)
    return result.changes
  }

  async deleteByType(userId: string, type: string): Promise<number> {
    const db = getSqliteConnection()
    const result = db.prepare(
      'DELETE FROM memories WHERE user_id = ? AND type = ?'
    ).run(userId, type)
    return result.changes
  }
}
