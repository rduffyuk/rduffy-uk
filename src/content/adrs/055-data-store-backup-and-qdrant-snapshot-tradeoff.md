---
id: 55
title: "Data-Store Backup Strategy & the Qdrant Snapshot-Disruption Tradeoff"
status: accepted
recordedStatus: "Accepted"
date: 2026-05-31
tags: ["architecture", "backups", "disaster-recovery", "qdrant", "falkordb", "observability", "sre"]
sourceKind: source-record
public: true
journeyId: "2026-05-31-adr-055-data-store-backup-strategy-the-qdrant-snapshot-disruption-tradeoff"
---
# ADR-055: Data-Store Backup Strategy & the Qdrant Snapshot-Disruption Tradeoff

**Status:** Accepted · **Date:** 2026-05-31 · **Parent:** VW-494

## Context

The two stateful data stores — **qdrant** (vector DB, ~34K points / 148K chunks)
and **falkordb** (knowledge graph) — had **no working backup**. The qdrant backup
CronJob had *never* succeeded since 2026-03-15; falkordb's had been dead ~7 days.
Surfaced by the VW-489 pipeline fire-watcher.

Root-causing the qdrant failure (VW-494) revealed a property of qdrant that
constrains any backup design: **creating a snapshot blocks qdrant's connection
*acceptor* for minutes.** During a create, qdrant refuses *new* TCP connections on
its own pod IP (verified pod-direct, bypassing the Service). Keep-alive/pooled
clients (rag-retriever) ride through it on existing sockets; fresh-connection
clients (one conn per request) get `connection refused`. It is **not** a crash, OOM,
disk I/O limit, or readiness-probe flap. VW-505 upgraded qdrant 1.17.0 → 1.18.1
*specifically to test whether this was a version bug* — it is **not**: the block is
unchanged on 1.18.1 (40/40 probes still refused). It is inherent to qdrant's
snapshot-create through at least 1.18.1 and is **not fixable by probe tuning**.

## Decision

1. **Back up via the native snapshot APIs to a node-local hostPath**
   (`REDACTED_WORKSPACE/backups/{qdrant,falkordb}`), checksum-verified.
2. **Split qdrant's backup into two CronJobs** — `qdrant-snapshot-create` (02:00)
   and `qdrant-snapshot-download` (02:15, fresh pod). This is forced by the acceptor
   block: a pod that issued a create, or transferred the 547 MB snapshot, cannot
   reopen a connection to qdrant for the rest of its life. So create and the large
   download must be in **separate pods**, and the download must be the **last** qdrant
   op in its pod (hence prune-before-download). Snapshots write to the PVC
   (`QDRANT__STORAGE__SNAPSHOTS_PATH`), download verifies sha256, then retention.
3. **Accept the nightly disruption.** The 02:00 snapshot-create briefly makes qdrant
   unavailable *to new connections* (~minutes). We accept this rather than pursue HA
   or CSI snapshots (see Alternatives). 02:00 UK is the low-traffic window and
   connection-pooling clients are unaffected.

## Consequences

- ✅ First working, checksum-verified backups of both data stores.
- ⚠️ **Nightly ~3-min window where qdrant refuses new connections.** Pooled clients
  ride through; callers opening a *new* connection during the window fail. Tracked,
  accepted (VW-498 P1).
- ⚠️ **Backups are node-local hostPath — they die with the disk.** No offsite/restic
  sync yet. This is the largest residual DR gap.
- ✅ Same backup-CronJob class (label + egress NetworkPolicy + create/download split)
  is the template for any future store.

## Alternatives considered

- **qdrant HA / multi-replica** — one replica serves while another snapshots,
  eliminating the disruption. *Rejected for now:* single-node homelab; qdrant
  distributed mode is significant operational complexity for a low-traffic window.
- **CSI VolumeSnapshot of the qdrant PVC** instead of the snapshot API — avoids the
  acceptor block entirely. *Deferred:* depends on the K3s storage class supporting
  VolumeSnapshots; worth revisiting if the nightly blip ever matters.
- **Readiness-probe tuning** to keep qdrant in the Service during snapshots.
  *Rejected:* proven not to work — qdrant refuses on its own pod IP, so keeping it in
  the Service just hands clients refused connections instead of kube-proxy doing it.
- **Filesystem copy of `/qdrant/storage` while running** — *rejected:* not
  crash-consistent for a live DB; the snapshot API is the correct mechanism.

## Related decision — ephemeral-pipeline observability via Pushgateway (VW-489 Phase 2)

CronJob pipelines are ephemeral, so pull-scrape misses them. **Decision:** such jobs
push per-run metrics (gauges, not counters — each push replaces the gateway values, so
the metric = last run's count, which an "output == 0 over 48h" alert needs) to a
**Prometheus Pushgateway** at completion (best-effort, never fails the job); Prometheus
scrapes the gateway with `honor_labels: true`. The gateway is locked by an ingress
NetworkPolicy to only the pusher + Prometheus — otherwise any pod could push a fake
value to *suppress* an alert. radar is the first adopter (`radar_entries_scored` etc.);
this is the standard for future ephemeral pipelines.

## References

- Impl reports: 2026-05-31-VW-494-Qdrant-Backup-Acceptor-Block *(internal reference; not included)*,
  2026-05-31-SRE-Hardening-Session-Backups-Memory-Qdrant-Scout-Radar *(internal reference; not included)*
- Jira: VW-494 (backup root cause), VW-498 (residuals + P1 acceptance),
  VW-505 (1.18.1 upgrade / block confirmed inherent), VW-489 (fire-watcher + Pushgateway)
- Respects ADR-030 *(reference outside this archive)* (repo structure / gitops).
