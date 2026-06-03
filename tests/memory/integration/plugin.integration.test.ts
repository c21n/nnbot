import { describe, it, test, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { MemoryPlugin, MemoryPluginConfig } from '../../../src/memory/plugin'
import { IMemoryRepository, IMessageRepository, ISummaryRepository, IProfileRepository, ISessionRepository } from '../../../src/memory/storage/interfaces'
import { EmbeddingProvider } from '../../../src/memory/providers/embedding.provider'
import { LLMProvider } from '../../../src/memory/providers/llm.provider'
import { Lock } from '../../../src/memory/lock/lock.interface'

function createFullMockConfig(): MemoryPluginConfig {
  return {
    messageRepo: {
      save: vi.fn(),
      findById: vi.fn(),
      findBySession: vi.fn().mockResolvedValue([]),
      findByUser: vi.fn().mockResolvedValue([]),
      countBySession: vi.fn(),
      updateSummarized: vi.fn(),
      deleteOldestSummarized: vi.fn(),
      deleteBySession: vi.fn()
    } as IMessageRepository,
    memoryRepo: {
      save: vi.fn(),
      findById: vi.fn(),
      query: vi.fn().mockResolvedValue([]),
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
    } as IMemoryRepository,
    summaryRepo: {
      getLastSummarizedIndex: vi.fn(),
      updateLastSummarizedIndex: vi.fn()
    } as ISummaryRepository,
    profileRepo: {
      save: vi.fn(),
      findById: vi.fn().mockResolvedValue(null),
      updateField: vi.fn(),
      delete: vi.fn()
    } as IProfileRepository,
    sessionRepo: {
      save: vi.fn(),
      findById: vi.fn(),
      findActiveByUser: vi.fn(),
      updateLastActive: vi.fn(),
      deleteExpired: vi.fn(),
      deleteById: vi.fn()
    } as ISessionRepository,
    embeddingProvider: {
      embed: vi.fn().mockResolvedValue(new Array(1024).fill(0.1)),
      getDimension: () => 1024
    } as EmbeddingProvider,
    llmProvider: {
      chat: vi.fn().mockResolvedValue('test response'),
      summarize: vi.fn().mockResolvedValue({ text: 'summary', type: 'context', importance: 0.5, keywords: [] })
    } as LLMProvider,
    lock: {
      acquire: vi.fn().mockResolvedValue(true),
      release: vi.fn().mockResolvedValue(undefined),
      withLock: vi.fn().mockImplementation(async (_task: string, fn: () => Promise<unknown>) => fn())
    } as Lock
  }
}

describe('MemoryPlugin Full Pipeline Integration', () => {
  test('beforeChat stores message, searches memories, and builds prompt', async () => {
    // Arrange
    const config = createFullMockConfig()
    const plugin = new MemoryPlugin(config)

    // Act
    const result = await plugin.beforeChat({
      userId: 'user-1',
      sessionId: 'session-1',
      userMessage: '你好',
      systemPrompt: '你是一个助手'
    })

    // Assert
    expect(result.systemPrompt).toBeDefined()
    expect(result.userMessage).toBeDefined()
    expect(config.messageRepo.save).toHaveBeenCalledTimes(1)
    expect(config.memoryRepo.query).toHaveBeenCalled()
  })

  test('afterChat stores response and acquires lock', async () => {
    // Arrange
    const config = createFullMockConfig()
    const plugin = new MemoryPlugin(config)

    // Act
    await plugin.afterChat({
      userId: 'user-1',
      sessionId: 'session-1',
      userMessage: '你好',
      assistantMessage: '你好！'
    })

    // Assert
    expect(config.lock.acquire).toHaveBeenCalledWith('afterchat:session-1', 30000)
    expect(config.messageRepo.save).toHaveBeenCalledTimes(1)
    const saved = (config.messageRepo.save as Mock).mock.calls[0][0]
    expect(saved.role).toBe('assistant')
    expect(saved.content).toBe('你好！')
    expect(config.lock.release).toHaveBeenCalledWith('afterchat:session-1')
  })

  test('full beforeChat → afterChat cycle', async () => {
    // Arrange
    const config = createFullMockConfig()
    const plugin = new MemoryPlugin(config)

    // Act - beforeChat
    const prompt = await plugin.beforeChat({
      userId: 'user-1',
      sessionId: 'session-1',
      userMessage: '告诉我天气',
      systemPrompt: '你是天气助手'
    })

    // Act - afterChat
    await plugin.afterChat({
      userId: 'user-1',
      sessionId: 'session-1',
      userMessage: '告诉我天气',
      assistantMessage: '今天晴天，25度。'
    })

    // Assert
    expect(prompt.systemPrompt).toBeDefined()
    expect(config.messageRepo.save).toHaveBeenCalledTimes(2) // user + assistant
    expect(config.lock.acquire).toHaveBeenCalled()
    expect(config.lock.release).toHaveBeenCalled()
  })
})
