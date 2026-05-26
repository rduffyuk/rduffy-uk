---
title: The Rootweaver Story
---

Rootweaver started with a single conversation on September 11, 2025. I had an Obsidian vault full of notes and no way to search them semantically. Claude Code and I indexed the vault into ChromaDB, and the first search worked.

That was the founding conversation. What followed was nine months of organic, compounding growth — each day building on the last, each feature emerging from a real need.

The vault search became a multi-agent RAG system with three tiers of intelligence. ChromaDB gave way to Qdrant with 2560-dimensional embeddings. A knowledge graph emerged in FalkorDB. Kafka event streams automated the indexing pipeline. An SRE agent started triaging its own alerts. A structured memory system learned to recall decisions across sessions.

Today it's a 5-layer AI productivity ecosystem running on a single K3s cluster with an RTX 4080 — presentation, services, AI inference, data persistence, and infrastructure. 29 namespaces, 150+ pods, 43 architectural decisions documented. No cloud dependencies. Everything deployed via GitOps from GitLab.

The Journey Map on this site shows that evolution. Every node is a component that exists in production. Every edge is a real connection. Every milestone is a moment where the platform grew.
