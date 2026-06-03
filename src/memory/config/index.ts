import dotenv from 'dotenv'
import { AppConfig } from './types'

dotenv.config()

export const config: AppConfig = {
  embedding: {
    apiKey: process.env.SILICONFLOW_API_KEY || '',
    model: 'BAAI/bge-large-zh-v1.5',
    dimension: 1024
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  },
  chromadb: {
    url: process.env.CHROMADB_URL || 'http://localhost:8000'
  },
  sqlite: {
    path: process.env.SQLITE_PATH || './data/memory.db'
  },
  search: {
    maxMemories: 5,
    minScore: 0.3,
    weights: {
      semantic: 0.4,
      keyword: 0.2,
      time: 0.4
    }
  },
  lifecycle: {
    maxMemoriesPerUser: 500,
    summaryTriggerRounds: 15,
    decayRate: 0.99,
    cleanupDaysThreshold: 30,
    cleanupImportanceThreshold: 0.3,
    profileUpdateFrequency: 3,
    sessionCleanupTtlSeconds: 24 * 60 * 60  // 24 hours
  }
}

export * from './types'
