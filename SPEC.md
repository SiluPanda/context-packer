# context-packer -- Specification

## 1. Overview

`context-packer` is a budget-aware, diversity-maximizing, position-optimized chunk packing library for LLM context windows. It takes a set of retrieved, scored chunks -- the output of a retrieval pipeline -- and selects and arranges the best subset to place into a fixed token budget, returning an ordered list of chunks ready to include in a prompt along with a structured report explaining every decision made.

The gap this package fills is specific and well-defined. Every RAG pipeline must answer three questions before injecting context into an LLM: which chunks to include (selection), how many tokens they are allowed to consume (budget), and in what order to place them in the prompt (positioning). Today, every team hand-rolls the answers to these questions with ad hoc logic: a `slice(0, N)` on the top-ranked results, a rough token estimate to stay under a limit, and no consideration of ordering at all. This approach leaves significant quality on the table in three compounding ways.

First, greedy top-K selection ignores redundancy. If the retriever returns five chunks that all say the same thing in slightly different words, including all five wastes tokens that could carry unique information. Second, naive token budgeting is coarse: teams use character estimates or fixed chunk counts, not real token budgets, so the context either wastes space or silently overflows the window. Third -- and most consequentially -- almost no one considers chunk ordering. Research from Liu et al. (2023) demonstrated that LLMs perform significantly worse when relevant information is placed in the middle of a long context. The model's attention favors content near the beginning and end of the context window; information buried in the middle is effectively "lost." This "lost in the middle" effect means that the order in which chunks are placed in the prompt directly impacts the quality of the model's answer, independently of which chunks are selected.

`context-packer` solves all three problems in a single, composable API. It provides five packing strategies -- greedy relevance, Maximal Marginal Relevance (MMR), budget-optimal (knapsack), coverage (clustering-based), and custom -- to select chunks. It enforces a hard token budget using a pluggable token counter. It applies positional reordering strategies, including U-shaped arrangement (placing the highest-relevance chunks at the beginning and end of the context block, with lower-relevance chunks in the middle) to directly mitigate the lost-in-the-middle effect. It filters redundant chunks before packing using a configurable similarity threshold. And it produces a structured `PackReport` that tells the caller exactly which chunks were selected and why, which were excluded and why, and quality scores for the pack's diversity and positional arrangement.

The package provides both a TypeScript/JavaScript API for programmatic integration into RAG pipelines and a CLI for offline inspection and debugging of packing behavior against a set of scored chunks. The package has zero mandatory runtime dependencies. Similarity computations use cosine similarity over embedding vectors when provided, or fall back to Jaccard similarity over token sets when only text is available.

---

## 2. Goals and Non-Goals

### Goals

- Provide a `pack(chunks, options)` function that takes an array of scored chunks and a token budget and returns an ordered array of packed chunks plus a `PackReport`.
- Provide a `createPacker(config)` factory function that creates a configured packer instance with preset strategy and ordering options, for repeated use across many queries.
- Implement five packing strategies: greedy relevance, Maximal Marginal Relevance (MMR), budget-optimal (0/1 knapsack), coverage (embedding-cluster-based), and custom (caller-supplied scoring function). Each strategy is an independent, swappable algorithm.
- Implement four positional ordering strategies: natural (preserving selection order), U-shaped (highest relevance at edges, lower relevance in the middle), chronological (by document timestamp or source position), and custom (caller-supplied comparator).
- Filter redundant chunks before packing using a configurable similarity threshold. Two chunks are redundant when their similarity exceeds the threshold. The less-relevant duplicate is dropped.
- Count tokens using a pluggable counter. The built-in approximate counter divides character count by 4 (a standard GPT-family heuristic). Callers can supply exact counters wrapping tiktoken, gpt-tokenizer, or Anthropic's tokenizer.
- Enforce a hard token budget: the total token count of all selected chunks never exceeds the budget, inclusive of any configured per-chunk overhead tokens (e.g., citation markers, separators).
- Return a structured `PackReport` for every `pack()` call: which chunks were selected, total tokens used vs. budget, which chunks were excluded with specific reasons, a diversity score for the selected set, and a position quality score for the ordering.
- Provide a CLI (`context-packer`) that reads scored chunks from stdin as JSON, applies configured packing, and writes packed chunks and the report to stdout.
- Support integration with `context-budget` (consuming a RAG section budget), `chunk-smart` (consuming chunked documents), `fusion-rank` (consuming fused-ranked chunks), and `rag-prompt-builder` (providing ordered chunks for prompt assembly).
- Keep mandatory runtime dependencies at zero. Provide optional integration hooks for callers who supply embedding vectors (for MMR and embedding-based similarity) and for `fusion-rank` output format.
- Target Node.js 18 and above.

### Non-Goals

- **Not a retriever.** This package does not perform vector search, BM25 retrieval, or any other form of document retrieval. It receives pre-retrieved, pre-scored chunks and decides which ones to pack. For retrieval, use a vector database SDK, `rerank-lite`, or `fusion-rank`.
- **Not a reranker.** This package does not recompute relevance scores. It uses the scores it is given. For cross-encoder reranking, use `rerank-lite`. For reciprocal rank fusion across multiple retrievers, use `fusion-rank`.
- **Not a tokenizer.** The package includes a rough approximate counter as a built-in default. For exact token counts, the caller provides a token counting function.
- **Not a prompt builder.** This package returns an ordered array of chunks. It does not concatenate them into a prompt string, add system instructions, or format citations. For prompt construction from packed chunks, use `rag-prompt-builder`.
- **Not a context budget allocator.** This package consumes a pre-determined token budget for the RAG section of a prompt. For allocating that budget across prompt sections, use `context-budget`.
- **Not a semantic embedder.** This package uses embedding vectors when the caller provides them (for MMR and cosine-similarity redundancy filtering). It does not generate embeddings. For embedding generation, use `embed-cache` or a provider SDK.
- **Not a storage or caching layer.** This package operates on in-memory chunk arrays. It does not read from or write to vector databases, file systems, or caches.
- **Not a streaming packer.** This package makes a synchronous, complete packing decision over the full set of candidate chunks. Streaming (packing chunks as they arrive from a retriever) is out of scope.

---

## 3. Target Users and Use Cases

### RAG Pipeline Builders

Developers building retrieval-augmented generation pipelines who retrieve N candidate chunks per query and need to select and arrange the best K that fit within a token budget. They have scored chunks from a retriever or reranker and need a principled way to pack them into the context window. A typical integration: `const result = pack(retrievedChunks, { budget: 4000, strategy: 'mmr', lambda: 0.6 })`. The packed result goes directly to `rag-prompt-builder`.

### Quality-Focused AI Product Teams

Teams building AI assistants, search interfaces, or document Q&A products where answer quality directly affects user experience. These teams understand that naive top-K chunk selection degrades answer quality compared to diversity-aware selection, and that chunk ordering affects model attention. They use `context-packer`'s MMR strategy and U-shaped ordering to measurably improve retrieval quality without changing their embedding model or retriever.

### AI Infrastructure Engineers

Engineers building shared RAG infrastructure that multiple product teams consume. They configure `createPacker` once with their organization's standard budget, strategy, and ordering settings, and distribute the configured packer as a shared utility. Individual product teams call `packer.pack(chunks)` without needing to understand the underlying algorithms.

### Evaluation and Debugging Engineers

Engineers running offline evaluation of RAG pipelines, investigating why the system gave a wrong answer to a specific query. They use the CLI to inspect `PackReport` outputs: which chunks were selected vs. excluded, what the diversity and position quality scores were, and whether redundancy filtering removed relevant information. The report enables root-cause analysis without re-running the full pipeline.

### Budget-Constrained Applications

Applications running on models with small context windows (8K, 16K) or with aggressive cost controls that limit context to well below the model's maximum. These applications cannot afford to include all retrieved chunks and need precise token-level control over what is packed. The knapsack strategy maximizes total relevance within the exact token budget, extracting the highest quality possible from the limited space.

### Research and Experimentation

Researchers studying the effect of chunk selection strategy, redundancy thresholds, and positional ordering on RAG quality. The `PackReport`'s diversity and position quality scores, combined with the per-chunk inclusion/exclusion reasons, provide quantitative data for ablation studies. Custom strategy and custom ordering hooks allow testing novel algorithms through the same API.

---

## 4. Core Concepts

### Chunk

A chunk is a segment of retrieved text, scored for relevance to the current query. In `context-packer`, a chunk is represented as a `ScoredChunk` object with a required `content` string, a required `score` number in the range [0, 1] representing relevance to the query, an optional `tokens` number (pre-computed token count), an optional `embedding` array of numbers (the chunk's vector representation), and an optional `metadata` record for source document information (document ID, source URL, timestamp, heading context, etc.). Chunks arrive in the order determined by the upstream retriever or reranker. The packer does not assume any particular ordering of the input.

### Relevance Score

The relevance score is a number in [0, 1] representing how relevant the chunk is to the current query. Higher is more relevant. This score is provided by the caller -- it might be a cosine similarity from a vector database, a cross-encoder score from a reranker, a reciprocal rank fusion score from `fusion-rank`, or a custom score from application logic. The packer uses this score to rank chunks for selection and to compute position quality scores. The packer does not recompute or validate scores.

### Token Budget

The token budget is the maximum number of tokens that the packed context may consume. It is a hard upper bound: the packer never returns a set of chunks whose total token count exceeds the budget. The budget is provided by the caller. It typically comes from `context-budget`'s allocation for the RAG section, though it can also be set manually. The budget accounts for per-chunk overhead tokens (citation markers, separators, blank lines) when the `chunkOverheadTokens` option is set.

### Diversity

Diversity measures how much unique information the selected chunks cover, as opposed to redundantly covering the same information multiple times. A set of five chunks that all describe the same concept has low diversity; a set that covers five different aspects of the topic has high diversity. Diversity is measured using pairwise similarity between chunks -- when embedding vectors are available, cosine similarity is used; when only text is available, Jaccard similarity over token sets is used. The packer's MMR and coverage strategies explicitly maximize diversity as part of selection. The `PackReport` includes a diversity score for the selected set (the average pairwise dissimilarity, range [0, 1], higher is more diverse).

### Positional Bias and the Lost-in-the-Middle Effect

LLMs process context as a sequence. Research (Liu et al., 2023, "Lost in the Middle: How Language Models Use Long Contexts") demonstrated that multi-document question-answering performance degrades significantly when the relevant document is placed in the middle of a long context, compared to placing it at the beginning or end. The model's attention -- both its learned attention patterns and the practical dynamics of key-value caching -- favors positions near the start and end of the input. This positional bias is not a bug in any particular model; it is a systematic property observed across GPT-3.5, GPT-4, Claude, and Llama variants.

The implication for chunk ordering is direct: the highest-relevance chunks should be placed at the beginning or end of the context block, not in the middle. The U-shaped ordering strategy exploits this by alternating the placement of chunks from highest to lowest relevance, building outward from the edges inward. The result is a "U-shape" of relevance scores across positions -- high at both ends, lower in the middle -- which mirrors the model's attention profile.

### Positional Quality Score

The positional quality score quantifies how well the chunk ordering matches the ideal relevance profile for LLM attention. A perfect U-shape (highest-relevance chunks at positions 0 and N-1, lower-relevance chunks at positions N/2) has a score of 1.0. A worst-case ordering (highest-relevance chunk at position N/2, lowest-relevance at the edges) has a score near 0.0. The score is computed as the Pearson correlation between each chunk's relevance score and its ideal U-shaped target score at that position. The `PackReport` includes this score, allowing callers to quantify how far a custom or natural ordering deviates from optimal.

### Pack Strategy

The pack strategy determines which chunks to include in the budget and in what priority order during selection. Strategies differ in their objective: greedy selects the top-scoring chunks by relevance only; MMR balances relevance against redundancy; knapsack maximizes total relevance within the exact token budget; coverage ensures representation across topically distinct clusters. Each strategy produces a ranked list of selected chunks; positional reordering is applied afterward and is independent of the selection strategy.

### Ordering Strategy

The ordering strategy determines the position of each selected chunk in the final packed context. Ordering is applied after selection is complete. The four ordering strategies are: natural (preserve selection order), U-shaped (interleave from edges inward by relevance rank), chronological (sort by document timestamp or position within source), and custom (caller-supplied comparator). Ordering does not change which chunks are selected; it only changes their sequence.

### Redundancy Filtering

Redundancy filtering removes chunks that are too similar to a higher-ranked chunk already confirmed for inclusion. Before the packing strategy runs, or as an integrated step within the strategy (in the case of MMR), chunks that exceed a similarity threshold relative to any already-confirmed chunk are excluded. The similarity metric is cosine similarity when embeddings are provided, Jaccard similarity when only text is available. The threshold is configurable. Redundancy filtering ensures the token budget is not wasted on near-duplicate content.

---

## 5. The Lost-in-the-Middle Problem

### Research Background

Liu et al. (2023) published "Lost in the Middle: How Language Models Use Long Contexts," studying how LLMs use information from long input sequences in multi-document question-answering tasks. The study placed a gold relevant document at varying positions within a 10-30 document context window and measured answer accuracy as a function of document position.

The findings were stark. When the relevant document was first or last, accuracy was highest. When it was in the middle of a 20-document context, accuracy dropped by 20-30 percentage points compared to the best position, with some models dropping from 75% accuracy (position 0) to below 50% accuracy (position 10). The degradation increased with context length -- in longer contexts, the middle penalty was larger. The effect was observed across GPT-3.5-turbo, GPT-4, Claude, Cohere Command, and open-source Llama models. It is not a GPT-specific artifact.

A follow-up U-shape analysis revealed that model attention is highest for tokens near position 0 (primacy bias) and near the end of the sequence (recency bias), with a trough in the middle. The attention profile across position follows a U-shape. The lost-in-the-middle effect is a direct consequence: information in the trough receives less attention and is more likely to be ignored when generating an answer.

### Implications for Chunk Ordering

If a RAG pipeline retrieves 10 chunks and packs them in score order (most relevant first), the second-most relevant chunk ends up at position 1 -- still near the start, relatively safe. But the third-most relevant chunk is at position 2, the fourth at position 3, and so on. By position 5 (the middle of a 10-chunk context), we have the 6th-most relevant chunk -- moderately relevant, but now in the attention trough. In absolute terms, this is exactly backwards from optimal: the chunk the model is most likely to need is the one it is least likely to attend to.

The naive reverse approach -- least relevant first, most relevant last -- exploits recency bias but wastes primacy. The optimal solution exploits both primacy and recency simultaneously by placing the two highest-relevance chunks at positions 0 and N-1, the next two at positions 1 and N-2, and so on, filling the middle with the lowest-relevance chunks that were still worth including.

### U-Shaped Arrangement Algorithm

The U-shaped arrangement algorithm takes a list of N chunks sorted by descending relevance score and interleaves them into positions filling from both ends toward the middle:

```
Input (sorted by relevance, highest first):
  Rank 0: score=0.95  (highest relevance)
  Rank 1: score=0.87
  Rank 2: score=0.79
  Rank 3: score=0.71
  Rank 4: score=0.63
  Rank 5: score=0.55  (lowest relevance in selected set)

Output positions (U-shaped):
  Position 0: Rank 0 (score=0.95)  ← primacy slot
  Position 5: Rank 1 (score=0.87)  ← recency slot
  Position 1: Rank 2 (score=0.79)
  Position 4: Rank 3 (score=0.71)
  Position 2: Rank 4 (score=0.63)
  Position 3: Rank 5 (score=0.55)  ← center, lowest relevance
```

The algorithm alternates assignment from the front and back:

```
position = 0 (front)
for rank = 0, 2, 4, ...:  assign chunk[rank] to position[front++]
for rank = 1, 3, 5, ...:  assign chunk[rank] to position[back--]
```

The resulting relevance profile across positions is: high, medium-high, medium, medium, medium-high, high. This matches the U-shaped attention profile of the model.

### Position Scoring Formula

The position quality score measures the correlation between a chunk's relevance rank and its "closeness to the edges" across all N positions:

```
Let N = number of packed chunks
For position i (0-indexed), define the ideal score:
  idealScore(i) = 1 - (2 * |i - (N-1)/2|) / (N-1)
  (This is 1 at the edges, 0 at the center)

Let r(i) = relevance score of the chunk at position i
Let s(i) = idealScore(i)

positionQuality = PearsonCorrelation(r, s)
```

A perfect U-shaped arrangement achieves a positionQuality of 1.0. A random ordering achieves approximately 0.0. A worst-case arrangement (monotonically decreasing relevance, most relevant in center) achieves approximately -1.0.

---

## 6. Packing Strategies

Each strategy is an independent algorithm that selects a subset of the candidate chunks to include within the token budget. Strategies produce an ordered list of selected chunks. Positional reordering is applied separately after selection.

### 6.1 Greedy Relevance

**Algorithm**: Sort all candidate chunks by relevance score descending. Iterate through the sorted list. For each chunk, if adding it would not exceed the token budget, include it. Stop when the budget is exhausted or all chunks are considered.

```
candidates = sort(chunks, by: score descending)
selected = []
tokensUsed = 0
for chunk in candidates:
  chunkTokens = countTokens(chunk.content) + chunkOverheadTokens
  if tokensUsed + chunkTokens <= budget:
    selected.push(chunk)
    tokensUsed += chunkTokens
return selected
```

**When to use**: Default for most RAG pipelines. Fast (O(N log N) for the sort), simple, predictable. Works well when the retriever or reranker has already ensured diversity in the top-K results (e.g., via `fusion-rank` across multiple retrievers with different sources). Appropriate when the candidate set is small (< 20 chunks) and diversity is handled upstream.

**Tradeoffs**:
- Pro: Maximizes single-chunk relevance. Always includes the highest-scoring chunks first.
- Pro: Deterministic and fast. No hyperparameters beyond the budget.
- Con: Does not model redundancy. Two nearly identical chunks may both be selected if both have high scores.
- Con: Does not optimize total relevance within the budget (the knapsack strategy does this better when chunks have varying sizes).

### 6.2 Maximal Marginal Relevance (MMR)

**Algorithm**: MMR (Carbonell and Goldstein, 1998) iteratively selects chunks that maximize a linear combination of relevance to the query and dissimilarity to the already-selected set. The `lambda` parameter controls the tradeoff between relevance and diversity.

**Formula**:

```
MMR(c_i) = λ · Sim(c_i, query) - (1 - λ) · max_{c_j ∈ S} Sim(c_i, c_j)

where:
  c_i   = candidate chunk being evaluated
  query = the current query (or its embedding)
  S     = set of already-selected chunks
  Sim   = similarity function (cosine if embeddings available, Jaccard otherwise)
  λ     = lambda parameter, range [0, 1]
    λ = 1.0 → pure relevance (equivalent to greedy)
    λ = 0.0 → pure diversity (select maximally dissimilar chunks)
    λ = 0.5 → equal weight to relevance and diversity (default)
    λ = 0.7 → moderate relevance preference
```

**Selection procedure**:

```
selected = []
tokensUsed = 0
remaining = copy(candidates)

while remaining is not empty and tokensUsed < budget:
  best = argmax over remaining of MMR(c_i, selected)
  chunkTokens = countTokens(best.content) + chunkOverheadTokens
  if tokensUsed + chunkTokens <= budget:
    selected.push(best)
    tokensUsed += chunkTokens
  remove best from remaining  // do not reconsider even if it exceeded budget
return selected
```

Note: chunks that exceed the budget are removed from consideration permanently (not just skipped), to avoid the O(N^2) pathology of repeatedly reconsidering large chunks that can never fit. This matches the standard MMR greedy variant used in production retrieval systems.

**Similarity computation**:

When `embedding` fields are present on chunks:
```
Sim(c_i, c_j) = cosineSimilarity(c_i.embedding, c_j.embedding)
             = dot(c_i.embedding, c_j.embedding) / (|c_i.embedding| * |c_j.embedding|)
```

When embeddings are absent, Jaccard similarity over trigram token sets is used as an approximation:
```
tokenize(text) = set of word-level trigrams in text (lowercased, punctuation stripped)
Sim(c_i, c_j) = |tokenize(c_i.content) ∩ tokenize(c_j.content)|
              / |tokenize(c_i.content) ∪ tokenize(c_j.content)|
```

Jaccard over trigrams is more discriminative than unigram Jaccard for near-duplicate detection and performs well as a fallback when embeddings are unavailable.

**When to use**: The recommended strategy when the candidate chunks may contain redundant information (retrieved from a corpus with many similar documents, or when using a single-retriever system that does not guarantee diversity). Particularly effective for question answering over document collections where multiple documents address the same topic. The default `lambda: 0.5` provides a strong balance. Increase lambda toward 0.7-0.8 for queries that require comprehensive coverage of a single topic; decrease toward 0.3-0.4 for exploratory queries that benefit from broad perspective.

**Tradeoffs**:
- Pro: Explicitly models and minimizes redundancy in the selected set.
- Pro: One hyperparameter (lambda) with clear, interpretable semantics.
- Con: O(N^2) in the number of candidates. Expensive for very large candidate sets (> 200 chunks). For large N, pre-filter to top 50 candidates by relevance before applying MMR.
- Con: Similarity quality depends on embedding quality. Without embeddings, Jaccard trigrams are approximate.
- Con: Non-deterministic when multiple candidates tie for the best MMR score (tie-breaking by relevance score, then by original order).

### 6.3 Budget-Optimal (Knapsack)

**Algorithm**: Models chunk selection as a 0/1 knapsack problem where the "weight" of each item is its token count and its "value" is its relevance score. The objective is to maximize total relevance within the token budget. For exact optimization, uses dynamic programming (feasible when `budget` <= ~16,000 tokens). For larger budgets, uses a greedy approximation sorted by score-per-token ratio.

**Exact DP algorithm** (for budget <= `dpBudgetThreshold`, default 16,000):

```
dp[0..budget] = 0  // max total score achievable with exactly t tokens used
for each chunk c_i:
  tokens_i = countTokens(c_i.content) + chunkOverheadTokens
  value_i  = c_i.score
  // iterate in reverse to ensure each chunk is selected at most once (0/1 knapsack)
  for t = budget downto tokens_i:
    dp[t] = max(dp[t], dp[t - tokens_i] + value_i)

// backtrack to find selected set
t = argmax(dp)
selected = []
for each chunk c_i (in reverse):
  if dp[t] == dp[t - tokens_i] + value_i:
    selected.push(c_i)
    t -= tokens_i
```

**Greedy approximation** (for budget > `dpBudgetThreshold`):

```
Sort chunks by (score / tokenCount) descending  // value density
selected = greedy select until budget exhausted
```

The greedy approximation achieves (1 - 1/e) ≈ 63% of the optimal value in the worst case (standard result for the fractional knapsack relaxation). In practice on typical RAG chunk distributions (scores and sizes not adversarially correlated), it achieves > 90% of optimal.

**When to use**: When token efficiency is the primary optimization objective and chunks have significantly varying sizes. Useful when the chunk set contains a mix of short, dense, highly-relevant chunks and long, moderately-relevant chunks. The knapsack strategy will prefer several short highly-relevant chunks over one long moderately-relevant chunk, which greedy-by-score might not (if the long chunk has a marginally higher score). Also useful for small, constrained context windows (8K models) where every token counts.

**Tradeoffs**:
- Pro: Provably optimal (within DP budget threshold) for maximizing total relevance score within the token budget.
- Pro: Handles heterogeneous chunk sizes better than greedy-by-score.
- Con: Does not model diversity. Can select redundant chunks that together have higher total score than a diverse set.
- Con: DP is O(N * budget) in time and O(budget) in space. At budget=16,000 and N=50 chunks, this is 800,000 operations -- fast. At budget=100,000, the DP table may be impractically large; the greedy approximation activates automatically.
- Con: Backtracking to recover the selected set requires storing per-chunk decisions, increasing memory usage.

### 6.4 Coverage (Clustering-Based)

**Algorithm**: Clusters the candidate chunks by topic using embedding-based K-means clustering (when embeddings are available) or keyword overlap clustering (fallback). Allocates the token budget proportionally across clusters based on cluster relevance (the maximum score within the cluster). Greedily selects the highest-scoring chunks from each cluster within its allocation.

**Algorithm steps**:

```
1. Cluster the candidate chunks into K clusters
   - With embeddings: K-means on embedding vectors (K = min(sqrt(N), maxClusters), default K up to 8)
   - Without embeddings: greedy merge based on Jaccard trigram similarity > clusteringThreshold
2. For each cluster, compute clusterRelevance = max(score) of chunks in cluster
3. Allocate token budget across clusters proportionally to clusterRelevance:
   allocation[k] = budget * (clusterRelevance[k] / sum(clusterRelevance))
4. Within each cluster, greedily select highest-scoring chunks until allocation[k] exhausted
5. If a cluster's highest-relevance chunks are shorter than its allocation, redistribute unused tokens to the next-highest-relevance cluster
```

**When to use**: When the retrieval corpus is broad and the query could be answered by many different sub-topics. Coverage strategy ensures that each topically distinct part of the relevant document space is represented in the context. Useful for summarization tasks, research synthesis, or any query where a comprehensive answer drawing from multiple perspectives is more valuable than a focused answer from a single source.

**Tradeoffs**:
- Pro: Guarantees topical diversity by construction. Prevents one dominant topic cluster from consuming the entire budget.
- Pro: Adapts to the natural topic structure of the retrieved set, which may differ from query to query.
- Con: Requires embeddings for high-quality clustering. Without embeddings, keyword-based clustering is coarser.
- Con: Cluster count K is a hyperparameter that affects the granularity of diversity. Poor K selection can produce over-clustered or under-clustered results.
- Con: Intra-cluster redundancy is not modeled. Two near-duplicate chunks in the same cluster may both be selected.
- Con: Proportional budget allocation may give a small amount of budget to low-relevance clusters, including marginally relevant chunks at the expense of more budget for the most relevant cluster.

### 6.5 Custom Strategy

**Algorithm**: The caller supplies a function that receives the full array of scored chunks and the packing context (budget, token counter, options) and returns an ordered array of selected chunks. The packer validates that the returned set fits within the budget (it trims from the end if not) and then applies the configured ordering strategy.

```typescript
type CustomStrategyFn = (
  chunks: ScoredChunk[],
  context: StrategyContext,
) => ScoredChunk[];

interface StrategyContext {
  budget: number;
  chunkOverheadTokens: number;
  countTokens: (text: string) => number;
  options: PackOptions;
}
```

**When to use**: When none of the built-in strategies match the application's requirements. Examples: a strategy that prioritizes chunks from specific source documents (citation diversity rather than topic diversity); a strategy that applies domain-specific reranking before greedy selection; a hybrid approach that runs MMR then applies knapsack to the MMR-selected set; a strategy that enforces hard constraints (e.g., always include at least one chunk from each distinct source document).

**Tradeoffs**:
- Pro: Full control over selection logic. No constraints from the built-in strategies.
- Con: Caller is responsible for correctness, budget compliance, and performance. The packer validates the output but does not guarantee the custom strategy produces a globally optimal result.

---

## 7. Positional Reordering

Positional reordering is applied to the set of selected chunks after the packing strategy has determined which chunks to include. Reordering does not change which chunks are selected; it only changes their sequence in the final packed context.

### 7.1 Natural Ordering

Preserves the order in which chunks were selected by the packing strategy. For greedy relevance, this is descending score order. For MMR, it is the iteration order of the greedy MMR loop (roughly descending marginal relevance). Natural ordering is the default and is appropriate when the ordering strategy of the upstream retriever is meaningful (e.g., a reranker that returns chunks in a specific order).

**When to use**: When the upstream system has already determined an intentional ordering (chronological retrieval, retriever-specific ranking), or when the strategy output order is itself meaningful and should be preserved for interpretability.

### 7.2 U-Shaped Ordering

Places the highest-relevance chunks at the beginning and end of the context block, with lower-relevance chunks in the middle. This directly mitigates the lost-in-the-middle effect. See Section 5 for the full algorithm and position quality scoring formula.

The U-shaped ordering uses `chunk.score` (the original relevance score from the retriever/reranker, not modified by the packing strategy) to rank chunks by relevance before interleaving. This ensures that the positional arrangement reflects the ground-truth relevance signal, not an artifact of the selection order.

**When to use**: The recommended ordering for most RAG pipelines, especially with context blocks longer than 4 chunks. The performance benefit is most pronounced on longer contexts (10+ chunks) and with models that have strong primacy/recency biases. Use as the default unless the application requires chronological ordering for citation purposes.

### 7.3 Chronological Ordering

Sorts chunks by the `metadata.timestamp` field (ISO 8601 string or Unix epoch number) ascending (oldest first) or descending (newest first) based on the `chronologicalOrder` option. When `metadata.sourcePosition` is present (a numeric offset within the source document), that field is used as a secondary sort key for chunks from the same document.

**When to use**: For time-sensitive applications where recency is important and the LLM is expected to understand temporal context ("as of March 2025..."). Also appropriate when chunk ordering must correspond to the original document order for the model to understand narrative or causal flow.

**Fallback**: Chunks without a `metadata.timestamp` field are placed after all timestamped chunks in ascending mode, or before all timestamped chunks in descending mode. A secondary sort by `score` descending is applied within the untimstamped group.

### 7.4 Custom Ordering

The caller supplies a standard JavaScript comparator function over `PackedChunk` objects. The comparator is passed to `Array.sort`. The packer applies no position quality scoring to custom orderings (the score would be meaningless without knowing the caller's intent).

```typescript
type CustomOrderFn = (a: PackedChunk, b: PackedChunk) => number;
```

**Example**: Sort by source document to group related chunks together:

```typescript
const result = pack(chunks, {
  ordering: 'custom',
  customOrder: (a, b) =>
    (a.metadata?.sourceId ?? '').localeCompare(b.metadata?.sourceId ?? '') ||
    b.score - a.score,
});
```

---

## 8. Redundancy Filtering

Redundancy filtering runs before the packing strategy executes (for greedy, knapsack, and coverage strategies) or is integrated into the iterative loop (for MMR, where it is implicit in the diversity term). The goal is to remove chunks that carry no unique information relative to a higher-scoring chunk.

### Standalone Redundancy Filtering (pre-strategy)

```
Sort candidates by score descending
confirmed = []
for each candidate c in sorted order:
  isDuplicate = false
  for each already-confirmed chunk s in confirmed:
    if similarity(c, s) >= redundancyThreshold:
      isDuplicate = true
      break
  if not isDuplicate:
    confirmed.push(c)
  else:
    exclude c with reason: 'redundant', similarTo: s.id
return confirmed as filtered candidate set
```

**Default threshold**: `0.85`. Chunks with cosine (or Jaccard) similarity >= 0.85 to a higher-ranked confirmed chunk are excluded.

**Threshold guidelines**:
- `0.95+`: Near-exact duplicate detection only. Paraphrased content is retained.
- `0.85` (default): Filters clearly redundant paraphrases. Most production use cases.
- `0.70`: Aggressive filtering. Chunks covering the same sub-topic from different angles may be excluded. Use with caution.
- `0.50`: Very aggressive. Topically similar but informationally distinct chunks may be excluded. Typically too aggressive for production use.

### MMR Integration

For the MMR strategy, redundancy filtering is implicit. The term `max_{c_j ∈ S} Sim(c_i, c_j)` in the MMR formula penalizes each candidate proportionally to how similar it is to the already-selected set. A candidate that is 0.95 similar to a selected chunk receives a high penalty, and with lambda < 1.0, it will not be selected unless it is also significantly more relevant. Standalone redundancy filtering can still be applied before MMR to avoid O(N^2) MMR iterations over very similar candidates.

### Similarity Metrics

| Condition | Similarity Metric | Computation |
|---|---|---|
| `embedding` present on both chunks | Cosine similarity | `dot(a.emb, b.emb) / (norm(a.emb) * norm(b.emb))` |
| No embeddings, text only | Jaccard trigram similarity | Overlap of word-level trigram sets |
| Mixed (one has embedding) | Jaccard trigram (fallback) | Treat as text-only |

The similarity metric is selected automatically based on the available data. The `similarityMetric` option allows forcing `'cosine'` or `'jaccard'`. Forcing cosine when embeddings are missing throws a `ConfigurationError`.

---

## 9. API Surface

### Installation

```bash
npm install context-packer
```

### Primary Export: `pack`

```typescript
import { pack } from 'context-packer';

const result = pack(chunks, {
  budget: 4000,
  strategy: 'mmr',
  lambda: 0.6,
  ordering: 'u-shaped',
  redundancyThreshold: 0.85,
});

console.log(result.chunks);    // PackedChunk[] — ordered, ready for prompt injection
console.log(result.report);    // PackReport — full decision audit trail
```

**Signature**:

```typescript
function pack(chunks: ScoredChunk[], options: PackOptions): PackResult;
```

The function is synchronous. All computation (token counting, similarity, strategy, ordering) is performed in a single call. No I/O, no async operations.

### Factory Export: `createPacker`

```typescript
import { createPacker } from 'context-packer';

const packer = createPacker({
  budget: 4000,
  strategy: 'mmr',
  lambda: 0.6,
  ordering: 'u-shaped',
  tokenCounter: myExactTokenCounter,
});

// Use the configured packer across many queries
const result = packer.pack(retrievedChunks);
```

**Signature**:

```typescript
function createPacker(config: PackConfig): Packer;

interface Packer {
  pack(chunks: ScoredChunk[], overrides?: Partial<PackOptions>): PackResult;
}
```

`createPacker` validates the configuration at construction time and caches any pre-computation (e.g., initializing the token counter). The returned `Packer` instance is reusable and stateless across calls -- each `pack()` call is independent.

### TypeScript Type Definitions

```typescript
// ── Input Types ──────────────────────────────────────────────────────

/** A retrieved chunk with a relevance score, ready to be considered for packing. */
interface ScoredChunk {
  /**
   * Unique identifier for this chunk. Used in PackReport to reference excluded/included chunks.
   * If not provided, the packer assigns an auto-generated ID based on position in the input array.
   */
  id?: string;

  /** The text content of the chunk. Required. */
  content: string;

  /**
   * Relevance score in the range [0, 1]. Higher is more relevant.
   * Provided by the upstream retriever, reranker, or fusion ranker.
   */
  score: number;

  /**
   * Pre-computed token count for the chunk content.
   * If provided, the packer uses this value and skips counting.
   * If absent, the packer counts tokens using the configured tokenCounter.
   */
  tokens?: number;

  /**
   * Embedding vector for the chunk. Used for cosine similarity in MMR and redundancy filtering.
   * If absent, Jaccard trigram similarity is used as a fallback.
   */
  embedding?: number[];

  /** Arbitrary metadata passed through to PackedChunk unchanged. */
  metadata?: {
    /** Source document identifier (URL, file path, document ID). */
    sourceId?: string;

    /** ISO 8601 timestamp or Unix epoch for chronological ordering. */
    timestamp?: string | number;

    /** Byte or character offset within the source document, for intra-document ordering. */
    sourcePosition?: number;

    /** Any other metadata fields the caller wants preserved. */
    [key: string]: unknown;
  };
}

// ── Strategy and Ordering Types ──────────────────────────────────────

/** Built-in packing strategy identifiers. */
type PackStrategy =
  | 'greedy'     // Top-K by relevance score, greedy budget filling
  | 'mmr'        // Maximal Marginal Relevance — relevance vs. diversity tradeoff
  | 'knapsack'   // Budget-optimal selection maximizing total relevance score
  | 'coverage'   // Cluster-based selection ensuring topical diversity
  | 'custom';    // Caller-supplied strategy function

/** Built-in positional ordering identifiers. */
type OrderingStrategy =
  | 'natural'        // Preserve selection order from strategy
  | 'u-shaped'       // Highest relevance at edges, lowest in middle
  | 'chronological'  // Sort by metadata.timestamp ascending
  | 'chronological-desc'  // Sort by metadata.timestamp descending
  | 'custom';        // Caller-supplied comparator

// ── Options ──────────────────────────────────────────────────────────

/** Options passed to pack() or createPacker(). */
interface PackOptions {
  /**
   * Maximum number of tokens the packed context may consume.
   * Hard upper bound. Required.
   */
  budget: number;

  /**
   * Packing strategy. Controls which chunks are selected.
   * Default: 'greedy'.
   */
  strategy?: PackStrategy;

  /**
   * MMR lambda parameter. Controls relevance vs. diversity tradeoff.
   * 0.0 = pure diversity, 1.0 = pure relevance.
   * Only applies when strategy is 'mmr'.
   * Default: 0.5.
   */
  lambda?: number;

  /**
   * Maximum number of clusters for the coverage strategy.
   * Only applies when strategy is 'coverage'.
   * Default: 8.
   */
  maxClusters?: number;

  /**
   * Clustering similarity threshold for the coverage strategy when no embeddings are available.
   * Chunks with Jaccard similarity >= threshold are placed in the same cluster.
   * Default: 0.4.
   */
  clusteringThreshold?: number;

  /**
   * Custom strategy function. Required when strategy is 'custom'.
   */
  customStrategy?: CustomStrategyFn;

  /**
   * Positional ordering applied after selection.
   * Default: 'natural'.
   */
  ordering?: OrderingStrategy;

  /**
   * Custom ordering comparator. Required when ordering is 'custom'.
   */
  customOrder?: CustomOrderFn;

  /**
   * Similarity threshold for redundancy filtering.
   * Chunks with similarity >= threshold to a higher-scored selected chunk are excluded.
   * Range: [0, 1]. Set to 1.0 to disable redundancy filtering.
   * Default: 0.85.
   */
  redundancyThreshold?: number;

  /**
   * Similarity metric to use for redundancy filtering and MMR.
   * 'auto': use cosine if embeddings are present, Jaccard otherwise.
   * 'cosine': require embeddings; throw ConfigurationError if absent.
   * 'jaccard': always use Jaccard trigram similarity.
   * Default: 'auto'.
   */
  similarityMetric?: 'auto' | 'cosine' | 'jaccard';

  /**
   * Additional tokens to count per chunk, accounting for separators, citation markers,
   * or other formatting tokens that will be added around each chunk in the final prompt.
   * Default: 0.
   */
  chunkOverheadTokens?: number;

  /**
   * Token counting function. Accepts a text string, returns a token count.
   * Default: approximate counter (Math.ceil(text.length / 4)).
   */
  tokenCounter?: (text: string) => number;

  /**
   * Maximum token count for the DP algorithm in the knapsack strategy.
   * Budgets above this threshold trigger the greedy approximation.
   * Default: 16_000.
   */
  dpBudgetThreshold?: number;

  /**
   * Maximum number of candidate chunks to consider.
   * Chunks beyond this limit (by input array position) are discarded before strategy runs.
   * Used to bound computation time for very large candidate sets.
   * Default: Infinity (no limit).
   */
  maxCandidates?: number;

  /**
   * Whether to include the full similarity matrix in the PackReport.
   * Useful for debugging but increases report size O(N^2).
   * Default: false.
   */
  includeSimilarityMatrix?: boolean;
}

/** Alias for full configuration (same shape as PackOptions). */
type PackConfig = PackOptions;

// ── Output Types ─────────────────────────────────────────────────────

/** A chunk that has been selected and positioned for inclusion in the context. */
interface PackedChunk {
  /** The chunk's identifier. */
  id: string;

  /** The text content. Same as ScoredChunk.content. */
  content: string;

  /** The original relevance score from the retriever/reranker. */
  score: number;

  /** Token count of this chunk's content (excluding chunkOverheadTokens). */
  tokens: number;

  /** Position in the final packed context (0-indexed). */
  position: number;

  /**
   * The ideal relevance score for a chunk at this position, based on the U-shape model.
   * Only present when ordering is 'u-shaped'.
   */
  idealPositionScore?: number;

  /** Original metadata, passed through from ScoredChunk unchanged. */
  metadata?: ScoredChunk['metadata'];
}

/** An excluded chunk and the reason it was not included. */
interface ExcludedChunk {
  /** The chunk's identifier. */
  id: string;

  /** The text content. */
  content: string;

  /** The original relevance score. */
  score: number;

  /** Token count. */
  tokens: number;

  /**
   * Reason this chunk was excluded:
   * - 'budget': would have exceeded the token budget.
   * - 'redundant': similarity to a selected chunk exceeded redundancyThreshold.
   * - 'strategy': the packing strategy did not select it (e.g., MMR preferred diversity).
   * - 'max-candidates': exceeded maxCandidates limit before strategy ran.
   */
  reason: 'budget' | 'redundant' | 'strategy' | 'max-candidates';

  /**
   * The ID of the chunk this chunk was redundant with.
   * Present only when reason is 'redundant'.
   */
  redundantWith?: string;

  /**
   * The similarity score to the chunk it was redundant with.
   * Present only when reason is 'redundant'.
   */
  similarity?: number;

  /** Original metadata. */
  metadata?: ScoredChunk['metadata'];
}

/** Structured report of a pack() call. */
interface PackReport {
  /** Total tokens used by selected chunks (excluding chunkOverheadTokens per chunk). */
  tokensUsed: number;

  /** Total tokens including per-chunk overhead (tokensUsed + selectedChunks.length * chunkOverheadTokens). */
  totalTokensWithOverhead: number;

  /** The configured token budget. */
  budget: number;

  /** Remaining tokens (budget - totalTokensWithOverhead). */
  tokensRemaining: number;

  /** Budget utilization as a fraction [0, 1]. tokensUsed / budget. */
  utilization: number;

  /** Number of chunks selected. */
  selectedCount: number;

  /** Number of chunks excluded. */
  excludedCount: number;

  /**
   * Diversity score of the selected set [0, 1].
   * Average pairwise dissimilarity (1 - similarity) between selected chunks.
   * 1.0 = perfectly diverse (all chunks completely dissimilar).
   * 0.0 = all chunks identical.
   * Present only when selectedCount >= 2.
   */
  diversityScore?: number;

  /**
   * Position quality score [−1, 1].
   * Pearson correlation between actual relevance scores and ideal U-shape scores.
   * 1.0 = perfect U-shaped arrangement.
   * ~0.0 = random arrangement.
   * Present only when ordering is 'u-shaped' and selectedCount >= 3.
   */
  positionQualityScore?: number;

  /** Strategy used for this pack operation. */
  strategy: PackStrategy;

  /** Ordering used for this pack operation. */
  ordering: OrderingStrategy;

  /**
   * Detailed breakdown of excluded chunks with reasons.
   */
  excluded: ExcludedChunk[];

  /**
   * Full pairwise similarity matrix between all candidate chunks (NxN).
   * Only present when includeSimilarityMatrix is true.
   * Entry [i][j] is the similarity between candidate i and candidate j (by input order).
   */
  similarityMatrix?: number[][];

  /** ISO 8601 timestamp of when pack() was called. */
  timestamp: string;

  /** Wall-clock time taken for the pack() call in milliseconds. */
  durationMs: number;
}

/** The return value of pack(). */
interface PackResult {
  /** The selected, ordered chunks ready for prompt injection. */
  chunks: PackedChunk[];

  /** Full report of packing decisions. */
  report: PackReport;
}

// ── Function Types ────────────────────────────────────────────────────

/** Context provided to a custom strategy function. */
interface StrategyContext {
  budget: number;
  chunkOverheadTokens: number;
  countTokens: (text: string) => number;
  options: PackOptions;
}

/** Custom strategy function type. */
type CustomStrategyFn = (
  chunks: ScoredChunk[],
  context: StrategyContext,
) => ScoredChunk[];

/** Custom ordering comparator type. */
type CustomOrderFn = (a: PackedChunk, b: PackedChunk) => number;
```

---

## 10. Pack Report

The `PackReport` is the primary observability artifact of `context-packer`. It answers the question "why did the packer choose what it chose?" with enough detail to debug failures, tune hyperparameters, and measure quality.

### Key Fields and Their Use

**`tokensUsed` / `totalTokensWithOverhead` / `budget` / `tokensRemaining`**

Tells the caller exactly how the token budget was consumed. `tokensRemaining` indicates wasted budget. If `tokensRemaining` is consistently large (e.g., > 20% of budget), the candidate set may be too small or redundancy filtering is too aggressive. If `utilization` is consistently > 0.99, the budget may be too tight and relevant chunks are being dropped.

**`diversityScore`**

A quality metric for the selected set. Low diversity scores indicate the packer selected redundant chunks. With the MMR strategy, this score is expected to be higher than with greedy for the same candidate set. Useful for comparing strategy configurations in offline evaluation. Computing diversity requires O(K^2) pairwise similarities, where K is the number of selected chunks -- small in practice (K rarely exceeds 20).

**`positionQualityScore`**

Quantifies how well the ordering exploits the U-shaped attention model. With `ordering: 'u-shaped'`, this should be close to 1.0. With `ordering: 'natural'` using a greedy strategy (which outputs chunks in descending score order, which is NOT U-shaped -- it places the highest-relevance chunk at position 0 but the second-highest at position 1, accumulating low-relevance chunks at the end), the position quality score will be lower. This metric can guide the decision of whether U-shaped ordering is worth using for a given application.

**`excluded`**

A list of every chunk that was not packed, with a machine-readable `reason`. This is the primary debugging tool. If a highly-relevant chunk (high score) was excluded with `reason: 'redundant'`, it means there was a near-duplicate with a slightly higher score that was selected instead -- this is often correct behavior, but the `redundantWith` field lets the caller inspect which chunk it was similar to. If a high-score chunk was excluded with `reason: 'budget'`, the budget is too tight for the candidate set. If excluded with `reason: 'strategy'`, the MMR or coverage strategy deprioritized it in favor of more diverse chunks.

### Report Example

```typescript
{
  tokensUsed: 3842,
  totalTokensWithOverhead: 3882,          // 3842 + (8 chunks × 5 overhead tokens)
  budget: 4000,
  tokensRemaining: 118,
  utilization: 0.9705,
  selectedCount: 8,
  excludedCount: 7,
  diversityScore: 0.71,
  positionQualityScore: 0.94,             // near-perfect U-shape achieved
  strategy: 'mmr',
  ordering: 'u-shaped',
  excluded: [
    {
      id: 'chunk-3',
      content: '...',
      score: 0.82,
      tokens: 312,
      reason: 'redundant',
      redundantWith: 'chunk-1',
      similarity: 0.91,
    },
    {
      id: 'chunk-11',
      content: '...',
      score: 0.61,
      tokens: 287,
      reason: 'budget',
    },
    // ... more excluded entries
  ],
  timestamp: '2026-03-18T14:22:01.433Z',
  durationMs: 4,
}
```

---

## 11. Token Counting

### Built-In Approximate Counter

The default token counter uses the widely-adopted heuristic of 1 token per 4 characters:

```typescript
function approximateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}
```

This approximation is accurate to within ±15% for English text with GPT-family tokenizers (BPE tokenizers with ~50K vocabulary). It underestimates token counts for text with many rare words, code, or non-English content. For production use with tight token budgets, a pluggable exact counter is strongly recommended.

### Pluggable Counter

Any function with the signature `(text: string) => number` is a valid token counter. Common integrations:

```typescript
// tiktoken (OpenAI tokenizer, for GPT models)
import { encoding_for_model } from 'tiktoken';
const enc = encoding_for_model('gpt-4o');
const result = pack(chunks, {
  budget: 4000,
  tokenCounter: (text) => enc.encode(text).length,
});

// gpt-tokenizer (pure JS, no WASM)
import { encode } from 'gpt-tokenizer';
const result = pack(chunks, {
  budget: 4000,
  tokenCounter: (text) => encode(text).length,
});

// Anthropic tokenizer
import Anthropic from '@anthropic-ai/sdk';
const client = new Anthropic();
// Note: Anthropic's token counting is async; wrap in a synchronous approximation
// or pre-compute tokens and set chunk.tokens before calling pack()
```

### Pre-Computed Token Counts

When `ScoredChunk.tokens` is set, the packer uses that value directly and skips the token counter for that chunk. This enables callers to pre-compute exact token counts once (e.g., when storing chunks in a vector database) and avoid re-counting on every pack call. Chunks without `tokens` set are always counted by the configured `tokenCounter`.

---

## 12. Configuration Reference

All options with their defaults, types, and descriptions:

| Option | Type | Default | Description |
|---|---|---|---|
| `budget` | `number` | (required) | Maximum tokens for the packed context. Hard upper bound. |
| `strategy` | `PackStrategy` | `'greedy'` | Chunk selection algorithm. |
| `lambda` | `number` | `0.5` | MMR relevance-diversity tradeoff. [0, 1]. MMR only. |
| `maxClusters` | `number` | `8` | Maximum cluster count. Coverage only. |
| `clusteringThreshold` | `number` | `0.4` | Jaccard threshold for keyword-based clustering. Coverage only. |
| `customStrategy` | `CustomStrategyFn` | (none) | Custom selection function. Required when strategy='custom'. |
| `ordering` | `OrderingStrategy` | `'natural'` | Positional ordering strategy. |
| `customOrder` | `CustomOrderFn` | (none) | Custom comparator. Required when ordering='custom'. |
| `redundancyThreshold` | `number` | `0.85` | Similarity threshold above which a chunk is considered redundant. |
| `similarityMetric` | `'auto' \| 'cosine' \| 'jaccard'` | `'auto'` | Similarity metric for redundancy/MMR. |
| `chunkOverheadTokens` | `number` | `0` | Extra tokens per chunk for formatting overhead. |
| `tokenCounter` | `(text: string) => number` | approximate (÷4) | Token counting function. |
| `dpBudgetThreshold` | `number` | `16_000` | Max budget for exact DP in knapsack strategy. |
| `maxCandidates` | `number` | `Infinity` | Truncate candidate list to this length before strategy. |
| `includeSimilarityMatrix` | `boolean` | `false` | Include NxN similarity matrix in report. |

---

## 13. Integration

### With `context-budget`

`context-budget` allocates token budgets across prompt sections (system, tools, RAG, conversation, current message). The RAG section's allocated budget feeds directly into `context-packer` as the `budget` option:

```typescript
import { createBudget } from 'context-budget';
import { pack } from 'context-packer';

const budget = createBudget({
  model: 'gpt-4o',
  sections: {
    system: { basis: 500, shrink: 0 },
    rag: { basis: 0, grow: 2, shrink: 1 },
    conversation: { basis: 0, grow: 1, shrink: 1 },
    currentMessage: { basis: 'auto', shrink: 0 },
  },
  outputReservation: 4096,
});

const allocation = budget.allocate({
  system: 480,
  rag: Infinity,      // will be capped by the flex algorithm
  conversation: 6200,
  currentMessage: 180,
});

const result = pack(retrievedChunks, {
  budget: allocation.sections.rag,
  strategy: 'mmr',
  ordering: 'u-shaped',
});
```

### With `chunk-smart`

`chunk-smart` produces chunks from raw documents. Those chunks are embedded, stored in a vector database, and retrieved at query time. Retrieved chunks (with scores from the vector DB) are passed to `context-packer`:

```typescript
import { chunk } from 'chunk-smart';
import { pack } from 'context-packer';

// At indexing time:
const chunks = chunk(documentText, { maxChunkSize: 512 });
// ... generate embeddings, store in vector DB

// At query time:
const retrieved: ScoredChunk[] = await vectorDB.search(queryEmbedding, topK: 20);
const result = pack(retrieved, { budget: 4000, strategy: 'mmr' });
```

`chunk-smart`'s `Chunk` objects include token counts in their metadata. When mapping `chunk-smart` output to `ScoredChunk`, pass the token count through to avoid re-counting:

```typescript
const scoredChunks: ScoredChunk[] = retrieved.map(hit => ({
  id: hit.id,
  content: hit.chunk.content,
  score: hit.score,
  tokens: hit.chunk.metadata.tokenCount,   // from chunk-smart
  embedding: hit.embedding,
  metadata: hit.chunk.metadata,
}));
```

### With `fusion-rank`

`fusion-rank` combines retrieval results from multiple retrievers using Reciprocal Rank Fusion. Its output is a ranked list of chunks with fusion scores. These scores are directly usable as `ScoredChunk.score`:

```typescript
import { fuseRanks } from 'fusion-rank';
import { pack } from 'context-packer';

const fused = fuseRanks([vectorResults, bm25Results, rerankResults]);

const scoredChunks: ScoredChunk[] = fused.map(item => ({
  id: item.id,
  content: item.content,
  score: item.score,           // RRF score, normalized to [0, 1]
  embedding: item.embedding,
  metadata: item.metadata,
}));

const result = pack(scoredChunks, {
  budget: 4000,
  strategy: 'mmr',   // MMR still adds value on top of fusion: fusion ranks,
                     // MMR selects the top-ranked diverse subset
  ordering: 'u-shaped',
});
```

### With `rag-prompt-builder`

`rag-prompt-builder` takes an ordered array of chunks and assembles them into a formatted prompt section with citation markers, source metadata, and structural separators. `context-packer`'s output feeds directly into it:

```typescript
import { pack } from 'context-packer';
import { buildRagSection } from 'rag-prompt-builder';

const result = pack(retrievedChunks, { budget: 4000 });

const ragSection = buildRagSection(result.chunks, {
  includeSourceMetadata: true,
  citationStyle: 'numbered',
});
```

Set `chunkOverheadTokens` in `context-packer` to account for the tokens that `rag-prompt-builder` will add per chunk (citation markers, separators), so that the total assembled section fits within the budget:

```typescript
const result = pack(chunks, {
  budget: 4000,
  chunkOverheadTokens: 12,  // "[1] Source: ...\n---\n" ≈ 12 tokens per chunk
});
```

---

## 14. CLI

### Installation and Invocation

```bash
# Global install
npm install -g context-packer
context-packer --budget 4000 --strategy mmr --ordering u-shaped < chunks.json

# npx
npx context-packer --budget 4000 < chunks.json

# As a pipeline stage
retriever --query "..." | context-packer --budget 4000 --strategy mmr | prompt-builder
```

### Input Format

The CLI reads a JSON array of `ScoredChunk` objects from stdin:

```json
[
  {
    "id": "chunk-1",
    "content": "LLMs process context as a sequence...",
    "score": 0.92,
    "tokens": 45,
    "metadata": { "sourceId": "doc-42" }
  },
  {
    "id": "chunk-2",
    "content": "The attention mechanism in transformers...",
    "score": 0.87,
    "tokens": 62
  }
]
```

### Output Format

By default, the CLI writes a JSON object to stdout:

```json
{
  "chunks": [...],   // PackedChunk[]
  "report": {...}    // PackReport
}
```

With `--chunks-only`, only the `PackedChunk[]` array is written.
With `--report-only`, only the `PackReport` is written.

### Flags

| Flag | Short | Type | Default | Description |
|---|---|---|---|---|
| `--budget` | `-b` | number | (required) | Token budget. |
| `--strategy` | `-s` | string | `greedy` | Packing strategy: greedy, mmr, knapsack, coverage. |
| `--lambda` | `-l` | number | `0.5` | MMR lambda. |
| `--ordering` | `-o` | string | `natural` | Ordering: natural, u-shaped, chronological, chronological-desc. |
| `--redundancy-threshold` | `-r` | number | `0.85` | Redundancy similarity threshold. |
| `--chunk-overhead` | | number | `0` | Per-chunk overhead tokens. |
| `--max-candidates` | | number | (none) | Limit candidate set size. |
| `--chunks-only` | | boolean | `false` | Output only the packed chunks array. |
| `--report-only` | | boolean | `false` | Output only the pack report. |
| `--pretty` | `-p` | boolean | `false` | Pretty-print JSON output. |
| `--similarity-matrix` | | boolean | `false` | Include similarity matrix in report. |

### Exit Codes

| Code | Meaning |
|---|---|
| 0 | Pack completed successfully. |
| 1 | Invalid input (malformed JSON, missing required fields). |
| 2 | Configuration error (invalid option values, conflicting flags). |
| 3 | No chunks could be selected (all chunks exceed budget individually). |

### CLI Examples

```bash
# Basic greedy packing with 4000-token budget
context-packer --budget 4000 < scored_chunks.json

# MMR with diversity emphasis, U-shaped ordering, pretty output
context-packer --budget 4000 --strategy mmr --lambda 0.4 --ordering u-shaped --pretty \
  < scored_chunks.json

# Knapsack for optimal token utilization
context-packer --budget 4000 --strategy knapsack < scored_chunks.json

# Report only, for debugging why specific chunks were excluded
context-packer --budget 4000 --strategy mmr --report-only --pretty < scored_chunks.json

# Pipeline: retrieve → pack → count remaining tokens
context-packer --budget 4000 --chunks-only < retrieved.json | jq 'map(.tokens) | add'
```

---

## 15. Error Handling

### `PackError`

A `PackError` is thrown when the packing configuration is invalid or the input cannot be processed. It extends `Error` with a `code` field for programmatic handling.

```typescript
class PackError extends Error {
  readonly code: PackErrorCode;
  readonly details?: Record<string, unknown>;
}

type PackErrorCode =
  | 'INVALID_BUDGET'         // budget <= 0 or not a finite number
  | 'INVALID_LAMBDA'         // lambda outside [0, 1]
  | 'INVALID_THRESHOLD'      // redundancyThreshold outside [0, 1]
  | 'MISSING_CUSTOM_STRATEGY'// strategy='custom' but no customStrategy provided
  | 'MISSING_CUSTOM_ORDER'   // ordering='custom' but no customOrder provided
  | 'COSINE_WITHOUT_EMBEDDINGS' // similarityMetric='cosine' but chunks have no embeddings
  | 'NO_CHUNKS_FIT'          // every candidate chunk exceeds the budget individually
  | 'INVALID_CHUNKS'         // chunks is not an array, or entries are missing required fields
```

### `NO_CHUNKS_FIT` Handling

When every candidate chunk exceeds the token budget individually, the packer throws a `PackError` with code `'NO_CHUNKS_FIT'` by default. This is a programmer error: either the budget is too small or the chunks are too large. The error details include the smallest chunk's token count and the configured budget.

Callers who want to handle this gracefully can catch the error and return an empty result:

```typescript
import { pack, PackError } from 'context-packer';

let result;
try {
  result = pack(chunks, { budget });
} catch (e) {
  if (e instanceof PackError && e.code === 'NO_CHUNKS_FIT') {
    result = { chunks: [], report: e.details?.partialReport };
  } else {
    throw e;
  }
}
```

---

## 16. Testing Strategy

### Unit Tests

Each packing strategy is tested independently with deterministic inputs. Embedding vectors are seeded synthetically to produce known similarity values.

**Strategy correctness tests:**
- Greedy: given N chunks with known scores and sizes, verify the selected set is the optimal top-K that fits within the budget. Test boundary cases (chunk exactly fits, chunk is 1 token over budget, all chunks identical size).
- MMR: given chunks with known pairwise similarities (embedding vectors constructed to produce exact cosine similarities), verify that the selected set increases in diversity as lambda decreases. Verify the formula is computed correctly at each iteration.
- Knapsack DP: verify that the selected set maximizes total score within the budget. Compare against brute-force enumeration for small inputs (N=10, budget=100 tokens).
- Knapsack greedy approximation: verify it activates at `dpBudgetThreshold` and produces results within 15% of optimal (computed by the DP for a translated/scaled version of the same problem).
- Coverage: verify that when N chunks belong to K distinct clusters (perfectly dissimilar embeddings), the selected set contains at least one chunk from each cluster (when budget allows).
- Custom: verify that the custom function's return value is respected, and that the packer validates the output fits within the budget.

**Redundancy filtering tests:**
- Verify that a chunk with similarity >= threshold to a higher-scored chunk is excluded with reason 'redundant'.
- Verify that filtering with threshold=1.0 passes all chunks through.
- Verify that filtering with cosine metric requires embeddings and falls back correctly.
- Verify the `redundantWith` and `similarity` fields on the excluded entry.

**Ordering tests:**
- U-shaped: for 6 chunks with known scores, verify each chunk ends up at the correct position by the interleaving algorithm. Verify position quality score is ~1.0.
- Natural: verify selection order is preserved.
- Chronological: verify ascending/descending sort by `metadata.timestamp`. Verify fallback ordering for chunks without timestamps.
- Custom: verify the caller-supplied comparator is applied correctly.

**Budget enforcement tests:**
- Verify the total token count of selected chunks never exceeds `budget`.
- Verify `chunkOverheadTokens` is included in the budget accounting.
- Verify pre-computed `chunk.tokens` is used when present and not re-counted.

**PackReport accuracy tests:**
- Verify `tokensUsed` matches the sum of selected chunks' token counts.
- Verify `utilization` = tokensUsed / budget.
- Verify `excluded` contains every input chunk not in the selected set.
- Verify diversity score computation against manually computed pairwise similarities.
- Verify position quality score against manually computed Pearson correlation.

### Integration Tests

Test the complete pipeline end-to-end:

- `createPacker` factory with overrides: verify that overrides on `pack()` take precedence over factory config.
- Integration with pre-computed token counts: chunks with `tokens` set are not re-counted; chunks without are counted.
- Large N: 200 candidate chunks with mixed embeddings; verify the packer completes in < 100ms and produces a valid result.
- Zero-budget: verify `PackError` with `INVALID_BUDGET`.
- Empty candidates: verify `PackResult` with empty `chunks` and zero `tokensUsed`.

### Property-Based Tests

Using a property-based testing framework (fast-check):

- Budget invariant: for any valid input and budget, the sum of selected chunk tokens never exceeds budget.
- Redundancy invariant: for any two selected chunks, their similarity is < redundancyThreshold (within floating-point tolerance).
- Coverage invariant: for coverage strategy, if there are K clusters and the budget allows at least one chunk from each, at least one chunk from each cluster is selected.
- Position quality monotonicity: U-shaped ordering achieves a position quality score >= any random permutation of the same selected set (verified by simulation with 100 random permutations).

### Performance Benchmarks

Measured on Node.js 22, Apple M3:

| Scenario | N candidates | Budget | Strategy | Expected time |
|---|---|---|---|---|
| Greedy, no embeddings | 50 | 4,000 | greedy | < 5ms |
| MMR, with embeddings, dim=1536 | 50 | 4,000 | mmr | < 20ms |
| MMR, no embeddings, Jaccard | 50 | 4,000 | mmr | < 10ms |
| Knapsack DP | 50 | 8,000 | knapsack | < 15ms |
| Knapsack greedy approx | 50 | 20,000 | knapsack | < 5ms |
| Coverage, K=8, with embeddings | 100 | 4,000 | coverage | < 30ms |
| All strategies | 200 | 4,000 | greedy | < 10ms |

These targets are test-enforced. Any pull request that causes a benchmark to exceed 2x the target triggers a performance regression flag.

---

## 17. Performance

### Time Complexity

| Strategy | Time Complexity | Notes |
|---|---|---|
| Greedy | O(N log N) | Dominated by sort. |
| MMR (cosine) | O(N^2 * D) | N iterations, each computing K cosine sims. D=embedding dimension. |
| MMR (Jaccard) | O(N^2 * T) | T=average token set size. Slower than cosine for large T. |
| Knapsack DP | O(N * B) | B=budget in tokens. Activates for B <= dpBudgetThreshold. |
| Knapsack greedy | O(N log N) | For B > dpBudgetThreshold. |
| Coverage (K-means) | O(N * K * iter * D) | iter=K-means iterations (default 10), D=embedding dimension. |
| Coverage (keyword) | O(N^2 * T) | Pairwise Jaccard for clustering. |
| Redundancy filtering | O(N^2 * sim) | Pre-strategy; O(N*K*sim) if interleaved with MMR. |

### Space Complexity

| Structure | Size | Notes |
|---|---|---|
| Similarity matrix | O(N^2) | Only when includeSimilarityMatrix=true. |
| Knapsack DP table | O(B) | B=budget in tokens. |
| Chunk copies | O(N) | Input chunks are not mutated; output is a new array. |

### Optimization Notes

- The packer never mutates input `ScoredChunk` objects. Outputs are new `PackedChunk` objects constructed from input data.
- For large N (> 100 candidates), set `maxCandidates` to pre-filter to the top M chunks by relevance score before running the O(N^2) strategies. A typical effective value is `maxCandidates: 50` -- MMR on 50 pre-filtered candidates is fast and loses very little quality compared to running on all 200 candidates.
- Embedding vectors are not normalized in the input; the cosine similarity computation normalizes on every call. For repeated similarity computations (as in MMR), the norms are cached in a WeakMap keyed on the embedding array reference, avoiding recomputation when the same array is reused.
- Token counting is the most frequently called operation. Pre-computing `chunk.tokens` at indexing time and passing them through the retrieval pipeline is the highest-impact optimization for token-counting throughput.

---

## 18. Dependencies

### Runtime Dependencies

None. The package is implemented using pure JavaScript with no runtime npm dependencies. All algorithms (cosine similarity, Jaccard similarity, K-means, DP, Pearson correlation) are implemented inline.

### Development Dependencies

```json
{
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.6.0",
    "fast-check": "^3.19.0",
    "@types/node": "^20.0.0",
    "eslint": "^9.0.0"
  }
}
```

### Peer Dependencies

None. Callers may optionally use `tiktoken`, `gpt-tokenizer`, or `@anthropic-ai/sdk` for exact token counting, and any embedding provider SDK for generating embedding vectors, but none of these are required or depended upon by the package.

---

## 19. File Structure

```
context-packer/
├── src/
│   ├── index.ts              # Public API: exports pack, createPacker, PackError, all types
│   ├── types.ts              # All TypeScript interfaces and type aliases
│   ├── pack.ts               # Core pack() function and createPacker() factory
│   ├── strategies/
│   │   ├── index.ts          # Strategy dispatcher (selects strategy based on options)
│   │   ├── greedy.ts         # Greedy relevance strategy
│   │   ├── mmr.ts            # Maximal Marginal Relevance strategy
│   │   ├── knapsack.ts       # Budget-optimal knapsack strategy (DP + greedy fallback)
│   │   └── coverage.ts       # Coverage/clustering strategy
│   ├── ordering/
│   │   ├── index.ts          # Ordering dispatcher
│   │   ├── u-shaped.ts       # U-shaped positional ordering
│   │   └── chronological.ts  # Chronological ordering
│   ├── similarity/
│   │   ├── index.ts          # Similarity dispatcher (cosine vs. Jaccard auto-selection)
│   │   ├── cosine.ts         # Cosine similarity with norm caching
│   │   └── jaccard.ts        # Jaccard trigram similarity
│   ├── redundancy.ts         # Standalone redundancy filtering
│   ├── token-counter.ts      # Default approximate token counter + pluggable interface
│   ├── scoring.ts            # Diversity score + position quality score computation
│   ├── report.ts             # PackReport assembly
│   └── errors.ts             # PackError class and PackErrorCode type
├── cli/
│   └── index.ts              # CLI entrypoint (reads stdin, calls pack, writes stdout)
├── src/__tests__/
│   ├── pack.test.ts          # Integration tests for pack() and createPacker()
│   ├── greedy.test.ts        # Unit tests for greedy strategy
│   ├── mmr.test.ts           # Unit tests for MMR strategy
│   ├── knapsack.test.ts      # Unit tests for knapsack strategy (DP + greedy)
│   ├── coverage.test.ts      # Unit tests for coverage strategy
│   ├── u-shaped.test.ts      # Unit tests for U-shaped ordering
│   ├── redundancy.test.ts    # Unit tests for redundancy filtering
│   ├── scoring.test.ts       # Unit tests for diversity and position quality scores
│   ├── similarity.test.ts    # Unit tests for cosine and Jaccard similarity
│   ├── token-counter.test.ts # Unit tests for token counting with pre-computed tokens
│   ├── cli.test.ts           # CLI end-to-end tests (spawn process, verify stdout)
│   └── properties.test.ts    # Property-based tests (fast-check)
├── package.json
├── tsconfig.json
├── SPEC.md
└── README.md
```

---

## 20. Implementation Roadmap

### Phase 1: Core Infrastructure

1. Define all TypeScript types (`types.ts`, `errors.ts`).
2. Implement the approximate token counter and pluggable interface (`token-counter.ts`).
3. Implement cosine similarity with norm caching (`similarity/cosine.ts`).
4. Implement Jaccard trigram similarity (`similarity/jaccard.ts`).
5. Implement auto-selection similarity dispatcher (`similarity/index.ts`).
6. Write unit tests for all similarity functions.

### Phase 2: Selection Strategies

7. Implement greedy relevance strategy (`strategies/greedy.ts`). Write tests.
8. Implement MMR strategy (`strategies/mmr.ts`). Write tests verifying the formula at each iteration.
9. Implement knapsack DP + greedy fallback (`strategies/knapsack.ts`). Write tests including brute-force comparison for small inputs.
10. Implement coverage/clustering strategy (`strategies/coverage.ts`). Write tests.
11. Implement standalone redundancy filtering (`redundancy.ts`). Write tests.
12. Implement strategy dispatcher (`strategies/index.ts`).

### Phase 3: Ordering

13. Implement U-shaped ordering (`ordering/u-shaped.ts`). Write tests verifying every position for small N.
14. Implement chronological ordering (`ordering/chronological.ts`). Write tests including fallback for missing timestamps.
15. Implement ordering dispatcher (`ordering/index.ts`).

### Phase 4: Reporting and Scoring

16. Implement diversity score computation (`scoring.ts`).
17. Implement position quality score computation (`scoring.ts`).
18. Implement PackReport assembly (`report.ts`). Write tests verifying all report fields.

### Phase 5: Core API

19. Implement `pack()` function (`pack.ts`): orchestrate redundancy filtering, strategy, ordering, scoring, reporting.
20. Implement `createPacker()` factory (`pack.ts`).
21. Implement main export (`index.ts`).
22. Write integration tests for `pack()` and `createPacker()` covering all strategy/ordering combinations.
23. Write property-based tests (`properties.test.ts`).

### Phase 6: CLI

24. Implement CLI entrypoint (`cli/index.ts`): parse flags, read stdin, call `pack()`, write stdout.
25. Write CLI tests (spawn process, pipe JSON, verify stdout).
26. Register CLI binary in `package.json`.

### Phase 7: Performance Validation

27. Write benchmark suite covering all strategies at N=50, N=200.
28. Enforce benchmark targets in CI.
29. Optimize norm caching and Jaccard computation if benchmarks miss targets.

---

## 21. Example Use Cases

### Example 1: Standard RAG Pipeline Packing

A document Q&A system retrieves 20 candidate chunks from a vector database for each query. The RAG context section has a 4,000-token budget (determined by `context-budget`). The team uses MMR with U-shaped ordering to maximize diversity and mitigate the lost-in-the-middle effect:

```typescript
import { pack } from 'context-packer';
import { encode } from 'gpt-tokenizer';

const retrievedChunks = await vectorDB.search({
  vector: queryEmbedding,
  topK: 20,
  includeVectors: true,  // return embeddings for cosine similarity in MMR
});

const result = pack(
  retrievedChunks.map(hit => ({
    id: hit.id,
    content: hit.text,
    score: hit.score,
    tokens: hit.tokenCount,     // pre-computed at indexing time
    embedding: hit.vector,
    metadata: { sourceId: hit.documentId, timestamp: hit.publishedAt },
  })),
  {
    budget: ragBudget,          // from context-budget allocation
    strategy: 'mmr',
    lambda: 0.6,                // slightly favor relevance over diversity
    ordering: 'u-shaped',
    redundancyThreshold: 0.85,
    chunkOverheadTokens: 8,     // "[1] Source: doc-id\n" ≈ 8 tokens
    tokenCounter: (text) => encode(text).length,
  }
);

console.log(`Packed ${result.report.selectedCount} chunks using ${result.report.tokensUsed} tokens`);
console.log(`Diversity score: ${result.report.diversityScore?.toFixed(2)}`);
console.log(`Position quality: ${result.report.positionQualityScore?.toFixed(2)}`);

// Pass to rag-prompt-builder
const ragSection = buildRagSection(result.chunks);
```

### Example 2: Budget-Constrained Context with Knapsack

A production assistant uses an 8K-token model with tight cost controls. The RAG section budget is only 2,000 tokens. Retrieved chunks vary widely in size (50-400 tokens each). Knapsack maximizes total relevance within the exact budget:

```typescript
import { pack } from 'context-packer';

const result = pack(retrievedChunks, {
  budget: 2000,
  strategy: 'knapsack',
  ordering: 'u-shaped',
  redundancyThreshold: 0.90,   // slightly higher threshold: keep near-paraphrases
                                // since budget is tight and we want maximum coverage
  tokenCounter: exactTokenCounter,
});

// Inspect how much budget was used
console.log(`Used ${result.report.tokensUsed} / 2000 tokens (${(result.report.utilization * 100).toFixed(1)}%)`);
// > Used 1987 / 2000 tokens (99.4%)  -- knapsack fills the budget tightly
```

### Example 3: Diverse Retrieval for Research Synthesis

A research synthesis tool retrieves 30 chunks from a large scientific literature corpus. The query is broad ("recent advances in protein folding prediction"). Coverage strategy ensures representation across topically distinct sub-areas (ML methods, experimental validation, computational efficiency, clinical applications):

```typescript
import { createPacker } from 'context-packer';

const packer = createPacker({
  budget: 6000,
  strategy: 'coverage',
  maxClusters: 6,              // expect ~6 sub-topics in the result set
  ordering: 'u-shaped',
  tokenCounter: exactTokenCounter,
});

// Same packer reused across many synthesis queries
for (const query of synthesisQueue) {
  const chunks = await retrieve(query, topK: 30);
  const result = packer.pack(chunks);
  await synthesize(query, result.chunks);
}
```

### Example 4: Debugging a Packing Decision

An engineer investigates why the answer to a specific query was poor. They inspect the pack report to see which chunks were excluded and why:

```bash
# Generate scored chunks for the query (from retrieval logs)
cat query_chunks.json | \
  context-packer --budget 4000 --strategy mmr --ordering u-shaped \
                 --report-only --pretty

# Output:
# {
#   "tokensUsed": 3891,
#   "budget": 4000,
#   "selectedCount": 9,
#   "excludedCount": 11,
#   "diversityScore": 0.68,
#   "positionQualityScore": 0.96,
#   "excluded": [
#     { "id": "chunk-7", "score": 0.83, "reason": "redundant",
#       "redundantWith": "chunk-2", "similarity": 0.91 },
#     { "id": "chunk-14", "score": 0.71, "reason": "budget" },
#     ...
#   ]
# }
```

The engineer sees that `chunk-7` (score 0.83, highly relevant) was excluded as redundant with `chunk-2` (similarity 0.91). Inspecting both chunks reveals they are near-paraphrases from the same source document. The behavior is correct: including both would waste ~300 tokens on duplicate information. If the engineer wants to retain both, they lower `redundancyThreshold` to 0.92.

### Example 5: Comparing Strategies Offline

An evaluation engineer compares greedy vs. MMR vs. knapsack across 100 test queries to choose the best strategy for their use case:

```typescript
import { pack } from 'context-packer';

const strategies = ['greedy', 'mmr', 'knapsack'] as const;
const results: Record<string, { diversity: number[]; utilization: number[] }> = {
  greedy: { diversity: [], utilization: [] },
  mmr: { diversity: [], utilization: [] },
  knapsack: { diversity: [], utilization: [] },
};

for (const testCase of evalDataset) {
  for (const strategy of strategies) {
    const result = pack(testCase.chunks, {
      budget: 4000,
      strategy,
      lambda: 0.5,
      ordering: 'u-shaped',
    });
    results[strategy].diversity.push(result.report.diversityScore ?? 0);
    results[strategy].utilization.push(result.report.utilization);
  }
}

for (const strategy of strategies) {
  const avgDiversity = average(results[strategy].diversity);
  const avgUtilization = average(results[strategy].utilization);
  console.log(`${strategy}: diversity=${avgDiversity.toFixed(3)}, utilization=${avgUtilization.toFixed(3)}`);
}
// greedy:   diversity=0.52, utilization=0.91
// mmr:      diversity=0.74, utilization=0.89
// knapsack: diversity=0.53, utilization=0.99
```

---

## 22. Prior Art and Alternatives

### LangChain `ContextualCompressionRetriever`

LangChain provides a `ContextualCompressionRetriever` that wraps a base retriever and applies a `DocumentCompressor` to filter or compress retrieved documents. The `EmbeddingsFilter` compressor filters documents below a similarity threshold. This is the closest existing tool to `context-packer`. However, it operates as a retriever wrapper (tightly coupled to LangChain's retriever abstraction), applies only a similarity threshold filter (no budget awareness, no MMR, no positional ordering), and requires LangChain's full framework. `context-packer` is framework-independent, budget-aware, strategy-configurable, and produces a structured report.

### LlamaIndex `SentenceWindowNodePostprocessor` / `MetadataReplacementPostProcessor`

LlamaIndex provides node postprocessors that filter and transform retrieved nodes. The `SentenceWindowNodePostprocessor` replaces nodes with their surrounding window. None of LlamaIndex's postprocessors implement budget-aware selection, MMR diversity, or positional reordering. They require the LlamaIndex framework.

### Manual Implementation Patterns

The most common approach is `retrievedChunks.slice(0, maxChunks)` on the result of a vector DB query. This ignores budget, diversity, and ordering entirely. The second most common approach adds a character or token count check in a loop. Neither approach is equivalent to MMR or knapsack selection, and neither considers positional bias.

`context-packer` provides these capabilities as a composable, testable, zero-dependency package that works with any retrieval system.
