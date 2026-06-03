import { IProfileRepository, IMemoryRepository } from '../storage/interfaces'
import { ILLMProvider } from '../providers/llm.provider'
import { UserProfile, Memory } from '../types'
import { logger } from '../utils/logger'
import { PROMPTS } from '../config/prompts'

// Max memories to include in summary
const MAX_MEMORIES = 10

export class MemorySummaryService {
  constructor(
    private profileRepo: IProfileRepository,
    private memoryRepo: IMemoryRepository,
    private llmProvider: ILLMProvider
  ) {}

  /**
   * Generate a natural language summary of what we remember about the user
   */
  async getMemorySummary(userId: string): Promise<string> {
    // 1. Fetch profile and memories
    const profile = await this.profileRepo.findById(userId)
    const allMemories = await this.memoryRepo.getAll(userId)

    // 2. Edge case: no data at all
    if (!profile && allMemories.length === 0) {
      logger.info(`[MemorySummaryService] No data for user ${userId}`)
      return PROMPTS.noDataMessage
    }

    // 3. Sort by created_at descending, take top N
    const recentMemories = this.getRecentMemories(allMemories, MAX_MEMORIES)

    // 4. Build prompt and call LLM
    try {
      const prompt = this.buildPrompt(profile, recentMemories)
      const summary = await this.llmProvider.chat([{ role: 'system', content: prompt }])
      logger.info(`[MemorySummaryService] Generated summary for user ${userId}`)
      return summary
    } catch (error) {
      logger.error(`[MemorySummaryService] LLM call failed for user ${userId}:`, error)
      return PROMPTS.llmFailureMessage
    }
  }

  /**
   * Get most recent memories sorted by created_at descending
   */
  private getRecentMemories(memories: Memory[], limit: number): Memory[] {
    return [...memories]
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, limit)
  }

  /**
   * Build the prompt for LLM summary generation
   */
  private buildPrompt(profile: UserProfile | null, memories: Memory[]): string {
    const profileSection = JSON.stringify(profile)
    const memoriesSection = memories
      .map(m => `- ${m.text}`)
      .join('\n')

    return PROMPTS.memorySummary(profileSection, memoriesSection)
  }
}
