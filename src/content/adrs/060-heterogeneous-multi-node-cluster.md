---
id: 60
title: "Heterogeneous Multi-Node k3s: Dedicated Worker Nodes & Node-Separated Backup Tier"
status: accepted
recordedStatus: "Accepted"
date: 2026-06-04
tags: ["k3s", "multi-node", "taint", "node-affinity", "velero", "backup", "gitlab-runner", "kube-router"]
sourceKind: source-record
public: true
journeyId: "2026-06-04-adr-060-heterogeneous-multi-node-k3s-dedicated-worker-nodes-and-node-separated-backup"
---
# ADR-060 — Heterogeneous Multi-Node k3s: Dedicated Worker Nodes & Node-Separated Backup Tier

## Status
Accepted (2026-06-04)

## Context
The cluster grew from a single control-plane node (`rduffy`, desktop, amd64+GPU) to three nodes:
- `rduffy` — control-plane/master, amd64, RTX 4080, runs the platform + GPU workloads.
- `rduffy-mini` — amd64 CPU worker, dedicated to embedding (ADR-054, taint `embedding=true`).
- `pi5-node1` — Raspberry Pi 5 16GB / 1TB SSD, **arm64** (VW-566).

Adding heterogeneous nodes surfaced recurring questions that need a documented convention: how nodes join, how we stop the scheduler putting unrunnable workloads on them, how arch heterogeneity is handled, where backups live, and how NetworkPolicy behaves under this cluster's CNI. ADR-054 established the first dedicated worker; this ADR generalises the pattern and adds the backup-durability and arch dimensions.

## Decision

### 1. Node-join convention — LAN join + per-source-IP UFW allow
k3s agents join over the **LAN** (not Tailscale). The control-plane's UFW gates the k3s ports **per source IP**:
```
ufw allow from <node-LAN-IP> to any port 6443 proto tcp   # API
ufw allow from <node-LAN-IP> to any port 8472 proto udp   # flannel VXLAN
ufw allow from <node-LAN-IP> to any port 10250 proto tcp  # kubelet
```
Agent flags: `--node-ip=&lt;LAN&gt; --flannel-iface=eth0`, `K3S_URL=https://&lt;desktop-LAN&gt;:6443`. Pin the agent k3s version to the control plane. (Caveat, VW-566: inbound Tailscale → desktop is currently dropped by the UFW↔kube-router INPUT ordering, so Tailscale-based join does not work; LAN join is the standard.)

### 2. Dedicated-node taint pattern
Every non-control-plane worker carries a `NoSchedule` taint encoding its purpose (`embedding=true` for the mini, `pi5=true` for the Pi). Workloads opt in with a matching **toleration** + a **nodeSelector** (arch label or purpose). Joining a node *untainted* lets the scheduler spread pods that can't run there (wrong arch, missing hostPaths, no GPU) — observed live on VW-567. Taint first, then opt workloads in deliberately.

### 3. Architecture heterogeneity (arm64)
Platform service images are **amd64-only** (single-arch in Harbor). Therefore the arm64 Pi is used for **light / arch-agnostic CI** (lint, validate, docs) and **native arm64 multi-arch builds** — never for building/running the amd64 platform images (QEMU emulation is too slow) or GPU/embedding work. When pinning an image by digest for an arm64 target, pin the **multi-arch index** digest, not a per-arch manifest (a per-arch amd64 digest 404s on arm64 — VW-567).

### 4. Node-separated backup tier
Backups must not live only on the same node as the cluster. In addition to velero's default BSL (bundled MinIO on the desktop), a second MinIO runs on `pi5-node1`'s SSD as a non-default BSL (`pi-minio`), with a daily velero `Schedule` (offset time, longer TTL). A desktop failure no longer takes the backups with it. (Extends ADR-055.)

### 5. NetworkPolicy convention under kube-router
k3s kube-router does **not** populate the source ipset for cross-namespace `namespaceSelector` / `podSelector` ingress peers (verified empty, VW-567 → silent drop / timeout). Use **`ipBlock` of the cluster pod CIDR** (`REDACTED_PRIVATE_IP/16`) for allow-from-pods rules. Trade-off accepted: any in-cluster pod can reach the port (still cred-gated); external/host blocked by default-deny. True namespace-scoping needs the kube-router bug fixed or the client co-located in a peer namespace.

### 6. Gaming-mode resilience
Services that must keep running while `platform-mode gaming|dev-gaming` is active (which scales/parks specific desktop deployments) are **pinned to the Pi** (nodeSelector arch=arm64 + `pi5` toleration). Example: the second GitLab Runner (`gitlab-runner-pi`) — its manager pod lives on the Pi, so parking the desktop runner doesn't stop CI.

## Consequences
**Positive:** backup durability via node separation; CI offloaded from the memory-pressured desktop (cf. VW-536) onto a 24/7 low-power node; gaming-mode-resilient CI lane; deterministic workload placement; documented, repeatable node onboarding.

**Negative / accepted:** netpols are broader than ideal under kube-router; node-join is a manual UFW + agent step (not yet automated beyond cloud-init); arch split means contributors must tag CI jobs and be aware amd64 builds stay on the desktop; the Tailscale-inbound-to-desktop gap remains (only matters if a node must roam off-LAN).

## Alternatives considered
- **Tailscale-based join** (portable nodes): rejected for now — inbound Tailscale to the desktop is dropped (UFW↔kube-router); would need that fixed first.
- **Namespace-scoped NetworkPolicies**: not viable on this kube-router (empty selector ipsets).
- **Single backup tier**: rejected — no node separation, lower durability.
- **General (untainted) capacity nodes**: rejected — causes unrunnable-pod spread on heterogeneous nodes.

## Related
- ADR-054 (Dedicated CPU Embedding Worker Node — origin of the taint pattern)
- ADR-055 (Data-Store Backup & Qdrant Snapshot Tradeoff)
- VW-566 (Pi node join), VW-567 (MinIO backup target + arm64 runner), VW-575 (Schedule + smoke-test + this ADR)
- Vault impl reports: `06-Archive/Implementation-Reports/2026/Architecture/2026-06-04-VW-566-*`, `…-VW-567-*`
