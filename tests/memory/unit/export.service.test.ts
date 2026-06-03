import { describe, it, test, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { ExportService } from '../../../src/memory/services/export.service'
import { IProfileRepository, IMemoryRepository, IMessageRepository } from '../../../src/memory/storage/interfaces'
import { IEmbeddingProvider } from '../../../src/memory/providers/embedding.provider'
import { ExportData } from '../../../src/memory/types/export.types'
import { Memory, Message, UserProfile } from '../../../src/memory/types'
import { logger } from '../../../src/memory/utils/logger'

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

const createMockEmbeddingProvider = (): IEmbeddingProvider => ({
  embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  getDimension: vi.fn().mockReturnValue(3)
})

const createProfile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  user_id: 'user-1',
  basic_info: { name: 'Test User' },
  preferences: { likes: ['music'], dislikes: [] },
  habits: {},
  created_at: Date.now(),
  updated_at: Date.now(),
  ...overrides
})

const createMemory = (overrides: Partial<Memory> = {}): Memory => ({
  id: 'mem-1',
  text: 'Test memory',
  embedding: [0.1, 0.2, 0.3],
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
  access_count: 0,
  ...overrides
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

const createExportData = (overrides: Partial<ExportData> = {}): ExportData => ({
  version: '1.0.0',
  exportTime: Date.now(),
  userId: 'user-1',
  profile: createProfile(),
  memories: [{
    text: 'Test memory',
    type: 'preference',
    importance: 0.8,
    createdAt: Date.now()
  }],
  messages: [{
    role: 'user',
    content: 'Hello',
    timestamp: Date.now()
  }],
  ...overrides
})

describe('ExportService', () => {
  let exportService: ExportService
  let mockProfileRepo: IProfileRepository
  let mockMemoryRepo: IMemoryRepository
  let mockMessageRepo: IMessageRepository
  let mockEmbeddingProvider: IEmbeddingProvider

  beforeEach(() => {
    mockProfileRepo = createMockProfileRepo()
    mockMemoryRepo = createMockMemoryRepo()
    mockMessageRepo = createMockMessageRepo()
    mockEmbeddingProvider = createMockEmbeddingProvider()

    exportService = new ExportService(
      mockProfileRepo,
      mockMemoryRepo,
      mockMessageRepo,
      mockEmbeddingProvider
    )

    vi.spyOn(logger, 'info').mockImplementation(() => {})
    vi.spyOn(logger, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('exportUserData()', () => {
    it('should return complete export data', async () => {
      // Arrange
      const profile = createProfile()
      const memories = [createMemory({ id: 'mem-1' }), createMemory({ id: 'mem-2' })]
      const messages = [createMessage({ id: 'msg-1' }), createMessage({ id: 'msg-2' })]

      ;(mockProfileRepo.findById as Mock).mockResolvedValue(profile)
      ;(mockMemoryRepo.getAll as Mock).mockResolvedValue(memories)
      ;(mockMessageRepo.findByUser as Mock).mockResolvedValue(messages)

      // Act
      const result = await exportService.exportUserData('user-1')

      // Assert
      expect(result.version).toBe('1.0.0')
      expect(result.userId).toBe('user-1')
      expect(result.profile).toEqual(profile)
      expect(result.memories).toHaveLength(2)
      expect(result.messages).toHaveLength(2)
      expect(mockProfileRepo.findById).toHaveBeenCalledWith('user-1')
      expect(mockMemoryRepo.getAll).toHaveBeenCalledWith('user-1')
      expect(mockMessageRepo.findByUser).toHaveBeenCalledWith('user-1', 100)
    })

    it('should return empty export data when no data exists', async () => {
      // Arrange
      ;(mockProfileRepo.findById as Mock).mockResolvedValue(null)
      ;(mockMemoryRepo.getAll as Mock).mockResolvedValue([])
      ;(mockMessageRepo.findByUser as Mock).mockResolvedValue([])

      // Act
      const result = await exportService.exportUserData('user-1')

      // Assert
      expect(result.version).toBe('1.0.0')
      expect(result.userId).toBe('user-1')
      expect(result.profile).toBeNull()
      expect(result.memories).toEqual([])
      expect(result.messages).toEqual([])
    })

    it('should map memory fields correctly', async () => {
      // Arrange
      const memory = createMemory({
        id: 'mem-1',
        text: 'User likes coffee',
        metadata: {
          user_id: 'user-1',
          session_id: 'session-1',
          platform: 'web',
          type: 'preference',
          importance: 0.9,
          timestamp: 1000,
          keywords: []
        },
        created_at: 2000
      })

      ;(mockProfileRepo.findById as Mock).mockResolvedValue(null)
      ;(mockMemoryRepo.getAll as Mock).mockResolvedValue([memory])
      ;(mockMessageRepo.findByUser as Mock).mockResolvedValue([])

      // Act
      const result = await exportService.exportUserData('user-1')

      // Assert
      expect(result.memories[0]).toEqual({
        text: 'User likes coffee',
        type: 'preference',
        importance: 0.9,
        createdAt: 2000
      })
    })

    it('should map message fields correctly', async () => {
      // Arrange
      const message = createMessage({
        id: 'msg-1',
        role: 'assistant',
        content: 'Hello there!',
        timestamp: 3000
      })

      ;(mockProfileRepo.findById as Mock).mockResolvedValue(null)
      ;(mockMemoryRepo.getAll as Mock).mockResolvedValue([])
      ;(mockMessageRepo.findByUser as Mock).mockResolvedValue([message])

      // Act
      const result = await exportService.exportUserData('user-1')

      // Assert
      expect(result.messages[0]).toEqual({
        role: 'assistant',
        content: 'Hello there!',
        timestamp: 3000
      })
    })
  })

  describe('importUserData()', () => {
    it('should restore profile and memories', async () => {
      // Arrange
      const exportData = createExportData()
      ;(mockEmbeddingProvider.embed as Mock).mockResolvedValue([0.4, 0.5, 0.6])

      // Act
      await exportService.importUserData('user-2', exportData)

      // Assert
      expect(mockProfileRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: 'user-2' })
      )
      expect(mockEmbeddingProvider.embed).toHaveBeenCalledWith('Test memory')
      expect(mockMemoryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Test memory',
          embedding: [0.4, 0.5, 0.6],
          metadata: expect.objectContaining({
            user_id: 'user-2',
            type: 'preference',
            importance: 0.8
          })
        })
      )

      const savedMemory = (mockMemoryRepo.save as Mock).mock.calls[0][0]
      expect(savedMemory.id).toBeTruthy()
      expect(typeof savedMemory.id).toBe('string')
    })

    it('should skip memory when embedding fails', async () => {
      // Arrange
      const exportData = createExportData()
      ;(mockEmbeddingProvider.embed as Mock).mockRejectedValue(new Error('Embedding error'))

      // Act
      await exportService.importUserData('user-1', exportData)

      // Assert
      expect(mockMemoryRepo.save).not.toHaveBeenCalled()
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to import memory, skipping')
      )
    })

    it('should throw error on version mismatch', async () => {
      // Arrange
      const exportData = createExportData({ version: '2.0.0' })

      // Act & Assert
      await expect(exportService.importUserData('user-1', exportData))
        .rejects.toThrow('Version mismatch: expected 1.0.0, got 2.0.0')
    })

    it('should skip profile import when profile is null', async () => {
      // Arrange
      const exportData = createExportData({ profile: null })
      ;(mockEmbeddingProvider.embed as Mock).mockResolvedValue([0.1, 0.2, 0.3])

      // Act
      await exportService.importUserData('user-1', exportData)

      // Assert
      expect(mockProfileRepo.save).not.toHaveBeenCalled()
    })

    it('should import multiple memories', async () => {
      // Arrange
      const exportData = createExportData({
        memories: [
          { text: 'Memory 1', type: 'preference', importance: 0.8, createdAt: 1000 },
          { text: 'Memory 2', type: 'event', importance: 0.6, createdAt: 2000 },
          { text: 'Memory 3', type: 'context', importance: 0.4, createdAt: 3000 }
        ]
      })
      ;(mockEmbeddingProvider.embed as Mock).mockResolvedValue([0.1, 0.2, 0.3])

      // Act
      await exportService.importUserData('user-1', exportData)

      // Assert
      expect(mockEmbeddingProvider.embed).toHaveBeenCalledTimes(3)
      expect(mockMemoryRepo.save).toHaveBeenCalledTimes(3)
    })

    it('should continue importing other memories when one embedding fails', async () => {
      // Arrange
      const exportData = createExportData({
        memories: [
          { text: 'Memory 1', type: 'preference', importance: 0.8, createdAt: 1000 },
          { text: 'Memory 2', type: 'event', importance: 0.6, createdAt: 2000 }
        ]
      })
      ;(mockEmbeddingProvider.embed as Mock)
        .mockRejectedValueOnce(new Error('Embedding error'))
        .mockResolvedValueOnce([0.4, 0.5, 0.6])

      // Act
      await exportService.importUserData('user-1', exportData)

      // Assert
      expect(mockEmbeddingProvider.embed).toHaveBeenCalledTimes(2)
      expect(mockMemoryRepo.save).toHaveBeenCalledTimes(1)
    })

    it('should log completion message', async () => {
      // Arrange
      const exportData = createExportData()
      ;(mockEmbeddingProvider.embed as Mock).mockResolvedValue([0.1, 0.2, 0.3])

      // Act
      await exportService.importUserData('user-1', exportData)

      // Assert
      expect(logger.info).toHaveBeenCalledWith('[Export] Import completed for user user-1')
    })
  })
})
