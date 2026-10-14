---
id: 46
title: "MCP transport: moving from SSE to Streamable HTTP"
sourceKind: historical-note
status: historical
date: 2026-03-29
dateLabel: "29 March 2026 · documented migration"
journeyId: "2026-05-28-adr-046-mcp-transport-migrate-sse-streamable-http"
noteLabel: "MCP transport"
tags: [historical-note, journal]
episode: season-3-episode-7-the-long-weekend
public: true
---

## Context

The March journal and platform specifications record the primary MCP bridge's migration from SSE to Streamable HTTP on 29 March 2026 (VW-177). The earlier website date and ADR number were part of an example record, not a canonical decision allocation.

## Design rationale

The bridge uses a stateless HTTP application for tool requests. Current source explicitly selects `stateless_http=True` for its HTTP path. Streamable HTTP can also be stateful; the transport name alone does not establish session affinity, cold-start time or safe scale-to-zero behaviour.

## Current context

On 14 October, the primary bridge deployment declared `MCP_TRANSPORT=http` and had one desired and one ready replica. The source still includes a legacy SSE branch. This check does not remeasure the historical 40-second-to-1.6-second latency claim, prove SSE retirement, or demonstrate scale-to-zero.

## Record correction

The previous claim that this superseded ADR-029 has been removed: canonical ADR-029 concerns GPU scheduling. Canonical ADR-046 concerns memory embedding. Neither is the predecessor decision for this transport note.

## Source and record history

[Read the published episode](/writing/season-3-episode-7-the-long-weekend/). Website Git history shows this page began as an explicitly labelled example reconstructed from the journal. Its original URL is retained, but the number in that URL is not a canonical ADR identity. Reconciled on 14 October 2026.
