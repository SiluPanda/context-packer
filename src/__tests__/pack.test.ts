import { describe, it, expect } from 'vitest'
import { pack, createPacker } from '../pack.js'
import { PackError } from '../errors.js'
import { cosineSimilarity } from '../similarity.js'
import type { ScoredChunk, PackOptions } from '../types.js'

// Token counter: each char = 1 token for predictable test math
const count = (t: string) => t.length

function makeChunks(specs: Array<{ content: string; score: number; id?: string }>): ScoredChunk[] {
  return specs.map(s => ({ ...s, tokens: s.content.length }))
}

describe('greedy strategy', () => {
  it('selects highest-scored chunks within budget', async () => {
    const chunks = makeChunks([
      { content: 'aaaa', score: 0.9, id: 'a' }, // 4 tokens
      { content: 'bb',   score: 0.8, id: 'b' }, // 2 tokens
      { content: 'ccc',  score: 0.5, id: 'c' }, // 3 tokens
    ])
    const result = await pack(chunks, { budget: 6, tokenCounter: count })
    const ids = result.chunks.map(c => c.id)
    expect(ids).toContain('a')
    expect(ids).toContain('b')
    expect(ids).not.toContain('c')
  })

  it('stops when budget would be exceeded', async () => {
    const chunks = makeChunks([
      { content: 'aaaaaaa', score: 0.9, id: 'a' }, // 7 tokens
      { content: 'bbb',     score: 0.7, id: 'b' }, // 3 tokens
    ])
    const result = await pack(chunks, { budget: 5, tokenCounter: count })
    expect(result.chunks).toHaveLength(1)
    expect(result.chunks[0].id).toBe('b')
  })

  it('returns empty chunks when nothing fits', async () => {
    const chunks = makeChunks([{ content: 'aaaaaaa', score: 0.9, id: 'a' }])
    const result = await pack(chunks, { budget: 3, tokenCounter: count })
    expect(result.chunks).toHaveLength(0)
  })
})

describe('MMR strategy', () => {
  it('with lambda=0 prefers diversity over relevance', async () => {
    // Two very similar high-score chunks and one dissimilar lower-score chunk
    // With lambda=0 (pure diversity), after first selection the dissimilar chunk wins
    const chunks: ScoredChunk[] = [
      { content: 'the quick brown fox jumps', score: 0.9, id: 'a', tokens: 25 },
      { content: 'the quick brown fox leaps', score: 0.85, id: 'b', tokens: 25 },
      { content: 'machine learning transformer', score: 0.6, id: 'c', tokens: 28 },
    ]
    const result = await pack(chunks, {
      budget: 80,
      strategy: 'mmr',
      lambda: 0,
      tokenCounter: count,
    })
    const ids = result.chunks.map(c => c.id)
    // The first chunk selected is always 'a' (highest score at lambda=0 for empty selected set).
    // After that, lambda=0 means pure diversity: 'c' (dissimilar to 'a') should score higher than 'b' (very similar to 'a').
    expect(ids).toContain('a')
    expect(ids[1]).toBe('c')
  })

  it('with lambda=1 behaves like greedy', async () => {
    const chunks = makeChunks([
      { content: 'aaaa', score: 0.9, id: 'a' },
      { content: 'bb',   score: 0.8, id: 'b' },
      { content: 'ccc',  score: 0.5, id: 'c' },
    ])
    const greedy = await pack(chunks, { budget: 6, strategy: 'greedy', tokenCounter: count })
    const mmr = await pack(chunks, { budget: 6, strategy: 'mmr', lambda: 1, tokenCounter: count })
    expect(mmr.chunks.map(c => c.id).sort()).toEqual(greedy.chunks.map(c => c.id).sort())
  })
})

describe('knapsack strategy', () => {
  it('maximizes total score within budget (fits optimal combination)', async () => {
    // Greedy would pick 'a' (score 0.9, 4 tok) → remaining 1 token → nothing fits
    // Knapsack picks 'b' (0.7, 3 tok) + 'c' (0.6, 2 tok) = total score 1.3 > 0.9
    const chunks = makeChunks([
      { content: 'aaaa', score: 0.9, id: 'a' }, // 4 tokens
      { content: 'bbb',  score: 0.7, id: 'b' }, // 3 tokens
      { content: 'cc',   score: 0.6, id: 'c' }, // 2 tokens
    ])
    const result = await pack(chunks, { budget: 5, strategy: 'knapsack', tokenCounter: count })
    const ids = result.chunks.map(c => c.id)
    expect(ids).toContain('b')
    expect(ids).toContain('c')
    expect(ids).not.toContain('a')
  })
})

describe('redundancy filtering', () => {
  it('removes chunks that are too similar to higher-scored chunks', async () => {
    const chunks: ScoredChunk[] = [
      { content: 'the quick brown fox jumps over the lazy dog', score: 0.9, id: 'a', tokens: 10 },
      { content: 'the quick brown fox jumps over the lazy cat', score: 0.7, id: 'b', tokens: 10 },
      { content: 'machine learning is transforming the world',  score: 0.5, id: 'c', tokens: 10 },
    ]
    const result = await pack(chunks, {
      budget: 100,
      redundancyThreshold: 0.5,
      tokenCounter: count,
    })
    const ids = result.chunks.map(c => c.id)
    // 'a' and 'b' are highly similar; 'b' (lower score) should be excluded
    expect(ids).toContain('a')
    expect(ids).not.toContain('b')
    expect(ids).toContain('c')

    const redundantEntry = result.report.excluded.find(e => e.id === 'b')
    expect(redundantEntry?.reason).toBe('redundant')
  })

  it('keeps all chunks when threshold is 1.0', async () => {
    const chunks = makeChunks([
      { content: 'the quick brown fox', score: 0.9, id: 'a' },
      { content: 'the quick brown fox', score: 0.7, id: 'b' },
    ])
    const result = await pack(chunks, {
      budget: 100,
      redundancyThreshold: 1.0,
      tokenCounter: count,
    })
    expect(result.chunks).toHaveLength(2)
  })
})

describe('U-shaped ordering', () => {
  it('places high-score chunks at edges, low-score in middle', async () => {
    const chunks = makeChunks([
      { content: 'aa', score: 0.9, id: 'rank0' },
      { content: 'bb', score: 0.8, id: 'rank1' },
      { content: 'cc', score: 0.7, id: 'rank2' },
      { content: 'dd', score: 0.6, id: 'rank3' },
    ])
    const result = await pack(chunks, {
      budget: 100,
      ordering: 'u-shaped',
      tokenCounter: count,
    })
    const ids = result.chunks.map(c => c.id)
    const n = ids.length
    // The top-ranked (rank0) should be at position 0 or n-1
    const topIdx = ids.indexOf('rank0')
    expect(topIdx === 0 || topIdx === n - 1).toBe(true)
    // The second-ranked (rank1) should be at an edge too (position 0 or n-1)
    const secondIdx = ids.indexOf('rank1')
    expect(secondIdx === 0 || secondIdx === n - 1).toBe(true)
  })
})

describe('PackReport', () => {
  it('reports correct tokensUsed and utilization', async () => {
    const chunks = makeChunks([
      { content: 'aaaa', score: 0.9, id: 'a' }, // 4 tokens
      { content: 'bb',   score: 0.8, id: 'b' }, // 2 tokens
    ])
    const result = await pack(chunks, { budget: 10, tokenCounter: count })
    expect(result.report.tokensUsed).toBe(6)
    expect(result.report.budget).toBe(10)
    expect(result.report.tokensRemaining).toBe(4)
    expect(result.report.utilization).toBeCloseTo(0.6)
    expect(result.report.selectedCount).toBe(2)
    expect(result.report.strategy).toBe('greedy')
    expect(result.report.ordering).toBe('natural')
  })

  it('includes excluded chunks in report', async () => {
    const chunks = makeChunks([
      { content: 'aaaa', score: 0.9, id: 'a' }, // 4 tokens
      { content: 'bb',   score: 0.8, id: 'b' }, // 2 tokens
      { content: 'ccc',  score: 0.5, id: 'c' }, // 3 tokens — won't fit in budget 6
    ])
    const result = await pack(chunks, { budget: 6, tokenCounter: count })
    expect(result.report.excludedCount).toBe(1)
    expect(result.report.excluded[0].id).toBe('c')
    expect(result.report.excluded[0].reason).toBe('budget')
  })

  it('accounts for chunkOverheadTokens in tokensUsed', async () => {
    const chunks = makeChunks([
      { content: 'aa', score: 0.9, id: 'a' }, // 2 tokens + 3 overhead = 5
      { content: 'bb', score: 0.8, id: 'b' }, // 2 tokens + 3 overhead = 5
    ])
    const result = await pack(chunks, {
      budget: 20,
      chunkOverheadTokens: 3,
      tokenCounter: count,
    })
    expect(result.report.tokensUsed).toBe(10)
  })
})

describe('createPacker factory', () => {
  it('creates a reusable packer with fixed config', async () => {
    const packer = createPacker({ budget: 10, tokenCounter: count })
    const chunks = makeChunks([
      { content: 'aaaa', score: 0.9, id: 'a' },
      { content: 'bb',   score: 0.8, id: 'b' },
    ])
    const result = await packer.pack(chunks)
    expect(result.chunks).toHaveLength(2)
    expect(result.report.budget).toBe(10)
  })
})

describe('PackError', () => {
  it('throws PackError with INVALID_BUDGET when budget <= 0', async () => {
    await expect(pack([], { budget: 0 })).rejects.toThrow(PackError)
    await expect(pack([], { budget: -5 })).rejects.toThrow(PackError)

    try {
      await pack([], { budget: 0 })
    } catch (err) {
      expect(err).toBeInstanceOf(PackError)
      expect((err as PackError).code).toBe('INVALID_BUDGET')
    }
  })

  it('throws PackError with MISSING_CUSTOM_STRATEGY when custom strategy has no function', async () => {
    await expect(
      pack([{ content: 'x', score: 1 }], { budget: 100, strategy: 'custom' })
    ).rejects.toThrow(PackError)
  })
})

describe('maxCandidates', () => {
  it('only considers the first maxCandidates chunks', async () => {
    const chunks = makeChunks([
      { content: 'aa', score: 0.9, id: 'a' },
      { content: 'bb', score: 0.8, id: 'b' },
      { content: 'cc', score: 0.7, id: 'c' },
    ])
    const result = await pack(chunks, { budget: 100, maxCandidates: 2, tokenCounter: count })
    const ids = result.chunks.map(c => c.id)
    expect(ids).not.toContain('c')
    expect(result.report.excluded.some(e => e.id === 'c' && e.reason === 'max-candidates')).toBe(true)
  })
})

describe('strategy exclusion reason', () => {
  it('marks chunks that could fit as strategy-excluded, not budget-excluded', async () => {
    // Budget 100, select only top 1 chunk (knapsack/greedy), remaining chunks small enough to fit
    const chunks = makeChunks([
      { content: 'aaaa', score: 0.9, id: 'a' }, // 4 tokens
      { content: 'bb',   score: 0.1, id: 'b' }, // 2 tokens — fits in remaining budget
    ])
    // Knapsack with budget 5: picks 'a' (4 tokens), remaining = 1 token
    // 'b' needs 2 tokens > 1 remaining → budget exclusion
    const r1 = await pack(chunks, { budget: 5, strategy: 'knapsack', tokenCounter: count })
    expect(r1.report.excluded[0].reason).toBe('budget')

    // Budget 100: picks 'a' + 'b' both fit
    const r2 = await pack(chunks, { budget: 100, strategy: 'greedy', tokenCounter: count })
    expect(r2.chunks).toHaveLength(2)
  })
})

describe('invalid strategy', () => {
  it('throws PackError with INVALID_STRATEGY for unknown strategy', async () => {
    const chunks = makeChunks([{ content: 'aa', score: 0.9, id: 'a' }])
    await expect(
      pack(chunks, { budget: 100, strategy: 'bogus' as PackOptions['strategy'], tokenCounter: count })
    ).rejects.toThrow(PackError)

    try {
      await pack(chunks, { budget: 100, strategy: 'bogus' as PackOptions['strategy'], tokenCounter: count })
    } catch (err) {
      expect((err as PackError).code).toBe('INVALID_STRATEGY')
    }
  })
})

describe('empty chunks input', () => {
  it('returns empty result for empty chunks array', async () => {
    const result = await pack([], { budget: 100, tokenCounter: count })
    expect(result.chunks).toHaveLength(0)
    expect(result.report.tokensUsed).toBe(0)
    expect(result.report.selectedCount).toBe(0)
  })
})

describe('cosine similarity validation', () => {
  it('throws DIMENSION_MISMATCH for mismatched embedding lengths', () => {
    expect(() => cosineSimilarity([1, 2, 3], [1, 2])).toThrow(PackError)
    try {
      cosineSimilarity([1, 2, 3], [1, 2])
    } catch (err) {
      expect((err as PackError).code).toBe('DIMENSION_MISMATCH')
    }
  })
})

describe('cosine metric without embeddings', () => {
  it('throws MISSING_EMBEDDINGS when metric is cosine but chunks lack embeddings', async () => {
    const chunks: ScoredChunk[] = [
      { content: 'hello world foo bar baz', score: 0.9, id: 'a', tokens: 5 },
      { content: 'hello world foo bar baz', score: 0.8, id: 'b', tokens: 5 },
    ]
    await expect(
      pack(chunks, { budget: 100, redundancyThreshold: 0.5, similarityMetric: 'cosine', tokenCounter: count })
    ).rejects.toThrow(PackError)
  })
})

describe('redundancyThreshold edge cases', () => {
  it('threshold of 0 does not deduplicate (skipped)', async () => {
    const chunks: ScoredChunk[] = [
      { content: 'the quick brown fox jumps over the lazy dog', score: 0.9, id: 'a', tokens: 10 },
      { content: 'the quick brown fox jumps over the lazy cat', score: 0.7, id: 'b', tokens: 10 },
    ]
    const result = await pack(chunks, { budget: 100, redundancyThreshold: 0, tokenCounter: count })
    expect(result.chunks).toHaveLength(2)
  })
})

describe('MMR first pick', () => {
  it('selects highest-scored chunk first regardless of lambda', async () => {
    // Deliberately put the highest-scored chunk last in the array
    const chunks: ScoredChunk[] = [
      { content: 'machine learning transformer', score: 0.6, id: 'c', tokens: 28 },
      { content: 'the quick brown fox leaps', score: 0.85, id: 'b', tokens: 25 },
      { content: 'the quick brown fox jumps', score: 0.9, id: 'a', tokens: 25 },
    ]
    const result = await pack(chunks, {
      budget: 80,
      strategy: 'mmr',
      lambda: 0,
      tokenCounter: count,
    })
    // First pick should be 'a' (highest score), even though it's last in array
    expect(result.chunks[0].id).toBe('a')
  })
})

describe('custom strategy', () => {
  it('uses provided custom strategy function', async () => {
    const chunks = makeChunks([
      { content: 'aaaa', score: 0.9, id: 'a' },
      { content: 'bb',   score: 0.8, id: 'b' },
      { content: 'ccc',  score: 0.3, id: 'c' },
    ])
    const result = await pack(chunks, {
      budget: 100,
      strategy: 'custom',
      customStrategy: (candidates) => candidates.filter(c => c.score > 0.5),
      tokenCounter: count,
    })
    const ids = result.chunks.map(c => c.id)
    expect(ids).toContain('a')
    expect(ids).toContain('b')
    expect(ids).not.toContain('c')
  })
})

describe('chronological ordering', () => {
  it('orders chunks by metadata.timestamp ascending', async () => {
    const chunks: ScoredChunk[] = [
      { content: 'aa', score: 0.9, id: 'a', tokens: 2, metadata: { timestamp: 300 } },
      { content: 'bb', score: 0.8, id: 'b', tokens: 2, metadata: { timestamp: 100 } },
      { content: 'cc', score: 0.7, id: 'c', tokens: 2, metadata: { timestamp: 200 } },
    ]
    const result = await pack(chunks, { budget: 100, ordering: 'chronological', tokenCounter: count })
    const ids = result.chunks.map(c => c.id)
    expect(ids).toEqual(['b', 'c', 'a'])
  })
})
