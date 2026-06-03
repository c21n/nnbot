import { MemoryMetadata } from './memory.types'

export interface SearchResult {
  id: string
  text: string
  score: number
  metadata: MemoryMetadata
}

export interface SearchOptions {
  limit: number
  includeOtherSessions?: boolean
  timeRange?: { start: number; end: number }
}
