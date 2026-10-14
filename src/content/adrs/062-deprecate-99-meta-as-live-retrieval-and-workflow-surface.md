---
id: 62
title: "Deprecate 99-Meta As Live Retrieval And Workflow Surface"
status: accepted
recordedStatus: "Accepted"
date: 2026-06-06
tags: ["vault", "retrieval-hygiene", "99-meta", "indexing"]
sourceKind: source-record
public: true
journeyId: "2026-06-06-adr-062-deprecate-99-meta-as-live-retrieval-and-workflow-surface"
---
# ADR-062: Deprecate 99-Meta As Live Retrieval And Workflow Surface

## Status

**Accepted** — 2026-06-06

## Context

`99-Meta` was originally a vault-about-the-vault and automation workspace, but it now mixes several incompatible content classes:

- superseded Claude, Copilot, and agent rule files
- old HLD/LLD indexes that point to `99-Meta` paths rather than the canonical `09-System/Architecture` lanes
- runtime debris under `System-Runtime`, including logs, cache files, plugin state, and generated markdown
- shell automation under `01-Automation` that can mutate vault files and still references obsolete `Leveling-Life` paths
- useful setup guides, topology notes, and personal explanatory material that should be preserved somewhere else

This makes `99-Meta` unsafe as a live retrieval surface. Semantic retrieval can treat obsolete operational facts as current truth, while agents may pick up old workflow rules that conflict with the current `AGENTS.md`, `09-System`, and ADR-030 vault routing model.

The goal is not to delete history. Ryan wants the literal past preserved, but current retrieval and workflow behavior should be driven by validated, canonical lanes.

## Decision

Deprecate `99-Meta` as a live retrieval and workflow surface.

Going forward:

1. `99-Meta` is legacy-only. New human-written or agent-written current-truth content must not be routed there.
2. Shared vault indexing exclusions include `99-Meta`, so Qdrant, Postgres, and other shared indexers exclude it by default.
3. Useful content inside `99-Meta` must be promoted selectively into canonical destinations after validation:
   - runbooks and operational truth to `09-System/Runbooks`
   - ADR/HLD/LLD/topology decisions to `09-System/Architecture`
   - technical references to `04-Resources`
   - personal explanatory material to `05-Personal`
   - unresolved legacy material to an unindexed archive quarantine
4. Promotion should prefer refreshed summaries over raw copies when the source asserts stale paths, stale services, or stale workflow rules.
5. Historical files that document old `Leveling-Life` paths should keep those paths when archived as history; only promoted current docs should be rewritten to `${ROOTWEAVER_HOME}` and current vault paths.
6. `06-Archive/To-Be-Sorted-2026-06-06` remains excluded until each lane is deliberately sorted and allowed.

## Consequences

Positive:

- Current retrieval stops amplifying stale agent rules, old architecture indexes, and runtime debris.
- The vault keeps a cleaner distinction between active work, canonical system truth, resources, personal notes, and preserved history.
- Future agents have a clear rule: validate and promote useful `99-Meta` material instead of reading it as current truth.
- The decision aligns with ADR-030's folder-purpose model and ADR-047/ADR-061's provenance/trust direction.

Negative:

- Existing Qdrant/Postgres chunks for `99-Meta` need stale-path cleanup after the code change lands.
- Useful material in `99-Meta` becomes invisible to default retrieval until promoted.
- Some legacy automation may break if it still assumes `99-Meta` is a live workspace. That is intentional; such automation should be refactored or retired rather than kept alive implicitly.

Operational follow-up:

- Run stale-index audits for `rootweaver_vault`, `rootweaver_vault_v2`, and the Postgres vault index after merge.
- Validate and promote the short list of setup guides, topology notes, and resource documents captured in the VW-598 active plan.
- Confirm `99-Meta` returns zero default-retrieval chunks after cleanup.

## Alternatives Considered

### Keep `99-Meta` Indexed And Rely On Ranking

Rejected. Ranking demotion helps true archives, but `99-Meta` contains stale instructions and generated runtime files, not clean historical knowledge. Allowing it into default retrieval creates a high risk of obsolete workflow and architecture facts appearing authoritative.

### Bulk Move `99-Meta` Into `09-System`

Rejected. Some files are valuable, but many assert old paths, old services, or old automation behavior. Bulk promotion would launder stale content into the canonical system lane.

### Bulk Move `99-Meta` Into `06-Archive`

Rejected as the only step. It preserves history, but it does not surface the useful runbooks and references that should be validated and promoted. It also risks making the archive a dumping ground unless unresolved material is quarantined separately.

### Delete `99-Meta`

Rejected. Ryan explicitly wants the literal past preserved where possible. Deletion is unnecessary once indexing and workflow references are cut over.

## References

- Related Jira: VW-598
- Related ADRs: ADR-030, ADR-047, ADR-061
- Active plan: `02-Active-Work/Plans/2026-06-06-VW-598-99-Meta-Migration-Plan.md`
