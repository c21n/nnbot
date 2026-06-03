import { IProfileRepository, IMemoryRepository, IMessageRepository } from '../storage/interfaces'
import { IEmbeddingProvider } from '../providers/embedding.provider'
import { ExportData, ExportMemory, ExportMessage } from '../types/export.types'
import { Memory } from '../types'
import { generateId } from '../utils/id'
import { logger } from '../utils/logger'

const CURRENT_VERSION = '1.0.0'
const MAX_MESSAGES = 100

export class ExportService {
  constructor(
    private profileRepo: IProfileRepository,
    private memoryRepo: IMemoryRepository,
    private messageRepo: IMessageRepository,
    private embeddingProvider: IEmbeddingProvider
  ) {}

  async exportUserData(userId: string): Promise<ExportData> {
    const [profile, memories, messages] = await Promise.all([
      this.profileRepo.findById(userId),
      this.memoryRepo.getAll(userId),
      this.messageRepo.findByUser(userId, MAX_MESSAGES)
    ])

    return {
      version: CURRENT_VERSION,
      exportTime: Date.now(),
      userId,
      profile,
      memories: memories.map(this.toExportMemory),
      messages: messages.map(this.toExportMessage)
    }
  }

  /**
   * Import user data from export format.
   * Note: Only imports profile and memories. Messages are not imported
   * as they are conversation history that should be generated naturally.
   */
  async importUserData(userId: string, data: ExportData): Promise<void> {
    this.validateVersion(data.version)

    await this.importProfile(userId, data.profile)
    await this.importMemories(userId, data.memories)

    logger.info(`[Export] Import completed for user ${userId}`)
  }

  private validateVersion(version: string): void {
    if (version !== CURRENT_VERSION) {
      throw new Error(`Version mismatch: expected ${CURRENT_VERSION}, got ${version}`)
    }
  }

  private async importProfile(userId: string, profile: ExportData['profile']): Promise<void> {
    if (!profile) {
      return
    }

    const updatedProfile = { ...profile, user_id: userId }
    await this.profileRepo.save(updatedProfile)
  }

  private async importMemories(userId: string, memories: ExportMemory[]): Promise<void> {
    for (const mem of memories) {
      await this.importSingleMemory(userId, mem)
    }
  }

  private async importSingleMemory(userId: string, mem: ExportMemory): Promise<void> {
    try {
      const embedding = await this.embeddingProvider.embed(mem.text)

      const memory: Memory = {
        id: generateId(),
        text: mem.text,
        embedding,
        metadata: {
          user_id: userId,
          session_id: '',
          platform: 'import',
          type: mem.type as Memory['metadata']['type'],
          importance: mem.importance,
          timestamp: mem.createdAt
        },
        created_at: mem.createdAt,
        last_accessed_at: Date.now(),
        access_count: 0
      }

      await this.memoryRepo.save(memory)
    } catch (error) {
      logger.warn(`[Export] Failed to import memory, skipping: ${error}`)
    }
  }

  private toExportMemory(memory: Memory): ExportMemory {
    return {
      text: memory.text,
      type: memory.metadata.type,
      importance: memory.metadata.importance,
      createdAt: memory.created_at
    }
  }

  private toExportMessage(message: { role: 'user' | 'assistant'; content: string; timestamp: number }): ExportMessage {
    return {
      role: message.role,
      content: message.content,
      timestamp: message.timestamp
    }
  }
}
