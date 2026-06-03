import { getChromaCollection } from './connection'
import { IMemoryRepository } from '../interfaces'
import { Memory, MemoryMetadata, MemoryType } from '../../types'
import { SearchResult } from '../../types/search.types'
import { logger } from '../../utils/logger'

// Helper to convert ChromaDB metadata to MemoryMetadata
function toMemoryMetadata(meta: Record<string, any>): MemoryMetadata {
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
    key: meta.key ? String(meta.key) : undefined
  }
}

export class ChromaMemoryRepository implements IMemoryRepository {
  private mapResults(result: { ids?: string[]; documents?: (string | null)[]; metadatas?: (Record<string, any> | null)[] }): Memory[] {
    const ids = result.ids ?? []
    return ids.map((id, i) => {
      const meta = result.metadatas?.[i]
      if (!meta) return null
      return {
        id,
        text: String(result.documents?.[i] || ''),
        metadata: toMemoryMetadata(meta),
        created_at: Number(meta.created_at || 0),
        last_accessed_at: Number(meta.last_accessed_at || 0),
        access_count: Number(meta.access_count || 0)
      }
    }).filter((m): m is Memory => m !== null)
  }
  async save(memory: Memory): Promise<void> {
    const collection = await getChromaCollection()

    await collection.add({
      ids: [memory.id],
      embeddings: memory.embedding ? [memory.embedding] : undefined,
      documents: [memory.text],
      metadatas: [{
        user_id: memory.metadata.user_id,
        session_id: memory.metadata.session_id,
        group_id: memory.metadata.group_id ?? '',
        platform: memory.metadata.platform,
        type: memory.metadata.type,
        importance: memory.metadata.importance,
        timestamp: memory.metadata.timestamp,
        created_at: memory.created_at,
        last_accessed_at: memory.last_accessed_at,
        access_count: memory.access_count,
        keywords: (memory.metadata.keywords || []).join(','),
        is_latest: memory.metadata.is_latest ?? true,
        key: memory.metadata.key ?? ''
      }]
    })
  }

  async query(params: {
    embedding: number[]
    userId: string
    sessionId?: string
    limit: number
    where?: any
  }): Promise<SearchResult[]> {
    const collection = await getChromaCollection()

    const where: any = { user_id: params.userId }
    if (params.sessionId) {
      where.session_id = params.sessionId
    }
    if (params.where) {
      Object.assign(where, params.where)
    }

    try {
      const result = await collection.query({
        queryEmbeddings: [params.embedding],
        nResults: params.limit,
        where
      })

      const ids = result.ids?.[0]
      if (!ids || ids.length === 0) {
        return []
      }

      return ids.map((id, i) => ({
        id,
        text: String(result.documents?.[0]?.[i] || ''),
        score: 1 - (result.distances?.[0]?.[i] || 0),
        metadata: toMemoryMetadata(result.metadatas?.[0]?.[i] || {})
      }))
    } catch (error) {
      logger.error(`[ChromaDB] Query error: ${error instanceof Error ? error.message : String(error)}`)
      return []
    }
  }

  async findById(id: string): Promise<Memory | null> {
    const collection = await getChromaCollection()
    const result = await collection.get({ ids: [id] })

    if (!result.ids || result.ids.length === 0) return null

    const meta = result.metadatas?.[0]
    if (!meta) return null

    return {
      id: result.ids[0]!,
      text: String(result.documents?.[0] || ''),
      metadata: toMemoryMetadata(meta),
      created_at: Number(meta.created_at || 0),
      last_accessed_at: Number(meta.last_accessed_at || 0),
      access_count: Number(meta.access_count || 0)
    }
  }

  async update(id: string, data: Partial<Memory>): Promise<void> {
    const collection = await getChromaCollection()

    // Get existing data first to merge
    const existing = await this.findById(id)
    if (!existing) {
      logger.warn(`[ChromaDB] Update failed: memory ${id} not found`)
      return
    }

    const updateData: any = {}
    if (data.text) updateData.documents = [data.text]
    if (data.metadata) {
      // Merge with existing metadata to avoid data loss
      const mergedMetadata = { ...existing.metadata, ...data.metadata }
      updateData.metadatas = [{
        user_id: mergedMetadata.user_id,
        session_id: mergedMetadata.session_id,
        group_id: mergedMetadata.group_id ?? '',
        platform: mergedMetadata.platform,
        type: mergedMetadata.type,
        importance: mergedMetadata.importance,
        timestamp: mergedMetadata.timestamp,
        keywords: (mergedMetadata.keywords || []).join(','),
        is_latest: mergedMetadata.is_latest ?? true,
        key: mergedMetadata.key ?? ''
      }]
    }
    if (data.embedding) {
      updateData.embeddings = [data.embedding]
    }

    await collection.update({
      ids: [id],
      ...updateData
    })
  }

  async delete(id: string): Promise<void> {
    const collection = await getChromaCollection()
    await collection.delete({ ids: [id] })
  }

  async deleteByUser(userId: string): Promise<number> {
    const collection = await getChromaCollection()
    const result = await collection.get({
      where: { user_id: userId }
    })

    if (result.ids.length > 0) {
      await collection.delete({ ids: result.ids })
    }

    return result.ids.length
  }

  async countByUser(userId: string): Promise<number> {
    const collection = await getChromaCollection()
    const result = await collection.get({
      where: { user_id: userId }
    })
    return result.ids.length
  }

  async getAll(userId: string): Promise<Memory[]> {
    const collection = await getChromaCollection()
    const result = await collection.get({
      where: { user_id: userId }
    })
    return this.mapResults(result)
  }

  async findByKey(userId: string, key: string): Promise<Memory[]> {
    const collection = await getChromaCollection()
    const result = await collection.get({
      where: { user_id: userId, key }
    })
    return this.mapResults(result)
  }

  async findByTimeRange(userId: string, startTime: number, endTime: number): Promise<Memory[]> {
    const collection = await getChromaCollection()
    const result = await collection.get({
      where: {
        user_id: userId,
        created_at: { $gte: startTime, $lte: endTime }
      }
    })
    return this.mapResults(result)
  }

  async findByType(userId: string, type: string): Promise<Memory[]> {
    const collection = await getChromaCollection()
    const result = await collection.get({
      where: { user_id: userId, type }
    })
    return this.mapResults(result)
  }

  async deleteByTimeRange(userId: string, startTime: number, endTime: number): Promise<number> {
    const memories = await this.findByTimeRange(userId, startTime, endTime)
    if (memories.length > 0) {
      const collection = await getChromaCollection()
      await collection.delete({ ids: memories.map(m => m.id) })
    }
    return memories.length
  }

  async deleteByType(userId: string, type: string): Promise<number> {
    const memories = await this.findByType(userId, type)
    if (memories.length > 0) {
      const collection = await getChromaCollection()
      await collection.delete({ ids: memories.map(m => m.id) })
    }
    return memories.length
  }
}
