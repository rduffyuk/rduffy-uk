---
id: 82
title: "Vault Ingest Lanes and Lane-Aware Retrieval"
status: accepted
recordedStatus: "Accepted"
date: 2026-06-18
tags: ["vault-indexing", "kafka", "embedding", "retrieval", "freshness", "lane-routing", "gpu-burst", "mini-tei"]
sourceKind: source-record
public: true
journeyId: "2026-06-18-adr-082-vault-ingest-lanes-and-lane-aware-retrieval"
---
# ADR-082 — Vault Ingest Lanes and Lane-Aware Retrieval

## Status

Accepted — 2026-06-18. Implementation remains staged behind VW-885 follow-up
work; this ADR defines the target architecture and operating contract.

## Context

VW-885 exposed a recurring problem in the vault embedding pipeline: queue lag was
visible as Mini TEI timeouts, but the input stream was not a clean representation
of high-value vault work. The hot embedding path mixed canonical knowledge,
generated/raw notes, repo/runtime noise, and duplicate vault events.

The investigation found two producers writing to the same `vault.file-events`
stream:

- `vault-indexer` watches `REDACTED_WORKSPACE/rootweaver-platform/obsidian-vault`, which is
  the intended vault-only producer.
- `file-watcher` watches `REDACTED_WORKSPACE/rootweaver-platform`, the repo root, and also
  publishes to `vault.file-events`.

That means files such as repo packages, tests, GitOps manifests, Python
environment files, and neural-vault runtime JSON can enter the same stream as
ADRs, incidents, handovers, and implementation reports. The repo-root watcher
also duplicates vault events using a different path prefix.

Recent observed volume reinforced the split:

| Source class | Observed signal | Decision implication |
|---|---:|---|
| Canonical vault docs | ADRs, HLDs/LLDs, incidents, implementation reports, active plans | Index hot and keep highly trusted |
| Generated/raw vault docs | AI research raw drops, local LLM/SRE generated notes, streaming journal material | Review, rate, and promote before default hot ranking |
| Repo/runtime noise | `.venv`, `packages`, `tests`, `rootweaver-gitops`, dedup/cache JSON | Do not feed the vault embedding consumer |

This is separate from the VW-883 poison-pill fix. A poison pill is a
deterministically malformed or unparseable item that will not succeed on retry.
Skipping it means logging/metricing it and committing that Kafka offset so one
bad file cannot pin a partition forever. It is not a blanket skip for empty
files, low-value files, or transient Mini/GPU/TEI failures. Transient failures
must still halt without commit per ADR-065 so they redeliver.

## Decision

Introduce explicit ingest lanes before embedding and make retrieval scoring
lane-aware.

### VW-893 contract freeze — 2026-07-12

The ingest payload contract is closed as follows:

| Field | Allowed values | Meaning |
|---|---|---|
| `ingest_lane` | `no_index`, `generated`, `canonical` | Mechanical classification before embedding. |
| `review_status` | `excluded`, `unreviewed`, `trusted` | Mutable human or automation review state. |
| `lane_trust` | `excluded`, `unreviewed`, `trusted` | Mechanical, lane-derived retrieval input at ingest time. |
| `lane_decay` | `none`, `strong_until_reviewed`, `lifecycle` | Retrieval decay policy selected by the lane. |

`lane_trust` and `review_status` intentionally share a value domain but are not
duplicates: `lane_trust` is immutable mechanical classification; `review_status`
starts from that default and is the later mutation point for review. Do not
collapse the fields. The older `useful`, `promoted`, and `rejected` examples in
this ADR are superseded by this contract.

### Lane 1: Canonical hot lane

Canonical vault material is the trusted, always-on lane. It is the Mini TEI
steady-state workload.

Included by default:

- `09-System/Architecture/**`, including ADRs, HLDs, LLDs, and indexes.
- `09-System/Incidents/**`.
- Implementation reports, handovers, runbooks, and active plans.
- Curated completed archive documents that are still canonical project record.

Important: `06-Archive` must not be treated as a blanket no-index directory.
Finished plans and reports can move to archive and remain authoritative. Archive
indexability must be decided by lifecycle metadata and path policy, not by a
single top-level exclusion.

### Lane 2: Generated/raw review lane

Generated and raw material is useful, but it should not compete with canonical
documents at equal trust before review.

Examples:

- `04-Resources/AI-ML-Research/Raw/**`.
- Local LLM generated SRE investigations and summaries.
- Radar raw drops and machine-generated notes.
- `01-Journal/Streaming/**` when it is transcript-like or intermediate.

This lane is indexed slowly or separately, with metadata:

- `lane: generated`
- `review_status: unreviewed | useful | promoted | rejected`
- `generated_by`, when known
- `source_run_id`, when known
- `quality_rating`, when reviewed

Only `promoted` or explicitly useful generated material should appear in default
retrieval with strong weight. Unreviewed generated content may remain searchable
when the query asks for raw/generated material or when an operator enables that
scope.

### Lane 3: No-index / repo-event lane

Repo and runtime noise must not be consumed by the vault embedding queue.

Drop from vault embedding, or route to a separate `repo.file-events` topic:

- `.venv/**`
- `packages/**`
- `tests/**`
- `rootweaver-gitops/**`
- `neural-vault/*dedup*.json`
- `neural-vault/automation/ner_entity_cache.json`
- transient caches, lock files, build output, and generated runtime state

If code intelligence needs repo events, it should own its own topic and
consumers. It must not backpressure vault knowledge retrieval.

## Topic and Consumer Model

Target model:

```text
                           +-----------------------------+
                           | obsidian-vault file changes |
                           +--------------+--------------+
                                          |
                                          v
                                  +-------+-------+
                                  | vault-indexer |
                                  +-------+-------+
                                          |
                                          v
                                  +-------+-------+
                                  | lane router   |
                                  +---+-------+---+
                                      |       |
                    canonical         |       | generated/raw
                                      |       |
                                      v       v
                         +------------+       +----------------+
                         | vault.canonical   | vault.generated |
                         | events            | events          |
                         +-----+-------------+--------+-------+
                               |                      |
                               v                      v
                         +-----+-----+        +-------+--------+
                         | Mini TEI  |        | slow/reviewed  |
                         | consumer |        | consumer       |
                         +-----+-----+        +-------+--------+
                               |                      |
                               v                      v
                         +-----+----------------------+-----+
                         | Qdrant payloads include lane,   |
                         | review_status, lifecycle, dates |
                         +---------------------------------+

        +------------------------------+
        | repo-root file-watcher       |
        +---------------+--------------+
                        |
                        v
        +---------------+------------------------------+
        | repo.file-events or drop; never vault hot    |
        +----------------------------------------------+
```

Physical topic split is the target because it gives independent lag, KEDA, and
backpressure controls. A transitional implementation may keep one topic with a
required `lane` field, but classification must still happen before embedding.

## Retrieval and Decay Policy

Decay belongs primarily at retrieval time; ingest provides the metadata needed to
score correctly.

Ingest responsibilities:

- classify lane
- persist `lane`, `review_status`, `lifecycle`, `created_at`, `modified_at`,
  `indexed_at`, and source/provenance metadata
- reject or divert no-index material before embedding

Retrieval responsibilities:

- apply recency/freshness for queries that ask for current or recent material
- apply lane trust weights
- apply lifecycle demotion for superseded/deprecated documents
- avoid automatic decay of canonical historical records

The scoring rule is policy-driven, not hard-coded as a single global recency
boost:

```text
final_score =
  semantic_relevance
  + lane_trust_weight
  + lifecycle_weight
  + query_intent_temporal_weight
  - generated_raw_staleness_penalty
```

Canonical documents do not decay merely because they are old. They are demoted
only when lifecycle metadata says they are superseded, deprecated, or not
applicable. Generated/raw documents decay strongly until reviewed or promoted.
Runtime snapshots should either be excluded from the vault index or given short
TTL/low weight in a separate store.

Existing temporal and freshness code remains the foundation: `rag-gateway`,
`rag-retriever`, `rootweaver-agents`, and `rootweaver-innovations` already carry
pieces of temporal filtering, freshness intent, and freshness scoring. This ADR
requires those pieces to converge behind lane-aware policy rather than adding a
second unrelated decay system.

## Operating Model

The Mini lane is the normal workhorse. It does not need sub-second indexing for
every file; it needs to clear the canonical daily workload within the working
day or by the next morning under normal use.

GPU embedding is a shared resource and must be treated as a burst lane, not the
default steady-state path. A GPU burst is appropriate when canonical lag breaches
a measured threshold or when an operator explicitly needs a time-bound drain.

Embedding batch size and `MAX_BATCH_TOKENS` are implementation tuning knobs, not
vector database schema. Vector dimensionality is fixed by the embedding model.
Batch/token budgets should be benchmarked against Mini TEI using a replay corpus
from the canonical lane, then configured to the largest stable value with
headroom. The generated/raw lane must not be used to size the Mini steady-state
contract.

## Migration Plan

1. Stop the repo-root `file-watcher` from publishing to `vault.file-events`.
2. Keep `vault-indexer` as the only producer for hot vault file events.
3. Add a shared lane-routing policy for canonical, generated/raw, and no-index
   paths.
4. Add lane metadata to events and Qdrant payloads.
5. Split physical topics to `vault.canonical-events`, `vault.generated-events`,
   and `repo.file-events`, or prove that a single-topic transition with lane
   metadata is sufficient for the first release.
6. Add review/promotion metadata for generated/raw material.
7. Wire lane-aware freshness and lifecycle scoring into retrieval.
8. Benchmark Mini TEI against canonical lane replay and set batch/token/concurrency
   values from the benchmark.
9. Replace manual GPU selector edits with a thresholded burst controller.

## Acceptance Criteria

- Repo-root file events no longer feed the vault embedding consumer.
- Non-vault runtime files never reach the vault hot embedding queue.
- Canonical archived documents remain retrievable when lifecycle metadata says
  they are still authoritative.
- Generated/raw documents are searchable with explicit scope but do not receive
  equal default trust until reviewed or promoted.
- Mini TEI can clear the measured canonical daily workload without requiring
  GPU as the default path.
- GPU burst activation is thresholded, observable, reversible, and GitOps-owned.
- Poison-pill skips still commit deterministic bad content, while transient
  embedder/Qdrant/Kafka failures still halt without commit.
- Unit or integration tests cover lane routing, duplicate path normalization,
  archive carve-outs, generated/raw demotion, and transient-vs-poison commit
  behavior.

## Consequences

Positive:

- The hot queue becomes a trusted vault knowledge stream instead of a mixed
  filesystem event stream.
- Mini TEI capacity can be measured against the workload it is meant to handle.
- Generated content can still be useful without silently polluting canonical
  retrieval.
- GPU use becomes an explicit burst decision with clear rollback.

Negative / accepted:

- Path policy becomes more precise and needs tests; broad directory exclusions
  are no longer sufficient.
- There is migration work across producers, consumers, payload metadata, and
  retrieval scoring.
- Some generated/raw material will be less visible until reviewed, by design.

## References

- VW-885 — vault-delta-indexer lag recurrence and Mini/GPU drain incident.
- ADR-064 — Vault Path & Payload Contract.
- ADR-065 — Kafka Consumer & Producer Durability Contract.
- Incident report: `09-System/Incidents/2026-06-18-VW-885-vault-delta-gpu-drain.md`.
