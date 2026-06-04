/**
 * Reciprocal Rank Fusion (RRF)
 *
 * Fuses multiple ranked lists into a single ranking.
 * Based on: "The Impact of Fusion on Retrieval Effectiveness" (Cormack et al., 2004)
 *
 * RRF_score(d) = Σ 1/(k + rank_i(d))
 *
 * k=60 is the standard value from the original paper.
 */

import { RankedResult } from './types'

const DEFAULT_K = 60

/**
 * Fuse multiple ranked result lists using RRF.
 *
 * @param rankings - Array of ranked result arrays (each sorted by relevance, 1-based rank)
 * @param k - RRF parameter (default 60). Smaller k emphasizes top-ranked results more.
 * @returns Map of document ID → RRF score
 */
export function rrfFusion(
  rankings: RankedResult[][],
  k: number = DEFAULT_K
): Map<string, number> {
  const scores = new Map<string, number>()

  for (const ranking of rankings) {
    for (const { id, rank } of ranking) {
      const current = scores.get(id) || 0
      scores.set(id, current + 1.0 / (k + rank))
    }
  }

  return scores
}

/**
 * Convert search results to ranked list (1-based).
 * Input should be sorted by relevance (best first).
 */
export function toRankedResults(ids: string[]): RankedResult[] {
  return ids.map((id, index) => ({ id, rank: index + 1 }))
}
