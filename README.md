# context-packer

Budget-aware, diversity-maximizing chunk packing for LLM context windows.

[![npm version](https://img.shields.io/npm/v/context-packer.svg)](https://www.npmjs.com/package/context-packer)
[![license](https://img.shields.io/npm/l/context-packer.svg)](https://github.com/SiluPanda/context-packer/blob/master/LICENSE)
[![node](https://img.shields.io/node/v/context-packer.svg)](https://nodejs.org/)

---

## Description

`context-packer` selects and arranges the optimal subset of retrieved chunks to fit within a fixed token budget. Every RAG pipeline must decide which chunks to include, how many tokens they consume, and in what order to place them. This package solves all three problems in a single API call.

The library provides multiple selection strategies (greedy, MMR, knapsack, custom), redundancy deduplication via configurable similarity thresholds, and positional reordering to counter the "lost-in-the-middle" effect documented by Liu et al. (2023). Every call returns a structured `PackReport` explaining exactly which chunks were selected or excluded and why.

Zero runtime dependencies. Written in TypeScript with full type exports.

---

## Installation

```bash
npm install context-packer
```

Requires Node.js 18 or later.

---

## Quick Start

```typescript
import { pack } from 'context-packer'
import type { ScoredChunk } from 'context-packer'

const chunks: ScoredChunk[] = [
  { content: 'Relevant document about authentication', score: 0.92, tokens: 50 },
  { content: 'Relevant document about authorization',  score: 0.85, tokens: 40 },
  { content: 'Tangentially related document',          score: 0.61, tokens: 80 },
]

const { chunks: packed, report } = await pack(chunks, { budget: 100 })

console.log(report.selectedCount)    // 2
console.log(report.tokensUsed)       // 90
console.log(report.tokensRemaining)  // 10
console.log(report.utilization)      // 0.9
```

---

## Features

- **Multiple selection strategies** -- Greedy, Maximal Marginal Relevance (MMR), 0/1 knapsack dynamic programming, and custom strategy support.
- **Redundancy deduplication** -- Filters near-duplicate chunks before selection using trigram Jaccard similarity or cosine similarity over embedding vectors.
- **Positional reordering** -- U-shaped ordering places high-relevance chunks at the beginning and end of the context, countering the lost-in-the-middle effect.
- **Hard token budget enforcement** -- Total token count of selected chunks never exceeds the budget, inclusive of configurable per-chunk overhead.
- **Pluggable token counter** -- Ships with a character-based approximation (`Math.ceil(text.length / 4)`). Swap in tiktoken, gpt-tokenizer, or any other counter.
- **Structured pack reports** -- Every call returns a `PackReport` with utilization metrics, excluded chunk reasons, timing, and strategy metadata.
- **Factory pattern** -- `createPacker` produces a reusable packer instance with fixed configuration for repeated use across queries.
- **Zero runtime dependencies** -- No production dependencies to audit or maintain.
- **Full TypeScript support** -- Ships with declaration files and source maps.

---

## API Reference

### `pack(chunks, options)`

Selects and orders the best subset of chunks that fit within the token budget.

```typescript
function pack(chunks: ScoredChunk[], options: PackOptions): Promise<PackResult>
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `chunks` | `ScoredChunk[]` | Array of retrieved chunks with relevance scores. |
| `options` | `PackOptions` | Packing configuration including budget, strategy, and ordering. |

**Returns:** `Promise<PackResult>` containing the selected `chunks` array and a `report`.

**Example:**

```typescript
const result = await pack(chunks, {
  budget: 4000,
  strategy: 'mmr',
  lambda: 0.7,
  ordering: 'u-shaped',
  redundancyThreshold: 0.85,
})
```

---

### `createPacker(config)`

Creates a reusable packer instance with fixed configuration.

```typescript
function createPacker(config: PackOptions): { pack: (chunks: ScoredChunk[]) => Promise<PackResult> }
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `config` | `PackOptions` | Fixed packing configuration applied to every call. |

**Returns:** An object with a `pack` method that accepts only a `ScoredChunk[]` array.

**Example:**

```typescript
const packer = createPacker({ budget: 4000, strategy: 'mmr', lambda: 0.7 })

const result1 = await packer.pack(chunksFromQuery1)
const result2 = await packer.pack(chunksFromQuery2)
```

---

### `PackError`

Custom error class thrown for invalid configurations.

```typescript
class PackError extends Error {
  readonly code: string
  readonly details?: Record<string, unknown>
}
```

**Error codes:**

| Code | Condition |
|------|-----------|
| `INVALID_BUDGET` | `budget` is zero or negative. |
| `MISSING_CUSTOM_STRATEGY` | `strategy` is `'custom'` but no `customStrategy` function was provided. |

---

### `ScoredChunk`

Input chunk interface representing a retrieved document segment.

```typescript
interface ScoredChunk {
  content: string                      // The chunk text
  score: number                        // Relevance score (typically 0-1, higher is better)
  id?: string                          // Unique identifier (auto-generated as "chunk-N" if omitted)
  tokens?: number                      // Pre-computed token count (skips token counting if provided)
  embedding?: number[]                 // Embedding vector (enables cosine similarity for MMR/dedup)
  metadata?: Record<string, unknown>   // Arbitrary metadata (e.g., sourceId, timestamp, url)
}
```

---

### `PackedChunk`

Output chunk interface for each selected chunk in the result.

```typescript
interface PackedChunk {
  id: string                           // Chunk identifier
  content: string                      // The chunk text
  score: number                        // Original relevance score
  tokens: number                       // Token count
  position: number                     // Zero-based position in the ordered output
  metadata?: Record<string, unknown>   // Preserved metadata from the input chunk
}
```

---

### `ExcludedChunk`

Describes a chunk that was not selected, along with the reason for exclusion.

```typescript
interface ExcludedChunk {
  id: string
  content: string
  score: number
  tokens: number
  reason: 'budget' | 'redundant' | 'strategy' | 'max-candidates'
  redundantWith?: string               // ID of the chunk this was redundant with
  similarity?: number                  // Similarity score that triggered redundancy exclusion
  metadata?: Record<string, unknown>
}
```

**Exclusion reasons:**

| Reason | Description |
|--------|-------------|
| `budget` | Chunk did not fit within the remaining token budget. |
| `redundant` | Chunk exceeded the similarity threshold compared to a higher-scored chunk. |
| `strategy` | Chunk was excluded by the selection strategy. |
| `max-candidates` | Chunk was beyond the `maxCandidates` cutoff. |

---

### `PackOptions`

Full configuration interface for `pack()` and `createPacker()`.

```typescript
interface PackOptions {
  budget: number
  strategy?: 'greedy' | 'mmr' | 'knapsack' | 'coverage' | 'custom'
  lambda?: number
  ordering?: 'natural' | 'u-shaped' | 'chronological'
  redundancyThreshold?: number
  similarityMetric?: 'auto' | 'cosine' | 'jaccard'
  chunkOverheadTokens?: number
  tokenCounter?: (text: string) => number
  maxCandidates?: number
  customStrategy?: (chunks: ScoredChunk[], ctx: StrategyContext) => ScoredChunk[]
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `budget` | `number` | *required* | Maximum total tokens for the packed context. |
| `strategy` | `string` | `'greedy'` | Selection strategy. One of `'greedy'`, `'mmr'`, `'knapsack'`, `'custom'`. |
| `lambda` | `number` | `0.5` | MMR trade-off parameter. `1.0` = pure relevance, `0.0` = pure diversity. |
| `ordering` | `string` | `'natural'` | Output ordering strategy. One of `'natural'`, `'u-shaped'`, `'chronological'`. |
| `redundancyThreshold` | `number` | `undefined` | Similarity threshold for deduplication. Chunks with similarity >= threshold are removed. Set to `1.0` or omit to disable. |
| `similarityMetric` | `string` | `'auto'` | Similarity function. `'auto'` uses cosine when embeddings are present, Jaccard otherwise. |
| `chunkOverheadTokens` | `number` | `0` | Extra tokens charged per chunk (separators, citation markers, etc.). |
| `tokenCounter` | `function` | `Math.ceil(text.length / 4)` | Custom token counting function. |
| `maxCandidates` | `number` | `undefined` | Limit the number of input chunks considered. Excess chunks are excluded with reason `'max-candidates'`. |
| `customStrategy` | `function` | `undefined` | Required when `strategy` is `'custom'`. Receives candidates and a `StrategyContext`, returns selected chunks. |

---

### `StrategyContext`

Context object passed to custom strategy functions.

```typescript
interface StrategyContext {
  budget: number                             // Token budget
  chunkOverheadTokens: number                // Per-chunk overhead
  countTokens: (text: string) => number      // Active token counter function
  options: PackOptions                       // Full options object
}
```

---

### `PackReport`

Structured report returned with every pack result.

```typescript
interface PackReport {
  tokensUsed: number          // Total tokens consumed by selected chunks (including overhead)
  budget: number              // The token budget that was provided
  tokensRemaining: number     // budget - tokensUsed
  utilization: number         // tokensUsed / budget (range 0-1)
  selectedCount: number       // Number of chunks selected
  excludedCount: number       // Number of chunks excluded
  strategy: string            // Strategy that was used
  ordering: string            // Ordering that was applied
  excluded: ExcludedChunk[]   // Details on every excluded chunk
  timestamp: string           // ISO 8601 timestamp of the pack operation
  durationMs: number          // Wall-clock duration in milliseconds
}
```

---

### `PackResult`

Top-level return type from `pack()`.

```typescript
interface PackResult {
  chunks: PackedChunk[]   // Selected and ordered chunks
  report: PackReport      // Structured packing report
}
```

---

## Configuration

### Selection Strategies

#### Greedy (default)

Sorts chunks by score descending and selects greedily until the budget is full. Time complexity: O(n log n).

```typescript
const result = await pack(chunks, { budget: 4000 })
// or explicitly:
const result = await pack(chunks, { budget: 4000, strategy: 'greedy' })
```

#### MMR (Maximal Marginal Relevance)

Iteratively selects the chunk that maximizes `lambda * relevance - (1 - lambda) * maxSimilarityToSelected`. Balances relevance and diversity.

```typescript
const result = await pack(chunks, {
  budget: 4000,
  strategy: 'mmr',
  lambda: 0.7,   // 1.0 = pure relevance (greedy-like), 0.0 = pure diversity
})
```

When embeddings are provided on `ScoredChunk.embedding`, MMR uses cosine similarity for diversity computation. Otherwise it falls back to trigram Jaccard similarity.

#### Knapsack (0/1 Dynamic Programming)

Solves the 0/1 knapsack problem to maximize total score within the exact token budget. Finds the globally optimal subset, not just the greedy-best.

```typescript
const result = await pack(chunks, {
  budget: 4000,
  strategy: 'knapsack',
})
```

For budgets exceeding 5,000 tokens, the knapsack strategy automatically falls back to greedy to avoid excessive memory and computation costs.

#### Custom Strategy

Supply your own selection function.

```typescript
const result = await pack(chunks, {
  budget: 4000,
  strategy: 'custom',
  customStrategy: (candidates, ctx) => {
    // Select only high-confidence chunks
    return candidates.filter(c => c.score > 0.8)
  },
})
```

The `customStrategy` function receives the full candidate list (after redundancy filtering) and a `StrategyContext`. It must return the subset of `ScoredChunk` objects to include.

### Ordering Strategies

#### Natural (default)

Chunks are output in the order determined by the selection strategy (score descending for greedy).

#### U-Shaped

Places the highest-relevance chunks at the beginning and end of the context, with lower-relevance chunks in the middle. This counters the "lost-in-the-middle" effect where LLMs underweight information in the middle of long contexts.

```typescript
const result = await pack(chunks, { budget: 4000, ordering: 'u-shaped' })
```

#### Chronological

Sorts chunks by `metadata.timestamp` ascending. Useful for time-sensitive contexts where temporal order matters.

```typescript
const result = await pack(chunks, { budget: 4000, ordering: 'chronological' })
```

Requires `metadata.timestamp` (numeric) on each chunk.

### Token Counting

The built-in token counter uses `Math.ceil(text.length / 4)` as a fast approximation suitable for GPT-family models. For exact counts, provide a custom counter:

```typescript
import { encode } from 'gpt-tokenizer'

const result = await pack(chunks, {
  budget: 4000,
  tokenCounter: (text) => encode(text).length,
})
```

You can also pre-compute token counts by setting `tokens` on each `ScoredChunk`, which bypasses the counter entirely.

### Chunk Overhead

Account for per-chunk formatting overhead (separators, citation markers, XML tags) with `chunkOverheadTokens`:

```typescript
const result = await pack(chunks, {
  budget: 4000,
  chunkOverheadTokens: 10,  // 10 extra tokens per chunk for formatting
})
```

The overhead is added to each chunk's token count during both budget calculations and report metrics.

---

## Error Handling

`context-packer` throws `PackError` instances for invalid configurations. Each error includes a machine-readable `code` and an optional `details` object.

```typescript
import { pack, PackError } from 'context-packer'

try {
  await pack(chunks, { budget: -1 })
} catch (err) {
  if (err instanceof PackError) {
    console.error(err.code)     // 'INVALID_BUDGET'
    console.error(err.message)  // 'Budget must be positive'
    console.error(err.details)  // undefined (or additional context)
  }
}
```

### Error Codes

| Code | Thrown When |
|------|------------|
| `INVALID_BUDGET` | `budget` is zero or negative. |
| `MISSING_CUSTOM_STRATEGY` | `strategy` is `'custom'` and `customStrategy` is not provided. |

When no chunks fit the budget, `pack` returns an empty `chunks` array with a valid `PackReport` rather than throwing. Check `report.selectedCount === 0` to detect this case.

---

## Advanced Usage

### Redundancy Deduplication

Remove near-duplicate chunks before selection to maximize information density:

```typescript
const result = await pack(chunks, {
  budget: 4000,
  redundancyThreshold: 0.85,
  similarityMetric: 'auto',
})
```

Chunks sorted by score descending are compared pairwise against already-confirmed chunks. If a chunk's similarity to any confirmed chunk meets or exceeds the threshold, it is excluded with reason `'redundant'`. The excluded entry includes `redundantWith` (the ID of the similar chunk) and `similarity` (the computed score).

Set `redundancyThreshold` to `1.0` or omit it to disable deduplication.

**Similarity metrics:**

- `'auto'` (default) -- Uses cosine similarity when both chunks have `embedding` vectors, Jaccard trigram similarity otherwise.
- `'cosine'` -- Forces cosine similarity. Falls back to Jaccard if embeddings are missing.
- `'jaccard'` -- Always uses trigram Jaccard similarity over chunk text content.

### Embedding-Based Diversity

For best results with MMR or redundancy filtering, provide embedding vectors:

```typescript
const chunks: ScoredChunk[] = [
  {
    content: 'Document about authentication',
    score: 0.92,
    tokens: 50,
    embedding: [0.12, 0.45, 0.78, /* ... */],
  },
  {
    content: 'Document about authorization',
    score: 0.85,
    tokens: 40,
    embedding: [0.11, 0.43, 0.80, /* ... */],
  },
]

const result = await pack(chunks, {
  budget: 4000,
  strategy: 'mmr',
  lambda: 0.6,
  redundancyThreshold: 0.9,
})
```

### Limiting Candidates

When working with large candidate sets, use `maxCandidates` to cap the number of chunks considered:

```typescript
const result = await pack(largeChunkSet, {
  budget: 4000,
  maxCandidates: 50,  // Only consider the first 50 chunks
})
```

Chunks beyond the limit are excluded with reason `'max-candidates'` and appear in `report.excluded`.

### Inspecting the Pack Report

The `PackReport` provides full transparency into packing decisions:

```typescript
const { chunks: packed, report } = await pack(candidates, {
  budget: 4000,
  strategy: 'mmr',
  lambda: 0.7,
  redundancyThreshold: 0.85,
})

console.log(`Strategy: ${report.strategy}`)
console.log(`Ordering: ${report.ordering}`)
console.log(`Utilization: ${(report.utilization * 100).toFixed(1)}%`)
console.log(`Selected: ${report.selectedCount}, Excluded: ${report.excludedCount}`)
console.log(`Duration: ${report.durationMs}ms`)

for (const ex of report.excluded) {
  console.log(`  Excluded "${ex.id}": ${ex.reason}`)
  if (ex.reason === 'redundant') {
    console.log(`    Redundant with: ${ex.redundantWith} (similarity: ${ex.similarity})`)
  }
}
```

### Combining Strategies with Ordering

Pair any selection strategy with any ordering strategy:

```typescript
// MMR selection with U-shaped ordering for maximum quality
const result = await pack(chunks, {
  budget: 4000,
  strategy: 'mmr',
  lambda: 0.6,
  ordering: 'u-shaped',
  redundancyThreshold: 0.85,
  chunkOverheadTokens: 5,
})
```

---

## TypeScript

`context-packer` is written in TypeScript and ships with declaration files. All public types are exported from the package entry point:

```typescript
import { pack, createPacker, PackError } from 'context-packer'
import type {
  ScoredChunk,
  PackedChunk,
  ExcludedChunk,
  PackOptions,
  StrategyContext,
  PackReport,
  PackResult,
} from 'context-packer'
```

The package targets ES2022 and compiles to CommonJS. Declaration maps are included for IDE navigation into source types.

---

## License

MIT
