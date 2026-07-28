import { UserProfile } from './memory.types.js'

export interface ExportMemory {
  text: string
  type: string
  importance: number
  createdAt: number
}

export interface ExportMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface ExportData {
  version: string
  exportTime: number
  userId: string
  profile: UserProfile | null
  memories: ExportMemory[]
  messages: ExportMessage[]
}
