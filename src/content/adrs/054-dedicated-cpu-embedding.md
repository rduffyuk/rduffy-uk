---
id: 54
title: "Dedicated CPU Embedding Worker Node (rduffy-mini)"
status: accepted
recordedStatus: "Accepted"
date: 2026-05-29
tags: ["k3s", "embedding", "tei", "keda", "gpu"]
sourceKind: source-record
public: true
episode: "season-3-episode-10-the-great-restructure"
journeyId: "2026-05-29-adr-054-separate-embedding-from-the-shared-inference-gpu"
---
# ADR-054: Dedicated CPU Embedding Worker Node (rduffy-mini)

**Status**: Accepted + **Implemented** (VW-486 checklist complete; verified live 2026-06-03 — `rduffy-mini` Ready, `tei-embedding` pod scheduled on it and serving)
**Date**: 2026-05-29
**Jira**: VW-486
**Related**: VW-473 (GPU burst), VW-337 (TEI→CPU), VW-311 (CPU throughput), VW-411 (single-node K3s), VW-491 (contention regression + remediation), VW-504 (delta-indexer path fix), ADR — see reference-gpu-burst-embedding-backlog *(internal reference; not included)*

## Amendment (2026-06-03, VW-491)

The original sizing line below quotes **~40s/embed**. A later, instrumented
measurement against the warm, idle mini TEI (using TEI's structured logs, which
separate `queue_time` from `inference_time`) puts real 750-word connector
chunks at **24–91s/embed, median ~55s** — same order, all comfortably inside the
300s `EMBED_TIMEOUT`. Use the measured **24–91s** range as canonical.

**The "mini is too slow / non-viable" framing (VW-491 handover, 2026-05-30) was
wrong.** Those >300s numbers were measured *during contention*, not idle, and
mis-attributed queue time to inference time. The contention had two now-fixed
causes — neither is per-chunk compute:
1. **An obsolete nightly reindex** (`0 3 * * *`, colliding with rootweaver-radar's
   arxiv firehose) that bulk-embedded a ~600-doc backlog on the shared mini TEI
   for 6h and even scaled TEI to 0 (dead VW-98 GPU logic). De-fanged + rescheduled
   to `0 5` — VW-491 Set A, deployed.
2. **The `vault-delta-indexer` double-path bug** that silently skipped radar's
   docs (`obsidian-vault/obsidian-vault/…` → File-not-found), so the firehose
   never drained incrementally and piled onto the nightly run. Fixed by
   `resolve_vault_relpath()` — **VW-504**, merged + live on the host the
   ScaledJob runs from.

**Net:** the ADR's "mini viable, 3× steady-state headroom" decision stands and is
the correct call; the slowness people saw was shared-TEI contention, not the N150.

## Context
The cluster has one RTX 4080 shared by two GPU-hungry tenants: vLLM (Qwen LLM inference) and the TEI embedder (Qwen3-Embedding-4B, 2560d). Every prior approach was a different answer to "who gets the card": VW-98 preempted vLLM (incident), VW-337 moved TEI to the desktop CPU (no contention, but ~1 embed/min — VW-311 structural slowness). The VW-473 incident (KEDA operator drift → embedding pipeline frozen) made the fragility visible.

We now own a GEEKOM mini (`rduffy-mini`, Intel N150 4-core, 16GB, Ubuntu 24.04) on the same LAN (REDACTED_PRIVATE_IP) as the desktop K3s server (REDACTED_PRIVATE_IP). Measured 2026-05-29: TEI cpu-1.9 + Qwen3-Embedding-4B fp16 runs at **~40s/embed ≈ 89 chunks/hr** on the N150. Steady-state vault inflow is **~25–33 chunks/hr** → ~3× headroom. The 4B model is retained for accuracy (non-negotiable — see feedback-embedding-4b-accuracy-no-0.6b *(internal reference; not included)*).

## Decision
1. **Join `rduffy-mini` as a K3s agent** (same-LAN, `v1.36.0+k3s1`, server `https://REDACTED_PRIVATE_IP:6443`), **tainted `embedding=true:NoSchedule`** and labelled `embedding=true`. The taint guarantees only embedding lands on the weak node.
2. **TEI becomes a plain `Deployment` with `replicas: 1`**, `nodeSelector: embedding=true` + matching toleration. **The `tei-embedding` KEDA ScaledObject is removed** — a dedicated always-on node has no reason to scale to zero, and removing it eliminates the ~8-min CPU warmup penalty and simplifies KEDA's role to the 14 ScaledJobs only.
3. **GPU backlog-bursts use in-place swap**: the VW-473 runbook gains one step — temporarily `kubectl patch` the TEI deployment to remove the `nodeSelector` (+ add GPU image/runtimeClass/limit) and scale vLLM down, drain on the desktop GPU, then re-add the nodeSelector to return TEI to the mini. With the mini keeping up with steady-state, bursts are a rare break-glass.
4. **GPU exporters need no change** (verified 2026-05-29): `nvidia-gpu-exporter` and `dcgm-exporter` already carry `nodeSelector: nvidia.com/gpu.present: "true"`, which the GPU-less mini never matches — they stay on the desktop automatically. The desired tolerate-all DaemonSets (node-exporter, vector, loki, beyla) *do* run on the mini, which is wanted (metrics/logs/traces from the new node).

## Blast radius (verified 2026-05-29)
**Affected — 4 async/batch indexers** (point at `tei-embedding.rootweaver:8090`, reach it via the unchanged Service regardless of node): `connector-indexer`, `vault-delta-indexer` (both KEDA ScaledJobs), `dlq-replay-connector-docs`, `vault-nightly-reindex` (CronJobs). All async; connector-indexer + vault-delta-indexer carry the VW-473 150s-timeout / 900s-poll-interval fixes, so the mini's 40s embeds are tolerated.

**NOT affected:**
- **Interactive search (read path):** the gateway's `EMBEDDING_SERVICE_URL` points at `rag-retriever:8001`, and the retriever embeds queries with its **own in-process model** on the desktop — it never calls `tei-embedding`. Query latency is untouched.
- **12 of 14 KEDA pipelines** don't use TEI (scout×4 = FalkorDB, arch-review×5 = vLLM, ner-consumer = spaCy, sre-brain = LLM). The taint keeps all 14 off the mini.
- KEDA operator untouched → all autoscaling behaves identically.

## Consequences
**Positive:** RTX 4080 freed for vLLM full-time; embedding warmup fragility removed (always-on); KEDA simplified (no TEI ScaledObject); steady-state indexing decoupled from the GPU; 4B accuracy retained.
**Negative:** the mini is a single point of failure for *indexing* (not search) — if it's down, indexing stalls until it returns or a burst is run; ~40s/embed latency (fine for async indexing, unusable for real-time); mini dedicated to this one job (~9.6GB/15GB RAM); one-time 8GB model download on first schedule.

## Alternatives considered
- **0.6B embedding model** — rejected: accuracy decision, 4B stays.
- **External Tailscale embedding endpoint** (mini outside the cluster) — rejected: requires NetworkPolicy egress + consumer repointing; in-cluster join keeps the Service unchanged.
- **Keep KEDA ScaledObject (min=1 or scale-to-zero)** — rejected: vestigial triggers / warmup penalty; plain Deployment is simpler.
- **Separate desktop burst deployment** — rejected: extra wiring + a repoint step; in-place swap is simpler for a rare op.
- **Drop GPU burst entirely** — rejected: keep break-glass for ~34h-worst-case backlogs.

## Rollback
`kubectl cordon rduffy-mini && kubectl drain rduffy-mini --ignore-daemonsets`, revert the TEI deployment to its desktop-CPU form in GitOps, then uninstall the agent (`/usr/local/bin/k3s-agent-uninstall.sh`). The server is untouched throughout.

## Implementation checklist (VW-486)
- [x] K3s agent join (LAN, taint, label) — done; required a scoped ufw rule (LAN→6443/8472/10250 for the mini IP)
- [x] Verify node Ready
- [x] GitOps: TEI → plain Deployment replicas=1 + nodeSelector/toleration; remove ScaledObject (commit c0baf54)
- [x] Verify TEI schedules on mini, serves, indexers drain via Service (lag 0, desktop GPU now vLLM-only)
- [x] Update VW-473 runbook (memory + ADR) with the nodeSelector-removal burst step
- [x] GPU-exporter exclusion — not needed (already pinned to GPU node via nvidia.com/gpu.present nodeSelector)
