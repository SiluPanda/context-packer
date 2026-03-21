// context-packer - Optimally pack retrieved chunks into an LLM context window
export { pack, createPacker } from './pack.js'
export { PackError } from './errors.js'
export type {
  ScoredChunk,
  PackedChunk,
  ExcludedChunk,
  PackOptions,
  StrategyContext,
  PackReport,
  PackResult,
} from './types.js'
