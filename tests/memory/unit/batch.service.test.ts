import { describe, it, test, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { BatchOperationService } from '../../../src/memory/services/batch.service'
import { IMemoryRepository } from '../../../src/memory/storage/interfaces'
import { Memory } from '../../../src/memory/types'

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
  text: 'Test memory',
  metadata: {
    user_id: 'user-1',
    session_id: 'session-1',
    platform: 'web',
    type: 'preference',
    importance: 0.8,
    timestamp: Date.now(),
    keywords: []
  },
  created_at: Date.now(),
  last_accessed_at: Date.now(),
  access_count: 1,
  ...overrides
})

describe('BatchOperationService', () => {
  let service: BatchOperationService
  let mockRepo: IMemoryRepository

  beforeEach(() => {
    mockRepo = createMockMemoryRepo()
    service = new BatchOperationService(mockRepo)
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('deleteByTimeRange()', () => {
    it('should delete memories within time range and return count', async () => {
      // Arrange
      const now = Date.now()
      ;(mockRepo.deleteByTimeRange as Mock).mockResolvedValue(2)

      // Act
      const count = await service.deleteByTimeRange(
        'user-1',
        now - 3000,
        now
      )

      // Assert
      expect(count).toBe(2)
      expect(mockRepo.deleteByTimeRange).toHaveBeenCalledWith('user-1', now - 3000, now)
    })

    it('should return 0 when no memories match time range', async () => {
      // Arrange
      const now = Date.now()
      ;(mockRepo.deleteByTimeRange as Mock).mockResolvedValue(0)

      // Act
      const count = await service.deleteByTimeRange(
        'user-1',
        now - 2000,
        now
      )

      // Assert
      expect(count).toBe(0)
    })

    it('should throw when userId is empty', async () => {
      await expect(
        service.deleteByTimeRange('', Date.now() - 1000, Date.now())
      ).rejects.toThrow('userId is required')
    })

    it('should throw when startTime is greater than endTime', async () => {
      await expect(
        service.deleteByTimeRange('user-1', Date.now(), Date.now() - 1000)
      ).rejects.toThrow('startTime must be less than or equal to endTime')
    })
  })

  describe('deleteByType()', () => {
    it('should delete memories matching type and return count', async () => {
      // Arrange
      ;(mockRepo.deleteByType as Mock).mockResolvedValue(2)

      // Act
      const count = await service.deleteByType('user-1', 'event')

      // Assert
      expect(count).toBe(2)
      expect(mockRepo.deleteByType).toHaveBeenCalledWith('user-1', 'event')
    })

    it('should throw when userId is empty', async () => {
      await expect(
        service.deleteByType('', 'event')
      ).rejects.toThrow('userId is required')
    })

    it('should throw when type is empty', async () => {
      await expect(
        service.deleteByType('user-1', '')
      ).rejects.toThrow('type is required')
    })

    it('should return 0 when no memories match type', async () => {
      // Arrange
      ;(mockRepo.deleteByType as Mock).mockResolvedValue(0)

      // Act
      const count = await service.deleteByType('user-1', 'event')

      // Assert
      expect(count).toBe(0)
    })
  })

  describe('batchUpdateImportance()', () => {
    it('should update importance for specified memories', async () => {
      // Arrange
      const memory1 = createMemory({
        id: 'mem-1',
        metadata: { user_id: 'user-1', session_id: 's-1', platform: 'web', type: 'preference', importance: 0.3, timestamp: Date.now() }
      })
      const memory2 = createMemory({
        id: 'mem-2',
        metadata: { user_id: 'user-1', session_id: 's-1', platform: 'web', type: 'event', importance: 0.5, timestamp: Date.now() }
      })
      ;(mockRepo.findById as Mock)
        .mockResolvedValueOnce(memory1)
        .mockResolvedValueOnce(memory2)

      // Act
      await service.batchUpdateImportance('user-1', ['mem-1', 'mem-2'], 0.9)

      // Assert
      expect(mockRepo.update).toHaveBeenCalledWith('mem-1', {
        metadata: { ...memory1.metadata, importance: 0.9 }
      })
      expect(mockRepo.update).toHaveBeenCalledWith('mem-2', {
        metadata: { ...memory2.metadata, importance: 0.9 }
      })
    })

    it('should throw when userId is empty', async () => {
      await expect(
        service.batchUpdateImportance('', ['mem-1'], 0.5)
      ).rejects.toThrow('userId is required')
    })

    it('should throw when importance is less than 0', async () => {
      await expect(
        service.batchUpdateImportance('user-1', ['mem-1'], -0.1)
      ).rejects.toThrow('newImportance must be between 0 and 1')
    })

    it('should throw when importance is greater than 1', async () => {
      await expect(
        service.batchUpdateImportance('user-1', ['mem-1'], 1.5)
      ).rejects.toThrow('newImportance must be between 0 and 1')
    })

    it('should skip when memoryIds is empty', async () => {
      // Act
      await service.batchUpdateImportance('user-1', [], 0.9)

      // Assert
      expect(mockRepo.findById).not.toHaveBeenCalled()
      expect(mockRepo.update).not.toHaveBeenCalled()
    })

    it('should skip when memory not found', async () => {
      // Arrange
      ;(mockRepo.findById as Mock).mockResolvedValue(null)

      // Act
      await service.batchUpdateImportance('user-1', ['mem-missing'], 0.9)

      // Assert
      expect(mockRepo.update).not.toHaveBeenCalled()
    })

    it('should skip when memory belongs to different user', async () => {
      // Arrange
      const otherUserMemory = createMemory({
        id: 'mem-1',
        metadata: { user_id: 'other-user', session_id: 's-1', platform: 'web', type: 'preference', importance: 0.5, timestamp: Date.now() }
      })
      ;(mockRepo.findById as Mock).mockResolvedValue(otherUserMemory)

      // Act
      await service.batchUpdateImportance('user-1', ['mem-1'], 0.9)

      // Assert
      expect(mockRepo.update).not.toHaveBeenCalled()
    })

    it('should continue updating when one update fails', async () => {
      // Arrange
      const memory1 = createMemory({ id: 'mem-1', metadata: { user_id: 'user-1', session_id: 's-1', platform: 'web', type: 'preference', importance: 0.3, timestamp: Date.now() } })
      const memory2 = createMemory({ id: 'mem-2', metadata: { user_id: 'user-1', session_id: 's-1', platform: 'web', type: 'event', importance: 0.5, timestamp: Date.now() } })
      ;(mockRepo.findById as Mock)
        .mockResolvedValueOnce(memory1)
        .mockResolvedValueOnce(memory2)
      ;(mockRepo.update as Mock)
        .mockRejectedValueOnce(new Error('update failed'))
        .mockResolvedValueOnce(undefined)

      // Act
      await service.batchUpdateImportance('user-1', ['mem-1', 'mem-2'], 0.9)

      // Assert
      expect(mockRepo.update).toHaveBeenCalledTimes(2)
    })
  })
})
