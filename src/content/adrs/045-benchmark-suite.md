---
id: 45
title: "Measuring search quality with a repeatable benchmark"
sourceKind: historical-note
status: historical
date: 2026-03-17
dateLabel: "17 March 2026 · journal-reported delivery"
journeyId: "2026-05-18-adr-045-search-quality-benchmark-suite-helm-scenario-grid-ragas-metrics-claude-code-as-llm-judge"
noteLabel: "Search benchmark"
tags: [historical-note, journal]
episode: season-3-episode-7-the-long-weekend
public: true
---

## Context

Season 3 Episode 7 reports that the search benchmark was delivered on 17 March 2026 and used during the following week's tuning. It describes 30 queries across six scenario categories—not 30 queries multiplied by six categories.

## Design rationale

Evaluate retrieval and answers across several metrics: faithfulness, relevance, context precision and recall, attribution, and reciprocal rank. The historical workflow used Claude Code as a judge, retained reports, and compared runs to find regressions.

## Limits and later decisions

Those scores depend on the corpus, questions, judge and run conditions. This note does not establish a currently enforced CI gate or independently reproduce the reported gains. Canonical ADR-045 concerns engineering-memory evaluation, a different benchmark. The later ADR-052 addresses agentic metrics and statistical improvements; [ADR-081](/adrs/081-eval-harness-governance/) records evaluation governance.

## Source and record history

[Read the published episode](/writing/season-3-episode-7-the-long-weekend/). Website Git history shows this page began as an explicitly labelled example reconstructed from the journal. Its original URL is retained, but the number in that URL is not a canonical ADR identity. Reconciled on 14 October 2026.
