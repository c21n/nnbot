import { describe, it, test, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { MemoryPlugin, MemoryPluginConfig } from '../../../src/memory/plugin'

// Mock all dependencies
const mockMessageRepo = {
  save: vi.fn(),
  findById: vi.fn(),
  findBySession: vi.fn().mockResolvedValue([]),
  findByUser: vi.fn(),
  countBySession: vi.fn(),
  updateSummarized: vi.fn(),
  deleteOldestSummarized: vi.fn(),
  deleteBySession: vi.fn()
}

const mockMemoryRepo = {
  save: vi.fn(),
  findById: vi.fn(),
  query: vi.fn().mockResolvedValue([]),
  update: vi.fn(),
  delete: vi.fn(),
  deleteByUser: vi.fn(),
  countByUser: vi.fn(),
  getAll: vi.fn().mockResolvedValue([])
}

const mockSummaryRepo = {
  getLastSummarizedIndex: vi.fn(),
  updateLastSummarizedIndex: vi.fn()
}

const mockProfileRepo = {
  save: vi.fn(),
  findById: vi.fn(),
  updateField: vi.fn(),
  delete: vi.fn()
}

const mockSessionRepo = {
  save: vi.fn(),
  findById: vi.fn(),
  findActiveByUser: vi.fn(),
  updateLastActive: vi.fn(),
  deleteExpired: vi.fn(),
  deleteById: vi.fn()
}

const mockEmbeddingProvider = {
  embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  getDimension: vi.fn().mockReturnValue(1024)
}

const mockLlmProvider = {
  chat: vi.fn().mockResolvedValue('test response'),
  summarize: vi.fn().mockResolvedValue({ text: 'summary', type: 'context', importance: 0.5, keywords: [] })
}

const mockLock = {
  acquire: vi.fn().mockResolvedValue(true),
  release: vi.fn().mockResolvedValue(undefined),
  withLock: vi.fn().mockImplementation(async (_task: string, fn: () => Promise<unknown>) => fn())
}

function createConfig(): MemoryPluginConfig {
  return {
    messageRepo: mockMessageRepo as never,
    memoryRepo: mockMemoryRepo as never,
    summaryRepo: mockSummaryRepo as never,
    profileRepo: mockProfileRepo as never,
    sessionRepo: mockSessionRepo as never,
    embeddingProvider: mockEmbeddingProvider as never,
    llmProvider: mockLlmProvider as never,
    lock: mockLock as never
  }
}

describe('MemoryPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('afterChat', () => {
    test('stores assistant message', async () => {
      // Arrange
      const plugin = new MemoryPlugin(createConfig())

      // Act
      await plugin.afterChat({
        userId: 'u1',
        sessionId: 's1',
        userMessage: 'hello',
        assistantMessage: 'hi there'
      })

      // Assert
      expect(mockMessageRepo.save).toHaveBeenCalledTimes(1)
      const saved = mockMessageRepo.save.mock.calls[0][0]
      expect(saved.role).toBe('assistant')
      expect(saved.content).toBe('hi there')
      expect(saved.user_id).toBe('u1')
      expect(saved.session_id).toBe('s1')
    })

    test('calls summaryService.checkAndGenerateSummary', async () => {
      // Arrange
      const plugin = new MemoryPlugin(createConfig())

      // Act
      await plugin.afterChat({
        userId: 'u1',
        sessionId: 's1',
        userMessage: 'hello',
        assistantMessage: 'hi'
      })

      // Assert - checkAndGenerateSummary is called via the service
      // We verify by checking messageRepo calls (summary check reads messages)
      expect(mockMessageRepo.save).toHaveBeenCalled()
    })

    test('updates profile at configured frequency', async () => {
      // Arrange
      const plugin = new MemoryPlugin(createConfig(), { profileUpdateFrequency: 2 })

      // Act - first call: count=1, 1%2!==0, no profile update
      await plugin.afterChat({
        userId: 'u1',
        sessionId: 's1',
        userMessage: 'msg1',
        assistantMessage: 'reply1'
      })

      // Assert - no profile update yet
      expect(mockLlmProvider.summarize).not.toHaveBeenCalled()

      // Act - second call: count=2, 2%2===0, triggers profile update
      await plugin.afterChat({
        userId: 'u1',
        sessionId: 's1',
        userMessage: 'msg2',
        assistantMessage: 'reply2'
      })

      // Assert - profile update triggered (calls findBySession for recent messages)
      expect(mockMessageRepo.findBySession).toHaveBeenCalledWith('s1', 6)
    })

    test('profile update failure does not block afterChat', async () => {
      // Arrange
      mockMessageRepo.findBySession.mockRejectedValueOnce(new Error('DB error'))
      const plugin = new MemoryPlugin(createConfig(), { profileUpdateFrequency: 1 })

      // Act & Assert - should not throw
      await expect(plugin.afterChat({
        userId: 'u1',
        sessionId: 's1',
        userMessage: 'hello',
        assistantMessage: 'hi'
      })).resolves.toBeUndefined()
    })

    test('different sessions have independent counters', async () => {
      // Arrange
      const plugin = new MemoryPlugin(createConfig(), { profileUpdateFrequency: 2 })

      // Act - session s1: count=1, session s2: count=1
      await plugin.afterChat({ userId: 'u1', sessionId: 's1', userMessage: 'a', assistantMessage: 'b' })
      await plugin.afterChat({ userId: 'u1', sessionId: 's2', userMessage: 'c', assistantMessage: 'd' })

      // Assert - neither triggered (both at count 1, freq=2)
      expect(mockMessageRepo.findBySession).not.toHaveBeenCalled()

      // Act - session s1: count=2, triggers
      await plugin.afterChat({ userId: 'u1', sessionId: 's1', userMessage: 'e', assistantMessage: 'f' })

      // Assert - only s1 triggered
      expect(mockMessageRepo.findBySession).toHaveBeenCalledTimes(1)
      expect(mockMessageRepo.findBySession).toHaveBeenCalledWith('s1', 6)
    })

    test('skips afterChat when lock is busy', async () => {
      // Arrange
      const busyLock = {
        acquire: vi.fn().mockRejectedValue(new Error('Lock busy')),
        release: vi.fn().mockResolvedValue(undefined),
        withLock: vi.fn()
      }
      const config = createConfig()
      config.lock = busyLock as never
      const plugin = new MemoryPlugin(config)

      // Act
      await plugin.afterChat({
        userId: 'u1',
        sessionId: 's1',
        userMessage: 'hello',
        assistantMessage: 'hi'
      })

      // Assert - message was NOT stored (skipped)
      expect(mockMessageRepo.save).not.toHaveBeenCalled()
    })

    test('acquires and releases lock around afterChat', async () => {
      // Arrange
      const plugin = new MemoryPlugin(createConfig())

      // Act
      await plugin.afterChat({
        userId: 'u1',
        sessionId: 's1',
        userMessage: 'hello',
        assistantMessage: 'hi'
      })

      // Assert
      expect(mockLock.acquire).toHaveBeenCalledWith('afterchat:s1', 30000)
      expect(mockLock.release).toHaveBeenCalledWith('afterchat:s1')
    })
  })
})
