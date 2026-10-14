---
id: 86
title: "GPU/WebGL Graph Lens over FalkorDB (rootweaver-console Graph Tab)"
status: accepted
recordedStatus: "Accepted"
date: 2026-06-26
tags: []
sourceKind: source-record
public: true
journeyId: "2026-06-26-adr-086-gpu-webgl-graph-lens-over-falkordb-rootweaver-console-graph-tab"
---
# ADR-086: GPU/WebGL Graph Lens over FalkorDB (rootweaver-console Graph Tab)

**Status**: Accepted
**Date**: 2026-06-26
**VW-Issue**: VW-1023
**Relates to**: ADR-080 (namespace taxonomy), ADR-061 (provenance), VW-811 (GraphRAG/embeddings backlog), VW-866 (console idea-graph v2 backlog), VW-1015 (Obsidian MOC graph remediation), VW-1020 (Cosmos GPU spike)
**Provenance**: agent:claude-code | model:claude-sonnet-4-6

---

## Context

Obsidian's built-in graph view is a single-threaded JavaScript force-simulation. At ~17k vault nodes (Ryan's vault as of June 2026, tracked in VW-1015) rendering becomes sluggish and navigation stalls. The ceiling is roughly 10k nodes for smooth interaction.

The bottleneck is the *visualisation layer only*. The underlying data is already at scale: Qdrant holds 148k+ document chunks, and FalkorDB (via Graphiti) stores two production graphs in the `rw-data` namespace:

- `rootweaver_memory` — ~5,803 nodes: Session (692), Round (2,458), Artifact (2,653)
- `code_knowledge` — ~10,397 nodes: Module, Class, Method, Function, Variable, Process, Community

A third graph, `document_knowledge`, exists but is empty (VW-703, deferred).

The decision space has two dimensions: (1) can we render these graphs without replatforming the PKM, and (2) can we reuse existing architecture patterns rather than inventing new ones?

---

## Decision

Build a **GPU/WebGL graph lens** as a new "Graph" tab in `rootweaver-console`, backed directly by FalkorDB, using **@cosmograph/cosmos v1** as the renderer.

Key sub-decisions:

### 1. Renderer: @cosmograph/cosmos (GPU force-sim in WebGL)
Cosmos handles 1M+ nodes in a WebGL canvas via GPU-computed force-simulation. It ships a `settle-then-freeze` mode that terminates the physics sim once stable, eliminating CPU drain on idle views. Hover labels and click-to-detail are supported natively. A `[memory | code]` toggle switches between the two FalkorDB graphs.

### 2. Frontend deployment: static nginx:alpine on hostPath, NodePort 30657
`falkor-graph-frontend` is a plain nginx container serving a desktop hostPath directory (Syncthing/git-synced from the platform repo). This reuses the `adr-lineage-frontend` pattern exactly. NodePort **30657** was assigned (30656 was occupied by monitoring/mcp-grafana-rw, caught by a Flux dry-run before rollout).

The Graph tab is embedded in rootweaver-console via `&lt;iframe&gt;` with `CSP frame-src` relaxed to allow localhost:30657, and a navigation module entry added to the console (console image rebuilt as `vw-1023b`).

### 3. Data path: nightly CronJob exports FalkorDB graphs to hostPath JSON
A `falkor-refresh` CronJob runs at 03:30 nightly. It queries both graphs from FalkorDB and writes `rootweaver_memory.json` and `code_knowledge.json` into the shared hostPath directory. The frontend Cosmos instance loads whichever JSON file matches the active toggle at page load; no runtime FalkorDB calls from the browser.

### 4. Exporter namespace: rw-memory (NOT rw-frontend) — VW-863 boundary preserved
This is the critical security/architecture boundary decision. VW-863 established that **rw-frontend is intentionally not a FalkorDB peer** — the code-graph-frontend proxies through mcp-bridge instead of calling FalkorDB directly. That boundary exists to keep the public-facing static tier stateless and network-isolated.

The `falkor-refresh` CronJob is placed in **rw-memory** (an existing FalkorDB peer namespace). Data reaches rw-frontend via a **node-local hostPath mount**, not a network call. No NetworkPolicy changes were required on rw-frontend. Only two allowlist additions were made: rw-memory egress → rw-data:6379, and rw-data falkordb ingress from rw-memory.

---

## Implementation Notes (FalkorDB Gotchas)

Three non-obvious behaviours that any future work on this path must know:

1. **`labels(n)` serialises as a string, not a list.** `GRAPH.QUERY` returns label data as the string `"[Label]"` rather than a typed array. The exporter parses this with a regex rather than JSON-parsing it.

2. **10k RESULTSET_SIZE cap silently truncates.** FalkorDB's default result-set size cap is 10,000 rows per query. `code_knowledge` has ~16,157 edges; a naive `MATCH ()-[r]->() RETURN r` was silently returning only ~9,092. Fixed by paginating with `SKIP`/`LIMIT` 5000 blocks until an empty page is returned.

3. **`rootweaver_memory` nodes have no `.name` property.** Memory nodes are keyed by `.ref` or `.id`, not `.name`. The exporter coalesces `n.ref ?? n.id ?? n.uuid` for the display label.

---

## Security

The initial implementation had a stored-XSS vector: FalkorDB-derived strings (node labels, edge types, property values) were interpolated directly into `innerHTML` in the panel, tooltip, and legend components. This was flagged HIGH severity by automated review and fixed in commit `f7995d3b` by HTML-escaping all FalkorDB-derived values before DOM insertion.

---

## Consequences

### Positive
- GPU renderer handles both current graphs (5,803 + 10,397 nodes) and leaves orders of magnitude of headroom for growth.
- No new container image for the exporter — reuses `operator-tools` image from the `adr-lineage-refresh-cronjob` pattern.
- Frontend script edits (Cosmos config, colour scheme, toggle behaviour) require no image rebuild; the generator file is mounted from the synced hostPath.
- Obsidian stays the markdown editor; FalkorDB + GPU renderer become the visual reasoning layer, cleanly separated.
- Establishes the foundation for VW-811 (PyTorch Geometric graph-ML on the RTX 4080) and VW-866 (console idea-graph v2).

### Negative / Trade-offs
- The nightly export means the graph is up to ~24h stale. Acceptable for visual exploration; not suitable for real-time graph queries.
- The hostPath mount creates a coupling between the node filesystem layout and both the exporter CronJob and the frontend pod. A future move to a PVC would decouple this.
- `document_knowledge` is deferred (VW-703 — empty graph); the toggle currently only exposes two graphs.

---

## Alternatives Considered

### Switch PKM tool
Rejected. Obsidian is the best-available markdown PKM at Ryan's vault scale. The problem is the *renderer*, not the data model.

### rw-frontend as a direct FalkorDB peer
Rejected. VW-863 explicitly drew this boundary. Crossing it would expose the static frontend to the graph database network and require additional NetworkPolicy holes. The hostPath pattern achieves the same result without the boundary violation.

### mcp-bridge proxy (frontend calls mcp-bridge, mcp-bridge queries FalkorDB)
Viable, but introduces a runtime dependency: every page load would require a live mcp-bridge call to fetch graph JSON. The nightly export pattern is simpler, more resilient, and consistent with the adr-lineage pattern already in production.

### Obsidian Dataview / community graph plugins
Evaluated briefly. None support GPU rendering or external graph databases. They operate on in-vault markdown, not FalkorDB.

---

## Deployment Artefacts

| Artefact | Location |
|---|---|
| Gitops commit | rootweaver-gitops@e59ca22 |
| Platform branch | feat/vw-1023-falkor-graph-lens |
| MR | REDACTED_PRIVATE_URL |
| NodePort | 30657 |
| Console image tag | vw-1023b |
| Exporter CronJob | falkor-refresh (rw-memory ns, 03:30 nightly) |
