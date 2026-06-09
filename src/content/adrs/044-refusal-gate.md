---
id: 44
title: "Refusal gate: answer 'I don't know' below confidence threshold"
status: accepted
date: 2026-05-08
tags: [rag, quality]
episode: season-3-episode-4-refusal-gate
public: true
---

> **EXAMPLE RECORD** — placeholder reconstructed from blog episode S3E4. Replace with the real ADR from the platform repo before going live.

## Context

The RAG pipeline answered every query, including ones where retrieved context was irrelevant — confident hallucinations were the platform's worst failure mode.

## Decision

Add a refusal gate: when retrieval confidence falls below threshold, the answer is an explicit "I don't know" with the closest partial matches listed, rather than a synthesized guess.

## Consequences

Faithfulness improved measurably on the benchmark suite; a small share of answerable queries now refuse and need threshold tuning.
