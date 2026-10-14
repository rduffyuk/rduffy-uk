---
id: 83
title: "Sever the neural-vault Import Blind Spot (vs Workspace-ify It)"
status: accepted
recordedStatus: "Accepted"
date: 2026-06-19
tags: []
sourceKind: source-record
public: true
journeyId: "2026-06-19-adr-083-sever-the-neural-vault-import-blind-spot-vs-workspace-ify-it"
---
# ADR-083 — Sever the neural-vault Import Blind Spot (vs Workspace-ify It)

**Status:** Accepted · **Date:** 2026-06-19 · **Jira:** VW-917 (problem) · unblocks VW-919

## Context

`import-linter` (`.importlinter`) governs only the `packages/*` uv-workspace members
(per ADR-030 *(reference outside this archive)*). The legacy flat module directory `neural-vault/` is **not** a
workspace package — it has no `pyproject.toml`, no `__init__.py`, just loose `.py`
files — so it is **invisible to import governance**. Four packages still reach into
it. The 2026-06-19 Codex review (VW-918/919/921/922) surfaced this as a blind spot:
contracts pass while real cross-boundary imports go uncounted, and one of those
imports (`qdrant_hybrid_search`) carries an unsafe `pickle.load` of a disk cache
(VW-919, the only genuinely reachable security finding from that review).

VW-917 asks the binary question: **workspace-ify `neural-vault/`** so import-linter
governs it, **or sever the import sites** so nothing reaches in.

### The coupling is not uniform — it splits 2-and-2

Static + Dockerfile analysis (2026-06-19, `feature/vw-432` tree) shows the "four
sites" resolve by two different mechanisms, and two of them are already dead:

| # | Importer (file:line) | Import | Resolution | Live? |
|---|---|---|---|---|
| 1 | `rag-gateway/system_endpoints.py:314` | `from neural_vault.fastmcp_bridge import get_semantic_cache_stats` | underscore **package** — but no `neural_vault` package exists and `fastmcp_bridge.py` was migrated out to `packages/mcp-bridge/`; gateway image ships **no** `neural-vault/` | **Dead** — always `except ImportError` → returns `{"message":"Cache stats not available"}` |
| 2 | `rag-retriever/retriever.py:325` | `from neural_vault.hybrid_search import BM25Index` | same underscore-package path; retriever image ships **no** `neural-vault/`; wrapped in `try/except` | **Dead** — BM25 import silently fails; retriever degrades to vector-only on that path |
| 3 | `rootweaver-core/shared_search.py:33` | `from qdrant_hybrid_search import QdrantHybridSearch` (after `sys.path.insert(NEURAL_VAULT_PATH)`) | flat module on injected path | **Live** when `NEURAL_VAULT_PATH` is set; pulls in the **VW-919 pickle** (`qdrant_hybrid_search.py:263`) |
| 4 | `operator-tools` indexers (`vault_indexer_postgres.py:51,60`, `vault_delta_indexer_postgres.py`) | `from shared_constants import EXCLUDE_DIRS`, `from vault_indexer import (...)` | flat, deliberately packaged: operator-tools Dockerfile `cp shared_constants.py → site-packages/`; vault-delta-indexer Dockerfile `COPY neural-vault/*.py` + `PYTHONPATH=/app/neural-vault` | **Live** — the indexer engine genuinely runs from here |

Key facts behind the table:
- A hyphenated dir `neural-vault/` **cannot** satisfy an underscore dotted import
  `neural_vault.X` — that name is not a legal package path. No symlink, `.pth`,
  `sitecustomize`, or Dockerfile rename creates an importable `neural_vault`.
  So **sites 1 & 2 can only ever hit their `except ImportError`**: they are dead
  fallbacks masquerading as integration points.
- The genuinely-used surface is **three modules**: `shared_constants.py` (73 LOC),
  `qdrant_hybrid_search.py` (593 LOC, the pickle), `vault_indexer.py` (1219 LOC).
  Everything else under `neural-vault/` is unreferenced from `packages/`.

This reframes VW-917: it is **not** "govern a live shared library." It is "stop
laundering 3 used modules + a pile of dead code through an ungoverned directory."

## Decision drivers

1. **Direction of ADR-030 *(reference outside this archive)*.** The whole point of ADR-030 was to *decompose*
   `neural-vault/` into governed `rootweaver-*` packages (mcp-bridge already migrated
   out). Re-blessing the residue contradicts that arc.
2. **Make governance honest, not green-by-lowering-the-bar.** import-linter passing
   should mean "no rogue coupling," not "we declared the rogue coupling legal."
3. **VW-919 lives inside this decision.** The pickle cache only matters because
   site 3 is reachable. Relocating `qdrant_hybrid_search` is the natural place to
   replace `pickle` with a safe format — fix the bug *by moving it home*, not in situ.
4. **Cost asymmetry.** 2 of 4 sites are free to cut (delete dead branches). The real
   work is relocating 3 modules, of which only `vault_indexer` (1219 LOC) is heavy.
5. **No new permanent package for legacy.** Workspace-ifying mints a forever-package
   whose name must reconcile the `neural-vault`→`neural_vault` rename and drags dead
   modules (the absent `fastmcp_bridge`, the pickle, unreferenced files) under CI.

## Considered options

### Option A — Workspace-ify `neural-vault/`

Add `pyproject.toml` + `__init__.py`, rename to `packages/rootweaver-neural-vault/`
(underscore import `rootweaver_neural_vault`), add to `[tool.uv.workspace]`, declare
it as a dep of the four importers, let import-linter see the edges.

- **Pros:** Fastest path to import-linter visibility. Sites 3 & 4 become *declared*
  deps. No code relocation. One commit makes contracts honest.
- **Cons:** Blesses a legacy grab-bag as a first-class package — the opposite of
  ADR-030's decomposition. Brings the entire directory (incl. dead `fastmcp_bridge`
  callers, the pickle, and every unreferenced module) under governance and CI for the
  sake of 3 used files. Forces the hyphen→underscore rename to become permanent. Does
  **nothing** for VW-919 (pickle still ships). Sites 1 & 2 stay dead but now look
  "governed." Lowers the bar instead of reducing coupling.

### Option B — Sever the import sites *(chosen)*

Relocate the three genuinely-used modules into existing governed packages, delete the
two dead branches, then retire `neural-vault/` as a runtime dependency.

- **Pros:** Eliminates the blind spot at the root — nothing reaches into an ungoverned
  dir, so import-linter governs the *whole* runtime surface by construction. Continues
  ADR-030. Folds the VW-919 pickle fix into the `qdrant_hybrid_search` relocation.
  Shrinks the deployed surface (gateway/retriever stop pretending to integrate;
  operator-tools images stop copying a loose `.py` pile).
- **Cons:** More work than A. `vault_indexer.py` (1219 LOC) relocation is non-trivial
  and touches the live indexer path (must preserve chunk-ID parity called out in
  `vault_indexer_postgres.py:118`). Requires care that the indexer's runtime behaviour
  is byte-for-byte preserved (golden-ID test before/after).

## Decision

**Adopt Option B (sever), executed in three phases of decreasing safety margin.**
Workspace-ifying (Option A) is rejected: it would legitimise a directory ADR-030
exists to dismantle and would leave VW-919 shipped.

### Phase 1 — Cut the dead branches (cheap, immediate)
Sites 1 & 2 never resolve in production. Replace the dead `try: from neural_vault…`
blocks with an honest implementation or an explicit "feature retired" response:
- `rag-gateway` `/system/cache/stats`: either wire to the real semantic-cache source
  in `packages/mcp-bridge/` (where `fastmcp_bridge` now lives) or return a documented
  "not available" without pretending to import. *Decide which when the endpoint's
  consumer is confirmed.*
- `rag-retriever` BM25: the `neural_vault.hybrid_search` path is dead; the retriever's
  real BM25 must come from a governed module or be explicitly removed. *Confirm the
  retriever's live BM25 source before deleting (it may already use another path).*

### Phase 2 — Relocate the small live modules
- `shared_constants.EXCLUDE_DIRS` (73 LOC) → `rootweaver-core` (it is shared
  indexer/search config; this is its natural home, and the indexer↔search exclusion
  list must stay single-sourced per vault_indexing_exclusion_list.md *(internal reference; not included)* — VW-203).
  Update operator-tools to import from `rootweaver_core` and drop the
  `cp shared_constants.py → site-packages/` Dockerfile hack.
- `qdrant_hybrid_search.QdrantHybridSearch` (593 LOC) → `rootweaver-core` (or a
  retrieval package). **In the same move, replace `pickle.load`/`pickle.dump` with a
  safe serialization (JSON / msgpack / safetensors) — this closes VW-919.** Update
  `rootweaver-core/shared_search.py:33` to import the relocated symbol and delete the
  `sys.path.insert(NEURAL_VAULT_PATH)` shim.

### Phase 3 — Relocate the heavy module, retire the directory
- `vault_indexer.py` (1219 LOC) → `operator-tools` (its only consumer) or a new
  `packages/rootweaver-indexer/` if it warrants its own member. Guard with a
  golden chunk-ID parity test (IDs must match `vault_indexer.py:823-825` semantics
  before/after) so re-indexing does not orphan existing vectors.
- Once nothing under `packages/` references `neural-vault/`, drop the
  `COPY neural-vault/*.py` / `PYTHONPATH=/app/neural-vault` lines from the
  operator-tools and vault-delta-indexer Dockerfiles, and move the remaining
  `neural-vault/` content to `06-Archive`-equivalent / delete per VW-923's sibling
  decision on dead vendored trees.

After Phase 3, `import-linter` governs 100% of the runtime import graph with **no**
ungoverned escape hatch, and VW-919 is closed structurally rather than patched.

## Consequences

**Positive**
- Import governance becomes complete and honest; no ungoverned `neural-vault/` edge.
- VW-919 (pickle RCE surface) is fixed as a side-effect of Phase 2, not deferred.
- Deployed images shrink; gateway/retriever stop shipping dead integration branches.
- Continues ADR-030's decomposition instead of reversing it.

**Negative / costs**
- Three phased PRs (vs Option A's single commit). Phase 3 touches the live indexer
  and needs the chunk-ID parity guard — the main risk surface.
- Until Phase 2 lands, VW-919's pickle still ships wherever `NEURAL_VAULT_PATH` is set
  (operator-tools / vault-delta-indexer images). VW-919 stays **blocked on Phase 2**,
  not on the whole ADR.

**Neutral**
- Phases 1–2 are low-risk and can land independently; Phase 3 can be scheduled when
  the indexer has test coverage to back the parity guard.

## Follow-ups
- **VW-919** — pickle → safe format; do it *inside* Phase 2's `qdrant_hybrid_search`
  relocation. Now unblocked by this ADR.
- **VW-923** — sibling decision on the dormant `rootweaver-connectors/sources/*`
  vendored fork; same "dead tree under a package" hygiene theme (see
  connectors_sources_vendored_fork.md *(internal reference; not included)*).
- Phase tickets to be filed under VW-917 as sub-tasks (Phase 1 / 2 / 3).
