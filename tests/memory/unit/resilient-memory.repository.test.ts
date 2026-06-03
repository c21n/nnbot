import { describe, it, test, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { ResilientMemoryRepository } from '../../../src/memory/storage/resilient-memory.repository'
import { IMemoryRepository } from '../../../src/memory/storage/interfaces'
import { Memory } from '../../../src/memory/types'

// Mock logger
vi.mock('../../../src/memory/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

function createMockRepo(overrides: Partial<IMemoryRepository> = {}): IMemoryRepository {
  return {
    save: vi.fn().mockResolvedValue(undefined),
    findById: vi.fn().mockResolvedValue(null),
    query: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    deleteByUser: vi.fn().mockResolvedValue(0),
    countByUser: vi.fn().mockResolvedValue(0),
    getAll: vi.fn().mockResolvedValue([]),
    findByTimeRange: vi.fn().mockResolvedValue([]),
    findByType: vi.fn().mockResolvedValue([]),
    deleteByTimeRange: vi.fn().mockResolvedValue(0),
    deleteByType: vi.fn(),
    findByKey: vi.fn().mockResolvedValue(0),
    ...overrides
  }
}

function createMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: 'mem-1',
    text: 'Test memory',
    metadata: {
      user_id: 'user-1',
      session_id: 'session-1',
      platform: 'web',
      type: 'context',
      importance: 0.5,
      timestamp: Date.now(),
      keywords: []
    },
    created_at: Date.now(),
    last_accessed_at: Date.now(),
    access_count: 0,
    ...overrides
  }
}

describe('ResilientMemoryRepository', () => {
  let primary: IMemoryRepository
  let fallback: IMemoryRepository
  let repo: ResilientMemoryRepository

  beforeEach(() => {
    primary = createMockRepo()
    fallback = createMockRepo()
    repo = new ResilientMemoryRepository(primary, fallback)
    vi.clearAllMocks()
  })

  describe('save', () => {
    test('uses primary when it succeeds', async () => {
      const memory = createMemory()
      await repo.save(memory)
      expect(primary.save).toHaveBeenCalledWith(memory)
      expect(fallback.save).not.toHaveBeenCalled()
    })

    test('falls back to SQLite when primary fails', async () => {
      const memory = createMemory()
      ;(primary.save as Mock).mockRejectedValue(new Error('ChromaDB down'))

      await repo.save(memory)

      expect(primary.save).toHaveBeenCalled()
      expect(fallback.save).toHaveBeenCalledWith(memory)
    })
  })

  describe('findById', () => {
    test('uses primary when it succeeds', async () => {
      const memory = createMemory()
      ;(primary.findById as Mock).mockResolvedValue(memory)

      const result = await repo.findById('mem-1')

      expect(result).toBe(memory)
      expect(fallback.findById).not.toHaveBeenCalled()
    })

    test('falls back when primary fails', async () => {
      const memory = createMemory()
      ;(primary.findById as Mock).mockRejectedValue(new Error('timeout'))
      ;(fallback.findById as Mock).mockResolvedValue(memory)

      const result = await repo.findById('mem-1')

      expect(result).toBe(memory)
      expect(fallback.findById).toHaveBeenCalledWith('mem-1')
    })
  })

  describe('query', () => {
    test('uses primary when it succeeds', async () => {
      const results = [{ id: 'mem-1', text: 'test', score: 0.9, metadata: createMemory().metadata }]
      ;(primary.query as Mock).mockResolvedValue(results)

      const result = await repo.query({ embedding: [0.1], userId: 'user-1', limit: 5 })

      expect(result).toEqual(results)
      expect(fallback.query).not.toHaveBeenCalled()
    })

    test('falls back when primary fails', async () => {
      ;(primary.query as Mock).mockRejectedValue(new Error('ChromaDB error'))
      const fallbackResults = [{ id: 'mem-1', text: 'test', score: 0.5, metadata: createMemory().metadata }]
      ;(fallback.query as Mock).mockResolvedValue(fallbackResults)

      const result = await repo.query({ embedding: [0.1], userId: 'user-1', limit: 5 })

      expect(result).toEqual(fallbackResults)
    })
  })

  describe('deleteByTimeRange', () => {
    test('uses primary when it succeeds', async () => {
      ;(primary.deleteByTimeRange as Mock).mockResolvedValue(3)

      const result = await repo.deleteByTimeRange('user-1', 1000, 2000)

      expect(result).toBe(3)
      expect(fallback.deleteByTimeRange).not.toHaveBeenCalled()
    })

    test('falls back when primary fails', async () => {
      ;(primary.deleteByTimeRange as Mock).mockRejectedValue(new Error('down'))
      ;(fallback.deleteByTimeRange as Mock).mockResolvedValue(2)

      const result = await repo.deleteByTimeRange('user-1', 1000, 2000)

      expect(result).toBe(2)
    })
  })

  describe('deleteByType', () => {
    test('falls back when primary fails', async () => {
      ;(primary.deleteByType as Mock).mockRejectedValue(new Error('down'))
      ;(fallback.deleteByType as Mock).mockResolvedValue(1)

      const result = await repo.deleteByType('user-1', 'preference')

      expect(result).toBe(1)
    })
  })

  describe('both fail', () => {
    test('throws when both primary and fallback fail', async () => {
      ;(primary.save as Mock).mockRejectedValue(new Error('ChromaDB down'))
      ;(fallback.save as Mock).mockRejectedValue(new Error('SQLite down'))

      await expect(repo.save(createMemory())).rejects.toThrow('SQLite down')
    })
  })
})
