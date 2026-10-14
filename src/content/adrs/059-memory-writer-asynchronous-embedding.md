---
id: 59
title: "Memory-Writer Asynchronous Embedding (Decouple from Hot Path)"
status: accepted
recordedStatus: "Accepted"
date: 2026-06-04
tags: ["memory", "embedding", "async", "kafka", "cronjob", "cpu-embedding"]
sourceKind: source-record
public: true
journeyId: "2026-06-04-adr-059-memory-writer-asynchronous-embedding-decouple-from-hot-path"
---
# ADR-059: Memory-Writer Asynchronous Embedding (Decouple from Hot Path)

## Status

**Accepted** — 2026-06-04

This ADR resolves the VW-394 decision that ADR-046 explicitly deferred. ADR-046 (`decision_blocks: VW-394`) documented that memory-writer embedding strategy was an open question after the vllm-embedding backfill session. This ADR closes that open question by choosing async decoupling over synchronous inline embedding.

## Context

### The broken state (VW-551 root cause)

VW-486 moved the platform's steady-state embedding workload from the GPU vllm-embedding-service to the always-on `rduffy-mini` TEI node (`tei-embedding.rootweaver.svc:8090`, Qwen3-Embedding-4B, 2560d). However, `memory-writer` was never repointed — it continued calling `vllm-embedding-service.vllm:8001`, which is scaled to 0/0 with no autoscaler (Flux `ssa-ignore: spec.replicas`, manually parked).

Every embed attempt RST'd immediately. The consequence was silent: memory-writer persisted facts to `memory.facts` with `embedding = NULL`. Over time, 59% of facts accumulated NULL embeddings (3,977 out of 6,725 rows verified live). This directly caused the L1 typed-memory vector recall degradation observed in VW-532 (control group: 14% recall quality).

### Why a simple synchronous repoint was insufficient

The obvious fix — repoint memory-writer at the mini TEI with a raised timeout — was live-tested and rejected. The `rduffy-mini` TEI is a single CPU embedder running on an Intel N150 (3.4 effective cores). It is the **shared** embedding endpoint for:

- `connector-indexer` (radar firehose: high-volume batch)
- `vault-delta-indexer` (periodic vault delta batches)
- `memory-writer` (near-real-time Kafka consumer)

Under contention, observed `queue_time` alone exceeded 300 seconds per embed. A live test of the synchronous path ReadTimeout'd at the 300s client limit. Blocking the memory-writer consumer for up to 300 seconds per fact is a consumer-lag risk: Kafka offsets are committed only after successful processing, so a blocked writer stalls the entire memory-facts consumer group.

### Operating constraints

- The mini TEI is the correct steady-state embedder (ADR-054) — GPU burst is a break-glass path only
- The Desktop GPU is operationally owned by vLLM serving (ADR-058) — reviving vllm-embedding-service would contend with vLLM and undo VW-486's GPU-freeing benefit
- A dedicated TEI instance for memory-writer alone is viable future work but not necessary given the async sip pattern's adequacy at current corpus size

## Decision

Decouple embedding from the memory-writer hot path via two coordinated components:

### Part 1 — memory-writer: fast persist, no embed (`WRITER_SYNC_EMBED=false`)

The `memory-writer` service (image `vw-551-2`) introduces a `WRITER_SYNC_EMBED` environment variable (default `false`). When false:

- The writer builds no `EmbeddingClient`
- Facts are persisted to `memory.facts` immediately with `embedding = NULL`
- The Kafka offset is committed promptly; consumer lag is bounded by DB write latency only
- No TEI call, no timeout risk, no contention

`WRITER_SYNC_EMBED=true` restores the previous synchronous path (break-glass, not for production use while the mini is the sole embedder).

### Part 2 — memory-embed-backfill CronJob: async fill (VW-431)

A new `memory-embed-backfill` CronJob runs every 3 hours via `operator-tools`, invoked as `python -m operator_tools.embed_backfill`. It:

- Selects a bounded batch of NULL-embedding rows (`BACKFILL_MAX_ROWS=20` per run, configurable)
- Embeds each row via the mini TEI, one at a time (no burst, sips the shared endpoint)
- Commits per-row to Postgres immediately (`CAST(:v AS vector)` write)
- Uses a PostgreSQL advisory lock to prevent concurrent backfill runs
- Applies a circuit-breaker: consecutive TEI failures abort the batch to avoid hammering a degraded node
- The `EmbeddingClient` timeout and model name are env-configurable (`EMBED_TIMEOUT` default 300s; `EMBED_MODEL` default `Qwen/Qwen3-Embedding-4B` — the mini TEI rejects the short-form ID)

At ~100–300 seconds per embed on the mini under contention, the backfill drains the existing 3,977 NULL rows over multiple 3-hour windows without creating a spike of load.

### Summary

| Concern | Solution |
|---|---|
| Consumer lag | Sync embed removed from hot path; facts persist in <1ms |
| NULL embeddings accumulate | Backfill CronJob drains NULLs every 3h |
| TEI contention | Backfill is single-threaded, 20-row-bounded per run |
| Concurrent backfill runs | Advisory lock on CronJob |
| TEI node degraded | Circuit-breaker aborts batch; next run retries |

## Consequences

**Positive:**
- memory-writer consumer lag is no longer coupled to TEI availability or queue depth
- Embedding fills gradually with no spike; mini TEI load is bounded and predictable
- The 3,977 existing NULL rows drain automatically without manual intervention
- L1 vector recall (the root cause of VW-532) will recover as the backfill completes

**Negative / trade-offs:**
- A newly written fact is not immediately embeddable by vector search — there is a lag of up to 3 hours before a fresh fact gains a vector embedding
- This lag is acceptable for the memory system's use case: typed-memory L1 recall is retrospective, not real-time; the trgm text-search path in `recall_decisions` / `find_problems` remains available immediately after write
- If `WRITER_SYNC_EMBED=true` is needed (e.g., a dedicated low-contention TEI is provisioned for memory-writer in future), the sync path remains available via env var toggle

## Alternatives Considered

### A — Synchronous repoint to mini TEI with raised timeout

Repoint `memory-writer` at `tei-embedding.rootweaver.svc:8090`, raise `EMBED_TIMEOUT` to 600s.

**Rejected**: Live-tested — ReadTimeout at 300s under contention. Even with a higher timeout, blocking a Kafka consumer goroutine for 300+ seconds per message is a consumer-lag risk. Contention is structural (three workloads share one CPU embedder); raising the timeout does not reduce it.

### B — GPU vllm-embedding-service revival (VW-394 original path / VW-233)

Scale vllm-embedding-service back to 1 replica, have memory-writer call it.

**Rejected**: Contends with vLLM inference on the Desktop GPU; directly undoes VW-486's GPU-freeing benefit. ADR-054 and ADR-058 establish the mini as the steady-state embedder and the GPU as vLLM's exclusive resource.

### C — Dedicated TEI instance for memory-writer

Provision a second TEI deployment (mini or K3s) exclusively for memory-writer.

**Not built**: Viable future option if the async lag ever becomes a product requirement. The async sip pattern is sufficient at current corpus size and write rate. Noted here for future reference; tracked implicitly under VW-394.

## References

- VW-551 *(internal reference; destination redacted)* — Bug: memory-writer pointing at parked vllm-embedding → NULL embeddings
- VW-431 *(internal reference; destination redacted)* — Improvement: memory-embed-backfill CronJob
- VW-394 *(internal reference; destination redacted)* — Deferred embedding strategy (now resolved by this ADR)
- VW-486 *(internal reference; destination redacted)* — Moved platform embedding to mini TEI
- VW-532 *(internal reference; destination redacted)* — L1 degraded recall evidence (14% control)
- [ADR-046-Memory-System-Embedder-Architecture](/adrs/046-memory-system-embedder-architecture/) — Architecture decision that deferred VW-394; `decision_blocks: VW-394`
- [ADR-054-Dedicated-CPU-Embedding-Worker-Node](/adrs/054-dedicated-cpu-embedding/) — Mini node as steady-state embedder
- [ADR-058-Rootweaver-Deployment-Contracts-for-Baked-Images-and-TEI-Safe-Embedding](/adrs/058-rootweaver-deployment-contracts-for-baked-images-and-tei-safe-embedding/) — TEI safe-embedding contracts (does NOT cover memory-writer; this ADR fills that gap)
- Platform MR !70 — code changes (commits b8071a84→eb25454e on `main`)
- GitOps commits cf955db→9befd8a
