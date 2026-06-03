import { IMemoryRepository } from '../storage/interfaces'
import { IEmbeddingProvider } from '../providers/embedding.provider'
import { LRUCache } from '../cache/lru.cache'
import { SearchResult, SearchOptions } from '../types/search.types'
import { config } from '../config'

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const CACHE_KEY_SEPARATOR = '\x00'

export class SearchService {
  private cache: LRUCache<string, SearchResult[]>

  constructor(
    private memoryRepo: IMemoryRepository,
    private embeddingProvider: IEmbeddingProvider,
    cacheMaxSize = 100
  ) {
    this.cache = new LRUCache<string, SearchResult[]>(cacheMaxSize, CACHE_TTL)
  }

  async search(
    query: string,
    userId: string,
    sessionId: string,
    options: SearchOptions = { limit: config.search.maxMemories }
  ): Promise<SearchResult[]> {
    // 1. Check cache
    const cacheKey = this.buildCacheKey(userId, query, options)
    const cached = this.cache.get(cacheKey)
    if (cached) {
      return cached
    }

    // 2. Get query embedding
    const queryEmbedding = await this.embeddingProvider.embed(query)

    // 3. Query memories from ChromaDB
    const rawResults = await this.memoryRepo.query({
      embedding: queryEmbedding,
      userId,
      sessionId: options.includeOtherSessions ? undefined : sessionId,
      limit: options.limit * 3 // Fetch more for hybrid scoring
    })

    // 4. Apply hybrid scoring
    const scoredResults = this.hybridScore(rawResults, query, Date.now())

    // 5. Apply timeRange filter if specified
    let filteredResults = scoredResults
    if (options.timeRange) {
      const { start, end } = options.timeRange
      filteredResults = scoredResults.filter(r =>
        r.metadata.timestamp >= start && r.metadata.timestamp <= end
      )
    }

    // 6. Sort by score and truncate
    const sortedResults = filteredResults
      .sort((a, b) => b.score - a.score)
      .slice(0, options.limit)

    // 7. Cache results
    this.cache.set(cacheKey, sortedResults)

    return sortedResults
  }

  private hybridScore(
    results: SearchResult[],
    query: string,
    now: number
  ): SearchResult[] {
    const { semantic: semanticWeight, keyword: keywordWeight, time: timeWeight } =
      config.search.weights

    return results.map((r) => {
      // Semantic score (already 0-1)
      const semanticScore = r.score

      // Keyword score: check if query appears in text
      const queryLower = query.toLowerCase()
      const textLower = r.text.toLowerCase()
      const keywordScore = textLower.includes(queryLower) ? 1.0 : 0.2

      // Time decay (exponential decay)
      const daysSinceCreation = (now - r.metadata.timestamp) / (1000 * 60 * 60 * 24)
      const timeDecayScore = Math.exp(-0.1 * daysSinceCreation)

      // Weighted hybrid score
      const finalScore =
        semanticWeight * semanticScore +
        keywordWeight * keywordScore +
        timeWeight * timeDecayScore

      return { ...r, score: finalScore }
    })
  }

  private buildCacheKey(
    userId: string,
    query: string,
    options: SearchOptions
  ): string {
    return [
      userId,
      query,
      String(options.limit),
      String(options.includeOtherSessions ?? false),
      options.timeRange ? `${options.timeRange.start}-${options.timeRange.end}` : ''
    ].join(CACHE_KEY_SEPARATOR)
  }

  /**
   * Clear all cache
   */
  clearCache(): void {
    this.cache.clear()
  }
}
