import { SearchService } from './services/search.service.js'
import { SummaryService } from './services/summary.service.js'
import { ProfileService } from './services/profile.service.js'
import { LifecycleService } from './services/lifecycle.service.js'
import { BatchOperationService } from './services/batch.service.js'
import { ExportService } from './services/export.service.js'
import { MemorySummaryService } from './services/memory-summary.service.js'
import { BM25Service } from './search/bm25.service.js'
import { buildPromptWithProtection } from './security/prompt-protection.js'
import { sanitizeProfile } from './security/sanitize.js'
import { checkOutputSafety } from './security/output-check.js'
import { IMessageRepository, IMemoryRepository, ISummaryRepository, IProfileRepository, ISessionRepository, IUserIndexRepository } from './storage/interfaces.js'
import { IEmbeddingProvider } from './providers/embedding.provider.js'
import { ILLMProvider } from './providers/llm.provider.js'
import { ILock } from './lock/lock.interface.js'
import { generateId } from './utils/id.js'
import { logger } from './utils/logger.js'
import { ExportData } from './types/index.js'

export interface MemoryPluginConfig {
  messageRepo: IMessageRepository
  memoryRepo: IMemoryRepository
  summaryRepo: ISummaryRepository
  profileRepo: IProfileRepository
  sessionRepo: ISessionRepository
  userIndexRepo?: IUserIndexRepository
  embeddingProvider: IEmbeddingProvider
  llmProvider: ILLMProvider
  lock: ILock
  bm25Service?: BM25Service
}

export class MemoryPlugin {
  private searchService: SearchService
  private summaryService: SummaryService
  private profileService: ProfileService
  private lifecycleService: LifecycleService
  private batchService: BatchOperationService
  private exportService: ExportService
  private memorySummaryService: MemorySummaryService
  private messageRepo: IMessageRepository
  private memoryRepo: IMemoryRepository
  private userIndexRepo?: IUserIndexRepository
  private sessionMessageCounts = new Map<string, number>()
  private profileUpdateFrequency: number
  private lock: ILock

  constructor(config: MemoryPluginConfig, lifecycleConfig?: { profileUpdateFrequency?: number }) {
    this.messageRepo = config.messageRepo
    this.memoryRepo = config.memoryRepo
    this.userIndexRepo = config.userIndexRepo
    this.lock = config.lock
    this.profileUpdateFrequency = lifecycleConfig?.profileUpdateFrequency ?? 3

    this.searchService = new SearchService(
      config.memoryRepo,
      config.embeddingProvider,
      config.bm25Service ?? new BM25Service()
    )

    this.summaryService = new SummaryService(
      config.messageRepo,
      config.memoryRepo,
      config.summaryRepo,
      config.llmProvider,
      config.embeddingProvider
    )

    this.profileService = new ProfileService(
      config.profileRepo,
      config.llmProvider
    )

    this.lifecycleService = new LifecycleService(
      config.memoryRepo,
      config.sessionRepo,
      config.lock,
      config.userIndexRepo
    )

    this.batchService = new BatchOperationService(config.memoryRepo)
    this.exportService = new ExportService(
      config.profileRepo,
      config.memoryRepo,
      config.messageRepo,
      config.embeddingProvider
    )
    this.memorySummaryService = new MemorySummaryService(
      config.profileRepo,
      config.memoryRepo,
      config.llmProvider
    )
  }

  async initialize(): Promise<void> {
    this.lifecycleService.startCronJobs()
    logger.info('[MemoryPlugin] Initialized')
  }

  async shutdown(): Promise<void> {
    this.lifecycleService.stopCronJobs()
    logger.info('[MemoryPlugin] Shutdown')
  }

  /**
   * Compress old messages into a summary for conversation context.
   */
  async compressConversation(
    messages: Array<{ role: string; content: string }>,
    existingSummary: string
  ): Promise<string> {
    return this.summaryService.compressMessages(messages, existingSummary)
  }

  /**
   * Called before chat to inject memory context
   */
  async beforeChat(params: {
    userId: string
    sessionId: string
    userMessage: string
    systemPrompt: string
  }): Promise<{ systemPrompt: string; userMessage: string }> {
    const { userId, sessionId, userMessage, systemPrompt } = params

    // 1. Update user index
    if (this.userIndexRepo) {
      await this.userIndexRepo.upsert(userId)
    }

    // 2. Store user message
    await this.messageRepo.save({
      id: generateId(),
      session_id: sessionId,
      user_id: userId,
      role: 'user',
      content: userMessage,
      timestamp: Date.now()
    })

    // 3. Search related memories
    const memories = await this.searchService.search(
      userMessage,
      userId,
      sessionId,
      { limit: 5 }
    )

    // 4. Get user profile
    const profile = await this.profileService.getProfile(userId)

    // 5. Build protected prompt with sanitized profile
    const sanitizedProfile = sanitizeProfile(profile)
    const protectedPrompt = buildPromptWithProtection(
      userMessage,
      memories,
      `${systemPrompt}\n\n用户信息：${JSON.stringify(sanitizedProfile)}`
    )

    return {
      systemPrompt: protectedPrompt[0]?.content ?? '',
      userMessage: protectedPrompt[1]?.content ?? userMessage
    }
  }

  /**
   * Called after chat to store response and check for summary
   */
  async afterChat(params: {
    userId: string
    sessionId: string
    userMessage: string
    assistantMessage: string
  }): Promise<void> {
    const { userId, sessionId, assistantMessage } = params
    const lockKey = `afterchat:${sessionId}`

    try {
      await this.lock.acquire(lockKey, 30000)
    } catch {
      logger.warn(`[MemoryPlugin] afterChat lock busy for session ${sessionId}, skipping`)
      return
    }

    try {
      // 1. Store assistant message
      await this.messageRepo.save({
        id: generateId(),
        session_id: sessionId,
        user_id: userId,
        role: 'assistant',
        content: assistantMessage,
        timestamp: Date.now()
      })

      // 2. Check if summary should be generated
      await this.summaryService.checkAndGenerateSummary(userId, sessionId)

      // 3. Update profile at configured frequency
      const count = (this.sessionMessageCounts.get(sessionId) ?? 0) + 1
      this.sessionMessageCounts.set(sessionId, count)

      if (count % this.profileUpdateFrequency === 0) {
        try {
          const recentMessages = await this.messageRepo.findBySession(sessionId, 6)
          await this.profileService.updateProfile(userId, recentMessages)
        } catch (error) {
          logger.warn(`[MemoryPlugin] Profile update failed for user ${userId}: ${error}`)
        }
      }
    } finally {
      await this.lock.release(lockKey).catch(() => {})
    }
  }

  /**
   * Get memory summary for user
   */
  async getMemorySummary(userId: string): Promise<string> {
    const summary = await this.memorySummaryService.getMemorySummary(userId)
    return checkOutputSafety(summary)
  }

  /**
   * Clear all memories for user
   */
  async clearAll(userId: string): Promise<void> {
    // Delete all memories from vector store
    await this.memoryRepo.deleteByUser(userId)
    // Clear user profile
    await this.profileService.updateProfile(userId, [])
  }

  /**
   * Export user data
   */
  async exportUserData(userId: string): Promise<ExportData> {
    return this.exportService.exportUserData(userId)
  }

  /**
   * Import user data
   */
  async importUserData(userId: string, data: ExportData): Promise<void> {
    return this.exportService.importUserData(userId, data)
  }

  /**
   * Delete memories by time range
   */
  async deleteMemoriesByTimeRange(userId: string, startTime: number, endTime: number): Promise<number> {
    return this.batchService.deleteByTimeRange(userId, startTime, endTime)
  }

  /**
   * Delete memories by type
   */
  async deleteMemoriesByType(userId: string, type: string): Promise<number> {
    return this.batchService.deleteByType(userId, type)
  }
}
