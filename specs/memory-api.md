# WebUI Memory API 规格说明

## 1. 概述

提供记忆数据的 HTTP 管理接口，供 WebUI 前端调用。支持查看用户列表、浏览记忆内容、导出数据和删除数据。

**设计约束**：
- 只读连接（`readonly: true`）用于查询
- 直接读取 SQLite 数据库，不依赖 MemoryPlugin 实例
- 数据库路径从 `config.yaml` 的 `memory.sqlite.path` 读取

## 2. 接口规格

### 2.1 API 端点

```typescript
/** 记忆管理 API 路由 */
export interface IMemoryApiRoutes {
  /** GET /api/memory/users */
  getUsers(): Promise<ApiResponse<UserSummary[]>>

  /** GET /api/memory/summaries?userId=xxx */
  getSummaries(userId: string): Promise<ApiResponse<SummaryMemory[]>>

  /** GET /api/memory/all?userId=xxx&type=xxx */
  getMemories(userId: string, type?: MemoryType): Promise<ApiResponse<MemoryRecord[]>>

  /** GET /api/memory/stats?userId=xxx */
  getStats(userId: string): Promise<ApiResponse<MemoryStats>>

  /** GET /api/memory/export?userId=xxx */
  exportData(userId: string): Promise<ExportData>

  /** DELETE /api/memory/:id */
  deleteMemory(id: string): Promise<ApiResponse<void>>

  /** DELETE /api/memory/user?userId=xxx */
  deleteAll(userId: string): Promise<ApiResponse<DeletionResult>>
}
```

### 2.2 数据类型

```typescript
/** 用户摘要 */
export interface UserSummary {
  userId: string
  lastSeenAt: number
  lastSeenAtStr: string    // zh-CN 格式化时间
}

/** 摘要记忆 */
export interface SummaryMemory {
  id: string
  text: string
  sessionId: string
  createdAt: number
  createdAtStr: string     // zh-CN 格式化时间
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

/** 记忆类型枚举 */
export type MemoryType = 'summary' | 'preference' | 'event' | 'context'

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

/** 用户档案 */
export interface UserProfile {
  userId: string
  basicInfo: Record<string, unknown>
  preferences: Record<string, unknown>
  habits: Record<string, unknown>
  createdAt: number
  updatedAt: number
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
  exportedAt: string       // ISO 8601
  profile: Record<string, unknown> | null
  memories: ExportMemory[]
  messages: ExportMessage[]
}

/** 统一 API 响应 */
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}
```

### 2.3 接口检查清单

- [x] 接口名有 `I` 前缀
- [x] 方法名遵循命名规范（get/delete）
- [x] 参数风格一致（userId 字符串）
- [x] 返回值类型一致（ApiResponse 包装）
- [x] 与现有 config-api 风格一致

## 3. 核心行为

### 3.1 用户列表

- 当调用 `GET /api/memory/users` 时，从 `user_index` 表查询所有用户
- 结果按 `last_seen_at` 降序排列（最近活跃的在前）
- 每个用户附带格式化的中文时间字符串

### 3.2 摘要查询

- 当调用 `GET /api/memory/summaries?userId=xxx` 时，查询 `type='summary'` 的记忆
- 结果按 `created_at` 降序排列（最新的在前）
- `keywords` 字段从逗号分隔字符串转为数组

### 3.3 全部记忆查询

- 当调用 `GET /api/memory/all?userId=xxx` 时，查询该用户所有记忆
- 可选参数 `type` 用于筛选记忆类型
- 结果按 `created_at` 降序排列

### 3.4 统计

- 当调用 `GET /api/memory/stats?userId=xxx` 时，返回总数和按类型分组的计数

### 3.5 导出

- 当调用 `GET /api/memory/export?userId=xxx` 时，返回完整 JSON 数据
- 响应头包含 `Content-Disposition: attachment` 触发浏览器下载
- 文件名格式：`memory-export-{userId}-{timestamp}.json`

### 3.6 删除单条

- 当调用 `DELETE /api/memory/:id` 时，删除对应记忆
- 删除 0 条时返回 404

### 3.7 清空用户

- 当调用 `DELETE /api/memory/user?userId=xxx` 时，删除该用户所有数据
- 必须同时清理：`memories`、`messages`、`user_profiles`、`user_index` 四张表
- 返回各表删除的行数

## 4. 边界条件

| 场景 | 处理方式 |
|------|----------|
| 数据库文件不存在（查询端点） | 返回空数据（users=[]、memories=[]），不报错 |
| 数据库文件不存在（写操作/导出） | 返回 404 `{ success: false, error: "Memory database not found" }` |
| userId 参数缺失 | 返回 400 `{ success: false, error: "userId is required" }` |
| 删除不存在的记忆 | 返回 404 `{ success: false, error: "Memory not found" }` |
| 数据库只读打开 | 查询使用 `readonly: true` 连接，防止意外写入 |
| 大量记忆数据 | 当前不分页（数据量 < 10000），后续可加 limit/offset |

### 设计说明

- **导出端点**成功时返回裸 `ExportData` 对象（非 `ApiResponse<ExportData>`），因为该端点直接触发浏览器下载，响应体即为文件内容。

## 5. 契约

### 5.1 数据完整性

- **C-1 原子性清空**：清空用户数据时，`memories`、`messages`、`user_profiles`、`user_index` 四表必须全部清理。不允许只删部分表。任一表删除失败时，已删除的数据不回滚（SQLite 无事务 DDL），但必须继续执行剩余表的清理。
- **C-2 关键词一致性**：`keywords` 字段在数据库中存储为逗号分隔字符串，API 响应中必须转为 `string[]`。永远不返回 `null` 或 `undefined`，无关键词时返回空数组 `[]`。
- **C-3 时间字段完整性**：每个时间字段必须同时提供 `number` 时间戳和 `string` 格式化字符串，两者不可缺一。

### 5.2 安全约束

- **C-4 只读连接**：查询端点（GET）必须以 `readonly: true` 模式打开数据库。写操作（DELETE）使用独立的非只读连接。
- **C-5 无数据泄露**：错误消息只包含错误描述，不包含数据库路径、表结构、SQL 语句等内部信息。

### 5.3 排序与筛选

- **C-6 用户列表排序**：`GET /api/memory/users` 结果按 `last_seen_at DESC` 排序，最近活跃用户在前。
- **C-7 记忆列表排序**：`GET /api/memory/summaries` 和 `GET /api/memory/all` 结果按 `created_at DESC` 排序，最新记忆在前。
- **C-8 类型筛选**：`GET /api/memory/all?type=xxx` 必须精确匹配 `type` 字段，不支持模糊匹配。

### 5.4 响应格式

- **C-9 统一包装**：除 `GET /api/memory/export` 外，所有端点的成功和失败响应必须使用 `ApiResponse<T>` 包装。
- **C-10 导出裸数据**：`GET /api/memory/export` 成功时返回裸 `ExportData` 对象（非 `ApiResponse` 包装），因为响应体即为下载文件内容。

## 7. 验收标准

- [ ] 所有端点返回统一 `ApiResponse<T>` 格式
- [ ] 时间字段同时提供时间戳和格式化字符串
- [ ] 只读连接不执行写操作
- [ ] 删除操作有二次确认（前端）
- [ ] 导出文件可被标准 JSON 解析器解析
- [ ] 数据库路径从 config.yaml 读取，支持环境变量 fallback
- [ ] 无硬编码值
