---
id: 11
title: "Journal Consolidator LLM Generation Tuning"
status: accepted
recordedStatus: "accepted"
date: 2026-02-03
tags: []
sourceKind: source-record
public: true
journeyId: "2026-02-03-adr-011-journal-consolidator-llm-generation-tuning"
---
# ADR-011: Journal Consolidator LLM Generation Tuning

## Status
**Accepted** - 2026-02-03

## Context

The daily journal consolidator (`daily_consolidator.py`) uses vLLM with DeepSeek-R1-Qwen3-8B to synthesize streaming journal fragments into polished daily journals. Initial configuration used conservative defaults that underutilized the model's capabilities:

| Setting | Initial Value | Problem |
|---------|---------------|---------|
| `max_tokens` | 3,000 | Only 6% of available context (49K) |
| `temperature` | 0.7 | Single setting, no flexibility |
| Content truncation | 2,000 chars | Cut off important content (K3s dashboard work missing) |

### Experiment Results

We ran systematic A/B testing across 5 presets on 2 dates (10 total runs):

| Preset | Temp | Freq Pen | Pres Pen | Feb 1 (large) | Feb 2 (small) | Quality |
|--------|------|----------|----------|---------------|---------------|---------|
| default | 0.7 | 0.0 | 0.0 | 6,362 chars | 7,287 chars | Good baseline |
| focused | 0.4 | 0.0 | 0.0 | 4,998 chars | 3,814 chars | Concise |
| balanced | 0.5 | 0.0 | 0.1 | 6,167 chars | 5,537 chars | Clean, readable |
| **detailed** | 0.6 | 0.0 | 0.2 | **7,347 chars** | 6,218 chars | **Best structure** |
| creative | 0.9 | 0.0 | 0.3 | 6,608 chars | 5,667 chars | Varied phrasing |

### Critical Finding: Frequency Penalty Failure

An earlier "focused" preset with `frequency_penalty: 0.2` caused **catastrophic repetition loops**:
- Output: 24,556 chars of repeated gibberish
- Root cause: Low temperature + frequency penalty creates a trap where the model avoids common tokens but can't find alternatives

This informed our decision to use **presence_penalty only** (encourages topic diversity) and avoid frequency_penalty entirely.

## Decision

We will implement a **preset-based generation system** with the following configuration:

### Generation Presets

```python
GENERATION_PRESETS = {
    "default": {
        "temperature": 0.7,
        "top_p": 1.0,
        "frequency_penalty": 0.0,
        "presence_penalty": 0.0,
    },
    "focused": {
        "temperature": 0.4,
        "top_p": 0.9,
        "frequency_penalty": 0.0,  # NO frequency penalty - causes loops
        "presence_penalty": 0.0,
    },
    "detailed": {  # NEW DEFAULT
        "temperature": 0.6,
        "top_p": 0.95,
        "frequency_penalty": 0.0,
        "presence_penalty": 0.2,  # Encourages topic coverage
    },
    "balanced": {
        "temperature": 0.5,
        "top_p": 0.9,
        "frequency_penalty": 0.0,
        "presence_penalty": 0.1,
    },
    "creative": {
        "temperature": 0.9,
        "top_p": 0.95,
        "frequency_penalty": 0.0,
        "presence_penalty": 0.3,
    },
}
```

### Updated Limits

| Setting | Old | New | Rationale |
|---------|-----|-----|-----------|
| `max_tokens` | 3,000 | **12,000** | Model context is 49K; give headroom |
| Content truncation | 2,000 chars | **4,000 chars** | Capture full session content |
| Default preset | N/A | **detailed** | Best balance of structure + coverage |

### Model Self-Regulation

A key finding: **the model self-regulates output length**. Despite 12K token limit:
- Large dataset (11K messages): ~4,300 chars output
- Small dataset (6K messages): ~4,200 chars output

The model produces appropriate-length content regardless of ceiling. Higher limits remove artificial constraints without causing bloat.

## Consequences

### Positive
- **Richer journals**: K3s dashboard public mode work now captured
- **Flexible presets**: Different styles for different needs (archival vs sharing)
- **No repetition loops**: Removed dangerous frequency_penalty
- **Better topic coverage**: presence_penalty encourages comprehensive synthesis
- **Future-proof**: 12K ceiling accommodates larger sessions

### Negative
- **Slightly longer generation**: ~2-3s longer with higher token limit
- **More configuration**: 5 presets to understand

### Risks
- **Preset drift**: May need periodic recalibration as model/prompts change
- **Context overflow**: Very large sessions could still truncate (mitigated by 4K char limit per session)

## Implementation

### Files Modified
- `scripts/journal/daily_consolidator.py` - Added preset system
- CLI: `--preset` flag with choices: default, focused, detailed, balanced, creative

### Usage

```bash
# Default (now uses detailed)
python daily_consolidator.py --date 2026-02-03

# Override to other presets
python daily_consolidator.py --date 2026-02-03 --preset creative
python daily_consolidator.py --date 2026-02-03 --preset focused
```

### Preset Selection Guide

| Use Case | Recommended Preset |
|----------|-------------------|
| Daily archival | `detailed` (default) |
| Quick summary | `focused` |
| LinkedIn/sharing | `balanced` or `creative` |
| Maximum detail | `detailed` |
| Varied phrasing | `creative` |

## Related

- [ADR-010](/adrs/010-streaming-journal-system/) - Streaming journal architecture
- System Docs *(internal reference; not included)* - Technical documentation
- Test outputs: `01-Journal/preset-tests/` - All 10 test variations

## References

- DeepSeek-R1 model card: reasoning-optimized, 49K context
- vLLM sampling parameters: https://docs.vllm.ai/en/latest/dev/sampling_params.html

## Navigation
Home *(internal reference; not included)* | Architecture *(internal reference; not included)* | [ADRs](/adrs/)
