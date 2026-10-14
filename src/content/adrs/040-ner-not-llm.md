---
id: 40
title: "NER System Evaluation — Span-Based Extraction"
status: accepted
recordedStatus: "accepted"
date: 2026-03-19
proposedDate: 2026-01-31
tags: ["ner", "spacy", "yake", "gliner", "architecture"]
sourceKind: source-record
public: true
journeyId: "2026-01-31-adr-040-named-entity-tagging-without-an-llm-spacy-and-yake-over-the-alternatives"
---
# ADR: NER System Evaluation — Span-Based Extraction

## Status

**ACCEPTED** (2026-03-19) — Replacing LLM-based NER with spaCy + EntityRuler + YAKE

### Decision Update (2026-03-19)

Original ADR proposed GLiNER vs Ollama evaluation. Since then:

1. NER was migrated from Ollama to vLLM (VW-126, Mar 2026) — bypassing this ADR
2. vLLM model swap to DeepSeek-R1 broke the pipeline (VW-151)
3. **Validation revealed 75% hallucination rate** — 15/20 tags on a test document were fabricated entities not present in the source text
4. Root cause: LLMs generate entities from prompt context, not just source text. The hardcoded vault context (`_load_vault_context()`) polluted every extraction.
5. Academic and industry research confirms: span-based models (spaCy, GLiNER) achieve higher precision with zero hallucination risk, at 100-1000x lower latency.

**Decision: Replace LLM NER entirely with span-based extraction.**
- **Tier 1 (CPU, immediate)**: spaCy en_core_web_lg + EntityRuler + YAKE
- **Tier 2 (GPU, batch)**: GLiNER for zero-shot custom entity types
- **LLM role**: None for extraction. Reserved for reasoning about extracted entities if needed.

## Context

### Current System

The Rootweaver Platform uses **Ollama mistral:7b** for Named Entity Recognition (NER) to auto-tag vault files with extracted entities (technical_terms, projects, concepts, tools).

| Component | Current Implementation |
|-----------|----------------------|
| Model | Ollama mistral:7b (7B params, CPU-only) |
| Approach | Zero-shot prompt-based extraction |
| Latency | ~1.2s per file (uncached) |
| Caching | MD5 content hash → 163x speedup on hit |
| Integration | Prefect flow (*/15 schedule), MCP tools |

### Constraints

1. **vLLM GPU-exclusive**: Single model limit (~15GB VRAM for Qwen3-Embedding-0.6B)
2. **Ollama CPU-only**: Configured in systemd to avoid GPU contention
3. **Qdrant backend**: 148K+ documents with `tags` payload indexed

### Problem Statement

Current NER performance on CPU is acceptable but could be improved:

- **Latency**: 1.2s per file on CPU (OK with cache, slow on miss)
- **Accuracy**: Unknown (no ground truth benchmark)
- **Scalability**: Cache-dependent performance

### Proposed Alternative: GLiNER

[GLiNER](https://github.com/urchade/GLiNER) is a specialized NER model that:

- Runs efficiently on **CPU** (50-300M params vs 7B)
- Uses **parallel span scoring** (not sequential token generation)
- Achieves **better accuracy** than LLMs on NER benchmarks (NAACL 2024)
- Supports **custom entity types** via natural language labels

## Decision Drivers

1. **Performance**: Faster NER extraction (target: <0.1s vs 1.2s)
2. **Accuracy**: Better entity extraction quality
3. **Resource efficiency**: No GPU competition with vLLM
4. **Maintainability**: Reduce Ollama dependency for non-LLM tasks

## Evaluation Methodology

### Phase 1: Baseline Benchmark (Current System)

```bash
# Capture current system performance
python tests/ner_benchmark.py --mode baseline \
    --output tests/ner_benchmark_results/baseline_ollama.json \
    --model-name "ollama-mistral:7b" \
    --limit 100
```

**Metrics Captured:**

| Category | Metrics |
|----------|---------|
| Performance | mean/p50/p95/p99 latency, throughput, cache hit rate |
| Accuracy | precision, recall, F1 (requires ground truth) |
| Quality | entities/file, tags added, false positive rate |
| Reliability | error rate, error types |

### Phase 2: Ground Truth Creation

Create manually annotated test set for accuracy measurement:

```bash
# Generate template for manual annotation
python tests/ner_benchmark.py --mode create-ground-truth --limit 50

# File created: tests/ner_ground_truth/ner_annotations_template.json
# Manually fill in expected entities for each file
```

**Ground Truth Schema:**
```json
{
  "file_path": {
    "expected_entities": {
      "technical_terms": ["kubernetes", "qdrant", "chromadb"],
      "projects": ["convocanvas", "neural-vault"],
      "concepts": ["rag", "embeddings", "semantic-search"],
      "tools": ["prefect", "ollama", "claude"]
    },
    "annotated_by": "rduffy",
    "annotated_date": "2026-01-31"
  }
}
```

### Phase 3: GLiNER Implementation

```python
# Add GLiNER to ner_pipeline.py (feature flag)
class VaultNER:
    def __init__(self, use_gliner: bool = False, ...):
        if use_gliner:
            from gliner import GLiNER
            self.gliner_model = GLiNER.from_pretrained("urchade/gliner_medium-v2.1")
            self.gliner_labels = [
                "technology", "framework", "project",
                "concept", "tool", "programming language"
            ]
```

### Phase 4: Comparison Benchmark

```bash
# Run benchmark with GLiNER
python tests/ner_benchmark.py --mode comparison \
    --baseline tests/ner_benchmark_results/baseline_ollama.json \
    --model-name "gliner-medium-v2.1" \
    --limit 100
```

## Success Criteria

### Performance (Required)

| Metric | Baseline (Ollama) | Target (GLiNER) | Improvement |
|--------|-------------------|-----------------|-------------|
| Mean Latency | ~1200ms | &lt;100ms | &gt;10x faster |
| P95 Latency | ~1500ms | &lt;150ms | &gt;10x faster |
| Throughput | ~0.8 files/sec | >10 files/sec | >10x faster |

### Accuracy (Required if Ground Truth Available)

| Metric | Baseline | Target | Requirement |
|--------|----------|--------|-------------|
| Precision | TBD | ≥ baseline | No regression |
| Recall | TBD | ≥ baseline | No regression |
| F1 Score | TBD | ≥ baseline | No regression |

### Quality (Informational)

| Metric | Observation |
|--------|-------------|
| Entities/file | Should be similar |
| False positives | Should not increase significantly |
| Category distribution | Should be balanced |

## Options Considered

### Option 1: Keep Current System (Ollama mistral:7b)

**Pros:**
- Already working and tested
- No migration effort
- Familiar codebase

**Cons:**
- Slow on CPU (~1.2s/file)
- Depends on Ollama service
- Not optimized for NER task

### Option 2: GLiNER on CPU (Recommended)

**Pros:**
- 10-50x faster on CPU
- Better accuracy (specialized for NER)
- Smaller footprint (300M vs 7B params)
- No GPU needed

**Cons:**
- New dependency
- Different entity label taxonomy
- Migration effort

### Option 3: vLLM for NER (Not Recommended)

**Pros:**
- GPU acceleration
- Could use existing vLLM infrastructure

**Cons:**
- Competes with embedding model for GPU
- Single model limit in vLLM
- Overkill for NER task

### Option 4: Hybrid Approach

Use GLiNER for fast extraction, Ollama for edge cases requiring reasoning.

**Pros:**
- Best of both worlds
- Fallback for complex cases

**Cons:**
- Increased complexity
- Two systems to maintain

## Implementation Plan

### If Decision: Proceed with GLiNER

1. **Week 1**: Run baseline benchmark, create ground truth
2. **Week 2**: Implement GLiNER with feature flag
3. **Week 3**: Run comparison benchmark
4. **Week 4**: Review results, make final decision
5. **Week 5**: Full migration (if approved)

### Migration Steps

1. Add `gliner` to requirements.txt
2. Add feature flag to VaultNER class
3. Update entity label mapping
4. Run parallel extraction (both systems) for validation
5. Switch default to GLiNER
6. Deprecate Ollama NER path
7. Update Qdrant payload indexes (if new entity types)

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| GLiNER accuracy worse | High | Benchmark before committing |
| Different entity taxonomy | Medium | Create mapping layer |
| New dependency issues | Low | Pin versions, test thoroughly |
| Cache invalidation | Medium | Plan migration window |

## Related Documents

- SYSTEM-HLD-High-Level-Design *(internal reference; not included)* - Section 4.2: NER Pipeline
- SYSTEM-LLD-Low-Level-Design *(internal reference; not included)* - Section 7.3: Entity Extraction
- 2025-10-17-NER-Prefect-Deployment-Complete *(internal reference; not included)* - Current implementation
- [GLiNER Paper (NAACL 2024)](https://aclanthology.org/2024.naacl-long.300/)

## Decision

**ACCEPTED**: spaCy + EntityRuler + YAKE (Tier 1), GLiNER (Tier 2)

### Baseline Results (LLM — DeepSeek-R1 via vLLM, 2026-03-19)

```
Date: 2026-03-19
Sample Size: 1 file (VW-149 implementation report)

Performance:
- Latency: 4,600ms per file (GPU)
- Throughput: ~0.22 files/sec
- Token budget: 4096 tokens (most consumed by <think> blocks)

Accuracy:
- Precision: ~25% (5/20 tags correct)
- Recall: Unknown (no ground truth)
- F1: Unknown
- Hallucination rate: 75% (15/20 tags fabricated)
```

### Expected Results (spaCy + EntityRuler + YAKE)

```
Performance (target):
- Mean Latency: <10ms per file (CPU)
- Throughput: >100 files/sec
- No GPU required

Accuracy (target):
- Precision: >90% (span-based = zero hallucination)
- Recall: >70% (EntityRuler covers domain vocabulary)
- F1: >80%
```

### Implementation Plan: VW-152

See vault plan: `09-System/Architecture/Plans/2026-03-19-VW-152-Span-Based-NER-Pipeline-Design.md`

## Consequences

### If GLiNER Adopted

**Positive:**
- Faster NER extraction (10-50x)
- Reduced CPU load from Ollama
- Better accuracy (expected)
- Simpler resource management

**Negative:**
- New dependency to maintain
- One-time migration effort
- Potential taxonomy differences

### If Keep Ollama

**Positive:**
- No migration risk
- Known system behavior

**Negative:**
- Slower performance continues
- Ollama remains required for NER

---

## Navigation

[📋 All ADRs](/adrs/) | 🏗️ HLD *(internal reference; not included)* | 🏠 Home *(internal reference; not included)*


## Record identity correction — 14 October 2026 (VW-447)

The canonical filename and ADR registry establish this record as ADR-040. Legacy metadata/headings have been aligned with that identity. This correction does not change the historical decision or assert current deployment. The original proposal date remains 31 January 2026; the body explicitly records acceptance of the span-based design on 19 March 2026. Both dates are retained separately. Run-Id: 01a13723-c94c-7cd0-9257-8d66c0784762.
