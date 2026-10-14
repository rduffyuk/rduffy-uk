---
id: 33
title: "Short-Form Video Generation Pipeline"
status: proposed
recordedStatus: "proposed"
date: 2026-02-22
tags: ["content-pipeline", "video", "voice-cloning", "tiktok"]
sourceKind: source-record
public: true
journeyId: "2026-02-22-adr-033-short-form-video-generation-pipeline"
---
# ADR-018: Short-Form Video Generation Pipeline

**Status**: Proposed
**Date**: 2026-02-22
**Author**: Ryan Duffy + Claude
**Jira**: VW-108 *(internal reference; destination redacted)*
**Related**: ADR-001 *(reference outside this archive)* (LinkedIn Content Automation), VW-8

### External Links
| Platform | Link |
|----------|------|
| Confluence | View in Confluence *(internal reference; destination redacted)* |
| Jira | VW-108 *(internal reference; destination redacted)* |

---

## Context

The Rootweaver platform produces technical content (architecture docs, SRE insights, infrastructure learnings) that could reach wider audiences via short-form video on TikTok, Instagram Reels, and YouTube Shorts.

### Current Workflow (CapCut Storyboard)

CapCut's AI storyboard feature was evaluated with the SRE Agent K3s deployment topic. Analysis of the generated video (`Storyboard 3 (1).mp4`) revealed:

| Aspect | Finding |
|--------|---------|
| **Format** | 1920x1080 16:9 with pillarbox (not native 9:16) |
| **Visuals** | AI-generated scenes — impressive but technically inaccurate |
| **Service names** | Hallucinated: "Premtheus", "Pramdhesi", "Premsion" instead of Prometheus, Loki |
| **Voice** | TTS only — locked to CapCut's voice library |
| **Music** | TikTok sound library via `bgmId` — locked to CapCut/ByteDance ecosystem |
| **Metadata** | Encoded as `vicutweb` v15.4.0, `exportType: storyboard` |
| **Filesize** | 282MB for 2:46 video (13.5 Mbps — unoptimized for mobile) |

**Key problem**: CapCut produces visually engaging but technically inaccurate content. For an SRE/platform engineering audience, hallucinated service names destroy credibility.

### Requirements

1. **Own voice** — clone Ryan's voice for authentic narration (not generic TTS)
2. **Trending TikTok sounds** — use actual trending music for reach/discoverability
3. **Accurate visuals** — real Excalidraw diagrams, Grafana panels, terminal recordings
4. **Brief-driven** — declarative YAML/JSON input, not manual editing
5. **Claude Code orchestrated** — generate videos from a single prompt
6. **Local-first** — run on MacBook M4 Pro where possible, outsource only if needed
7. **Cross-platform output** — native 9:16, optimized filesize, TikTok/Reels/Shorts

---

## Decision

Build a Claude Code-orchestrated video generation pipeline using open-source components, with the following architecture:

### Pipeline Architecture

```
Claude Code (Orchestrator)
    │
    ├─► 1. SCRIPT ────── Claude generates narration from topic/brief
    │
    ├─► 2. VOICE ─────── Voicebox (Qwen3-TTS, MLX) on MacBook M4 Pro
    │   └─ Voice profile cloned from ~10s audio sample
    │
    ├─► 3. SUBTITLES ──► Whisper (local, MPS) → word-level timestamps
    │
    ├─► 4. VISUALS ────► Real diagrams (Excalidraw, Grafana, terminal)
    │   └─ Optional: AI scene generation for abstract concepts
    │
    ├─► 5. MUSIC ──────► TikTok Creative Center trending sounds
    │   ├─ Scraped metadata (name, ID, genre, mood)
    │   └─ Audio acquired for offline rendering OR sound ID for TikTok upload
    │
    └─► 6. RENDER ─────► Remotion (TypeScript) or MoviePy (Python)
        ├─ Compose: visuals + voice + subtitles + music
        ├─ Ken Burns motion on stills
        ├─ Auto-ducking music under voice
        └─ Output: 9:16 MP4, 60fps, optimized for mobile
```

### Component Selection

#### Voice Cloning — Primary: Voicebox (Qwen3-TTS)

| Evaluated | Verdict | Rationale |
|-----------|---------|-----------|
| **Voicebox (Qwen3-TTS)** | **Selected — Primary** | MLX-native for Apple Silicon (4-5x faster), REST API for Claude Code integration, DAW timeline, Whisper built-in, clone from 3s audio |
| **Chatterbox (Resemble AI)** | **Selected — Fallback** | MPS support, MIT license, 11k stars, emotion tags `[laugh]` `[cough]`, beats ElevenLabs in blind tests, 23 languages |
| Kani-TTS-2 | Monitor | 400M params, 3GB VRAM, Apache 2.0, English-only, released 2026-02-15 — too new to evaluate fully |
| XTTS-v2 (Coqui) | Rejected | Company shut down Dec 2025, community fork only |
| Fish Audio API | Outsource fallback | #1 TTS-Arena, $9.99/mo — use only if local quality insufficient |
| ElevenLabs | Rejected | ToS grants perpetual rights over voice data; privacy concern |

#### Video Rendering — Primary: Remotion

| Evaluated | Verdict | Rationale |
|-----------|---------|-----------|
| **Remotion** | **Selected** | Official TikTok template with Whisper.cpp, TypeScript scenes, programmatic rendering, active ecosystem |
| **short-video-maker** | **Strong alternative** | Has MCP server (Claude Code native), REST API, Remotion under the hood — but TTS-only voice, no custom audio input yet |
| Revideo | Monitor | YC-backed, TypeScript, headless rendering API, `&lt;Audio/&gt;` component — strong but less TikTok-specific |
| ShortGPT | Rejected for primary | Python/MoviePy, 7.1k stars, full automation — but opinionated pipeline, harder to customise for own voice |
| MoviePy | Fallback | Python-native, fits existing stack — use if Remotion proves too complex |

#### Trending Music — TikTok Creative Center Scraping

| Source | Approach | Legal Status |
|--------|----------|-------------|
| **TikTok Commercial Music Library** | Scrape Creative Center (1,905 tracks, filterable by genre/mood/theme) | Pre-cleared for commercial use |
| **TikTok Sound ID reference** | Upload video without music, add trending sound via TikTok's upload API | Fully legal — TikTok's intended flow |
| `yt-dlp` audio extraction | Extract audio from TikTok video URLs | Grey area — fair use debatable |

**Strategy**: For TikTok-only posts, reference the sound ID during upload (no embedded audio needed). For cross-platform (Reels, Shorts), embed Commercial Music Library audio with auto-ducking.

#### Subtitles — Whisper (Local)

Word-level timestamps from Whisper drive:
- Animated word-by-word subtitle highlighting (CapCut pill style)
- Scene transition timing
- Music ducking triggers

Runs locally on M4 Pro via MPS acceleration.

### Compute Distribution

| Component | Device | Backend | Why |
|-----------|--------|---------|-----|
| Script generation | Claude Code session | Claude API | Already available |
| Voice synthesis | MacBook M4 Pro | MLX (Voicebox) | 4-5x faster than PyTorch on Apple Silicon |
| Whisper transcription | MacBook M4 Pro | MPS | Fast local transcription |
| Video rendering | MacBook M4 Pro | Remotion/FFmpeg | CPU-bound, M4 Pro handles well |
| AI image generation | Desktop RTX 4080 | CUDA (Stable Diffusion) | Only if needed for abstract scene visuals |
| TikTok sound scraping | Either device | HTTP requests | Lightweight |
| Generative B-roll (optional) | Desktop RTX 4080 OR Seedance API | CUDA (Alive) or cloud API | Abstract scenes only; fallback to static diagrams |

### Brief Format

Videos are defined declaratively:

```yaml
title: "SRE Agent K3s Deployment"
platform: tiktok
ratio: "9:16"

voiceover:
  source: clone          # "clone" (TTS in your voice) or "file" (pre-recorded)
  voice_profile: ryan    # cloned voice profile name
  script: |
    Today we're diving into how the SRE Agent
    operates within a K3s cluster...

music:
  source: trending       # "trending", "cml" (Commercial Music Library), or "file"
  mood: dynamic
  genre: electronic
  duck_volume: 0.08      # volume during voiceover

subtitles:
  style: bold-pill       # rounded rect background (CapCut style)
  font: "Inter Bold"
  highlight: word         # word-by-word highlight animation

scenes:
  - at: 0s
    visual: "./diagrams/k3s-overview.excalidraw"
    transition: fade
  - at: 12s
    visual: "./screenshots/grafana-sre-dashboard.png"
    transition: slide_left
  - at: 35s
    visual: "generate:SRE brain querying Prometheus and Loki"
    transition: zoom
  - at: 50s
    visual: "seedance:abstract neural network processing data streams"
    transition: fade
    fallback: "./diagrams/neural-net-fallback.excalidraw"  # if API unavailable
```

---

## Consequences

### Positive

- **Technical accuracy** — real diagrams and screenshots, no hallucinated service names
- **Voice authenticity** — Ryan's actual voice (cloned), not generic TTS
- **Full control** — no vendor lock-in, all components are open-source or self-hosted
- **Privacy** — voice data stays on MacBook, no cloud voice rights issues
- **Pipeline automation** — Claude Code can generate videos end-to-end from a prompt
- **Cross-platform** — same pipeline outputs for TikTok, Reels, and Shorts
- **Cost** — $0 recurring (all local), vs CapCut Pro / ElevenLabs subscriptions
- **Extends ADR-001** — LinkedIn carousel content can be repurposed into video

### Negative

- **No drag-and-drop UI** — brief-driven only (could add web UI later)
- **Initial setup effort** — Voicebox, Remotion, Whisper, scraper all need installation
- **Voice quality gap risk** — local models may not match ElevenLabs quality (mitigated by Fish Audio API fallback)
- **Music discovery** — Creative Center scraping may break if TikTok changes their page structure
- **Digital humans / avatars** — not addressed; would need D-ID/HeyGen if talking-head format wanted
- **Maintenance** — multiple open-source dependencies to keep updated

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Voice clone quality insufficient | Medium | High | Fallback to Chatterbox → Fish Audio API |
| TikTok Creative Center scraping breaks | Medium | Low | Commercial Music Library is stable; sound ID upload unaffected |
| Remotion too complex for simple videos | Low | Medium | Fallback to MoviePy (Python, simpler) |
| Apple Silicon memory pressure (Voicebox + Whisper) | Low | Medium | Sequential processing, idle model unload (per VW-107 learnings) |
| Cloud generative B-roll hallucination | High | Medium | Only use for abstract scenes; always provide `fallback:` Excalidraw diagram in brief |
| Seedance/Alive API instability | Medium | Low | Optional enhancement only; pipeline works without it; Alive local model as future replacement |

---

## Alternatives Considered

### 1. Stay with CapCut

**Rejected**. Lock-in to ByteDance ecosystem, AI-hallucinated technical visuals, no custom voice, TTS-only, privacy concerns with content rights.

### 2. Fully API-based pipeline (ElevenLabs + Suno + Runway)

**Rejected**. High monthly cost ($50+/mo), voice data privacy concerns (ElevenLabs ToS), dependent on multiple paid APIs, no local fallback.

### 3. ShortGPT as primary framework

**Rejected as primary**. Python/MoviePy stack fits existing environment, but the pipeline is opinionated toward fully-automated content (script generation → stock footage). Less suited for "bring your own voice + bring your own diagrams" workflow.

### 4. short-video-maker (fork and extend)

**Deferred**. Most interesting option long-term — already has MCP server for Claude Code integration. Currently TTS-only; forking to add custom audio input is the logical Phase 2 once the core pipeline is validated.

### 5. Seedance 2.0 / ByteDance Alive (Generative B-Roll)

**Evaluated as optional microservice** — not pipeline backbone.

**Seedance 2.0** (4.5B-param dual-branch DiT) is ByteDance's closed-source video generator that powers CapCut's storyboard feature. API-only via third-party providers (Kie.ai, FAL.ai), no local weights, $0.30-0.50/generation. Assessed against ADR requirements:

| Requirement | Seedance Alignment |
|------------|-------------------|
| Own voice | Poor — no audio input, generates silent video |
| Trending music | Poor — no audio layer |
| Accurate visuals | Poor — same hallucination risk as CapCut (it IS CapCut's backend) |
| Brief-driven | Partial — text/image prompt, not YAML brief |
| Local-first | Fail — cloud API only, no self-hosting |
| Cross-platform | Good — generates 9:16 natively |

**Verdict**: Rejected as primary. Optionally useful for abstract B-roll clips (e.g. `generate:abstract neural network visualization`) where hallucination is acceptable, but never for technical accuracy scenes.

**ByteDance Alive** (12B params, open-source on HuggingFace) is a distilled version supporting:
- Audio-reactive video generation (audio-video sync)
- Image-to-video and text-to-video
- Consumer GPU compatible (24GB VRAM; RTX 4080 at 16GB would need INT8 quantization)

**Verdict**: Monitor. Most promising local alternative for generative B-roll. When quantized weights are available, could replace Seedance API for abstract scenes — running on Desktop RTX 4080 alongside vLLM (time-shared, not concurrent).

---

## Implementation Phases

### Phase 1: Voice Pipeline (MVP)
- Install Voicebox on MacBook M4 Pro
- Record 10-second voice sample, create voice profile
- Validate voice clone quality with SRE Agent narration script
- If insufficient: test Chatterbox, then Fish Audio API

### Phase 2: Video Rendering
- Set up Remotion with TikTok template
- Implement brief YAML parser → Remotion scene graph
- Integrate Whisper for word-level subtitle timing
- Ken Burns motion on stills, transition system

### Phase 3: Music Integration
- Build TikTok Creative Center trending sounds scraper
- Implement auto-ducking (music volume drops during voiceover)
- Sound ID reference for TikTok-native uploads

### Phase 4: Claude Code Orchestration
- Wire all components into a single Claude Code workflow
- "Make me a TikTok about X" → brief → voice → visuals → render → MP4
- Optional: fork short-video-maker to add custom voice support via MCP

---

## References

- [Voicebox (Qwen3-TTS)](https://github.com/jamiepine/voicebox) — MLX voice cloning studio
- [Chatterbox](https://github.com/resemble-ai/chatterbox) — MIT, 11k stars, MPS support
- [Kani-TTS-2](https://github.com/nineninesix-ai/kani-tts) — 400M params, 3GB VRAM
- [short-video-maker](https://github.com/gyoridavid/short-video-maker) — MCP + REST video generator
- [Revideo](https://github.com/redotvideo/revideo) — YC-backed programmatic video
- [Remotion TikTok Template](https://github.com/remotion-dev/template-tiktok) — Whisper.cpp captioning
- [ShortGPT](https://github.com/RayVentura/ShortGPT) — 7.1k stars automation framework
- [TikTok Commercial Music Library](https://ads.tiktok.com/business/creativecenter/music/pc/en)
- [Fish Audio](https://fish.audio) — #1 TTS-Arena, API fallback
- [Seedance 2.0](https://www.seedance.ai/) — ByteDance 4.5B-param video generator (API-only, powers CapCut)
- [ByteDance Alive](https://huggingface.co/ByteDance/Alive) — 12B-param open-source video model (audio-video sync)
- Seedance Analysis Report *(internal reference; not included)* — Full evaluation for this ADR
