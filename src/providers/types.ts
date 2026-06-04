/**
 * Unified provider configuration types
 */

export type ProviderType = 'openai' | 'ollama'

export interface ModelConfig {
  id: string
  purpose?: 'llm' | 'embedding' | 'both'
  dimension?: number   // For embedding models
  maxTokens?: number   // For LLM models
}

export interface ProviderConfig {
  id: string
  type: ProviderType
  baseUrl: string
  apiKey?: string
  models?: ModelConfig[]
  defaultModel?: string
}

export interface ProvidersDefaults {
  llm?: { providerId: string; modelId: string }
  embedding?: { providerId: string; modelId: string; dimension?: number }
}

export interface ProvidersConfig {
  list: ProviderConfig[]
  defaults: ProvidersDefaults
}
