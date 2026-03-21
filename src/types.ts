export interface ScoredChunk {
  content: string
  score: number
  id?: string
  tokens?: number
  embedding?: number[]
  metadata?: Record<string, unknown>
}

export interface PackedChunk {
  id: string
  content: string
  score: number
  tokens: number
  position: number
  metadata?: Record<string, unknown>
}

export interface ExcludedChunk {
  id: string
  content: string
  score: number
  tokens: number
  reason: 'budget' | 'redundant' | 'strategy' | 'max-candidates'
  redundantWith?: string
  similarity?: number
  metadata?: Record<string, unknown>
}

export interface PackOptions {
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

export interface StrategyContext {
  budget: number
  chunkOverheadTokens: number
  countTokens: (text: string) => number
  options: PackOptions
}

export interface PackReport {
  tokensUsed: number
  budget: number
  tokensRemaining: number
  utilization: number
  selectedCount: number
  excludedCount: number
  strategy: string
  ordering: string
  excluded: ExcludedChunk[]
  timestamp: string
  durationMs: number
}

export interface PackResult {
  chunks: PackedChunk[]
  report: PackReport
}
