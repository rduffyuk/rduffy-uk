---
title: Rootweaver
description: Personal AI productivity ecosystem — multi-agent RAG, long-term memory, knowledge graphs, and GPU-accelerated inference on K3s.
tags: ["kubernetes", "rag", "ai", "python", "mcp", "kafka", "vllm"]
url: /rootweaver
order: 1
---

The centrepiece of everything I build. Rootweaver is a 5-layer AI platform: presentation, services, AI inference, data persistence, and infrastructure — all running on a single K3s cluster with an RTX 4080.

It indexes 148K+ document chunks across a personal vault, code repos, and external sources. Multi-agent RAG search (FastSearch <1s, DeepResearch ~10s, Oracle 15-30s) with hybrid vector + BM25 retrieval. Event-driven indexing via Kafka. Long-term structured memory. Full observability with Prometheus, Grafana, and distributed tracing.

Built entirely through AI-orchestrated development with Claude Code. 43 ADRs, 29 MCP tools, 150+ pods across 29 namespaces.
