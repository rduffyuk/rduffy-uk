---
id: 35
title: "Q2 2026 Retrieval, Inference & Evaluation Enhancement Program"
status: proposed
recordedStatus: "Proposed"
date: 2026-04-19
tags: ["architecture", "research-program", "retrieval", "inference", "evaluation", "mcp", "q2-2026"]
sourceKind: source-record
public: true
episode: "season-3-episode-9-scout-fleet-and-the-async-ceiling"
journeyId: "2026-04-19-adr-035-an-evaluation-led-programme-for-retrieval-improvements"
---
# ADR-035: Q2 2026 Retrieval, Inference & Evaluation Enhancement Program

**Status**: Proposed
**Date**: 2026-04-19
**Jira Epic**: VW-209 *(internal reference; destination redacted)*
**Related ADRs**: ADR-026 (Agent Lifecycle Patterns, 2026-04-01) — this record follows the same pattern-enumeration + Unleash-gated-rollout model.

---

## Context

On 2026-04-19 we performed a paired internal/external review:

1. **Internal**: MCP auto_search_vault + Jira recap of the last 12 weeks. The platform shipped ~90 VW issues Feb→Apr including MiroFish GraphVectorFusion (VW-163), async RAG refactor (VW-179, 100× fast path), Scout Fleet (VW-140), event-driven NER migration from LLM to spaCy+YAKE (VW-152), PDG + Leiden clustering (VW-135/149), and the VW-189 architecture review.
2. **External**: Live web research sweep over Oct 2025 → Apr 2026 covering arXiv (RAG, agentic retrieval, knowledge graphs), engineering blogs (Anthropic, Databricks, Qdrant, Red Hat), vLLM / SGLang release notes, and evaluation tooling (RAGAS, HELM).

The external sweep independently validated six architectural choices already in production (Graphiti temporal KG, Leiden clustering, MCP bridge, 3-tier agent split, Qwen3-Embedding-4B, GraphVectorFusion) and surfaced eight adoption candidates that are either directly portable or already shipping in tools we use.

Run-38 benchmark score sits at **0.67** after the async refactor landed at parity with the pre-async 0.68. Latency improved 100× on fast path (47-144 ms) and 2× on DeepSearch (5-8s). External evidence (Databricks, Anthropic) converges on the pattern that **70-80% of RAG failures are retrieval-attributed**, not generation-attributed — so the next quality push should target retrieval first, not LLM swapping.

The platform is also carrying three just-filed latency regressions (VW-206, VW-207, VW-208) that must be resolved independent of this program.

---

## Decision

We adopt an **8-pattern research and adoption program** across four tracks, each gated behind an Unleash feature flag so rollout can be halted per-pattern without affecting others.

### Track A — Eval Trust (do first)

Every downstream change requires a benchmark delta that isn't contaminated by judge drift. A must land before any other track.

**Pattern A1 — RAGAS `judge_alignment` calibration**
- Jira: VW-210 *(internal reference; destination redacted)*
- RAGAS ships `judge_alignment` as a stable metric that calibrates an LLM-as-judge against a human-labeled sample and flags position/verbosity/self-enhancement biases. Replace our current uncalibrated Claude-as-judge with this.
- Rollout: no flag — pure evaluation, safe to enable.

**Pattern A2 — RAGAS 0.2 claim-level metrics**
- Jira: VW-211 *(internal reference; destination redacted)*
- Replace our `/benchmark` skill's faithfulness/relevancy rubrics with `factual_correctness` (claim decomposition) and `context_precision_with_reference`.
- Rollout: run both old and new metrics in parallel for 2 benchmark runs, then cut over.
- Depends on: A1.

### Track B — Retrieval Quality

Highest-ROI work. External evidence: Contextual Retrieval = ~49% fewer failed retrievals; Instructed Retriever = ~70% quality gain; HippoRAG 2 = +10 pts multi-hop.

**Pattern B1 — Contextual Retrieval + Databricks Instructed Retriever**
- Jira: VW-212 *(internal reference; destination redacted)*
- Audit MiroFish chunking; prepend 50-100 token LLM-generated doc-level context before embedding. Also propagate system-level retrieval instructions ("prefer recent", "exclude archives") through the pipeline to structurally replace post-hoc freshness strategies (VW-194).
- Rollout: Unleash flag `retrieval.contextual_chunking`; re-index new collection alongside current; compare in A/B before cutover.
- Depends on: A1, A2.

**Pattern B2 — Memento entity-resolution + HippoRAG PPR over existing FalkorDB**
- Jira: VW-213 *(internal reference; destination redacted)*
- Tiered entity resolution cascade (exact → fuzzy → phonetic → embedding → LLM) fixes VW-202's "9.5× slower with zero quality benefit" problem. Personalized PageRank over entity nodes adds multi-hop retrieval over the same graph.
- Rollout: Unleash flag `graph.ppr_retrieval`; spike first, then graduate.
- Depends on: A1, A2. Uses existing FalkorDB — no new infra.

### Track C — Inference Speed (parallelisable with D)

These don't affect retrieval quality, so running them after B yields clean quality deltas. C1 and C3 can run in parallel; C2 requires C1.

**Pattern C1 — vLLM v1 upgrade**
- Jira: VW-214 *(internal reference; destination redacted)*
- Current image `vllm-otel:v0.17.1` may predate v1 rewrite. Expected ~2× throughput improvement.
- Rollout: canary deploy on staging namespace; promote to production on green bench.

**Pattern C2 — EAGLE-3 / MTP speculative decoding**
- Jira: VW-215 *(internal reference; destination redacted)*
- Red Hat ships EAGLE-3 in vLLM with verified 2.5× throughput, 1.8× latency, 2.1× on RAG/math for 8B-class models. Verify whether DeepSeek-R1-0528-Qwen3-8B-AWQ exposes MTP heads natively.
- Rollout: Unleash flag `inference.eagle3_specdec`.
- Depends on: C1.

**Pattern C3 — SGLang A/B for OracleAgent only**
- Jira: VW-216 *(internal reference; destination redacted)*
- SGLang RadixAttention (tree-structured prefix cache) outperforms vLLM on prefix-heavy long-CoT workloads. Oracle path (15-30s) is exactly this profile. Do not replace vLLM globally.
- Rollout: dedicated namespace, route Oracle only for 48h A/B. Adopt if ≥1.5× Oracle latency win with no quality regression.
- Independent of C1/C2.

### Track D — MCP Bridge Efficiency (parallelisable with C)

**Pattern D1 — Anthropic Code Execution with MCP**
- Jira: VW-217 *(internal reference; destination redacted)*
- Anthropic reports 150K → 2K per-request token reduction (98.7%) by exposing tools as code APIs rather than loading all 29 tool definitions in every request. Compatible with our existing Streamable HTTP transport (VW-177).
- Rollout: build code-exec-mode bridge alongside current bridge; A/B on Fast agent first.
- Independent of Tracks A-C.

---

## Rollout Sequence

```
A1 (judge calibration) → A2 (RAGAS claim metrics)
                      ↓
                      B1 (contextual chunking) ┐
                      B2 (Memento + PPR)       ├─ Track B can run parallel
                                               ↓
                      C1 → C2 (vLLM v1 → EAGLE-3)  ┐
                      C3 (SGLang A/B, independent)  ├─ Track C parallel
                      D1 (MCP code-exec)            ┘
```

Priority order if bandwidth-limited: **A1 → D1 → B1 → C2 → everything else**. D1 is high-leverage and independent of all others; B1 is the largest single quality lift; C2 is a verified drop-in win on our exact hardware.

---

## Consequences

### Positive
- Every subsequent benchmark comparison is trustworthy (A1)
- Quality improvements can be attributed to retrieval changes rather than judge drift (A1+A2 → B)
- Independent external validation for each adoption (every pattern cites a 2026 source with measured numbers)
- All rollouts reversible via Unleash flags (matches ADR-026 pattern)
- Track D (MCP) addresses token-efficiency across entire agent fleet — compounds with every future tool addition
- Program creates public artefact for VW-44 Season 3 blog retrospective

### Negative
- Re-indexing 148K Qdrant docs under B1 is CPU-intensive on desktop (VW-203 moved delta indexing to K3s CPU)
- SGLang deployment (C3) adds a second inference runtime to maintain if adopted
- RAGAS 0.2 migration (A2) may surface benchmark regressions that were masked by the old rubric — cannot be distinguished from A1 judge-drift corrections without careful A/B
- Anthropic Code Execution with MCP (D1) is a more invasive bridge rewrite than other items — higher engineering cost

### Risk Mitigation
Every pattern behind its own Unleash flag. No flag gets flipped to 100% until:
1. A/B shows no benchmark regression under the calibrated judge (post-A1)
2. Claims in external source reproduce within ±30% on our data
3. Rollback plan documented in the ticket

### Neutral
- Some backlog tickets become superseded (VW-43 ColBERT eval partially closed by C3 scope decision)
- Research cycle time: ~6-8 weeks assuming 2 patterns in flight at a time

---

## Alternatives Considered

1. **Do nothing** — platform is shipping. Rejected: Run-38 at 0.67 is below our 0.70 Run-33 peak, external evidence shows 70-80% of failures are retrieval-side, and three latency regressions are fresh.
2. **Single mega-change (re-index everything with new chunks + new model + new inference stack)** — Rejected: cannot attribute quality changes, violates Unleash pattern from ADR-026.
3. **Pure inference optimisation without retrieval work (C tracks only)** — Rejected: external evidence says inference optimisation won't move Run-38 score; quality work does.
4. **Pure retrieval work without eval calibration (B without A)** — Rejected: we would not be able to distinguish real gains from judge drift.
5. **Adopt RAGAS wholesale and retire /benchmark skill** — Rejected: our HELM-style scenario grid has data we don't want to lose; RAGAS metrics slot in alongside.

---

## References

### Internal
- VW-209 Epic *(internal reference; destination redacted)*
- VW-189 Architecture review *(internal reference; destination redacted)*
- [ADR-026 Agent Lifecycle Patterns](/adrs/026-agent-lifecycle-patterns-claude-code-leak/)
- `09-System/Architecture/Implementation-Reports/2026-03-31-VW-179-Async-RAG-Pipeline-Refactor.md`
- `09-System/Architecture/Benchmarks/` — HELM Run-18 through Run-38

### External
- Anthropic: [Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval)
- Anthropic: [Code Execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp)
- Databricks: [Instructed Retriever](https://www.databricks.com/blog/instructed-retriever-unlocking-system-level-reasoning-search-agents)
- Red Hat: [EAGLE-3 in vLLM](https://developers.redhat.com/articles/2025/07/01/fly-eagle3-fly-faster-inference-vllm-speculative-decoding)
- SGLang: [Q1 2026 roadmap](https://github.com/sgl-project/sglang/issues/12780)
- RAGAS: [judge_alignment docs](https://docs.ragas.io/en/stable/howtos/applications/align-llm-as-judge/)
- Memento bitemporal KG (Apr 2026): [LongMemEval 92.4% case study](https://explore.n1n.ai/blog/building-bitemporal-knowledge-graph-llm-agent-memory-longmemeval-2026-04-11)
- MCP 2026 Roadmap: [modelcontextprotocol.io/posts/2026-mcp-roadmap](https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/)

---

*Generated as part of 2026-04-19 platform review. Next review checkpoint: after A1 + A2 land, before Track B commits.*


## Record identity correction — 14 October 2026 (VW-447)

The canonical filename and ADR registry establish this record as ADR-035. Legacy metadata/headings have been aligned with that identity. This correction does not change the historical decision or assert current deployment. Run-Id: 01a13723-c94c-7cd0-9257-8d66c0784762.
