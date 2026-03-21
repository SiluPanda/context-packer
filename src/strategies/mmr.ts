import type { ScoredChunk, StrategyContext } from '../types.js'
import { chunkSimilarity } from '../similarity.js'

export function mmrStrategy(
  chunks: ScoredChunk[],
  lambda: number,
  ctx: StrategyContext
): ScoredChunk[] {
  if (chunks.length === 0) return []

  const metric = ctx.options.similarityMetric ?? 'auto'
  const remaining = [...chunks]
  const selected: ScoredChunk[] = []
  let tokensUsed = 0

  while (remaining.length > 0) {
    let bestScore = -Infinity
    let bestIdx = -1

    for (let i = 0; i < remaining.length; i++) {
      const chunk = remaining[i]
      const chunkTokens = (chunk.tokens ?? ctx.countTokens(chunk.content)) + ctx.chunkOverheadTokens

      if (tokensUsed + chunkTokens > ctx.budget) continue

      const relevance = chunk.score
      let maxSim = 0

      if (selected.length > 0) {
        for (const sel of selected) {
          const sim = chunkSimilarity(chunk, sel, metric)
          if (sim > maxSim) maxSim = sim
        }
      }

      const mmrScore = lambda * relevance - (1 - lambda) * maxSim

      if (mmrScore > bestScore) {
        bestScore = mmrScore
        bestIdx = i
      }
    }

    if (bestIdx === -1) break

    const chosen = remaining[bestIdx]
    selected.push(chosen)
    tokensUsed += (chosen.tokens ?? ctx.countTokens(chosen.content)) + ctx.chunkOverheadTokens
    remaining.splice(bestIdx, 1)
  }

  return selected
}
