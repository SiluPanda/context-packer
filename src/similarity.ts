import type { ScoredChunk } from './types.js'
import { PackError } from './errors.js'

export function jaccardSimilarity(a: string, b: string): number {
  const trigramsA = getTrigrams(a)
  const trigramsB = getTrigrams(b)
  const setA = new Set(trigramsA)
  const setB = new Set(trigramsB)
  const intersection = [...setA].filter(t => setB.has(t)).length
  const union = setA.size + setB.size - intersection
  if (union === 0) return 1
  return intersection / union
}

function getTrigrams(text: string): string[] {
  const s = text.toLowerCase().replace(/\s+/g, ' ').trim()
  if (s.length < 3) return [s]
  const trigrams: string[] = []
  for (let i = 0; i <= s.length - 3; i++) trigrams.push(s.slice(i, i + 3))
  return trigrams
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new PackError(
      `Embedding dimension mismatch: ${a.length} vs ${b.length}`,
      'DIMENSION_MISMATCH'
    )
  }
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  return denom === 0 ? 0 : dot / denom
}

export function chunkSimilarity(
  a: ScoredChunk,
  b: ScoredChunk,
  metric: 'auto' | 'cosine' | 'jaccard'
): number {
  if (metric === 'cosine' || (metric === 'auto' && a.embedding && b.embedding)) {
    if (a.embedding && b.embedding) return cosineSimilarity(a.embedding, b.embedding)
    if (metric === 'cosine') {
      throw new PackError(
        'Cosine similarity requires embeddings on both chunks',
        'MISSING_EMBEDDINGS'
      )
    }
  }
  return jaccardSimilarity(a.content, b.content)
}
