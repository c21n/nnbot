import { describe, it, test, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { SearchService } from '../../../src/memory/services/search.service'
import { LRUCache } from '../../../src/memory/cache/lru.cache'
import { RedisLock } from '../../../src/memory/lock/redis.lock'
import { MemoryLock } from '../../../src/memory/lock/memory.lock'
import { buildPromptWithProtection } from '../../../src/memory/security/prompt-protection'
import { Memory, SearchResult } from '../../../src/memory/types'
import { IMemoryRepository } from '../../../src/memory/storage/interfaces'
import { EmbeddingProvider } from '../../../src/memory/providers/embedding.provider'

// Mock implementations for integration testing
const createMockMemoryRepo = (): IMemoryRepository => {
  const memories: Memory[] = []

  return {
    save: vi.fn(async (memory: Memory) => {
      memories.push(memory)
    }),
    findById: vi.fn(async (id: string) => {
      return memories.find((m) => m.id === id) || null
    }),
    query: vi.fn(async (params: any) => {
      // Simple mock: return all memories for the user
      return memories
        .filter((m) => m.metadata.user_id === params.userId)
        .map((m) => ({
          id: m.id,
          text: m.text,
          score: 0.8,
          metadata: m.metadata
        }))
        .slice(0, params.limit)
    }),
    update: vi.fn(),
    delete: vi.fn(async (id: string) => {
      const index = memories.findIndex((m) => m.id === id)
      if (index !== -1) memories.splice(index, 1)
    }),
    deleteByUser: vi.fn(async (userId: string) => {
      const count = memories.filter((m) => m.metadata.user_id === userId).length
      memories.length = 0
      return count
    }),
    countByUser: vi.fn(async (userId: string) => {
      return memories.filter((m) => m.metadata.user_id === userId).length
    }),
    getAll: vi.fn(async (userId: string) => {
      return memories.filter((m) => m.metadata.user_id === userId)
    }),
    findByTimeRange: vi.fn(async (userId: string, start: number, end: number) => {
      return memories.filter(m => m.metadata.user_id === userId && m.created_at >= start && m.created_at <= end)
    }),
    findByType: vi.fn(async (userId: string, type: string) => {
      return memories.filter(m => m.metadata.user_id === userId && m.metadata.type === type)
    }),
    deleteByTimeRange: vi.fn(async (userId: string, start: number, end: number) => {
      const toDelete = memories.filter(m => m.metadata.user_id === userId && m.created_at >= start && m.created_at <= end)
      toDelete.forEach(m => {
        const idx = memories.indexOf(m)
        if (idx >= 0) memories.splice(idx, 1)
      })
      return toDelete.length
    }),
    deleteByType: vi.fn(async (userId: string, type: string) => {
      const toDelete = memories.filter(m => m.metadata.user_id === userId && m.metadata.type === type)
      toDelete.forEach(m => {
        const idx = memories.indexOf(m)
        if (idx >= 0) memories.splice(idx, 1)
      })
      return toDelete.length
    }),
    findByKey: vi.fn(async (userId: string, key: string) => {
      return memories.filter(m => m.metadata.user_id === userId && m.metadata.key === key)
    })
  }
}

const createMockEmbeddingProvider = (): EmbeddingProvider => ({
  embed: vi.fn().mockResolvedValue(new Array(1024).fill(0.1)),
  getDimension: () => 1024
})

describe('Memory System Integration', () => {
  let searchService: SearchService
  let mockMemoryRepo: IMemoryRepository
  let mockEmbedding: EmbeddingProvider

  beforeEach(() => {
    mockMemoryRepo = createMockMemoryRepo()
    mockEmbedding = createMockEmbeddingProvider()
    searchService = new SearchService(mockMemoryRepo, mockEmbedding)
  })

  describe('Search and Prompt Integration', () => {
    it('should search memories and build protected prompt', async () => {
      // Arrange - Store some memories
      const now = Date.now()
      const memories: Memory[] = [
        {
          id: 'mem-1',
          text: '用户喜欢Python编程',
          metadata: {
            user_id: 'user-1',
            session_id: 'session-1',
            platform: 'web',
            type: 'preference',
            importance: 0.8,
            timestamp: now - 1000 * 60 * 60,
            keywords: ['python']
          },
          created_at: now - 1000 * 60 * 60,
          last_accessed_at: now,
          access_count: 5
        },
        {
          id: 'mem-2',
          text: '用户正在学习TypeScript',
          metadata: {
            user_id: 'user-1',
            session_id: 'session-1',
            platform: 'web',
            type: 'event',
            importance: 0.6,
            timestamp: now - 1000 * 60 * 30,
            keywords: ['typescript']
          },
          created_at: now - 1000 * 60 * 30,
          last_accessed_at: now,
          access_count: 2
        }
      ]

      // Mock query to return our memories
      ;(mockMemoryRepo.query as Mock).mockResolvedValue(
        memories.map((m) => ({
          id: m.id,
          text: m.text,
          score: 0.8,
          metadata: m.metadata
        }))
      )

      // Act - Search for relevant memories
      const searchResults = await searchService.search(
        'python',
        'user-1',
        'session-1',
        { limit: 5 }
      )

      // Act - Build protected prompt
      const prompt = buildPromptWithProtection(
        '请告诉我关于Python的事情',
        searchResults,
        '你是一个有帮助的助手'
      )

      // Assert
      expect(searchResults.length).toBeGreaterThan(0)
      expect(prompt).toHaveLength(2)
      expect(prompt[0]!.role).toBe('system')
      expect(prompt[1]!.role).toBe('user')
      expect(prompt[1]!.content).toContain('Python')
    })

    it('should handle empty search results gracefully', async () => {
      // Arrange
      ;(mockMemoryRepo.query as Mock).mockResolvedValue([])

      // Act
      const searchResults = await searchService.search(
        'nonexistent',
        'user-1',
        'session-1',
        { limit: 5 }
      )

      const prompt = buildPromptWithProtection(
        '测试消息',
        [],
        '系统提示'
      )

      // Assert
      expect(searchResults).toEqual([])
      expect(prompt).toHaveLength(2)
    })
  })

  describe('Cache Integration', () => {
    it('should cache search results and return cached version', async () => {
      // Arrange
      ;(mockMemoryRepo.query as Mock).mockResolvedValue([
        {
          id: 'mem-1',
          text: 'cached memory',
          score: 0.9,
          metadata: {
            user_id: 'user-1',
            session_id: 'session-1',
            platform: 'web',
            type: 'preference',
            importance: 0.8,
            timestamp: Date.now()
          }
        }
      ])

      // Act
      const result1 = await searchService.search(
        'test',
        'user-1',
        'session-1',
        { limit: 5 }
      )
      const result2 = await searchService.search(
        'test',
        'user-1',
        'session-1',
        { limit: 5 }
      )

      // Assert
      expect(result1).toEqual(result2)
      // Query should only be called once due to caching
      expect(mockMemoryRepo.query).toHaveBeenCalledTimes(1)
    })
  })

  describe('Lock Integration', () => {
    it('should be able to create and use memory lock', () => {
      // Arrange & Act
      const lock = new MemoryLock()

      // Assert
      expect(lock).toBeDefined()
      expect(typeof lock.acquire).toBe('function')
      expect(typeof lock.release).toBe('function')
      expect(typeof lock.withLock).toBe('function')
    })
  })
})
