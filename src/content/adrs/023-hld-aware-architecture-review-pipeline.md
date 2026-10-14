---
id: 23
title: "HLD-Aware Architecture Review Pipeline"
status: proposed
recordedStatus: "proposed"
date: 2026-03-09
tags: ["architecture", "code-review", "kafka", "vllm"]
sourceKind: source-record
public: true
journeyId: "2026-03-09-adr-023-hld-aware-architecture-review-pipeline"
---
# ADR-023: HLD-Aware Architecture Review Pipeline

**Status**: Proposed
**Date**: 2026-03-09
**Author**: Ryan Duffy + Claude
**Jira**: VW-128 *(internal reference; not included)*
**Related**: ADR-012 (vLLM 14B upgrade — now 8B), ADR-016 *(reference outside this archive)* (Modular Architecture Documentation), VW-126 (NER Consumer pattern)

## Context

The Rootweaver platform has 10 HLD modules and 9 LLD modules documenting its architecture, plus ADRs for key decisions. Code changes happen daily across multiple repos, but there's no automated check that changes align with the documented architecture.

Current state:
- **Superpowers code-reviewer**: Manual invocation, generic checklist, no HLD awareness
- **GitLab CI**: Ruff/Black/Bandit — code quality only, advisory/non-blocking
- **PDG tools**: 18 MCP tools for impact analysis, but not wired into review flow
- **vLLM**: Qwen3-8B-AWQ running at 57K context (YaRN RoPE scaling) — sufficient to fit 2-3 HLD modules + code diff in a single prompt

The gap: no unified pipeline that combines architecture docs + code changes + automated review using the local LLM.

## Decision

Build an event-driven, multi-stage Kafka pipeline that automatically reviews code changes against HLD architecture documentation using local vLLM.

### Pipeline Topology

```
vault.file-events → arch-review.file-changes → arch-review.concerns → arch-review.scored → arch-review.reports
```

**4 Kafka topics, 3 processing stages (KEDA ScaledJobs), 2 output consumers:**

1. **Batcher** (`arch-review-batcher`): Consumes `vault.file-events`, accumulates changes in a 60s window, calls PDG for module mapping, reads HLD module references, produces to `arch-review.file-changes`
2. **Extractor** (`arch-review-extractor`): Loads HLD modules from vault, sends file diffs + HLD context to vLLM to extract architectural concerns, produces to `arch-review.concerns`
3. **Scorer** (`arch-review-scorer`): Two vLLM passes — reviewer generates recommendations, judge scores quality (1-10). If score < 5, loops back for revision (max 1 retry). Produces to `arch-review.scored` and `arch-review.reports`
4. **Jira Writer** (`arch-review-jira-writer`): Consumes `arch-review.reports`, comments on linked VW issue
5. **Vault Writer** (`arch-review-vault-writer`): Consumes `arch-review.reports`, writes markdown to `09-System/Architecture/Reviews/`

### Three-Pass Review Pattern (all local vLLM)

| Pass | Purpose | Temperature | Output |
|------|---------|-------------|--------|
| Extract | Identify architectural concerns from diff | 0.3 | Structured concerns JSON |
| Review | Generate recommendations per concern | 0.5 | Recommendations + code suggestions |
| Judge | Score review quality, verify HLD references | 0.1 | Score (1-10) + verdict |

Informed by academic research:
- SGCR framework (HiThink Research, 2025): dual-pathway explicit+implicit review
- CORE (ACM 2024): proposer+ranker LLM duo pattern
- Architecture Erosion Detection (2025): LLM classifiers F1=0.851

### Concern Taxonomy (15 types, 4 categories)

**Architecture Alignment:**
- `architecture-drift` — change contradicts HLD design intent
- `architecture-erosion` — gradual degradation of architectural boundaries
- `layer-violation` — bypassing abstraction layers
- `decision-violation` — contradicts an existing ADR

**Code Quality:**
- `duplication` — reimplements existing logic
- `consolidation` — should be merged into shared module
- `missing-abstraction` — repeated pattern needs extraction
- `dead-code` — unreferenced imports, functions, variables

**Correctness & Safety:**
- `error-handling-gap` — missing or swallowed exceptions
- `edge-case` — unhandled boundary conditions
- `security` — hardcoded credentials, injection risks
- `race-condition` — concurrency issues in async/multi-consumer code

**Maintainability & Performance:**
- `naming-readability` — unclear naming
- `performance` — algorithmic inefficiency
- `config-drift` — config values out of sync across services

### HLD Module Mapping

PDG-driven (not static mapping):
1. File change → `analyze_code_impact` → affected modules/services
2. Map service names to HLD module numbers (lightweight dict)
3. Cache file→HLD mapping for repeated changes

### Output Format

Structured JSON (machine-parseable) + rendered markdown (vault-readable). Reports written to `obsidian-vault/09-System/Architecture/Reviews/` with frontmatter for Qdrant indexing.

### Infrastructure

- All stages: KEDA ScaledJobs in `rootweaver` namespace
- Scale to zero when idle, trigger on consumer group lag >= 1
- Image: Python 3.12 slim with confluent-kafka, httpx, pyyaml
- hostPath mount for vault/code access
- No new runners — runs on existing K3s cluster
- No external API calls — all LLM processing on local vLLM

### Token Budget (per batch, typical 3-5 files)

| Pass | HLD | Files | Prompt | Output | Total |
|------|-----|-------|--------|--------|-------|
| Extractor | ~7K | ~5K | ~0.5K | ~2K | ~14.5K |
| Reviewer | ~7K | ~3K | ~0.5K | ~3K | ~13.5K |
| Judge | ~7K | ~3K | ~0.3K | ~1K | ~11.3K |
| **Total** | | | | | **~39K** |

Fits within 57K vLLM context with room to spare.

## Consequences

### Positive
- Every code change automatically checked against architecture documentation
- Architecture drift detected early, before it compounds
- Code quality recommendations (duplication, consolidation) reduce codebase footprint
- Reviews searchable in vault via Qdrant (indexed by vault indexer)
- Fully local — no API costs, no data leaving the network
- Follows proven NER consumer pattern (KEDA ScaledJob)

### Negative
- 5 new ScaledJobs to maintain (3 processing + 2 output)
- 4 new Kafka topics
- vLLM contention if many file changes arrive during heavy inference workload
- Qwen3-8B may miss subtle architectural violations that a larger model would catch
- False positives may cause alert fatigue if not tuned

### Mitigations
- Batching (60s window) reduces vLLM calls
- Judge pass filters low-quality reviews (score < 5 triggers revision)
- ConfigMap-driven thresholds for easy tuning without redeployment
- All stages scale to zero when idle — no resource waste

## Alternatives Considered

### A: Single KEDA ScaledJob (NER consumer pattern)
All logic in one consumer. Simpler but monolithic — can't inspect/retry individual stages.

### C: Prefect Flow
Orchestrated via Prefect with Kafka trigger. Adds visibility but extra hop and latency. Mixes event-driven with batch orchestration.

**Chose B (multi-stage Kafka)** for stage isolation, independent inspection/replay at each topic, and clean separation of concerns.

## References

- [SGCR: Specification-Grounded Framework for Trustworthy LLM Code Review](https://arxiv.org/abs/2512.17540)
- [CORE: Resolving Code Quality Issues using LLMs](https://dl.acm.org/doi/10.1145/3643762)
- [Architecture Erosion Detection](https://arxiv.org/abs/2306.08616)
- [Evaluating LLMs for Detecting Architectural Decision Violations](https://arxiv.org/html/2602.07609v1)
- [Rethinking Code Review Workflows with LLM Assistance](https://arxiv.org/html/2505.16339v1)

### External Links
| Platform | Link |
|----------|------|
| Confluence | ADR-023 *(internal reference; destination redacted)* |
| Jira | VW-128 *(internal reference; destination redacted)* |
