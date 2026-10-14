---
id: 58
title: "Rootweaver Deployment Contracts for Baked Images and TEI-Safe Embedding"
status: accepted
recordedStatus: "Accepted"
date: 2026-06-04
tags: ["rootweaver", "gitops", "k3s", "embeddings", "deployment-contract"]
sourceKind: source-record
public: true
journeyId: "2026-06-04-adr-058-rootweaver-deployment-contracts-for-baked-images-and-tei-safe-embedding"
---
# ADR-058: Rootweaver Deployment Contracts for Baked Images and TEI-Safe Embedding

## Status

**Accepted** — 2026-06-04

## Context

VW-552 stabilized the Rootweaver platform after several operational risks converged:

- TEI embedding on `rduffy-mini` is viable for steady-state indexing, but it is CPU-bound and sensitive to oversized batches and excess client concurrency.
- Some GitOps workloads still used `ghcr.io/rduffyuk/rag-gateway:v13-qwen3-cpu` as a broad utility image for old vault/index/review scripts.
- `rag-gateway` and `rag-retriever` still mounted stale local service source paths even though they now run from baked package images.
- Some custom production images used mutable `:latest` tags or images that were not clearly rebuildable from the repo.
- The Desktop GPU is operationally owned by vLLM; TEI steady-state ownership belongs to the Mini, with GPU embedding burst only as a break-glass path covered by ADR-054.

The implementation report for VW-552 records the rollout details. This ADR records the durable operating contract future work must obey.

## Decision

Rootweaver production workloads must follow these deployment contracts:

1. **Embedding clients must be TEI-safe by default.**
   - Client batch size must never exceed `16`.
   - Default request concurrency must be conservative unless load-tested against the Mini TEI lane.
   - Connector/indexer retry behavior must prevent TEI slowness from causing Kafka `max.poll.interval.ms` failure loops where practical.

2. **Service code must come from baked images.**
   - Long-running services such as `rag-gateway`, `rag-retriever`, `mcp-bridge`, indexers, and operators must not mount live service source code through `hostPath`.
   - `hostPath` remains acceptable for data volumes, such as the vault, durable state, or explicitly data-dependent batch jobs.

3. **Legacy broad utility images must be retired from production GitOps.**
   - `ghcr.io/rduffyuk/rag-gateway:v13-qwen3-cpu` is not an acceptable runtime base for active Rootweaver production jobs.
   - Old script-dependent workloads must move to purpose-built images or a clearly named transitional image such as `neural-vault-ops`.
   - Transitional images are acceptable only while boundaries are being discovered; they should not become the default image strategy.

4. **Custom production images must use immutable tags.**
   - Rootweaver-owned production images should use Jira/work-item or release-version tags, not `:latest`.
   - Exceptions must be explicit and documented in the manifest or implementation report.
   - Images referenced by GitOps must be rebuildable from the repository or intentionally external.

5. **Architecture-specific image builds must happen on the correct builder.**
   - K3s nodes are `amd64`; images deployed to the cluster must be built for `linux/amd64`.
   - The Mac can be used for editing and validation, but Desktop-native builds are the default for local Harbor pushes unless a multi-arch builder is intentionally used.

6. **GPU ownership remains with vLLM.**
   - Ollama stays disabled/inactive for GPU ownership purposes.
   - TEI steady-state remains on `rduffy-mini` per ADR-054.
   - GPU embedding bursts require an intentional operational action and must not silently preempt vLLM.

## Consequences

Positive:

- Reduces deployment drift between GitOps manifests and actual runtime images.
- Removes stale source-code mount assumptions from services that already have baked packages.
- Makes TEI overload less likely to cascade into connector-indexer timeout loops and DLQ growth.
- Keeps the Desktop GPU allocation legible: vLLM owns it unless an operator intentionally runs a burst.
- Makes custom production images easier to audit, rebuild, and roll back.

Negative / trade-offs:

- More images may need to be maintained during the migration away from broad utility images.
- Some old jobs may remain on a transitional `neural-vault-ops` image until runtime boundaries are clearer.
- Immutable tags add a small amount of release/tagging overhead.
- CPU TEI limits protect stability but do not solve Mini throughput limits; capacity decisions remain separate.

## Alternatives Considered

- **Keep using `rag-gateway:v13-qwen3-cpu` as a catch-all image.** Rejected because it hides runtime boundaries, carries unnecessary weight, and makes rebuild provenance unclear.
- **Keep live service source mounts for convenience.** Rejected for long-running services because baked images already exist and source mounts create stale-path and filesystem-coupling failures.
- **Move TEI back to GPU by default.** Rejected because it violates ADR-054's resource split and would reintroduce vLLM/embedding contention.
- **Use `:latest` for local velocity.** Rejected for production GitOps because it weakens auditability and rollback. Local development tags remain acceptable outside production manifests.

## References

- Related Jira: VW-552
- Related ADRs: ADR-030, ADR-054
- Implementation report: `02-Active-Work/Implementation-Reports/2026-Q2/2026-06-04-VW-552-rootweaver-platform-stabilization-rollout.md`
