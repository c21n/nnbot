/**
 * Type guard utilities for runtime type checking
 * Used to verify interface compliance at runtime
 */

import { Memory, MemoryMetadata, MemoryType, Message, Session, UserProfile } from '../types'
import { SearchResult } from '../types/search.types'

// Memory type guards
export function isMemory(obj: any): obj is Memory {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.id === 'string' &&
    typeof obj.text === 'string' &&
    typeof obj.created_at === 'number' &&
    typeof obj.last_accessed_at === 'number' &&
    typeof obj.access_count === 'number' &&
    isMemoryMetadata(obj.metadata)
  )
}

export function isMemoryMetadata(obj: any): obj is MemoryMetadata {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.user_id === 'string' &&
    typeof obj.session_id === 'string' &&
    typeof obj.platform === 'string' &&
    isMemoryType(obj.type) &&
    typeof obj.importance === 'number' &&
    typeof obj.timestamp === 'number'
  )
}

export function isMemoryType(value: any): value is MemoryType {
  return ['preference', 'event', 'context', 'summary'].includes(value)
}

// Message type guard
export function isMessage(obj: any): obj is Message {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.id === 'string' &&
    typeof obj.session_id === 'string' &&
    typeof obj.user_id === 'string' &&
    (obj.role === 'user' || obj.role === 'assistant') &&
    typeof obj.content === 'string' &&
    typeof obj.timestamp === 'number'
  )
}

// Session type guard
export function isSession(obj: any): obj is Session {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.id === 'string' &&
    typeof obj.user_id === 'string' &&
    typeof obj.platform === 'string' &&
    typeof obj.created_at === 'number' &&
    typeof obj.last_active_at === 'number'
  )
}

// UserProfile type guard
export function isUserProfile(obj: any): obj is UserProfile {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.user_id === 'string' &&
    typeof obj.basic_info === 'object' &&
    typeof obj.preferences === 'object' &&
    typeof obj.habits === 'object' &&
    typeof obj.created_at === 'number' &&
    typeof obj.updated_at === 'number'
  )
}

// SearchResult type guard
export function isSearchResult(obj: any): obj is SearchResult {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    typeof obj.id === 'string' &&
    typeof obj.text === 'string' &&
    typeof obj.score === 'number' &&
    isMemoryMetadata(obj.metadata)
  )
}

// Array type guards
export function isMemoryArray(arr: any[]): arr is Memory[] {
  return arr.every(isMemory)
}

export function isSearchResultArray(arr: any[]): arr is SearchResult[] {
  return arr.every(isSearchResult)
}
