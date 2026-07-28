import { getSqliteConnection } from './connection.js'
import { ISummaryRepository } from '../interfaces.js'

export class SummaryRepository implements ISummaryRepository {
  async getLastSummarizedIndex(sessionId: string): Promise<number> {
    const db = getSqliteConnection()
    const stmt = db.prepare('SELECT last_summarized_index FROM summary_indices WHERE session_id = ?')
    const row = stmt.get(sessionId) as any
    return row?.last_summarized_index || 0
  }

  async updateLastSummarizedIndex(sessionId: string, index: number): Promise<void> {
    const db = getSqliteConnection()
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO summary_indices (session_id, last_summarized_index, updated_at)
      VALUES (?, ?, ?)
    `)
    stmt.run(sessionId, index, Date.now())
  }
}
