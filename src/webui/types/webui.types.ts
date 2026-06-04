/**
 * WebUI Shared Types
 *
 * Type definitions shared between WebUI API and frontend.
 * Source of truth: specs/memory-api.md, specs/webui.md
 */

/** 统一 API 响应 */
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}

// ── Memory API Types ──

/** 记忆类型枚举 */
export type MemoryType = 'summary' | 'preference' | 'event' | 'context'

/** 用户摘要（用于下拉列表） */
export interface UserSummary {
  userId: string
  lastSeenAt: number
  lastSeenAtStr: string
}

/** 摘要记忆 */
export interface SummaryMemory {
  id: string
  text: string
  sessionId: string
  createdAt: number
  createdAtStr: string
  keywords: string[]
  importance: number
}

/** 记忆记录（完整） */
export interface MemoryRecord {
  id: string
  userId: string
  sessionId: string
  platform: string
  type: MemoryType
  importance: number
  text: string
  keywords: string[]
  createdAt: number
  createdAtStr: string
  lastAccessedAt: number
  lastAccessedAtStr: string
  accessCount: number
}

/** 记忆统计 */
export interface MemoryStats {
  total: number
  byType: Partial<Record<MemoryType, number>>
}

/** 删除结果 */
export interface DeletionResult {
  memoriesDeleted: number
  messagesDeleted: number
}

/** 导出数据中的记忆条目 */
export interface ExportMemory {
  id: string
  type: string
  text: string
  importance: number
  keywords: string
  sessionId: string
  createdAt: number
  createdAtStr: string
}

/** 导出数据中的消息条目 */
export interface ExportMessage {
  id: string
  sessionId: string
  role: string
  content: string
  timestamp: number
}

/** 导出数据 */
export interface ExportData {
  userId: string
  exportedAt: string
  profile: Record<string, unknown> | null
  memories: ExportMemory[]
  messages: ExportMessage[]
}

/** SQLite 记忆行（原始数据库字段） */
export interface MemoryRow {
  id: string
  user_id: string
  session_id: string
  platform: string
  type: string
  importance: number
  timestamp: number
  text: string
  keywords: string
  created_at: number
  last_accessed_at: number
  access_count: number
  is_latest: number
  key: string
  group_id: string
}
