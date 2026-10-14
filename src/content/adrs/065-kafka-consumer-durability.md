---
id: 65
title: "Kafka Consumer & Producer Durability Contract"
status: accepted
recordedStatus: "Accepted"
date: 2026-06-10
tags: ["kafka", "durability", "dlq", "offset-commit", "delivery-callback"]
sourceKind: source-record
public: true
journeyId: "2026-06-10-adr-065-kafka-consumer-and-producer-durability-contract"
---
# ADR-065 — Kafka Consumer & Producer Durability Contract

## Status

Accepted — 2026-06-10. Implemented under VW-680 (theme 3 of the VW-673 audit remediation).

## Context

The VW-673 audit confirmed 15 findings (8 high) sharing two root causes that silently lose events while offsets and watermarks advance:

1. **Commit-on-failure.** Consumers commit offsets when processing fails, treating *transient* infrastructure failures (vLLM down, Postgres outage, Haiku 429, filesystem error) as if they were poison messages. The VW-62 invariant — *commit only after confirmed write* — was honored in some loops and inverted in others (`arch_review/kafka_base` commits on ANY exception "to avoid infinite retry"; the postgres delta indexer commits even when `success=False`).
2. **Fire-and-forget produce.** `producer.produce()` without a delivery callback, with `flush()` return ignored. **`flush()` returning 0 only means the local queue drained — a message whose broker delivery *failed* also leaves the queue.** Without a callback, broker-side failures are invisible; callers then advance checkpoints (`OnyxBridge.checkpoint_sync` → Postgres watermark) or commit input offsets (ner-consumer) for events that never reached the topic.

Two amplifying patterns:

- **Parameterless `consumer.commit()` defeats "leaving offset uncommitted".** A bare `commit()` commits the *current position of every assigned partition* — so deliberately skipping the commit for a failed message is undone by the next successful message's bare commit (sre rollup-writer, elk-sink).
- **DLQ retry identity is unstable.** The capabilities DLQ retry consumer keys its retry count on the `DeadLetterEvent`'s own `event_id`, but each failed reprocessing mints a NEW DLQ event with a fresh uuid — `max_retries` is never reached.

## Decision

Binding on every Kafka producer/consumer in the platform (confluent-kafka sync and aiokafka async):

1. **Commit after confirmed effect only.** An offset is committed only when the message's effect is durably confirmed: the downstream write succeeded, the output produce was broker-acked, or the message was classified poison.
2. **Classify failures: poison vs transient.**
   - *Poison* (malformed JSON, schema/validation failure — deterministic, will never succeed): log + count + `commit_message` + skip.
   - *Transient* (network, broker, LLM/embedder/DB unavailability — retryable): do NOT commit. For the KEDA short-lived consumers, **halt the loop** (exit the job) so the offset stays put and the next spawn redelivers; never `continue` past an uncommitted failure (see rule 3).
3. **Commit by message, never by position.** `consumer.commit(message=msg)` (the `rootweaver_pipeline.kafka_reliability.commit_message` helper) is the only allowed form in processing loops. Bare `consumer.commit()` is banned — it silently re-commits offsets that were deliberately left uncommitted.
4. **Every produce registers a delivery callback.** Broker delivery is confirmed via `safe_produce()` (single message) or `DeliveryTracker` (batch: per-message callback + end-of-batch `confirm()` that flushes AND checks collected delivery errors). `flush() == 0` is necessary but NOT sufficient for delivery.
5. **Checkpoints/watermarks advance only over confirmed deliveries.** If any delivery in a sync failed, the watermark does not advance (`OnyxBridge.checkpoint_sync` returns `max_updated=None`; the overlap-window dedup from VW-552 makes the re-sync cheap).
6. **DLQ routing must itself be confirmed.** Committing the input offset after routing to a DLQ is allowed only when the DLQ produce was broker-acked; otherwise the input stays uncommitted.
7. **DLQ retry identity is the ORIGINAL event.** Retry counts key on stable identity (envelope-carried `retry_count` plus a content hash of `original_topic` + `original_event`), never on the DLQ wrapper's own id.
8. **No unobserved async tasks.** `asyncio.create_task` for fire-and-forget publishing must hold a strong reference (module-level set + `add_done_callback` discard) and surface exceptions in the done callback — GC may otherwise drop the task mid-flight.

### The helpers (single source: `rootweaver_pipeline.kafka_reliability`)

- `DeliveryTracker` — per-batch delivery-report collector; `confirm(producer, timeout)` flushes and returns True iff every tracked message was acked.
- `safe_produce(producer, topic, value, key=..., timeout=...)` — produce one message, confirm synchronously.
- `commit_message(consumer, msg)` — commit exactly this message's offset.

Distribution: workspace packages depend on `rootweaver-pipeline` (pyproject + the VW-366 Dockerfile COPY/install pairs). neural-vault consumers import it via the scout-fleet pattern — the image COPYs `packages/rootweaver-pipeline/src/rootweaver_pipeline` directly (stdlib + confluent-kafka + prometheus-client only).

## Consequences

**Positive**: transient outages stop deleting data — events redeliver instead of vanishing; broker-side produce failures become visible and block the checkpoint; DLQ retry limits actually bound retries; "0 events lost" becomes assertable from delivery reports.

**Negative / accepted**: halting a KEDA job on transient failure trades throughput for durability (redelivery on next spawn, possible duplicate effects — all these consumers are idempotent upserts or dedup-guarded); a genuinely poisonous message misclassified as transient can wedge a partition until fixed (mitigation: the classification is at the *parse/validate* boundary, which is deterministic); per-produce confirmation adds latency on hot paths (bounded by existing flush timeouts already present at every site).

## Enforcement

- Unit tests on the helpers + per-site regression tests (fake producers/consumers recording commit/produce order).
- Source-contract test banning parameterless `consumer.commit()` in processing loops across neural-vault + packages.
- Audit trail: per-finding status in the VW-673 master report; impl report in `02-Active-Work/Implementation-Reports/2026-Q2/`.
