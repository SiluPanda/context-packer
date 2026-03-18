# context-packer — Task Breakdown

## Phase 1: Project Setup and Scaffolding

- [ ] **Install dev dependencies** — Add `typescript`, `vitest`, `fast-check`, `@types/node`, and `eslint` (with appropriate ESLint config) as devDependencies in `package.json`. Run `npm install` to generate `node_modules` and `package-lock.json`. | Status: not_done
- [ ] **Configure ESLint** — Set up ESLint v9 flat config for TypeScript. Ensure `npm run lint` works against the `src/` directory. | Status: not_done
- [ ] **Register CLI binary in package.json** — Add a `"bin"` field pointing to `dist/cli/index.js` so that `npx context-packer` and global installs work. Also add `"cli"` to the `"files"` array so the CLI is included in the published package. | Status: not_done
- [ ] **Create file structure** — Create the directory and file skeleton as specified in SPEC Section 19: `src/types.ts`, `src/errors.ts`, `src/pack.ts`, `src/token-counter.ts`, `src/redundancy.ts`, `src/scoring.ts`, `src/report.ts`, `src/strategies/index.ts`, `src/strategies/greedy.ts`, `src/strategies/mmr.ts`, `src/strategies/knapsack.ts`, `src/strategies/coverage.ts`, `src/ordering/index.ts`, `src/ordering/u-shaped.ts`, `src/ordering/chronological.ts`, `src/similarity/index.ts`, `src/similarity/cosine.ts`, `src/similarity/jaccard.ts`, `cli/index.ts`, and the `src/__tests__/` directory. Each file can start as a stub with placeholder exports. | Status: not_done
- [ ] **Verify build pipeline** — Run `npm run build` and confirm `tsc` compiles the stub files to `dist/` without errors. Fix any `tsconfig.json` issues (e.g., ensure `cli/` is included in compilation or has its own tsconfig). | Status: not_done

---

## Phase 2: Core Types and Error Handling

- [ ] **Define ScoredChunk interface** — In `src/types.ts`, define the `ScoredChunk` interface with required fields `content` (string) and `score` (number, range [0,1]), and optional fields `id` (string), `tokens` (number), `embedding` (number[]), and `metadata` (record with `sourceId?`, `timestamp?`, `sourcePosition?`, and `[key: string]: unknown`). | Status: not_done
- [ ] **Define PackStrategy and OrderingStrategy types** — In `src/types.ts`, define the `PackStrategy` union type (`'greedy' | 'mmr' | 'knapsack' | 'coverage' | 'custom'`) and the `OrderingStrategy` union type (`'natural' | 'u-shaped' | 'chronological' | 'chronological-desc' | 'custom'`). | Status: not_done
- [ ] **Define PackOptions interface** — In `src/types.ts`, define `PackOptions` with all fields from SPEC Section 9: `budget` (required number), `strategy`, `lambda`, `maxClusters`, `clusteringThreshold`, `customStrategy`, `ordering`, `customOrder`, `redundancyThreshold`, `similarityMetric`, `chunkOverheadTokens`, `tokenCounter`, `dpBudgetThreshold`, `maxCandidates`, `includeSimilarityMatrix`. Include defaults in JSDoc comments. | Status: not_done
- [ ] **Define PackConfig type alias** — In `src/types.ts`, define `PackConfig` as an alias for `PackOptions`. | Status: not_done
- [ ] **Define PackedChunk interface** — In `src/types.ts`, define `PackedChunk` with fields: `id` (string), `content` (string), `score` (number), `tokens` (number), `position` (number), `idealPositionScore?` (number), `metadata?`. | Status: not_done
- [ ] **Define ExcludedChunk interface** — In `src/types.ts`, define `ExcludedChunk` with fields: `id`, `content`, `score`, `tokens`, `reason` (`'budget' | 'redundant' | 'strategy' | 'max-candidates'`), `redundantWith?`, `similarity?`, `metadata?`. | Status: not_done
- [ ] **Define PackReport interface** — In `src/types.ts`, define `PackReport` with all fields from SPEC Section 9: `tokensUsed`, `totalTokensWithOverhead`, `budget`, `tokensRemaining`, `utilization`, `selectedCount`, `excludedCount`, `diversityScore?`, `positionQualityScore?`, `strategy`, `ordering`, `excluded`, `similarityMatrix?`, `timestamp`, `durationMs`. | Status: not_done
- [ ] **Define PackResult interface** — In `src/types.ts`, define `PackResult` with fields `chunks: PackedChunk[]` and `report: PackReport`. | Status: not_done
- [ ] **Define StrategyContext interface** — In `src/types.ts`, define `StrategyContext` with fields `budget`, `chunkOverheadTokens`, `countTokens`, `options`. | Status: not_done
- [ ] **Define CustomStrategyFn type** — In `src/types.ts`, define `CustomStrategyFn = (chunks: ScoredChunk[], context: StrategyContext) => ScoredChunk[]`. | Status: not_done
- [ ] **Define CustomOrderFn type** — In `src/types.ts`, define `CustomOrderFn = (a: PackedChunk, b: PackedChunk) => number`. | Status: not_done
- [ ] **Implement PackError class** — In `src/errors.ts`, implement `PackError` extending `Error` with a readonly `code: PackErrorCode` field and an optional `details?: Record<string, unknown>` field. Define the `PackErrorCode` type as a union of all error codes: `'INVALID_BUDGET'`, `'INVALID_LAMBDA'`, `'INVALID_THRESHOLD'`, `'MISSING_CUSTOM_STRATEGY'`, `'MISSING_CUSTOM_ORDER'`, `'COSINE_WITHOUT_EMBEDDINGS'`, `'NO_CHUNKS_FIT'`, `'INVALID_CHUNKS'`. | Status: not_done

---

## Phase 3: Token Counting

- [ ] **Implement approximate token counter** — In `src/token-counter.ts`, implement `approximateTokenCount(text: string): number` that returns `Math.ceil(text.length / 4)`. | Status: not_done
- [ ] **Implement token counter resolution logic** — In `src/token-counter.ts`, implement a function that resolves the effective token counter: if `PackOptions.tokenCounter` is provided, use it; otherwise use the approximate counter. When `ScoredChunk.tokens` is set, skip counting for that chunk and use the pre-computed value. | Status: not_done
- [ ] **Write token counter tests** — In `src/__tests__/token-counter.test.ts`, test the approximate counter (empty string, short text, long text, non-English text). Test that pre-computed `chunk.tokens` bypasses the counter. Test that a custom counter function is called when provided. | Status: not_done

---

## Phase 4: Similarity Functions

- [ ] **Implement cosine similarity** — In `src/similarity/cosine.ts`, implement `cosineSimilarity(a: number[], b: number[]): number` computing `dot(a, b) / (norm(a) * norm(b))`. Handle edge cases: zero vectors (return 0), single-element vectors. | Status: not_done
- [ ] **Implement norm caching for cosine similarity** — In `src/similarity/cosine.ts`, implement norm caching using a `WeakMap` keyed on the embedding array reference. When the same array is passed multiple times (as in MMR iterations), the norm is computed once and reused. | Status: not_done
- [ ] **Implement Jaccard trigram similarity** — In `src/similarity/jaccard.ts`, implement `jaccardSimilarity(a: string, b: string): number`. Tokenize each string into a set of word-level trigrams (lowercased, punctuation stripped). Compute `|intersection| / |union|`. Handle edge cases: empty strings (return 0), single-word strings. | Status: not_done
- [ ] **Implement trigram tokenizer** — In `src/similarity/jaccard.ts`, implement a helper that takes a text string and returns a `Set<string>` of word-level trigrams. Lowercase the text, strip punctuation, split into words, generate consecutive 3-word sequences. | Status: not_done
- [ ] **Implement similarity dispatcher** — In `src/similarity/index.ts`, implement auto-selection logic: if both chunks have `embedding`, use cosine; if either lacks embedding, use Jaccard. When `similarityMetric` is `'cosine'`, require embeddings and throw `PackError` with `COSINE_WITHOUT_EMBEDDINGS` if absent. When `'jaccard'`, always use Jaccard. | Status: not_done
- [ ] **Write cosine similarity tests** — In `src/__tests__/similarity.test.ts`, test with known embedding vectors producing known cosine values. Test identical vectors (similarity = 1.0), orthogonal vectors (similarity = 0.0), opposite vectors (similarity = -1.0). Test norm caching (verify same computation result when same array reference is reused). | Status: not_done
- [ ] **Write Jaccard similarity tests** — In `src/__tests__/similarity.test.ts`, test with known text pairs. Identical texts (similarity = 1.0). Completely different texts (similarity = 0.0). Partially overlapping texts. Test punctuation stripping and case insensitivity. Test empty string handling. | Status: not_done
- [ ] **Write similarity dispatcher tests** — In `src/__tests__/similarity.test.ts`, test auto-selection behavior: cosine when embeddings present, Jaccard when absent, Jaccard when mixed. Test `'cosine'` forced with no embeddings throws `COSINE_WITHOUT_EMBEDDINGS`. | Status: not_done

---

## Phase 5: Redundancy Filtering

- [ ] **Implement standalone redundancy filter** — In `src/redundancy.ts`, implement the pre-strategy redundancy filtering algorithm from SPEC Section 8. Sort candidates by score descending. Iterate, comparing each candidate to all confirmed chunks using the configured similarity metric. If similarity >= `redundancyThreshold`, exclude with reason `'redundant'`, recording `redundantWith` (the ID of the similar confirmed chunk) and `similarity` (the computed value). Return the filtered candidates and the list of excluded chunks. | Status: not_done
- [ ] **Handle redundancyThreshold=1.0 (disabled)** — When `redundancyThreshold` is 1.0, skip redundancy filtering entirely and pass all chunks through unchanged. | Status: not_done
- [ ] **Write redundancy filtering tests** — In `src/__tests__/redundancy.test.ts`, test that a chunk with similarity >= threshold to a higher-scored chunk is excluded with reason `'redundant'`. Test threshold=1.0 passes all chunks. Test `redundantWith` and `similarity` fields on excluded entries. Test with cosine similarity (embeddings). Test with Jaccard similarity (text only). Test with mixed (some chunks have embeddings, some don't). | Status: not_done

---

## Phase 6: Packing Strategies

### 6.1 Greedy Strategy

- [ ] **Implement greedy relevance strategy** — In `src/strategies/greedy.ts`, implement the greedy algorithm from SPEC Section 6.1. Sort candidates by score descending. Iterate, adding each chunk if `tokensUsed + chunkTokens <= budget`. Track tokens used including `chunkOverheadTokens`. Return selected chunks and track excluded chunks with reason `'budget'`. | Status: not_done
- [ ] **Write greedy strategy tests** — In `src/__tests__/greedy.test.ts`, test basic selection (top-K that fit). Test boundary: chunk exactly fits budget. Test boundary: chunk is 1 token over budget (skipped). Test all chunks same size. Test single chunk. Test empty candidates. Test that excluded chunks have correct reason (`'budget'`). | Status: not_done

### 6.2 MMR Strategy

- [ ] **Implement MMR strategy** — In `src/strategies/mmr.ts`, implement the MMR iterative selection algorithm from SPEC Section 6.2. In each iteration, compute `MMR(c_i) = lambda * score(c_i) - (1 - lambda) * max_similarity(c_i, selected_set)` for all remaining candidates. Select the candidate with the highest MMR score. If it fits in the budget, add it; if not, remove it permanently from the remaining set. Continue until the remaining set is empty or the budget is exhausted. | Status: not_done
- [ ] **Handle MMR with no selected chunks yet** — On the first iteration (empty selected set), the diversity penalty term is 0, so the first chunk selected is always the one with the highest relevance score. | Status: not_done
- [ ] **Handle MMR tie-breaking** — When multiple candidates have the same MMR score, break ties by relevance score descending, then by original input order. | Status: not_done
- [ ] **Write MMR strategy tests** — In `src/__tests__/mmr.test.ts`, test with known embedding vectors that produce exact cosine similarities. Verify the formula is computed correctly at each iteration. Verify that decreasing lambda increases diversity of the selected set. Test lambda=1.0 behaves like greedy. Test lambda=0.0 selects maximally dissimilar chunks. Test budget enforcement. Test that chunks exceeding budget are permanently removed (not reconsidered). Test Jaccard fallback when embeddings are absent. | Status: not_done

### 6.3 Knapsack Strategy

- [ ] **Implement knapsack DP algorithm** — In `src/strategies/knapsack.ts`, implement the 0/1 knapsack dynamic programming algorithm from SPEC Section 6.3. Build a DP table of size `budget+1`. Iterate through chunks, update the table in reverse. Backtrack to find the selected set. Apply when `budget <= dpBudgetThreshold`. | Status: not_done
- [ ] **Implement knapsack greedy approximation** — In `src/strategies/knapsack.ts`, implement the greedy approximation for budgets above `dpBudgetThreshold`. Sort chunks by `score / tokenCount` (value density) descending, then greedily select until budget is exhausted. | Status: not_done
- [ ] **Implement DP/greedy threshold switching** — In `src/strategies/knapsack.ts`, automatically choose DP when `budget <= dpBudgetThreshold` (default 16,000) and greedy approximation otherwise. | Status: not_done
- [ ] **Write knapsack DP tests** — In `src/__tests__/knapsack.test.ts`, test that DP produces the optimal selection (compare against brute-force enumeration for small inputs, e.g., N=10, budget=100 tokens). Test boundary: chunk token count exactly equals budget. Test that `chunkOverheadTokens` is included in weight calculations. | Status: not_done
- [ ] **Write knapsack greedy approximation tests** — In `src/__tests__/knapsack.test.ts`, verify the greedy approximation activates when budget > `dpBudgetThreshold`. Verify it produces results within reasonable range of optimal. | Status: not_done
- [ ] **Write knapsack dpBudgetThreshold configuration test** — In `src/__tests__/knapsack.test.ts`, verify that custom `dpBudgetThreshold` values correctly switch between DP and greedy. | Status: not_done

### 6.4 Coverage Strategy

- [ ] **Implement K-means clustering (embeddings)** — In `src/strategies/coverage.ts`, implement K-means clustering over embedding vectors. K = `min(sqrt(N), maxClusters)`. Run for a fixed number of iterations (e.g., 10). Assign each chunk to the nearest centroid by cosine distance. Recompute centroids as the mean of assigned embeddings. | Status: not_done
- [ ] **Implement keyword-based clustering (fallback)** — In `src/strategies/coverage.ts`, implement greedy merge clustering using Jaccard trigram similarity. Start with each chunk in its own cluster. Iteratively merge the two most similar clusters (by average linkage or max-similarity representative) until all pairwise similarities are below `clusteringThreshold` or the number of clusters reaches `maxClusters`. | Status: not_done
- [ ] **Implement proportional budget allocation across clusters** — In `src/strategies/coverage.ts`, compute `clusterRelevance = max(score)` for each cluster. Allocate tokens proportionally: `allocation[k] = budget * (clusterRelevance[k] / sum(clusterRelevance))`. | Status: not_done
- [ ] **Implement intra-cluster greedy selection** — In `src/strategies/coverage.ts`, within each cluster, greedily select the highest-scoring chunks until the cluster's allocation is exhausted. | Status: not_done
- [ ] **Implement unused token redistribution** — In `src/strategies/coverage.ts`, if a cluster's highest-relevance chunks consume fewer tokens than allocated, redistribute the surplus to the next-highest-relevance cluster that still has unselected chunks. | Status: not_done
- [ ] **Write coverage strategy tests** — In `src/__tests__/coverage.test.ts`, test with chunks that have perfectly dissimilar embeddings forming K distinct clusters. Verify at least one chunk from each cluster is selected (when budget allows). Test proportional allocation. Test token redistribution. Test fallback to keyword clustering when no embeddings. Test `maxClusters` configuration. | Status: not_done

### 6.5 Custom Strategy

- [ ] **Implement custom strategy support** — In the strategy dispatcher (`src/strategies/index.ts`), when `strategy='custom'`, call `options.customStrategy(chunks, strategyContext)`. Validate the returned array fits within the budget; if not, trim from the end until it fits. | Status: not_done
- [ ] **Validate custom strategy is provided** — When `strategy='custom'` and `customStrategy` is not a function, throw `PackError` with code `MISSING_CUSTOM_STRATEGY`. | Status: not_done
- [ ] **Write custom strategy tests** — Test that the custom function is called with the correct arguments. Test that the packer trims the custom function's output if it exceeds the budget. Test that `MISSING_CUSTOM_STRATEGY` is thrown when `customStrategy` is missing. | Status: not_done

### 6.6 Strategy Dispatcher

- [ ] **Implement strategy dispatcher** — In `src/strategies/index.ts`, implement a function that selects and invokes the correct strategy based on `options.strategy`. Map `'greedy'` to the greedy strategy, `'mmr'` to MMR, `'knapsack'` to knapsack, `'coverage'` to coverage, and `'custom'` to the custom strategy handler. Default to `'greedy'` when `strategy` is not specified. | Status: not_done

---

## Phase 7: Positional Ordering

### 7.1 U-Shaped Ordering

- [ ] **Implement U-shaped ordering algorithm** — In `src/ordering/u-shaped.ts`, implement the interleaving algorithm from SPEC Section 5. Sort selected chunks by score descending. Assign even-ranked chunks (0, 2, 4, ...) to the front positions (front++). Assign odd-ranked chunks (1, 3, 5, ...) to the back positions (back--). | Status: not_done
- [ ] **Compute ideal position scores** — In `src/ordering/u-shaped.ts`, for each position `i` in the output, compute `idealScore(i) = 1 - (2 * |i - (N-1)/2|) / (N-1)` and set it on the `PackedChunk.idealPositionScore` field. Only set this when ordering is `'u-shaped'`. | Status: not_done
- [ ] **Write U-shaped ordering tests** — In `src/__tests__/u-shaped.test.ts`, test with 6 chunks with known scores. Verify each chunk ends up at the correct position per the interleaving algorithm. Test with 1 chunk (trivial). Test with 2 chunks (first and last). Test with odd number of chunks. Verify `idealPositionScore` is set correctly. | Status: not_done

### 7.2 Chronological Ordering

- [ ] **Implement chronological ordering** — In `src/ordering/chronological.ts`, sort chunks by `metadata.timestamp` ascending (for `'chronological'`) or descending (for `'chronological-desc'`). Support both ISO 8601 strings and Unix epoch numbers. Use `metadata.sourcePosition` as a secondary sort key for chunks from the same document. | Status: not_done
- [ ] **Implement chronological fallback for missing timestamps** — Chunks without `metadata.timestamp` are placed after all timestamped chunks in ascending mode, or before all timestamped chunks in descending mode. Within the untimestamped group, sort by `score` descending. | Status: not_done
- [ ] **Write chronological ordering tests** — In `src/__tests__/u-shaped.test.ts` (or a dedicated ordering test file), test ascending and descending sort. Test ISO 8601 and Unix epoch timestamps. Test `sourcePosition` secondary sort. Test fallback for chunks without timestamps. Test mixed timestamped and untimestamped chunks. | Status: not_done

### 7.3 Natural and Custom Ordering

- [ ] **Implement natural ordering** — In `src/ordering/index.ts`, preserve the selection order from the strategy. This is the default and requires no transformation beyond assigning `position` fields. | Status: not_done
- [ ] **Implement custom ordering** — In `src/ordering/index.ts`, when `ordering='custom'`, apply `options.customOrder` comparator via `Array.sort`. Throw `PackError` with `MISSING_CUSTOM_ORDER` if `customOrder` is not provided. | Status: not_done
- [ ] **Write custom ordering tests** — Test that the comparator is applied correctly. Test `MISSING_CUSTOM_ORDER` error. | Status: not_done

### 7.4 Ordering Dispatcher

- [ ] **Implement ordering dispatcher** — In `src/ordering/index.ts`, implement a function that selects and invokes the correct ordering based on `options.ordering`. Map each strategy string to the corresponding implementation. Default to `'natural'`. | Status: not_done

---

## Phase 8: Scoring

- [ ] **Implement diversity score computation** — In `src/scoring.ts`, compute the diversity score as the average pairwise dissimilarity (1 - similarity) between all pairs of selected chunks. Use the configured similarity metric. Return a value in [0, 1]. Only compute when `selectedCount >= 2`; otherwise leave undefined. | Status: not_done
- [ ] **Implement position quality score computation** — In `src/scoring.ts`, compute the Pearson correlation between each chunk's relevance score and its ideal U-shaped target score at that position. Use the formula from SPEC Section 5: `idealScore(i) = 1 - (2 * |i - (N-1)/2|) / (N-1)`. Only compute when ordering is `'u-shaped'` and `selectedCount >= 3`; otherwise leave undefined. | Status: not_done
- [ ] **Implement Pearson correlation function** — In `src/scoring.ts`, implement a utility function that computes the Pearson correlation coefficient between two arrays of numbers. Handle edge cases (constant arrays produce correlation of 0 or NaN — return 0 in that case). | Status: not_done
- [ ] **Write scoring tests** — In `src/__tests__/scoring.test.ts`, test diversity score against manually computed pairwise similarities. Test position quality score against manually computed Pearson correlation. Test edge cases: 0 or 1 selected chunks. Test perfect U-shaped arrangement (should produce ~1.0). Test reverse arrangement (should produce ~-1.0). | Status: not_done

---

## Phase 9: Report Assembly

- [ ] **Implement PackReport assembly** — In `src/report.ts`, implement a function that constructs a `PackReport` from the outputs of the strategy, ordering, and scoring steps. Compute: `tokensUsed` (sum of selected chunk tokens), `totalTokensWithOverhead` (tokensUsed + selectedCount * chunkOverheadTokens), `tokensRemaining` (budget - totalTokensWithOverhead), `utilization` (totalTokensWithOverhead / budget), `selectedCount`, `excludedCount`, `strategy`, `ordering`, `excluded` array, `timestamp` (ISO 8601), `durationMs`. Conditionally include `diversityScore`, `positionQualityScore`, `similarityMatrix`. | Status: not_done
- [ ] **Implement similarity matrix generation** — In `src/report.ts` or `src/similarity/index.ts`, when `includeSimilarityMatrix` is true, compute the full NxN pairwise similarity matrix between all candidate chunks (by input order). Include in the report. | Status: not_done
- [ ] **Write PackReport tests** — In `src/__tests__/pack.test.ts` or a dedicated file, verify all report fields are computed correctly. Test `tokensUsed` matches sum of selected tokens. Test `utilization` = totalTokensWithOverhead / budget. Test `excluded` contains every non-selected chunk. Test `timestamp` is a valid ISO 8601 string. Test `durationMs` is a non-negative number. Test that `similarityMatrix` is only present when `includeSimilarityMatrix` is true. | Status: not_done

---

## Phase 10: Core API — pack() and createPacker()

- [ ] **Implement input validation** — In `src/pack.ts`, validate inputs at the start of `pack()`. Throw `PackError` with appropriate codes for: `budget <= 0` or non-finite (`INVALID_BUDGET`), `lambda` outside [0,1] (`INVALID_LAMBDA`), `redundancyThreshold` outside [0,1] (`INVALID_THRESHOLD`), `strategy='custom'` without `customStrategy` (`MISSING_CUSTOM_STRATEGY`), `ordering='custom'` without `customOrder` (`MISSING_CUSTOM_ORDER`), `chunks` not an array or entries missing `content`/`score` (`INVALID_CHUNKS`). | Status: not_done
- [ ] **Implement maxCandidates truncation** — In `src/pack.ts`, if `maxCandidates` is set and fewer than the input length, truncate the candidate list to the first `maxCandidates` entries. Record truncated chunks as excluded with reason `'max-candidates'`. | Status: not_done
- [ ] **Implement auto-ID assignment** — In `src/pack.ts`, for chunks without an `id` field, assign an auto-generated ID based on position in the input array (e.g., `'chunk-0'`, `'chunk-1'`, etc.). | Status: not_done
- [ ] **Implement pack() orchestration** — In `src/pack.ts`, implement the `pack(chunks, options)` function that orchestrates the full pipeline: (1) validate inputs, (2) apply defaults, (3) assign IDs, (4) count tokens for chunks without pre-computed `tokens`, (5) apply `maxCandidates` truncation, (6) run redundancy filtering (unless strategy is `'mmr'` or threshold is 1.0), (7) run the selected strategy, (8) apply positional ordering, (9) compute scores (diversity, position quality), (10) assemble the PackReport, (11) return `PackResult`. | Status: not_done
- [ ] **Handle empty candidates** — In `src/pack.ts`, if the input chunks array is empty, return a `PackResult` with empty `chunks` array and a report with zero `tokensUsed`, `selectedCount=0`. | Status: not_done
- [ ] **Handle NO_CHUNKS_FIT** — In `src/pack.ts`, after token counting, if every candidate chunk's token count (including overhead) exceeds the budget, throw `PackError` with code `'NO_CHUNKS_FIT'` and include details with the smallest chunk's token count and the budget. | Status: not_done
- [ ] **Implement createPacker() factory** — In `src/pack.ts`, implement `createPacker(config: PackConfig): Packer`. Validate the config at construction time. Return a `Packer` object with a `pack(chunks, overrides?)` method that merges overrides with the factory config (overrides take precedence) and calls the core `pack()` function. | Status: not_done
- [ ] **Implement defaults resolution** — In `src/pack.ts`, implement a function that merges user-provided options with defaults: `strategy='greedy'`, `lambda=0.5`, `maxClusters=8`, `clusteringThreshold=0.4`, `ordering='natural'`, `redundancyThreshold=0.85`, `similarityMetric='auto'`, `chunkOverheadTokens=0`, `tokenCounter=approximateTokenCount`, `dpBudgetThreshold=16000`, `maxCandidates=Infinity`, `includeSimilarityMatrix=false`. | Status: not_done
- [ ] **Implement public exports in index.ts** — In `src/index.ts`, export `pack`, `createPacker`, `PackError`, and all TypeScript types (`ScoredChunk`, `PackOptions`, `PackConfig`, `PackResult`, `PackedChunk`, `ExcludedChunk`, `PackReport`, `PackStrategy`, `OrderingStrategy`, `CustomStrategyFn`, `CustomOrderFn`, `StrategyContext`, `PackErrorCode`). | Status: not_done

---

## Phase 11: CLI

- [ ] **Implement CLI stdin reader** — In `cli/index.ts`, read all of stdin as a string, parse it as JSON, and validate it is an array of `ScoredChunk` objects. On invalid JSON, exit with code 1 and print an error message to stderr. | Status: not_done
- [ ] **Implement CLI flag parsing** — In `cli/index.ts`, parse command-line flags: `--budget` / `-b` (number, required), `--strategy` / `-s` (string), `--lambda` / `-l` (number), `--ordering` / `-o` (string), `--redundancy-threshold` / `-r` (number), `--chunk-overhead` (number), `--max-candidates` (number), `--chunks-only` (boolean), `--report-only` (boolean), `--pretty` / `-p` (boolean), `--similarity-matrix` (boolean). Use a minimal flag parser (no external dependencies — implement manually or use Node.js `util.parseArgs`). | Status: not_done
- [ ] **Implement CLI output formatting** — In `cli/index.ts`, write the result to stdout as JSON. By default, write the full `PackResult` (`{ chunks, report }`). With `--chunks-only`, write only the `PackedChunk[]`. With `--report-only`, write only the `PackReport`. With `--pretty`, use `JSON.stringify(result, null, 2)`. | Status: not_done
- [ ] **Implement CLI exit codes** — In `cli/index.ts`, exit with code 0 on success. Exit with code 1 for invalid input (malformed JSON, missing required fields). Exit with code 2 for configuration errors (invalid option values, conflicting flags). Exit with code 3 when `NO_CHUNKS_FIT` is caught. | Status: not_done
- [ ] **Implement CLI error output** — In `cli/index.ts`, write all error messages to stderr (not stdout) so they don't corrupt the JSON output when used in a pipeline. | Status: not_done
- [ ] **Add shebang line** — Add `#!/usr/bin/env node` to the top of `cli/index.ts` (or configure the build to add it to the compiled output). | Status: not_done
- [ ] **Write CLI tests** — In `src/__tests__/cli.test.ts`, test end-to-end by spawning the CLI process, piping JSON to stdin, and verifying stdout output and exit codes. Test: basic greedy packing, MMR with U-shaped ordering, `--chunks-only`, `--report-only`, `--pretty`, invalid JSON input (exit code 1), invalid flags (exit code 2), all chunks exceed budget (exit code 3), missing `--budget` flag. | Status: not_done

---

## Phase 12: Integration Tests

- [ ] **Test pack() with greedy strategy end-to-end** — In `src/__tests__/pack.test.ts`, test the full pipeline: provide scored chunks, call `pack()` with greedy strategy, verify selected chunks, report fields, and excluded chunks. | Status: not_done
- [ ] **Test pack() with MMR strategy end-to-end** — Test with embeddings, verify diversity is higher than greedy for the same input. Test with Jaccard fallback. | Status: not_done
- [ ] **Test pack() with knapsack strategy end-to-end** — Test with varying chunk sizes, verify total relevance is maximized within budget. | Status: not_done
- [ ] **Test pack() with coverage strategy end-to-end** — Test with clustered chunks, verify cross-cluster representation. | Status: not_done
- [ ] **Test pack() with custom strategy end-to-end** — Test with a custom strategy function, verify it is called and its output is used. | Status: not_done
- [ ] **Test all ordering strategies end-to-end** — Test natural, U-shaped, chronological (ascending and descending), and custom ordering. Verify chunk positions and ordering-specific report fields. | Status: not_done
- [ ] **Test createPacker() with overrides** — Verify that per-call overrides take precedence over factory config. Test overriding strategy, budget, ordering, and lambda. | Status: not_done
- [ ] **Test pre-computed token counts** — Provide chunks with `tokens` set. Verify the token counter is not called for those chunks. Provide a mix of chunks with and without `tokens`. | Status: not_done
- [ ] **Test empty candidates** — Call `pack([])`. Verify result has empty chunks and zero tokensUsed. | Status: not_done
- [ ] **Test maxCandidates truncation** — Provide 30 chunks with `maxCandidates: 10`. Verify only the first 10 are considered. Verify the other 20 are excluded with reason `'max-candidates'`. | Status: not_done
- [ ] **Test chunkOverheadTokens accounting** — Verify that overhead tokens are correctly included in budget accounting. A chunk with 100 tokens and 10 overhead tokens should consume 110 tokens of budget. | Status: not_done
- [ ] **Test includeSimilarityMatrix** — Verify the NxN matrix is present in the report when enabled, and absent when disabled. | Status: not_done
- [ ] **Test redundancy filtering integration with strategy** — Verify that redundancy filtering runs before greedy/knapsack/coverage strategies, and that excluded chunks appear in the report with reason `'redundant'`. Verify MMR does not double-filter (or handles it correctly if redundancy filtering is also enabled). | Status: not_done

---

## Phase 13: Property-Based Tests

- [ ] **Budget invariant property test** — Using `fast-check`, generate arbitrary valid inputs (random chunks, scores, sizes, budgets). Assert that the sum of selected chunk tokens (including overhead) never exceeds the budget. | Status: not_done
- [ ] **Redundancy invariant property test** — Using `fast-check`, generate chunks with known similarities. Assert that for any two selected chunks, their similarity is strictly below `redundancyThreshold` (within floating-point tolerance). | Status: not_done
- [ ] **Coverage cluster representation property test** — Using `fast-check`, generate chunks belonging to K distinct clusters (perfectly dissimilar embeddings). Assert that if the budget allows at least one chunk from each cluster, the coverage strategy selects at least one from each. | Status: not_done
- [ ] **U-shaped position quality monotonicity property test** — Using `fast-check`, generate a set of selected chunks. Assert that U-shaped ordering achieves a position quality score >= any random permutation of the same set (verified by simulation with 100 random permutations). | Status: not_done

---

## Phase 14: Performance Benchmarks

- [ ] **Write greedy benchmark** — Benchmark greedy strategy with N=50 chunks, budget=4000, no embeddings. Assert completes in < 5ms (with 2x tolerance for CI: < 10ms). | Status: not_done
- [ ] **Write MMR with embeddings benchmark** — Benchmark MMR with N=50 chunks, budget=4000, dim=1536 embeddings. Assert < 20ms (< 40ms CI tolerance). | Status: not_done
- [ ] **Write MMR with Jaccard benchmark** — Benchmark MMR with N=50 chunks, budget=4000, no embeddings. Assert < 10ms (< 20ms CI tolerance). | Status: not_done
- [ ] **Write knapsack DP benchmark** — Benchmark knapsack DP with N=50 chunks, budget=8000. Assert < 15ms (< 30ms CI tolerance). | Status: not_done
- [ ] **Write knapsack greedy benchmark** — Benchmark knapsack greedy with N=50 chunks, budget=20000. Assert < 5ms (< 10ms CI tolerance). | Status: not_done
- [ ] **Write coverage benchmark** — Benchmark coverage with N=100 chunks, K=8, embeddings. Assert < 30ms (< 60ms CI tolerance). | Status: not_done
- [ ] **Write large-N benchmark** — Benchmark greedy with N=200 chunks, budget=4000. Assert < 10ms (< 20ms CI tolerance). | Status: not_done

---

## Phase 15: Input Validation Edge Cases

- [ ] **Test INVALID_BUDGET error** — Verify `PackError` with `INVALID_BUDGET` is thrown for budget=0, budget=-1, budget=NaN, budget=Infinity. | Status: not_done
- [ ] **Test INVALID_LAMBDA error** — Verify `PackError` with `INVALID_LAMBDA` is thrown for lambda=-0.1 and lambda=1.1. | Status: not_done
- [ ] **Test INVALID_THRESHOLD error** — Verify `PackError` with `INVALID_THRESHOLD` is thrown for redundancyThreshold=-0.1 and redundancyThreshold=1.1. | Status: not_done
- [ ] **Test INVALID_CHUNKS error** — Verify `PackError` with `INVALID_CHUNKS` is thrown for non-array input, chunks missing `content`, chunks missing `score`, chunks with `score` outside [0,1]. | Status: not_done
- [ ] **Test COSINE_WITHOUT_EMBEDDINGS error** — Verify `PackError` with `COSINE_WITHOUT_EMBEDDINGS` is thrown when `similarityMetric='cosine'` and chunks have no embeddings. | Status: not_done
- [ ] **Test NO_CHUNKS_FIT error** — Verify `PackError` with `NO_CHUNKS_FIT` is thrown when every chunk's token count exceeds the budget. Verify the error details include the smallest chunk's token count and the budget. | Status: not_done

---

## Phase 16: Documentation

- [ ] **Write README.md** — Create a comprehensive README covering: overview, installation, quick start example, API reference (pack, createPacker, types), strategy descriptions with guidance on when to use each, ordering strategy descriptions, configuration reference table, CLI usage with examples, integration examples with context-budget/chunk-smart/fusion-rank/rag-prompt-builder, error handling, and performance characteristics. | Status: not_done
- [ ] **Add JSDoc comments to all public exports** — Ensure all exported functions, interfaces, and types in `src/index.ts`, `src/types.ts`, `src/errors.ts`, and `src/pack.ts` have JSDoc comments describing parameters, return values, exceptions, and usage examples. | Status: not_done
- [ ] **Add inline code comments for algorithms** — Add comments in strategy implementations (MMR formula, knapsack DP, K-means, U-shaped interleaving, Pearson correlation) explaining the algorithm steps and referencing SPEC sections. | Status: not_done

---

## Phase 17: Build and Publish Preparation

- [ ] **Bump version** — Update `package.json` version according to semver (this is the initial implementation, so version should reflect feature completeness, e.g., `1.0.0`). | Status: not_done
- [ ] **Verify package.json metadata** — Ensure `name`, `description`, `keywords`, `author`, `license`, `main`, `types`, `files`, `bin`, `engines`, and `publishConfig` are all correct. Add relevant keywords (e.g., `rag`, `context-window`, `llm`, `chunk-packing`, `mmr`, `knapsack`, `lost-in-the-middle`). | Status: not_done
- [ ] **Verify clean build** — Run `npm run build` and confirm no errors. Verify `dist/` contains the expected output files (including CLI). | Status: not_done
- [ ] **Verify all tests pass** — Run `npm run test` and confirm all unit, integration, property-based, and CLI tests pass. | Status: not_done
- [ ] **Verify lint passes** — Run `npm run lint` and confirm no errors or warnings. | Status: not_done
- [ ] **Verify package contents** — Run `npm pack --dry-run` and confirm only `dist/` files are included (no `src/`, `__tests__/`, etc.). | Status: not_done
- [ ] **Test npm install from tarball** — Run `npm pack`, install the tarball in a temp project, import `pack` and `createPacker`, and verify basic functionality works. | Status: not_done
