import Redis from 'ioredis'
import { Lock } from './lock.interface'
import { logger } from '../utils/logger'

export class RedisLock implements Lock {
  private redis: Redis
  private connected = false
  private tokens = new Map<string, string>()

  constructor(redisUrl = 'redis://localhost:6379') {
    this.redis = new Redis(redisUrl, {
      retryStrategy: (times) => {
        if (times > 3) return null
        return Math.min(times * 200, 2000)
      },
      maxRetriesPerRequest: 3
    })

    this.redis.on('connect', () => {
      this.connected = true
    })

    this.redis.on('error', (err) => {
      logger.error('[Redis] Connection error:', err.message)
      this.connected = false
    })
  }

  async acquire(taskName: string, ttlMs = 60000): Promise<boolean> {
    if (!this.connected) {
      logger.warn('[Redis] Not connected, skipping lock')
      return false
    }

    try {
      const token = Date.now().toString() + Math.random().toString(36)
      const result = await this.redis.set(
        `lock:${taskName}`,
        token,
        'PX', ttlMs,
        'NX'
      )

      if (result === 'OK') {
        this.tokens.set(taskName, token)
        return true
      }
      return false
    } catch (error) {
      logger.error('[Redis] Acquire lock error:', error)
      return false
    }
  }

  async release(taskName: string): Promise<void> {
    if (!this.connected) return

    const token = this.tokens.get(taskName)
    if (!token) return

    try {
      await this.redis.eval(`
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        end
        return 0
      `, 1, `lock:${taskName}`, token)

      this.tokens.delete(taskName)
    } catch (error) {
      logger.error('[Redis] Release lock error:', error)
    }
  }

  async withLock<T>(
    taskName: string,
    fn: () => Promise<T>,
    ttlMs = 60000
  ): Promise<T> {
    const acquired = await this.acquire(taskName, ttlMs)
    if (!acquired) {
      throw new Error(`Failed to acquire lock: ${taskName}`)
    }

    try {
      return await fn()
    } finally {
      await this.release(taskName)
    }
  }

  async disconnect(): Promise<void> {
    await this.redis.quit()
    this.connected = false
  }
}
