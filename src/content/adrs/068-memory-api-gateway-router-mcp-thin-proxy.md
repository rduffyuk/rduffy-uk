---
id: 68
title: "Memory API in rag-gateway; mcp-bridge Becomes a Thin Proxy"
status: proposed
recordedStatus: "Proposed"
date: 2026-06-10
tags: ["memory", "rag-gateway", "mcp-bridge", "api-design"]
sourceKind: source-record
public: true
journeyId: "2026-06-10-adr-068-memory-api-in-rag-gateway-mcp-bridge-becomes-a-thin-proxy"
---
# ADR-068 — Memory API in rag-gateway; mcp-bridge Becomes a Thin Proxy

**Status:** Proposed — 2026-06-10 (VW-695 design phase)
**Decision drivers:** 2026-06-10 platform API-surface review; ADR-067 contract; Rootweaver Console prerequisite.

## Context

The typed memory layer — `recall_decisions`, `find_problems`, `recall_session`, `recall_state_at`, `recall_origin`, `trace_decision_chain` (Postgres + FalkorDB) and `save/recall_agent_context` (Qdrant) — is implemented **inside mcp-bridge** (`packages/mcp-bridge/src/mcp_bridge/memory_tools.py`, `main.py:822-925`) with direct database connections. These are the **only** mcp-bridge tools with no HTTP equivalent; every other tool proxies rag-gateway via `_request_with_retry`.

Consequences of the current shape:

1. **No non-Claude consumer can reach engineering memory** — no console, benchmark harness, cron job, or other agent. The Rootweaver Console (memory/decision explorer) is blocked on this.
2. **mcp-bridge is secretly a second backend**, with its own Postgres/FalkorDB/Qdrant DSNs, NetworkPolicy allowances, and 30+ hard-coded SQL strings (the VW-434 sidecar bench had to work around exactly this).
3. The benchmark fidelity problem recurs: `eng_memory_bench` measures SQL templates or needs a forked bridge, instead of hitting one canonical HTTP contract.

Constraint from **ADR-057**: composite tools (`recall_layered`, `pdg_impact_report`, VW-528) were decided to live server-side in mcp-bridge to capture deterministic multi-tool chains. That decision stands — composition stays in the bridge; only the **data access** moves behind HTTP.

## Decision

1. **Create a `/v1/memory/*` router in rag-gateway** (`packages/rag-gateway/`, never the `rag_platform/` shim layer — ADR-030 Stage 6 pending), following the ADR-067 contract (C1–C10). Endpoint set v0 (full schemas in the design doc):
   - `GET /v1/memory/decisions` (+ `/{slug}`, `/{slug}/chain`)
   - `GET /v1/memory/problems`
   - `GET /v1/memory/sessions` (+ `/{id}`)
   - `GET /v1/memory/state`, `GET /v1/memory/origins`
   - `GET|POST /v1/memory/contexts` (Qdrant agent-context)
   - `GET /v1/memory/stats`
2. **Extract data access into `rootweaver-memory`** (library package): the SQL/FalkorDB/Qdrant logic currently in `memory_tools.py` moves to a repository module (`rootweaver_memory.recall`), imported by the gateway router. mcp-bridge stops importing DSNs for memory.
3. **mcp-bridge memory tools become thin proxies** through `_request_with_retry`, exactly like the other 20+ tools. **MCP tool names and signatures are unchanged** — zero churn for Claude-side callers, CLAUDE.md, or hooks. Composite tools (ADR-057) compose the new HTTP endpoints server-side.
4. **Network policy follows the data**: gateway gains egress to vault-postgres/FalkorDB/Qdrant for the memory paths; the bridge's direct DB allowances are removed once the proxy refactor lands (two-step: add → migrate → revoke).

## Consequences

**Positive:** memory becomes a first-class platform capability — console, benchmarks (VW-434 sidecar can target HTTP for true production fidelity), cron, and future agents share one contract; mcp-bridge returns to being a bridge; one place to enforce ADR-067 conventions, redaction, and (later) auth.

**Negative / costs:** one extra in-cluster hop for memory recalls (expected single-digit ms — measure in the VW-529 efficiency metrics, which now apply cleanly since calls traverse the gateway); careful NetworkPolicy sequencing (kube-router ipset gotchas, see VW-567 memory); the `recall_session` UTC-date caveat must be documented in the OpenAPI description rather than tribal memory.

**Rollout gate:** mcp-bridge has no CI build (hand-build → Harbor → gitops bump) — the proxy refactor ships as a deliberate image bump, not on merge.
