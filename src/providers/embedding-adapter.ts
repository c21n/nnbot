/**
 * Embedding adapter that calls OpenAI-compatible /v1/embeddings endpoint
 * Implements IEmbeddingProvider from memory module
 */

import type { IEmbeddingProvider } from '../memory/providers/embedding.provider.js'

export class OpenAICompatibleEmbedding implements IEmbeddingProvider {
  private readonly baseUrl: string
  private readonly apiKey: string
  private readonly model: string
  private readonly dimension: number

  constructor(baseUrl: string, apiKey: string, model: string, dimension: number) {
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.apiKey = apiKey
    this.model = model
    this.dimension = dimension
  }

  async embed(text: string): Promise<number[]> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
      }),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Embedding API error ${response.status}: ${body}`)
    }

    const data = await response.json() as { data: { embedding: number[] }[] }
    return data.data[0].embedding
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Embedding batch API error ${response.status}: ${body}`)
    }

    const data = await response.json() as { data: { embedding: number[] }[] }
    return data.data.map(d => d.embedding)
  }

  getDimension(): number {
    return this.dimension
  }
}
