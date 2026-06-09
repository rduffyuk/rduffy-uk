---
author: Ryan Duffy
featured: false
categories:
- Season 1
- Infrastructure
- DevOps
pubDatetime: 2025-10-05 13:00:00+00:00
draft: false
episode: 5
reading_time: 10 minutes
series: 'Season 1: From Zero to Automated Infrastructure'
description: K3s was already running. The question wasn't whether to use it - it was whether to migrate everything to it. A day of deep research revealed the hidden cost of containerization.
tags:
- k3s
- kubernetes
- migration
- infrastructure
- decision-making
- ollama
- chromadb
- update-velocity
- helm-charts
- hybrid-architecture
- containerization
- gpu-operator
- vllm
title: 'The Migration Question: When K3s Meets Reality'
word_count: 2200
---
# Episode 5: The Migration Question - When K3s Meets Reality

**Series**: Season 1 - From Zero to Automated Infrastructure
**Episode**: 5 of 8
**Date**: September 30, 2025
**Reading Time**: 10 minutes

---

## September 30, 10:00 AM: The Hybrid Reality

*Vault Evidence: `K3s-Full-Stack-Containerization-Research-2025-09-30.md` and `K3s-Migration-Value-Score-Update-Velocity-Analysis-2025-09-30.md` created September 30, 2025 at 12:00-14:00, documenting migration research for already-running K3s system.*

By late September, I had a split personality problem.

**Already on K3s** (from prior work):
```bash
kubectl get pods -A | grep -E "librechat|monitoring|elastic|tracing|kafka"

# Output:
librechat     librechat-ui-7d4b9c8f6-xk2p9      1/1   Running
librechat     mongodb-0                          1/1   Running
librechat     rag-api-deployment-m8k4l           1/1   Running
monitoring    prometheus-server-0                1/1   Running
monitoring    grafana-7d4b9c8f6-xk2p9           1/1   Running
elastic       elasticsearch-0                    1/1   Running
elastic       kibana-deployment-xk2p9           1/1   Running
tracing       jaeger-operator-7d4b9c8f6-xk2p9   1/1   Running
tracing       otel-collector-m8k4l              1/1   Running
kafka         kafka-broker-0                     1/1   Running
```

**Still running natively**:
```bash
ps aux | grep -E "ollama|chromadb|vllm"

# Output:
ollama    → port 11434 (17 models, 48GB RAM)
vLLM      → port 8000 (OpenAI-compatible API)
ChromaDB  → embedded (24,916 docs indexed)
FastMCP   → port 8002 (MCP bridge)
```

**Hybrid architecture**. Half containerized, half bare metal. It worked, but it felt... incomplete.

The question wasn't "Should I use K3s?" - K3s was already running. The question was: **"Should I migrate everything to it?"**

## The Update Velocity Concern

Before diving into migration, I had one critical concern: **Would containerization slow down my ability to update software?**

With native installs:
```bash
# Ollama releases new version → 2 minutes later
curl -fsSL https://ollama.com/install.sh | sh
sudo systemctl restart ollama
# DONE. Latest version running.
```

With Kubernetes Helm charts:
```bash
# Ollama releases new version → wait for community maintainer
# Community maintainer updates Helm chart → 9-39 days later
helm repo update
helm upgrade ollama ollama/ollama
# NOW you're on the latest version. Weeks later.
```

I needed to research this properly.

## September 30, 12:00 PM: The Research Begins

I created two research documents:

1. **K3s Full-Stack Containerization Research** - Technical feasibility
2. **K3s Migration Value Score: Update Velocity Analysis** - The hidden costs

### Key Finding #1: Community-Maintained Charts Lag Behind

**Ollama Example (Sept 30, 2025)**:
```yaml
Ollama Official Release:
- Latest: v0.12.3 (Sept 26, 2025)
- Performance: 32-600% improvements over v0.11.x
- Features: Web search API added

Ollama Helm Chart (maintained by "otwld" - community volunteer):
- Chart Version: ollama-1.29.0 (Sept 17, 2025)
- App Version: v0.11.11
- Status: 10+ versions behind official release
- Maintainer: GitHub user, NOT Ollama Inc.
```

**Lag time: 9+ days** (and counting).

**ChromaDB Example**:
```yaml
ChromaDB Official Release:
- Latest: v1.1.1 (Sept 24, 2025)
- Previous: v1.1.0 (Sept 16, 2025)

ChromaDB Helm Chart (maintained by "amikos-tech" - consulting company):
- Chart Version: chromadb-0.1.24 (May 23, 2025)
- Supported: 1.0.x or later
- Status: No updates for 127 days
```

**Lag time: 127+ days.**

### Key Finding #2: Vendor-Maintained Charts Have Zero Lag

**vLLM Production-Stack**:
```yaml
vLLM Official Release:
- Latest: Production-Stack (Jan 2025)
- Maintainer: vLLM Project (vendor)
- Helm Chart: Officially maintained by vLLM
- Lag: ZERO days
```

**NVIDIA GPU Operator**:
```yaml
NVIDIA Official Release:
- Latest: v24.9.0 (Sept 2025)
- Maintainer: NVIDIA Corporation
- Helm Chart: Officially maintained
- Lag: ZERO days
- Bonus: Better than native apt installs (zero-downtime upgrades)
```

The pattern was clear: **When vendors maintain Helm charts, there's no lag. When community volunteers maintain them, lag is 9-127+ days.**

## The Value Score Analysis

I built a comprehensive scoring matrix weighing five categories:

```
┌────────────────────────────────────────────────────────────┐
│       Value Score Analysis - September 30, 2025            │
└────────────────────────────────────────────────────────────┘

Category              Weight   Native   K3s    Winner
─────────────────────────────────────────────────────────────
Update Velocity       35%      8.6      5.6    NATIVE (-3.0)
Operational Mgmt      15%      5.8      9.8    K3S (+4.0)
Scalability           10%      2.5      9.6    K3S (+7.1)
Disaster Recovery     15%      4.3      8.8    K3S (+4.5)
Learning Burden       25%      7.6      5.5    NATIVE (-2.1)
─────────────────────────────────────────────────────────────
WEIGHTED TOTAL        100%     6.68     7.09   K3S (+0.41)
```

**Result**: K3s wins by 0.41 points... but it's **dangerously close**.

### The Hidden Costs

**Update Velocity Tax**: 9-39 days for critical AI services
- Missing 32-600% performance improvements while waiting for chart updates
- Depending on volunteer maintainers with no SLA
- Risk of chart abandonment (ChromaDB: no updates in 127 days)

**Complexity Tax**: +30% operational overhead
- Must understand Kubernetes API, Helm, StatefulSets, PVCs, GPU operators
- Debugging through multiple abstraction layers
- Monitoring two sources: official releases AND Helm chart updates

**Dependency Tax**: Your infrastructure depends on strangers
- "otwld" maintains Ollama chart - who is that?
- "amikos-tech" maintains ChromaDB chart - will they keep updating it?
- What if they abandon the project?

## September 30, 6:00 PM: The Hybrid Decision

After 6 hours of research, I made the call: **Selective containerization**.

**Keep Native** (update velocity critical):
```yaml
✅ Ollama (port 11434)
   Reason: Community Helm chart lags 9+ days
   Impact: Miss performance improvements, new features

✅ ChromaDB (embedded + server)
   Reason: Community Helm chart lags 127+ days
   Impact: Severe staleness, chart might be abandoned

✅ Aider (CLI tool)
   Reason: No K8s benefit, interactive workflow
```

**Move to K3s** (vendor-maintained or operational benefit):
```yaml
✅ vLLM
   Reason: Vendor-maintained production-stack, zero lag
   Status: Pending migration

✅ NVIDIA GPU Operator
   Reason: Vendor-maintained, better than native apt
   Benefit: Zero-downtime driver upgrades, automatic compatibility

✅ FastMCP (port 8002)
   Reason: Operational benefits (monitoring, resource limits)
   Not update-critical

✅ Redis
   Reason: Bitnami vendor chart, StatefulSet benefits
```

**Already on K3s** (no change needed):
```yaml
✅ LibreChat + MongoDB + RAG API
✅ Prometheus + Grafana
✅ Elasticsearch + Kibana
✅ Jaeger + OpenTelemetry Collector
✅ Kafka
```

The final architecture: **70% native, 30% K3s** - a deliberate hybrid.

## The Rationale: Optimize for What Matters

**Why keep Ollama native?**

Ollama is the **inference engine**. It's the core of the AI workflow. Missing v0.12.x performance improvements (32-600% faster) for 9+ days while waiting for a community maintainer to update a Helm chart is unacceptable.

**Why keep ChromaDB native?**

24,916 documents indexed. 127+ days without a Helm chart update suggests the maintainer has moved on. I can't bet my knowledge base on abandoned infrastructure.

**Why migrate vLLM to K3s?**

vLLM Project maintains their own production-stack Helm chart. Zero lag, first-class Kubernetes support, and it was released in January 2025 specifically for production workloads.

**Why migrate NVIDIA drivers to GPU Operator?**

This is the exception where **K8s is better than native**:
- Automated driver lifecycle management
- Zero-downtime upgrades (no reboot required!)
- Automatic CUDA compatibility checks
- Rollback capability if upgrade fails

GPU Operator provides features that **don't exist** with `apt install nvidia-driver-560`.

## What Worked

**Research-Driven Decision**:
Two comprehensive research documents captured the tradeoffs. Not guessing - analyzing real-world data (Ollama v0.12.3 vs Helm chart v0.11.11).

**Value Score Matrix**:
Quantifying "Update Velocity" (35% weight) vs "Disaster Recovery" (15% weight) made the hybrid approach obvious.

**Acknowledging Community Maintainers**:
"otwld" and "amikos-tech" are doing unpaid work to maintain Helm charts. The lag isn't their fault - it's the nature of volunteer efforts. Recognizing this helps set realistic expectations.

**GPU Operator Discovery**:
Finding the ONE case where K8s is genuinely better than native (NVIDIA driver management) validated that selective containerization makes sense.

## What Still Sucked

**Fragmented Architecture**:
Half on K3s, half native. Two mental models. Two sets of tools (`kubectl` vs `systemctl`). Two monitoring approaches.

**Maintenance Burden**:
Now I have to track:
- Official Ollama releases (for native install)
- Official vLLM releases (for K3s)
- Helm chart updates (for containerized services)
- GPU Operator compatibility (for driver management)

**The "Incomplete" Feeling**:
It's not elegant. It's not "all-in" on Kubernetes. But it's pragmatic.

## The Numbers (September 30, 2025)

| Metric | Value |
|--------|-------|
| **Research Time** | 6 hours |
| **Research Documents Created** | 2 (47 pages combined) |
| **Services on K3s** | 10 |
| **Services Staying Native** | 3 (Ollama, ChromaDB, Aider) |
| **Services Migrating to K3s** | 3 (vLLM, NVIDIA drivers, FastMCP) |
| **Helm Chart Update Lag (Ollama)** | 9+ days |
| **Helm Chart Update Lag (ChromaDB)** | 127+ days |
| **Value Score (Hybrid)** | 7.8/10 |
| **Value Score (Full K3s)** | 7.1/10 |
| **Value Score (All Native)** | 5.9/10 |

`★ Insight ─────────────────────────────────────`
**The Hidden Cost of Abstraction:**

Containerization sounds like a pure win: isolation, portability, orchestration. But there's a cost most tutorials don't mention:

**When you containerize vendor software using community-maintained Helm charts, you introduce a third party into your update pipeline:**

```
Vendor Release → Community Maintainer → Your Deployment
(Day 0)          (Day 9-127)            (When you notice)
```

Native installs bypass the middle layer:

```
Vendor Release → Your Deployment
(Day 0)          (Day 0)
```

The question isn't "Is Kubernetes better?" It's "Is the orchestration benefit worth the update lag for THIS service?"

For Ollama (core AI inference): No.
For vLLM (vendor-maintained chart): Yes.
For Prometheus (already containerized): Yes.

**Blanket decisions fail. Selective decisions win.**
`─────────────────────────────────────────────────`

## What I Learned

**1. "Modern infrastructure" doesn't mean "containerize everything"**
The best architecture uses the right tool for each component. Sometimes that's K8s. Sometimes it's `systemctl`.

**2. Community-maintained Helm charts are gifts, not guarantees**
"otwld" maintaining Ollama's Helm chart is generous volunteer work. But depending on it for production means accepting 9+ day update lag.

**3. Vendor-maintained charts change the equation**
vLLM and NVIDIA maintaining official Helm charts meant zero lag. If Ollama Inc. released an official chart tomorrow, I'd migrate immediately.

**4. Research prevents regret**
6 hours of research on September 30 prevented weeks of frustration from migrating Ollama to K3s, then waiting 9+ days for critical updates.

**5. Hybrid architectures are valid (even if messy)**
70% native, 30% K3s isn't elegant. But it optimizes for update velocity (critical) while gaining orchestration benefits (nice-to-have).

## Built on Open Source

This research episode relied on incredible open source projects and communities:

**[K3s](https://k3s.io)** by Rancher Labs - Lightweight Kubernetes that made single-node clusters practical for homelabs.

**[Ollama Helm Chart](https://github.com/otwld/ollama-helm)** maintained by otwld - Community-maintained chart that, despite lag concerns, made Ollama deployment on K8s possible for thousands of users.

**[ChromaDB Helm Chart](https://github.com/amikos-tech/chromadb-chart)** by amikos-tech - Open source effort to bring vector database orchestration to Kubernetes.

**[vLLM Production-Stack](https://github.com/vllm-project/vllm)** - Vendor-maintained Kubernetes deployment showing how official support eliminates update lag.

**[NVIDIA GPU Operator](https://github.com/NVIDIA/gpu-operator)** - Enterprise-grade GPU management that proved containerization can be BETTER than native.

Massive thanks to all maintainers - vendor-backed and community volunteers alike. Your work makes modern AI infrastructure possible.

## What's Next

September 30 ended with a decision: **Hybrid architecture**.

**Immediate plans**:
- Keep Ollama native (avoid 9+ day lag)
- Keep ChromaDB native (avoid 127+ day lag)
- Migrate vLLM to K3s (vendor chart, zero lag)
- Deploy NVIDIA GPU Operator (better than native)

**Unknown at the time**: By October 5, none of this would matter.

By October 5, 9:00 AM, K3s would have **6,812 pod restarts**.
By October 5, 10:00 AM, I'd discover the networking layer was completely broken.
By October 5, 6:00 PM, I'd have rebuilt the entire cluster from scratch.

The hybrid architecture decision was sound. But the infrastructure beneath it was about to fail spectacularly.

---

*This is Episode 5 of "Season 1: From Zero to Automated Infrastructure" - documenting the research that revealed containerization's hidden costs.*

*Previous Episode*: [ChromaDB Weekend: From 504 to 24,916 Documents](/posts/season-1-episode-4-documentation-overload)
*Next Episode*: [When Everything Crashes: The K3s Resurrection](/posts/season-1-episode-6-k3s-crash-resurrection)
*Complete Series*: [Season 1 Mapping Report](/tags/season-1/)

---
