---
author: Ryan Duffy
featured: false
categories:
- Season 1
- Documentation
- Automation
pubDatetime: 2025-10-05 15:00:00+00:00
draft: false
episode: 7
reading_time: 8 minutes
series: 'Season 1: From Zero to Automated Infrastructure'
description: From hand-coded Mermaid diagrams to automated architecture visualization. An evening working with Claude to teach the system to document itself.
tags:
- ascii-art
- diagrams
- automation
- documentation
- architecture
- prefect
- kubernetes
- k3s
- convocanvas
- ollama
- chromadb
title: 'Teaching the System to Document Itself: Automated Architecture Diagrams'
word_count: 1900
---
# Episode 7: Teaching the System to Document Itself - Automated Architecture Diagrams

**Series**: Season 1 - From Zero to Automated Infrastructure
**Episode**: 7 of 8
**Date**: October 7, 2025 (Evening)
**Reading Time**: 8 minutes

---

## October 7, Evening: The Visualization Gap

*Vault Evidence: All architecture diagram files (`2025-10-07-185113-Architecture-v010-layered.md` through `2025-10-07-185121-Architecture-v0012-mermaid.md`) created October 7, 2025 at 18:51 (6:51 PM), documenting multiple iterations of diagram automation development.*

Two days after rebuilding K3s, I couldn't visualize the architecture anymore.

**The Mental Model Was Breaking Down**:
```bash
kubectl get pods -A --no-headers | wc -l
# Output: 23 pods

kubectl get namespaces --no-headers | wc -l
# Output: 7 namespaces
```

- 7 namespaces
- 23 pods across those namespaces
- 17 AI models in Ollama
- 12 monitoring components
- 6 network policies
- 4 persistent volumes

I needed diagrams. Not static images - **living documentation that updates itself** from the actual cluster state.

Working with Claude Code that evening, we built an automated architecture visualization system.

## The Challenge: Complexity Hidden in kubectl

The infrastructure was complex, but it was all queryable:

```bash
# Get all services
kubectl get svc -A

# Get pod relationships
kubectl get pods -A -o json | jq '.items[].spec.containers[].env'

# Get network policies
kubectl get networkpolicies -A

# Get persistent volumes
kubectl get pvc -A
```

The data was there. But **kubectl output doesn't explain relationships**. It doesn't show:
- Which services talk to which other services
- How data flows through the system
- What external dependencies exist
- Which components are critical path

We needed to transform cluster state into visual architecture.

## The ASCII Diagram Solution

ASCII diagrams are text-based and render everywhere:

```
ConvoCanvas ──→ Ollama
     │
     └─────→ ChromaDB
```

**Benefits**:
- Pure text (version controllable)
- Renders everywhere (terminal, markdown, Hugo)
- Can be generated programmatically
- Zero dependencies or renderers required

**The Plan**: Query K3s → Parse relationships → Generate ASCII diagrams → Auto-commit to git

## Building the Generator

Working with Claude, we iterated through multiple approaches.

### Iteration 1: Pod List

First attempt: Just list all pods

```bash
kubectl get pods -A -o json | jq -r '.items[] | "\(.metadata.namespace)/\(.metadata.name)"'
```

**Result**: A flat list with no relationships. Not useful.

### Iteration 2: Extract Service Dependencies

Parse environment variables to find service connections:

```bash
#!/bin/bash

get_service_deps() {
    local namespace=$1
    local pod=$2

    kubectl get pod "$pod" -n "$namespace" -o json | \
        jq -r '.spec.containers[].env[]? |
               select(.name | contains("URL") or contains("HOST")) |
               .value'
}
```

**Result**: Found relationships like `OLLAMA_URL=http://ollama:11434`, but many implicit connections missed.

### Iteration 3: Namespace Grouping

Use ASCII box grouping to organize by namespace:

```
┌─────────────────────────────┐
│   librechat namespace       │
│                             │
│  ┌──────────┐  ┌─────────┐ │
│  │LibreChat │  │ MongoDB │ │
│  └────┬─────┘  └─────────┘ │
│       │                     │
│  ┌────▼────┐                │
│  │ RAG API │                │
│  └────┬────┘                │
└───────┼─────────────────────┘
        │
        ▼
┌───────────────────────┐
│ ai-inference namespace│
│                       │
│    ┌────────┐         │
│    │ Ollama │         │
│    └────────┘         │
└───────────────────────┘
```

**Result**: Much clearer! Namespaces provided natural architectural boundaries.

### The Final Pattern: Three Diagram Types

We realized one diagram couldn't serve all needs. We created three:

**1. High-Level Architecture** - Business/product view
```
┌──────┐
│ User │
└───┬──┘
    │
    ▼
┌───────────┐
│ LibreChat │
└─────┬─────┘
      │
      ├────────────────┐
      │                │
      ▼                ▼
┌─────────────┐  ┌──────────────────┐
│ 17 AI Models│  │ Semantic Search  │
│  (Ollama)   │  │     (RAG)        │
└─────────────┘  └────────┬─────────┘
                          │
                          ▼
                    ┌──────────────┐
                    │ 24K Documents│
                    │  (ChromaDB)  │
                    └──────────────┘
```

**2. Deployment Diagram** - Infrastructure view
```
┌─────────────────────────────────────────────┐
│              K3s Cluster                    │
│                                             │
│  ┌─────────────────────────────────┐       │
│  │   librechat namespace           │       │
│  │  ┌──────┐ ┌──────┐ ┌─────┐     │       │
│  │  │ LC   │ │Mongo │ │ RAG │     │       │
│  │  └──────┘ └──────┘ └─────┘     │       │
│  └─────────────────────────────────┘       │
│                                             │
│  ┌─────────────────────────────────┐       │
│  │   monitoring namespace          │       │
│  │  ┌──────────┐ ┌────────┐       │       │
│  │  │Prometheus│ │ Grafana│       │       │
│  │  └──────────┘ └────────┘       │       │
│  └─────────────────────────────────┘       │
└─────────────────────────────────────────────┘
```

**3. Data Flow Diagram** - How requests traverse the system
```
User                LibreChat           Ollama            RAG               ChromaDB
  │                     │                  │                │                   │
  │─ Query ───────────→ │                  │                │                   │
  │                     │                  │                │                   │
  │                     │─ LLM Request ───→│                │                   │
  │                     │                  │                │                   │
  │                     │─ Semantic Search ───────────────→ │                   │
  │                     │                  │                │                   │
  │                     │                  │                │─ Vector Query ───→│
  │                     │                  │                │                   │
  │                     │                  │                │←─── Results ──────│
  │                     │                  │                │                   │
  │                     │←─ Context ──────────────────────── │                   │
  │                     │                  │                │                   │
  │                     │←─ Response ──────│                │                   │
  │                     │                  │                │                   │
  │←─ Answer ───────────│                  │                │                   │
```

## Automation: Daily Diagram Generation

We built a Prefect workflow to auto-generate diagrams daily:

**`diagram_automation_flow.py`**:
```python
from prefect import flow, task
from datetime import datetime
import subprocess

@task
def generate_diagrams():
    """Generate ASCII architecture diagrams from K3s cluster state."""
    result = subprocess.run(
        ["./generate_ecosystem_diagrams.sh"],
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        raise Exception(f"Diagram generation failed: {result.stderr}")

    return result.stdout

@task
def commit_to_git(diagram_output: str):
    """Commit generated diagrams to git."""
    subprocess.run(["git", "add", "architecture-*.md"], check=True)
    subprocess.run([
        "git", "commit", "-m",
        f"docs: auto-update architecture diagrams {datetime.now().isoformat()}"
    ], check=True)

    return "Diagrams committed to git"

@flow(name="diagram-automation")
def diagram_automation_flow():
    """Daily diagram generation workflow."""
    output = generate_diagrams()
    commit_to_git(output)
    return "Architecture diagrams updated"

# Schedule: Daily at 3 AM (after vault indexing completes)
if __name__ == "__main__":
    diagram_automation_flow.serve(
        name="diagram-automation",
        cron="0 3 * * *"
    )
```

**Deploy**:
```bash
python-enhancement-env/bin/python diagram_automation_flow.py
```

**Result**: Every morning at 3 AM:
1. Script queries K3s cluster
2. Generates 3 ASCII diagrams
3. Commits to git automatically
4. Obsidian vault gets updated diagrams

**The system was documenting itself.**

## The Diagram Files (October 7, 18:51)

Vault timestamps show the actual work:

```bash
ls -la architecture-automation-pipeline/diagrams/

# All files created: Oct 7 18:51
2025-10-07-185113-Architecture-v010-layered.md
2025-10-07-185115-Architecture-v011-layered.md
2025-10-07-185116-Architecture-v010-sequence.md
2025-10-07-185118-Architecture-v0011-mermaid.md
2025-10-07-185119-Architecture-v011-sequence.md
2025-10-07-185121-Architecture-v0012-mermaid.md
```

Multiple iterations in one evening session, each refining the approach.

## What Worked

**ASCII's Pure Text Format**:
- Version control shows diagram evolution
- `git diff` on diagrams shows architectural changes
- Renders everywhere (terminal, markdown, Hugo, no dependencies)
- Easy to generate programmatically
- No rendering issues with static site generators

**Three-Diagram Strategy**:
- High-level: Shows business value (LibreChat → 17 AI Models)
- Deployment: Shows infrastructure (K3s namespaces, pods, services)
- Data flow: Shows request paths (sequence-style)

Different audiences need different views. Three specialized diagrams beat one complex diagram.

**Daily Automation**:
- Diagrams never out of date
- Git history becomes architectural history
- Zero manual maintenance required
- Captures infrastructure evolution automatically

## What Still Sucked

**Implicit Relationships Missed**:
Environment variables captured explicit service URLs, but missed:
- Network policies allowing traffic
- Implicit service mesh connections
- ConfigMap/Secret dependencies

**Static External Services**:
GitHub, Cloudflare, external APIs were hardcoded. No way to auto-detect what external services the system depends on.

**Manual Layout Required**:
ASCII diagrams require careful manual layout. Complex systems with many connections can get messy quickly.

## The Meta Loop

This diagram automation system is itself part of the infrastructure:

```
┌─────────────┐
│ K3s Cluster │
└──────┬──────┘
       │
       ▼
┌──────────────┐
│kubectl query │
└──────┬───────┘
       │
       ▼
┌─────────────────┐
│Diagram Generator│
└───────┬─────────┘
        │
        ▼
┌──────────────┐
│ ASCII Files  │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Git Repo    │
└──────┬───────┘
       │
       ▼
┌────────────────┐
│ Obsidian Vault │
└───────┬────────┘
        │
        ▼
┌───────────────────┐
│ ChromaDB Indexing │
└────────┬──────────┘
         │
         ▼
┌──────────────────┐
│ Semantic Search  │
└──────────────────┘
```

The system:
1. Queries its own infrastructure
2. Generates diagrams describing itself
3. Commits them to git
4. Indexes them in ChromaDB
5. Makes them searchable

**Self-documenting infrastructure.**

## The Numbers (October 7 Evening)

| Metric | Value |
|--------|-------|
| **Work Date** | October 7, 2025 (evening) |
| **Diagram Types** | 3 (high-level, deployment, data-flow) |
| **Diagram Iterations** | 6+ files created |
| **Automation** | Prefect flow (daily 3 AM) |
| **Components Visualized** | 23 pods across 7 namespaces |
| **External Services** | 5 (GitHub, Cloudflare, Tailscale, etc.) |
| **ASCII Lines** | ~40-60 per diagram |

`★ Insight ─────────────────────────────────────`
**The Documentation Decay Problem:**

Manual documentation has a fatal flaw: **it decays the moment you write it**.

- Add one service → All diagrams out of date
- Remove one pod → Documentation now lies
- Change one connection → Diagrams show wrong architecture

**The traditional solutions fail:**
- "Update docs in every PR" → Forgotten 50% of the time
- "Quarterly doc review" → 3 months of staleness guaranteed
- "Assign doc owner" → Creates bottleneck, still lags

**The only solution that works: Automation**

Generate documentation from source of truth (cluster state) automatically. Then:
- Docs can never be out of date (regenerate daily)
- Git history shows architectural evolution
- Zero discipline required (it just happens)

When your documentation requires human discipline, you don't have a people problem - you have an automation problem.
`─────────────────────────────────────────────────`

## What I Learned

**1. Working with Claude, not replacing myself**
This wasn't "AI writes diagrams while I watch." It was back-and-forth: I understood the architecture, Claude suggested Mermaid syntax, I validated output, Claude refined approach. Collaboration, not replacement.

**2. One diagram can't show everything**
Tried building "the ultimate architecture diagram" showing all layers. Failed. Three specialized ASCII diagrams (high-level, deployment, data-flow) served different needs better.

**3. Automation justifies complexity**
Writing diagram generator was more work than hand-coding one diagram. But it runs daily forever, compounding value. One-time cost, permanent benefit.

**4. Git history for diagrams = architectural archaeology**
Looking at diagram diffs shows exactly when services were added, removed, or reconfigured. Better than documentation - it's the actual evolution.

**5. Self-documenting systems are achievable**
Not science fiction. Query cluster state → Generate markdown → Commit to git. The system describes itself because we taught it how.

## Built on Open Source

This automation wouldn't exist without:

**ASCII Art Tradition** - Text-based diagramming that works everywhere without dependencies. Terminal-native, version-controllable, and renders in any context.

**[Prefect](https://github.com/PrefectHQ/prefect)** - Modern workflow orchestration that made daily automation trivial to deploy and monitor.

**[jq](https://github.com/jqlang/jq)** - JSON processor that made parsing `kubectl` output possible in bash scripts.

**[K3s](https://k3s.io)** - Lightweight Kubernetes that made querying cluster state via `kubectl` both possible and practical.

Thanks to these projects for building tools that enable self-documenting infrastructure.

## What's Next

October 7 evening ended with automated diagram generation running.

The system could now:
- Parse conversations (ConvoCanvas)
- Generate content with local LLMs (Ollama)
- Search semantically (ChromaDB)
- Run reliably (K3s, rebuilt from crash)
- Monitor itself (Prometheus/Grafana)
- **Document itself** (automated diagrams)

There was one thing left to automate: **Writing the blog series documenting its own creation**.

Could the AI that built this infrastructure also write the story of building it?

By early October, working with Claude, I'd find out.

---

*This is Episode 7 of "Season 1: From Zero to Automated Infrastructure" - documenting the evening we taught the system to document itself.*

*Previous Episode*: [When Everything Crashes: The K3s Resurrection](/posts/season-1-episode-6-k3s-crash-resurrection)
*Next Episode*: [Teaching the System to Blog About Itself](/posts/season-1-episode-8-meta)
*Complete Series*: [Season 1 Mapping Report](/tags/season-1/)

---
