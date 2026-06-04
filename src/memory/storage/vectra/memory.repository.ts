import { getVectraIndex } from './connection'
import { IMemoryRepository, WhereClause } from '../interfaces'
import { Memory, MemoryMetadata, MemoryType } from '../../types'
import { SearchResult } from '../../types/search.types'
import { BM25Service } from '../../search/bm25.service'
import { logger } from '../../utils/logger'

// Flatten MemoryMetadata into vectra-compatible Record
function flattenMetadata(memory: Memory): Record<string, string | number | boolean> {
  return {
    user_id: memory.metadata.user_id,
    session_id: memory.metadata.session_id,
    group_id: memory.metadata.group_id ?? '',
    platform: memory.metadata.platform,
    type: memory.metadata.type,
    importance: memory.metadata.importance,
    timestamp: memory.metadata.timestamp,
    keywords: (memory.metadata.keywords || []).join(','),
    is_latest: memory.metadata.is_latest ?? true,
    key: memory.metadata.key ?? '',
    created_at: memory.created_at,
    last_accessed_at: memory.last_accessed_at,
    access_count: memory.access_count,
  }
}

// Unflatten vectra metadata back to MemoryMetadata
function unflattenMetadata(meta: Record<string, unknown>): MemoryMetadata {
  return {
    user_id: String(meta.user_id || ''),
    session_id: String(meta.session_id || ''),
    group_id: meta.group_id ? String(meta.group_id) : undefined,
    platform: String(meta.platform || ''),
    type: (meta.type || 'context') as MemoryType,
    importance: Number(meta.importance || 0),
    timestamp: Number(meta.timestamp || 0),
    keywords: meta.keywords ? String(meta.keywords).split(',') : [],
    is_latest: meta.is_latest === true || meta.is_latest === 'true',
    key: meta.key ? String(meta.key) : undefined,
  }
}

// Filter items by where clause (in-memory filtering)
function matchesWhere(
  meta: Record<string, unknown>,
  where?: WhereClause
): boolean {
  if (!where) return true

  for (const [key, condition] of Object.entries(where)) {
    const value = meta[key]

    if (typeof condition === 'object' && condition !== null) {
      // Operator-based comparison
      if ('$eq' in condition && value !== condition.$eq) return false
      if ('$ne' in condition && value === condition.$ne) return false
      if ('$gt' in condition && Number(value) <= Number(condition.$gt)) return false
      if ('$gte' in condition && Number(value) < Number(condition.$gte)) return false
      if ('$lt' in condition && Number(value) >= Number(condition.$lt)) return false
      if ('$lte' in condition && Number(value) > Number(condition.$lte)) return false
      if ('$in' in condition && !condition.$in?.includes(value as string | number | boolean)) return false
      if ('$nin' in condition && condition.$nin?.includes(value as string | number | boolean)) return false
    } else {
      // Direct equality
      if (value !== condition) return false
    }
  }

  return true
}

export class VectraMemoryRepository implements IMemoryRepository {
  constructor(private bm25?: BM25Service) {}

  async save(memory: Memory): Promise<void> {
    const index = await getVectraIndex()

    if (!memory.embedding) {
      logger.warn(`[Vectra] Save skipped: memory ${memory.id} has no embedding`)
      return
    }

    await index.insertItem({
      vector: memory.embedding,
      metadata: {
        _id: memory.id,
        _text: memory.text,
        ...flattenMetadata(memory),
      },
    })

    // Sync to FTS5 for BM25 search
    this.bm25?.syncSave(memory)
  }

  async query(params: {
    embedding: number[]
    userId: string
    sessionId?: string
    limit: number
    where?: WhereClause
  }): Promise<SearchResult[]> {
    const index = await getVectraIndex()

    if (!params.embedding || params.embedding.length === 0) {
      return []
    }

    try {
      // Fetch more results for post-filtering
      const fetchLimit = params.limit * 3
      const results = await index.queryItems(params.embedding, '', fetchLimit)

      // Filter and map results
      const filtered: SearchResult[] = []

      for (const result of results) {
        const meta = result.item.metadata

        // Apply userId filter
        if (meta.user_id !== params.userId) continue

        // Apply sessionId filter
        if (params.sessionId && meta.session_id !== params.sessionId) continue

        // Apply where clause
        if (!matchesWhere(meta, params.where)) continue

        filtered.push({
          id: String(meta._id),
          text: String(meta._text),
          score: result.score,
          metadata: unflattenMetadata(meta),
        })

        if (filtered.length >= params.limit) break
      }

      return filtered
    } catch (error) {
      logger.error(`[Vectra] Query error: ${error instanceof Error ? error.message : String(error)}`)
      return []
    }
  }

  async findById(id: string): Promise<Memory | null> {
    const index = await getVectraIndex()
    const items = await index.listItems()

    for (const item of items) {
      if (item.metadata._id === id) {
        return {
          id: String(item.metadata._id),
          text: String(item.metadata._text),
          metadata: unflattenMetadata(item.metadata),
          created_at: Number(item.metadata.created_at || 0),
          last_accessed_at: Number(item.metadata.last_accessed_at || 0),
          access_count: Number(item.metadata.access_count || 0),
        }
      }
    }

    return null
  }

  async update(id: string, data: Partial<Memory>): Promise<void> {
    const index = await getVectraIndex()
    const items = await index.listItems()

    const existing = items.find((item) => item.metadata._id === id)
    if (!existing) {
      logger.warn(`[Vectra] Update failed: memory ${id} not found`)
      return
    }

    const existingMeta = unflattenMetadata(existing.metadata)
    const mergedMeta = { ...existingMeta, ...data.metadata }

    const vector = data.embedding || (existing.vector as number[])

    await index.upsertItem({
      id: existing.id,
      vector,
      metadata: {
        _id: id,
        _text: data.text || String(existing.metadata._text),
        ...flattenMetadata({
          id,
          text: data.text || String(existing.metadata._text),
          embedding: vector,
          metadata: mergedMeta,
          created_at: data.created_at || Number(existing.metadata.created_at || 0),
          last_accessed_at: data.last_accessed_at || Number(existing.metadata.last_accessed_at || 0),
          access_count: data.access_count || Number(existing.metadata.access_count || 0),
        }),
      },
    })

    // Sync to FTS5
    const updatedMemory: Memory = {
      id,
      text: data.text || String(existing.metadata._text),
      embedding: vector,
      metadata: mergedMeta,
      created_at: data.created_at || Number(existing.metadata.created_at || 0),
      last_accessed_at: data.last_accessed_at || Number(existing.metadata.last_accessed_at || 0),
      access_count: data.access_count || Number(existing.metadata.access_count || 0),
    }
    this.bm25?.syncUpdate(id, updatedMemory)
  }

  async delete(id: string): Promise<void> {
    const index = await getVectraIndex()
    const items = await index.listItems()

    const target = items.find((item) => item.metadata._id === id)
    if (target) {
      await index.deleteItem(target.id)
    }

    // Sync to FTS5
    this.bm25?.syncDelete(id)
  }

  async deleteByUser(userId: string): Promise<number> {
    const index = await getVectraIndex()
    const items = await index.listItems()

    const toDelete = items.filter((item) => item.metadata.user_id === userId)

    for (const item of toDelete) {
      await index.deleteItem(item.id)
    }

    return toDelete.length
  }

  async countByUser(userId: string): Promise<number> {
    const index = await getVectraIndex()
    const items = await index.listItems()

    return items.filter((item) => item.metadata.user_id === userId).length
  }

  async getAll(userId: string): Promise<Memory[]> {
    const index = await getVectraIndex()
    const items = await index.listItems()

    return items
      .filter((item) => item.metadata.user_id === userId)
      .map((item) => ({
        id: String(item.metadata._id),
        text: String(item.metadata._text),
        metadata: unflattenMetadata(item.metadata),
        created_at: Number(item.metadata.created_at || 0),
        last_accessed_at: Number(item.metadata.last_accessed_at || 0),
        access_count: Number(item.metadata.access_count || 0),
      }))
  }

  async findByKey(userId: string, key: string): Promise<Memory[]> {
    const index = await getVectraIndex()
    const items = await index.listItems()

    return items
      .filter((item) => item.metadata.user_id === userId && item.metadata.key === key)
      .map((item) => ({
        id: String(item.metadata._id),
        text: String(item.metadata._text),
        metadata: unflattenMetadata(item.metadata),
        created_at: Number(item.metadata.created_at || 0),
        last_accessed_at: Number(item.metadata.last_accessed_at || 0),
        access_count: Number(item.metadata.access_count || 0),
      }))
  }

  async findByTimeRange(userId: string, startTime: number, endTime: number): Promise<Memory[]> {
    const index = await getVectraIndex()
    const items = await index.listItems()

    return items
      .filter((item) => {
        if (item.metadata.user_id !== userId) return false
        const createdAt = Number(item.metadata.created_at || 0)
        return createdAt >= startTime && createdAt <= endTime
      })
      .map((item) => ({
        id: String(item.metadata._id),
        text: String(item.metadata._text),
        metadata: unflattenMetadata(item.metadata),
        created_at: Number(item.metadata.created_at || 0),
        last_accessed_at: Number(item.metadata.last_accessed_at || 0),
        access_count: Number(item.metadata.access_count || 0),
      }))
  }

  async findByType(userId: string, type: string): Promise<Memory[]> {
    const index = await getVectraIndex()
    const items = await index.listItems()

    return items
      .filter((item) => item.metadata.user_id === userId && item.metadata.type === type)
      .map((item) => ({
        id: String(item.metadata._id),
        text: String(item.metadata._text),
        metadata: unflattenMetadata(item.metadata),
        created_at: Number(item.metadata.created_at || 0),
        last_accessed_at: Number(item.metadata.last_accessed_at || 0),
        access_count: Number(item.metadata.access_count || 0),
      }))
  }

  async deleteByTimeRange(userId: string, startTime: number, endTime: number): Promise<number> {
    const memories = await this.findByTimeRange(userId, startTime, endTime)
    if (memories.length === 0) return 0

    const index = await getVectraIndex()
    const items = await index.listItems()

    const idsToDelete = new Set(memories.map((m) => m.id))
    const toDelete = items.filter((item) => idsToDelete.has(String(item.metadata._id)))

    for (const item of toDelete) {
      await index.deleteItem(item.id)
    }

    return toDelete.length
  }

  async deleteByType(userId: string, type: string): Promise<number> {
    const memories = await this.findByType(userId, type)
    if (memories.length === 0) return 0

    const index = await getVectraIndex()
    const items = await index.listItems()

    const idsToDelete = new Set(memories.map((m) => m.id))
    const toDelete = items.filter((item) => idsToDelete.has(String(item.metadata._id)))

    for (const item of toDelete) {
      await index.deleteItem(item.id)
    }

    return toDelete.length
  }
}
