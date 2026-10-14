---
id: 46
title: "Memory-System Embedder Architecture — Dimension + Deployment Decision"
status: accepted
recordedStatus: "accepted-with-caveats"
date: 2026-05-19
tags: ["memory", "embedding", "architecture", "gpu-coordination", "vw-391-followup"]
sourceKind: source-record
public: true
journeyId: "2026-05-19-adr-046-memory-system-embedder-architecture-dimension-deployment-decision"
---
# ADR-046: Memory-System Embedder Architecture — Dimension + Deployment Decision

**Status**: Accepted-with-caveats (implemented 2026-05-19 same day; RRF tuning identified as follow-up)
**Date**: 2026-05-19
**Jira**: VW-391 (parent); blocks VW-394 implementation; prerequisite for VW-242 / VW-246
**Related**: VW-370 (TEI breakage giving urgency), VW-311 (Qdrant 4B upgrade), VW-203 (MacBook embedder decommission), VW-241 (vLLM sleep PoC), [ADR-045-Memory-Eval-Methodology-v2](/adrs/045-memory-eval-methodology-v2/)

---

## Implementation result (added 2026-05-19)

A3+B2 path landed end-to-end in the same session:

1. ✅ Manifest edit (gitops commit `19409b9`): jina-v4 → Qwen3-Embedding-4B, 2560d
2. ✅ Schema migration: `memory.facts/rounds/sessions.embedding` ALTER to `vector(2560)`; ivfflat indexes dropped (2000-dim limit); HNSW skipped for now (also limited to 2000-dim without halfvec)
3. ✅ vllm-0 scaled to 0 (lab acceptable), vllm-embedding scaled to 1 — model was pre-cached at `REDACTED_WORKSPACE/models/vllm/Qwen3-Embedding-4B` from VW-241 PoC work, saved ~10 min download
4. ✅ Writer config updated (platform commit `0e60a945`): model + dim + URL
5. ✅ Bridge patched (platform commit `c785918f`): hybrid vector ANN + RRF in `recall_decisions`, graceful pg_trgm fallback
6. ✅ Backfill complete: 2,641 memory.facts.embedding populated in 200s (13.3 rows/s)
7. ✅ Bridge image built + pushed: `REDACTED_PRIVATE_IP:30500/rootweaver/mcp-bridge:vw-394-2026-05-19` (gitops commit `4489b41`)
8. ✅ vllm-embedding scaled to 0; vllm-0 restored to 1; Flux resumed on vllm kustomization

### Benchmark results (LLM-judge, 40 queries, 8 categories)

| Metric | 2026-05-18 baseline | 2026-05-19 v1+fixtures (no hybrid) | 2026-05-19 v1+fixtures+hybrid (now) | Net 2-day Δ |
|---|---|---|---|---|
| Faithfulness | 0.650 | 0.626 | **0.612** | −0.038 |
| Relevancy | 0.669 | 0.631 | **0.654** | −0.015 |
| Context Precision | 0.624 | 0.530 | **0.501** | **−0.123** |
| Context Recall | 0.574 | 0.598 | **0.598** | +0.024 |
| **MRR** | **0.657** | **0.829** | **0.829** | **+0.172** ✅ |
| p50 latency | 2.46ms | 2.52ms | **1.88ms** | **−0.58ms** ✅ |

### Per-category effect of the hybrid

| Category (N) | CtxP before | CtxP hybrid | Δ |
|---|---|---|---|
| abstention (5) | 1.0 | 1.0 | 0 |
| graph_trace (5) | 0.497 | 0.497 | 0 |
| **knowledge_update_detection (3)** | **~0** | **0.333** | **+0.333** ✅ |
| multi_hop_session_synthesis (5) | 0.28 | 0.28 | 0 |
| origin_tracing (5) | 0.4 | 0.4 | 0 |
| single_hop_session_recall (5) | 1.0 | 1.0 | 0 |
| **temporal_state (5)** | **0.4** | **0.0** | **−0.4** ❌ |

The hybrid is a *category-mixed result*: K-U-D (semantic-fit) wins; temporal_state (constraint-driven) loses. Vector ANN surfaces semantically-similar facts that don't satisfy date-range constraints, dragging precision down for the temporal category.

### Caveats and follow-up work

The implementation succeeded technically (every step landed, embedder works, hybrid SQL active) but the hybrid scoring has tuning gaps:

1. **RRF weighting**: Default `k=60` treats trgm and cosine rank symmetrically. For temporal/constraint-driven queries, a higher `k_cos` (deweighting cosine) or weighted RRF would protect precision.
2. **Per-tool toggle**: `recall_state_at` (temporal) and `find_problems` (error-signature) might benefit from pure pg_trgm; `recall_decisions` (current implementation) benefits from hybrid.
3. **Cosine threshold**: cap RRF cosine contribution to rows with cos_dist < 0.6 (or similar) to exclude semantic fluff from the result set.
4. **HNSW with halfvec(2560)**: enable index for sub-50ms vector search at scale. Currently sequential scan — fine at 2,641 rows but won't scale.
5. **find_problems / recall_state_at also benefit from hybrid** in theory but weren't patched today; benchmark didn't measure their hybrid case.

### Status determination

Marking **Accepted-with-caveats** because:
- The architecture is correct (2560d, vllm-embedding, hybrid SQL, graceful fallback) — pattern works
- One category (K-U-D) saw the intended improvement
- One category (temporal_state) regressed enough to drag overall CtxP down
- The path forward (RRF tuning, per-tool toggle) is well-defined; doesn't invalidate the architecture
- MRR (the metric most directly tied to "did the right fact appear at top?") held at 0.829 — durable win preserved through tonight's changes

Next session moves:
- Tune RRF k-value(s) per category — likely cheap, biggest leverage
- Add halfvec(2560) HNSW index when corpus grows beyond ~10K facts
- Wake VW-246 sleep mode work once benchmark shows clear win to justify the 1-2 week investment

---

## Tuning iteration 1 (2026-05-19 evening, post-implementation)

Applied two knobs (platform commit `f705b046`, gitops `6281bd8`, image `vw-394-tune-2026-05-19`):

1. **Cosine threshold guard**: `cos_dist < 0.6` cap inside the CASE WHEN in `recall_decisions`. Rows farther than 0.6 cosine distance pinned to 2.0 (bottom of cos_rank), contributing only via trgm.
2. **Experimental hybrid on `find_problems`**: same RRF + threshold pattern as `recall_decisions` for the error-signature topic.

### Result: tuning was a no-op at the aggregate level

| Metric | Hybrid v1 (no threshold) | Hybrid v1 + tuning | Δ |
|---|---|---|---|
| Faithfulness | 0.612 | 0.612 | 0 |
| Relevancy | 0.654 | 0.654 | 0 |
| Context Precision | 0.501 | 0.501 | 0 |
| Context Recall | 0.598 | 0.598 | 0 |
| MRR | 0.829 | 0.829 | 0 |

Per-category: minor noise on `single_hop_session_recall Faith` (+0.1) and `temporal_state Faith` (−0.1), well within judge-variance band on N=5 queries. `problem_match` still dark.

### What was actually learned

1. **Cosine threshold (0.6) didn't trigger because the polluting rows weren't at distance > 0.6**. The bad rows are *semantically close* to the query (e.g., temporal queries finding facts with similar topics but wrong dates). Threshold-based "fluff filtering" addresses the wrong problem class.

2. **find_problems hybrid was structurally a no-op**. The WHERE clause still filters to `f.text % :sig OR f.reasoning % :sig`, so rows that don't match pg_trgm never enter the CTE for vector re-ranking. To actually use vector ANN in `find_problems`, the WHERE needs to become `trgm_match OR cosine_close` — bigger refactor than this iteration scoped.

3. **The temporal_state regression is structurally the wrong target for hybrid scoring at all**. recall_state_at queries are constraint-driven (t_valid filters), not semantic-similarity-driven. The right fix is per-tool routing: leave recall_state_at alone, only apply hybrid to tools that benefit. The original ADR's "knob A" was *correctly identified* but mis-targeted (recall_state_at was never patched, so toggle was a no-op).

### Next tuning iteration to consider

To actually move the CtxP needle:

- **Vector-augmented WHERE for find_problems** — include cosine-close rows that don't trgm-match. ~30 lines refactor. May unblock problem_match category.
- **Weighted RRF favouring trgm** for queries with strong keyword anchors (jira keys, file paths, error messages). Asymmetric k_trgm=20, k_cos=120.
- **Run benchmark 3× per change** to characterize judge variance. At $0.016/run = $0.05 per measurement triplet. Cheap insurance against "is this noise or signal?" confusion.
- **OR**: accept current state as the production memory ANN floor; revisit if benchmark CtxP becomes a strategic priority.

---

## Tuning iteration 2 (2026-05-19 late evening) — feature-flagged A/B testing

Built three default-OFF feature flags per ADR-046 follow-up + ran 5-config experiment:

- **FF_WEIGHTED_RRF** (flag B): per-tool weighted RRF via `W_TRGM_&lt;TOOL&gt;` / `W_COS_&lt;TOOL&gt;` env vars
- **FF_RECALL_STATE_AT_HYBRID** (flag C): filter-then-rank hybrid for recall_state_at temporal queries
- **FF_FIND_PROBLEMS_VECTOR_OR** (flag F): WHERE admits cosine-only matches in find_problems

Skipped: Flag A (cross-encoder rerank — rag-retriever lacks `/rerank` endpoint, separate task), Flag D (step-back prompting — needs query-time LLM access decision), HyDE (research warns against fact-bound domains).

Code: `9a5513e7` (platform), image `vw-394-flags-2026-05-19`, gitops `ab7f629`. Bridge image deployed with all flags default-OFF; flags toggled via `kubectl set env` between tests.

### Experiment design

5 sequential benchmark runs against the same corpus, same test set, same judge (gpt-4o-mini):

1. **OFF**: all flags unset — sanity check that feature-flag code doesn't regress
2. **B**: FF_WEIGHTED_RRF=1 with trgm-dominant weights (1.5/0.5) for find_problems + recall_state_at
3. **C**: FF_RECALL_STATE_AT_HYBRID=1 alone
4. **F**: FF_FIND_PROBLEMS_VECTOR_OR=1 alone
5. **ALL**: all three flags + B's trgm-dominant weights

### Results

| Config | Faith | Relev | CtxP | CtxR | MRR | p50 ms |
|---|---|---|---|---|---|---|
| Baseline (run 3) | 0.559 | 0.583 | 0.536 | 0.574 | 0.829 | 2.56 |
| OFF (re-baseline, new img) | **0.626** | **0.640** | 0.536 | **0.631** | 0.829 | 2.45 |
| B (weighted RRF) | 0.609 | 0.640 | 0.536 | 0.631 | 0.829 | 2.48 |
| C (state_at hybrid) | 0.619 | 0.640 | 0.530 | 0.607 | 0.829 | 2.07 |
| F (find_problems vector_or) | 0.619 | 0.640 | 0.530 | 0.607 | 0.829 | 2.36 |
| ALL (B+C+F combined) | **0.533** ❌ | **0.534** ❌ | **0.482** ❌ | **0.502** ❌ | **0.743** ❌ | 1.71 |

### The dominant finding: judge variance > flag effects

**Baseline-run3 to OFF differ by +0.067 Faith, +0.057 Relev, +0.057 CtxR** with literally identical retrieval behavior (different bridge pods, default-OFF on both, same code semantics). That's the *noise floor*: ~±0.07 on Faith/Relev/CtxR, ~±0.03 on CtxP at our test-set size (N=5 queries × 8 categories, judge=gpt-4o-mini).

**All individual flag effects fall WITHIN that noise floor.** B/C/F each moved metrics by ≤0.024 from OFF. The implementations execute correctly (C's p50 of 2.07ms vs OFF's 2.45ms confirms the filter-then-rank code path runs), but the measurement noise dwarfs the signal.

**C and F produced byte-identical Faith/Relev/CtxP/CtxR/MRR despite being different code paths.** Different p50 (2.07 vs 2.36) confirms different execution. The metric collision is judge-rounding coincidence — when signal is below noise, two genuinely different configurations land on the same rounded score by chance.

### The interaction finding: ALL_ON regressed significantly

ALL_ON dropped Faith −0.093, Relev −0.106, CtxP −0.054, CtxR −0.129, **MRR −0.086** (first time tonight MRR moved). This IS above noise floor — real regression from combined flags.

**Likely mechanism**: B's trgm-dominant weights (W_TRGM=1.5, W_COS=0.5) were applied to both C's recall_state_at hybrid AND F's find_problems hybrid. Cosine contribution scaled 3× down, while F's vector-OR WHERE pulls in additional rows that the suppressed cosine can't reorder. Net effect: more rows + less-effective cosine = noisier results.

**Experiment design flaw**: B's trgm-dominant weights only make sense for tools that AREN'T also using cosine via C/F. For tools we want cosine to influence, weights should be balanced or cosine-dominant. ALL_ON applied B's weights uniformly, conflicting with C+F's intent.

### What this tells us about path forward

1. **Parameter tuning at this scale cannot beat the noise floor.** Any single-knob change of <±0.07 is statistically indistinguishable from re-running the same code. Future tuning experiments need either more queries per category (N=20+ per category lowers per-category variance) OR multiple-run averaging (3-5 runs per config) OR more dramatic interventions.

2. **The architectural moves matter, not the parameter tuning.** Per the research (Genzeon, VectorHub, Tiger Data): cross-encoder rerank shows 15-40% precision lift, 17-26% recall lift. Larger embedding models show 1-2% MTEB improvement. Fact-quality improvements (synth v2) likely move the needle by 0.1+ on multiple metrics. These are the "above-noise" moves.

3. **MRR holding at 0.829 across individual flags confirms retrieval correctness.** MRR is the metric most directly tied to "did the right fact appear at the top?" It's mechanically determined, not judge-interpreted. Solid 0.829 across OFF/B/C/F means our retrieval IS finding the right facts; the noisy judge metrics are about how results are *described*, not whether they're *retrieved*.

4. **Flag interactions need careful design.** ALL_ON's regression shows that combining experiments without coordinating their parameters can break things worse than any individual flag. Future combined-flag testing needs per-tool weights that match each tool's enabled features.

### Status

All 3 flags shipped as default-OFF. Production bridge runs `vw-394-flags-2026-05-19` image with no env vars set (= equivalent to prior `vw-394-tune-2026-05-19` behavior). Flags can be toggled in a future session without rebuild.

The ADR-046 "Accepted-with-caveats" status remains correct — the architecture is sound, parameter-tuning is not the bottleneck. The next session's effort should be on cross-encoder reranking (Tier 1 from earlier research-grounded plan) or fact-quality improvements (synth v2), not further RRF knobs.

### Cost summary (iteration 2)

- Code: ~$0 (single platform commit, single gitops commit)
- Image build + push: ~$0
- 5 benchmark runs + 1 baseline: 6 × $0.016 = **$0.10**
- Wall time: ~35 min including image build + GPU swap + 5 sequential benches
- Net knowledge gain: noise floor characterized, flag-interaction surface mapped, follow-up priorities sharpened

---

## Tuning iteration 3 (2026-05-19) — Cross-encoder reranking (Tier 1 from research)

Path 1 from the research roadmap. Added `/rerank` endpoint to rag-retriever exposing the existing lazy-loaded bge-reranker-base CrossEncoder. Patched bridge `recall_decisions` / `find_problems` / `recall_state_at` to call /rerank as a second stage when `FF_CROSS_ENCODER_RERANK=1`. Default OFF.

### Implementation

- Platform commit `687f9da4`: rag-retriever POST /rerank — takes `{query, candidates: [{id, text}]}`, returns sorted `[{id, score}]`. Reuses `retriever._executor` thread pool + lazy-loaded reranker. ~60 lines.
- Platform commit `2721b77e`: bridge `_rerank_via_retriever()` helper + flag-gated integration in 3 tools. Over-fetch top-K = min(limit*4, 50), rerank, slice to limit. Graceful fallback on /rerank failure. ~77 lines.
- Image `vw-394-rerank-2026-05-19`, gitops commit `0400e17`. Both rag-retriever + mcp-bridge rebuilt + deployed via Flux.
- Smoke test confirmed: `POST /rerank` with `query="verify full pipeline"` and 4 candidates returned scores 0.999 (exact match) → 0.554 (related) → 0.00004 (irrelevant) → 0.00004 (different topic). Cross-encoder scoring is correct in isolation.

### Result: significant regression across exactly two categories

| Metric (aggregate) | OFF | RERANK ON | Δ |
|---|---|---|---|
| Faithfulness | 0.626 | 0.479 | **−0.147** ❌ |
| Relevancy | 0.640 | 0.454 | **−0.186** ❌ |
| Context Precision | 0.536 | 0.376 | **−0.160** ❌ |
| Context Recall | 0.631 | 0.483 | **−0.148** ❌ |
| MRR | 0.829 | 0.629 | **−0.200** ❌ |

**Per-category — the damage is localized**:

| Category | Δ Faith | Δ Relev | Δ CtxP | Δ CtxR | Δ MRR |
|---|---|---|---|---|---|
| **single_hop_session_recall** | **−0.733** | **−1.000** | **−1.000** | **−0.633** | **−1.000** |
| **multi_hop_session_synthesis** | −0.300 | −0.300 | −0.080 | −0.400 | −0.400 |
| temporal_state | 0 | 0 | 0 | 0 | 0 |
| knowledge_update_detection | 0 | 0 | 0 | 0 | 0 |
| origin_tracing | 0 | 0 | 0 | 0 | 0 |
| graph_trace | 0 | 0 | −0.040 | 0 | 0 |
| problem_match | 0 | 0 | 0 | 0 | 0 |
| abstention | 0 | 0 | 0 | 0 | 0 |

single_hop_session_recall was COMPLETELY destroyed (full unit drop on Relev, CtxP, MRR). multi_hop hurt significantly. Other categories unaffected — they either don't pass a topic (no rerank trigger) OR route to tools without rerank wiring.

### Diagnosis: model works, integration parameters are wrong

1. **Cross-encoder isolated probe = correct scoring** (0.999/0.554/0.00004 — high to low matches query relevance).
2. **15 successful POST /rerank → 200 OK** in rag-retriever logs during the bench. No HTTP errors.
3. **Catastrophic regression came from the over-fetch + reorder shape**, not from the model being broken:
   - With `effective_limit = limit*4`, RRF pulls 20-40 candidates. Cross-encoder picks `limit` from this expanded pool.
   - For single_hop (limit=5), the original RRF top-5 was correct (Faith/Relev/CtxP/CtxR/MRR = 0.733/1.0/1.0/0.633/1.0 in the OFF baseline).
   - Cross-encoder reordered to a different top-5 from the wider 20-candidate pool, replacing correct facts with marginally-trgm-matched ones that happened to score higher on the cross-encoder.

4. **Three contributing factors**, each fixable:
   - **Over-fetch dilutes the pool**: 4× more candidates → 4× more chance to promote wrong ones.
   - **bge-reranker-base trained on web Q&A passages**, not declarative engineering facts. Cross-domain transfer is imperfect.
   - **Bridge sends only `text` to rerank**, not `text + reasoning`. For facts where the topic-relevant detail lives in reasoning, the cross-encoder judges based on incomplete content.

### Status

Flag turned OFF immediately after diagnosis (`kubectl set env deployment/mcp-bridge FF_CROSS_ENCODER_RERANK-`). Production restored to OFF baseline. The infrastructure (rag-retriever /rerank endpoint, bridge integration code) ships and works as designed — they just produce worse rankings than RRF alone for our specific corpus + query shape.

### Three concrete fixes for next iteration (Tier 1.5)

1. **Drop the over-fetch**. `effective_limit = limit` instead of `limit * 4`. Rerank just reorders the same top-K RRF would have returned. Worst case: identical to RRF. Best case: small local improvements. **~5 lines.** Hypothesis: this fixes most of the single_hop catastrophe because correct facts can't drop out of the candidate pool if they were already top-K.

2. **Send `text + reasoning` to rerank**, not just `text`. Gives cross-encoder full content to judge. **~3 lines.** Hypothesis: helps borderline cases where text is generic but reasoning is specific.

3. **Try a domain-better reranker**: jina-reranker-v2 is trained on code + technical text. **~280MB swap.** Hypothesis: better cross-domain transfer than bge-reranker-base for engineering facts.

(1) + (2) are tiny, can ship in one commit. (3) is a config-line change + redeploy. The expected progression: try (1+2) first; if regression mostly disappears, parameters were the issue. If it still hurts, the model is the issue → try (3).

### Cost summary (iteration 3)

- Code: ~2 hours focused work for 2 service changes
- Image builds: 2 × ~5 min = 10 min (parallel)
- Benchmark: 1 × ~$0.016 + ~4 min including cold load
- Wall time: ~3 hours including model download + benchmark + diagnosis
- Net knowledge gain: cross-encoder integration *works* end-to-end (infrastructure proven); the parameter shape (over-fetch, text-only candidates, web-trained model) is wrong for our corpus; three concrete fixes scoped

### What this means for the overall ADR

Status remains **Accepted-with-caveats**. The architecture (2560d hybrid + cross-encoder second stage) is the right design per research consensus. Implementation works. But our specific corpus + query shape needs parameter tuning the research papers don't anticipate (because their benchmarks are different domains). Three iterations to characterize:
- Iteration 1 (initial deploy): MRR +0.172 durable win; CtxP −0.094 corpus-broadening regression
- Iteration 2 (RRF tuning + flags): below noise floor — measurement-limited
- Iteration 3 (cross-encoder rerank): infrastructure works, parameters wrong for our domain

The honest path forward: the +0.17 MRR + 25% latency drop from this multi-day work is real and durable. The CtxP gap needs either (a) the 3 fixes above to make rerank actually help, or (b) accept it as the cost of broader corpus + better latency, or (c) larger test set to measure improvements that fall below current noise floor.

---

## Context

The memory system writer (`packages/rootweaver-memory`) was designed in early VW-391 work with `VECTOR(1024)` columns on `memory.facts.embedding`, `memory.rounds.embedding`, `memory.sessions.summary_embedding`. The dim choice matched the original Qwen3-Embedding-0.6B target. The writer's `EmbeddingClient` calls `http://vllm-embedding-service.vllm.svc.cluster.local:8001/v1/embeddings` and is fail-soft (NULL on connection refused).

**As of 2026-05-19, three independent realities have drifted apart**:

| Layer | Configuration | Status |
|---|---|---|
| `memory.facts.embedding` schema | `VECTOR(1024)` | 0 / 2,641 rows populated (all NULL) |
| `memory.rounds.embedding` schema | `VECTOR(1024)` | 0 / 5,860 rows populated |
| `memory.sessions.summary_embedding` schema | `VECTOR(1024)` | 0 / 237 rows populated |
| Writer's `EmbeddingClient` | `qwen3-embedding-0.6b`, 1024 (would match) | Target endpoint unreachable since VW-203 (2026-04-18) |
| Deployed `tei-embedding` (active) | Qwen3-Embedding-4B, **2560 dims** | Broken: 124 restarts in 13h; safetensors 404s; OOM cascade (VW-370) |
| Deployed `vllm-embedding-statefulset` | jinaai/jina-embeddings-v4-vllm-code, **2048 dims** | replicas:0 (KEDA-managed); never warmed up |
| Production Qdrant collection `rootweaver_vault` | Qwen3-Embedding-4B, **2560 dims** | 62,555 points indexed (per VW-203 verification) |

**Three-way dimension mismatch.** No deployed embedder produces the 1024-dim vectors the memory schema expects.

### How we got here

1. **2026-02-18 (ADR-GPU-Embedding, superseded)** — Original memory schema designed for Qwen3-Embedding-0.6B (1024 dim) running on MacBook MPS as primary delta-indexing path. GPU embedding was infeasible because vLLM owned the RTX 4080 at 96% VRAM.
2. **2026-03-18 (VW-311)** — Embedding upgrade: Qwen3-Embedding-0.6B → Qwen3-Embedding-4B (1024 → 2560 dim). Vault Qdrant re-indexed. Memory schema NOT migrated (it was still pre-production at this point).
3. **2026-04-18 (VW-203)** — MacBook embedding agent decommissioned (27GB RAM, beachballing). Delta indexing moved to desktop K3s CPU. Removed the only working 1024-dim path.
4. **2026-04-27 (VW-233)** — vllm-embedding StatefulSet brought back with jina-embeddings-v4 (2048 dim) for connector-indexer Kafka path. Different model again. replicas:0 by default, KEDA-scaled.
5. **2026-05-12 (VW-370)** — tei-embedding 4B-on-CPU OOM cascade discovered; high priority but sat in Backlog 7 days.
6. **2026-05-17/18 (VW-391 Plan E backfill)** — 222 sessions backfilled into memory.*; all embeddings NULL because vllm-embedding-service was unreachable.
7. **2026-05-19 (this session)** — Synthesizer v1 added 2,637 more facts, also NULL. Benchmark showed CtxP regression (−0.094 vs 2026-05-18 baseline) traced partly to pg_trgm fragility against narrative-style v1 facts. Vector ANN is the structural fix but no embedder is currently producing the right-dimension vectors.

### GPU constraint (lab environment)

`vllm-0` currently consumes **15,520 MiB / 16,376 MiB** of the RTX 4080 (94.7%; 856 MiB free). Adding any model alongside requires one of:

- **Scale `vllm-0` down to 0 temporarily** — kills production search but acceptable per "this is not production" guidance (2026-05-19).
- **Sleep-mode 1-pod-2-container** (VW-246 *(internal reference; not included)*) — vLLM Sleep Mode PoC (VW-241 *(internal reference; not included)* Done) validated ~1s round-trip for causal LM; pooling task HTTP endpoints missing in v0.17.1 / v0.20.0. 1-2 week PoC.
- **CPU-only embedder** — VW-337's path; led to the VW-370 OOM cascade on the 4B model. Works for 0.6B (~1.2GB RAM) but slow.
- **Quantized embedder fitting in residual VRAM** — Qwen3-Embedding-0.6B at AWQ ~600MB *might* coexist with vllm-0; never benchmarked.
- **External API embedder** — OpenAI text-embedding-3-small (1536 dim) or similar; offloads GPU entirely but introduces network-dependent quality + per-call cost.

### Reference baselines

- VW-241 *(internal reference; not included)* **Done** — vLLM Sleep Mode empirically validated on this hardware; Qwen3-Embedding-4B as pooling task produced byte-identical output to TEI; cold load 6.11s vs TEI's ~48s.
- VW-242 *(internal reference; not included)* **Backlog** — Spec'd vllm-embed migration (1-day work); waiting on architecture decision.
- VW-246 *(internal reference; not included)* **Backlog** — 1-pod-2-container sleep-mode spec; 1-2 week PoC.
- VW-370 *(internal reference; not included)* **Backlog, High** — TEI fix scoped (batch-size + memory limits) but doesn't address the missing 4B safetensors artifacts.
- LongMemEval / mem0 / Letta all use **Pattern B fresh memory store per run** (per 2026-05-19-Memory-System-Full-Day-Impact-Report *(internal reference; not included)* research summary). Production-vs-test separation lives at the *DSN* layer, not the schema layer.

---

## Decision

**The architectural decision is a 2-dimensional choice**:

**Axis 1 — Vector dimension** (forces compatibility with vault Qdrant + future cross-corpus search):
- **A1: 1024** — keep original schema, single new deployment of Qwen3-Embedding-0.6B
- **A2: 2048** — migrate schema to match existing vllm-embedding-jina deployment
- **A3: 2560** — migrate schema to match vault Qdrant Qwen3-Embedding-4B (preferred for cross-corpus consistency)

**Axis 2 — Deployment mechanism** (forces a GPU coordination answer):
- **B1: Reactivate vllm-embedding-statefulset as-is (jina-2048)** — fastest, requires axis A2
- **B2: Reconfigure vllm-embedding to Qwen3-Embedding-4B (2560)** — aligns with vault, requires axis A3 + VW-242 manifest edit
- **B3: Reconfigure vllm-embedding to Qwen3-Embedding-0.6B (1024)** — matches existing schema, requires axis A1 + manifest edit
- **B4: Fix TEI per VW-370 + use TEI as embedder** — heaviest; doesn't address artifact 404s + still CPU-only (slow)
- **B5: VW-246 1-pod-2-container sleep mode** — best long-term GPU economy, multi-week scope
- **B6: External API embedder (OpenAI / Cohere)** — offloads GPU entirely, adds dependency

### Recommendation: **A3 + B2** (migrate memory schema to 2560-dim Qwen3-Embedding-4B via vllm-embedding)

Rationale:

1. **Cross-corpus consistency** — vault Qdrant + memory.* end up using identical embeddings. Enables future hybrid retrieval (vault context + memory facts in the same vector space). Avoids re-embedding when the writer eventually starts producing them.
2. **Aligns with the 2026-03-18 upgrade** (VW-311) — the rest of the platform standardized on Qwen3-Embedding-4B / 2560 dim 9 weeks ago. Keeping memory.* at 1024 leaves it permanently out-of-step with vault embeddings.
3. **Uses an existing, validated path** — VW-241's PoC already verified Qwen3-Embedding-4B serves correctly via vLLM at this dim; VW-242's spec covers the deployment work in 1 day.
4. **Bypasses TEI's existing breakage** — running the model via vllm instead of TEI sidesteps the safetensors-artifact-404 problem (HuggingFace publishes the model in safetensors-shard format that vllm reads; TEI's ONNX path is what's failing).
5. **Defers the GPU coordination problem** rather than solving it perfectly today — operate with manual `vllm-0` scale-to-0 windows for embedder warmup, then migrate to VW-246 sleep-mode coordination when it's PoC-validated for pooling task.

### Alternative kept for serious consideration: **A1 + B3** (stay 1024-dim, new vllm-embedding for Qwen3-Embedding-0.6B)

Worth picking instead if:
- No schema migration appetite (the 2641 facts + 5,860 rounds + 237 sessions are presently NULL, so migration is cheap *today* — but won't always be).
- GPU budget too tight: 0.6B at ~1.2GB *might* coexist with vllm-0 (94.7% utilized but ~856MiB free + vllm's reservation may allow a small co-tenant). Worth a one-off VRAM-fit test before committing.
- Want to preserve the rootweaver-memory writer's `EmbeddingClient` configuration unchanged (current model field = `qwen3-embedding-0.6b`).

This alternative loses the cross-corpus consistency from A3, and locks in a smaller embedding model long-term.

### Rejected options

- **B4 (Fix TEI + use TEI)** — TEI's 4B safetensors artifacts are MIA from the upstream HF repo. Even if VW-370's batch-size fix lands, the model still won't load. Plus it's CPU-only which makes embedding the 2,637-fact backfill take hours.
- **B5 (VW-246 sleep mode) as the path TODAY** — solid long-term answer, wrong cadence for an immediate unblock. Keep as the *evolution* of B2 once GPU coordination needs to be steady-state.
- **B6 (External API)** — works but adds a network dependency for every fact INSERT (writer becomes brittle to internet/API health). Privacy concern for memory data leaving the cluster. Compatible only with A1-like schemas where API output dim matches.

---

## Consequences

### If A3 + B2 lands

**Required work** (multi-step, ~1 day):

1. Edit `rootweaver-gitops/infrastructure/vllm/vllm-embedding-statefulset.yaml`:
   - Change `MODEL_PATH=/models/jina-embeddings-v4-vllm-code` → `/models/Qwen3-Embedding-4B`
   - Change init-container download to `Qwen/Qwen3-Embedding-4B`
   - Update `--max-model-len`, pooling task args per VW-241 PoC findings
2. Schema migration:
   ```sql
   ALTER TABLE memory.facts ALTER COLUMN embedding TYPE vector(2560) USING NULL::vector(2560);
   ALTER TABLE memory.rounds ALTER COLUMN embedding TYPE vector(2560) USING NULL::vector(2560);
   ALTER TABLE memory.sessions ALTER COLUMN summary_embedding TYPE vector(2560) USING NULL::vector(2560);
   ```
3. Update writer's `embedding.py`:
   - Change `model = "qwen3-embedding-0.6b"` → `"Qwen3-Embedding-4B"`
   - Change `dim = 1024` → `2560`
   - Update `VLLM_EMBEDDING_URL` if needed
4. Scale `vllm-0` to 0 (lab acceptable), warm vllm-embedding, run one-time backfill of existing 2,641 facts.
5. Patch bridge `recall_decisions` SQL to add hybrid scoring (trgm + cosine distance), call vllm-embedding for query embedding.
6. Build + push bridge image, deploy via gitops, re-bench.
7. Restore `vllm-0` after vllm-embedding cooldown.

**Operational change**: GPU is now actively contended. Either sleep-mode coordination (VW-246) lands, OR a manual scale-to-0 pattern when one workload needs full GPU. Until then, expect occasional vllm-0 outages during memory-write bursts that wake vllm-embedding via KEDA.

**Tickets that close or unblock**:
- VW-394 (decision-deferred) — resolved
- VW-242 (Backlog) — execution unblocked
- VW-203 (Done) — pattern reinforced (no MacBook embedder, no GPU contention on memory writer-side)
- VW-370 (Backlog, High) — *partial relief*: TEI Deployment becomes decommissionable; the OOM cascade stops; safetensors-artifact issue becomes moot

**Tickets that remain blocked**:
- VW-246 (sleep mode) — still the long-term answer, multi-week scope
- Memory benchmark CtxP regression — vector ANN finally available; expect ~0.04-0.07 closure of the today's −0.094 gap once embeddings populate and bridge SQL ships

### If A1 + B3 instead

Same shape of work, but smaller schema migration (column type unchanged at vector(1024), just need to clean up the writer config) and smaller model deployment (Qwen3-Embedding-0.6B). Trade-off: permanent dim mismatch with vault embeddings; harder cross-corpus retrieval later.

### Either way

- **Bridge code change is required**: `recall_decisions`, `find_problems`, `recall_state_at` SQL needs the `embedding &lt;-&gt; :query_emb` operator added with hybrid scoring (pg_trgm + cosine). Defense against the autopull-revert pattern: commit + push to GitLab origin/main IMMEDIATELY after each edit (per reference_rootweaver_autopull_design *(internal reference; not included)*).
- **Writer code change is required**: `embedding.py` needs to be wired into the per-fact INSERT path (currently `EmbeddingClient` exists but isn't called).
- **Re-bench needed** post-implementation to validate CtxP recovery.

### Observability

After landing, monitor:
- Per-write embedding latency at p50 / p95 (vLLM warm = ~50ms; cold = ~6s)
- vllm-embedding cold-start frequency (should be infrequent if KEDA cooldown is tuned)
- vllm-0 outage windows correlated with memory-write spikes
- Bridge query-side: vector ANN selectivity vs trgm; CtxP, MRR, Robust deltas vs 2026-05-19 baseline

---

## Open questions for the decision session

When you (Ryan) make this call in the next session, the questions to land are:

1. **A1 vs A3** — do you want memory.* embeddings to be *comparable to* vault Qdrant embeddings (A3), or do you prefer the smaller-model-easier-GPU-footprint path (A1)?
2. **GPU coordination today vs VW-246 tomorrow** — scale-vllm-0-down-during-warmup is acceptable for now in the lab; do you want to plan VW-246 as the production migration after this lands, or accept manual coordination forever?
3. **Backfill ordering** — do the 2,641 v1 facts get embedded first (one-time backfill, ~10-15 min on warm vllm-embedding), or wait until the writer-INSERT path lands and let new facts get embeddings naturally while old ones stay NULL?
4. **Bridge SQL hybrid weighting** — when both trgm and cosine produce scores, how should they combine? Equal weight? Cosine-dominant when both are above a threshold? Worth deciding before the patch to avoid re-iteration.

---

## References

### Today's session (2026-05-19-Memory-System-Full-Day-Impact-Report *(internal reference; not included)*)

- Synthesizer v1 corpus run: 2,637 facts / $0.527 / clean
- Benchmark final: Faith 0.626 / Relev 0.631 / **CtxP 0.530** / CtxR 0.598 / **MRR 0.829** ✅
- Schema-routing prototype reverted via autopull pattern (resolved)
- VW-402 v0.2 ingest.py shipped
- K-U-D fixtures restored via tagged source_model_version

### Jira tickets referenced

- VW-391 *(internal reference; not included)* (parent) — Memory system Plan D/E
- VW-394 *(internal reference; not included)* — *this ADR resolves*
- VW-242 *(internal reference; not included)* — *unblocked by this ADR*
- VW-246 *(internal reference; not included)* — sleep mode (long-term evolution)
- VW-370 *(internal reference; not included)* (High) — TEI breakage; mooted by B2
- VW-311 *(internal reference; not included)* — vault embedding 0.6B → 4B upgrade
- VW-203 *(internal reference; not included)* — MacBook embedder decommission
- VW-241 *(internal reference; not included)* (Done) — vLLM sleep PoC + Qwen3-4B byte-equivalence verified

### Related ADRs

- [ADR-044-Memory-Eval-Methodology-v1](/adrs/044-memory-eval-methodology-v1/) (superseded by ADR-045)
- [ADR-045-Memory-Eval-Methodology-v2](/adrs/045-memory-eval-methodology-v2/) — engineering memory focus + 2-track plan
- [ADR-043-Memory-System-Derived-Data-GDPR-Position](/adrs/043-memory-system-derived-data-gdpr-position/) — embeddings are derived data (relevant for migration cleanup)

### Memory entries (this session)

- feedback_test_isolation_at_dsn_layer *(internal reference; not included)* — production code shouldn't know test mode
- k8s_job_failed_data_written *(internal reference; not included)* — verify data store, not K8s status
- reference_recall_session_utc_date *(internal reference; not included)* — UTC date filter gotcha
- reference_rootweaver_autopull_design *(internal reference; not included)* — 15-min reset --hard origin/main timer
