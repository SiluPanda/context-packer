import type { PackedChunk } from '../types.js'

export function uShapedOrder(chunks: PackedChunk[]): PackedChunk[] {
  if (chunks.length <= 1) return chunks

  // Sort by score descending to get rank order
  const sorted = [...chunks].sort((a, b) => b.score - a.score)
  const n = sorted.length
  const result: PackedChunk[] = new Array(n)

  // Place highest-ranked items at the edges, lower-ranked in the middle.
  // Even indices (0, 2, 4, ...) go to the start; odd indices (1, 3, 5, ...) go to the end.
  let front = 0
  let back = n - 1

  for (let rank = 0; rank < n; rank++) {
    if (rank % 2 === 0) {
      result[front++] = sorted[rank]
    } else {
      result[back--] = sorted[rank]
    }
  }

  return result
}
