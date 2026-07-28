import { IMemoryRepository } from '../storage/interfaces.js'
import { IEmbeddingProvider } from '../providers/embedding.provider.js'
import { BM25Service } from '../search/bm25.service.js'
import { rrfFusion, toRankedResults } from '../search/rrf.js'
import { LRUCache } from '../cache/lru.cache.js'
import { SearchResult, SearchOptions } from '../types/search.types.js'
import { config } from '../config/index.js'

const CACHE_TTL = 5 * 60 * 1000 // 5 minutes
const CACHE_KEY_SEPARATOR = '\x00'
const RRF_K = 60

export class SearchService {
  private cache: LRUCache<string, SearchResult[]>

  constructor(
    private memoryRepo: IMemoryRepository,
    private embeddingProvider: IEmbeddingProvider,
    private bm25Service: BM25Service,
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

    // 2. Parallel: vector search + BM25 search
    const [vectorResults, bm25Results] = await Promise.all([
      this.vectorSearch(query, userId, sessionId, options),
      this.bm25Search(query, userId, options),
    ])

    // 3. RRF fusion
    const fusedResults = this.rrfScore(vectorResults, bm25Results, Date.now())

    // 4. Apply timeRange filter if specified
    let filteredResults = fusedResults
    if (options.timeRange) {
      const { start, end } = options.timeRange
      filteredResults = fusedResults.filter(r =>
        r.metadata.timestamp >= start && r.metadata.timestamp <= end
      )
    }

    // 5. Sort by score and truncate
    const sortedResults = filteredResults
      .sort((a, b) => b.score - a.score)
      .slice(0, options.limit)

    // 6. Cache results
    this.cache.set(cacheKey, sortedResults)

    return sortedResults
  }

  /**
   * Vector similarity search via vectra
   */
  private async vectorSearch(
    query: string,
    userId: string,
    sessionId: string,
    options: SearchOptions
  ): Promise<SearchResult[]> {
    try {
      const queryEmbedding = await this.embeddingProvider.embed(query)

      return await this.memoryRepo.query({
        embedding: queryEmbedding,
        userId,
        sessionId: options.includeOtherSessions ? undefined : sessionId,
        limit: options.limit * 3,
      })
    } catch (error) {
      // Vector search failed, will rely on BM25 only
      return []
    }
  }

  /**
   * BM25 keyword search via FTS5
   */
  private bm25Search(
    query: string,
    userId: string,
    options: SearchOptions
  ): Promise<SearchResult[]> {
    try {
      const bm25Results = this.bm25Service.search(userId, query, options.limit * 3)

      // BM25 results don't have full memory data, so we need to fetch from repo
      // For now, return minimal SearchResult with just id and score
      // The rrfScore method will merge with vector results that have full data
      return Promise.resolve(
        bm25Results.map(r => ({
          id: r.id,
          text: '', // Will be filled from vector results or by findById
          score: 0, // Will be replaced by RRF score
          metadata: {
            user_id: userId,
            session_id: '',
            platform: '',
            type: 'context' as const,
            importance: 0,
            timestamp: 0,
          },
        }))
      )
    } catch (error) {
      return Promise.resolve([])
    }
  }

  /**
   * Fuse vector and BM25 results using RRF, then apply importance and time decay
   */
  private rrfScore(
    vectorResults: SearchResult[],
    bm25Results: SearchResult[],
    now: number
  ): SearchResult[] {
    const { rrf: rrfWeight, importance: importanceWeight, time: timeWeight } = config.search.weights

    // Build ranked lists for RRF
    const vectorRanking = toRankedResults(vectorResults.map(r => r.id))
    const bm25Ranking = toRankedResults(bm25Results.map(r => r.id))

    // Filter out empty rankings
    const rankings = [vectorRanking, bm25Ranking].filter(r => r.length > 0)

    if (rankings.length === 0) {
      return []
    }

    // RRF fusion
    const rrfScores = rrfFusion(rankings, RRF_K)

    // Build a lookup for full result data (prefer vector results for metadata)
    const resultLookup = new Map<string, SearchResult>()
    for (const r of vectorResults) {
      resultLookup.set(r.id, r)
    }
    for (const r of bm25Results) {
      if (!resultLookup.has(r.id)) {
        resultLookup.set(r.id, r)
      }
    }

    // Normalize RRF scores to 0-1 range
    const maxRrf = Math.max(...rrfScores.values())

    // Compute final scores
    const results: SearchResult[] = []

    for (const [id, rrfScore] of rrfScores) {
      const original = resultLookup.get(id)
      if (!original) continue

      const normalizedRrf = maxRrf > 0 ? rrfScore / maxRrf : 0

      // Importance score
      const importanceScore = original.metadata.importance || 0

      // Time decay (exponential)
      const daysSinceCreation = (now - original.metadata.timestamp) / (1000 * 60 * 60 * 24)
      const timeDecayScore = Math.exp(-0.1 * daysSinceCreation)

      // Final weighted score
      const finalScore =
        rrfWeight * normalizedRrf +
        importanceWeight * importanceScore +
        timeWeight * timeDecayScore

      results.push({
        ...original,
        score: finalScore,
      })
    }

    return results
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
