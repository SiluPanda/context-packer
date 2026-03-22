import type { ScoredChunk, StrategyContext } from '../types.js'
import { greedyStrategy } from './greedy.js'

const KNAPSACK_TOKEN_LIMIT = 5000
const KNAPSACK_CELL_LIMIT = 500_000

export function knapsackStrategy(
  chunks: ScoredChunk[],
  ctx: StrategyContext
): ScoredChunk[] {
  const capacity = Math.ceil(ctx.budget)

  if (capacity > KNAPSACK_TOKEN_LIMIT) {
    return greedyStrategy(chunks, ctx)
  }

  const items = chunks.map(c => ({
    chunk: c,
    tokens: Math.ceil((c.tokens ?? ctx.countTokens(c.content)) + ctx.chunkOverheadTokens),
    score: c.score,
  }))

  if (items.length * capacity > KNAPSACK_CELL_LIMIT) {
    return greedyStrategy(chunks, ctx)
  }
  const n = items.length

  // dp[i][w] = max score using first i items with weight budget w
  // Use 1D rolling array for memory efficiency
  const dp = new Float64Array(capacity + 1)
  // Track selected items per capacity via backtracking table
  const keep: boolean[][] = Array.from({ length: n }, () => new Array(capacity + 1).fill(false))

  for (let i = 0; i < n; i++) {
    const w = items[i].tokens
    const v = items[i].score
    // Traverse capacity backwards to avoid using same item twice
    for (let c = capacity; c >= w; c--) {
      const withItem = dp[c - w] + v
      if (withItem > dp[c]) {
        dp[c] = withItem
        keep[i][c] = true
      }
    }
  }

  // Backtrack to find selected items
  const selected: ScoredChunk[] = []
  let remaining = capacity
  for (let i = n - 1; i >= 0; i--) {
    if (keep[i][remaining]) {
      selected.push(items[i].chunk)
      remaining -= items[i].tokens
    }
  }

  return selected
}
