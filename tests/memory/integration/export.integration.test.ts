import { describe, it, test, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { ExportService } from '../../../src/memory/services/export.service'
import { IProfileRepository, IMemoryRepository, IMessageRepository } from '../../../src/memory/storage/interfaces'
import { EmbeddingProvider } from '../../../src/memory/providers/embedding.provider'

function createMockProfileRepo(): IProfileRepository {
  return {
    save: vi.fn(),
    findById: vi.fn().mockResolvedValue(null),
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
    getAll: vi.fn().mockResolvedValue([]),
    findByTimeRange: vi.fn(),
    findByType: vi.fn(),
    deleteByTimeRange: vi.fn(),
    deleteByType: vi.fn(),
    findByKey: vi.fn()
  }
}

function createMockMessageRepo(): IMessageRepository {
  return {
    save: vi.fn(),
    findById: vi.fn(),
    findBySession: vi.fn().mockResolvedValue([]),
    findByUser: vi.fn().mockResolvedValue([]),
    countBySession: vi.fn(),
    updateSummarized: vi.fn(),
    deleteOldestSummarized: vi.fn(),
    deleteBySession: vi.fn()
  }
}

function createMockEmbedding(): EmbeddingProvider {
  return {
    embed: vi.fn().mockResolvedValue(new Array(1024).fill(0.1)),
    getDimension: () => 1024
  }
}

describe('ExportService Integration', () => {
  let profileRepo: IProfileRepository
  let memoryRepo: IMemoryRepository
  let messageRepo: IMessageRepository
  let embedding: EmbeddingProvider
  let service: ExportService

  beforeEach(() => {
    profileRepo = createMockProfileRepo()
    memoryRepo = createMockMemoryRepo()
    messageRepo = createMockMessageRepo()
    embedding = createMockEmbedding()
    service = new ExportService(profileRepo, memoryRepo, messageRepo, embedding)
  })

  test('exportUserData returns profile, memories, and messages', async () => {
    // Arrange
    const profile = {
      user_id: 'user-1',
      basic_info: { name: 'Test' },
      preferences: { likes: ['music'], dislikes: [] },
      habits: {},
      created_at: Date.now(),
      updated_at: Date.now()
    }
    ;(profileRepo.findById as Mock).mockResolvedValue(profile)
    ;(memoryRepo.getAll as Mock).mockResolvedValue([
      { id: 'mem-1', text: 'test memory', metadata: { user_id: 'user-1' } }
    ])
    ;(messageRepo.findByUser as Mock).mockResolvedValue([
      { id: 'msg-1', content: 'hello', role: 'user' }
    ])

    // Act
    const result = await service.exportUserData('user-1')

    // Assert
    expect(result.version).toBe('1.0.0')
    expect(result.profile).toEqual(profile)
    expect(result.memories).toHaveLength(1)
    expect(result.messages).toHaveLength(1)
  })

  test('exportUserData handles empty data gracefully', async () => {
    // Act
    const result = await service.exportUserData('user-1')

    // Assert
    expect(result.version).toBe('1.0.0')
    expect(result.profile).toBeNull()
    expect(result.memories).toEqual([])
    expect(result.messages).toEqual([])
  })

  test('importUserData validates version', async () => {
    // Arrange
    const invalidData = {
      version: '2.0.0',
      exportedAt: Date.now(),
      profile: null,
      memories: [],
      messages: []
    }

    // Act & Assert
    await expect(service.importUserData('user-1', invalidData as never)).rejects.toThrow('Version mismatch')
  })
})
