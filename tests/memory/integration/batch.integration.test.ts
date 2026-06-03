import { describe, it, test, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { BatchOperationService } from '../../../src/memory/services/batch.service'
import { IMemoryRepository } from '../../../src/memory/storage/interfaces'

function createMockRepo(): IMemoryRepository {
  return {
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
  }
}

describe('BatchOperationService Integration', () => {
  let repo: IMemoryRepository
  let service: BatchOperationService

  beforeEach(() => {
    repo = createMockRepo()
    service = new BatchOperationService(repo)
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('deleteByTimeRange delegates to repo.deleteByTimeRange', async () => {
    // Arrange
    const now = Date.now()
    ;(repo.deleteByTimeRange as Mock).mockResolvedValue(3)

    // Act
    const count = await service.deleteByTimeRange('user-1', now - 86400000, now)

    // Assert
    expect(count).toBe(3)
    expect(repo.deleteByTimeRange).toHaveBeenCalledWith('user-1', now - 86400000, now)
  })

  test('deleteByType delegates to repo.deleteByType', async () => {
    // Arrange
    ;(repo.deleteByType as Mock).mockResolvedValue(5)

    // Act
    const count = await service.deleteByType('user-1', 'event')

    // Assert
    expect(count).toBe(5)
    expect(repo.deleteByType).toHaveBeenCalledWith('user-1', 'event')
  })

  test('batchUpdateImportance updates each memory with ownership check', async () => {
    // Arrange
    const memory = {
      id: 'mem-1',
      text: 'test',
      metadata: { user_id: 'user-1', session_id: 's', platform: 'web', type: 'context', importance: 0.3, timestamp: Date.now(), keywords: [] },
      created_at: Date.now(),
      last_accessed_at: Date.now(),
      access_count: 0
    }
    ;(repo.findById as Mock).mockResolvedValue(memory)

    // Act
    await service.batchUpdateImportance('user-1', ['mem-1'], 0.9)

    // Assert
    expect(repo.update).toHaveBeenCalledWith('mem-1', {
      metadata: { ...memory.metadata, importance: 0.9 }
    })
  })
})
