import { describe, it, test, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { withRetry } from '../../../src/memory/utils/retry'

// Mock logger to avoid console output
vi.mock('../../../src/memory/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  test('returns result on first success without retry', async () => {
    // Arrange
    const fn = vi.fn().mockResolvedValue('ok')

    // Act
    const result = await withRetry(fn)

    // Assert
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test('retries on 500 error and succeeds on second attempt', async () => {
    // Arrange
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('Server error: 500'))
      .mockResolvedValue('recovered')

    // Act
    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 100 })
    await vi.advanceTimersByTimeAsync(200)
    const result = await promise

    // Assert
    expect(result).toBe('recovered')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  test('retries on 429 error', async () => {
    // Arrange
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('Rate limited: 429'))
      .mockResolvedValue('ok')

    // Act
    const promise = withRetry(fn, { maxAttempts: 2, baseDelayMs: 50 })
    await vi.advanceTimersByTimeAsync(100)
    const result = await promise

    // Assert
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  test('does NOT retry on 400 error (client error)', async () => {
    // Arrange
    const fn = vi.fn().mockRejectedValue(new Error('Bad request: 400'))

    // Act & Assert
    await expect(withRetry(fn, { maxAttempts: 3 })).rejects.toThrow('Bad request: 400')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test('does NOT retry on 401 error', async () => {
    // Arrange
    const fn = vi.fn().mockRejectedValue(new Error('Unauthorized: 401'))

    // Act & Assert
    await expect(withRetry(fn, { maxAttempts: 3 })).rejects.toThrow('Unauthorized: 401')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test('throws after maxAttempts exhausted', async () => {
    // Arrange - use real timers for this test to avoid fake timer + rejection interaction
    vi.useRealTimers()
    const fn = vi.fn().mockImplementation(() => Promise.reject(new Error('Server error: 503')))

    // Act & Assert
    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 })).rejects.toThrow('Server error: 503')
    expect(fn).toHaveBeenCalledTimes(3)

    // Restore fake timers
    vi.useFakeTimers()
  })

  test('respects custom retryOn predicate', async () => {
    // Arrange
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('Custom transient'))
      .mockResolvedValue('ok')
    const retryOn = (err: unknown) => (err as Error).message.includes('transient')

    // Act
    const promise = withRetry(fn, { maxAttempts: 2, baseDelayMs: 10, retryOn })
    await vi.advanceTimersByTimeAsync(50)
    const result = await promise

    // Assert
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  test('custom retryOn returning false does not retry', async () => {
    // Arrange
    const fn = vi.fn().mockRejectedValue(new Error('Permanent'))
    const retryOn = () => false

    // Act & Assert
    await expect(withRetry(fn, { maxAttempts: 3, retryOn })).rejects.toThrow('Permanent')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test('works with maxAttempts=1 (no retry)', async () => {
    // Arrange
    const fn = vi.fn().mockRejectedValue(new Error('Fail: 500'))

    // Act & Assert
    await expect(withRetry(fn, { maxAttempts: 1 })).rejects.toThrow('Fail: 500')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  test('uses default options when none provided', async () => {
    // Arrange
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('Error: 502'))
      .mockResolvedValue('ok')

    // Act - default: 3 attempts, 1000ms base delay
    const promise = withRetry(fn)
    await vi.advanceTimersByTimeAsync(5000)
    const result = await promise

    // Assert
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
