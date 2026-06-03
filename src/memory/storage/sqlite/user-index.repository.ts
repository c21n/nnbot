import { getSqliteConnection } from './connection'
import { IUserIndexRepository } from '../interfaces'

export class SqliteUserIndexRepository implements IUserIndexRepository {
  async upsert(userId: string): Promise<void> {
    const db = getSqliteConnection()
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO user_index (user_id, last_seen_at)
      VALUES (?, ?)
    `)
    stmt.run(userId, Date.now())
  }

  async getAllUserIds(): Promise<string[]> {
    const db = getSqliteConnection()
    const rows = db.prepare('SELECT user_id FROM user_index').all() as { user_id: string }[]
    return rows.map(r => r.user_id)
  }

  async delete(userId: string): Promise<void> {
    const db = getSqliteConnection()
    const stmt = db.prepare('DELETE FROM user_index WHERE user_id = ?')
    stmt.run(userId)
  }
}
