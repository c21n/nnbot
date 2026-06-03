import { describe, it, test, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { MemorySummaryService } from '../../../src/memory/services/memory-summary.service'
import { IProfileRepository, IMemoryRepository } from '../../../src/memory/storage/interfaces'
import { LLMProvider } from '../../../src/memory/providers/llm.provider'

function createMockProfileRepo(): IProfileRepository {
  return {
    save: vi.fn(),
    findById: vi.fn().mockResolvedValue({
      user_id: 'user-1',
      basic_info: { name: 'Test User' },
      preferences: { likes: ['reading'], dislikes: [] },
      habits: {},
      created_at: Date.now(),
      updated_at: Date.now()
    }),
    updateField: vi.fn(),
    delete: vi.fn()
  }
}

function createMockMemoryRepo(): IMemoryRepository {
  return {
    save: vi.fn(),
    findById: vi.fn(),
    query: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    deleteByUser: vi.fn(),
    countByUser: vi.fn(),
    getAll: vi.fn().mockResolvedValue([
      {
        id: 'mem-1',
        text: '喜欢阅读科幻小说',
        metadata: { user_id: 'user-1', session_id: '', platform: '', type: 'preference', importance: 0.8, timestamp: Date.now(), keywords: ['reading'] },
        created_at: Date.now(),
        last_accessed_at: Date.now(),
        access_count: 3
      }
    ]),
    findByTimeRange: vi.fn(),
    findByType: vi.fn(),
    deleteByTimeRange: vi.fn(),
    deleteByType: vi.fn(),
    findByKey: vi.fn()
  }
}

function createMockLLM(): LLMProvider {
  return {
    chat: vi.fn().mockResolvedValue('用户喜欢阅读科幻小说，性格开朗。'),
    summarize: vi.fn()
  }
}

describe('MemorySummaryService Integration', () => {
  let profileRepo: IProfileRepository
  let memoryRepo: IMemoryRepository
  let llm: LLMProvider
  let service: MemorySummaryService

  beforeEach(() => {
    profileRepo = createMockProfileRepo()
    memoryRepo = createMockMemoryRepo()
    llm = createMockLLM()
    service = new MemorySummaryService(profileRepo, memoryRepo, llm)
  })

  test('getMemorySummary returns natural language summary', async () => {
    // Act
    const result = await service.getMemorySummary('user-1')

    // Assert
    expect(result).toContain('阅读')
    expect(llm.chat).toHaveBeenCalledTimes(1)
  })

  test('getMemorySummary returns fallback on LLM failure', async () => {
    // Arrange
    ;(llm.chat as Mock).mockRejectedValue(new Error('LLM down'))

    // Act
    const result = await service.getMemorySummary('user-1')

    // Assert
    expect(result).toBeDefined()
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})
