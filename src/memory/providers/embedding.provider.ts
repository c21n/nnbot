export interface IEmbeddingProvider {
  embed(text: string): Promise<number[]>
  embedBatch?(texts: string[]): Promise<number[][]>
  getDimension(): number
}

/** @deprecated Use IEmbeddingProvider instead */
export type EmbeddingProvider = IEmbeddingProvider
