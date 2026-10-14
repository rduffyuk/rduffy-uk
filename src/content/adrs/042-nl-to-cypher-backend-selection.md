---
id: 42
title: "NL-to-Cypher LLM Backend Selection"
status: accepted
recordedStatus: "accepted"
date: 2026-02-20
tags: ["vllm", "ollama", "nlp", "cypher", "gpu-sharing"]
sourceKind: source-record
public: true
journeyId: "2026-02-20-adr-042-nl-to-cypher-llm-backend-selection"
---
# ADR-016: NL-to-Cypher LLM Backend Selection

**Status**: Accepted
**Date**: 2026-02-20
**Jira**: VW-106

## Context

The `query_code_graph_nl` PDG tool converts natural language questions to Cypher queries for FalkorDB using an LLM. The original implementation used Ollama (`qwen2.5-coder:7b`) running CPU-only on the Desktop (GPU reserved for vLLM).

**Problem**: CPU inference takes 5-15s per query, making the tool impractical for interactive use.

**Current infrastructure**:
- vLLM: GPU exclusive (RTX 4080, 16GB VRAM), serving Qwen3-14B AWQ (~14.6GB)
- Ollama: CPU-only (62GB system RAM), serving qwen2.5-coder:7b, mistral:7b, qwen2.5-coder:14b
- HAMi: Deployed on K3s for GPU sharing, but ineffective when one model uses 91% VRAM

## Decision

**Route NL-to-Cypher through vLLM as primary backend, with Ollama as CPU fallback.**

The `nl_to_cypher.py` module now:
1. Tries vLLM (`localhost:30800/v1/completions`) with `qwen3-14b` first (~1s, GPU)
2. Falls back to Ollama (`localhost:11434/api/generate`) with `qwen2.5-coder:7b` (~5-15s, CPU)
3. Reports which backend was used in the response (`backend` field)

## Alternatives Considered

### 1. vLLM Sleep Mode + llama-swap (Deferred)
- vLLM Sleep Mode (Oct 2025): offloads weights to CPU RAM, frees GPU in 3-6s, wakes 18-200x faster than cold start
- llama-swap: Go proxy that auto-swaps models based on request routing
- **Verdict**: Most promising for true GPU multiplexing. Deferred because Option A (current decision) is simpler and sufficient for <10 queries/day.
- **Revisit when**: NL-to-Cypher or other tools need dedicated GPU model that conflicts with Qwen3-14B.

### 2. SGLang Universal Memory (Future exploration)
- SGLang's automatic CPU offloading treats VRAM as cache with LRU eviction
- Up to 6.4x throughput over vLLM on structured workloads
- **Verdict**: Cleanest long-term architecture but requires full engine migration from vLLM. High risk.
- **Revisit when**: vLLM limitations become blocking, or SGLang matures further.

### 3. Pre-compiled Cypher templates (Hybrid, future)
- Define ~20 parameterized query patterns, keyword-match to select template
- 0ms latency, zero model dependency, 100% correct Cypher
- **Verdict**: Excellent complement to LLM generation. Could handle 80% of queries.
- **Revisit when**: We have enough usage data to know the top query patterns.

### 4. Anthropic Claude Haiku API
- Fast (~0.5s), cheap (~$0.001/query), excellent code generation
- **Verdict**: Breaks fully self-hosted pattern. Not appropriate for core infrastructure.

### 5. Dedicated small model on vLLM
- Load a 3B code model alongside Qwen3-14B
- **Verdict**: Not viable — Qwen3-14B AWQ uses 14.6GB/16GB, no room for second model.

### 6. NVIDIA MIG / MPS / HAMi GPU partitioning
- MIG: Not supported on consumer GPUs (RTX 4080)
- MPS: Shares compute, not memory — useless when VRAM is the bottleneck
- HAMi: Effective only when multiple smaller models share a large GPU
- **Verdict**: None viable with current VRAM allocation.

## Research Summary

### GPU Sharing Techniques (RTX 4080 Applicability)

| Technique | Memory Isolation | RTX 4080 Support | Viable? |
|-----------|-----------------|-------------------|---------|
| NVIDIA MIG | Hardware | NO (datacenter only) | No |
| NVIDIA MPS | Soft limits | YES | No (VRAM full) |
| HAMi vGPU | CUDA interception | YES | No (VRAM full) |
| Time-slicing | None | YES | No (OOM risk) |
| vLLM Sleep Mode | Temporal | YES | Yes (swap-based) |
| SGLang Universal Memory | Auto-managed | YES | Yes (future) |

### Academic Papers

| Paper | Venue | Key Finding |
|-------|-------|-------------|
| ServerlessLLM | OSDI '24 | NVMe-optimized model loading: 10-200x faster swaps |
| Aegaeon | SOSP '25 | Market-based GPU pooling for multi-tenant serving |
| Kernel-Granularity Scheduling | 2025 | ~10ms CUDA kernel timeslicing for LLMs |
| Spatial-Temporal GPU Sharing | 2025 | SM partitioning + prefill/decode interleaving |
| Q-Infer | ACM TACO '25 | Sparse attention head offload to CPU |

### Alternative Inference Engines

| Engine | Multi-Model on 1 GPU | Auto Memory | Batch Inference |
|--------|---------------------|-------------|-----------------|
| vLLM + Sleep | Manual swap | No | Yes |
| llama.cpp Router | Yes (native LRU) | Yes | No |
| SGLang | Yes (Universal Memory) | Yes | Yes |
| Ollama | Yes (auto load/unload) | Yes | Limited |

## Consequences

### Positive
- NL-to-Cypher latency: 5-15s → ~1s (10-15x improvement)
- No new infrastructure — uses existing vLLM deployment
- Automatic fallback to Ollama if vLLM is down
- Response includes `backend` field for observability

### Negative
- Adds marginal load to vLLM (shared with RAG agents), though NL-to-Cypher usage is <10 queries/day
- Qwen3-14B is a general model, not code-specialized (but 14B params compensates)
- Still CPU-bound if vLLM is unavailable

### Future Work
- Evaluate vLLM Sleep Mode for true GPU multiplexing (when >1 model needs GPU)
- Consider pre-compiled Cypher templates for common queries (zero-latency path)
- Monitor SGLang Universal Memory maturity for potential engine migration
- Benchmark Qwen3-14B vs qwen2.5-coder:7b on Cypher generation quality

### External Links
| Platform | Link |
|----------|------|
| Confluence | ADR-016 in Confluence *(internal reference; destination redacted)* |
| Jira | VW-106 *(internal reference; destination redacted)* |
