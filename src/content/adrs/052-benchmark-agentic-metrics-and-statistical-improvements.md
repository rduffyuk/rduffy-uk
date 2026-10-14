---
id: 52
title: "Benchmark Agentic Metrics and Statistical Improvements"
status: accepted
recordedStatus: "Accepted"
date: 2026-05-27
tags: ["benchmark", "evaluation", "statistics"]
sourceKind: source-record
public: true
journeyId: "2026-05-27-adr-052-benchmark-agentic-metrics-and-statistical-improvements"
---
# ADR-052: Benchmark Agentic Metrics and Statistical Improvements

**Status**: Accepted
**Date**: 2026-05-27
**Jira**: VW-464

## Context

The Rootweaver benchmark suite (HELM-inspired, 32 queries, 7 categories) evaluates retrieval quality via faithfulness, answer relevancy, context precision, context recall, and MRR. However:

1. **No agentic metrics**: The suite scores *what* was retrieved but not *how* it was routed. A query routed to Oracle when Fast would suffice wastes 15-30s; this is invisible to current metrics.
2. **Point-estimate scoring**: Metrics are reported as simple averages (e.g., "faithfulness: 0.82"). ADR-046 iteration 2 measured a ±0.07 noise floor at N=5 queries/category — movements within that band are indistinguishable from random re-run variance.
3. **No judge caching**: Each benchmark run makes ~180 LLM-as-judge calls (30 queries × 6 metrics). During iterative config tuning (ADR-046), most queries produce identical results — re-judging them wastes time and money.

Research of Tim Kersey's GitHub repos (github.com/tkersey) surfaced applicable patterns from his `eval.ts` project (ToolCorrectness + DagConsistency metric concepts) and ADAS Playbook gist (hash-cached judging + bootstrap confidence intervals).

## Decision

### 1. Add ToolCorrectness and DagConsistency metrics

- **ToolCorrectness**: Score whether the agent router picked the expected agent type. Scoring: exact match = 1.0, adjacent tier = 0.5 (e.g., fast→deep), wrong tier = 0.0. Uses the `expected_agent` field already present in `golden_test_set_v1.json`.
- **DagConsistency**: Score whether agent execution followed expected workflow steps. Uses Longest Common Subsequence (LCS) normalised by expected length — rewards correct ordering while tolerating extra inserted steps. New `expected_steps` field added to all 32 test queries.

### 2. Replace point estimates with bootstrap confidence intervals

Report each metric as `mean [CI_lower, CI_upper]` using bootstrap resampling (n=1000, 95% CI, seeded for determinism). CI width directly quantifies noise. Regression detection uses `is_significant_vs()` — only flag regressions where CIs don't overlap (statistically meaningful), replacing the fixed >0.05 threshold.

### 3. Add SQLite-backed judge cache

Cache LLM-as-judge results keyed by `sha256(query, result_text, metric_name)`. On iterative runs where only config/routing changes, cached evaluations are reused. Expected savings: ~80% of judge calls on iterative runs.

## Consequences

### Positive
- Routing correctness is now measurable — can detect when router upgrades degrade routing accuracy
- Bootstrap CIs eliminate the ambiguity of "is this 0.03 improvement real?" — if CIs don't overlap, it's real
- Judge cache makes iterative benchmark development ~5x faster for config tuning sessions
- All 32 test queries now have `expected_steps`, enabling future workflow analysis

### Negative
- Two additional columns in the scenario×metric grid (tool_correctness, dag_consistency) — grid is now 9 columns wide
- Bootstrap CI adds ~0.1s per metric category (1000 resamples) — negligible vs LLM judge latency
- Judge cache is keyed by result text — any change to agent output invalidates the cache for that query (by design, but means cache hit rate drops when agents change significantly)

### Neutral
- `expected_steps` in the golden test set are aspirational — agents don't currently emit step traces. DagConsistency scoring will only be useful once agents report their execution steps. The infrastructure is ready; the data source is future work.

## Alternatives Considered

1. **Embedding similarity for ToolCorrectness** (rejected): Overkill for a categorical variable with 6 possible values. Tier-based scoring is simpler and more interpretable.
2. **Strict positional array comparison for DagConsistency** (rejected, from eval.ts): Too brittle — penalises any extra step even if the expected steps are present in order. LCS is the right algorithm for sequence alignment with insertions.
3. **In-memory judge cache** (rejected): Doesn't persist across benchmark sessions. SQLite survives process restarts and is queryable for cache analytics.
4. **Numpy for bootstrap CI** (rejected): Would add a large dependency. stdlib `random.Random` with a seed gives deterministic results without numpy.
