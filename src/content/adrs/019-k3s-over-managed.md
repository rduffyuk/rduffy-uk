---
id: 19
title: "K3s over managed Kubernetes for the home platform"
status: accepted
date: 2025-10-12
tags: [infra, k8s]
episode: season-1-episode-6-k3s-crash-resurrection
public: true
---

> **EXAMPLE RECORD** — placeholder reconstructed from blog Season 1. Replace with the real ADR from the platform repo before going live.

## Context

The platform needed orchestration for GPU inference, streaming consumers, and observability — on a single GPU node and a MacBook, with no cloud budget.

## Decision

Run K3s on the home hardware rather than a managed cloud Kubernetes service.

## Consequences

Full production-grade orchestration experience (GitOps, NetworkPolicies, KEDA) at zero monthly cost; the trade is owning every crash personally — see S1E6's 6,812 pod restarts.
