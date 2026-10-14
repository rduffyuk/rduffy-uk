---
id: 22
title: "Local LLM Hybrid Routing — From Claude Code Augmentation to Full Replacement"
status: accepted
recordedStatus: "accepted"
date: 2026-03-01
tags: ["local-llm", "cost-optimization", "claude-code", "model-routing", "apple-silicon", "hardware-upgrade", "opencode", "multi-device"]
sourceKind: source-record
public: true
journeyId: "2026-03-01-adr-022-local-llm-hybrid-routing-from-claude-code-augmentation-to-full-replacement"
---
# ADR-022: Local LLM Hybrid Routing — From Claude Code Augmentation to Full Replacement

**Status**: Accepted (Phase 1), Evolving (Phase 2-3)
**Date**: 2026-03-01
**Updated**: 2026-03-01 (Phase 2-3 findings added)
**Jira**: VW-121 *(internal reference; destination redacted)*
**Related**: VW-41 (vLLM Iris evaluation), ADR-001 (LinkedIn Content Automation Pipeline), VW-107 (MPS memory management)

## Context

Claude Code usage incurs per-token API costs via Anthropic's subscription. Analysis of typical Claude Code sessions shows:

- ~60-70% of requests are simple tool calls (file reads, grep, glob, edit) requiring minimal reasoning
- ~20-30% are moderate tasks (code generation, explanation) where a capable open model suffices
- ~10% are genuinely complex (architecture planning, multi-file debugging, deep reasoning) where Opus quality is essential

This distribution means the majority of API spend goes to tasks that don't require frontier-level intelligence.

### Driving Factors

1. **Cost**: Opus 4.6 costs $15/$75 per million input/output tokens
2. **Privacy**: Some workloads benefit from fully local inference
3. **Availability**: Local model works offline (travel, network outages)
4. **Hardware available**: MacBook M4 Pro (24GB unified memory) is underutilized
5. **Academic validation**: Multiple ICLR/EMNLP 2025 papers validate the routing approach

## Decision

Deploy a three-layer hybrid routing architecture for Claude Code on the MacBook M4 Pro:

```
Claude Code → Claude Code Router (:3456) → vllm-mlx (:8000) | Anthropic API
```

### Components

| Component | Role | Port | Technology |
|-----------|------|------|------------|
| **vllm-mlx** | MLX-native local inference server | 8000 | Python, MLX framework |
| **Claude Code Router** | Routing proxy (complexity detection) | 3456 | Node.js |
| **Smart Router** | Complexity heuristic (JS module) | — | Keyword + signal analysis |
| **Qwen3.5-27B-4bit** | Primary local model | — | MLX-community quantization |

### Model Selection: Qwen3.5-27B

Selected over alternatives based on benchmark analysis:

| Model | BFCL-V4 (Tool Calling) | SWE-bench | GPQA Diamond | Fits 24GB? |
|-------|----------------------|-----------|-------------|-----------|
| Claude Opus 4.6 | ~70 | 80.8 | 91.3 | N/A (API) |
| **Qwen3.5-27B** | **68.5** | **72.4** | **85.5** | Yes (Q3, ~16GB) |
| Qwen3.5-35B-A3B | 67.3 | 69.2 | 84.2 | Yes (Q4, ~14GB) |
| Qwen3-14B | ~50 | — | ~65 | Yes (Q4, ~10GB) |
| Mistral Small 3.1 24B | ~55 | — | ~46 | Yes (Q4, ~15GB) |

**Rationale for 27B over 35B-A3B**: Despite the MoE model being 3x faster, the dense 27B model scores higher on every quality benchmark — BFCL 68.5 vs 67.3, SWE-bench 72.4 vs 69.2, LiveCodeBench 80.7 vs 74.6, IFEval 95.0 vs 91.9. For Claude Code usage where correctness of tool calling matters more than raw speed, the 27B is the better choice.

### Routing Logic

The smart router inspects each request and routes based on complexity signals:

| Signal | Threshold | Routes To | Rationale |
|--------|-----------|-----------|-----------|
| User explicit ("use opus") | Any | Opus | User override |
| Extended thinking requested | Any | Opus | Requires frontier reasoning |
| Planning/architecture keywords | + prompt > 200 chars | Opus | High-value reasoning tasks |
| Debug/investigation keywords | + prompt > 300 chars | Opus | Root cause analysis |
| Long prompt | > 6000 chars | Opus | Complex context |
| Deep conversation | > 25 turns + > 8 tool results | Opus | Accumulated complexity |
| Multi-file references | > 5 file paths + prompt > 1K | Opus | Cross-file reasoning |
| Security/review keywords | + prompt > 500 chars | Opus | Critical analysis |
| Everything else | Default | Local | Simple tasks |

**Design principle**: Keywords alone are weak signals. Keywords + prompt length is a strong signal. This prevents false escalation for trivial tasks containing trigger words.

## Academic Validation

### Routing Effectiveness

| Paper | Venue | Key Finding |
|-------|-------|-------------|
| **RouteLLM** (Ong et al.) | ICLR 2025 | 95% GPT-4 quality with 14-26% strong model calls → **75-85% cost reduction** |
| **Cascade Routing** (de Koninck et al.) | arXiv:2410.10347 | Cascade routing achieves 13-80% relative improvement over naive baselines |
| **C3PO** | arXiv:2511.07396 | Label-free cascading with bounded probability guarantees on cost |
| **Cost-Aware Contrastive Routing** | arXiv:2508.12491 | 25% accuracy-cost tradeoff improvement, generalizes to unseen LLMs |
| **RouterEval** | EMNLP 2025 | Router can surpass best single model via model-level scaling |

### Tool Calling Quality

| Source | Finding |
|--------|---------|
| **Docker Tool Calling Study** | Qwen3-14B F1: 0.971 vs GPT-4 F1: 0.974 (0.3% gap) |
| **BFCL V4 (Berkeley)** | Qwen3.5-27B: 68.5 vs Opus: ~70 (2.1% gap on tool calling) |
| **Docker quantization study** | "No significant difference" between quantized and non-quantized for tool calling |

### Cost-Benefit

| Source | Finding |
|--------|---------|
| **arXiv:2509.18101** (54 scenarios) | Small models (24-32B) break even in 0.3-3 months vs cloud |
| **Our case** (hardware already owned) | Break-even: immediate ($0 hardware, ~$3-5/mo electricity) |

## Consequences

### Positive

1. **75-85% cost reduction** on Claude Code API spend (validated by RouteLLM, ICLR 2025)
2. **Offline capability** — Claude Code works without internet for local-routed tasks
3. **Privacy** — sensitive code never leaves the MacBook for local-routed tasks
4. **No quality loss on tool calling** — Qwen3.5-27B is 97% of Opus on BFCL-V4
5. **Prefix caching** via vllm-mlx reduces repeated prompt processing by ~94%
6. **Immediate break-even** — hardware already owned, only electricity cost
7. **Preserves full Claude Code scaffold** — tools, permissions, memory, MCP all work unchanged

### Negative

1. **Latency increase** — local model ~15-20 tok/s vs Opus API ~50+ tok/s. Each tool call round-trip ~3-8s locally vs ~1-2s on API. Complex tasks with 20+ tool calls take 2-3 minutes locally vs ~30s on API
2. **RAM pressure** — Qwen3.5-27B at Q3 uses ~16GB of 24GB unified memory. Heavy browser + local model may cause swap pressure
3. **Routing imperfection** — keyword heuristics capture ~70-80% of routing value; learned routers (RouteLLM) capture ~85-95% but require more setup
4. **Maintenance overhead** — vllm-mlx, router, and model updates need manual management
5. **MPS memory management** — requires PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.0 to prevent memory leaks (same lesson as VW-107)

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Router misroutes complex task to local | Medium | Medium | User override ("use opus"), fallback on failure |
| vllm-mlx crashes/OOM | Low | Low | launchd auto-restart, KeepAlive in plist |
| Model quality degrades on edge cases | Medium | Medium | Monitor routing stats, tune thresholds |
| vllm-mlx project abandoned | Low | Medium | Fall back to Ollama (simpler, more mature) |

## Alternatives Considered

### 1. Ollama Only (No Router)

- **Pro**: Simplest setup, most mature
- **Con**: No auto-routing, no prefix caching, 20-30% slower than MLX on Apple Silicon
- **Verdict**: Good starting point but suboptimal for the "perfect flow"

### 2. LiteLLM Proxy

- **Pro**: Enterprise-grade, cost tracking dashboard, 100+ providers
- **Con**: Heavier, more config, overkill for personal use
- **Verdict**: Better suited for team/org deployment

### 3. Manual /model Switching

- **Pro**: Zero setup, built into Claude Code
- **Con**: Cognitive load, easy to forget, no cost tracking
- **Verdict**: Viable for testing, not for daily use

### 4. Full Opus Only (Status Quo)

- **Pro**: Best quality, zero setup
- **Con**: Highest cost, no offline capability
- **Verdict**: Appropriate for critical work only

### 5. Full Local Only (No Fallback)

- **Pro**: Zero cost, full privacy
- **Con**: ~8-12 point quality gap on SWE-bench and complex reasoning
- **Verdict**: Unacceptable quality loss for architecture/debugging tasks

### 6. Learned Router (RouteLLM)

- **Pro**: 10-15% better routing accuracy than keyword heuristics
- **Con**: Requires training data, more complex setup, embedding model overhead
- **Verdict**: Future upgrade path if keyword routing proves insufficient

## Implementation

### File Structure

```
REDACTED_WORKSPACE/local-llm-setup/
├── setup.sh                    # Install/start/stop/status/claude
├── config.json                 # Router config (local + Anthropic providers)
├── smart-router.js             # Complexity detector
├── routing-dashboard.sh        # Visual routing stats
├── com.rduffy.vllm-mlx.plist   # Optional launchd service
├── logs/                       # Runtime logs
└── pids/                       # PID tracking
```

### Shell Aliases

```bash
claude-smart    # Auto-routing (local ↔ Opus)
claude-local    # Force local only
claude-opus     # Force Opus only (subscription)
llm-start       # Start vllm-mlx + router
llm-stop        # Stop all services
llm-status      # Check service health
```

### Ports

| Service | Port | Protocol |
|---------|------|----------|
| vllm-mlx | 8000 | Anthropic Messages API |
| Claude Code Router | 3456 | Anthropic Messages API (proxy) |

Note: Port 3456 conflicts with LinkedIn preview server. If both needed simultaneously, change router to 3457.

### GPU/Memory Contention

- **MacBook M4 (24GB)**: vllm-mlx gets ~16GB (model) + ~4GB (KV cache). OS/apps get ~4GB
- **Desktop RTX 4080**: NOT used for this — vLLM production RAG keeps the GPU occupied
- **PYTORCH_MPS_HIGH_WATERMARK_RATIO=0.0**: Prevents MPS over-allocation (VW-107 lesson)

## Rollout Plan

| Phase | Duration | Action |
|-------|----------|--------|
| 1. Install | Day 1 | `./setup.sh install` — install vllm-mlx, router, aliases |
| 2. Validate | Week 1 | Use `claude-local` exclusively, identify failure modes |
| 3. Route | Week 2 | Switch to `claude-smart`, monitor routing dashboard |
| 4. Tune | Week 3-4 | Adjust thresholds based on routing-stats.json data |
| 5. Steady-state | Ongoing | Review dashboard monthly, update model when new Qwen releases |

## Monitoring

- **Routing stats**: `~/.claude-code-router/routing-stats.json` (persists across sessions)
- **Dashboard**: `./routing-dashboard.sh` — visual breakdown of local vs Opus routing
- **Logs**: `REDACTED_WORKSPACE/local-llm-setup/logs/router.log` — per-request routing decisions
- **Health check**: `llm-status` — service health + memory usage

## References

### Academic Papers
- [RouteLLM (ICLR 2025)](https://arxiv.org/abs/2406.18665) — Routing framework, 75-85% cost reduction
- [Cascade Routing (ETH Zurich)](https://arxiv.org/abs/2410.10347) — Unified routing + cascading
- [C3PO](https://arxiv.org/html/2511.07396) — Label-free cascading with cost constraints
- [Cost-Aware Contrastive Routing](https://arxiv.org/html/2508.12491) — 25% accuracy-cost improvement
- [On-Premise Cost-Benefit Analysis](https://arxiv.org/abs/2509.18101) — Break-even analysis (54 scenarios)
- [RouterEval (EMNLP 2025)](https://aclanthology.org/2025.findings-emnlp.208/) — Routing benchmark

### Benchmarks
- [BFCL V4 (Berkeley)](https://gorilla.cs.berkeley.edu/leaderboard.html) — Function calling leaderboard
- [Qwen3.5-35B-A3B Model Card](https://huggingface.co/Qwen/Qwen3.5-35B-A3B) — Official benchmarks
- [Docker Tool Calling Evaluation](https://www.docker.com/blog/local-llm-tool-calling-a-practical-evaluation/)

### Tools
- [vllm-mlx](https://github.com/waybarrios/vllm-mlx) — MLX inference server
- [Claude Code Router](https://github.com/musistudio/claude-code-router) — Routing proxy
- [RouteLLM (open source)](https://github.com/lm-sys/RouteLLM) — Future upgrade path

---

## Phase 2: Experimental Findings (2026-03-01)

### What Was Tested on MacBook M4 Pro (24GB)

Extensive hands-on testing of multiple models and inference engines to validate the Phase 1 design. Results were significantly more constrained than theoretical calculations predicted.

#### Model Test Results

| Model | Size on Disk | Inference Engine | Small Prompt | Large Prompt (33K+) | Verdict |
|-------|-------------|-----------------|-------------|---------------------|---------|
| **Qwen3.5-27B Q4** | ~16GB | vllm-mlx | — | OOM during load | **FAIL**: Model + Claude Code's 67K system prompt exceeds 24GB |
| **Qwen3-Coder-30B-A3B Q4** | 17.2GB | vllm-mlx | 0.56s warm, 14s cold | OOM (`kIOGPUCommandBufferCallbackErrorOutOfMemory`) | **FAIL**: 17.2GB model + KV cache for 73K tokens exceeds 24GB |
| **Qwen3-8B Q4** | 4.3GB | vllm-mlx | Works | 6-min cold start (67K system prompt) | **MARGINAL**: Works but painfully slow on first request |
| **GLM-4.7-Flash (30B/3B active)** | 19GB | Ollama | 6s warm, 2min cold | 47s, spent all tokens thinking | **FAIL**: Never called tools — exhausted output tokens on reasoning |

#### Root Cause: Claude Code's 67K Token System Prompt

The fundamental constraint is **not the model or the hardware** — it's Claude Code's system prompt:

- Every request includes ~67K tokens (instructions, 120 tool definitions, CLAUDE.md, rules, skills, MCP schemas)
- At Q4 quantization, KV cache for 67K tokens ≈ 8-12GB for an 8B model, much more for 27-30B models
- 24GB unified memory cannot fit: model weights + 67K token KV cache + OS overhead

**Key lesson**: Theoretical memory calculations consistently underestimated actual requirements by 20-40%. Real-world Metal GPU allocation, MPS overhead, and KV cache fragmentation are not captured by `params × bits_per_param / 8`.

#### What Worked (Barely)

- **Qwen3-8B via vllm-mlx**: Functional for simple tasks after the 6-minute cold start. Prefix caching (trie-based LRU, persisted to `~/.cache/vllm-mlx/prefix_cache/`) mitigated subsequent requests to ~2-3s.
- **GLM-4.7-Flash via Ollama**: Native Anthropic Messages API (`ANTHROPIC_AUTH_TOKEN=ollama`) worked for small prompts with tool calling at 11s. Failed on large prompts.
- **Ollama v0.17.4 Anthropic API**: Confirmed working — three env vars: `ANTHROPIC_AUTH_TOKEN=ollama`, `ANTHROPIC_BASE_URL=http://localhost:11434`, `ANTHROPIC_API_KEY=""`.

#### Conclusion: 24GB Is Insufficient for Claude Code + Local LLM

The MacBook M4 Pro 24GB can run small models (8B) with Claude Code, but the experience is poor (6-min cold starts, ~15 tok/s). Models large enough for reliable tool calling (27B+) OOM with Claude Code's system prompt. **Phase 1's design is valid but requires more memory than 24GB to be practical.**

### Hardware Evaluation

Investigation into dedicated hardware for running frontier open-source models locally, with the goal of eventually replacing Claude Code entirely.

#### Options Evaluated

| Hardware | Memory | Bandwidth | Price | Frontier Model Support |
|----------|--------|-----------|-------|----------------------|
| **Mac Studio M4 Ultra 512GB** | 512GB unified | ~1,200 GB/s | **£10,099** | GLM-5 Q4 (430GB), Qwen3-Coder-480B Q4 (270GB) |
| Mac Studio M3 Ultra 512GB | 512GB unified | ~800 GB/s | ~£6,100 | Same models, ~50% slower |
| DGX Spark (×2, clustered) | 256GB (128×2) | 273 GB/s each | ~$9,400 | Limited by NIC bandwidth between nodes |
| 8× RTX 5090 build | 256GB VRAM (32×8) | 1.79 TB/s each | ~$35,000+ | No NVLink, PCIe bottleneck |

#### Real-World Mac Studio Benchmarks (Community Data)

| Model | Quantization | Hardware | Token Speed | Context |
|-------|-------------|----------|-------------|---------|
| DeepSeek V3 671B | Q4 (MLX) | M3 Ultra 512GB | 21 tok/s (short), 5.8 tok/s (16K ctx) | 466GB peak memory |
| DeepSeek R1 671B | Q4 (llama.cpp) | M3 Ultra 512GB | 6.2 tok/s | 14.8 min for 8K context |
| Qwen3-VL 235B | Full | M3 Ultra 256GB | ~30 tok/s | — |
| Gemma 3 27B | Q4_K_M | M3 Ultra | ~30 tok/s | — |
| Qwen3 32B | Q4 | M3 Ultra | 15-22 tok/s | — |

**Critical finding**: MLX is 3-4× faster than llama.cpp on Apple Silicon (21 tok/s vs 6.2 tok/s for same model).

**Critical limitation**: Generation speed degrades significantly with long context — 21 tok/s at 69 tokens drops to 5.8 tok/s at 16K tokens. Prefix caching essential for Claude Code's 67K system prompt.

#### Context Window Analysis (Mac Studio M4 Ultra 512GB)

| Model | Q4 Weights | KV Budget | FP16 Context | Q4 KV Context |
|-------|-----------|-----------|-------------|---------------|
| GLM-5 744B | ~400 GB | ~104 GB | ~42-62K tokens | ~170-248K tokens |
| DeepSeek V3 671B | ~380 GB | ~124 GB | ~50-70K tokens | ~248K tokens |
| **Qwen3-Coder-480B** | **~270 GB** | **~234 GB** | ~190K tokens | **~400K+ tokens** |

**Recommendation**: Qwen3-Coder-480B is the sweet spot — purpose-built for agentic coding, 35B active parameters (fast inference), and leaves 234GB for context (400K+ tokens with Q4 KV cache).

### Decision Evolution: Beyond Hybrid Routing

The investigation revealed that the right long-term strategy is not augmenting Claude Code with a local model — it's **replacing Claude Code entirely** with a local-first agentic platform.

**Rationale**:
1. Claude Code's 67K system prompt is the bottleneck, not the model or hardware
2. Alternative frameworks (OpenCode, Aider) use ~5-10K system prompt for the same capabilities
3. Rootweaver platform already provides 70% of Claude Code's value (RAG, knowledge graphs, SRE, monitoring, Jira/Confluence)
4. The remaining 30% (agentic coding loop + reasoning) is solved by OpenCode + Qwen3-Coder-480B

---

## Phase 3: Full Replacement Architecture (Future — Post-Hardware)

### What Claude Code Provides vs What Rootweaver Already Has

| Capability | Claude Code | Rootweaver Platform | Gap? |
|-----------|------------|-------------------|------|
| Semantic search | File-level grep/glob only | Qdrant 35K docs, hybrid BM25+vector, 73% semantic cache | **Rootweaver superior** |
| Knowledge graph | None | FalkorDB 6K nodes, 8K edges, impact analysis | **Rootweaver superior** |
| Multi-agent routing | None (single model) | UnifiedRouter with 6 agents, complexity scoring | **Rootweaver superior** |
| Workflow orchestration | None | Prefect, 7 deployments, priority queues | **Rootweaver superior** |
| SRE automation | None | SRE Brain + Event Collector, autonomous triage | **Rootweaver superior** |
| Code intelligence | None | PDG Builder, AST analysis, D3.js visualization | **Rootweaver superior** |
| File read/edit/write | Built-in | **Gap** — needs agentic framework | Build/Adopt |
| Terminal execution | Built-in | **Gap** — needs agentic framework | Build/Adopt |
| Git operations | Built-in | **Gap** — needs agentic framework | Build/Adopt |
| Agentic coding loop | Built-in | **Gap** — needs agentic framework | Build/Adopt |
| Frontier reasoning | Opus 4.6 | **Gap** — ~80% covered by Qwen3-Coder-480B | Partial gap |
| Multi-device access | None (single machine) | Tailscale mesh, SSH multiplexing | **Rootweaver superior** |

### Target Architecture: Unified Multi-Hardware Agent Platform

```
MacBook M4 Pro (Development)
├── OpenCode CLI (agentic coding framework)
├── VS Code + Cline
├── File editing, git, terminal
│
├── Tailscale mesh (<10ms) ──────────────────┐
│                                             │
Mac Studio M4 Ultra 512GB (Inference)    Desktop RTX 4080 (Infrastructure)
├── Ollama                                ├── K3s cluster (22 namespaces, 90+ pods)
│   ├── Qwen3-Coder-480B Q4 (complex)    ├── MCP Bridge (:30002, 18 tools)
│   ├── Qwen3-Coder-8B Q4 (simple)       ├── Qdrant (35K docs)
│   └── Embedding model                   ├── FalkorDB (6K nodes)
├── MCP Gateway (multi-device aggregator) ├── Prefect (7 deployments)
├── Smart model router                    ├── SRE Brain + Event Collector
└── Agent memory (Qdrant collection)      ├── Prometheus/Grafana/Loki/Tempo
                                          ├── vLLM (Qwen3-14B-AWQ, SRE/RAG)
                                          └── All existing services
```

### Agent Architecture: Three-Tier Multi-Model

**Tier 1 — Coding agents** (OpenCode, adopted):
- Builder (480B): Full file access, edit, test
- Researcher (8B): Read-only, vault search via MCP
- Tester (8B): Run tests, validate deployments
- Deployer (480B): GitOps, FluxCD, K3s

**Tier 2 — RAG agents** (existing, via MCP):
- FastSearchAgent (6.6ms P50)
- DeepResearchAgent (3.2s P50)
- OracleAgent (15-30s, vLLM)
- GraphSearchAgent (FalkorDB)
- CodeAgent (code generation)

**Tier 3 — Infrastructure agents** (to build):
- SRE agent (Prometheus, Loki, K3s)
- Device management (Tailscale, Syncthing)
- Remote execution (SSH-based `run_on(device, command)`)

### Key Advantages Over Claude Code

| Capability | Claude Code | This Architecture |
|-----------|------------|-------------------|
| Models per agent | Single (Opus) | **Multiple** (8B fast + 480B complex) |
| Agent communication | Leader-centric | **Peer-to-peer** (OpenCode) |
| Multi-device | Single machine | **3 devices via Tailscale + MCP** |
| Infrastructure access | None | **Full K3s, Prometheus, Loki, GitOps** |
| System prompt overhead | 67K tokens | **~5-10K tokens** (13× reduction) |
| Context window | ~200K | **400K+** tokens |
| Cost per month | £200+ | **£0** (after hardware) |
| Rate limiting | API throttling | **None** |

### Build Effort Estimate

| Component | Effort | Status |
|-----------|--------|--------|
| MCP Gateway (multi-device) | 2-3 days | Planned |
| Remote execution tools | 1 day | Planned |
| Device topology config | 0.5 days | Planned |
| Smart multi-model router | 1 day | Adapt from smart-router.js |
| Agent memory (Qdrant) | 1-2 days | Planned |
| OpenCode integration | 1-2 days | Planned |
| Skills migration (~50 skills) | 3-5 days | Planned |
| Project rules migration | 1 day | Planned |
| **Total** | **~2-3 weeks** | After hardware arrives |

### Hardware Decision

**Selected**: Mac Studio M4 Ultra, 512GB unified memory, 2TB SSD — £10,099

**Justification**:
- Runs Qwen3-Coder-480B Q4 (270GB) with 234GB for context (400K+ tokens)
- Runs GLM-5 Q4 (430GB) if needed for non-coding frontier tasks
- 1,200 GB/s bandwidth → ~25-30 tok/s on 480B, ~40 tok/s on 8B
- Future-proof: hardware appreciates as models get more efficient
- Break-even vs Claude subscription: ~4 years (less factoring capability gains)
- 3nm M4 Ultra: better power efficiency than M3 Ultra

### Open Source Model Comparison (Current — March 2026)

| Model | Total / Active | SWE-bench Verified | Context | Best For |
|-------|---------------|-------------------|---------|----------|
| **Qwen3-Coder-480B** | 480B / 35B | 70.6% | 256K (1M ext.) | Agentic coding, repo-scale |
| GLM-4.7 | — | 74.2% | 128K | Reasoning + code |
| Kimi-Dev-72B | 72B dense | 76.8% | 256K | SWE-bench champion |
| DeepSeek-V3.2 | 671B / 37B | 70.2% | 128K | Deep reasoning + tools |
| Qwen3-Coder-Next | Smaller MoE | 70.6% | 256K | Local-friendly, ultra-sparse |

### Framework Comparison

| Framework | System Prompt | Local Model | Agent Teams | MCP |
|-----------|-------------|------------|------------|-----|
| **Claude Code** | ~67K tokens | Limited | Yes (leader-centric) | Yes |
| **OpenCode** | ~5-10K tokens | 75+ providers | Yes (peer-to-peer) | Yes |
| **Aider** | ~3-5K tokens | Any OpenAI-compatible | No | No |
| **Cline** | ~5-8K tokens | Any model | No | Yes |

**Selected**: OpenCode — closest to Claude Code experience, open source, MCP-native, multi-model agent teams, peer-to-peer communication.

---

## Appendix: What Can Be Deployed NOW (While Still Using Claude Code)

See Phase 2.5 section below for immediate improvements that enhance the current Claude Code workflow using existing infrastructure.

### Immediate Deployments (No New Hardware)

1. **Ollama on MacBook for simple routing** — Qwen3-8B via Ollama with Anthropic Messages API for simple tasks, Opus for complex
2. **MCP tool expansion** — Add `run_on(device, command)` tool to existing MCP bridge for cross-device execution from Claude Code
3. **Agent memory collection** — New Qdrant collection for persistent agent context across Claude Code sessions
4. **Smart router improvements** — Deploy learned router (RouteLLM) to replace keyword heuristics, improving routing accuracy from 70-80% to 85-95%

### References (Phase 2-3)

- [OpenCode CLI](https://opencode.ai/) — Open-source agentic coding framework
- [OpenCode Agent Teams Architecture](https://dev.to/uenyioha/porting-claude-codes-agent-teams-to-opencode-4hol) — Agent spawning deep dive
- [Qwen3-Coder GitHub](https://github.com/QwenLM/Qwen3-Coder) — 480B/35B active, agentic coding
- [Mac Studio M3 Ultra 512GB LLM Benchmarks](https://www.hardware-corner.net/studio-m3-ultra-running-deepseek-v3/) — Real-world performance data
- [HN: Mac Studio for Local AI/LLM](https://news.ycombinator.com/item?id=46907001) — Community experiences
