import { describe, it, test, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { MemorySummaryService } from '../../../src/memory/services/memory-summary.service'
import { IProfileRepository, IMemoryRepository } from '../../../src/memory/storage/interfaces'
import { ILLMProvider } from '../../../src/memory/providers/llm.provider'
import { UserProfile, Memory } from '../../../src/memory/types'

// Mock implementations
const createMockProfileRepo = (): IProfileRepository => ({
  save: vi.fn(),
  findById: vi.fn(),
  updateField: vi.fn(),
  delete: vi.fn()
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

const createMockLLMProvider = (): ILLMProvider => ({
  chat: vi.fn(),
  summarize: vi.fn()
})

const createProfile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  user_id: 'user-1',
  basic_info: { name: 'Alice' },
  preferences: { likes: ['Python'], dislikes: [] },
  habits: {},
  created_at: Date.now(),
  updated_at: Date.now(),
  ...overrides
})

const createMemory = (overrides: Partial<Memory> = {}): Memory => ({
  id: 'memory-1',
  text: 'User likes Python programming',
  metadata: {
    user_id: 'user-1',
    session_id: 'session-1',
    platform: 'test',
    type: 'preference',
    importance: 0.8,
    timestamp: Date.now()
  },
  created_at: Date.now(),
  last_accessed_at: Date.now(),
  access_count: 1,
  ...overrides
})

describe('MemorySummaryService', () => {
  let service: MemorySummaryService
  let mockProfileRepo: IProfileRepository
  let mockMemoryRepo: IMemoryRepository
  let mockLLMProvider: ILLMProvider

  beforeEach(() => {
    mockProfileRepo = createMockProfileRepo()
    mockMemoryRepo = createMockMemoryRepo()
    mockLLMProvider = createMockLLMProvider()

    service = new MemorySummaryService(mockProfileRepo, mockMemoryRepo, mockLLMProvider)
  })

  describe('getMemorySummary()', () => {
    it('should call LLM to generate summary when profile and memories exist', async () => {
      // Arrange
      const profile = createProfile()
      const memories = [
        createMemory({ id: 'm1', text: 'Likes Python', created_at: 1000 }),
        createMemory({ id: 'm2', text: 'Lives in Beijing', created_at: 2000 })
      ]
      ;(mockProfileRepo.findById as Mock).mockResolvedValue(profile)
      ;(mockMemoryRepo.getAll as Mock).mockResolvedValue(memories)
      ;(mockLLMProvider.chat as Mock).mockResolvedValue('Alice是一个喜欢Python的开发者，住在北京。')

      // Act
      const result = await service.getMemorySummary('user-1')

      // Assert
      expect(result).toBe('Alice是一个喜欢Python的开发者，住在北京。')
      expect(mockProfileRepo.findById).toHaveBeenCalledWith('user-1')
      expect(mockMemoryRepo.getAll).toHaveBeenCalledWith('user-1')
      expect(mockLLMProvider.chat).toHaveBeenCalledTimes(1)

      // Verify prompt contains profile and memories
      const chatArg = (mockLLMProvider.chat as Mock).mock.calls[0][0]
      expect(chatArg[0].role).toBe('system')
      expect(chatArg[0].content).toContain('Alice')
      expect(chatArg[0].content).toContain('Likes Python')
      expect(chatArg[0].content).toContain('Lives in Beijing')
    })

    it('should return "我还不了解你" when no profile and no memories', async () => {
      // Arrange
      ;(mockProfileRepo.findById as Mock).mockResolvedValue(null)
      ;(mockMemoryRepo.getAll as Mock).mockResolvedValue([])

      // Act
      const result = await service.getMemorySummary('user-1')

      // Assert
      expect(result).toBe('我还不了解你，让我们开始聊天吧！')
      expect(mockLLMProvider.chat).not.toHaveBeenCalled()
    })

    it('should return "暂时无法生成摘要" when LLM call fails', async () => {
      // Arrange
      const profile = createProfile()
      const memories = [createMemory()]
      ;(mockProfileRepo.findById as Mock).mockResolvedValue(profile)
      ;(mockMemoryRepo.getAll as Mock).mockResolvedValue(memories)
      ;(mockLLMProvider.chat as Mock).mockRejectedValue(new Error('LLM API error'))

      // Act
      const result = await service.getMemorySummary('user-1')

      // Assert
      expect(result).toBe('暂时无法生成摘要，请稍后再试。')
    })

    it('should still call LLM when only profile exists but no memories', async () => {
      // Arrange
      const profile = createProfile()
      ;(mockProfileRepo.findById as Mock).mockResolvedValue(profile)
      ;(mockMemoryRepo.getAll as Mock).mockResolvedValue([])
      ;(mockLLMProvider.chat as Mock).mockResolvedValue('Alice是一个开发者。')

      // Act
      const result = await service.getMemorySummary('user-1')

      // Assert
      expect(result).toBe('Alice是一个开发者。')
      expect(mockLLMProvider.chat).toHaveBeenCalledTimes(1)
    })

    it('should sort memories by created_at descending and take top 10', async () => {
      // Arrange
      const profile = createProfile()
      const memories = Array.from({ length: 15 }, (_, i) =>
        createMemory({ id: `m${i}`, text: `Memory ${i}`, created_at: i * 1000 })
      )
      ;(mockProfileRepo.findById as Mock).mockResolvedValue(profile)
      ;(mockMemoryRepo.getAll as Mock).mockResolvedValue(memories)
      ;(mockLLMProvider.chat as Mock).mockResolvedValue('Summary')

      // Act
      await service.getMemorySummary('user-1')

      // Assert
      const chatArg = (mockLLMProvider.chat as Mock).mock.calls[0][0]
      const prompt = chatArg[0].content
      // Should contain the most recent memories (14, 13, 12, ... 5)
      expect(prompt).toContain('Memory 14')
      expect(prompt).toContain('Memory 5')
      // Should NOT contain older memories (0, 1, 2, 3, 4)
      expect(prompt).not.toContain('Memory 0')
      expect(prompt).not.toContain('Memory 4')
    })

    it('should still call LLM when only memories exist but no profile', async () => {
      // Arrange
      const memories = [createMemory()]
      ;(mockProfileRepo.findById as Mock).mockResolvedValue(null)
      ;(mockMemoryRepo.getAll as Mock).mockResolvedValue(memories)
      ;(mockLLMProvider.chat as Mock).mockResolvedValue('用户喜欢Python。')

      // Act
      const result = await service.getMemorySummary('user-1')

      // Assert
      expect(result).toBe('用户喜欢Python。')
      expect(mockLLMProvider.chat).toHaveBeenCalledTimes(1)
    })
  })
})
