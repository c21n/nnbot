import { IMemoryRepository, ISessionRepository, IUserIndexRepository } from '../storage/interfaces.js'
import { ILock } from '../lock/lock.interface.js'
import { Memory } from '../types/index.js'
import { config } from '../config/index.js'
import { logger } from '../utils/logger.js'
import cron, { type ScheduledTask } from 'node-cron'

const DECAY_RATE = config.lifecycle.decayRate
const CLEANUP_DAYS_THRESHOLD = config.lifecycle.cleanupDaysThreshold
const CLEANUP_IMPORTANCE_THRESHOLD = config.lifecycle.cleanupImportanceThreshold
const MAX_MEMORIES_PER_USER = config.lifecycle.maxMemoriesPerUser
const SESSION_CLEANUP_TTL = config.lifecycle.sessionCleanupTtlSeconds

export class LifecycleService {
  private cronJobs: ScheduledTask[] = []

  constructor(
    private memoryRepo: IMemoryRepository,
    private sessionRepo: ISessionRepository,
    private lock: ILock,
    private userIndexRepo?: IUserIndexRepository
  ) {}

  startCronJobs(): void {
    // Daily decay at 02:00
    const decayJob = cron.schedule('0 2 * * *', () => {
      this.dailyDecay().catch(err => logger.error('[Lifecycle] Daily decay error:', err))
    })
    this.cronJobs.push(decayJob)

    // Session cleanup every hour
    const cleanupJob = cron.schedule('0 * * * *', () => {
      this.cleanupExpiredSessions().catch(err => logger.error('[Lifecycle] Cleanup error:', err))
    })
    this.cronJobs.push(cleanupJob)

    logger.info('[Lifecycle] Cron jobs started')
  }

  stopCronJobs(): void {
    for (const job of this.cronJobs) {
      job.stop()
    }
    this.cronJobs = []
    logger.info('[Lifecycle] Cron jobs stopped')
  }

  async dailyDecay(): Promise<void> {
    const lockKey = 'daily-decay'
    const acquired = await this.lock.acquire(lockKey, 300000) // 5 min lock
    if (!acquired) {
      logger.info('[Lifecycle] Daily decay already running by another instance')
      return
    }

    try {
      const userIds = await this.getAllUserIds()

      for (const userId of userIds) {
        const remainingMemories = await this.decayUserMemories(userId)
        await this.evictIfNeeded(userId, remainingMemories)
      }

      logger.info(`[Lifecycle] Daily decay completed for ${userIds.length} users`)
    } finally {
      await this.lock.release(lockKey)
    }
  }

  private async decayUserMemories(userId: string): Promise<Memory[]> {
    const memories = await this.memoryRepo.getAll(userId)
    const now = Date.now()
    const remaining: Memory[] = []

    for (const memory of memories) {
      const daysSinceCreation = (now - memory.created_at) / (1000 * 60 * 60 * 24)
      const daysSinceAccess = (now - memory.last_accessed_at) / (1000 * 60 * 60 * 24)

      // Base decay: importance decreases over time
      const baseDecay = Math.pow(DECAY_RATE, daysSinceCreation)

      // Access boost: recently accessed memories decay slower
      const accessBoost = Math.max(0.5, 1 - daysSinceAccess / 30)

      // New importance
      const newImportance = Math.max(0, Math.min(1,
        memory.metadata.importance * baseDecay * accessBoost
      ))

      // Delete if too old and unimportant
      if (newImportance < CLEANUP_IMPORTANCE_THRESHOLD &&
          daysSinceCreation > CLEANUP_DAYS_THRESHOLD) {
        await this.memoryRepo.delete(memory.id)
      } else {
        // Update importance
        const updated = {
          ...memory,
          metadata: { ...memory.metadata, importance: newImportance }
        }
        await this.memoryRepo.update(memory.id, updated)
        remaining.push(updated)
      }
    }

    return remaining
  }

  private async evictIfNeeded(userId: string, memories: Memory[]): Promise<void> {
    if (memories.length <= MAX_MEMORIES_PER_USER) {
      return
    }

    // Calculate eviction score
    const scored = memories.map(m => ({
      memory: m,
      score: this.calculateEvictionScore(m)
    }))

    // Sort by score ascending (lowest score = evict first)
    scored.sort((a, b) => a.score - b.score)

    // Delete lowest scored memories
    const toDelete = scored.slice(0, memories.length - MAX_MEMORIES_PER_USER)
    for (const item of toDelete) {
      await this.memoryRepo.delete(item.memory.id)
    }

    logger.info(`[Lifecycle] Evicted ${toDelete.length} memories for user ${userId}`)
  }

  private calculateEvictionScore(memory: Memory): number {
    const now = Date.now()
    const daysSinceCreation = (now - memory.created_at) / (1000 * 60 * 60 * 24)
    const daysSinceAccess = (now - memory.last_accessed_at) / (1000 * 60 * 60 * 24)

    // Weighted score components
    const importanceScore = memory.metadata.importance * 0.4
    const accessScore = Math.max(0, 1 - daysSinceAccess / 30) * 0.3
    const ageScore = Math.max(0, 1 - daysSinceCreation / 90) * 0.2
    const accessCountScore = Math.min(1, memory.access_count / 10) * 0.1

    return importanceScore + accessScore + ageScore + accessCountScore
  }

  async cleanupExpiredSessions(): Promise<void> {
    const deleted = await this.sessionRepo.deleteExpired(SESSION_CLEANUP_TTL)
    if (deleted > 0) {
      logger.info(`[Lifecycle] Cleaned up ${deleted} expired sessions`)
    }
  }

  private async getAllUserIds(): Promise<string[]> {
    if (this.userIndexRepo) {
      return this.userIndexRepo.getAllUserIds()
    }
    return []
  }
}
