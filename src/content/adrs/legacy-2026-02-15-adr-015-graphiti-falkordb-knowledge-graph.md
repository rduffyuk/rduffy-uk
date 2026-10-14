---
id: 15
title: "Graphiti + FalkorDB Knowledge Graph Integration"
status: accepted
recordedStatus: "Accepted"
date: 2026-02-15
tags: ["graphrag", "falkordb", "graphiti", "knowledge-graph"]
sourceKind: legacy-record
public: true
journeyId: "2026-02-15-legacy-adr-015-graphiti-falkordb-knowledge-graph-integration"
---
# ADR-015: Graphiti + FalkorDB Knowledge Graph Integration

**Status**: Accepted
**Date**: 2026-02-15
**Jira**: VW-79
**Branch**: `feature/graphiti-falkordb-integration`

## Context

The Rootweaver platform currently relies entirely on vector similarity search (Qdrant, 148K+ docs, 1024d Qwen3-Embedding-0.6B) for knowledge retrieval. While effective for semantic similarity, this approach has blind spots:

1. **No relationship awareness** — Vector search finds similar content but cannot traverse entity relationships (e.g., "what depends on rag-gateway?" or "which docs reference Kafka?")
2. **No impact analysis** — Cannot determine blast radius of changes across the knowledge base
3. **Disconnected code graph** — FalkorDB already hosts a code intelligence graph (PDG/AST data) at NodePort 30637, but it's isolated from document search
4. **No temporal entity tracking** — Graphiti's episodic memory model tracks how entities and relationships evolve over time, which vector search cannot capture

## Decision

Integrate **Graphiti v0.27.1** (Apache 2.0 licensed) with the existing **FalkorDB v4.4.1** instance to build two parallel knowledge graphs:

| Graph | Purpose | Data Source |
|-------|---------|-------------|
| `document_knowledge` | Vault document entities + relationships | Obsidian vault (via Graphiti LLM extraction) |
| `code_intelligence` | Code structure + dependencies | Existing PDG/AST data (already populated) |

### Architecture

```
Claude Code -> MCP Bridge (:30002)
                  |
                  +-> auto_search_vault -> Qdrant (vector)
                  +-> graph_search_vault -> FalkorDB (graph)  <- NEW
                  +-> hybrid: RRF fusion of both               <- NEW
                                |
                  FalkorDB (:30637)
                  +-- document_knowledge (Graphiti)
                  +-- code_intelligence (existing PDG)
```

### Key Design Choices

1. **Graphiti for extraction** — Uses LLM (vLLM Qwen3-14B-AWQ) to extract entities and relationships from vault documents as "episodes", building a temporal knowledge graph automatically
2. **Single FalkorDB instance** — Reuse existing deployment, separate graphs by name (not separate instances)
3. **RRF fusion** — Reciprocal Rank Fusion merges graph traversal results with vector similarity, weighted 40% graph / 60% vector by default
4. **Feature flags** — All graph capabilities behind Unleash flags for safe rollout and instant rollback
5. **GraphSearchAgent** — New agent type extending BaseAgent, integrated into UnifiedAgentRouter

## Alternatives Considered

### 1. LightRAG with FalkorDB
- **Pros**: Simpler API, FalkorDB PR pending
- **Cons**: FalkorDB support not yet merged (PR open), less mature temporal model, no episodic memory
- **Decision**: Rejected — waiting for unmerged PR is a blocker

### 2. Microsoft GraphRAG
- **Pros**: Well-documented, community support
- **Cons**: Heavy infrastructure (requires separate LLM pipeline, community detection, summarization), designed for one-shot corpus analysis not incremental updates
- **Decision**: Rejected — too heavy for incremental vault updates

### 3. Raw Cypher Queries (No Framework)
- **Pros**: Full control, no dependency
- **Cons**: Manual entity extraction, no temporal tracking, high maintenance for schema evolution
- **Decision**: Rejected — Graphiti provides extraction + temporal tracking out of the box

### 4. Neo4j Instead of FalkorDB
- **Pros**: Mature ecosystem, native Graphiti support
- **Cons**: FalkorDB already deployed, Neo4j requires separate infrastructure, licensing concerns for enterprise features
- **Decision**: Rejected — FalkorDB already running, Graphiti supports it natively

## Consequences

### Positive
- **Sub-10ms graph queries** — FalkorDB's in-memory graph engine is extremely fast for traversals
- **Temporal awareness** — Graphiti tracks entity evolution over time (episodes with timestamps)
- **Relationship discovery** — "What docs mention Kafka?" or "What depends on rag-gateway?" become answerable
- **Cross-graph insights** — Links between document entities and code entities enable "which docs describe this module?"
- **Safe rollout** — Feature flags allow instant disable without code changes

### Negative
- **LLM extraction cost** — Each vault document requires vLLM inference for entity extraction (~0.5-2s per doc)
- **Additional dependency** — `graphiti-core` adds to the dependency tree
- **Extraction quality** — LLM-based extraction may produce false entities; requires monitoring and quality checks
- **Ingestion latency** — Full vault ingestion (1,400+ files) will take hours; incremental updates mitigate ongoing cost

### Risks
- **Qwen3-14B-AWQ extraction quality** — If structured output quality is poor, fallback to Ollama deepseek-r1:7b or dependency parsing
- **FalkorDB memory** — Two graphs in one instance; monitor memory usage post-ingestion
- **Graphiti API stability** — v0.27.1 is relatively new; pin version strictly

## Implementation

See: Implementation plan in vault at `09-System/Architecture/Plans/2026-02-15-Graphiti-FalkorDB-Integration-Plan.md`

### Phases
0. Documentation & Foundation (ADR, Jira, NetworkPolicy)
1. Graphiti Service Layer (client wrapper, models, config)
2. Document Graph Ingestion Pipeline (Prefect flow)
3. GraphSearchAgent + MCP Integration
4. Code Graph Enhancement
5. Hybrid Fusion & Cross-Graph Links
6. Production Hardening
7. Documentation Finalization
