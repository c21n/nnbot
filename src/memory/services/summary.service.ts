import { IMessageRepository, IMemoryRepository, ISummaryRepository } from '../storage/interfaces'
import { ILLMProvider } from '../providers/llm.provider'
import { IEmbeddingProvider } from '../providers/embedding.provider'
import { generateId } from '../utils/id'
import { logger } from '../utils/logger'
import { config } from '../config'
import { PROMPTS } from '../config/prompts'

export class SummaryService {
  constructor(
    private messageRepo: IMessageRepository,
    private memoryRepo: IMemoryRepository,
    private summaryRepo: ISummaryRepository,
    private llm: ILLMProvider,
    private embedding: IEmbeddingProvider
  ) {}

  async checkAndGenerateSummary(
    userId: string,
    sessionId: string
  ): Promise<boolean> {
    const totalMessages = await this.messageRepo.countBySession(sessionId)
    const lastSummarizedIndex = await this.summaryRepo.getLastSummarizedIndex(sessionId)
    const unsummarizedRounds = Math.floor((totalMessages - lastSummarizedIndex) / 2)

    if (unsummarizedRounds >= config.lifecycle.summaryTriggerRounds) {
      await this.generateSummary(userId, sessionId, lastSummarizedIndex, totalMessages)
      return true
    }

    return false
  }

  private async generateSummary(
    userId: string,
    sessionId: string,
    startIndex: number,
    endIndex: number
  ): Promise<void> {
    // 1. Get messages to summarize
    const messages = await this.messageRepo.findBySession(sessionId, endIndex)
    const toSummarize = messages.slice(startIndex)

    if (toSummarize.length === 0) {
      return
    }

    try {
      // 2. Generate summary with LLM
      const summary = await this.llm.summarize({
        messages: toSummarize.map(m => ({ role: m.role, content: m.content })),
        prompt: this.buildSummaryPrompt()
      })

      // 3. Generate embedding
      const embedding = await this.embedding.embed(summary.text)

      // 4. Save to vector store
      await this.memoryRepo.save({
        id: generateId(),
        text: summary.text,
        embedding,
        metadata: {
          user_id: userId,
          session_id: sessionId,
          platform: 'unknown',
          type: summary.type,
          importance: summary.importance,
          timestamp: Date.now(),
          keywords: summary.keywords
        },
        created_at: Date.now(),
        last_accessed_at: Date.now(),
        access_count: 0
      })

      // 5. Update summary index
      await this.summaryRepo.updateLastSummarizedIndex(sessionId, endIndex)
    } catch (error) {
      logger.error(`[SummaryService] Failed to generate summary for session ${sessionId}:`, error)
      throw error
    }
  }

  /**
   * Compress old messages into a summary for conversation context.
   * Used by ai-chat plugin to keep context within token limits.
   */
  async compressMessages(
    messages: Array<{ role: string; content: string }>,
    existingSummary: string
  ): Promise<string> {
    if (messages.length === 0) return existingSummary

    const conversationText = messages
      .map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
      .join('\n')

    const prompt = existingSummary
      ? `${PROMPTS.summary}\n\n之前的摘要: ${existingSummary}\n\n新的对话:\n${conversationText}`
      : `${PROMPTS.summary}\n\n对话内容:\n${conversationText}`

    try {
      const result = await this.llm.chat([{ role: 'system', content: prompt }])
      return result.trim()
    } catch (error) {
      logger.error('[SummaryService] Compression failed:', error)
      return existingSummary
    }
  }

  private buildSummaryPrompt(): string {
    return PROMPTS.summary
  }
}
