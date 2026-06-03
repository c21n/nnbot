import { describe, it, test, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { SummaryService } from '../../../src/memory/services/summary.service'
import { IMessageRepository, IMemoryRepository, ISummaryRepository } from '../../../src/memory/storage/interfaces'
import { LLMProvider } from '../../../src/memory/providers/llm.provider'
import { EmbeddingProvider } from '../../../src/memory/providers/embedding.provider'
import { Message, Memory } from '../../../src/memory/types'

// Mock implementations
const createMockMessageRepo = (): IMessageRepository => ({
  save: vi.fn(),
  findById: vi.fn(),
  findBySession: vi.fn(),
  findByUser: vi.fn(),
  countBySession: vi.fn(),
  updateSummarized: vi.fn(),
  deleteOldestSummarized: vi.fn(),
  deleteBySession: vi.fn()
})

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

const createMockSummaryRepo = (): ISummaryRepository => ({
  getLastSummarizedIndex: vi.fn(),
  updateLastSummarizedIndex: vi.fn()
})

const createMockLLMProvider = (): LLMProvider => ({
  chat: vi.fn(),
  summarize: vi.fn()
})

const createMockEmbeddingProvider = (): EmbeddingProvider => ({
  embed: vi.fn().mockResolvedValue(new Array(1024).fill(0.1)),
  getDimension: () => 1024
})

const createMessage = (overrides: Partial<Message> = {}): Message => ({
  id: 'msg-1',
  session_id: 'session-1',
  user_id: 'user-1',
  role: 'user',
  content: 'Hello',
  timestamp: Date.now(),
  ...overrides
})

describe('SummaryService', () => {
  let summaryService: SummaryService
  let mockMessageRepo: IMessageRepository
  let mockMemoryRepo: IMemoryRepository
  let mockSummaryRepo: ISummaryRepository
  let mockLLM: LLMProvider
  let mockEmbedding: EmbeddingProvider

  beforeEach(() => {
    mockMessageRepo = createMockMessageRepo()
    mockMemoryRepo = createMockMemoryRepo()
    mockSummaryRepo = createMockSummaryRepo()
    mockLLM = createMockLLMProvider()
    mockEmbedding = createMockEmbeddingProvider()

    summaryService = new SummaryService(
      mockMessageRepo,
      mockMemoryRepo,
      mockSummaryRepo,
      mockLLM,
      mockEmbedding
    )
  })

  describe('checkAndGenerateSummary()', () => {
    it('should return false when not enough rounds', async () => {
      // Arrange
      ;(mockMessageRepo.countBySession as Mock).mockResolvedValue(10)
      ;(mockSummaryRepo.getLastSummarizedIndex as Mock).mockResolvedValue(0)

      // Act
      const result = await summaryService.checkAndGenerateSummary('user-1', 'session-1')

      // Assert
      expect(result).toBe(false)
      expect(mockLLM.summarize).not.toHaveBeenCalled()
    })

    it('should return false when already summarized', async () => {
      // Arrange
      ;(mockMessageRepo.countBySession as Mock).mockResolvedValue(30)
      ;(mockSummaryRepo.getLastSummarizedIndex as Mock).mockResolvedValue(28)

      // Act
      const result = await summaryService.checkAndGenerateSummary('user-1', 'session-1')

      // Assert
      expect(result).toBe(false)
      expect(mockLLM.summarize).not.toHaveBeenCalled()
    })

    it('should generate summary when enough unsummarized rounds', async () => {
      // Arrange
      const messages = Array.from({ length: 30 }, (_, i) =>
        createMessage({
          id: `msg-${i}`,
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}`
        })
      )
      ;(mockMessageRepo.countBySession as Mock).mockResolvedValue(30)
      ;(mockSummaryRepo.getLastSummarizedIndex as Mock).mockResolvedValue(0)
      ;(mockMessageRepo.findBySession as Mock).mockResolvedValue(messages)
      ;(mockLLM.summarize as Mock).mockResolvedValue({
        text: 'Summary text',
        type: 'summary',
        importance: 0.7,
        keywords: ['keyword1', 'keyword2']
      })

      // Act
      const result = await summaryService.checkAndGenerateSummary('user-1', 'session-1')

      // Assert
      expect(result).toBe(true)
      expect(mockLLM.summarize).toHaveBeenCalledTimes(1)
      expect(mockEmbedding.embed).toHaveBeenCalledWith('Summary text')
      expect(mockMemoryRepo.save).toHaveBeenCalledTimes(1)
      expect(mockSummaryRepo.updateLastSummarizedIndex).toHaveBeenCalledWith('session-1', 30)
    })

    it('should save memory with correct metadata', async () => {
      // Arrange
      const messages = Array.from({ length: 30 }, (_, i) =>
        createMessage({ id: `msg-${i}` })
      )
      ;(mockMessageRepo.countBySession as Mock).mockResolvedValue(30)
      ;(mockSummaryRepo.getLastSummarizedIndex as Mock).mockResolvedValue(0)
      ;(mockMessageRepo.findBySession as Mock).mockResolvedValue(messages)
      ;(mockLLM.summarize as Mock).mockResolvedValue({
        text: 'User prefers Python',
        type: 'preference',
        importance: 0.8,
        keywords: ['python', 'programming']
      })

      // Act
      await summaryService.checkAndGenerateSummary('user-1', 'session-1')

      // Assert
      const savedMemory = (mockMemoryRepo.save as Mock).mock.calls[0]?.[0] as Memory
      expect(savedMemory).toBeDefined()
      expect(savedMemory!.text).toBe('User prefers Python')
      expect(savedMemory!.metadata.user_id).toBe('user-1')
      expect(savedMemory!.metadata.session_id).toBe('session-1')
      expect(savedMemory!.metadata.type).toBe('preference')
      expect(savedMemory!.metadata.importance).toBe(0.8)
      expect(savedMemory!.metadata.keywords).toEqual(['python', 'programming'])
      expect(savedMemory!.embedding).toHaveLength(1024)
    })

    it('should handle LLM failure gracefully', async () => {
      // Arrange
      ;(mockMessageRepo.countBySession as Mock).mockResolvedValue(30)
      ;(mockSummaryRepo.getLastSummarizedIndex as Mock).mockResolvedValue(0)
      ;(mockMessageRepo.findBySession as Mock).mockResolvedValue([createMessage()])
      ;(mockLLM.summarize as Mock).mockRejectedValue(new Error('LLM error'))

      // Act & Assert
      await expect(
        summaryService.checkAndGenerateSummary('user-1', 'session-1')
      ).rejects.toThrow('LLM error')

      // Should not update index on failure
      expect(mockSummaryRepo.updateLastSummarizedIndex).not.toHaveBeenCalled()
    })

    it('should handle embedding failure gracefully', async () => {
      // Arrange
      ;(mockMessageRepo.countBySession as Mock).mockResolvedValue(30)
      ;(mockSummaryRepo.getLastSummarizedIndex as Mock).mockResolvedValue(0)
      ;(mockMessageRepo.findBySession as Mock).mockResolvedValue([createMessage()])
      ;(mockLLM.summarize as Mock).mockResolvedValue({
        text: 'Summary',
        type: 'summary',
        importance: 0.5,
        keywords: []
      })
      ;(mockEmbedding.embed as Mock).mockRejectedValue(new Error('Embedding error'))

      // Act & Assert
      await expect(
        summaryService.checkAndGenerateSummary('user-1', 'session-1')
      ).rejects.toThrow('Embedding error')

      // Should not update index on failure
      expect(mockSummaryRepo.updateLastSummarizedIndex).not.toHaveBeenCalled()
    })
  })
})
