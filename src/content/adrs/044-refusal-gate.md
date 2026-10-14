---
id: 44
title: "Refusal gate: answer only when the evidence supports it"
sourceKind: historical-note
status: historical
date: 2026-02-28
datePrecision: month
dateLabel: "February 2026 · exact day not established"
journeyId: "2026-05-08-adr-044-refusal-gate-answer-i-don-t-know-below-confidence-threshold"
noteLabel: "Refusal gate"
tags: [historical-note, journal]
episode: season-3-episode-4-refusal-gate
public: true
---

## Context

The journal describes a retrieval system that could produce a fluent answer even when its evidence was weak. The refusal-gate chapter places the work in February 2026; it does not establish the May acceptance date previously shown on this website.

## Design rationale

Use retrieval confidence to decide whether synthesis should proceed. When the available context is insufficient, return an explicit uncertainty response and the closest useful matches instead of presenting an unsupported answer as fact.

## Limits

The threshold trades missed answers against unsupported answers and needs evaluation. The journal is the source for this historical account; this reconciliation does not establish the gate's present coverage or re-run its quality measurements. The canonical ADR-044 is a separate memory-evaluation record, so its supersession does not apply here.

## Source and record history

[Read the published episode](/writing/season-3-episode-4-refusal-gate/). Website Git history shows this page began as an explicitly labelled example reconstructed from the journal. Its original URL is retained, but the number in that URL is not a canonical ADR identity. Reconciled on 14 October 2026.
