---
id: 71
title: "Graph Node Lifecycle & Event-Loop Offloading Contract"
status: accepted
recordedStatus: "Accepted"
date: 2026-06-10
tags: ["pdg", "falkordb", "mcp-bridge", "rootweaver-graph"]
sourceKind: source-record
public: true
episode: "season-4-episode-02-the-morning-after-proving-the-fixes-were-real"
journeyId: "2026-06-10-adr-071-give-graph-nodes-a-lifecycle-and-keep-rebuilds-off-the-event-loop"
---
# ADR-071: Graph Node Lifecycle & Event-Loop Offloading Contract

**Status**: Accepted (2026-06-10) · **Driver**: VW-686 (VW-673 audit theme 7, final) · **MR**: !133 → `5eb589f6`

## Context

The PDG/code-knowledge graph layer served **wrong or stale answers** through four
independent mechanisms, each silent:

1. **Phantom nodes**: `falkordb_exporter.export_graph` was MERGE-only — deleted or
   renamed code stayed in the graph forever and kept appearing as dependents in
   `get_impact_radius`/`get_shortest_path`. (Edges already had `last_seen_at`
   filtering from DAT Phase 2; **nodes had no lifecycle at all**.)
2. **Event-loop blocking**: every async MCP tool called the synchronous
   `_get_pdg()` directly — a cold AST rebuild (54–150 s) froze the entire
   mcp-bridge, timing out unrelated tools (`auto_search_vault`, memory tools).
3. **Permanent stale content**: the knowledge-graph ingestion tracker stored an
   empty content hash, so edited files were never re-ingested; with VW-686's first
   fix alone, an edited file with an unchanged chunk count would *re-enter*
   processing but skip every chunk forever (verifier-caught).
4. **Cache poisoning**: the PDG disk cache ignored `root_path` — a subdir-scoped
   rebuild overwrote the default-root cache.

## Decision — four rules

### 1. Node lifecycle: stamp → sweep → filter
**Before**: nodes MERGE'd with `created_at`/`updated_at` only; never deleted.
**After**:
- Every node MERGE stamps `last_rebuild_at = $rebuild_start_ts` (ON CREATE **and**
  ON MATCH); `rebuild_start_ts` is captured from FalkorDB `timestamp()` before the
  export and written to PDGMeta with the same value.
- After a **clean** full export (`stats.errors` empty), sweep:
  `MATCH (n) WHERE NOT n:Community AND NOT n:Process AND NOT n:PDGMeta AND
  (n.last_rebuild_at IS NULL OR n.last_rebuild_at < $ts) DETACH DELETE n`.
  A dirty export skips the sweep — a transiently-failed MERGE must not delete a
  still-valid node.
- `get_impact_radius` / `get_shortest_path` filter on the latest PDGMeta rebuild
  timestamp, mirroring the existing edge `last_seen_at` filter.

### 2. No blocking work on the bridge event loop
**Before**: `pdg = _get_pdg(root)` inline in async tools.
**After**: every blocking call inside an async MCP tool — PDG build/load, FalkorDB
export/sync, embedding `encode` (rootweaver-graph) — runs via
`await asyncio.to_thread(...)`. Proven live: `auto_search_vault` answered during a
cold rebuild on the deployed vw-686 bridge. Accepted residual: two concurrent
calls may race a duplicate rebuild (wasted work, not corruption).

### 3. Ingestion progress is only valid for the content it was recorded against
**Before**: tracker stored `hash: ""`; resume returned stale chunk lists.
**After**: `mark_chunk_done` persists the real MD5 (same `_content_hash` the
`needs_processing` check uses); `get_completed_chunks` discards progress when the
stored hash is missing or no longer matches; `mark_failed` preserves chunk
bookkeeping so retries resume rather than duplicate.

### 4. Caches are keyed by their root
**Before**: `PDGCache(DEFAULT_CACHE_DIR)` regardless of `root_path`.
**After**: non-default roots get `DEFAULT_CACHE_DIR/&lt;sha1(root)[:12]&gt;`; the
default root keeps its byte-identical path. Missing index = "everything changed"
(rebuild), never "nothing changed" (VW-683).

## Consequences

- Code intelligence answers reflect the code that exists *now*; deleted modules
  stop appearing as dependents after the next clean full export.
- mcp-bridge stays responsive during rebuilds — the operational requirement that
  motivated the bench/readonly bridge split no longer degrades the primary.
- The canonical graph name is **`code_knowledge`** (GraphName.CODE aligned;
  `code_intelligence` existed only in the enum, docstrings, and a pre-broken
  Grafana dashboard — see VW-699 follow-ups).
- Tests: `test_pdg_generator_vw686_graph_fixes.py`, `test_rootweaver_graph_vw686.py`
  (+45 across the theme); regression greps + finder re-run in the master audit
  report's verification block.

## Related
ADR-036 (tri-store) · DAT Phase 2 edge staleness (HLD-02 §1c) · ADR-070 ·
VW-686 impl report `02-Active-Work/Implementation-Reports/2026-Q2/2026-06-10-VW-686-PDG-Graph-Theme-Remediation.md`
