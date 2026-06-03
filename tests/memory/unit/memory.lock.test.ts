import { describe, it, test, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { MemoryLock } from '../../../src/memory/lock/memory.lock'

describe('MemoryLock', () => {
  let memoryLock: MemoryLock

  beforeEach(() => {
    memoryLock = new MemoryLock()
  })

  describe('acquire()', () => {
    it('should acquire lock successfully', async () => {
      // Act
      const result = await memoryLock.acquire('task-1', 60000)

      // Assert
      expect(result).toBe(true)
    })

    it('should fail to acquire lock when already held', async () => {
      // Arrange
      await memoryLock.acquire('task-1', 60000)

      // Act
      const result = await memoryLock.acquire('task-1', 60000)

      // Assert
      expect(result).toBe(false)
    })

    it('should acquire lock after TTL expires', async () => {
      // Arrange
      await memoryLock.acquire('task-1', 50) // 50ms TTL

      // Act - wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 100))
      const result = await memoryLock.acquire('task-1', 60000)

      // Assert
      expect(result).toBe(true)
    })

    it('should handle different task names', async () => {
      // Act
      const result1 = await memoryLock.acquire('task-1', 60000)
      const result2 = await memoryLock.acquire('task-2', 60000)

      // Assert
      expect(result1).toBe(true)
      expect(result2).toBe(true)
    })
  })

  describe('release()', () => {
    it('should release lock successfully', async () => {
      // Arrange
      await memoryLock.acquire('task-1', 60000)

      // Act
      await memoryLock.release('task-1')

      // Assert - should be able to acquire again
      const result = await memoryLock.acquire('task-1', 60000)
      expect(result).toBe(true)
    })

    it('should handle releasing non-existent lock', async () => {
      // Act & Assert - should not throw
      await expect(memoryLock.release('nonexistent')).resolves.toBeUndefined()
    })
  })

  describe('withLock()', () => {
    it('should execute function when lock is acquired', async () => {
      // Arrange
      const fn = vi.fn().mockResolvedValue('result')

      // Act
      const result = await memoryLock.withLock('task-1', fn, 60000)

      // Assert
      expect(result).toBe('result')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should wait for lock when already held', async () => {
      // Arrange
      await memoryLock.acquire('task-1', 100) // Short TTL
      const fn = vi.fn().mockResolvedValue('result')

      // Act - should wait and then execute
      const result = await memoryLock.withLock('task-1', fn, 60000)

      // Assert
      expect(result).toBe('result')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should release lock after function completes', async () => {
      // Arrange
      const fn = vi.fn().mockResolvedValue('result')

      // Act
      await memoryLock.withLock('task-1', fn, 60000)

      // Assert - should be able to acquire again
      const result = await memoryLock.acquire('task-1', 60000)
      expect(result).toBe(true)
    })

    it('should release lock even if function throws', async () => {
      // Arrange
      const fn = vi.fn().mockRejectedValue(new Error('Function error'))

      // Act & Assert
      await expect(memoryLock.withLock('task-1', fn, 60000)).rejects.toThrow(
        'Function error'
      )

      // Assert - should be able to acquire again
      const result = await memoryLock.acquire('task-1', 60000)
      expect(result).toBe(true)
    })
  })
})
