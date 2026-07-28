import { Memory, Message, Session, UserProfile, SearchResult, ProfileValue } from '../types/index.js'

// Re-export ProfileValue for convenience
export type { ProfileValue }

// Where clause for filtering
export interface WhereClause {
  [key: string]: string | number | boolean | {
    $eq?: string | number | boolean
    $ne?: string | number | boolean
    $gt?: number
    $gte?: number
    $lt?: number
    $lte?: number
    $in?: (string | number | boolean)[]
    $nin?: (string | number | boolean)[]
  }
}

export interface IMessageRepository {
  save(message: Message): Promise<void>
  findById(id: string): Promise<Message | null>
  findBySession(sessionId: string, limit: number): Promise<Message[]>
  findByUser(userId: string, limit: number): Promise<Message[]>
  countBySession(sessionId: string): Promise<number>
  updateSummarized(id: string, summarized: boolean): Promise<void>
  deleteOldestSummarized(sessionId: string, count: number): Promise<number>
  deleteBySession(sessionId: string): Promise<void>
}

export interface ISessionRepository {
  save(session: Session): Promise<void>
  findById(id: string): Promise<Session | null>
  findActiveByUser(userId: string): Promise<Session[]>
  updateLastActive(id: string): Promise<void>
  deleteExpired(ttlSeconds: number): Promise<number>
  deleteById(id: string): Promise<void>
}

export interface IProfileRepository {
  save(profile: UserProfile): Promise<void>
  findById(userId: string): Promise<UserProfile | null>
  updateField(userId: string, field: string, value: ProfileValue): Promise<void>
  delete(userId: string): Promise<void>
}

export interface IMemoryRepository {
  save(memory: Memory): Promise<void>
  findById(id: string): Promise<Memory | null>
  query(params: {
    embedding: number[]
    userId: string
    sessionId?: string
    limit: number
    where?: WhereClause
  }): Promise<SearchResult[]>
  update(id: string, data: Partial<Memory>): Promise<void>
  delete(id: string): Promise<void>
  deleteByUser(userId: string): Promise<number>
  countByUser(userId: string): Promise<number>
  getAll(userId: string): Promise<Memory[]>
  findByKey(userId: string, key: string): Promise<Memory[]>
  findByTimeRange(userId: string, startTime: number, endTime: number): Promise<Memory[]>
  findByType(userId: string, type: string): Promise<Memory[]>
  deleteByTimeRange(userId: string, startTime: number, endTime: number): Promise<number>
  deleteByType(userId: string, type: string): Promise<number>
}

export interface ISummaryRepository {
  getLastSummarizedIndex(sessionId: string): Promise<number>
  updateLastSummarizedIndex(sessionId: string, index: number): Promise<void>
}

export interface IUserIndexRepository {
  upsert(userId: string): Promise<void>
  getAllUserIds(): Promise<string[]>
  delete(userId: string): Promise<void>
}
