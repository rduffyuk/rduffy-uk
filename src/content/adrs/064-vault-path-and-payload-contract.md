---
id: 64
title: "Vault Path & Payload Contract"
status: accepted
recordedStatus: "Accepted"
date: 2026-06-10
tags: ["vault-indexing", "qdrant", "path-contract", "exclusion-list", "watermark"]
sourceKind: source-record
public: true
journeyId: "2026-06-10-adr-064-vault-path-payload-contract"
---
# ADR-064 — Vault Path & Payload Contract

## Status

Accepted — 2026-06-10. Implemented under VW-681 (theme 2 of the VW-673 whole-codebase audit remediation).

## Context

The vault indexing pipeline has **two path namespaces** that have repeatedly been confused (VW-504 was the first instance; the VW-673 audit found 20 recurrences — VW-681):

1. **Event namespace** — `file_watcher` emits Kafka `vault.file-events` with `file_path` relative to its `WATCH_PATH`, the **repo root**. A vault file arrives as `obsidian-vault/09-System/x.md`.
2. **Payload namespace** — `vault_indexer` writes Qdrant point payloads with `file_path` relative to the **vault root** (`09-System/x.md`) plus `source: "vault"` (VW-187 cross-source tag).

Every consumer that joins, filters, or dedups across these namespaces without normalizing breaks silently:

- `vault_delta_consumer._handle_delete` filtered Qdrant on the raw event path → deletes matched **zero points** while logging success. Deleted/renamed vault files (including deliberately removed sensitive content — VW-203 class) kept serving stale chunks.
- `vault_delta_consumer._already_in_qdrant` compared raw event path against vault-relative payloads → the VW-154 dedup skip was dead code; every event triggered a full re-embed.
- `ner_consumer` joined `VAULT_PATH / &lt;repo-root-relative path&gt;` → doubled segment → "file not found" → **all NER tagging a silent no-op**.
- `nightly_consistency_check.delete_files_from_qdrant` filtered on `source == &lt;rel_path&gt;`, but payloads set `source: "vault"` → orphan cleanup deleted nothing.

Three adjacent contract gaps amplify the drift:

- **Upsert without pre-delete**: deterministic `uuid5(f"{rel_path}#chunk{i}")` IDs overwrite chunks 0..N-1 but leave higher-index chunks from a previously longer version of the file orphaned — stale (possibly redacted) content keeps ranking.
- **Exclusion-list drift**: `shared_constants.EXCLUDE_DIRS` (VW-203 single-source) is hand-copied in `file_watcher` and `ner_consumer` (both missing `Private/`, `REDACTED_EMPLOYER/`, `Credentials/`, …), and `vault_indexer --exclude` **replaces** the safety list instead of extending it (VW-107 leak class).
- **Watermark-on-failure**: the nightly hash watermark advances for files that were never embedded (TEI down, per-file errors), so transient failures become permanent index gaps.

## Decision

The contract, binding on all current and future producers/consumers of vault file events and vault-derived Qdrant points:

1. **Event paths are repo-root-relative.** `vault.file-events` `file_path` stays relative to the file-watcher's `WATCH_PATH` (repo root). Unchanged for back-compat.
2. **Qdrant payloads key files on vault-relative `file_path`.** Payloads carry `file_path` = POSIX path relative to the vault root, and `source` = origin tag (`"vault"`, or the connector name). `source` is a *category*, never a path.
3. **Normalize at every consumption point.** Any consumer joining an event path onto a vault base, checking file existence, or building a Qdrant filter MUST first pass the event path through `resolve_vault_relpath()` (`neural-vault/vault_path_resolver.py`). Delete, dedup, and upsert filters key on `file_path` with the vault-relative value.
4. **Upsert pre-deletes the file's points.** Before (re)indexing a file, delete all existing points where `file_path` matches — removes orphaned higher-index chunks from shrunk files. Applies to `vault_indexer`, the nightly TEI path, and `rootweaver-connectors` (keyed per `source` + document ID there).
5. **The exclusion list is single-source and extend-only.** `shared_constants.EXCLUDE_DIRS` is the only authority. CLI `--exclude` EXTENDS it, never replaces. Components that cannot import it (slim containers) carry a copy guarded by a drift test asserting superset-of-shared. The archive carve-out (`vault_exclusions.is_archive_indexable_path`) MUST be applied symmetrically wherever exclusion decides both *indexing* and *deletion/orphan* sets — an asymmetric carve-out turns the orphan sweep into a wipe of the archive lanes.
6. **Watermarks advance only on confirmed success.** Hash/processed-file watermarks (nightly, postgres indexer) record a file only after its embed + upsert succeeded. Failed files stay un-watermarked and retry next run.
7. **Moves are delete + create.** `on_moved` emits a `delete` event for `src_path` and indexes `dest_path` — no stale points under the old path.

## Consequences

**Positive**
- Deletes actually delete: removing sensitive content from the vault removes it from retrieval (closes the VW-203 recurrence path).
- VW-154 dedup works again → less redundant TEI load (relevant to the vault-delta-indexer throughput SLO).
- Shrunk/renamed files no longer serve stale chunks; nightly orphan sweep operates on real keys.
- Transient TEI failures self-heal instead of becoming permanent index gaps.

**Negative / accepted risk**
- Pre-delete adds one Qdrant delete call per file index (~ms; batched per file, not per chunk).
- Strict watermarks re-attempt failed files each run until they succeed — intended, but raises nightly volume after an outage.
- The first nightly run after the `source`→`file_path` delete-key fix will sweep genuinely orphaned points accumulated while deletes were no-ops; the symmetric archive carve-out (point 5) must land in the same change to avoid wiping archive lanes.

## Enforcement

- `resolve_vault_relpath` stays stdlib-only with unit tests; consumer call-sites covered by importable-seam tests where feasible (neural-vault is runtime-only otherwise).
- Drift test asserting any local EXCLUDE_DIRS copy ⊇ `shared_constants.EXCLUDE_DIRS`.
- Audit trail: per-finding status in the VW-673 master report; implementation report under `02-Active-Work/Implementation-Reports/2026-Q2/`.
