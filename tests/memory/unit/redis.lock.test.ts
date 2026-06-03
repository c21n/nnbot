import { describe, it, test, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { RedisLock } from '../../../src/memory/lock/redis.lock'

// Mock ioredis
vi.mock('ioredis', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      set: vi.fn(),
      del: vi.fn(),
      eval: vi.fn(),
      quit: vi.fn(),
      on: vi.fn()
    }))
  }
})

describe('RedisLock', () => {
  let redisLock: RedisLock
  let mockRedis: any

  beforeEach(() => {
    vi.clearAllMocks()
    redisLock = new RedisLock('redis://localhost:6379')
    // Access the internal redis instance
    mockRedis = (redisLock as any).redis
    // Simulate connected state for testing
    ;(redisLock as any).connected = true
  })

  describe('acquire()', () => {
    it('should acquire lock successfully', async () => {
      // Arrange
      mockRedis.set.mockResolvedValue('OK')

      // Act
      const result = await redisLock.acquire('task-1', 60000)

      // Assert
      expect(result).toBe(true)
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('lock:task-1'),
        expect.any(String),
        'PX',
        60000,
        'NX'
      )
    })

    it('should fail to acquire lock when already held', async () => {
      // Arrange
      mockRedis.set.mockResolvedValue(null)

      // Act
      const result = await redisLock.acquire('task-1', 60000)

      // Assert
      expect(result).toBe(false)
    })

    it('should return false when not connected', async () => {
      // Arrange
      ;(redisLock as any).connected = false

      // Act
      const result = await redisLock.acquire('task-1', 60000)

      // Assert
      expect(result).toBe(false)
    })

    it('should handle Redis errors gracefully', async () => {
      // Arrange
      mockRedis.set.mockRejectedValue(new Error('Connection lost'))

      // Act
      const result = await redisLock.acquire('task-1', 60000)

      // Assert
      expect(result).toBe(false)
    })
  })

  describe('release()', () => {
    it('should release lock successfully', async () => {
      // Arrange
      mockRedis.set.mockResolvedValue('OK')
      mockRedis.eval.mockResolvedValue(1)
      await redisLock.acquire('task-1', 60000)

      // Act
      await redisLock.release('task-1')

      // Assert
      expect(mockRedis.eval).toHaveBeenCalled()
    })

    it('should not release lock when not connected', async () => {
      // Arrange
      ;(redisLock as any).connected = false

      // Act
      await redisLock.release('task-1')

      // Assert
      expect(mockRedis.eval).not.toHaveBeenCalled()
    })

    it('should not release lock if token does not match', async () => {
      // Arrange
      mockRedis.set.mockResolvedValue('OK')
      mockRedis.eval.mockResolvedValue(0)
      await redisLock.acquire('task-1', 60000)

      // Act
      await redisLock.release('task-1')

      // Assert
      expect(mockRedis.eval).toHaveBeenCalled()
    })
  })

  describe('withLock()', () => {
    it('should execute function when lock is acquired', async () => {
      // Arrange
      mockRedis.set.mockResolvedValue('OK')
      mockRedis.eval.mockResolvedValue(1)
      const fn = vi.fn().mockResolvedValue('result')

      // Act
      const result = await redisLock.withLock('task-1', fn, 60000)

      // Assert
      expect(result).toBe('result')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should throw error when lock cannot be acquired', async () => {
      // Arrange
      mockRedis.set.mockResolvedValue(null)
      const fn = vi.fn()

      // Act & Assert
      await expect(redisLock.withLock('task-1', fn, 60000)).rejects.toThrow(
        'Failed to acquire lock: task-1'
      )
      expect(fn).not.toHaveBeenCalled()
    })

    it('should release lock after function completes', async () => {
      // Arrange
      mockRedis.set.mockResolvedValue('OK')
      mockRedis.eval.mockResolvedValue(1)
      const fn = vi.fn().mockResolvedValue('result')

      // Act
      await redisLock.withLock('task-1', fn, 60000)

      // Assert
      expect(mockRedis.eval).toHaveBeenCalled()
    })

    it('should release lock even if function throws', async () => {
      // Arrange
      mockRedis.set.mockResolvedValue('OK')
      mockRedis.eval.mockResolvedValue(1)
      const fn = vi.fn().mockRejectedValue(new Error('Function error'))

      // Act & Assert
      await expect(redisLock.withLock('task-1', fn, 60000)).rejects.toThrow(
        'Function error'
      )
      expect(mockRedis.eval).toHaveBeenCalled()
    })
  })

  describe('disconnect()', () => {
    it('should quit Redis connection', async () => {
      // Arrange
      mockRedis.quit.mockResolvedValue('OK')

      // Act
      await redisLock.disconnect()

      // Assert
      expect(mockRedis.quit).toHaveBeenCalled()
    })

    it('should set connected to false after disconnect', async () => {
      // Arrange
      mockRedis.quit.mockResolvedValue('OK')

      // Act
      await redisLock.disconnect()

      // Assert
      expect((redisLock as any).connected).toBe(false)
    })
  })

  describe('connection state handling', () => {
    it('should return false for release when not connected', async () => {
      // Arrange
      ;(redisLock as any).connected = false

      // Act
      await redisLock.release('task-1')

      // Assert - should not throw, just return
      expect(mockRedis.eval).not.toHaveBeenCalled()
    })

    it('should handle token not found during release', async () => {
      // Arrange
      mockRedis.set.mockResolvedValue('OK')
      mockRedis.eval.mockResolvedValue(0)
      // Acquire but don't store token properly
      ;(redisLock as any).tokens = new Map()

      // Act
      await redisLock.release('task-1')

      // Assert - should return early without calling eval
      expect(mockRedis.eval).not.toHaveBeenCalled()
    })
  })
})
