import { describe, it, test, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { MemoryConflictService } from '../../../src/memory/services/conflict.service'
import { IMemoryRepository } from '../../../src/memory/storage/interfaces'
import { Memory } from '../../../src/memory/types'
import { logger } from '../../../src/memory/utils/logger'

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

const createMemory = (overrides: Partial<Memory> = {}): Memory => ({
  id: 'mem-1',
  text: 'dark_mode: true',
  metadata: {
    user_id: 'user-1',
    session_id: '',
    platform: 'system',
    type: 'preference',
    importance: 0.8,
    timestamp: Date.now(),
    is_latest: true,
    key: 'dark_mode'
  },
  created_at: Date.now(),
  last_accessed_at: Date.now(),
  access_count: 0,
  ...overrides
})

describe('MemoryConflictService', () => {
  let conflictService: MemoryConflictService
  let mockMemoryRepo: IMemoryRepository

  beforeEach(() => {
    mockMemoryRepo = createMockMemoryRepo()
    conflictService = new MemoryConflictService(mockMemoryRepo)

    // Suppress logger in tests
    vi.spyOn(logger, 'info').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('upsertPreference()', () => {
    it('should create new memory with is_latest=true when no existing memory', async () => {
      // Arrange
      ;(mockMemoryRepo.findByKey as Mock).mockResolvedValue([])

      // Act
      await conflictService.upsertPreference('user-1', 'dark_mode', true)

      // Assert
      expect(mockMemoryRepo.update).not.toHaveBeenCalled()
      expect(mockMemoryRepo.save).toHaveBeenCalledTimes(1)

      const savedMemory = (mockMemoryRepo.save as Mock).mock.calls[0][0] as Memory
      expect(savedMemory.text).toBe('dark_mode: true')
      expect(savedMemory.metadata.is_latest).toBe(true)
      expect(savedMemory.metadata.key).toBe('dark_mode')
      expect(savedMemory.metadata.type).toBe('preference')
      expect(savedMemory.metadata.user_id).toBe('user-1')
    })

    it('should mark old memories as is_latest=false and create new one with is_latest=true', async () => {
      // Arrange
      const existingMemories = [
        createMemory({ id: 'old-1', metadata: { user_id: 'user-1', session_id: '', platform: 'system', type: 'preference', importance: 0.8, timestamp: Date.now(), is_latest: true, key: 'dark_mode' } }),
        createMemory({ id: 'old-2', metadata: { user_id: 'user-1', session_id: '', platform: 'system', type: 'preference', importance: 0.8, timestamp: Date.now() - 1000, is_latest: false, key: 'dark_mode' } })
      ]
      ;(mockMemoryRepo.findByKey as Mock).mockResolvedValue(existingMemories)

      // Act
      await conflictService.upsertPreference('user-1', 'dark_mode', false)

      // Assert
      // Should update both existing memories
      expect(mockMemoryRepo.update).toHaveBeenCalledTimes(2)
      expect(mockMemoryRepo.update).toHaveBeenCalledWith('old-1', expect.objectContaining({
        metadata: expect.objectContaining({ is_latest: false })
      }))
      expect(mockMemoryRepo.update).toHaveBeenCalledWith('old-2', expect.objectContaining({
        metadata: expect.objectContaining({ is_latest: false })
      }))

      // Should create new memory
      expect(mockMemoryRepo.save).toHaveBeenCalledTimes(1)
      const savedMemory = (mockMemoryRepo.save as Mock).mock.calls[0][0] as Memory
      expect(savedMemory.text).toBe('dark_mode: false')
      expect(savedMemory.metadata.is_latest).toBe(true)
    })

    it('should only filter memories with matching key', async () => {
      // Arrange
      const matchingMemories = [
        createMemory({ id: 'matching', metadata: { user_id: 'user-1', session_id: '', platform: 'system', type: 'preference', importance: 0.8, timestamp: Date.now(), is_latest: true, key: 'dark_mode' } })
      ]
      ;(mockMemoryRepo.findByKey as Mock).mockResolvedValue(matchingMemories)

      // Act
      await conflictService.upsertPreference('user-1', 'dark_mode', true)

      // Assert
      // Should only update the matching memory
      expect(mockMemoryRepo.update).toHaveBeenCalledTimes(1)
      expect(mockMemoryRepo.update).toHaveBeenCalledWith('matching', expect.objectContaining({
        metadata: expect.objectContaining({ is_latest: false })
      }))
    })

    it('should generate unique id for new memory', async () => {
      // Arrange
      ;(mockMemoryRepo.findByKey as Mock).mockResolvedValue([])

      // Act
      await conflictService.upsertPreference('user-1', 'dark_mode', true)
      await conflictService.upsertPreference('user-1', 'notifications', false)

      // Assert
      const saveCalls = (mockMemoryRepo.save as Mock).mock.calls
      expect(saveCalls.length).toBe(2)
      const first = saveCalls[0]![0] as Memory
      const second = saveCalls[1]![0] as Memory
      expect(first.id).not.toBe(second.id)
    })
  })

  describe('getLatestMemory()', () => {
    it('should return memory with is_latest=true and matching key', async () => {
      // Arrange
      const latestMemory = createMemory({
        id: 'latest',
        metadata: { user_id: 'user-1', session_id: '', platform: 'system', type: 'preference', importance: 0.8, timestamp: Date.now(), is_latest: true, key: 'dark_mode' }
      })
      const allMemories = [
        createMemory({ id: 'old', metadata: { user_id: 'user-1', session_id: '', platform: 'system', type: 'preference', importance: 0.8, timestamp: Date.now() - 1000, is_latest: false, key: 'dark_mode' } }),
        latestMemory
      ]
      ;(mockMemoryRepo.findByKey as Mock).mockResolvedValue(allMemories)

      // Act
      const result = await conflictService.getLatestMemory('user-1', 'dark_mode')

      // Assert
      expect(result).toEqual(latestMemory)
    })

    it('should return null when no matching memory exists', async () => {
      // Arrange
      ;(mockMemoryRepo.findByKey as Mock).mockResolvedValue([])

      // Act
      const result = await conflictService.getLatestMemory('user-1', 'dark_mode')

      // Assert
      expect(result).toBeNull()
    })

    it('should return null when matching key exists but is_latest is false', async () => {
      // Arrange
      const allMemories = [
        createMemory({ id: 'old', metadata: { user_id: 'user-1', session_id: '', platform: 'system', type: 'preference', importance: 0.8, timestamp: Date.now(), is_latest: false, key: 'dark_mode' } })
      ]
      ;(mockMemoryRepo.findByKey as Mock).mockResolvedValue(allMemories)

      // Act
      const result = await conflictService.getLatestMemory('user-1', 'dark_mode')

      // Assert
      expect(result).toBeNull()
    })

    it('should return null when key does not match', async () => {
      // Arrange
      ;(mockMemoryRepo.findByKey as Mock).mockResolvedValue([])

      // Act
      const result = await conflictService.getLatestMemory('user-1', 'dark_mode')

      // Assert
      expect(result).toBeNull()
    })

    it('should call findByKey with correct parameters', async () => {
      // Arrange
      ;(mockMemoryRepo.findByKey as Mock).mockResolvedValue([])

      // Act
      await conflictService.getLatestMemory('user-1', 'dark_mode')

      // Assert
      expect(mockMemoryRepo.findByKey).toHaveBeenCalledWith('user-1', 'dark_mode')
    })
  })
})
