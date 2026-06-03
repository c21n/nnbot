// Memory
export interface Memory {
  id: string
  text: string
  embedding?: number[]
  metadata: MemoryMetadata
  created_at: number
  last_accessed_at: number
  access_count: number
}

export type MemoryType = 'preference' | 'event' | 'context' | 'summary'

export interface MemoryMetadata {
  user_id: string
  session_id: string
  group_id?: string
  platform: string
  type: MemoryType
  importance: number
  timestamp: number
  keywords?: string[]
  is_latest?: boolean
  key?: string
}

// Message
export interface Message {
  id: string
  session_id: string
  user_id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  summarized?: boolean
}

// Session
export interface Session {
  id: string
  user_id: string
  platform: string
  group_id?: string
  created_at: number
  last_active_at: number
}

// User Profile
export interface UserProfile {
  user_id: string
  basic_info: {
    name?: string
    gender?: string
    city?: string
  }
  preferences: {
    likes: string[]
    dislikes: string[]
    [key: string]: string | string[] | boolean | number
  }
  habits: {
    [key: string]: string | boolean | number
  }
  created_at: number
  updated_at: number
}

// Chat Message (for LLM)
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}
