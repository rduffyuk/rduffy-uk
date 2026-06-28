---
id: 19
title: "K3s over managed Kubernetes for the home platform"
status: accepted
date: 2025-10-12
tags: [infra, k8s]
episode: season-1-episode-6-k3s-crash-resurrection
public: true
---

## Context

The platform needed orchestration for GPU inference, streaming consumers, and observability — on a single GPU node and a MacBook, with no cloud budget.

## Decision

Run K3s on the home hardware rather than a managed cloud Kubernetes service.

## Alternatives considered

- **Managed cloud Kubernetes (EKS/GKE/AKS)** — rejected: monthly node cost makes it impractical for a home lab; also surrenders direct control of GPU scheduling, networking, and the full ops surface that the platform is specifically designed to build experience on.
- **Docker Compose** — rejected: no native GPU resource scheduling, no autoscaling via KEDA, no NetworkPolicies; would require rebuilding the orchestration primitives that K3s provides for free, and would not translate to production Kubernetes patterns.

## Consequences

Full production-grade orchestration experience (GitOps, NetworkPolicies, KEDA) at zero monthly cost; the trade is owning every crash personally — see S1E6's 6,812 pod restarts.
