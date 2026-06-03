import { describe, it, test, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { ProfileService } from '../../../src/memory/services/profile.service'
import { IProfileRepository } from '../../../src/memory/storage/interfaces'
import { LLMProvider } from '../../../src/memory/providers/llm.provider'
import { UserProfile, Message } from '../../../src/memory/types'

// Mock implementations
const createMockProfileRepo = (): IProfileRepository => ({
  save: vi.fn(),
  findById: vi.fn(),
  updateField: vi.fn(),
  delete: vi.fn()
})

const createMockLLMProvider = (): LLMProvider => ({
  chat: vi.fn(),
  summarize: vi.fn()
})

const createMessage = (overrides: Partial<Message> = {}): Message => ({
  id: 'msg-1',
  session_id: 'session-1',
  user_id: 'user-1',
  role: 'user',
  content: 'I love Python programming',
  timestamp: Date.now(),
  ...overrides
})

const createProfile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  user_id: 'user-1',
  basic_info: {},
  preferences: { likes: [], dislikes: [] },
  habits: {},
  created_at: Date.now(),
  updated_at: Date.now(),
  ...overrides
})

describe('ProfileService', () => {
  let profileService: ProfileService
  let mockProfileRepo: IProfileRepository
  let mockLLM: LLMProvider

  beforeEach(() => {
    mockProfileRepo = createMockProfileRepo()
    mockLLM = createMockLLMProvider()

    profileService = new ProfileService(mockProfileRepo, mockLLM)
  })

  describe('getProfile()', () => {
    it('should return existing profile', async () => {
      // Arrange
      const existingProfile = createProfile({
        basic_info: { name: 'Alice' }
      })
      ;(mockProfileRepo.findById as Mock).mockResolvedValue(existingProfile)

      // Act
      const result = await profileService.getProfile('user-1')

      // Assert
      expect(result).toEqual(existingProfile)
      expect(mockProfileRepo.findById).toHaveBeenCalledWith('user-1')
    })

    it('should return default profile when not found', async () => {
      // Arrange
      ;(mockProfileRepo.findById as Mock).mockResolvedValue(null)

      // Act
      const result = await profileService.getProfile('user-1')

      // Assert
      expect(result.user_id).toBe('user-1')
      expect(result.basic_info).toEqual({})
      expect(result.preferences.likes).toEqual([])
      expect(result.preferences.dislikes).toEqual([])
      expect(result.habits).toEqual({})
    })
  })

  describe('updateProfile()', () => {
    it('should extract and merge basic info', async () => {
      // Arrange
      const messages = [createMessage({ content: 'My name is Alice' })]
      ;(mockProfileRepo.findById as Mock).mockResolvedValue(createProfile())
      ;(mockLLM.summarize as Mock).mockResolvedValue({
        text: JSON.stringify([{
          type: 'basic_info',
          key: 'name',
          value: 'Alice',
          confidence: 0.9
        }]),
        type: 'summary',
        importance: 0.5,
        keywords: []
      })

      // Act
      const result = await profileService.updateProfile('user-1', messages)

      // Assert
      expect(result.basic_info.name).toBe('Alice')
      expect(mockProfileRepo.save).toHaveBeenCalledTimes(1)
    })

    it('should extract and merge preferences', async () => {
      // Arrange
      const messages = [createMessage({ content: 'I love Python' })]
      ;(mockProfileRepo.findById as Mock).mockResolvedValue(createProfile())
      ;(mockLLM.summarize as Mock).mockResolvedValue({
        text: JSON.stringify([{
          type: 'preference',
          key: 'likes',
          value: 'Python',
          confidence: 0.8
        }]),
        type: 'summary',
        importance: 0.5,
        keywords: []
      })

      // Act
      const result = await profileService.updateProfile('user-1', messages)

      // Assert
      expect(result.preferences.likes).toContain('Python')
    })

    it('should merge multiple likes without duplicates', async () => {
      // Arrange
      const messages = [createMessage({ content: 'I love Python and JavaScript' })]
      const existingProfile = createProfile({
        preferences: { likes: ['Python'], dislikes: [] }
      })
      ;(mockProfileRepo.findById as Mock).mockResolvedValue(existingProfile)
      ;(mockLLM.summarize as Mock).mockResolvedValue({
        text: JSON.stringify([
          { type: 'preference', key: 'likes', value: 'Python', confidence: 0.8 },
          { type: 'preference', key: 'likes', value: 'JavaScript', confidence: 0.8 }
        ]),
        type: 'summary',
        importance: 0.5,
        keywords: []
      })

      // Act
      const result = await profileService.updateProfile('user-1', messages)

      // Assert
      expect(result.preferences.likes).toContain('Python')
      expect(result.preferences.likes).toContain('JavaScript')
      expect(result.preferences.likes).toHaveLength(2)
    })

    it('should skip low confidence extractions', async () => {
      // Arrange
      const messages = [createMessage()]
      ;(mockProfileRepo.findById as Mock).mockResolvedValue(createProfile())
      ;(mockLLM.summarize as Mock).mockResolvedValue({
        text: JSON.stringify([{
          type: 'basic_info',
          key: 'name',
          value: 'Alice',
          confidence: 0.3 // Low confidence
        }]),
        type: 'summary',
        importance: 0.5,
        keywords: []
      })

      // Act
      const result = await profileService.updateProfile('user-1', messages)

      // Assert
      expect(result.basic_info.name).toBeUndefined()
    })

    it('should handle empty messages', async () => {
      // Arrange
      ;(mockProfileRepo.findById as Mock).mockResolvedValue(createProfile())

      // Act
      const result = await profileService.updateProfile('user-1', [])

      // Assert
      expect(result).toEqual(expect.objectContaining({
        user_id: 'user-1'
      }))
      expect(mockLLM.summarize).not.toHaveBeenCalled()
    })

    it('should handle LLM failure gracefully', async () => {
      // Arrange
      const messages = [createMessage()]
      ;(mockProfileRepo.findById as Mock).mockResolvedValue(createProfile())
      ;(mockLLM.summarize as Mock).mockRejectedValue(new Error('LLM error'))

      // Act
      const result = await profileService.updateProfile('user-1', messages)

      // Assert
      // Should return original profile without changes
      expect(result.user_id).toBe('user-1')
      expect(mockProfileRepo.save).toHaveBeenCalledTimes(1)
    })

    it('should handle invalid JSON from LLM', async () => {
      // Arrange
      const messages = [createMessage()]
      ;(mockProfileRepo.findById as Mock).mockResolvedValue(createProfile())
      ;(mockLLM.summarize as Mock).mockResolvedValue({
        text: 'Invalid JSON',
        type: 'summary',
        importance: 0.5,
        keywords: []
      })

      // Act
      const result = await profileService.updateProfile('user-1', messages)

      // Assert
      expect(result.user_id).toBe('user-1')
      expect(mockProfileRepo.save).toHaveBeenCalledTimes(1)
    })

    it('should update timestamp on save', async () => {
      // Arrange
      const messages = [createMessage()]
      const oldTimestamp = Date.now() - 100000
      ;(mockProfileRepo.findById as Mock).mockResolvedValue(
        createProfile({ updated_at: oldTimestamp })
      )
      ;(mockLLM.summarize as Mock).mockResolvedValue({
        text: '[]',
        type: 'summary',
        importance: 0.5,
        keywords: []
      })

      // Act
      const result = await profileService.updateProfile('user-1', messages)

      // Assert
      expect(result.updated_at).toBeGreaterThan(oldTimestamp)
    })
  })
})
