---
id: 29
title: "KEDA-Based GPU Swap Controller for Embed/Inference Coexistence"
status: accepted
recordedStatus: "Accepted"
date: 2026-04-29
tags: ["architecture", "gpu", "keda", "scheduling"]
sourceKind: source-record
public: true
journeyId: "2026-04-29-adr-029-keda-based-gpu-swap-controller-for-embed-inference-coexistence"
---
# ADR-029: KEDA-Based GPU Swap Controller for Embed/Inference Coexistence

**Status**: Accepted (retroactive — ratifies the deployed VW-233 design)
**Date**: 2026-04-29
**Jira**: VW-233 *(internal reference; destination redacted)* (controller), VW-237 *(internal reference; destination redacted)* (alerts), VW-232 *(internal reference; destination redacted)* (scaling target rewire)
**Related ADRs**:
- [ADR-018](/adrs/034-data-source-connectors/) — defines the connector pipeline that produces the Kafka lag signal driving this controller
- [ADR-028](/adrs/036-vault-structured-index-postgres/) — establishes the vault-postgres tier that the connector-indexer dual-writes alongside Qdrant; embedding model alignment with Qdrant collection drives the choice of TEI as scaling target

---

## Context

The platform runs on a single NVIDIA RTX 4080 (16 GB VRAM). At least three workloads need the GPU:

1. **vLLM serving** (DeepSeek-R1-0528-Qwen3-8B-AWQ, ~15.6 GB) — primary LLM for agent routing, OracleAgent, SRE Brain, architecture-review pipeline.
2. **TEI embedding** (Qwen3-Embedding-4B, 2560d, ~8 GB transient) — the production embedder whose vector dimension matches Qdrant `rootweaver_vault`. Used by `vault-nightly-reindex` (~03:00–05:00 UTC) and on-demand by `connector-indexer` (VW-232) when Jira deltas land on `vault.connector-docs`.
3. **vllm-embedding StatefulSet** (jina-v4-code) — a separate embedder model retained for code-graph workflows.

The **first two cannot coexist** on 16 GB VRAM — vLLM's allocator pins the full slice, and TEI needs the full GPU to load Qwen3-Embedding-4B in workable time. HAMi fractional sharing was ruled out for this pair: vLLM is sized to consume essentially the full card, leaving no fraction for TEI. The historical workaround was a manual operator pattern: scale TEI up before the nightly reindex, scale it down afterwards. This left two failure modes:

- **Ad-hoc Jira ingest spikes** (since VW-232) needed TEI immediately, but TEI was scaled to 0 outside the nightly window.
- **Forgotten scale-down** caused inference outages until an operator noticed.

VW-188's go-live (Jira connector, 2026-04-26) made these bursts a routine event rather than a quarterly one. The manual model became untenable.

## Decision

Deploy a **KEDA + PriorityClass GPU swap controller** that:

1. Defines two `PriorityClass` objects to give the K8s scheduler an unambiguous preemption ordering between embedding and inference pods.
2. Replaces the manual TEI scale operator with a `ScaledObject` (not just `ScaledJob`) that KEDA reconciles based on Kafka lag and a cron window.
3. Lets vLLM remain the default GPU tenant, but yields the GPU on demand when embedding work arrives.

### Components

| Object | Kind | Location | Role |
|--------|------|----------|------|
| `vllm-embedding-priority` | PriorityClass | `infrastructure/vllm/vllm-priorityclasses.yaml` | High priority (value=1000), `PreemptLowerPriority`. Applied to TEI Deployment **and** the legacy `vllm-embedding` StatefulSet. |
| `vllm-llm-priority` | PriorityClass | (same file) | Low priority (value=100), `PreemptLowerPriority`. Applied to `vllm-0` (LLM serving). |
| `tei-embedding` | KEDA ScaledObject | `infrastructure/rootweaver/tei-embedding-scaledobject.yaml` | Scales TEI Deployment 0↔1; `pollingInterval=30s`, `cooldownPeriod=300s`, `fallback.replicas=0` on 3 consecutive trigger failures. |
| GPU swap health alerts | PrometheusRule | `infrastructure/monitoring/prometheus-rules.yaml` | VW-237 — detect stuck swap states, missed scale-down, eviction churn. |

### Triggers (OR semantics)

The `tei-embedding` ScaledObject scales to 1 if **either** trigger fires:

1. **Kafka lag** — consumer-group `connector-indexer` on topic `vault.connector-docs` exceeds `lagThreshold: 50`. Drives ad-hoc bursts (e.g. when `connector-jira-scheduler` produces a batch of issue updates).
2. **Cron window** — daily 03:00–05:00 UTC, matching the `vault-nightly-reindex` CronJob. Guarantees TEI is up during the bulk vault re-embedding window even if no Kafka lag is present.

### Swap mechanics

```
Idle state:
  vllm-0 (priority=100) holds GPU. TEI scaled to 0.

Trigger fires (Kafka lag OR cron):
  KEDA scales TEI Deployment 0→1.
  TEI pod requires GPU. Scheduler sees vllm-0 (priority=100) holding it.
  TEI has priority=1000 (PreemptLowerPriority) → vllm-0 evicted.
  TEI loads Qwen3-Embedding-4B (~30s), serves embedding traffic.

Trigger clears (Kafka lag returns to 0 / cron window ends):
  cooldownPeriod=300s elapses with no further lag.
  TEI scales 1→0. GPU released.
  vllm-0 rescheduled, reloads its model (~60s cold start).
```

### Retry coupling

`connector-indexer` is configured with `RETRY_TRIES=5` and `RETRY_BASE_DELAY=2s` (≈ 30s of exponential backoff). This is **not coincidental** — the backoff window is sized to absorb TEI's model load time so the first few embedding requests after a cold scale-up don't fail the consumer. Future tuning of either retry budget or TEI start-up time must consider the other.

## Consequences

### Positive

- **No idle embedding cost** — TEI runs at 0 replicas when there is no lag and no cron window. Reclaims ~8 GB VRAM headroom for inference 90% of the day.
- **Bounded inference outage** — vLLM cold start (~60s) is the only unavoidable cost when embedding bursts arrive. SRE Brain and routing fall back to Ollama (CPU) during the swap, so the system stays nominally available.
- **Workload-driven, not operator-driven** — eliminates the "forgot to scale down" failure mode that the manual pattern routinely produced.
- **Compatible with existing patterns** — extends the existing KEDA ScaledJob practice (used by `connector-indexer`, `vault-delta-indexer`, `ner-consumer`, `arch-review-*`) into ScaledObjects without introducing a new mechanism.

### Negative / accepted tradeoffs

- **vLLM cold-start latency on every swap** (~60s). Acceptable because (a) embedding bursts cluster temporally, so the swap fires once per burst, not per request; (b) the `vault-nightly-reindex` window only swaps twice per day; (c) Ollama provides a CPU fallback for routing during the gap.
- **Single point of GPU contention** — by design, only one of {vLLM, TEI, vllm-embedding} can hold the GPU at a time. Adding a fourth GPU workload would require either a second physical GPU or a more sophisticated scheduler.
- **Eviction is observable but not silent** — DCGM, kube-state-metrics, and the VW-237 alert family must remain healthy to detect stuck swap states. If `dcgm-exporter` is in CrashLoopBackOff (currently true as of 2026-04-29) the swap is observable only via Kafka consumer lag.
- **Non-trivial NetworkPolicy surface** — TEI ingress (8090) must be reachable from `connector-indexer`, `arch-review-extractor`, and `vault-nightly-reindex`. Each consumer needed its egress NetPol updated (VW-233 added explicit allow rules).

### Operational notes

- **Alerts to watch (VW-237)**: `GPUSwapStuck` (TEI scaled up but vLLM not evicted within 90s), `GPUSwapMissedScaleDown` (TEI replicas > 0 with no Kafka lag and outside cron window for >10 min), `vLLMColdStartChurn` (>3 evictions per hour — implies thrash).
- **Manual override**: `kubectl scale` on the TEI Deployment is discouraged; KEDA will revert. To force TEI up for an extended period, edit the ScaledObject's `fallback.replicas` or temporarily widen the cron window.
- **Model alignment is load-bearing**: TEI must serve the same embedding model as Qdrant's `rootweaver_vault` collection (currently Qwen3-Embedding-4B 2560d). Changing one without the other silently produces dimensionality mismatch — this is why TEI replaced the prior `vllm-embedding-scaledobject` for VW-232.

## Alternatives Considered

### A. HAMi fractional GPU sharing
**Rejected.** vLLM is sized to consume essentially the full RTX 4080 (~15.6 of 16 GB). TEI needs ~8 GB to load Qwen3-Embedding-4B with workable batch sizes. The two cannot coexist regardless of slicing. HAMi remains the right answer for smaller co-tenants (it is what allocates the 16 GB to vLLM today), but it cannot solve embed/inference coexistence on 16 GB.

### B. Pure cron scheduling (no Kafka trigger)
**Rejected.** Adequate for the deterministic nightly reindex, but VW-232's connector-indexer produces ad-hoc bursts (Jira ticket updates, future Slack/Confluence connectors). A 24h cron grain is too coarse — embedding requests would queue for hours.

### C. Run TEI on CPU
**Rejected.** Qwen3-Embedding-4B at 2560d on CPU embeds ~10× slower than GPU (measured during the 2026-03-18 model migration, reference: 2026-03-18-VLLm-Model-Swap-DeepSeek-R1 *(internal reference; not included)*). The vault-nightly-reindex window would not fit in 2 hours.

### D. Add a second GPU
**Rejected (for now).** The natural long-term answer, but capex-bound. The KEDA+PriorityClass design is reversible — when a second GPU lands, the priority annotations can be dropped and TEI pinned to the embed GPU.

### E. Inline embedding inside vLLM (model swap inside the same pod)
**Rejected.** vLLM's runtime is optimised for serving, not for hot-swapping model weights. The cold-start cost is already ~60s; in-process swaps would not be materially faster and would couple two workload lifecycles.

## Implementation References

- PriorityClasses: `rootweaver-gitops/infrastructure/vllm/vllm-priorityclasses.yaml`
- KEDA ScaledObject: `rootweaver-gitops/infrastructure/rootweaver/tei-embedding-scaledobject.yaml`
- TEI Deployment (priorityClassName + GPU resource request): `rootweaver-gitops/infrastructure/rootweaver/tei-embedding-deployment.yaml`
- vLLM StatefulSet (low-priority annotation): `rootweaver-gitops/infrastructure/vllm/vllm-statefulset.yaml`
- TEI ingress NetworkPolicy fix: `infrastructure/rootweaver/network-policies/connector-indexer-policy.yaml` (commit `19d74f0`)
- Alerts (VW-237): `infrastructure/monitoring/prometheus-rules.yaml`

## Related Modules

- HLD-03-AI-Layer *(internal reference; not included)* — TEI scaling behaviour, vLLM model details
- HLD-07-K3s-Deployment-Infrastructure *(internal reference; not included)* — KEDA pattern, HAMi context, GPU resource allocation
- HLD-05-Monitoring-Observability *(internal reference; not included)* — VW-237 alert family
- HLD-06-Security-Architecture *(internal reference; not included)* — TEI/connector NetworkPolicy specs

---

*This ADR ratifies a deployed change rather than proposing one. The implementation landed across commits `bb94571`, `a70b8f1`, `ea8161a`, `19d74f0`, `843bd7f` between 2026-04-23 and 2026-04-25. The deployed reality matched the proposed design — no rollback required.*
