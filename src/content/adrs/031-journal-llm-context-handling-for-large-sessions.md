---
id: 31
title: "Journal LLM Context Handling for Large Sessions"
status: withdrawn
recordedStatus: "Withdrawn-Duplicate-Of-ADR-032"
date: 2026-02-01
tags: []
sourceKind: source-record
public: true
journeyId: "2026-02-01-adr-031-journal-llm-context-handling-for-large-sessions"
---
# ADR-011: Journal LLM Context Handling for Large Sessions

## Status

**Proposed** | 2026-02-01

## Context

The streaming journal system (VW-6, VW-7) synthesizes Claude Code sessions into reflective journal entries using a local LLM via vLLM. During development, we discovered:

1. **OTEL Telemetry Limitations**: Claude Code exports telemetry with user prompts `&lt;REDACTED&gt;` for privacy
2. **JSONL Transcripts**: Full unredacted session history available at `~/.claude/projects/*.jsonl`
3. **Token Requirements**: Sessions range from 50K to 290K tokens (current session: 175K tokens, 4.2MB)
4. **Hardware Constraints**: RTX 4080 with 16GB VRAM must handle inference

### Token Analysis (94 Sessions, 875MB Total)

| Metric | Value |
|--------|-------|
| Median session | ~50K tokens |
| 95th percentile | ~200K tokens |
| Maximum observed | 290K tokens |
| Current session | 175K tokens (4.2MB) |

### Data Source Comparison

| Source | User Prompts | Tool Parameters | Response Content | Size |
|--------|--------------|-----------------|------------------|------|
| OTEL Events | `&lt;REDACTED&gt;` | JSON string (parseable) | Partial | ~10MB/day |
| JSONL Transcripts | Full text | Full details | Complete | ~10MB/session |

**Decision Point**: JSONL transcripts provide richer context for journaling but require larger context windows.

## Decision Drivers

- **Quality**: Journal entries should capture actual session context, not generic summaries
- **Hardware**: Must work on RTX 4080 16GB (single consumer GPU)
- **Latency**: Journal generation should complete in <5 minutes
- **Accuracy**: No hallucination from incomplete context

## Considered Options

### Option 1: Single-Pass Full Context (Rejected)

Load entire session into LLM context window.

**Problem**: KV cache memory requirements exceed hardware limits.

| Model | Context | KV Cache (FP16) | Total VRAM |
|-------|---------|-----------------|------------|
| Qwen3-8B | 128K | ~20GB | ~30GB |
| Qwen3-14B | 128K | ~32GB | ~45GB |
| DeepSeek-R1-8B | 128K | ~20GB | ~28GB |

**RTX 4080**: 16GB VRAM - cannot fit any 128K context model.

### Option 2: Aggressive Quantization (Partial)

Use Q4_0 quantization + FP8 KV cache to reduce VRAM.

| Configuration | VRAM Estimate | Quality Impact |
|---------------|---------------|----------------|
| Qwen3-8B Q4 + FP8 KV | ~12GB @ 32K | Moderate degradation |
| Qwen3-8B Q4 + Q4 KV | ~10GB @ 32K | Significant degradation |

**Problem**: Still limited to ~32K context, insufficient for 175K+ sessions.

### Option 3: Hierarchical Summarization with Parallel Chunks (Proposed)

Split session into chunks, summarize in parallel, synthesize final journal.

```
┌─────────────────────────────────────────────────┐
│             JSONL Session (175K tokens)          │
└─────────────────────────────────────────────────┘
                        │
            ┌───────────┼───────────┐
            ▼           ▼           ▼
     ┌──────────┐ ┌──────────┐ ┌──────────┐
     │ Chunk 1  │ │ Chunk 2  │ │ Chunk 3  │
     │ (30K)    │ │ (30K)    │ │ (30K)    │
     └────┬─────┘ └────┬─────┘ └────┬─────┘
          │            │            │
          ▼            ▼            ▼
     ┌──────────┐ ┌──────────┐ ┌──────────┐
     │ Summary 1│ │ Summary 2│ │ Summary 3│   ← Parallel via vLLM
     │ (2K)     │ │ (2K)     │ │ (2K)     │     continuous batching
     └────┬─────┘ └────┬─────┘ └────┬─────┘
          │            │            │
          └────────────┼────────────┘
                       ▼
              ┌────────────────┐
              │ Final Synthesis │
              │ (6K input)      │
              └────────────────┘
                       │
                       ▼
              ┌────────────────┐
              │ Journal Entry  │
              └────────────────┘
```

**vLLM Continuous Batching**: Process multiple chunks simultaneously:
- `max_num_seqs`: Controls concurrent sequences (e.g., 6 parallel chunks)
- PagedAttention: Efficient KV cache memory management
- 23x throughput improvement vs sequential processing

### Option 4: MoE Model with Extended Context (Alternative)

Use Qwen3-30B-A3B (Mixture of Experts):
- Only 3.3B parameters active per token (fits in VRAM)
- 256K native context window
- May fit single-pass for most sessions

**Concern**: Less tested, potential quality issues with instruction following.

## Decision

**Implement Option 3 (Hierarchical Summarization with Parallel Chunks)** with Option 4 as experimental fallback.

### Architecture

```yaml
Pipeline:
  1. Session Loader:
     - Read JSONL transcript
     - Calculate token count
     - If <32K: single-pass (Option 2)
     - If >32K: hierarchical (Option 3)

  2. Chunk Splitter:
     - Semantic boundaries (tool completions, topic shifts)
     - Target: 25-30K tokens per chunk
     - Preserve: user messages at boundaries

  3. Parallel Summarizer:
     - vLLM with max_num_seqs=6
     - Model: Qwen3-8B-Q4 (or available)
     - Prompt: Extract key events, decisions, outcomes
     - Output: 2K token summary per chunk

  4. Final Synthesizer:
     - Input: All chunk summaries (6-12K tokens)
     - Prompt: Journal-style reflection synthesis
     - Output: Markdown journal entry
```

### vLLM Configuration

```python
# Optimal settings for RTX 4080 + parallel chunks
LLMEngine(
    model="Qwen/Qwen3-8B",
    quantization="awq",  # or "gptq"
    gpu_memory_utilization=0.90,
    max_num_seqs=6,  # Parallel chunk processing
    max_model_len=32768,  # Safe for 16GB VRAM
    kv_cache_dtype="fp8_e5m2",  # KV cache quantization
)
```

### Token Budget

| Stage | Input Tokens | Output Tokens | VRAM Peak |
|-------|-------------|---------------|-----------|
| Chunk Summary (x6) | 30K each | 2K each | ~14GB |
| Final Synthesis | 12K | 4K | ~8GB |
| **Total** | 180K processed | 16K generated | 14GB max |

## Consequences

### Positive

- Works within RTX 4080 16GB constraint
- Parallel processing reduces latency (3x speedup vs sequential)
- Preserves full session context through hierarchical summarization
- Flexible: can adjust chunk size based on session complexity
- Future-proof: scales to larger sessions by adding more chunks

### Negative

- Information loss at chunk boundaries (mitigated by overlap)
- More complex pipeline (5 components vs 2)
- Requires semantic chunking logic (non-trivial)
- Two LLM calls per journal (chunk + synthesis)

### Risks

| Risk | Mitigation |
|------|------------|
| Chunk boundary information loss | 10% overlap between chunks |
| Parallel job failures | Retry logic with exponential backoff |
| Inconsistent chunk summaries | Standardized prompt template |
| vLLM OOM on large batches | Dynamic batch sizing based on GPU memory |

## Implementation Plan

### Phase 1: JSONL Parser
- Extract messages from transcript format
- Token counting with tiktoken
- Semantic boundary detection

### Phase 2: Chunking Strategy
- Implement 25-30K token chunks with 10% overlap
- Preserve user message integrity at boundaries
- Add chunk metadata (start/end positions, topic hints)

### Phase 3: Parallel Summarization
- vLLM batch API integration
- Chunk-to-summary prompt engineering
- Error handling and retry logic

### Phase 4: Synthesis Pipeline
- Final synthesis prompt
- Quality validation (completeness, coherence)
- Markdown formatting

## Related

- **VW-6**: Streaming Journal layout improvements
- **VW-7**: Tool context extraction from OTEL
- **ADR-010**: Streaming Journal System architecture
- **HLD Section 3.4**: Journal automation design

## References

- [vLLM Continuous Batching](https://docs.vllm.ai/en/latest/serving/engine_args.html)
- [PagedAttention Paper](https://arxiv.org/abs/2309.06180)
- [KV Cache Quantization](https://docs.vllm.ai/en/latest/quantization/kv_cache.html)
- [Qwen3 Context Extensions](https://huggingface.co/Qwen/Qwen3-8B)

---

## Navigation

Home *(internal reference; not included)* | Architecture *(internal reference; not included)* | [ADRs](/adrs/)
