import { EmbeddingProvider } from './embedding.provider'
import { withRetry } from '../utils/retry'

const SILICONFLOW_API_URL = 'https://api.siliconflow.cn/v1/embeddings'

export class SiliconFlowEmbedding implements EmbeddingProvider {
  private apiKey: string
  private model: string
  private dimension: number

  constructor(apiKey: string, model = 'BAAI/bge-large-zh-v1.5', dimension = 1024) {
    this.apiKey = apiKey
    this.model = model
    this.dimension = dimension
  }

  getDimension(): number {
    return this.dimension
  }

  async embed(text: string): Promise<number[]> {
    return withRetry(async () => {
      const response = await fetch(SILICONFLOW_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          input: text
        })
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Embedding API error: ${response.status} - ${error}`)
      }

      const data = await response.json() as { data: { embedding: number[] }[] }
      const embedding = data.data[0]?.embedding
      if (embedding === undefined) {
        throw new Error('Embedding API returned empty response')
      }
      return embedding
    })
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // 预留批量接口，当前逐条调用
    return Promise.all(texts.map(t => this.embed(t)))
  }
}
