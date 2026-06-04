/**
 * Types for hybrid search with RRF fusion
 */

/** Result from BM25 keyword search */
export interface BM25Result {
  id: string
  score: number  // BM25 rank (negative, higher = more relevant)
}

/** A ranked list of result IDs (1-based rank) */
export interface RankedResult {
  id: string
  rank: number
}

/** RRF fusion configuration */
export interface RRFConfig {
  k: number  // Default 60, from the original RRF paper
}
