---
id: 36
title: "Vault Structured Index in Postgres"
status: accepted
recordedStatus: "Accepted"
date: 2026-04-19
tags: ["architecture", "postgres", "vault-index", "claude-code", "mcp"]
sourceKind: source-record
public: true
journeyId: "2026-04-19-adr-036-vault-structured-index-in-postgres-relational-authority-beside-vector-recall"
---
# ADR-036: Vault Structured Index in Postgres

**Status**: Accepted
**Date**: 2026-04-19
**Jira Epic**: VW-218 *(internal reference; destination redacted)*
**Stories**: VW-219 *(internal reference; destination redacted)* (Phase 1) · VW-220 *(internal reference; destination redacted)* (Phase 2) · VW-221 *(internal reference; destination redacted)* (Phase 3) · VW-222 *(internal reference; destination redacted)* (Phase 4) · VW-223 *(internal reference; destination redacted)* (Phase 5, contingent)
**Implementation Plan**: VW-213 Plan *(internal reference; not included)*
**Related ADRs**:
- [ADR-034](/adrs/034-data-source-connectors/) — establishes Postgres-as-SoR pattern for external sources; this extends the same pattern to the local vault
- [ADR-035](/adrs/035-retrieval-evaluation-programme/) — Track B retrieval-quality work benefits from structured pre-filters this ADR enables

---

## Context

The Obsidian vault (~6,000 .md files, ~62K chunks in Qdrant) is the institutional memory of the platform. Claude Code — the primary user-facing interface — navigates it through three existing tools: Qdrant semantic search, Grep, and Read.

Three classes of question recur in Claude Code usage that none of these tools handle well:

1. **Structured predicates**: "All ADRs with status=Proposed", "docs created in April tagged #architecture"
2. **Relational joins**: "Which docs reference VW-189?", "what's linked from HLD-06 and when was each last verified?"
3. **Aggregations and timelines**: "Benchmark scores over time", "tag frequency by namespace"

Workarounds today require multiple Read calls, manual grep + parse, or fuzzy Qdrant searches that may miss matching files. This class of query — relational, filtered, aggregated — is structurally outside Qdrant's design.

Recent incidents reinforce the gap:
- **VW-186** (source filter silently dropped) — Qdrant's payload filter failed silently; no Postgres source-of-truth to cross-check.
- **VW-194** (freshness retrieval broken) — freshness implementation was a bolt-on because Qdrant can't cleanly compose `WHERE date > X` with similarity.

Market research (2026) confirms the emerging pattern: Notion runs their entire block graph on Postgres with JSONB. Supabase/Logseq/LlamaIndex/LangChain all expose Postgres-as-SoR with vector DB as similarity cache.

## Decision

Deploy a **Postgres 16 structured index over the Obsidian vault** as a first-class query tier, alongside (not replacing) Qdrant.

### Shape

1. **Hybrid schema** — typed columns for hot fields (date, type, status) with btree indexes; long-tail frontmatter in a `JSONB` column with GIN on `jsonb_path_ops`.
2. **Six tables** — `notes`, `tags`, `note_tags`, `note_links`, `blocks`, `note_jira_refs`.
3. **New MCP tool** `vault_query(sql)` — read-only, SQL-validated, 5s timeout, auto-LIMIT.
4. **Kafka-integrated indexer** — same pattern as vault-delta-indexer (KEDA ScaledJob), writing to Postgres in parallel with Qdrant.
5. **Valkey cache tier (Phase 5, contingent)** — BSD 3-Clause, Linux Foundation governed, for exact-query caching with Kafka-driven invalidation. Only landed if Phase 1-3 justify it.

### Authority boundaries

- **Obsidian (.md files)**: authoritative for prose content
- **Postgres (vault-index)**: authoritative for derived/structured metadata (tag vocabulary, backlink graph, Jira cross-references)
- **Qdrant**: authoritative for embeddings / similarity search; payload is cache, reconciled via `blocks` table
- **FalkorDB**: unchanged — graph authority for code and document knowledge graphs

### Enterprise posture

All components (Postgres, pgvector, Valkey, mistune, python-frontmatter) are permissive OSI-approved licenses suitable for corporate legal review: PostgreSQL License (BSD-derived), BSD 3-Clause, MIT. Intentional avoidance of SSPL/RSALv2/AGPL-only components.

## Consequences

### Positive

- **Claude Code gets a new query mode** — structured SQL for questions Qdrant can't answer, preserving Qdrant for what it's good at
- **Postgres becomes the reconciliation point** — if Qdrant corrupts, rebuild from Obsidian → Postgres → re-embed to Qdrant
- **Observable data quality** — Postgres exposes the messy reality of frontmatter (inconsistent fields, noisy tags) that Qdrant's blob payload hides
- **Enterprise-deployable stack** — every piece chosen to survive a corporate OSS review (no SSPL, no RSAL, no AGPL-only)
- **Pattern reusable** — same pattern applies to future sources via ADR-018 connector framework

### Negative

- **New pod to operate** — vault-postgres adds PDB, NetworkPolicy, SealedSecret, backup, monitoring overhead
- **Second write path** — vault changes now fan out to both Postgres and Qdrant; drift risk (mitigated by sharing Kafka trigger)
- **Schema migrations required when core fields change** — JSONB absorbs unknown fields but typed columns need ALTER TABLE
- **Read-only MCP tool surface area** — even with SQL whitelist, exposing arbitrary SELECT to an LLM is a new threat surface (mitigated by read-only user + statement timeout + auto-LIMIT)

### Neutral

- Qdrant remains unchanged. No plan to migrate embeddings to pgvector at current scale (62K at 2560d is comfortable for Qdrant; pgvector adds no capability we lack).
- FalkorDB remains unchanged. No overlap.

## Alternatives Considered

### A1 — Do nothing; continue with Qdrant + Grep + Read

**Rejected**. Does not address the structured-query gap. Current approach consumes 10-30K tokens per vault-question that a SQL query would answer in 1 row. With 1M Claude context this is a quality problem, not a cost problem — fuzzy search misses matching docs.

### A2 — Pure JSONB schema (no typed columns)

**Rejected**. Simpler to implement but loses column statistics for the query planner. Research (pganalyze, Crunchy, Mirakl 2025-2026) converges on hybrid schema as the 2026 standard. Typed columns for hot-path fields are free — it's not a tradeoff, it's strictly better.

### A3 — MongoDB for the index instead of Postgres

**Rejected**. Mongo was considered for "schemaless storage of frontmatter." Rejected because:
- Postgres JSONB covers the schemaless use case
- Postgres gives us relational joins (tags, links, jira refs) which are the whole point
- MongoDB's SSPL license is not OSI-approved — blocks eventual enterprise production path
- User's stack would add a new operational dependency for zero incremental capability

### A4 — Elasticsearch / OpenSearch for structured + full-text

**Rejected**. Already running ELK (elastic-system namespace) for log search. Considered reusing for vault. Rejected because:
- ES is a search engine, not a relational store; joins are awkward
- Would duplicate Qdrant's role for semantic search without replacing it
- Schema changes are tedious (index templates, reindexing)
- Opt-in posture: we want Postgres's relational model, not ES's search model

### A5 — Obsidian Dataview / Bases as the query layer (no Postgres)

**Rejected for Claude Code**. Bases (Obsidian 2025) and Dataview are excellent **inside Obsidian** but are plugin-level, not accessible via an MCP tool. Claude Code cannot query them. Bases is still useful as a *quality lever* — using it in Obsidian nudges user's frontmatter toward consistency, which benefits our Postgres index downstream.

### A6 — Add pgvector to an existing Postgres instance (matrix-postgres, prefect-postgres, etc.)

**Rejected**. Each existing Postgres is app-scoped (Synapse, Prefect, etc.). Co-tenancy risks operational coupling (pgvector extension install, schema namespace conflicts, backup independence). `research-postgres` was considered but is 2Gi and designed as SRE agent scratch-pad — scope mismatch. New dedicated `vault-postgres` is cleaner.

### A7 — Extend Qdrant payload instead of adding Postgres

**Rejected**. Qdrant payload supports filtering but not joins, aggregations, or full SQL. Every time we've pushed this boundary (VW-186, VW-194) it's been painful. The relational model belongs in a relational DB.

## Implementation

Refer to VW-213 Implementation Plan *(internal reference; not included)*. Five phases:

1. **Phase 1 (1 day)** — Deploy vault-postgres + schema + one-shot indexer + vault_query MCP tool
2. **Phase 2 (2 days)** — Kafka-triggered incremental indexer (KEDA ScaledJob)
3. **Phase 3 (2-3 days)** — Qdrant chunk reconciliation via blocks table
4. **Phase 4 (1 day)** — Structured Jira live-join
5. **Phase 5 (2 days, CONTINGENT)** — Valkey cache tier

Total: ~2 working weeks if all phases land. Phase 1 is the decision gate for Phase 2+.

## Validation

- Before Phase 2: qualitative check with Claude Code — does `vault_query` materially change how I answer vault questions?
- After Phase 3: regression test that Qdrant+Postgres hybrid search matches baseline Qdrant quality and latency within 20%
- After Phase 5: exact cache hit rate ≥ 20% over a 1-week window, else close plan as complete at Phases 1-4

## References

- Implementation Plan: 2026-04-19-VW-213-Vault-Structured-Index-Postgres-Plan *(internal reference; not included)*
- Related: [ADR-034-Data-Source-Connector-Architecture](/adrs/034-data-source-connectors/)
- Related: [ADR-035-Q2-2026-Enhancement-Program](/adrs/035-retrieval-evaluation-programme/)
- Incidents informing this decision: VW-186 (Qdrant source filter), VW-194 (freshness retrieval rewrite)
- External research: Notion Postgres block model, Supabase Vector, Logseq schema, Timescale pgvectorscale, Linux Foundation Valkey


## Record identity correction — 14 October 2026 (VW-447)

The canonical filename and ADR registry establish this record as ADR-036. Legacy metadata/headings have been aligned with that identity. This correction does not change the historical decision or assert current deployment. Run-Id: 01a13723-c94c-7cd0-9257-8d66c0784762.
