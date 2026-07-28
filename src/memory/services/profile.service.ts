import { IProfileRepository } from '../storage/interfaces.js'
import { ILLMProvider } from '../providers/llm.provider.js'
import { UserProfile, Message } from '../types/index.js'
import { ExtractedUserInfo } from '../types/profile.types.js'
import { logger } from '../utils/logger.js'
import { PROMPTS } from '../config/prompts.js'

export class ProfileService {
  constructor(
    private profileRepo: IProfileRepository,
    private llm: ILLMProvider
  ) {}

  async getProfile(userId: string): Promise<UserProfile> {
    const existing = await this.profileRepo.findById(userId)
    if (existing) {
      return existing
    }

    // Return default profile
    return {
      user_id: userId,
      basic_info: {},
      preferences: { likes: [], dislikes: [] },
      habits: {},
      created_at: Date.now(),
      updated_at: Date.now()
    }
  }

  async updateProfile(userId: string, messages: Message[]): Promise<UserProfile> {
    // 1. Get current profile
    const profile = await this.getProfile(userId)

    // 2. Extract user info from messages
    const extractedInfo = await this.extractUserInfo(messages)

    // 3. Merge extracted info into profile
    const updatedProfile = this.mergeProfileInfo(profile, extractedInfo)

    // 4. Save to database
    updatedProfile.updated_at = Date.now()
    await this.profileRepo.save(updatedProfile)

    return updatedProfile
  }

  private async extractUserInfo(messages: Message[]): Promise<ExtractedUserInfo[]> {
    if (messages.length === 0) {
      return []
    }

    const prompt = this.buildExtractionPrompt()
    const formattedMessages = messages.map(m => ({
      role: m.role,
      content: m.content
    }))

    try {
      const response = await this.llm.summarize({
        messages: formattedMessages,
        prompt
      })

      // Parse extracted info from response
      return this.parseExtractedInfo(response.text)
    } catch (error) {
      logger.error('[ProfileService] LLM extraction failed:', error)
      return []
    }
  }

  private buildExtractionPrompt(): string {
    return PROMPTS.userExtraction
  }

  private parseExtractedInfo(text: string): ExtractedUserInfo[] {
    try {
      // 先尝试提取 ```json ... ``` 代码块
      const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/)
      const raw = codeBlock ? codeBlock[1].trim() : text

      // 匹配 JSON 数组
      const jsonMatch = raw.match(/\[[\s\S]*\]/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        if (Array.isArray(parsed)) {
          return parsed.filter(item =>
            item.type && item.key && item.value !== undefined && item.confidence !== undefined
          )
        }
      }
    } catch {
      // silent
    }
    return []
  }

  private mergeProfileInfo(
    profile: UserProfile,
    extractedInfo: ExtractedUserInfo[]
  ): UserProfile {
    const updated = { ...profile }

    for (const info of extractedInfo) {
      if (info.confidence < 0.5) {
        continue // Skip low confidence
      }

      switch (info.type) {
        case 'basic_info':
          updated.basic_info = {
            ...updated.basic_info,
            [info.key]: info.value
          }
          break

        case 'preference':
          if (info.key === 'like' || info.key === 'likes') {
            const newLikes = Array.isArray(info.value)
              ? info.value.map(String)
              : [String(info.value)]
            updated.preferences.likes = this.mergeArrays(
              updated.preferences.likes,
              newLikes
            )
          } else if (info.key === 'dislike' || info.key === 'dislikes') {
            const newDislikes = Array.isArray(info.value)
              ? info.value.map(String)
              : [String(info.value)]
            updated.preferences.dislikes = this.mergeArrays(
              updated.preferences.dislikes,
              newDislikes
            )
          } else {
            updated.preferences[info.key] = Array.isArray(info.value)
              ? info.value.map(String)
              : info.value
          }
          break

        case 'habit':
          updated.habits[info.key] = Array.isArray(info.value)
            ? info.value.map(String).join(', ')
            : info.value
          break

        case 'event':
          // Events are stored as memories, not in profile
          break
      }
    }

    return updated
  }

  private mergeArrays(existing: string[], incoming: string[]): string[] {
    const set = new Set(existing)
    for (const item of incoming) {
      set.add(item)
    }
    return Array.from(set)
  }
}
