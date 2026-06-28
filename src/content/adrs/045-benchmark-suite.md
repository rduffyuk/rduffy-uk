---
id: 45
title: "Search-quality benchmark suite: HELM scenario grid + RAGAS metrics, Claude Code as LLM judge"
status: accepted
date: 2026-05-18
tags: [benchmark, rag, quality]
episode: season-3-episode-7-the-long-weekend
public: true
---

## Context

Search "worked," but there was no data on whether a result was faithful, whether the right document ranked first, or whether last week's change quietly made things worse.

## Decision

Build a benchmark suite borrowing from the academic RAG-evaluation literature: HELM's scenario-grid shape (30 queries × 6 categories), RAGAS metrics (faithfulness, answer relevancy, context precision/recall), RAGBench's attribution, and MRR. Claude Code acts as the LLM judge against structured rubrics — no external eval API spend.

## Alternatives considered

- **Commercial eval API (off-the-shelf RAGAS service)** — rejected: incurs external API spend on every CI run; scores would be produced by a different model than the one in production, making quality comparisons inconsistent over time.
- **Manual spot-checking** — rejected: not automatable, not reproducible, and one reviewer cannot consistently score 180 query-category pairs (30 × 6); provides no regression signal when code changes.

## Consequences

Search quality became a number that can regress in CI. Caveat stapled to every score: results are relative to Claude's judgment, not comparable to GPT-4-scored RAGAS runs.
