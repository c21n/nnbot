import { getSqliteConnection } from './connection'
import { ISessionRepository } from '../interfaces'
import { Session } from '../../types'

export class SqliteSessionRepository implements ISessionRepository {
  async save(session: Session): Promise<void> {
    const db = getSqliteConnection()
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO sessions (id, user_id, platform, group_id, created_at, last_active_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      session.id,
      session.user_id,
      session.platform,
      session.group_id || null,
      session.created_at,
      session.last_active_at
    )
  }

  async findById(id: string): Promise<Session | null> {
    const db = getSqliteConnection()
    const stmt = db.prepare('SELECT * FROM sessions WHERE id = ?')
    const row = stmt.get(id) as any

    if (!row) return null

    return {
      id: row.id,
      user_id: row.user_id,
      platform: row.platform,
      group_id: row.group_id,
      created_at: row.created_at,
      last_active_at: row.last_active_at
    }
  }

  async findActiveByUser(userId: string): Promise<Session[]> {
    const db = getSqliteConnection()
    const stmt = db.prepare(`
      SELECT * FROM sessions
      WHERE user_id = ?
      ORDER BY last_active_at DESC
    `)
    const rows = stmt.all(userId) as any[]

    return rows.map(row => ({
      id: row.id,
      user_id: row.user_id,
      platform: row.platform,
      group_id: row.group_id,
      created_at: row.created_at,
      last_active_at: row.last_active_at
    }))
  }

  async updateLastActive(id: string): Promise<void> {
    const db = getSqliteConnection()
    const stmt = db.prepare('UPDATE sessions SET last_active_at = ? WHERE id = ?')
    stmt.run(Date.now(), id)
  }

  async deleteExpired(ttlSeconds: number): Promise<number> {
    const db = getSqliteConnection()
    const threshold = Date.now() - ttlSeconds * 1000
    const stmt = db.prepare('DELETE FROM sessions WHERE last_active_at < ?')
    const result = stmt.run(threshold)
    return result.changes
  }

  async deleteById(id: string): Promise<void> {
    const db = getSqliteConnection()
    const stmt = db.prepare('DELETE FROM sessions WHERE id = ?')
    stmt.run(id)
  }
}
