import { describe, it, test, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { LRUCache } from '../../../src/memory/cache/lru.cache'

describe('LRUCache', () => {
  describe('basic operations', () => {
    it('should store and retrieve values', () => {
      // Arrange
      const cache = new LRUCache<string, number>(10, 60000)

      // Act
      cache.set('key1', 100)
      cache.set('key2', 200)

      // Assert
      expect(cache.get('key1')).toBe(100)
      expect(cache.get('key2')).toBe(200)
    })

    it('should return null for non-existent keys', () => {
      // Arrange
      const cache = new LRUCache<string, number>(10, 60000)

      // Act & Assert
      expect(cache.get('nonexistent')).toBeNull()
    })

    it('should delete values', () => {
      // Arrange
      const cache = new LRUCache<string, number>(10, 60000)
      cache.set('key1', 100)

      // Act
      cache.delete('key1')

      // Assert
      expect(cache.get('key1')).toBeNull()
    })

    it('should clear all values', () => {
      // Arrange
      const cache = new LRUCache<string, number>(10, 60000)
      cache.set('key1', 100)
      cache.set('key2', 200)

      // Act
      cache.clear()

      // Assert
      expect(cache.size).toBe(0)
    })

    it('should report correct size', () => {
      // Arrange
      const cache = new LRUCache<string, number>(10, 60000)

      // Act & Assert
      expect(cache.size).toBe(0)
      cache.set('key1', 100)
      expect(cache.size).toBe(1)
      cache.set('key2', 200)
      expect(cache.size).toBe(2)
    })

    it('should check if key exists', () => {
      // Arrange
      const cache = new LRUCache<string, number>(10, 60000)
      cache.set('key1', 100)

      // Act & Assert
      expect(cache.has('key1')).toBe(true)
      expect(cache.has('key2')).toBe(false)
    })
  })

  describe('LRU eviction', () => {
    it('should evict oldest entry when cache is full', () => {
      // Arrange
      const cache = new LRUCache<string, number>(3, 60000)

      // Act
      cache.set('key1', 1)
      cache.set('key2', 2)
      cache.set('key3', 3)
      cache.set('key4', 4) // Should evict key1

      // Assert
      expect(cache.get('key1')).toBeNull()
      expect(cache.get('key2')).toBe(2)
      expect(cache.get('key3')).toBe(3)
      expect(cache.get('key4')).toBe(4)
    })

    it('should update access order on get', () => {
      // Arrange
      const cache = new LRUCache<string, number>(3, 60000)
      cache.set('key1', 1)
      cache.set('key2', 2)
      cache.set('key3', 3)

      // Act - access key1 to make it recent
      cache.get('key1')
      cache.set('key4', 4) // Should evict key2 (oldest)

      // Assert
      expect(cache.get('key1')).toBe(1)
      expect(cache.get('key2')).toBeNull()
      expect(cache.get('key3')).toBe(3)
      expect(cache.get('key4')).toBe(4)
    })

    it('should update access order on set existing key', () => {
      // Arrange
      const cache = new LRUCache<string, number>(3, 60000)
      cache.set('key1', 1)
      cache.set('key2', 2)
      cache.set('key3', 3)

      // Act - update key1 to make it recent
      cache.set('key1', 10)
      cache.set('key4', 4) // Should evict key2 (oldest)

      // Assert
      expect(cache.get('key1')).toBe(10)
      expect(cache.get('key2')).toBeNull()
    })
  })

  describe('TTL expiration', () => {
    it('should expire entries after TTL', async () => {
      // Arrange
      const cache = new LRUCache<string, number>(10, 100) // 100ms TTL
      cache.set('key1', 100)

      // Act - wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 150))

      // Assert
      expect(cache.get('key1')).toBeNull()
    })

    it('should not expire entries within TTL', async () => {
      // Arrange
      const cache = new LRUCache<string, number>(10, 200) // 200ms TTL
      cache.set('key1', 100)

      // Act - check before expiration
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Assert
      expect(cache.get('key1')).toBe(100)
    })
  })

  describe('edge cases', () => {
    it('should handle maxSize of 1', () => {
      // Arrange
      const cache = new LRUCache<string, number>(1, 60000)

      // Act
      cache.set('key1', 1)
      cache.set('key2', 2)

      // Assert
      expect(cache.get('key1')).toBeNull()
      expect(cache.get('key2')).toBe(2)
    })

    it('should handle very small TTL (near-immediate expiration)', async () => {
      // Arrange
      const cache = new LRUCache<string, number>(10, 1) // 1ms TTL
      cache.set('key1', 100)

      // Act - wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Assert
      expect(cache.get('key1')).toBeNull()
    })

    it('should handle undefined value', () => {
      // Arrange
      const cache = new LRUCache<string, number | undefined>(10, 60000)

      // Act
      cache.set('key1', undefined)

      // Assert - undefined is a valid value
      expect(cache.has('key1')).toBe(true)
    })
  })
})
