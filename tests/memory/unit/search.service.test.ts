import { describe, it, test, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { SearchService } from '../../../src/memory/services/search.service'
import { IMemoryRepository } from '../../../src/memory/storage/interfaces'
import { EmbeddingProvider } from '../../../src/memory/providers/embedding.provider'
import { Memory, SearchResult } from '../../../src/memory/types'

// Mock implementations
const createMockMemoryRepo = (): IMemoryRepository => ({
  save: vi.fn(),
  findById: vi.fn(),
  query: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  deleteByUser: vi.fn(),
  countByUser: vi.fn(),
  getAll: vi.fn(),
  findByTimeRange: vi.fn(),
  findByType: vi.fn(),
  deleteByTimeRange: vi.fn(),
  deleteByType: vi.fn(),
    findByKey: vi.fn()
})

const createMockEmbeddingProvider = (): EmbeddingProvider => ({
  embed: vi.fn().mockResolvedValue(new Array(1024).fill(0.1)),
  getDimension: () => 1024
})

const createMemory = (overrides: Partial<Memory> = {}): Memory => ({
  id: 'mem-1',
  text: '用户喜欢Python编程',
  metadata: {
    user_id: 'user-1',
    session_id: 'session-1',
    platform: 'web',
    type: 'preference',
    importance: 0.8,
    timestamp: Date.now() - 1000 * 60 * 60, // 1 hour ago
    keywords: ['python', '编程']
  },
  created_at: Date.now() - 1000 * 60 * 60,
  last_accessed_at: Date.now() - 1000 * 60 * 30,
  access_count: 5,
  ...overrides
})

const createSearchResult = (overrides: Partial<SearchResult> = {}): SearchResult => ({
  id: 'mem-1',
  text: '用户喜欢Python编程',
  score: 0.85,
  metadata: {
    user_id: 'user-1',
    session_id: 'session-1',
    platform: 'web',
    type: 'preference',
    importance: 0.8,
    timestamp: Date.now() - 1000 * 60 * 60,
    keywords: ['python', '编程']
  },
  ...overrides
})

describe('SearchService', () => {
  let searchService: SearchService
  let mockMemoryRepo: IMemoryRepository
  let mockEmbedding: EmbeddingProvider

  beforeEach(() => {
    mockMemoryRepo = createMockMemoryRepo()
    mockEmbedding = createMockEmbeddingProvider()
    searchService = new SearchService(mockMemoryRepo, mockEmbedding)
  })

  describe('search()', () => {
    it('should return empty array when no memories match', async () => {
      // Arrange
      ;(mockMemoryRepo.query as Mock).mockResolvedValue([])

      // Act
      const results = await searchService.search(
        'python',
        'user-1',
        'session-1',
        { limit: 5 }
      )

      // Assert
      expect(results).toEqual([])
      expect(mockMemoryRepo.query).toHaveBeenCalledTimes(1)
    })

    it('should return results sorted by hybrid score', async () => {
      // Arrange
      const now = Date.now()
      const mockResults: SearchResult[] = [
        createSearchResult({
          id: 'mem-1',
          text: '用户喜欢Python',
          score: 0.9,
          metadata: {
            user_id: 'user-1',
            session_id: 'session-1',
            platform: 'web',
            type: 'preference',
            importance: 0.8,
            timestamp: now - 1000 * 60 * 60 * 24 * 30, // 30 days ago
            keywords: ['python']
          }
        }),
        createSearchResult({
          id: 'mem-2',
          text: '用户今天学了TypeScript',
          score: 0.7,
          metadata: {
            user_id: 'user-1',
            session_id: 'session-1',
            platform: 'web',
            type: 'event',
            importance: 0.6,
            timestamp: now - 1000 * 60 * 60, // 1 hour ago
            keywords: ['typescript']
          }
        })
      ]
      ;(mockMemoryRepo.query as Mock).mockResolvedValue(mockResults)

      // Act
      const results = await searchService.search(
        'python',
        'user-1',
        'session-1',
        { limit: 5 }
      )

      // Assert
      expect(results.length).toBe(2)
      // Results should be sorted by hybrid score (descending)
      expect(results[0]!.score).toBeGreaterThanOrEqual(results[1]!.score)
    })

    it('should apply time decay weight correctly', async () => {
      // Arrange
      const now = Date.now()
      const mockResults: SearchResult[] = [
        createSearchResult({
          id: 'mem-old',
          text: '旧记忆',
          score: 0.9,
          metadata: {
            user_id: 'user-1',
            session_id: 'session-1',
            platform: 'web',
            type: 'preference',
            importance: 0.8,
            timestamp: now - 1000 * 60 * 60 * 24 * 60, // 60 days ago
            keywords: []
          }
        }),
        createSearchResult({
          id: 'mem-new',
          text: '新记忆',
          score: 0.7,
          metadata: {
            user_id: 'user-1',
            session_id: 'session-1',
            platform: 'web',
            type: 'event',
            importance: 0.6,
            timestamp: now, // now
            keywords: []
          }
        })
      ]
      ;(mockMemoryRepo.query as Mock).mockResolvedValue(mockResults)

      // Act
      const results = await searchService.search(
        '测试',
        'user-1',
        'session-1',
        { limit: 5 }
      )

      // Assert
      // New memory should have higher score due to time decay
      expect(results[0]!.id).toBe('mem-new')
    })

    it('should apply keyword match weight correctly', async () => {
      // Arrange
      const now = Date.now()
      const mockResults: SearchResult[] = [
        createSearchResult({
          id: 'mem-no-match',
          text: '用户喜欢Java',
          score: 0.9,
          metadata: {
            user_id: 'user-1',
            session_id: 'session-1',
            platform: 'web',
            type: 'preference',
            importance: 0.8,
            timestamp: now,
            keywords: []
          }
        }),
        createSearchResult({
          id: 'mem-match',
          text: '用户喜欢Python编程',
          score: 0.7,
          metadata: {
            user_id: 'user-1',
            session_id: 'session-1',
            platform: 'web',
            type: 'preference',
            importance: 0.6,
            timestamp: now,
            keywords: ['python']
          }
        })
      ]
      ;(mockMemoryRepo.query as Mock).mockResolvedValue(mockResults)

      // Act
      const results = await searchService.search(
        'python',
        'user-1',
        'session-1',
        { limit: 5 }
      )

      // Assert
      // Memory with keyword match should have boosted score
      expect(results[0]!.id).toBe('mem-match')
    })

    it('should use cache for repeated queries', async () => {
      // Arrange
      const mockResults = [createSearchResult()]
      ;(mockMemoryRepo.query as Mock).mockResolvedValue(mockResults)

      // Act
      await searchService.search('python', 'user-1', 'session-1', { limit: 5 })
      await searchService.search('python', 'user-1', 'session-1', { limit: 5 })

      // Assert
      // Query should only be called once due to caching
      expect(mockMemoryRepo.query).toHaveBeenCalledTimes(1)
    })

    it('should respect limit option', async () => {
      // Arrange
      const mockResults = Array.from({ length: 10 }, (_, i) =>
        createSearchResult({
          id: `mem-${i}`,
          score: 0.9 - i * 0.05
        })
      )
      ;(mockMemoryRepo.query as Mock).mockResolvedValue(mockResults)

      // Act
      const results = await searchService.search(
        'python',
        'user-1',
        'session-1',
        { limit: 3 }
      )

      // Assert
      expect(results.length).toBe(3)
    })

    it('should filter by session when includeOtherSessions is false', async () => {
      // Arrange
      ;(mockMemoryRepo.query as Mock).mockResolvedValue([])

      // Act
      await searchService.search('python', 'user-1', 'session-1', {
        limit: 5,
        includeOtherSessions: false
      })

      // Assert
      expect(mockMemoryRepo.query).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-1'
        })
      )
    })

    it('should not filter by session when includeOtherSessions is true', async () => {
      // Arrange
      ;(mockMemoryRepo.query as Mock).mockResolvedValue([])

      // Act
      await searchService.search('python', 'user-1', 'session-1', {
        limit: 5,
        includeOtherSessions: true
      })

      // Assert
      expect(mockMemoryRepo.query).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: undefined
        })
      )
    })

    it('should call embedding provider to get query vector', async () => {
      // Arrange
      ;(mockMemoryRepo.query as Mock).mockResolvedValue([])

      // Act
      await searchService.search('python', 'user-1', 'session-1', { limit: 5 })

      // Assert
      expect(mockEmbedding.embed).toHaveBeenCalledWith('python')
    })
  })

  describe('hybridScore()', () => {
    it('should calculate weighted hybrid score', async () => {
      // Arrange
      const now = Date.now()
      const mockResults: SearchResult[] = [
        createSearchResult({
          id: 'mem-1',
          text: '用户喜欢Python',
          score: 0.9,
          metadata: {
            user_id: 'user-1',
            session_id: 'session-1',
            platform: 'web',
            type: 'preference',
            importance: 0.8,
            timestamp: now, // fresh
            keywords: ['python']
          }
        })
      ]
      ;(mockMemoryRepo.query as Mock).mockResolvedValue(mockResults)

      // Act
      const results = await searchService.search(
        'python',
        'user-1',
        'session-1',
        { limit: 5 }
      )

      // Assert
      expect(results.length).toBe(1)
      // Score should be between 0 and 1
      expect(results[0]!.score).toBeGreaterThanOrEqual(0)
      expect(results[0]!.score).toBeLessThanOrEqual(1)
    })
  })
})
