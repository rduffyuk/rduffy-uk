---
id: 45
title: "Search-quality benchmark suite: HELM scenario grid + RAGAS metrics, Claude Code as LLM judge"
status: accepted
date: 2026-05-18
tags: [benchmark, rag, quality]
episode: season-3-episode-7-the-long-weekend
public: true
---

> **EXAMPLE RECORD** — placeholder reconstructed from blog episode S3E7. Replace with the real ADR from the platform repo before going live.

## Context

Search "worked," but there was no data on whether a result was faithful, whether the right document ranked first, or whether last week's change quietly made things worse.

## Decision

Build a benchmark suite borrowing from the academic RAG-evaluation literature: HELM's scenario-grid shape (30 queries × 6 categories), RAGAS metrics (faithfulness, answer relevancy, context precision/recall), RAGBench's attribution, and MRR. Claude Code acts as the LLM judge against structured rubrics — no external eval API spend.

## Consequences

Search quality became a number that can regress in CI. Caveat stapled to every score: results are relative to Claude's judgment, not comparable to GPT-4-scored RAGAS runs.
