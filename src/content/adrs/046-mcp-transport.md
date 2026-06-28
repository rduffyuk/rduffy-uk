---
id: 46
title: "MCP transport: migrate SSE → streamable HTTP"
status: accepted
date: 2026-05-28
tags: [mcp, transport, keda]
supersedes: "ADR-029 (SSE transport)"
episode: season-3-episode-7-the-long-weekend
public: true
---

## Context

The MCP bridge served 29 tools over SSE. Cold starts took up to 40 s when KEDA scaled the bridge from zero — every first tool call of a session paid the price, and SSE held a connection per session that complicated the bridge's scaling story.

## Decision

Migrate the bridge to the streamable-HTTP transport introduced in the MCP spec (2025-03 revision). Stateless request/response with optional streaming; sessions resume via `Mcp-Session-Id`.

## Consequences

Cold starts dropped 96% (40 s → 1.6 s). KEDA can now scale the bridge to zero safely. Cost: clients pinned to old SDK versions needed an upgrade path for one release cycle.

## Alternatives considered

- **Keep SSE with a warm minimum replica** — rejected: pays an idle-node tax 24/7.
- **WebSocket transport** — rejected: not in spec, nonstandard client support.
