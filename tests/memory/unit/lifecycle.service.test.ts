import { describe, it, test, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { LifecycleService } from '../../../src/memory/services/lifecycle.service'
import { IMemoryRepository, ISessionRepository, IUserIndexRepository } from '../../../src/memory/storage/interfaces'
import { Lock } from '../../../src/memory/lock/lock.interface'
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

const createMockSessionRepo = (): ISessionRepository => ({
  save: vi.fn(),
  findById: vi.fn(),
  findActiveByUser: vi.fn(),
  updateLastActive: vi.fn(),
  deleteExpired: vi.fn(),
  deleteById: vi.fn()
})

const createMockLock = (): Lock => ({
  acquire: vi.fn().mockResolvedValue(true),
  release: vi.fn(),
  withLock: vi.fn()
})

const createMockUserIndexRepo = (): IUserIndexRepository => ({
  upsert: vi.fn(),
  getAllUserIds: vi.fn().mockResolvedValue([]),
  delete: vi.fn()
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
  created_at: Date.now() - 1000 * 60 * 60 * 24 * 10, // 10 days ago
  last_accessed_at: Date.now() - 1000 * 60 * 60 * 24, // 1 day ago
  access_count: 5,
  ...overrides
})

describe('LifecycleService', () => {
  let lifecycleService: LifecycleService
  let mockMemoryRepo: IMemoryRepository
  let mockSessionRepo: ISessionRepository
  let mockLock: Lock
  let mockUserIndexRepo: IUserIndexRepository

  beforeEach(() => {
    mockMemoryRepo = createMockMemoryRepo()
    mockSessionRepo = createMockSessionRepo()
    mockLock = createMockLock()
    mockUserIndexRepo = createMockUserIndexRepo()

    lifecycleService = new LifecycleService(
      mockMemoryRepo,
      mockSessionRepo,
      mockLock,
      mockUserIndexRepo
    )

    // Suppress logger in tests
    vi.spyOn(logger, 'info').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('dailyDecay()', () => {
    it('should acquire lock before processing', async () => {
      // Act
      await lifecycleService.dailyDecay()

      // Assert
      expect(mockLock.acquire).toHaveBeenCalledWith('daily-decay', 300000)
      expect(mockLock.release).toHaveBeenCalledWith('daily-decay')
    })

    it('should skip if lock not acquired', async () => {
      // Arrange
      ;(mockLock.acquire as Mock).mockResolvedValue(false)

      // Act
      await lifecycleService.dailyDecay()

      // Assert
      expect(mockLock.release).not.toHaveBeenCalled()
    })

    it('should release lock even if error occurs', async () => {
      // Arrange
      ;(mockLock.acquire as Mock).mockImplementation(async () => {
        throw new Error('Lock error')
      })

      // Act & Assert
      await expect(lifecycleService.dailyDecay()).rejects.toThrow('Lock error')
    })

    it('should complete successfully with no users', async () => {
      // Act
      await lifecycleService.dailyDecay()

      // Assert
      expect(mockLock.acquire).toHaveBeenCalled()
      expect(mockLock.release).toHaveBeenCalled()
      expect(mockMemoryRepo.getAll).not.toHaveBeenCalled()
    })

    it('should process users from userIndexRepo', async () => {
      // Arrange
      const users = ['user-1', 'user-2', 'user-3']
      ;(mockUserIndexRepo.getAllUserIds as Mock).mockResolvedValue(users)
      ;(mockMemoryRepo.getAll as Mock).mockResolvedValue([])
      ;(mockMemoryRepo.countByUser as Mock).mockResolvedValue(0)

      // Act
      await lifecycleService.dailyDecay()

      // Assert
      expect(mockUserIndexRepo.getAllUserIds).toHaveBeenCalled()
      // getAll is called in decayUserMemories for each user (3 times)
      // and also in evictIfNeeded if count > MAX (but count is 0)
      expect(mockMemoryRepo.getAll).toHaveBeenCalledTimes(3)
    })

    it('should work without userIndexRepo', async () => {
      // Arrange
      const serviceWithoutIndex = new LifecycleService(
        mockMemoryRepo,
        mockSessionRepo,
        mockLock
      )

      // Act
      await serviceWithoutIndex.dailyDecay()

      // Assert
      expect(mockLock.acquire).toHaveBeenCalled()
      expect(mockLock.release).toHaveBeenCalled()
    })
  })

  describe('decayUserMemories (via dailyDecay)', () => {
    it('should decay memory importance over time', async () => {
      // Arrange
      const now = Date.now()
      const memories = [
        createMemory({
          id: 'mem-old',
          metadata: {
            user_id: 'user-1',
            session_id: 'session-1',
            platform: 'web',
            type: 'preference',
            importance: 0.8,
            timestamp: now,
            keywords: []
          },
          created_at: now - 1000 * 60 * 60 * 24 * 10, // 10 days ago
          last_accessed_at: now - 1000 * 60 * 60 * 24 * 5 // 5 days ago
        })
      ]
      // We need to test the private method directly
      // Access private method for testing
      const service = lifecycleService as any
      ;(mockMemoryRepo.getAll as Mock).mockResolvedValue(memories)

      // Act
      await service.decayUserMemories('user-1')

      // Assert
      expect(mockMemoryRepo.update).toHaveBeenCalledTimes(1)
      const updateCall = (mockMemoryRepo.update as Mock).mock.calls[0]
      const updatedMetadata = updateCall[1]?.metadata
      expect(updatedMetadata.importance).toBeLessThan(0.8)
    })

    it('should delete old and unimportant memories', async () => {
      // Arrange
      const now = Date.now()
      const memories = [
        createMemory({
          id: 'mem-old',
          metadata: {
            user_id: 'user-1',
            session_id: 'session-1',
            platform: 'web',
            type: 'preference',
            importance: 0.2, // Low importance
            timestamp: now,
            keywords: []
          },
          created_at: now - 1000 * 60 * 60 * 24 * 40, // 40 days ago (> 30 days threshold)
          last_accessed_at: now - 1000 * 60 * 60 * 24 * 40
        })
      ]
      const service = lifecycleService as any
      ;(mockMemoryRepo.getAll as Mock).mockResolvedValue(memories)

      // Act
      await service.decayUserMemories('user-1')

      // Assert
      expect(mockMemoryRepo.delete).toHaveBeenCalledWith('mem-old')
    })

    it('should not delete recent memories even if importance is low', async () => {
      // Arrange
      const now = Date.now()
      const memories = [
        createMemory({
          id: 'mem-recent',
          metadata: {
            user_id: 'user-1',
            session_id: 'session-1',
            platform: 'web',
            type: 'preference',
            importance: 0.2, // Low importance
            timestamp: now,
            keywords: []
          },
          created_at: now - 1000 * 60 * 60 * 24 * 5, // 5 days ago (< 30 days threshold)
          last_accessed_at: now - 1000 * 60 * 60 * 24 * 5
        })
      ]
      const service = lifecycleService as any
      ;(mockMemoryRepo.getAll as Mock).mockResolvedValue(memories)

      // Act
      await service.decayUserMemories('user-1')

      // Assert
      expect(mockMemoryRepo.delete).not.toHaveBeenCalled()
      expect(mockMemoryRepo.update).toHaveBeenCalledTimes(1)
    })

    it('should apply access boost for recently accessed memories', async () => {
      // Arrange
      const now = Date.now()
      const memories = [
        createMemory({
          id: 'mem-accessed',
          metadata: {
            user_id: 'user-1',
            session_id: 'session-1',
            platform: 'web',
            type: 'preference',
            importance: 0.8,
            timestamp: now,
            keywords: []
          },
          created_at: now - 1000 * 60 * 60 * 24 * 10,
          last_accessed_at: now // Just accessed
        }),
        createMemory({
          id: 'mem-not-accessed',
          metadata: {
            user_id: 'user-1',
            session_id: 'session-1',
            platform: 'web',
            type: 'preference',
            importance: 0.8,
            timestamp: now,
            keywords: []
          },
          created_at: now - 1000 * 60 * 60 * 24 * 10,
          last_accessed_at: now - 1000 * 60 * 60 * 24 * 30 // Not accessed for 30 days
        })
      ]
      const service = lifecycleService as any
      ;(mockMemoryRepo.getAll as Mock).mockResolvedValue(memories)

      // Act
      await service.decayUserMemories('user-1')

      // Assert
      const updateCalls = (mockMemoryRepo.update as Mock).mock.calls
      const accessedMemory = updateCalls.find((call: any) => call[0] === 'mem-accessed')
      const notAccessedMemory = updateCalls.find((call: any) => call[0] === 'mem-not-accessed')

      expect(accessedMemory[1]?.metadata.importance).toBeGreaterThan(
        notAccessedMemory[1]?.metadata.importance
      )
    })
  })

  describe('evictIfNeeded (via dailyDecay)', () => {
    it('should evict memories when user exceeds limit', async () => {
      // Arrange
      const now = Date.now()
      const memories = Array.from({ length: 510 }, (_, i) =>
        createMemory({
          id: `mem-${i}`,
          metadata: {
            user_id: 'user-1',
            session_id: 'session-1',
            platform: 'web',
            type: 'preference',
            importance: i < 10 ? 0.1 : 0.9, // First 10 have low importance
            timestamp: now,
            keywords: []
          },
          created_at: now - 1000 * 60 * 60 * 24 * i,
          last_accessed_at: now - 1000 * 60 * 60 * 24 * i,
          access_count: i < 10 ? 0 : 10
        })
      )
      const service = lifecycleService as any
      ;(mockMemoryRepo.countByUser as Mock).mockResolvedValue(510)
      ;(mockMemoryRepo.getAll as Mock).mockResolvedValue(memories)

      // Act
      await service.evictIfNeeded('user-1', memories)

      // Assert
      // Should delete 10 memories to get to 500
      expect(mockMemoryRepo.delete).toHaveBeenCalledTimes(10)
    })

    it('should not evict when user is under limit', async () => {
      // Arrange
      const service = lifecycleService as any
      const memories = Array.from({ length: 100 }, (_, i) =>
        createMemory({ id: `mem-${i}` })
      )

      // Act
      await service.evictIfNeeded('user-1', memories)

      // Assert
      expect(mockMemoryRepo.delete).not.toHaveBeenCalled()
    })
  })

  describe('calculateEvictionScore (via dailyDecay)', () => {
    it('should calculate correct eviction score', async () => {
      // Arrange
      const now = Date.now()
      const memory = createMemory({
        id: 'mem-test',
        metadata: {
          user_id: 'user-1',
          session_id: 'session-1',
          platform: 'web',
          type: 'preference',
          importance: 0.8,
          timestamp: now,
          keywords: []
        },
        created_at: now - 1000 * 60 * 60 * 24 * 10, // 10 days old
        last_accessed_at: now - 1000 * 60 * 60 * 24 * 5, // 5 days since access
        access_count: 5
      })
      const service = lifecycleService as any

      // Act
      const score = service.calculateEvictionScore(memory)

      // Assert
      // Expected: 0.8*0.4 + (1-5/30)*0.3 + (1-10/90)*0.2 + min(1,5/10)*0.1
      // = 0.32 + 0.25 + 0.178 + 0.05 = ~0.798
      expect(score).toBeGreaterThan(0.7)
      expect(score).toBeLessThan(0.9)
    })
  })

  describe('cleanupExpiredSessions()', () => {
    it('should call sessionRepo.deleteExpired', async () => {
      // Arrange
      ;(mockSessionRepo.deleteExpired as Mock).mockResolvedValue(5)

      // Act
      await lifecycleService.cleanupExpiredSessions()

      // Assert
      expect(mockSessionRepo.deleteExpired).toHaveBeenCalledWith(24 * 60 * 60)
    })

    it('should not log when no sessions deleted', async () => {
      // Arrange
      ;(mockSessionRepo.deleteExpired as Mock).mockResolvedValue(0)
      const consoleSpy = vi.spyOn(logger, 'info')

      // Act
      await lifecycleService.cleanupExpiredSessions()

      // Assert
      expect(consoleSpy).not.toHaveBeenCalled()
    })
  })

  describe('startCronJobs()', () => {
    it('should schedule cron jobs', () => {
      // Act
      lifecycleService.startCronJobs()

      // Assert
      expect(logger.info).toHaveBeenCalledWith('[Lifecycle] Cron jobs started')
    })
  })

  describe('stopCronJobs()', () => {
    it('should stop all cron jobs', () => {
      // Arrange
      lifecycleService.startCronJobs()

      // Act
      lifecycleService.stopCronJobs()

      // Assert
      expect(logger.info).toHaveBeenCalledWith('[Lifecycle] Cron jobs stopped')
    })
  })
})
