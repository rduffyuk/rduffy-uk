---
id: 77
title: "Inter-Hop Context Compaction for Multi-Hop Reasoning"
status: accepted
recordedStatus: "Accepted"
date: 2026-06-15
tags: ["multi-hop", "compaction", "context-management"]
sourceKind: source-record
public: true
journeyId: "2026-06-15-adr-077-inter-hop-context-compaction-in-multi-hop-retrieval"
---
# ADR-077 — Inter-Hop Context Compaction for Multi-Hop Reasoning

## Status

Accepted — 2026-06-15 (**revised same day** — see Revision below). Implemented under VW-831 (4 commits on `feature/vw-831-context-compaction`). Flag-gated OFF pending the quality (4b) evaluation; enablement is a follow-up commit to `configs/retrieval/multi_hop.yaml`.

## Revision — 2026-06-15: inter-hop → pre-synthesis compaction

The original design (§Decision 1–4 below) compacted the accumulated context **between hops**. A post-implementation offline eval (deterministic, 10 multi-hop queries, compaction on vs off) **falsified the "behaviour-neutral" premise**: at tight budgets compaction evicted answerability evidence from the shared `context` string, which is re-decomposed every hop (`multihop.py:233`) and drives sub-query selection — so 2/10 queries over-ran from 2 hops to `max_hops` (5), *increasing* token cost, the opposite of the goal. A one-line "latch answerability" patch was tried and **rejected** (Codex adversarial review: the latch is discarded by the per-hop re-decomposition).

**Root cause:** one `context` variable served two incompatible roles — (a) the reasoning-trajectory signal and (b) the synthesis payload. Compaction was only ever meant to bound (b) but mutated (a) as a side effect.

**Resolution (commit `ce9fd2c5`):** separate the two roles.
- The full `context` drives ALL trajectory decisions (`_decompose_query`, `_select_next_query`) and is **never** compacted → the hop trajectory is **provably identical** whether compaction is on or off, at any budget.
- A separate `synth_context` is compacted **once, after the loop**, and used for synthesis + `chain.final_context` → the synthesis prompt stays bounded (the original win: 34–75% reduction observed in eval).
- `compaction_enabled=False` is a **byte-for-byte no-op** vs pre-VW-831.

Validated two ways: offline trajectory eval (hop counts identical on/off; WIN + BUDGET + NO-BEHAVIOUR-CHANGE all pass) **and** Codex adversarial diff review (FIX-SOUND for trajectory; budget-independent). The pinning / answerability machinery described in §Decision 2–4 no longer runs inter-hop — it now applies only when computing `synth_context`.

**Still open:** gate 4b — does the compacted `synth_context` degrade LLM answer quality vs the full context? Unvalidated (requires live vLLM). The flag stays OFF until it passes. The §Decision sections below are retained as the historical record of the superseded inter-hop approach.

## Context

`MultiHopRAG.multi_hop_search` accumulates reasoning context by simple concatenation across hops:

```python
context += f"\n\n{context_addition}"   # multihop.py:181 — no pruning
```

With `max_hops=5` and fact blocks of ~400–800 chars each, the accumulated context easily reaches 4–8 K chars before synthesis. That entire string is forwarded verbatim to the synthesis stage as `context.metadata["reasoning_context"]`, inflating every downstream synthesis prompt regardless of how much of the earlier-hop material is still relevant.

The gap had two compounding effects:

1. **Synthesis token cost scales linearly with hop count.** A 5-hop query with no compaction sends ~5× the tokens of a 1-hop query even when hops 2–4 were exploratory dead-ends.
2. **Late hops can drown in stale early-hop noise.** The confidence heuristic (`_select_next_query` key-term overlap ≥ 0.6) uses freshness of *sub-query answerability*, but the LLM synthesis has no equivalent mechanism — it receives all context with equal weight.

**Framing correction (verified by Codex adversarial review, 2026-06-15):** the gap is in `MultiHopRAG`, not in `DeepResearchAgent`. `DeepResearchAgent` is single-pass (parallel query variants → RRF → rerank → verify); it already budgets cross-variant context via `_budget_variant_results()` per ADR-026 §P5a. Do not conflate variant budgeting (ADR-026) with inter-hop compaction (this ADR).

**Relationship to VW-208**: `MultiHopRAG` was introduced under VW-208 and lives in `rootweaver-innovations`. The capability wrapper `MultiHopCapability` in `rootweaver-capabilities` reads Unleash flags and drives the `MultiHopRAG` constructor. This ADR adds a second constructor parameter pair to that existing interface.

## Decision

Add a **bounded extractive compaction step** between hops in `MultiHopRAG.multi_hop_search`. Four design choices compose the solution:

### 1. Extractive, LLM-free, deterministic

The compactor (`compaction.py`) is a pure function: no I/O, no model calls. This keeps it synchronous (no async plumbing), free of latency variance, and off the GPU hot path. The style is RECOMP-extractive / Provence: retain the most relevant fact lines within a hard character budget by priority ordering. No sentence-level splitting — `_build_context` already emits one fact per line, so line is the natural granularity.

### 2. Shared key-term extractor (single source of truth)

`reasoning_key_terms(text) -> list[str]` lives in `compaction.py` and is imported by both the compactor and `MultiHopRAG._select_next_query`. Both functions therefore use the same tokenisation: raw lowercase whitespace split, tokens > 3 chars not in a shared stop-word set, no punctuation stripping. Before this ADR, `_select_next_query` had its own inline variant; any mismatch between the two would cause the compactor to preserve lines whose terms the answerability heuristic did not recognise as relevant, or vice versa.

### 3. Priority ordering with hard budget

Lines are selected in priority order; budget is a hard ceiling that applies to every line including high-priority ones:

| Priority | Criterion |
|---|---|
| 0 (keep first) | Line contains a key term from any still-open sub-query |
| 1 | Line belongs to the most-recent hop block (`From query` header ≥ last header) |
| 2 | All other lines, ranked by query-term overlap (descending) |

Within each priority band, lines are ordered by overlap count descending then by original position ascending (preserves narrative order when overlap is tied). The budget is `max_chars` characters including newline separators.

**"Pinning" means priority ordering, not budget exemption.** A still-open sub-query term line that would push total chars over `max_chars` is skipped; the budget is absolute.

### 4. Answerability evaluated on full post-hop context before compaction

Before calling the compactor, the hop loop re-evaluates which sub-queries are STILL open against the full post-append context (same 0.6 key-term-match fraction as `_select_next_query`). A sub-query that just became answerable on this hop is NOT flagged for pinning; a still-open one IS. This prevents over-pinning (the compactor would otherwise pin a term that is now resolved) and ensures the set of pinned terms is always the current frontier, not the frontier from the previous hop.

### 5. Feature-flag OFF by default

New `MultiHopRAG` constructor params: `compaction_enabled: bool = False`, `compaction_max_chars: int = 2000`. YAML knobs in `configs/retrieval/multi_hop.yaml` default to the same values. `MultiHopCapability` reads the YAML and passes through to `MultiHopRAG`. The capability Unleash flag (`eip.capabilities.retrieval.multi_hop.enabled`) is separate from and orthogonal to the compaction flag; both must be independently satisfied for compaction to run.

Enablement is blocked on Task 4 (VW-831): run 10 golden queries with compaction on/off, confirm median `context_chars` drops materially AND quality delta is within LLM-judge noise (±0.07 at N=3–5 runs per config) AND hop count is unchanged.

### Observability

`MultiHopCapability.execute()` now records `context_chars: len(chain.final_context)` in `context.metadata["multi_hop"]`. This allows Task 4 to measure the effect without new Prometheus infrastructure. A histogram (`multi_hop_context_chars`) with proper `description` field and emission wiring in `execute()` is a deliberate follow-up, not part of this change.

## Alternatives Considered

**A. Abstractive compaction (LLMLingua / RECOMP-abstractive)**
LLMLingua and RECOMP-abstractive achieve higher compression ratios by actually rewriting sentences, not just selecting them. Both were deferred: they require a local model call on the hot path (adding ~1–5 s and GPU dependency), and their quality advantage is only measurable if the extractive baseline first fails the Task 4 eval. YAGNI until the extractive path is validated and a quality gap is demonstrated.

**B. Sentence-level granularity**
Splitting context at sentence boundaries (spaCy sentencizer or regex) would allow finer retention than line-level. Deferred: `_build_context` already writes one fact per line, so the line/fact equivalence is exact for current output. Sentence-level adds tokenisation overhead with no current benefit. Revisit if `_build_context` gains multi-sentence fact blocks.

**C. Soft budget (score threshold instead of hard limit)**
A threshold-based filter (e.g., keep all lines with overlap ≥ k) produces an output of unbounded length, which defeats the core goal. Hard budget was the only option compatible with the synthesis-cost reduction objective.

**D. Budget applied only to non-pinned lines**
An earlier design exempted priority-0 (open-sub-query) lines from the budget entirely. The Codex adversarial review (2026-06-15) identified that this makes the worst-case output size unbounded: if all open-sub-query lines together exceed `max_chars`, the output violates the budget guarantee. Rejected; priority ordering is the right mechanism, not budget exemption.

## Consequences

**Positive**:
- Synthesis prompt token cost is bounded at `max_chars` characters regardless of hop count.
- Inter-hop answerability signal is preserved: still-open sub-query terms are prioritised.
- Shared extractor removes the term-extraction divergence that existed between the compactor and the answerability heuristic.
- Zero latency penalty when disabled (default); no GPU or model dependency when enabled.
- `context_chars` metadata makes compaction impact measurable without new Prometheus infra.

**Negative / accepted**:
- Extractive compaction cannot produce a shorter-than-source summary of a single fact line; very long individual fact lines are kept whole or dropped entirely (no truncation). Mitigated by the fact that `_build_context` keeps individual fact lines short.
- Priority-0 lines can be dropped if they collectively exceed the budget. This is a deliberate correctness trade-off: an unbounded output guarantees nothing.
- A `max_chars=2000` default was chosen conservatively; it may need tuning per query type after Task 4.

**Validation gate**: Task 4 (VW-831) gates production enablement. Until that eval runs and passes, the compaction flag stays `false` in `multi_hop.yaml`.
