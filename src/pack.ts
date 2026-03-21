import type {
  ScoredChunk,
  PackOptions,
  PackResult,
  PackedChunk,
  PackReport,
  StrategyContext,
  ExcludedChunk,
} from './types.js'
import { PackError } from './errors.js'
import { defaultTokenCounter } from './token-counter.js'
import { deduplicateChunks } from './redundancy.js'
import { greedyStrategy } from './strategies/greedy.js'
import { mmrStrategy } from './strategies/mmr.js'
import { knapsackStrategy } from './strategies/knapsack.js'
import { uShapedOrder } from './ordering/u-shaped.js'

export async function pack(chunks: ScoredChunk[], options: PackOptions): Promise<PackResult> {
  const start = Date.now()

  if (options.budget <= 0) {
    throw new PackError('Budget must be positive', 'INVALID_BUDGET')
  }

  const counter = options.tokenCounter ?? defaultTokenCounter
  const overhead = options.chunkOverheadTokens ?? 0
  const strategy = options.strategy ?? 'greedy'
  const ordering = options.ordering ?? 'natural'

  // 1. Apply maxCandidates cap and assign IDs + token counts
  let candidates: (ScoredChunk & { id: string; tokens: number })[] = (
    options.maxCandidates != null ? chunks.slice(0, options.maxCandidates) : chunks.slice()
  ).map((c, i) => ({
    ...c,
    id: c.id ?? `chunk-${i}`,
    tokens: c.tokens ?? counter(c.content),
  }))

  const allExcluded: ExcludedChunk[] = []

  // Chunks excluded due to maxCandidates
  if (options.maxCandidates != null && chunks.length > options.maxCandidates) {
    for (let i = options.maxCandidates; i < chunks.length; i++) {
      const c = chunks[i]
      allExcluded.push({
        id: c.id ?? `chunk-${i}`,
        content: c.content,
        score: c.score,
        tokens: c.tokens ?? counter(c.content),
        reason: 'max-candidates',
        metadata: c.metadata,
      })
    }
  }

  // 2. Redundancy deduplication
  const threshold = options.redundancyThreshold
  if (threshold != null && threshold < 1.0) {
    const { kept, excluded } = deduplicateChunks(
      candidates,
      threshold,
      options.similarityMetric ?? 'auto'
    )
    candidates = kept as (ScoredChunk & { id: string; tokens: number })[]
    allExcluded.push(...excluded)
  }

  // 3. Strategy selection
  const ctx: StrategyContext = {
    budget: options.budget,
    chunkOverheadTokens: overhead,
    countTokens: counter,
    options,
  }

  let selected: ScoredChunk[]

  switch (strategy) {
    case 'mmr':
      selected = mmrStrategy(candidates, options.lambda ?? 0.5, ctx)
      break
    case 'knapsack':
      selected = knapsackStrategy(candidates, ctx)
      break
    case 'custom':
      if (!options.customStrategy) {
        throw new PackError(
          'customStrategy function required for custom strategy',
          'MISSING_CUSTOM_STRATEGY'
        )
      }
      selected = options.customStrategy(candidates, ctx)
      break
    default:
      selected = greedyStrategy(candidates, ctx)
  }

  // 4. Mark budget-excluded remaining candidates
  const selectedIds = new Set(selected.map(c => c.id))
  for (const c of candidates) {
    if (!selectedIds.has(c.id)) {
      allExcluded.push({
        id: c.id,
        content: c.content,
        score: c.score,
        tokens: c.tokens,
        reason: 'budget',
        metadata: c.metadata,
      })
    }
  }

  // 5. Convert to PackedChunk with initial positions
  let packed: PackedChunk[] = selected.map((c, i) => ({
    id: (c.id as string),
    content: c.content,
    score: c.score,
    tokens: c.tokens ?? counter(c.content),
    position: i,
    metadata: c.metadata,
  }))

  // 6. Reorder
  if (ordering === 'u-shaped') {
    packed = uShapedOrder(packed).map((c, i) => ({ ...c, position: i }))
  } else if (ordering === 'chronological') {
    packed
      .sort((a, b) => ((a.metadata?.timestamp as number) ?? 0) - ((b.metadata?.timestamp as number) ?? 0))
      .forEach((c, i) => { c.position = i })
  }

  // 7. Build report
  const tokensUsed = packed.reduce((s, c) => s + c.tokens + overhead, 0)
  const report: PackReport = {
    tokensUsed,
    budget: options.budget,
    tokensRemaining: options.budget - tokensUsed,
    utilization: tokensUsed / options.budget,
    selectedCount: packed.length,
    excludedCount: allExcluded.length,
    strategy,
    ordering,
    excluded: allExcluded,
    timestamp: new Date().toISOString(),
    durationMs: Date.now() - start,
  }

  return { chunks: packed, report }
}

export function createPacker(config: PackOptions) {
  return {
    pack: (chunks: ScoredChunk[]) => pack(chunks, config),
  }
}
