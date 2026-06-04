/**
 * ProviderManager - Unified provider management
 *
 * Central registry for all model providers (LLM + Embedding).
 * Modules use this to get providers by purpose (default) or by explicit ID.
 */

import { OpenAICompatibleEmbedding } from './embedding-adapter.js'
import { OpenAICompatibleLLM } from './llm-adapter.js'
import type { ProviderConfig, ProvidersConfig, ProvidersDefaults } from './types.js'
import type { IEmbeddingProvider } from '../memory/providers/embedding.provider.js'
import type { ILLMProvider } from '../memory/providers/llm.provider.js'
import { OpenAICompatibleService } from '../services/llm/openai.js'

export class ProviderManager {
  private providers = new Map<string, ProviderConfig>()
  private defaults: ProvidersDefaults = {}
  // Cache for main LLM service (ILLMService)
  private llmServiceCache = new Map<string, OpenAICompatibleService>()

  constructor(config: ProvidersConfig) {
    for (const provider of config.list) {
      this.providers.set(provider.id, provider)
    }
    this.defaults = config.defaults
  }

  // ───── LLM (memory module interface: chat + summarize) ─────

  /**
   * Get LLM provider for memory/chat use.
   * @param providerId - Explicit provider ID, or use system default
   * @param modelId - Explicit model ID, or use provider's default
   */
  getLLM(providerId?: string, modelId?: string): ILLMProvider {
    const config = this.resolveProvider(providerId, 'llm')
    const model = modelId || this.getDefaultModel(config, 'llm')

    if (config.type === 'ollama') {
      // Ollama uses OpenAI-compatible endpoint at /v1
      const baseUrl = config.baseUrl.replace(/\/+$/, '') + '/v1'
      return new OpenAICompatibleLLM(baseUrl, config.apiKey || '', model)
    }

    return new OpenAICompatibleLLM(config.baseUrl, config.apiKey || '', model)
  }

  // ───── Embedding ─────

  /**
   * Get Embedding provider.
   * @param providerId - Explicit provider ID, or use system default
   * @param modelId - Explicit model ID, or use provider's default
   */
  getEmbedding(providerId?: string, modelId?: string): IEmbeddingProvider {
    const config = this.resolveProvider(providerId, 'embedding')
    const model = modelId || this.getDefaultModel(config, 'embedding')
    const dimension = this.getDefaultDimension(config, model)

    if (config.type === 'ollama') {
      const baseUrl = config.baseUrl.replace(/\/+$/, '') + '/v1'
      return new OpenAICompatibleEmbedding(baseUrl, config.apiKey || '', model, dimension)
    }

    return new OpenAICompatibleEmbedding(config.baseUrl, config.apiKey || '', model, dimension)
  }

  // ───── Main LLM Service (ILLMService - for bot.ts) ─────

  /**
   * Get the main LLM service (ILLMService with chatStream, tool support).
   * Used by bot.ts for the primary chat LLM.
   */
  getLLMService(providerId?: string): OpenAICompatibleService {
    const config = this.resolveProvider(providerId, 'llm')
    const model = this.getDefaultModel(config, 'llm')
    const cacheKey = `${config.id}:${model}`

    if (this.llmServiceCache.has(cacheKey)) {
      return this.llmServiceCache.get(cacheKey)!
    }

    const baseUrl = config.type === 'ollama'
      ? config.baseUrl.replace(/\/+$/, '') + '/v1'
      : config.baseUrl

    const service = new OpenAICompatibleService(baseUrl, config.apiKey || '', {
      model,
      temperature: 0.7,
    })

    this.llmServiceCache.set(cacheKey, service)
    return service
  }

  // ───── Management ─────

  listProviders(): ProviderConfig[] {
    return Array.from(this.providers.values())
  }

  getProvider(id: string): ProviderConfig | undefined {
    return this.providers.get(id)
  }

  getDefaults(): ProvidersDefaults {
    return { ...this.defaults }
  }

  // ───── Private helpers ─────

  private resolveProvider(providerId: string | undefined, purpose: 'llm' | 'embedding'): ProviderConfig {
    const id = providerId || this.defaults[purpose]?.providerId

    if (!id) {
      const available = Array.from(this.providers.keys()).join(', ')
      throw new Error(
        `No ${purpose} provider configured. Available: [${available}]. ` +
        `Set providers.defaults.${purpose}.providerId or pass providerId explicitly.`
      )
    }

    const config = this.providers.get(id)
    if (!config) {
      const available = Array.from(this.providers.keys()).join(', ')
      throw new Error(
        `Provider "${id}" not found. Available: [${available}]`
      )
    }

    return config
  }

  private getDefaultModel(config: ProviderConfig, purpose: 'llm' | 'embedding'): string {
    // Check defaults config
    const defaultConfig = this.defaults[purpose]
    if (defaultConfig && defaultConfig.providerId === config.id) {
      return defaultConfig.modelId
    }

    // Check provider's models list
    if (config.models && config.models.length > 0) {
      const purposeModel = config.models.find(
        m => m.purpose === purpose || m.purpose === 'both'
      )
      if (purposeModel) return purposeModel.id
      return config.models[0].id
    }

    // Check provider's defaultModel
    if (config.defaultModel) return config.defaultModel

    throw new Error(
      `No model configured for provider "${config.id}" (${purpose}). ` +
      `Set providers.defaults.${purpose}.modelId or add models to the provider config.`
    )
  }

  private getDefaultDimension(config: ProviderConfig, modelId: string): number {
    // Check defaults config
    const defaultConfig = this.defaults.embedding
    if (defaultConfig?.dimension) return defaultConfig.dimension

    // Check provider's models list
    const model = config.models?.find(m => m.id === modelId)
    if (model?.dimension) return model.dimension

    // Default for common models
    return 1024
  }
}
