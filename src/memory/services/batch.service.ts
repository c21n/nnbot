import { IMemoryRepository } from '../storage/interfaces.js'
import { logger } from '../utils/logger.js'

export class BatchOperationService {
  constructor(private memoryRepo: IMemoryRepository) {}

  /**
   * Delete memories within a time range (inclusive).
   * Returns the number of deleted memories.
   */
  async deleteByTimeRange(
    userId: string,
    startTime: number,
    endTime: number
  ): Promise<number> {
    if (!userId) {
      throw new Error('userId is required')
    }

    if (startTime > endTime) {
      throw new Error('startTime must be less than or equal to endTime')
    }

    const deletedCount = await this.memoryRepo.deleteByTimeRange(userId, startTime, endTime)

    logger.info(
      `[Batch] Deleted ${deletedCount} memories ` +
      `for user ${userId} in time range [${startTime}, ${endTime}]`
    )

    return deletedCount
  }

  /**
   * Delete memories matching a specific type from metadata.
   * Returns the number of deleted memories.
   */
  async deleteByType(userId: string, type: string): Promise<number> {
    if (!userId) {
      throw new Error('userId is required')
    }

    if (!type) {
      throw new Error('type is required')
    }

    const deletedCount = await this.memoryRepo.deleteByType(userId, type)

    logger.info(
      `[Batch] Deleted ${deletedCount} memories ` +
      `of type "${type}" for user ${userId}`
    )

    return deletedCount
  }

  /**
   * Batch update importance for specified memories.
   * Preserves existing metadata and merges new importance.
   */
  async batchUpdateImportance(
    userId: string,
    memoryIds: string[],
    newImportance: number
  ): Promise<void> {
    if (!userId) {
      throw new Error('userId is required')
    }

    if (newImportance < 0 || newImportance > 1) {
      throw new Error('newImportance must be between 0 and 1')
    }

    if (memoryIds.length === 0) {
      return
    }

    let successCount = 0
    for (const id of memoryIds) {
      try {
        const memory = await this.memoryRepo.findById(id)

        if (!memory) {
          logger.warn(`[Batch] Memory ${id} not found, skipping`)
          continue
        }

        if (memory.metadata.user_id !== userId) {
          logger.warn(`[Batch] Memory ${id} belongs to different user, skipping`)
          continue
        }

        await this.memoryRepo.update(id, {
          metadata: {
            ...memory.metadata,
            importance: newImportance
          }
        })
        successCount++
      } catch (error) {
        logger.error(`[Batch] Failed to update memory ${id}:`, error)
      }
    }

    logger.info(
      `[Batch] Updated importance to ${newImportance} ` +
      `for ${successCount}/${memoryIds.length} memories of user ${userId}`
    )
  }
}
