import { IMemoryRepository } from '../storage/interfaces'
import { Memory, MemoryMetadata } from '../types'
import { generateId } from '../utils/id'
import { logger } from '../utils/logger'

export class MemoryConflictService {
  constructor(private memoryRepo: IMemoryRepository) {}

  async upsertPreference(userId: string, key: string, value: boolean): Promise<void> {
    const existing = await this.memoryRepo.findByKey(userId, key)

    if (existing.length > 0) {
      // Mark all existing memories with this key as not latest
      for (const memory of existing) {
        await this.memoryRepo.update(memory.id, {
          metadata: { ...memory.metadata, is_latest: false }
        })
      }
      logger.info(`[Conflict] Marked ${existing.length} old memories as is_latest=false for key="${key}"`)
    }

    // Create new memory with is_latest: true
    const newMemory = this.createPreferenceMemory(userId, key, String(value))
    await this.memoryRepo.save(newMemory)
    logger.info(`[Conflict] Created new memory for key="${key}" with is_latest=true`)
  }

  async getLatestMemory(userId: string, key: string): Promise<Memory | null> {
    const memories = await this.memoryRepo.findByKey(userId, key)
    const match = memories.find(m => m.metadata.is_latest === true)
    return match ?? null
  }

  private createPreferenceMemory(userId: string, key: string, value: string): Memory {
    const now = Date.now()
    const metadata: MemoryMetadata = {
      user_id: userId,
      session_id: '',
      platform: 'system',
      type: 'preference',
      importance: 0.8,
      timestamp: now,
      is_latest: true,
      key
    }

    return {
      id: generateId(),
      text: `${key}: ${value}`,
      metadata,
      created_at: now,
      last_accessed_at: now,
      access_count: 0
    }
  }
}
