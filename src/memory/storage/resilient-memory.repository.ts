import { IMemoryRepository, WhereClause } from './interfaces'
import { Memory, SearchResult } from '../types'
import { logger } from '../utils/logger'

/**
 * Resilient memory repository that falls back to SQLite when ChromaDB is unavailable.
 * Each method tries the primary (ChromaDB) first, then falls back to the backup (SQLite).
 */
export class ResilientMemoryRepository implements IMemoryRepository {
  constructor(
    private primary: IMemoryRepository,
    private fallback: IMemoryRepository
  ) {}

  private async withFallback<T>(
    operation: string,
    primaryFn: () => Promise<T>,
    fallbackFn: () => Promise<T>
  ): Promise<T> {
    try {
      return await primaryFn()
    } catch (error) {
      const msg = error instanceof Error ? `${error.message}\n${error.stack}` : String(error)
      logger.warn(`[Resilient] ChromaDB ${operation} failed, falling back to SQLite: ${msg}`)
      return await fallbackFn()
    }
  }

  async save(memory: Memory): Promise<void> {
    return this.withFallback(
      'save',
      () => this.primary.save(memory),
      () => this.fallback.save(memory)
    )
  }

  async findById(id: string): Promise<Memory | null> {
    return this.withFallback(
      'findById',
      () => this.primary.findById(id),
      () => this.fallback.findById(id)
    )
  }

  async query(params: {
    embedding: number[]
    userId: string
    sessionId?: string
    limit: number
    where?: WhereClause
  }): Promise<SearchResult[]> {
    return this.withFallback(
      'query',
      () => this.primary.query(params),
      () => this.fallback.query(params)
    )
  }

  async update(id: string, data: Partial<Memory>): Promise<void> {
    return this.withFallback(
      'update',
      () => this.primary.update(id, data),
      () => this.fallback.update(id, data)
    )
  }

  async delete(id: string): Promise<void> {
    return this.withFallback(
      'delete',
      () => this.primary.delete(id),
      () => this.fallback.delete(id)
    )
  }

  async deleteByUser(userId: string): Promise<number> {
    return this.withFallback(
      'deleteByUser',
      () => this.primary.deleteByUser(userId),
      () => this.fallback.deleteByUser(userId)
    )
  }

  async countByUser(userId: string): Promise<number> {
    return this.withFallback(
      'countByUser',
      () => this.primary.countByUser(userId),
      () => this.fallback.countByUser(userId)
    )
  }

  async getAll(userId: string): Promise<Memory[]> {
    return this.withFallback(
      'getAll',
      () => this.primary.getAll(userId),
      () => this.fallback.getAll(userId)
    )
  }

  async findByTimeRange(userId: string, startTime: number, endTime: number): Promise<Memory[]> {
    return this.withFallback(
      'findByTimeRange',
      () => this.primary.findByTimeRange(userId, startTime, endTime),
      () => this.fallback.findByTimeRange(userId, startTime, endTime)
    )
  }

  async findByType(userId: string, type: string): Promise<Memory[]> {
    return this.withFallback(
      'findByType',
      () => this.primary.findByType(userId, type),
      () => this.fallback.findByType(userId, type)
    )
  }

  async findByKey(userId: string, key: string): Promise<Memory[]> {
    return this.withFallback(
      'findByKey',
      () => this.primary.findByKey(userId, key),
      () => this.fallback.findByKey(userId, key)
    )
  }

  async deleteByTimeRange(userId: string, startTime: number, endTime: number): Promise<number> {
    return this.withFallback(
      'deleteByTimeRange',
      () => this.primary.deleteByTimeRange(userId, startTime, endTime),
      () => this.fallback.deleteByTimeRange(userId, startTime, endTime)
    )
  }

  async deleteByType(userId: string, type: string): Promise<number> {
    return this.withFallback(
      'deleteByType',
      () => this.primary.deleteByType(userId, type),
      () => this.fallback.deleteByType(userId, type)
    )
  }
}
