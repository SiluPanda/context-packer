# context-packer

Optimally pack retrieved chunks into an LLM context window. Supports multiple selection strategies, redundancy deduplication, and positional reordering to counter the "lost-in-the-middle" effect.

## Install

```bash
npm install context-packer
```

Zero external runtime dependencies.

## Quick Start

```typescript
import { pack, createPacker } from 'context-packer'
import type { ScoredChunk } from 'context-packer'

const chunks: ScoredChunk[] = [
  { content: 'Relevant document A', score: 0.92, tokens: 50 },
  { content: 'Relevant document B', score: 0.85, tokens: 40 },
  { content: 'Somewhat relevant C', score: 0.61, tokens: 80 },
]

const { chunks: packed, report } = await pack(chunks, { budget: 100 })

console.log(`Selected ${report.selectedCount} chunks, ${report.tokensUsed}/${report.budget} tokens used`)
```

## Strategies

| Strategy   | Description |
|-----------|-------------|
| `greedy`  | Default. Sort by score descending, take until budget fills. O(n log n). |
| `mmr`     | Maximal Marginal Relevance. Balances relevance and diversity. Tuned by `lambda`. |
| `knapsack`| 0/1 knapsack DP. Maximizes total score within budget. Exact for budgets ≤ 5000 tokens. |
| `custom`  | Provide your own `customStrategy` function. |

### MMR (`strategy: 'mmr'`)

```typescript
const result = await pack(chunks, {
  budget: 4000,
  strategy: 'mmr',
  lambda: 0.7, // 1.0 = pure relevance, 0.0 = pure diversity
})
```

### Knapsack (`strategy: 'knapsack'`)

```typescript
const result = await pack(chunks, {
  budget: 4000,
  strategy: 'knapsack',
})
```

Knapsack considers all combinations and selects the subset with the maximum total score. Falls back to greedy for budgets > 5000 tokens.

### Custom Strategy

```typescript
const result = await pack(chunks, {
  budget: 4000,
  strategy: 'custom',
  customStrategy: (candidates, ctx) => {
    // Your selection logic; return the ScoredChunks you want included
    return candidates.filter(c => c.score > 0.8)
  },
})
```

## Ordering

| Ordering       | Description |
|---------------|-------------|
| `natural`     | Default. Output order matches selection order (score descending). |
| `u-shaped`    | High-score chunks at edges, lower-score in the middle. Counters lost-in-the-middle. |
| `chronological`| Sorted by `metadata.timestamp` ascending. |

```typescript
const result = await pack(chunks, { budget: 4000, ordering: 'u-shaped' })
```

## Redundancy Threshold

Deduplicate near-duplicate chunks before selection. Uses trigram Jaccard similarity by default; cosine similarity when embeddings are provided.

```typescript
const result = await pack(chunks, {
  budget: 4000,
  redundancyThreshold: 0.85, // chunks with similarity >= 0.85 are deduplicated
  similarityMetric: 'auto',  // 'auto' | 'cosine' | 'jaccard'
})
```

Set `redundancyThreshold: 1.0` (or omit) to disable deduplication.

## Full Options

```typescript
interface PackOptions {
  budget: number                   // required: max tokens to fill
  strategy?: 'greedy' | 'mmr' | 'knapsack' | 'custom'  // default: 'greedy'
  lambda?: number                  // MMR diversity weight (0-1), default 0.5
  ordering?: 'natural' | 'u-shaped' | 'chronological'   // default: 'natural'
  redundancyThreshold?: number     // default: 1.0 (no dedup)
  similarityMetric?: 'auto' | 'cosine' | 'jaccard'      // default: 'auto'
  chunkOverheadTokens?: number     // tokens added per chunk (e.g. separator), default 0
  tokenCounter?: (text: string) => number  // default: Math.ceil(text.length / 4)
  maxCandidates?: number           // consider only the first N chunks
  customStrategy?: (chunks: ScoredChunk[], ctx: StrategyContext) => ScoredChunk[]
}
```

## Reusable Packer

```typescript
const packer = createPacker({ budget: 4000, strategy: 'mmr', lambda: 0.7 })

const result1 = await packer.pack(chunksFromQuery1)
const result2 = await packer.pack(chunksFromQuery2)
```

## Pack Report

Every call returns a `PackReport` alongside the selected chunks:

```typescript
interface PackReport {
  tokensUsed: number
  budget: number
  tokensRemaining: number
  utilization: number       // 0-1
  selectedCount: number
  excludedCount: number
  strategy: string
  ordering: string
  excluded: ExcludedChunk[] // reason: 'budget' | 'redundant' | 'max-candidates'
  timestamp: string
  durationMs: number
}
```

## License

MIT
