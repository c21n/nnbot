import { getSqliteConnection } from './connection'
import { IMessageRepository } from '../interfaces'
import { Message } from '../../types'

export class SqliteMessageRepository implements IMessageRepository {
  async save(message: Message): Promise<void> {
    const db = getSqliteConnection()
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO messages (id, session_id, user_id, role, content, timestamp, summarized)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      message.id,
      message.session_id,
      message.user_id,
      message.role,
      message.content,
      message.timestamp,
      message.summarized ? 1 : 0
    )
  }

  async findById(id: string): Promise<Message | null> {
    const db = getSqliteConnection()
    const stmt = db.prepare('SELECT * FROM messages WHERE id = ?')
    const row = stmt.get(id) as any

    if (!row) return null

    return {
      id: row.id,
      session_id: row.session_id,
      user_id: row.user_id,
      role: row.role,
      content: row.content,
      timestamp: row.timestamp,
      summarized: row.summarized === 1
    }
  }

  async findBySession(sessionId: string, limit: number): Promise<Message[]> {
    const db = getSqliteConnection()
    const stmt = db.prepare(`
      SELECT * FROM messages
      WHERE session_id = ?
      ORDER BY timestamp ASC
      LIMIT ?
    `)
    const rows = stmt.all(sessionId, limit) as any[]

    return rows.map(row => ({
      id: row.id,
      session_id: row.session_id,
      user_id: row.user_id,
      role: row.role,
      content: row.content,
      timestamp: row.timestamp,
      summarized: row.summarized === 1
    }))
  }

  async findByUser(userId: string, limit: number): Promise<Message[]> {
    const db = getSqliteConnection()
    const stmt = db.prepare(`
      SELECT * FROM messages
      WHERE user_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `)
    const rows = stmt.all(userId, limit) as any[]

    return rows.map(row => ({
      id: row.id,
      session_id: row.session_id,
      user_id: row.user_id,
      role: row.role,
      content: row.content,
      timestamp: row.timestamp,
      summarized: row.summarized === 1
    }))
  }

  async countBySession(sessionId: string): Promise<number> {
    const db = getSqliteConnection()
    const stmt = db.prepare('SELECT COUNT(*) as count FROM messages WHERE session_id = ?')
    const result = stmt.get(sessionId) as any
    return result.count
  }

  async updateSummarized(id: string, summarized: boolean): Promise<void> {
    const db = getSqliteConnection()
    const stmt = db.prepare('UPDATE messages SET summarized = ? WHERE id = ?')
    stmt.run(summarized ? 1 : 0, id)
  }

  async deleteOldestSummarized(sessionId: string, count: number): Promise<number> {
    const db = getSqliteConnection()
    const stmt = db.prepare(`
      DELETE FROM messages
      WHERE id IN (
        SELECT id FROM messages
        WHERE session_id = ? AND summarized = 1
        ORDER BY timestamp ASC
        LIMIT ?
      )
    `)
    const result = stmt.run(sessionId, count)
    return result.changes
  }

  async deleteBySession(sessionId: string): Promise<void> {
    const db = getSqliteConnection()
    const stmt = db.prepare('DELETE FROM messages WHERE session_id = ?')
    stmt.run(sessionId)
  }
}
