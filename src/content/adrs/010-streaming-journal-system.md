---
id: 10
title: "Streaming Journal System Architecture"
status: accepted
recordedStatus: "accepted"
date: 2026-01-31
tags: []
sourceKind: source-record
public: true
journeyId: "2026-01-31-adr-010-streaming-journal-system-architecture"
---
# ADR-010: Streaming Journal System Architecture

## Status
**Accepted — partially implemented / evolved** - clarified 2026-06-19 (an earlier same-day edit wrongly marked this "Superseded"; corrected after live verification — see banner)

> [!note] Implemented as a leaner variant — supersession is PARTIAL (corrected 2026-06-19)
> An earlier 2026-06-19 edit wrongly marked this ADR "Superseded / never reliably operational in-cluster." **Live verification overturned that** — the streaming pipeline IS running. The Flink consumers (`journal-boundary-detector`, `journal-vault-publisher`) recovered ~2026-06-15 (PyPI egress became reachable) and have run stably since; the 74–75 restart counts are a **healed historical scar** from the egress-closed period, not current state.
>
> **What shipped (this ADR's core decision — LIVE, offset-confirmed):** Claude Code OTEL → Kafka `journal.*` topics → event-boundary detection → streaming synthesis → vault. End-to-end: boundary-detector → `journal.triggers` → `journal-session-parser` (rw-journal) → `journal.sessions` → `journal-synthesizer` → `journal.output` → vault-publisher (writes `01-Journal/Streaming/`) + matrix-bot.
>
> **What did NOT ship (scope that evolved):** DeepSeek-R1-8B (now Claude Haiku → Groq → vLLM fallback), MiniCPM-V video understanding (never deployed), Flink 2.2 SQL / `ML_PREDICT` (replaced by plain Python-on-Flink for business logic), Elasticsearch archive, and OTEL-as-content. OTEL telemetry is privacy-stripped, so it is used only for **triggering**; journal *content* comes from raw Claude JSONL transcripts via the judge-gated E2A path (see ADR-012). The daily consolidator reads JSONL directly (`READ_JSONL_DIRECT=true`), independent of the Kafka chain.
>
> **Net:** the architecture stands; the technology choices evolved. Hardening (bake `confluent-kafka` into the Flink images instead of runtime `pip install`), decommissioning only the Gen-1 Prefect zombie, restoring the metacognition/brag regression, and authoring the canonical Gen-3 ADR are tracked in **VW-912**. ADR-012 (E2A Pipeline) covers the synthesis-quality evolution.

## Context

Ryan's daily journal generation currently runs as a batch process via Prefect flows (`journal-automation-v3`). While functional, this approach has limitations:

1. **Latency**: Journals are generated hours after events occur
2. **Context Loss**: By end of day, details of morning activities fade
3. **No Video Integration**: Screen recordings exist but aren't analyzed
4. **Single Synthesis**: One daily pass misses evolving narrative threads

The streaming approach provides:
- Real-time event capture as work happens
- Recursive summarization that builds on previous context
- Video frame integration for visual understanding
- Immediate detection of significant milestones

## Decision

We will implement a **streaming journal system** using:

1. **Claude Code Native OTEL** → Kafka for event capture
2. **Apache Flink 2.2** for event-driven LLM summarization
3. **MiniCPM-V** on CPU for video understanding (GPU reserved for vLLM)
4. **Tiered publishing** with quality gates for external content

### Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    STREAMING JOURNAL SYSTEM                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  CAPTURE LAYER                                                       │
│  ┌──────────────────┐     ┌──────────────────┐                      │
│  │ Claude Code      │     │ OBS Recording    │                      │
│  │ OTEL Native      │     │ H.265 NVENC      │                      │
│  │ (no wrapper!)    │     │                  │                      │
│  └────────┬─────────┘     └────────┬─────────┘                      │
│           │                        │                                 │
│           ▼                        ▼                                 │
│  ┌─────────────────────────────────────────────┐                    │
│  │           OTEL Collector (K3s)              │                    │
│  │           Kafka Exporter configured         │                    │
│  └─────────────────────┬───────────────────────┘                    │
│                        │                                             │
│  EVENT LAYER           ▼                                             │
│  ┌─────────────────────────────────────────────┐                    │
│  │              Kafka Topics                    │                    │
│  │  • journal.claude.events                    │                    │
│  │  • journal.video.frames                     │                    │
│  │  • journal.triggers                         │                    │
│  │  • journal.output                           │                    │
│  └─────────────────────┬───────────────────────┘                    │
│                        │                                             │
│  PROCESSING LAYER      ▼                                             │
│  ┌─────────────────────────────────────────────┐                    │
│  │         Apache Flink 2.2                     │                    │
│  │  • ML_PREDICT for LLM calls                 │                    │
│  │  • State management (recursive summary)      │                    │
│  │  • Event boundary detection                  │                    │
│  └─────────────────────┬───────────────────────┘                    │
│                        │                                             │
│  INFERENCE LAYER       ├────────────────┬───────────────┐           │
│                        ▼                ▼               ▼           │
│           ┌──────────────────┐ ┌──────────────┐ ┌──────────────┐   │
│           │ vLLM (GPU)       │ │ Ollama (CPU) │ │ Elasticsearch│   │
│           │ DeepSeek-R1-8B   │ │ MiniCPM-V    │ │ Searchable   │   │
│           │ Journal Synth    │ │ Video→Text   │ │ Archive      │   │
│           └──────────────────┘ └──────────────┘ └──────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Compute Allocation

| Service | Compute | VRAM/RAM | Rationale |
|---------|---------|----------|-----------|
| vLLM (DeepSeek-R1-Qwen3-8B) | GPU | ~15GB | High-throughput journal synthesis |
| Ollama (MiniCPM-V) | CPU | ~8GB RAM | Video processing, non-blocking |
| Flink | CPU | ~2GB | Event processing, state management |
| OTEL Collector | CPU | ~512MB | Telemetry routing |

### Technology Choices

#### Claude Code OTEL (Native)
Claude Code has **native OTEL support** requiring only environment variables:
```bash
CLAUDE_CODE_ENABLE_TELEMETRY=1
OTEL_METRICS_EXPORTER=otlp
OTEL_LOGS_EXPORTER=otlp
OTEL_EXPORTER_OTLP_PROTOCOL=grpc
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:31317
```

Events exported:
- `claude_code.user_prompt` - Ryan's inputs
- `claude_code.tool_result` - Tool executions
- `claude_code.api_request` - Claude's responses
- `claude_code.api_error` - API failures

#### Apache Flink 2.2
Flink 2.2 includes **native LLM integration**:
- `ML_PREDICT` function for inline LLM inference
- Async I/O operators for non-blocking API calls
- State management for recursive summarization
- Exactly-once guarantees with Kafka

#### MiniCPM-V 4.5
Video understanding with efficiency:
- 96x video token compression (6 frames → 64 tokens)
- 8B parameters (fits in RAM)
- vLLM/Ollama deployment support
- Up to 10 FPS video understanding

### Publishing Tiers

```
Tier 1: Obsidian (Internal)     → Auto-publish, minimal gates
Tier 2: Blog (External)         → Quality gates + human approval
```

**Quality Gates for Blog Publishing:**
1. Factual accuracy (cross-reference GitLab/JIRA)
2. Privacy/security scan (no credentials, internal refs)
3. Tone validation (LLM-as-judge vs. Ryan's writing samples)
4. Completeness check (event coverage ≥80%)

## Consequences

### Positive
- **Real-time capture**: Events logged as they happen
- **Recursive context**: Each synthesis builds on previous state
- **Video integration**: Visual context enriches narrative
- **Scalable**: Kafka handles burst loads, Flink provides backpressure
- **Separation of concerns**: GPU for synthesis, CPU for video

### Negative
- **Infrastructure complexity**: Flink adds operational overhead
- **Resource requirements**: CPU-bound video processing may slow
- **State management**: Flink state requires careful checkpointing
- **Learning curve**: Flink 2.2 ML features are new

### Risks
- **Flink deployment**: May need standalone vs K3s depending on resource pressure
- **Video latency**: MiniCPM-V on CPU may lag behind real-time
- **Cost**: OTEL telemetry increases Kafka storage

## Implementation Phases

### Phase 1: OTEL → Kafka Pipeline (Week 1)
- Configure Claude Code OTEL export
- Update OTEL Collector with Kafka exporter
- Create Kafka topics
- Validate event flow

### Phase 2: Flink Event Detection (Week 2-3)
- Deploy Flink 2.2 to K3s
- Create event boundary detection job
- Output triggers to `journal.triggers`

### Phase 3: Recursive Summarizer (Week 3-4)
- Design summarization prompt
- Implement Flink → vLLM integration
- State storage in Elasticsearch

### Phase 4: Video Archive + MiniCPM-V (Week 5-6)
- Configure OBS H.265 recording
- Deploy MiniCPM-V to Ollama
- Frame extraction pipeline

### Phase 5: External Data Integration (Week 7)
- GitLab MCP tool
- JIRA MCP tool

### Phase 6: Quality Gates & Publishing (Week 8+)
- Quality gate framework
- LLM-as-judge for tone
- Human review queue

## Related
- HLD *(internal reference; not included)* - System architecture
- Services *(internal reference; not included)* - K3s service inventory
- ADR-001 *(reference outside this archive)* - Agent architecture
- [ADR-011](/adrs/011-journal-consolidator-generation-tuning/) - LLM generation tuning
- Journal Automation *(internal reference; not included)* - Existing batch system

## References
- Claude Code OTEL: https://code.claude.com/docs/en/monitoring-usage
- Flink 2.2 ML: https://flink.apache.org/2025/12/04/apache-flink-2.2.0
- MiniCPM-V: https://github.com/OpenBMB/MiniCPM-V

## Navigation
Home *(internal reference; not included)* | Architecture *(internal reference; not included)* | [ADRs](/adrs/)
