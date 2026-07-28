import { getSqliteConnection } from './connection.js'
import { IProfileRepository } from '../interfaces.js'
import { UserProfile } from '../../types/index.js'

export class SqliteProfileRepository implements IProfileRepository {
  async save(profile: UserProfile): Promise<void> {
    const db = getSqliteConnection()
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO user_profiles (user_id, basic_info, preferences, habits, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    stmt.run(
      profile.user_id,
      JSON.stringify(profile.basic_info),
      JSON.stringify(profile.preferences),
      JSON.stringify(profile.habits),
      profile.created_at,
      profile.updated_at
    )
  }

  async findById(userId: string): Promise<UserProfile | null> {
    const db = getSqliteConnection()
    const stmt = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?')
    const row = stmt.get(userId) as any

    if (!row) return null

    return {
      user_id: row.user_id,
      basic_info: JSON.parse(row.basic_info),
      preferences: JSON.parse(row.preferences),
      habits: JSON.parse(row.habits),
      created_at: row.created_at,
      updated_at: row.updated_at
    }
  }

  async updateField(userId: string, field: string, value: any): Promise<void> {
    // 确保用户存在
    const existing = await this.findById(userId)
    if (!existing) {
      await this.save({
        user_id: userId,
        basic_info: {},
        preferences: { likes: [], dislikes: [] },
        habits: {},
        created_at: Date.now(),
        updated_at: Date.now()
      })
    }

    // 获取当前画像
    const profile = await this.findById(userId)
    if (!profile) return

    // 更新字段
    const parts = field.split('.')
    let target: any = profile
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i]
      if (key === undefined) continue
      target = target[key]
    }
    const lastKey = parts[parts.length - 1]
    if (lastKey !== undefined) {
      target[lastKey] = value
    }

    // 保存
    profile.updated_at = Date.now()
    await this.save(profile)
  }

  async delete(userId: string): Promise<void> {
    const db = getSqliteConnection()
    const stmt = db.prepare('DELETE FROM user_profiles WHERE user_id = ?')
    stmt.run(userId)
  }
}
