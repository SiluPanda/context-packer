import type { ScoredChunk, ExcludedChunk } from './types.js'
import { chunkSimilarity } from './similarity.js'

export function deduplicateChunks(
  chunks: ScoredChunk[],
  threshold: number,
  metric: 'auto' | 'cosine' | 'jaccard'
): { kept: ScoredChunk[]; excluded: ExcludedChunk[] } {
  const sorted = [...chunks].sort((a, b) => b.score - a.score)
  const kept: ScoredChunk[] = []
  const excluded: ExcludedChunk[] = []

  for (const chunk of sorted) {
    let maxSim = 0
    let redundantWith: string | undefined

    for (const keptChunk of kept) {
      const sim = chunkSimilarity(chunk, keptChunk, metric)
      if (sim > maxSim) {
        maxSim = sim
        redundantWith = keptChunk.id ?? keptChunk.content.slice(0, 40)
      }
    }

    if (maxSim >= threshold) {
      excluded.push({
        id: chunk.id ?? chunk.content.slice(0, 40),
        content: chunk.content,
        score: chunk.score,
        tokens: chunk.tokens ?? 0,
        reason: 'redundant',
        redundantWith,
        similarity: maxSim,
        metadata: chunk.metadata,
      })
    } else {
      kept.push(chunk)
    }
  }

  return { kept, excluded }
}
