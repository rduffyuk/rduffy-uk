---
id: 12
title: "Journal Pipeline Quality Overhaul — Model Selection & E2A Architecture"
status: proposed
recordedStatus: "Proposed"
date: 2026-02-08
tags: ["journal", "inference", "quality", "streaming"]
sourceKind: source-record
public: true
journeyId: "2026-02-08-adr-012-journal-pipeline-quality-overhaul-model-selection-e2a-architecture"
---
# ADR-012: Journal Pipeline Quality Overhaul — Model Selection & E2A Architecture

**Status**: Proposed
**Date**: 2026-02-08
**Jira**: VW-33 (to be created)
**Supersedes**: Partial aspects of ADR-010 (Streaming Journal System)

## Context

The journal streaming pipeline (VW-6, VW-30) produces automated journal entries from Claude Code sessions. The pipeline works end-to-end — Kafka topics flow correctly, triggers fire, entries get written to vault. However, **content quality is not publication-ready**.

### Evidence of Quality Failure

Cross-referencing JSONL transcripts against OTEL-path journal entries for session `session_20260207_163955` revealed:

| Journal Claims | Actual Session (JSONL) |
|---|---|
| `deploy_watchdog.sh` JSON conversion | Writing Season 3 Episode 1 blog post |
| CI pipeline integration & Docker troubleshooting | Generating retro anime images via HuggingFace |
| Exit code debugging across 4 consecutive entries | Zero mentions of `deploy_watchdog.sh` in transcript |

**Every OTEL-path entry was entirely fabricated.** The voice and format were correct (v8 prompt redesign), but the content was fiction.

### Root Causes Identified

1. **OTEL events are structurally too sparse** (richness score: 2/10). They contain only `[event_name] Tool: X (decision) @ HH:MM:SS` — no file paths, no commands, no conversation context. Even with 50 events, the LLM has nothing to ground on.

2. **DeepSeek R1 8B is the wrong model** for summarization. Vectara's Hallucination Leaderboard shows R1 has a 14.3% hallucination rate (full model) — ~4x worse than DeepSeek V3. The 8B distillation performs worse still. R1 was trained via RL for reasoning/math; it "overhelps" by injecting plausible information not present in the source.

3. **Single-shot generation with no verification**. The pipeline currently generates content in one pass with no quality gate. Production content systems universally use multi-stage pipelines.

4. **Temperature too high** (0.7). Research shows 0.3-0.5 is optimal for factual content — low enough for grounding, high enough to avoid repetitive phrasing.

### Vision

Fully automated pipeline: Claude Code session → journal entry → weekly blog post → LinkedIn/social media. Currently blocked by content quality — human time spent manually crafting entries defeats the automation purpose.

## Decision

### 1. Deprecate OTEL Synthesis Path

The OTEL path is structurally incapable of producing quality journal entries. Events lack semantic content and no threshold or prompt instruction can fix this gap.

**Action**: Set `MIN_OTEL_EVENTS = 999` to effectively disable OTEL synthesis without removing code. Add deprecation log message. Remove fully in a future version.

**JSONL becomes the sole synthesis path.** The OTEL boundary detector remains useful for triggering JSONL session processing (detecting session boundaries, milestones).

### 2. Replace DeepSeek R1 8B with Qwen3-14B for Extraction

| | DeepSeek R1 8B | Qwen3-14B |
|---|---|---|
| Hallucination rate | ~14%+ | ~4-6% (estimated) |
| Writing quality | Poor (math/reasoning optimized) | Good (general purpose) |
| VRAM (Q4) | ~5GB | ~9GB |
| Fits RTX 4080 (16GB) | Yes | Yes (with headroom) |
| Summarization strength | Weak | Strong |

Qwen3-14B fits on the existing RTX 4080 with room for KV cache. It is the best free option for the extraction stage.

### 3. Implement Extract-then-Abstract (E2A) Two-Stage Pipeline

The single most impactful architectural change. Backed by research showing dramatically reduced hallucination when the synthesis model works from structured facts rather than raw transcripts.

```
Stage 1: EXTRACT (Local — Qwen3-14B on vLLM)
  Input: JSONL session transcript (formatted)
  Output: Structured JSON (guided_json via vLLM)
  Schema: {
    session_date, duration_estimate,
    primary_goals[], technical_decisions[{decision, reasoning}],
    files_modified[{path, change_type, description}],
    problems_encountered[{problem, solution, resolved}],
    tools_and_services[], key_learnings[],
    collaboration_highlights[]
  }
  Temperature: 0.3
  Purpose: Extract only facts present in transcript

Stage 2: SYNTHESIZE (API — Claude Sonnet 4.5 Batch)
  Input: Extracted facts JSON + style prompt + previous entry
  Output: Publication-ready journal entry (markdown)
  Temperature: 0.5
  Purpose: Turn verified facts into Ryan's voice
```

**Why E2A prevents hallucination**: The synthesis model (Claude) never sees the raw noisy transcript. It works only from structured, verifiable facts. If a fact wasn't extracted in Stage 1, it can't appear in Stage 2.

### 4. Add LLM-as-Judge Quality Gate

```
Stage 3: JUDGE (API — Claude Haiku 4.5)
  Input: Draft entry + extracted facts JSON
  Output: Scores (0-10) for:
    - Factual grounding: Every claim traces to extracted facts
    - Completeness: All significant session events covered
    - Hallucination: Binary — any invented content?
    - Tone/style: Appropriate for blog/LinkedIn
    - Coherence: Logical narrative flow
  Threshold: All scores >= 7 AND no hallucination
  Action:
    - Pass → auto-publish to vault
    - Fail → flag for human review OR trigger revision loop
```

Research shows LLM-as-judge achieves 80% agreement with human evaluators and is ~98% cheaper than human annotation.

### 5. Adjust Inference Parameters

| Parameter | Current | Proposed | Rationale |
|---|---|---|---|
| Temperature | 0.7 | 0.3 (extraction) / 0.5 (synthesis) | Lower for factual accuracy |
| Max tokens | 2048 | 1500 (extraction) / 2048 (synthesis) | Extraction should be concise |
| Model | deepseek-r1-0528-qwen3-8b | Qwen3-14B (local) + Claude Sonnet 4.5 (API) | Quality uplift |

### 6. Keep OTEL Boundary Detector for Triggering

The boundary detector's session detection logic (time gaps, milestones, topic changes) remains valuable for knowing *when* to process JSONL files. It just shouldn't try to *synthesize* from OTEL events.

```
OTEL events → boundary_detector → journal.triggers → session_parser → JSONL processing
                                   (trigger only,     (finds JSONL file,
                                    no synthesis)       routes to E2A pipeline)
```

## Cost Analysis

### Estimated Monthly Cost (Hybrid — Option C)

| Stage | Model | Volume/Month | Input Cost | Output Cost | Total |
|---|---|---|---|---|---|
| Extraction | Qwen3-14B (local) | 30 sessions | $0 | $0 | **$0** |
| Synthesis | Claude Sonnet 4.5 Batch | 30 entries | ~60K input tokens x $1.50/M | ~45K output x $7.50/M | **$0.43** |
| Judge | Claude Haiku 4.5 | 30 entries | ~120K input x $0.50/M | ~15K output x $2.50/M | **$0.10** |
| Revision (20%) | Claude Sonnet 4.5 Batch | ~6 entries | ~12K x $1.50/M | ~9K x $7.50/M | **$0.09** |
| Weekly blog | Claude Sonnet 4.5 Batch | 4 posts | ~48K x $1.50/M | ~12K x $7.50/M | **$0.16** |
| | | | | **Monthly total** | **~$0.78** |

*Batch API pricing is 50% of standard. Standard pricing would be ~$1.56/month.*

### Comparison

| Approach | Monthly Cost | Quality (1-10) | Automation Level |
|---|---|---|---|
| Current (R1 8B, single-shot) | $0 | 2/10 | Fully automated but unusable |
| Qwen3-14B only (local upgrade) | $0 | 5/10 | Automated, needs human editing |
| **Hybrid E2A (proposed)** | **~$0.78** | **8/10** | **Auto-publish above threshold** |
| Full API (Claude Sonnet all stages) | ~$2.41 | 9/10 | Auto-publish, simplest architecture |

## Consequences

### Positive

- Journal entries grounded in actual session content — no more hallucinated `deploy_watchdog.sh` scenarios
- Publication-quality output for ~$0.78/month — enables automated blog + LinkedIn pipeline
- LLM-as-Judge provides measurable quality metrics and catches regressions
- E2A pattern is composable — same extraction JSON can feed blog synthesis, LinkedIn posts, weekly summaries
- Qwen3-14B fits existing hardware (no new GPU needed)

### Negative

- API dependency for synthesis/judge stages (network requirement, Anthropic uptime)
- Slightly higher latency (API call ~5-15s vs local ~2-5s, mitigated by Batch API)
- Increased pipeline complexity (3 stages vs 1)
- Model download required (Qwen3-14B ~9GB)

### Risks

- Claude API pricing changes (currently negligible; would need >100x increase to matter)
- Qwen3-14B extraction quality untested on actual transcripts (mitigation: A/B test against R1 8B)
- Batch API latency (up to 24h for batch jobs — use standard API if same-day publishing needed)

## Alternatives Considered

### A. Keep R1 8B, improve prompts
Rejected. The model's architecture is fundamentally misaligned with summarization tasks. We already applied grounding blocks (VW-30 v9) — they help marginally but can't fix a 14%+ hallucination rate.

### B. Upgrade to 70B+ local model
Rejected for now. Qwen 2.5 72B / Llama 3.3 70B require ~40GB VRAM (Q4). RTX 4080 has 16GB. Would need multi-GPU or a new card. Revisit if quality from Qwen3-14B + API synthesis is insufficient.

### C. Fully API-based pipeline
Viable but unnecessary. Local extraction is free and fast. API synthesis at ~$0.78/month vs ~$2.41/month for full API. Hybrid keeps local GPU useful.

### D. Fine-tune a small model on Ryan's writing style
Interesting but premature. Requires curated dataset of "good" journal entries (which don't exist yet because the pipeline hasn't produced them). Revisit after 3-6 months of publication-quality output from the hybrid pipeline to use as training data.

## Implementation Plan

### Phase 1: Model Swap (1-2 hours)
- Download Qwen3-14B to vLLM
- Update `VLLM_MODEL` env var
- Lower temperature to 0.3
- Verify extraction quality on 3 test transcripts

### Phase 2: E2A Pipeline (4-6 hours)
- Add extraction stage to synthesizer (guided_json output)
- Add Claude API client for synthesis stage
- Wire extraction → synthesis flow
- Test on real JSONL sessions

### Phase 3: Quality Gate (2-3 hours)
- Add Haiku judge stage
- Define scoring criteria and threshold
- Add auto-publish vs human-review routing
- Wire into Prefect flow

### Phase 4: OTEL Deprecation (30 min)
- Set MIN_OTEL_EVENTS = 999
- Add deprecation warning log
- Verify OTEL boundary detector still triggers JSONL processing

### Phase 5: Blog + Social Pipeline (4-6 hours)
- Weekly aggregation from daily entries
- Blog post synthesis (Claude Sonnet)
- LinkedIn post formatting
- Scheduling via Prefect

## Related

- **ADR-010**: Streaming Journal System (this ADR extends the architecture)
- **VW-6**: JSONL Journal Pipeline Implementation
- **VW-30**: Synthesizer Prompt Redesign + Hallucination Guard
- **VW-33**: Journal Pipeline Quality Overhaul (to be created)
- Vectara Hallucination Leaderboard: DeepSeek R1 analysis
- Extract-then-Abstract pattern: arxiv.org/html/2410.06520v1

---

*Authored by Ryan Duffy & Claude, 2026-02-08*
