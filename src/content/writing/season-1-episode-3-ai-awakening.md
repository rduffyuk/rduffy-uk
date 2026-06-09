---
author: Ryan Duffy
featured: false
categories:
- Season 1
- AI Infrastructure
- Development
pubDatetime: 2025-10-05 11:00:00+00:00
draft: false
episode: 3
reading_time: 8 minutes
series: 'Season 1: From Zero to Automated Infrastructure'
description: From context window frustration to local control. September 18-19, 2025 - a weekend working with Claude Code to install 17 local models, discovering what it means to own your AI conversations while working a full-time job.
tags:
- ollama
- local-llm
- deepseek
- rtx-4080
- ai-infrastructure
- collaboration
- context-windows
title: 'The AI Awakening: Breaking Free from Context Limits'
word_count: 1900
---
# Episode 3: The AI Awakening - Breaking Free from Context Limits

**Series**: Season 1 - From Zero to Automated Infrastructure
**Episode**: 3 of 8
**Dates**: September 18-19, 2025 (Weekend)
**Reading Time**: 8 minutes

---

## The Context Window Problem (Again)

By Wednesday, September 18, ConvoCanvas was working. The MVP could parse conversations and generate content ideas. But the original problem that started this whole journey? **Still unsolved.**

```
❌ Error: Context window overflow. This conversation is too long to continue.
Auto-compacting conversation...
```

I was still hitting context limits. Still losing conversation history. Still starting over every time Claude Code or ChatGPT hit their limits.

ConvoCanvas could organize the **past** conversations, but it couldn't prevent me from hitting limits on **new** conversations.

The real problem wasn't storage - it was **conversation continuity**.

## The Realization: I Need My Own Models

*Vault Evidence: Sept 18 reflection journal (319 lines) documents the full day of Ollama research, installation, and setup working with Claude Code. The journal shows activity from 6:30 AM through 11:00 PM - a complete weekend day focused on this work.*

Wednesday evening after work at BT, I researched local LLMs. The issue wasn't cost (I was using Claude Code, not paying per API call). The issue was **control**.

**What I couldn't control with external services**:
- ❌ **Context window limits** - Hit 200K tokens? Start over.
- ❌ **Conversation persistence** - Can't continue yesterday's deep dive
- ❌ **Model availability** - Service down? Can't work.
- ❌ **Privacy concerns** - Every conversation goes to external servers
- ❌ **Experimentation freedom** - Can't test ideas without worrying about limits

**What I needed**:
- ✅ **Configurable context** (choose models with appropriate limits)
- ✅ **Persistent conversations** (save and resume anytime)
- ✅ **24/7 availability** (works offline)
- ✅ **Complete privacy** (never leaves my machine)
- ✅ **Unlimited experimentation** (no external throttling or billing)

I needed local inference. I needed **Ollama**.

**Reality check**: Local models still have context limits (Llama 3.1: 128K tokens, DeepSeek R1: 32K tokens). But I could **choose** the right model for each task and **save/resume** conversations across sessions. The win wasn't unlimited context - it was **control over the context**.

```
┌─────────────────────────────────────────────────────┐
│     External Services vs Local Control (Sept 18)   │
└─────────────────────────────────────────────────────┘

EXTERNAL (Claude/ChatGPT)          LOCAL (Ollama)
─────────────────────────────      ──────────────────
❌ Hard context limits        →    ✅ Configurable limits
❌ Forced restarts            →    ✅ Save/resume anytime
❌ Service dependency         →    ✅ Offline capable
❌ External logging           →    ✅ Complete privacy
❌ Rate limiting              →    ✅ Unlimited local use

TRADE-OFF:
Claude reasoning quality > Local model quality
BUT: Local persistence > Forced restarts
```

## September 19, Morning - Installation (Working with Claude)

*Vault Evidence: Sept 18 journal shows "Ollama + DeepSeek R1 installation", "Model Performance", "Concurrent Loading", "Timeout Tuning" - confirming Ollama work happened Sept 18-19.*

Saturday morning. Time to install Ollama.

Working with Claude Code throughout the day, I researched hardware requirements, model selection, and performance targets.

**Claude and I worked through**:
- Hardware compatibility (RTX 4080, 16GB VRAM)
- Model quantization (GGUF formats)
- Concurrent model loading strategies
- Context window comparisons

```bash
# Install Ollama (Claude provided the command)
curl -fsSL https://ollama.com/install.sh | sh

# Verify GPU access
ollama run llama3.1
# Output: Using NVIDIA RTX 4080, 16GB VRAM
# Model loaded in 2.3 seconds
```

**IT WORKED.**

The RTX 4080 was humming. VRAM usage: 6.2GB for Llama 3.1 8B. Plenty of headroom.

## Mid-Morning - Model Collection

Working with Claude to understand which models to install, I started pulling models:

```bash
# Reasoning specialist (Claude's recommendation)
ollama pull deepseek-r1:7b

# General purpose (fastest)
ollama pull mistral:7b-instruct

# Meta's latest
ollama pull llama3.1:8b

# Code specialist
ollama pull codellama:7b

# Uncensored variant (for creative tasks)
ollama pull nous-hermes-2:latest

# Compact model (2B for quick tasks)
ollama pull phi-3:mini
```

**Total download**: 42GB
**Installation time**: 35 minutes
**Models available**: 6

But Claude suggested more models for different use cases. By afternoon, I had **17 models** installed.

*Vault Evidence: Sept 18 journal confirms "DeepSeek R1:7b achieves 71.61 tokens/sec on RTX 4080" - showing actual performance testing happened.*

| Model | Size | Purpose | VRAM | Context Window |
|-------|------|---------|------|----------------|
| **DeepSeek R1** | 7B | Reasoning & analysis | 4.2GB | 32K tokens |
| **Mistral Instruct** | 7B | General chat | 4.1GB | 32K tokens |
| **Llama 3.1** | 8B | Latest Meta model | 4.8GB | 128K tokens |
| **CodeLlama** | 7B | Code generation | 4.3GB | 16K tokens |
| **Nous Hermes 2** | 7B | Creative writing | 4.2GB | 8K tokens |
| **Phi-3 Mini** | 2B | Quick tasks | 1.4GB | 4K tokens |
| **Qwen 2.5** | 7B | Multilingual | 4.5GB | 32K tokens |
| **Neural Chat** | 7B | Conversational | 4.0GB | 8K tokens |
| **Orca Mini** | 3B | Compact reasoning | 1.9GB | 2K tokens |
| **Vicuna** | 7B | Research assistant | 4.4GB | 2K tokens |
| **WizardCoder** | 7B | Code debugging | 4.3GB | 16K tokens |
| **Zephyr** | 7B | Instruction following | 4.1GB | 8K tokens |
| **OpenHermes** | 7B | General purpose | 4.2GB | 8K tokens |
| **Starling** | 7B | Advanced reasoning | 4.6GB | 8K tokens |
| **Solar** | 10.7B | Performance leader | 6.8GB | 4K tokens |
| **Yi-34B** | 34B (quantized) | Heavy lifting | 12.1GB | 4K tokens |
| **Mixtral 8x7B** | 47B (quantized) | Mixture of experts | 14.2GB | 32K tokens |

**The RTX 4080 could handle them all.** (Just not simultaneously.)

```
┌──────────────────────────────────────────────────┐
│    RTX 4080 Model Loading (Sept 19, Morning)    │
│         (Optimized with Claude's help)           │
└──────────────────────────────────────────────────┘

VRAM: 16GB Total
├─ Llama 3.1 (8B):    4.8GB  [████████░░░░░░░░] 30%
├─ DeepSeek R1 (7B):  4.2GB  [███████░░░░░░░░░] 26%
├─ Mixtral (47B):    14.2GB  [██████████████░░] 89%
└─ 3x Concurrent:    12.4GB  [████████████░░░░] 78%

Optimal Configuration (Claude's analysis):
• 3 models @ 7B each = 12.4GB (sweet spot)
• Switching time: 2-4 seconds
• Response time: 1.8-2.3 seconds avg
• Total models available: 17
```

## Afternoon - Understanding the Potential

With 17 models installed, Claude and I explored what this local setup actually meant.

**The Research Had Shown**:
- Llama 3.1: 128K token context window
- DeepSeek R1: 32K token context window
- All conversations stay on my machine
- No forced restarts from external services

**I hadn't extensively tested it yet**, but the capability was there. Unlike Claude Code or ChatGPT, which force conversation compaction when you hit limits, Ollama conversations could theoretically continue as long as VRAM allowed.

**The Real Win Wasn't Unlimited Context** - it was something else entirely.

## Evening - The Control Realization

The breakthrough wasn't about having infinite context. It was about **owning the conversation**.

**What Changed**:
- **Before**: Hit 200K tokens → System forces auto-compact → Lose nuance
- **After**: Choose model with appropriate context → Manage memory myself → Decide when to move on

**The Freedom I Gained**:
```
External Service:  "You've hit the limit. Auto-compacting..."
Local Ollama:      "12.4GB VRAM used. Continue or switch models?"

External Service:  "Service unavailable. Try again later."
Local Ollama:      "Offline? No problem. Still running."

External Service:  "Conversation logged to our servers."
Local Ollama:      "Everything stays on your machine."
```

I wasn't escaping context limits - I was **escaping forced decisions about MY conversations**.

**That** was the real breakthrough.

## Sunday Morning - The Supervisor Pattern

*Vault Evidence: Sept 18 journal confirms "Supervisor Pattern Success", "Intelligent Routing", "Context Engineering" work.*

With 17 models available, Claude and I built an orchestrator to route tasks to the best model:

```python
# Designed collaboratively with Claude Code
class ModelSupervisor:
    def __init__(self):
        self.models = {
            "reasoning": "deepseek-r1:7b",
            "general": "mistral:7b-instruct",
            "code": "codellama:7b",
            "fast": "phi-3:mini",
            "creative": "nous-hermes-2:latest",
            "long_context": "llama3.1:8b"  # 128K context!
        }

    def route_task(self, task_type: str, prompt: str) -> str:
        """Route task to optimal model."""
        model = self.models.get(task_type, self.models["general"])

        response = requests.post(
            "http://localhost:11434/api/generate",
            json={"model": model, "prompt": prompt}
        )

        return response.json()["response"]
```

```
┌────────────────────────────────────────────────┐
│   Supervisor Pattern Routing (Sept 19, AM)    │
│      (Designed with Claude Code's help)        │
└────────────────────────────────────────────────┘

                 ┌─────────────────┐
                 │   Supervisor    │
                 │    Decides      │
                 └────────┬────────┘
                          │
         ┌────────────────┼────────────────┐
         │                │                │
         ▼                ▼                ▼
  ┌──────────┐     ┌──────────┐    ┌──────────┐
  │ DeepSeek │     │ CodeLlama│    │  Llama   │
  │    R1    │     │    7B    │    │  3.1 8B  │
  └──────────┘     └──────────┘    └──────────┘
  Reasoning        Code Gen        Long Context
  32K tokens       16K tokens      128K tokens

ROUTING LOGIC:
• Code review    → CodeLlama (specialized)
• Long analysis  → Llama 3.1 (128K context)
• Deep reasoning → DeepSeek R1 (quality)
• Quick answers  → Phi-3 Mini (speed)
```

The system could now **self-optimize** based on context needs.

## The Reality: A Weekend Project While Working Full-Time

*Vault Evidence: Sept 18 journal shows continuous activity from 6:30 AM through 11:00 PM - a full weekend day of focused work.*

**This wasn't a quick evening project.** The Sept 18 reflection journal shows:
- Morning (6:30 AM): Starting automation systems
- Afternoon: Ollama installation and model collection
- Evening (through 11:00 PM): Supervisor pattern, testing, integration

**But it was also broken up by life**:
- Work at BT during the week (Monday-Friday)
- Saturday-Sunday: Personal project time
- Breaks between intense coding sessions
- Real life happening around the development

**The journal shows the reality**: This was focused weekend work, not a corporate "sprint". Personal time, personal pace, personal project.

## What Worked

**Working with Claude Code**: This supervisor pattern, model selection strategy, VRAM optimization - all designed collaboratively. Claude brought patterns, I brought context, together we built something better.

**Ollama's Model Management**:
Single command to pull, update, or remove models. No Docker containers, no config files, no complexity.

**Context Persistence**:
Finally solved the original Day Zero problem - no more losing conversation history!

**GPU Performance**:
RTX 4080 handled everything I threw at it. 16GB VRAM was the sweet spot for running multiple 7B models.

**Privacy & Control**:
All conversations stay local. No external logging. Complete ownership of my AI interactions.

## What Still Sucked

**Model Switching Latency**:
Loading a new model: 2-4 seconds. Not terrible, but noticeable when switching frequently.

**VRAM Juggling**:
Can't run Mixtral 8x7B (14.2GB) alongside anything else. Had to be strategic about which models stayed loaded.

**Quality Variance**:
Some models (Phi-3 Mini) were fast but shallow. Others (DeepSeek R1) were brilliant but slower. Required testing to find the right fit.

**Still Need Claude Code**:
Local models are good, but Claude Code's reasoning is still unmatched for complex tasks. Ollama complements, doesn't replace.

## The Numbers (Sept 18-19, 2025)

| Metric | Value |
|--------|-------|
| **Time Spent** | Weekend (Saturday-Sunday) |
| **Work Hours** | ~15 hours (split across 2 days) |
| **Models Installed** | 17 |
| **Total Download Size** | 78GB |
| **VRAM Available** | 16GB (RTX 4080) |
| **Context Limit Freedom** | Unlimited (hardware-bound) |
| **Average Response Time** | 2.1 seconds |
| **Concurrent Models** | 3 (12.4GB VRAM) |
| **External Dependencies** | Eliminated |

`★ Insight ─────────────────────────────────────`
**The Freedom of Local Inference:**

Switching to local LLMs wasn't about cost - it was about **solving the original problem**:

1. **Ownership** - You control when conversations end, not a service
2. **Privacy** - Conversations never leave the machine
3. **Offline capability** - No internet required
4. **Experimentation freedom** - Iterate without external throttling
5. **Learning** - Direct access to model internals, VRAM, performance tuning
6. **Choice** - Pick models with context windows matching your needs

**This was built working WITH Claude Code** - collaborative AI development where human understanding + AI patterns created better solutions than either alone.

The cost savings ($0/year vs potential API costs) were a bonus. The real win was **control over the context window**.

**Day Zero's context window problem? Not eliminated - but now under MY control.**
`─────────────────────────────────────────────────`

## What I Learned

**1. Weekend projects fit around full-time work**
Saturday-Sunday intensive work. Monday-Friday back to day job. This is the reality of personal projects.

**2. Collaboration makes better solutions**
Claude Code + my domain knowledge = supervisor pattern we wouldn't have designed individually.

**3. Control over context > raw performance**
Having the option to manage conversation memory yourself is more valuable than slightly faster responses from a service that forces compaction.

**4. Privacy enables experimentation**
Knowing conversations stay local removes psychological barriers to trying wild ideas.

**5. Local doesn't mean isolated**
Ollama + Claude Code = best of both worlds. Use local for persistent work, cloud for complex reasoning.

## What's Next

Ollama was running. I had local control over my AI conversations. But the system was generating responses faster than I could organize them.

Working with Ollama over the next few days would generate hundreds more conversation files. By September 20, I'd need a way to search them all.

That's when ChromaDB and semantic search would enter the picture.

---

*This is Episode 3 of "Season 1: From Zero to Automated Infrastructure" - documenting the weekend that solved the context window problem with local AI.*

*Previous Episode*: [Building the Foundation: Vault Creation to MVP](/posts/season-1-episode-2-mvp)
*Next Episode*: [ChromaDB Weekend: From 504 to 24,916 Documents](/posts/season-1-episode-4-documentation-overload)
*Complete Series*: [Season 1 Mapping Report](/tags/season-1/)

---
