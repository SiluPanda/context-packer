import type { ScoredChunk, StrategyContext } from '../types.js'

export function greedyStrategy(
  chunks: ScoredChunk[],
  ctx: StrategyContext
): ScoredChunk[] {
  const sorted = [...chunks].sort((a, b) => b.score - a.score)
  const selected: ScoredChunk[] = []
  let tokensUsed = 0

  for (const chunk of sorted) {
    const chunkTokens = (chunk.tokens ?? ctx.countTokens(chunk.content)) + ctx.chunkOverheadTokens
    if (tokensUsed + chunkTokens <= ctx.budget) {
      selected.push(chunk)
      tokensUsed += chunkTokens
    }
  }

  return selected
}
