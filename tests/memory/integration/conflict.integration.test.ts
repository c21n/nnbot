import { describe, it, test, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { MemoryConflictService } from '../../../src/memory/services/conflict.service'
import { IMemoryRepository } from '../../../src/memory/storage/interfaces'
import { Memory } from '../../../src/memory/types'

function createMockRepo(initialMemories: Memory[] = []): IMemoryRepository {
  const memories = [...initialMemories]
  return {
    save: vi.fn(async (m: Memory) => { memories.push(m) }),
    findById: vi.fn(async (id: string) => memories.find(m => m.id === id) || null),
    query: vi.fn(async () => []),
    update: vi.fn(async (id: string, data: Partial<Memory>) => {
      const idx = memories.findIndex(m => m.id === id)
      if (idx >= 0) memories[idx] = { ...memories[idx], ...data } as Memory
    }),
    delete: vi.fn(async (id: string) => {
      const idx = memories.findIndex(m => m.id === id)
      if (idx >= 0) memories.splice(idx, 1)
    }),
    deleteByUser: vi.fn(async () => 0),
    countByUser: vi.fn(async () => memories.length),
    getAll: vi.fn(async () => memories),
    findByTimeRange: vi.fn(async () => []),
    findByType: vi.fn(async () => []),
    deleteByTimeRange: vi.fn(async () => 0),
    deleteByType: vi.fn(async () => 0),
    findByKey: vi.fn(async (userId: string, key: string) =>
      memories.filter(m => m.metadata.user_id === userId && m.metadata.key === key)
    )
  }
}

describe('ConflictService Integration', () => {
  test('upsertPreference creates new preference memory with is_latest=true', async () => {
    // Arrange
    const repo = createMockRepo()
    const service = new MemoryConflictService(repo)

    // Act
    await service.upsertPreference('user-1', 'favorite_color', true)

    // Assert
    expect(repo.save).toHaveBeenCalledTimes(1)
    const saved = (repo.save as Mock).mock.calls[0][0] as Memory
    expect(saved.metadata.type).toBe('preference')
    expect(saved.metadata.is_latest).toBe(true)
    expect(saved.text).toContain('true')
  })

  test('upsertPreference marks old preference as is_latest=false', async () => {
    // Arrange
    const oldMemory: Memory = {
      id: 'old-1',
      text: '喜欢红色',
      metadata: { user_id: 'user-1', session_id: '', platform: '', type: 'preference', importance: 0.8, timestamp: Date.now(), keywords: [], is_latest: true, key: 'favorite_color' },
      created_at: Date.now(),
      last_accessed_at: Date.now(),
      access_count: 1
    }
    const repo = createMockRepo([oldMemory])
    const service = new MemoryConflictService(repo)

    // Act
    await service.upsertPreference('user-1', 'favorite_color', true)

    // Assert - old memory updated to is_latest=false
    expect(repo.update).toHaveBeenCalledWith('old-1', expect.objectContaining({
      metadata: expect.objectContaining({ is_latest: false })
    }))
    // New memory saved with is_latest=true
    expect(repo.save).toHaveBeenCalledTimes(1)
  })

  test('getLatestMemory returns the latest preference', async () => {
    // Arrange
    const memory: Memory = {
      id: 'mem-1',
      text: '喜欢蓝色',
      metadata: { user_id: 'user-1', session_id: '', platform: '', type: 'preference', importance: 0.8, timestamp: Date.now(), keywords: [], is_latest: true, key: 'favorite_color' },
      created_at: Date.now(),
      last_accessed_at: Date.now(),
      access_count: 1
    }
    const repo = createMockRepo([memory])
    const service = new MemoryConflictService(repo)

    // Act
    const result = await service.getLatestMemory('user-1', 'favorite_color')

    // Assert
    expect(result).toBeDefined()
    expect(result?.id).toBe('mem-1')
  })
})
