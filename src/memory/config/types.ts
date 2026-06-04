export interface EmbeddingConfig {
  apiKey: string
  model: string
  dimension: number
}

export interface RedisConfig {
  url: string
}

export interface SqliteConfig {
  path: string
}

export interface SearchConfig {
  maxMemories: number
  minScore: number
  weights: {
    semantic: number
    keyword: number
    time: number
  }
}

export interface LifecycleConfig {
  maxMemoriesPerUser: number
  summaryTriggerRounds: number
  decayRate: number
  cleanupDaysThreshold: number
  cleanupImportanceThreshold: number
  profileUpdateFrequency: number  // 每 N 轮对话更新一次画像，默认 3
  sessionCleanupTtlSeconds: number  // Session 过期时间，默认 24 小时
}

export interface AppConfig {
  embedding: EmbeddingConfig
  redis: RedisConfig
  sqlite: SqliteConfig
  search: SearchConfig
  lifecycle: LifecycleConfig
}
