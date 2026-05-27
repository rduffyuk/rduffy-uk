---
title: Personal Project — Rootweaver AI Platform
order: 4
---

**2025 – Present** | Private repository (walkthrough available on request) | Public write-up: [blog.rduffy.uk](https://blog.rduffy.uk)

AI engineering platform running on a K3s cluster (RTX 4080, 64GB DDR5) across 28 namespaces. Built to solve a real problem: LLM context windows were insufficient for complex architectural work, so I engineered a persistent knowledge platform with hybrid graph + vector retrieval, structured long-term memory, and full observability. Architecture documented to enterprise standards: 10 HLD modules, 9 LLD modules, 46+ ADRs. Codebase organised as a 14-package uv workspace.

- **Model Serving:** vLLM on GPU (Qwen3-8B-AWQ, 32K context) + Ollama CPU fallback
- **Hybrid Retrieval:** Qdrant (~1,917 source documents, ~45K chunks at 2560d), BM25 + vector fusion, cross-encoder reranking, multi-agent routing (Fast/Deep/Oracle), ~30 MCP tools
- **Code Intelligence:** FalkorDB graph (~7,768 nodes) with Program Dependency Graph, OPA policy enforcement, DORA metrics exporter + Grafana dashboard, 221 passing unit tests
- **Long-Term Memory:** Postgres-backed pipeline with GDPR-compliant tombstoning, 6 recall MCP tools (session recall, decision tracing, state-at-time queries)
- **Streaming:** Kafka → Apache Flink → distributed vLLM workers, claim-check for large payloads, DLQ replay via daily Haiku-backed reprocessor
- **Observability:** Prometheus, Grafana (18+ panels), OTel Collector, Tempo, Loki, Beyla eBPF, Blackbox Exporter
- **Security:** 19 Sealed Secrets, 55+ NetworkPolicies, input validation, audit logging
- **GitOps:** FluxCD, Prefect (6 cron workflows), KEDA autoscaling, Harbor registry, Unleash feature flags
