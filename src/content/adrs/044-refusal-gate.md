---
id: 44
title: "Refusal gate: answer 'I don't know' below confidence threshold"
status: accepted
date: 2026-05-08
tags: [rag, quality]
episode: season-3-episode-4-refusal-gate
public: true
---

## Context

The RAG pipeline answered every query, including ones where retrieved context was irrelevant — confident hallucinations were the platform's worst failure mode.

## Decision

Add a refusal gate: when retrieval confidence falls below threshold, the answer is an explicit "I don't know" with the closest partial matches listed, rather than a synthesized guess.

## Alternatives considered

- **Return a "best effort" answer with low confidence** — rejected: still produces hallucinations phrased confidently; callers cannot distinguish a low-confidence synthesis from a high-confidence one, which is the exact failure mode we are trying to eliminate.
- **Surface an uncertainty flag in the response body without changing the answer** — rejected: adds complexity without behavioral change; shifts the burden of interpreting confidence onto every caller rather than the system acting correctly at the boundary.

## Consequences

Faithfulness improved measurably on the benchmark suite; a small share of answerable queries now refuse and need threshold tuning.
