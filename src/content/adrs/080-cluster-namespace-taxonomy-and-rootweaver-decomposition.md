---
id: 80
title: "Cluster-Wide Namespace Taxonomy and rootweaver Decomposition"
status: accepted
recordedStatus: "Accepted"
date: 2026-06-16
tags: []
sourceKind: source-record
public: true
journeyId: "2026-06-16-adr-080-cluster-wide-namespace-taxonomy-and-rootweaver-decomposition"
---
# ADR-080: Cluster-Wide Namespace Taxonomy and rootweaver Decomposition

**Status:** Accepted · **Date:** 2026-06-16 · **Owner:** Ryan Duffy
**Epic:** VW-858 *(internal reference; not included)* · **Sequence:** decompose-first, Cilium-optional (VW-426) · **Absorbs:** VW-352 · **Relates to:** [ADR-048-Egress-Control-Strategy](/adrs/048-egress-control-strategy/), [ADR-060-Heterogeneous-Multi-Node-Cluster-And-Node-Separated-Backup](/adrs/060-heterogeneous-multi-node-cluster/)

## Context

The cluster has ~32 namespaces. Infrastructure is already split per-function (kafka, vllm, monitoring, langfuse, unleash, netbox, minio, matrix, searxng, forgejo, harbor-system, …). The exception is the **application plane**: a single catch-all `rootweaver` namespace holds **102 pods** — ~29 Deployments, 4 StatefulSets, ~20 CronJobs, ~28 Services spanning the RAG product, agent memory, MCP gateways, the vault ingest pipeline, code intelligence, the journal pipeline, SRE agents, and the frontends. None of these carry `app.kubernetes.io/part-of` or `/component` labels, so there is no logical grouping even within the namespace.

Two further problems were found during inventory:
1. There is **no namespace-organization ADR** — `rootweaver` accreted as a default, it was never chosen.
2. **Cruft**: `chaos-testing` has been stuck `Terminating` for 87 days (leftover from VW-647 chaos removal); `eng-intel`, `elastic-monitoring`, `traefik-system`, `vpa-system`, `cloudflare-system` show 0 pods and need an audit. (`vllm` at 0 pods is **expected** — KEDA/GPU scale-to-zero per the GPU-priority SLO — not cruft.)

**Constraint UPDATE (VW-869, gate-tested 2026-06-16):** ADR-060 §5 / VW-567 claimed kube-router does not populate ipsets for cross-namespace selectors (silent drop), implying real isolation needed Cilium. **This is no longer true on k3s v1.36.0+k3s1.** Wave-0g proving gates — including a CROSS-NODE test with verified placement (nginx→rduffy-mini, client→rduffy) — showed combined `namespaceSelector`+`podSelector` ingress AND cross-ns egress both work and discriminate by pod. So the current CNI delivers **RBAC scope + ResourceQuota + blast-radius + clarity AND pod-level network isolation**. The `ipBlock: REDACTED_PRIVATE_IP/16` workaround is retired. Cilium (ADR-048 Phase 2 / VW-426) is therefore **optional** — its remaining value is L7/FQDN egress + eBPF observability only.

## Decision

Adopt a **cluster-wide namespace taxonomy** organized on two axes, decompose `rootweaver` into 11 per-function namespaces **under the current CNI** (pod-precise cross-ns netpols confirmed working), and treat Cilium as optional later hardening.

### 1. Two-axis classification (labels, not renames)

Renaming a namespace in Kubernetes is delete-and-recreate — destructive for stateful infra. Therefore **stable namespaces keep their names**; order is imposed via two standard labels applied to **every** namespace:

- `rootweaver.io/tier: kubernetes | system | platform | devtools | observability | ops | app`
- `app.kubernetes.io/part-of: rootweaver` (on every app-plane workload, so dashboards keep one logical platform view)

All 33 live namespaces (verified against `kubectl get ns`). `sealed-secrets`/`nvidia-device-plugin` are NOT namespaces (controllers run in `kube-system`); `gitlab-runner-pi` is a Flux folder, not a namespace.

| Tier | Namespaces (count) | Role |
|---|---|---|
| **kubernetes** (4) | default, kube-system, kube-node-lease, kube-public | Built-in; untouched (keep `default` empty) |
| **system** (9) | flux-system, tailscale-system, traefik-system, cloudflare-system, egress-proxy, keda, vpa-system, reflector, reloader, *(future: cilium)* | Cluster control/data-plane plumbing |
| **platform** (9) | vllm, kafka, prefect, minio, flink, netbox, unleash, searxng, matrix | Shared backing services the app plane consumes |
| **devtools** (3) | harbor-system, forgejo, gitlab-runner | Registry / git / CI |
| **observability** (4) | monitoring, langfuse, elastic-system, elastic-monitoring | Metrics, logs, traces, LLM observability |
| **ops** (1) | velero | Backup / DR / lifecycle |
| **app** (2) | **rw-*** (rootweaver → 11, below) + eng-intel (EIP, 0-pod — audit) | The products |
| **to-be-removed** (1) | chaos-testing (stuck Terminating 87d — force-clear) | Cruft |

### 2. rootweaver -> 11 `rw-*` namespaces

Greenfield namespaces (created fresh, so no rename cost). `rw-` prefix → `kubectl get ns | grep rw-` shows the whole product. **All stateful DBs consolidated into a dedicated `rw-data`** (user decision); workload-private PVCs (mcp-memory, pdg-dora-metrics) stay with their workload; the shared vault corpus (neural-vault-pvc RWX, vault-pvc ROX) gets per-namespace PVCs to the same hostPath PV.

| Namespace | Workloads |
|---|---|
| `rw-data` | qdrant, falkordb, vault-postgres(+dump/init/pdb), research-postgres, vault-postgres-bench (the 5 DBs + dump target — migrate via app-native backup/restore, NOT PVC snapshot) |
| `rw-rag` | rag-gateway, rag-retriever, bifrost, pdb-rag-gateway, ingress |
| `rw-embed` | tei-embedding, tei-embedding-gpu(+canary), embedding-burst-*, gpu-monitor ExternalName |
| `rw-memory` | mcp-memory (+pvc), memory-writer, memory-{embed-backfill,graph-reconcile,tombstone-reaper} |
| `rw-mcp` | mcp-bridge, mcp-bridge-readonly, mcp-bridge-bench, mcp-bridge-tailscale, sequential-thinking |
| `rw-ingest` | vault-indexer, vault-delta-indexer, file-watcher, ner-consumer, stt-whisper, connector-*, dlq-*, vault-jira-sync, vault-nightly-reindex |
| `rw-codeintel` | pdg-dora-exporter (+pvc), pdg-rebuild, scout/* (arch-review-* RETIRED VW-718 — delete) |
| `rw-journal` | journal-chunk-router, journal-session-parser, journal-synthesizer, journal-vllm-worker, journal-daily-consolidator, journal-health-monitor (+ existing journal-streaming) |
| `rw-sre` | sre-brain, sre-event-collector, review-tracker, rootweaver-radar(+digest/trending), failed-pod-gc |
| `rw-frontend` | rootweaver-console, arch-viz-frontend, code-graph-frontend, cluster-info-api |
| `rw-platform` | mlflow, opa, kroki |

Optional finer split (`rw-store`, `rw-archreview`, `rw-radar`) deferred unless coupling proves otherwise.

### 3. Sequencing: decompose first, Cilium optional

Per VW-869, pod-precise cross-ns netpols work on the current CNI (v1.36), so the decomposition runs **entirely under kube-router** and delivers full isolation immediately. Cilium (VW-426) is no longer a gate — it is optional later hardening for L7/FQDN egress + eBPF observability only.

### 4. Cruft cleanup

Force-remove stuck `chaos-testing`; audit + remove or document `eng-intel`, `elastic-monitoring`, `traefik-system`, `vpa-system`, `cloudflare-system` (0-pod). Keep `default` empty.

## Coordination / linking layer

- **DNS** — cross-ns via FQDN, e.g. `qdrant.rw-vector.svc.cluster.local`. Main code touch: hardcoded service URLs.
- **Secrets/Config** — `reflector` (installed) mirrors a source Secret into target namespaces by annotation — no per-namespace re-seal; `reloader` (installed) restarts on config change.
- **Governance** — `ResourceQuota` + `LimitRange` + namespaced `Role`/`RoleBinding` per namespace (absorbs VW-352 sre-brain RBAC scoping).
- **Policy** — precise combined `namespaceSelector`+`podSelector` NetworkPolicies per cross-ns edge, native on the current CNI (VW-869). Build from a dependency matrix; every namespace gets a base set: DNS egress, API-server egress, Prometheus scrape **ingress** (monitoring→app), OTLP egress where used.

Cross-ns coupling graph (each arrow = one policy): frontend→{rag,mcp,sre,codeintel}; rag→{embed,data}; mcp→{rag,memory,codeintel}; memory→{embed,data}; ingest→{embed,data,kafka}; journal→{vllm,kafka}; ALL→kafka. NOTE: Prometheus scrape is monitoring→app **ingress** (not app egress); `reflector` is a control-plane controller, not a runtime data dependency — neither belongs on an app "egress" edge.

## Migration (waves, dependency-ordered)

0. **Groundwork (no moves):** tier labels cluster-wide; cruft cleanup (chaos-testing); reflector for the GitLab registry pull-secret (from a stable ns); reusable templates; FQDN-ify intra-cluster refs in place; kroki adopt + arch-review delete; corpus-PV inventory. (Gate-0g already PASSED — netpol premise validated.)
1. **`rw-frontend`** pilot — lowest coupling; validates folder→transformer→reflector→Flux→cross-ns FQDN→precise netpols→quota/RBAC end-to-end.
2. **App planes** — `rw-rag`, `rw-embed`, `rw-memory`, `rw-mcp`, `rw-ingest`, `rw-codeintel`, `rw-journal`, `rw-sre`, `rw-platform` (DBs stay in `rootweaver` this wave; services reach them at `*.rootweaver` FQDN).
3. **`rw-data` (stateful, last)** — qdrant, falkordb, vault-postgres, research-postgres, bench via app-native backup→restore; flip callers to `*.rw-data` FQDN; delete empty `rootweaver`.
4. **Cilium (VW-426) — OPTIONAL** — L7/FQDN + observability only; re-evaluate whether the CNI-swap risk is worth it.

Each namespace = one GitOps folder (`namespace.yaml` + `kustomization.yaml` with `namespace:`), mirroring the existing one-folder-per-namespace convention in `rootweaver-gitops/infrastructure/`.

## Consequences

**Positive:** clear subsystem ownership; per-namespace quota/RBAC/blast-radius; **pod-precise network isolation immediately (no Cilium needed)**; cluster legible at a glance (`grep rw-`, tier labels).
**Negative / accepted:** 11 new namespaces ⇒ a dozen+ cross-ns policies to maintain; rw-data DB moves require app-native backup/restore in a window; one-time FQDN service-URL change; net new manifests in GitOps. Renames of stable infra namespaces are explicitly avoided (label-only) to dodge delete-recreate churn.

## Alternatives considered

- **One namespace (status quo)** — rejected: no RBAC/quota/blast-radius separation; junk drawer.
- **Moderate 4-namespace split** — rejected by user: too coarse for "per function."
- **Fine-grained on kube-router (no Cilium)** — **SELECTED** (was a concern under ADR-060's old assumption, but VW-869 proved cross-ns netpols work pod-precise on v1.36, so this is now the chosen path — real isolation, no CNI swap).
- **Rename all namespaces to a prefix scheme** — rejected: delete-recreate is destructive for stateful infra; labels achieve taxonomy without churn.

## References

- Epic: VW-858 · Gating: VW-426 (Cilium, ADR-048 Ph2) · Absorbs: VW-352 · Constraint: VW-567
- [ADR-048-Egress-Control-Strategy](/adrs/048-egress-control-strategy/), [ADR-060-Heterogeneous-Multi-Node-Cluster-And-Node-Separated-Backup](/adrs/060-heterogeneous-multi-node-cluster/)
- Aptakube — Namespace best practices; Atmosly 2025 — Namespace management; Wiz — Namespace security; k8s.guide — Namespaces.
