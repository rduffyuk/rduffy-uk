---
id: 81
title: "Evaluation Harness Governance Framework"
status: accepted
recordedStatus: "Accepted"
date: 2026-06-16
tags: []
sourceKind: source-record
public: true
journeyId: "2026-06-16-adr-081-evaluation-harness-governance-immutable-snapshots-and-pr-gated-regressions"
---
# ADR-081: Evaluation Harness Governance Framework

## Status

Accepted (2026-06-16) — rigor target: **Tiered** (per VW-864 decision).

## Context

The platform accumulated **six evaluation harnesses** organically, with no shared
standard for structure, metadata, versioning, judge calibration, lifecycle, or
per-harness documentation. Discovery (VW-864) found:

| # | Harness | Entrypoint | Scoring | State |
|---|---|---|---|---|
| 1 | RAGAS/HELM golden-set | `tests/benchmarks/golden_test_set_v1.json` (judged by benchmark-runner agent) | LLM-judge + deterministic | Working |
| 2 | eng_memory_bench (ADR-045) | `packages/operator-tools/src/operator_tools/eng_memory_bench/runner.py` (`memory-eng-bench`) | Deterministic (Jaccard/MRR), seed-locked synthetic corpus | Working (fixture modes; `direct-sql`/`sidecar` stubbed) |
| 3 | memory-benchmark v1 (VW-395) | `packages/operator-tools/src/operator_tools/memory_benchmark.py:514` (`memory-benchmark`) | Deterministic rule-based, live mcp-bridge | Working |
| 4 | regression_prevention (VW-532) | `tests/benchmarks/regression_prevention_runner.py` | LLM-judge, 3-arm | Working |
| 5 | cross-model-bench-quality | `tests/benchmarks/cross-model/cross-model-bench-quality.py` | Deterministic (regex + canary) | Working |
| 6 | routing_accuracy | `tests/evaluation/test_routing_accuracy.py` | LLM-judge (deepeval) | **Dead** — skips since Jan (`AgentRouter` import) |

Problems: (a) #2 and #3 overlap (two memory benches measuring nearly the same thing);
(b) #6 has reported nothing for ~5 months but looks "present"; (c) LLM-judge harnesses
(#1, #4) report raw scores with no calibrated confidence interval; (d) no harness carries
machine-readable metadata, a version, or a lifecycle state.

There is no single industry RFC for evaluation harnesses, but five external standards
have converged and compose into one. This ADR adopts them.

## Decision

Adopt a **four-component governance framework**, grounded in the converged standards,
with a **tiered** rigor model.

### Anchoring standards

| Layer | Standard | Source |
|---|---|---|
| Lifecycle / quality rubric | BetterBench (46 criteria × 5 stages) | arXiv 2411.12990 |
| Architecture | lm-evaluation-harness (versioned task unit) + UK AISI Inspect (Dataset/Solver/Scorer) | github.com/EleutherAI/lm-evaluation-harness; inspect.aisi.org.uk |
| Dataset metadata | MLCommons Croissant (JSON-LD) | mlcommons.org/working-groups/data/croissant |
| LLM-judge calibration | ARES + Prediction-Powered Inference | arXiv 2311.09476 |
| Per-harness record | EvalCards | arXiv 2511.21695 |

### Component 1 — Standard architecture

Every harness decomposes into three orthogonal primitives (Inspect), declared in a
manifest with an integer `version` (lm-eval) that **must bump on any scoring change**:

- **Dataset** — labelled samples; for synthetic corpora, content-hashed and seed-locked
  (`(seed, generator_version, corpus_hash)`, per ADR-045).
- **Solver** — the system under test (LLM call / agent / multi-hop chain / live bridge).
- **Scorer** — correctness function, deterministic *or* calibrated LLM-judge.

Solver/Scorer orthogonality is the mechanism that lets a single benchmark expose a
"synthetic" and a "live-bridge" Solver variant without forking — the fix for the
#2/#3 duplication.

### Component 2 — Eval Card registry

One YAML card per harness under `tests/benchmarks/registry/`. Mandatory fields:
`id`, `capability`, `dataset` (path + hash + license), `solver`, `scorer`
(+ `calibration_status`), `metrics` (formula + threshold), `n_runs` + `ci_policy`,
`contamination_control`, `lifecycle_state`, `owner`, `last_run`, `betterbench_score`,
`tier` (`internal` | `publication`). A pre-commit gate rejects any harness without a
valid card (same enforcement pattern as the existing Dockerfile/ADR lint gates).

### Component 3 — Lifecycle states

`Draft → Active → Maintained → Deprecated → Retired`. BetterBench leaves retirement
unscored; we define it here.

- **Active** — at least one reproducible run on record.
- **Maintained** — CI-wired + ≥3 runs with CIs + (if judged) calibrated judge.
- **Deprecated** — auto-flag when a harness skips/errors on its scheduled run, or fails
  the annual usability check.
- **Retired** — card archived, runner removed from CI; the card stays in the registry
  marked `retired` for provenance.

### Component 4 — Governance rules (tiered)

Always required (both tiers):
- A valid Eval Card before merge.
- All reported scores ship **confidence intervals over ≥3 runs** (matches measured
  noise floors: ±0.07 at N=5 generic judge; ±0.037 at N=514 eng_memory_bench).
- Deterministic scorers preferred where the task allows.

Required only for `tier: publication` harnesses:
- LLM-judge **PPI calibration** (~150 human-annotated anchors) reporting a calibrated CI
  + a calibration-error metric (ECE/Brier); ranking on CI midpoints.
- Scale ≥ 500 items, ≥ 3 seeds.
- ≥ 3 external system baselines.
- Croissant metadata + persistent DOI.

This lets `internal` harnesses stay cheap while keeping the *structure*
publication-ready, so a harness can be promoted to `publication` later without
re-architecting.

## First application — gap matrix

| Harness | Action | Target state/tier |
|---|---|---|
| eng_memory_bench (#2) | Promote to canonical memory spine | Maintained / publication-track |
| memory-benchmark v1 (#3) | Consolidate into #2 as a live-bridge **Solver** variant | folded |
| RAGAS/HELM golden-set (#1) | Keep; add card; PPI-calibrate judge | Maintained / internal (→publication later) |
| regression_prevention (#4) | Keep; add card; PPI-calibrate judge (differentiated "decision-respect" metric) | Maintained / internal |
| cross-model-bench (#5) | Keep; add card | Maintained / internal |
| routing_accuracy (#6) | Retire (first use of Retired state) | Retired |
| **compaction track** (VW-831) | New harness: multi-hop Solver, budget sweep {off,2000,3500}, quality (judge) + total-tokens-to-completion | Draft → Active / internal |

Net: 6 fragmented harnesses → 4 governed + 1 retired + 1 new, all carded.

## Consequences

**Positive**: single registry as source of truth; dead harnesses self-flag; judge
scores become statistically defensible; eng_memory_bench has a clear upgrade path to a
publishable benchmark; new harnesses (compaction first) are born compliant.

**Negative / cost**: up-front migration (6 cards + registry + pre-commit gate);
PPI calibration needs ~150 human-annotated anchors per judged harness (publication tier
only); consolidating #3 into #2 is a refactor with regression risk (mitigated by #2's
deterministic baseline).

**Neutral**: ADR-045 (eng_memory_bench methodology) is subsumed as the reference
implementation of Components 1–2; its `proposed` status should be revisited.

## References

- BetterBench — arXiv 2411.12990 — betterbench.stanford.edu/methodology.html
- MLCommons Croissant — mlcommons.org/working-groups/data/croissant
- lm-evaluation-harness task guide — github.com/EleutherAI/lm-evaluation-harness
- UK AISI Inspect — inspect.aisi.org.uk
- ARES + PPI — arXiv 2311.09476
- EvalCards — arXiv 2511.21695
- Compaction methodology (related): Factory.ai compression eval; LLMLingua-2 (ACL 2024)
- Internal: ADR-045 (Memory Eval Methodology v2), VW-402, VW-395, VW-532, VW-831
