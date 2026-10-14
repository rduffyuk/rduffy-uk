---
id: 19
title: "Claude Voice Agent Architecture — VoiceAssistant-Eval Benchmarking & Prompt Repetition Optimization"
status: proposed
recordedStatus: "proposed"
date: 2026-02-22
tags: ["voice-agent", "claude-api", "asr", "tts", "prompt-repetition", "benchmarking"]
sourceKind: source-record
public: true
journeyId: "2026-02-22-adr-019-claude-voice-agent-architecture-voiceassistant-eval-benchmarking-prompt-repetition-optimization"
---
# ADR-019: Claude Voice Agent Architecture — VoiceAssistant-Eval Benchmarking & Prompt Repetition Optimization

**Status**: Proposed
**Date**: 2026-02-22
**Author**: Ryan Duffy + Claude
**Jira**: VW-109
**Related**: ADR-015 (Matrix Accessibility Layer), VW-14 (Journal voice tuning), ADR-001 (LinkedIn Content Automation)

### External Links
| Platform | Link |
|----------|------|
| 📄 Confluence | View in Confluence *(internal reference; destination redacted)* |
| 🎫 Jira | VW-109 *(internal reference; destination redacted)* |

---

## Context

The Rootweaver platform currently interacts with users exclusively through text interfaces — Claude Code CLI and Claude.ai via Cloudflare tunnel. ADR-015 proposed a Matrix Accessibility Layer for mobile/voice access. This ADR builds on that vision by defining the architecture for a **Claude-based voice agent** that can:

1. Accept spoken input from users (web, mobile, or desktop)
2. Process it through Claude for reasoning and tool use
3. Return spoken responses via text-to-speech

Two recent research findings directly inform this architecture:

### Research Input 1: VoiceAssistant-Eval Benchmark

**Source**: MathLLMs/VoiceAssistant-Eval (Hugging Face dataset, arXiv:2509.22651)

A comprehensive evaluation benchmark for voice assistant pipelines with splits covering:
- **Listening**: speech recognition accuracy, noise robustness, accent handling
- **Speaking**: multi-round conversation, emotional expression, safety, roleplay
- **Viewing**: multi-discipline screen-sharing workflows

This provides a standardized way to benchmark our ASR → Claude → TTS pipeline against published scores and identify weak spots.

### Research Input 2: Prompt Repetition Technique

**Source**: "Prompt Repetition Improves Non-Reasoning LLMs" (arXiv:2512.14982) — Leviathan, Kalman, Matias (Google)

Key findings:
- Simply duplicating the user prompt (`&lt;QUERY&gt;&lt;QUERY&gt;`) improves accuracy across all tested models in non-reasoning settings
- 47 of 70 model-benchmark pairs show statistically significant improvement, with **0 losses**
- No increase in output tokens or latency (extra tokens are in parallelizable prefill phase)
- Gains are largest on position-sensitive tasks (options-first MCQ, index retrieval)
- Mechanistic explanation: duplication densifies attention connectivity so every token can attend to every other token at least once

**Relevance to voice**: Voice agents prioritize low-latency direct answers (no chain-of-thought), making this technique directly applicable — accuracy boost without latency penalty.

---

## Decision

### Architecture: Speech → Claude → Speech Loop

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
│  User Mic   │────▶│  ASR Engine  │────▶│  Claude Messages │────▶│  TTS Engine  │────▶ Speaker
│  (Audio In) │     │  (Speech→Text)│    │  API + Tools     │     │  (Text→Speech)│
└─────────────┘     └─────────────┘     └─────────────────┘     └─────────────┘
                         │                      │                       │
                    Whisper v3 /            Prompt repetition      XTTS v2 /
                    Faster-Whisper          applied here           Piper / Coqui
                                                │
                                          ┌─────┴──────┐
                                          │ Tool Calls  │
                                          │ (MCP Bridge)│
                                          └────────────┘
```

### Component Selection

| Layer | Primary Choice | Alternative | Rationale |
|-------|---------------|-------------|-----------|
| **ASR** | Faster-Whisper (large-v3) on GPU | Whisper.cpp on MacBook (MPS) | Best open-source accuracy; GPU-accelerated on Desktop, MPS fallback on MacBook |
| **LLM** | Claude API (Messages API) | Local vLLM (DeepSeek) for fallback | Claude for quality + tool use; vLLM fallback for offline/cost scenarios |
| **TTS** | XTTS v2 (Coqui) | Piper (lightweight) | XTTS: voice cloning, emotional control. Piper: low-latency fallback |
| **Eval** | VoiceAssistant-Eval | Custom personal test suite | Standardized benchmarking + personalized regression tests |

### Prompt Repetition Integration

Apply prompt repetition at the Claude inference layer:

```python
def prepare_voice_message(asr_text: str) -> list[dict]:
    """Apply prompt repetition for non-reasoning voice responses."""
    # Duplicate the transcribed query for attention connectivity boost
    repeated_query = f"{asr_text}\n\n{asr_text}"

    return [
        {"role": "system", "content": VOICE_SYSTEM_PROMPT},
        {"role": "user", "content": repeated_query}
    ]
```

**When to apply**:
- Direct Q&A responses (no tool use) — always apply
- Tool-calling flows — apply only to the initial intent classification, not tool result processing
- Multi-turn conversations — apply to the latest user turn only

**When NOT to apply**:
- Extended reasoning tasks (use chain-of-thought instead)
- Very long transcriptions (>2000 tokens) where prefill cost becomes significant
- Streaming responses where the user expects immediate partial output

### Evaluation Strategy

**Phase 1: Benchmark baseline**
```python
from datasets import load_dataset

# Load targeted splits
ds_multi = load_dataset("MathLLMs/VoiceAssistant-Eval", "speaking_multi_round")["test"]
ds_safety = load_dataset("MathLLMs/VoiceAssistant-Eval", "speaking_safety")["test"]
ds_robust = load_dataset("MathLLMs/VoiceAssistant-Eval", "listening_robustness")["test"]
```

Run each sample through: ASR → Claude (with/without prompt repetition) → score against reference.

**Phase 2: Personal test suite**
- Record Ryan's own voice samples in same format as VoiceAssistant-Eval
- Include platform-specific queries ("What's the status of the RAG gateway?", "Search my vault for Kafka patterns")
- Test tool-calling accuracy (MCP bridge integration via voice)

**Phase 3: Regression CI**
- Run both suites after any ASR/TTS model change, prompt update, or Claude API version bump
- Track per-split scores: content accuracy, speech quality (MOS), latency (P50/P99)

### Scoring Method

| Dimension | Metric | Tool |
|-----------|--------|------|
| Listening accuracy | WER (Word Error Rate) | jiwer library |
| Content correctness | LLM-as-judge (semantic match) | Small model scores response vs reference |
| Speech quality | UTMOS / PESQ | MOS predictor models |
| Latency | Time-to-first-byte, total E2E | Custom instrumentation |
| Safety | Pass/fail on safety split | Binary per-item scoring |

---

## Deployment Considerations

### GPU Budget

| Component | Device | VRAM/RAM |
|-----------|--------|----------|
| Faster-Whisper large-v3 | Desktop GPU | ~3GB VRAM (alongside vLLM — must verify fit) |
| XTTS v2 | Desktop GPU | ~2GB VRAM |
| vLLM (existing) | Desktop GPU | ~15GB VRAM |
| **Total GPU** | | **~20GB** — exceeds RTX 4080 16GB |

**Constraint**: Cannot run all three on Desktop GPU simultaneously with vLLM. Options:
1. **Split across devices**: ASR on MacBook (MPS), TTS on MacBook, Claude via API (no local GPU needed)
2. **Time-slice**: Unload vLLM during voice sessions (unacceptable for platform availability)
3. **Use smaller models**: Whisper medium + Piper (CPU) — fits but lower quality
4. **Dedicated inference**: Add second GPU or use cloud ASR/TTS

**Recommended**: Option 1 — MacBook handles ASR+TTS (Apple MPS), Claude via API, Desktop keeps vLLM exclusive. Aligns with multi-device strategy.

### K3s Integration

- Voice agent runs as a K3s deployment in `rootweaver` namespace
- WebSocket endpoint for real-time audio streaming
- Connects to MCP bridge (port 30002) for tool use
- NodePort allocation needed (suggest 30820 — check availability)

---

## Consequences

### Positive
- Hands-free interaction with the platform (accessibility win)
- Prompt repetition gives accuracy boost at zero latency cost for voice use cases
- VoiceAssistant-Eval provides standardized, reproducible benchmarking
- Multi-device split leverages both machines effectively
- Foundation for Matrix voice rooms (ADR-015 synergy)

### Negative
- Additional infrastructure complexity (ASR + TTS services)
- MacBook becomes a dependency for voice pipeline (Tailscale must be reliable)
- Prompt repetition doubles input tokens = doubled API cost for Claude calls
- Voice quality limited by open-source TTS (vs commercial providers)
- MPS memory management required (see VW-107 learnings on idle model unloading)

### Risks
- GPU contention if voice components accidentally scheduled on Desktop
- Latency budget: ASR (~200ms) + Claude API (~500ms) + TTS (~300ms) = ~1s E2E — acceptable but tight
- Prompt repetition untested with Claude's tool-use mode specifically

---

## Alternatives Considered

### 1. Fully hosted pipeline (e.g., Deepgram ASR + ElevenLabs TTS)
- **Pro**: Best quality, lowest maintenance
- **Con**: Ongoing cost, data leaves local network, vendor lock-in
- **Verdict**: Rejected for now — privacy preference + learning value of self-hosted

### 2. Claude's native voice mode (if/when available)
- **Pro**: Single API call, optimized E2E
- **Con**: Not yet available for API users; no control over ASR/TTS selection
- **Verdict**: Monitor Anthropic roadmap; adopt when available as primary, keep self-hosted as fallback

### 3. Local LLM only (vLLM/Ollama instead of Claude API)
- **Pro**: Zero API cost, fully offline
- **Con**: Significantly worse tool-use capability, no MCP integration, weaker reasoning
- **Verdict**: Keep as offline fallback mode only

### 4. Skip prompt repetition, use chain-of-thought instead
- **Pro**: Well-understood technique, higher ceiling on complex tasks
- **Con**: Adds latency (generated tokens), verbose output unsuitable for TTS
- **Verdict**: Use CoT for complex queries only; prompt repetition is default for direct answers

---

## Implementation Phases

| Phase | Scope | Effort |
|-------|-------|--------|
| **Phase 1** | ASR (Faster-Whisper on MacBook) + Claude API + basic TTS (Piper) | 1 week |
| **Phase 2** | VoiceAssistant-Eval benchmarking harness | 3 days |
| **Phase 3** | Prompt repetition A/B testing (with vs without, per split) | 2 days |
| **Phase 4** | XTTS v2 upgrade + voice cloning + emotion conditioning | 1 week |
| **Phase 5** | K3s deployment + WebSocket streaming + MCP tool integration | 1 week |
| **Phase 6** | Matrix voice room integration (ADR-015) | TBD |

---

## References

- [VoiceAssistant-Eval dataset](https://huggingface.co/datasets/MathLLMs/VoiceAssistant-Eval) — MathLLMs
- [VoiceAssistant-Eval paper](https://arxiv.org/abs/2509.22651) — arXiv
- [Prompt Repetition Improves Non-Reasoning LLMs](https://arxiv.org/abs/2512.14982) — Leviathan et al.
- ADR-015: Matrix Accessibility Layer Architecture
- VW-14: Journal synthesis voice tuning
- VW-107: Apple MPS memory management learnings

---
*Source: Confluence (VW/Architecture/ADRs/ADR-019)*
