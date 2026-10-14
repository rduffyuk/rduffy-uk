---
id: 16
title: "Modular Architecture Documentation"
status: accepted
recordedStatus: "Accepted"
date: 2026-02-17
tags: ["architecture", "documentation", "HLD", "LLD", "modular"]
sourceKind: source-record
public: true
journeyId: "2026-02-17-adr-016-modular-architecture-documentation"
---
# ADR-016: Modular Architecture Documentation

**Status**: Accepted
**Date**: 2026-02-17
**Jira**: VW-92
**Deciders**: Ryan Duffy

---

## Context

The Rootweaver Platform's architecture documentation has grown to a point where it is no longer maintainable as monolithic files:

### Current State

| Document | Lines | Characters | Tokens (~4 chars/tok) | H2 Sections |
|----------|-------|-----------|----------------------|-------------|
| **HLD** | 3,706 | 168,521 | ~42,130 | 14 |
| **LLD** | 7,987 | 242,162 | ~60,540 | 14+ (with duplicates) |
| **Combined** | 11,693 | 410,683 | **~102,670** | 28+ |

### Problems

1. **Context Window Ceiling**: Combined HLD+LLD (103K tokens) exceeds the usable portion of a 200K context window. No AI tool can read both docs and make coherent updates in a single session.

2. **Update Paralysis**: 17 "Architecture Documentation Update" reports sit unprocessed in `01-Inbox/` dating from Jan 1 to Feb 1, 2026. The `/update-docs` skill generates drift reports but the target docs are too large to load, edit, and verify in context.

3. **Structural Decay in LLD**:
   - Duplicate section headings: `5.6` defined twice (lines 2746 and 2766), `10.13` defined twice (lines 6854 and 6891)
   - Conversation transcript embedded in spec: lines 4333-4380 contain raw `## User` / `## Assistant` chat logs
   - Orphaned H2 headers: `## Purpose`, `## Automation Rules`, `## Quality Gates`, `## Focus Areas` appear without proper numbering
   - ~1,600 lines of inline YAML manifests (20% of LLD) that duplicate gitops repo content

4. **HLD Imbalance**: Section 2 ("System Architecture - 5 Layers") contains **87% of the entire document** (3,230 of 3,706 lines). The "KEY INSIGHTS" subsection alone is 1,130 lines — larger than most sections combined.

5. **Stale Data**: HLD references Bifrost LLM Gateway (documented but not deployed), ChromaDB doc count as 24,916 (actually 148K+ in Qdrant), deployment modes from pre-K3s era, and other outdated information.

6. **Duplicate Copies**: 6 copies of HLD/LLD exist across `99-Meta/` and `09-System/Architecture/` (3 HLD versions, 3 LLD versions).

### Growth Trajectory

The system grew from 5 namespaces/16 pods (Oct 2025) to 22 namespaces/90+ pods (Feb 2026). Documentation followed by appending — never pruning. At current trajectory, both docs will be unmaintainable by any tool or human within 2-3 months.

---

## Decision

**Split both HLD and LLD into modular, domain-scoped documents** using an Obsidian MOC (Map of Content) pattern, with each module targeting **<15K tokens** (~60 lines of YAML, ~400 lines of prose) to allow 2-3 modules to fit in context alongside conversation and edit operations.

### Architecture: MOC + Domain Modules

```
09-System/Architecture/
├── HLD-Index.md                          # MOC — links to all HLD modules (~2K tokens)
├── LLD-Index.md                          # MOC — links to all LLD modules (~2K tokens)
│
├── HLD/                                  # High-Level Design modules
│   ├── HLD-01-System-Overview.md         # Purpose, philosophy, deployment modes
│   ├── HLD-02-RAG-Platform.md            # Core RAG: gateway, retriever, MCP, agents
│   ├── HLD-03-AI-Layer.md                # LLM models, vector search, embeddings, NER
│   ├── HLD-04-Journal-Pipeline.md        # Kafka, Flink, streaming architecture
│   ├── HLD-05-Monitoring.md              # Prometheus, Grafana, ELK, Jaeger, LGTM, Beyla
│   ├── HLD-06-Security.md                # Sealed Secrets, NetworkPolicies, threat model
│   ├── HLD-07-K3s-Deployment.md          # 22 namespaces, host services, deployment modes
│   ├── HLD-08-Multi-Device.md            # Desktop + MacBook, Tailscale, Syncthing
│   ├── HLD-09-Automation.md              # Prefect, skills system, CI/CD, GitOps
│   └── HLD-10-Scalability-Roadmap.md     # Capacity, growth strategy, future roadmap
│
├── LLD/                                  # Low-Level Design modules
│   ├── LLD-01-RAG-Platform-Specs.md      # RAG gateway, retriever, MCP bridge API specs
│   ├── LLD-02-Agent-Framework.md         # Unified agent framework, PersistentMemory, Oracle
│   ├── LLD-03-Data-Models.md             # MongoDB, PostgreSQL, Qdrant schemas
│   ├── LLD-04-Journal-Pipeline-Specs.md  # Kafka topics, Flink jobs, message schemas
│   ├── LLD-05-Monitoring-Specs.md        # LGTM stack, OpenLIT, Beyla, metric endpoints
│   ├── LLD-06-CI-CD-Pipeline.md          # GitLab CI/CD, pipeline stages, Dockerfiles
│   ├── LLD-07-Infrastructure-Services.md # Harbor, Syncthing, Private Access, NetBox
│   ├── LLD-08-Operational-Runbooks.md    # Restart procedures, troubleshooting, GPU mgmt
│   └── LLD-09-Network-Deployment.md      # K3s bootstrap, Flannel, CoreDNS, FluxCD
│
└── _archive/                             # Superseded monolithic docs (read-only reference)
    ├── 2026-01-24-System-HLD-MONOLITHIC.md
    └── 2026-01-24-System-LLD-MONOLITHIC.md
```

### Module Design Principles

1. **Size Budget**: Each module MUST stay under 15K tokens (~600 lines). If a module exceeds this, split it further.

2. **Self-Contained**: Each module includes its own frontmatter, context paragraph, and can be understood without reading other modules. Cross-references use Obsidian `[[wiki-links]]`.

3. **Freshness Tracking**: Every module has frontmatter fields:
   ```yaml
   ---
   title: "HLD-02: RAG Platform"
   type: hld-module
   module: HLD-02
   last-verified: 2026-02-17     # Date someone confirmed this matches reality
   last-updated: 2026-02-17      # Date content was last changed
   covers-namespaces: [rootweaver]
   covers-components: [rag-gateway, mcp-bridge, qdrant, ollama, vault-indexer]
   jira: VW-92
   ---
   ```

4. **Update Scope**: The `/update-docs` skill will be updated to:
   - Run drift detection against the cluster
   - Identify which modules are affected by detected changes
   - Load only the affected module(s) into context
   - Apply changes and update `last-verified` / `last-updated` dates
   - Report which modules were updated and which were skipped

5. **MOC Index Pattern**: The index files serve as navigational hubs:
   ```markdown
   # HLD Index — Rootweaver Platform

   | Module | Scope | Last Verified | Status |
   |--------|-------|---------------|--------|
   | [[HLD-01-System-Overview]] | Purpose, philosophy | 2026-02-17 | Current |
   | [[HLD-02-RAG-Platform]] | Core RAG stack | 2026-02-17 | Current |
   | ... | ... | ... | ... |

   ## Quick Stats
   - **Namespaces**: 22 | **Pods**: ~90 | **Services**: 25+
   - **Last Full Audit**: 2026-02-17
   ```

### Token Budget Analysis (Post-Split)

| Module | Estimated Tokens | Source Sections |
|--------|-----------------|-----------------|
| **HLD-01** System Overview | ~3,000 | HLD 1, 6, 11, 14 |
| **HLD-02** RAG Platform | ~12,000 | HLD 2.5 (trimmed) |
| **HLD-03** AI Layer | ~10,000 | HLD Layer 3 |
| **HLD-04** Journal Pipeline | ~5,000 | HLD 2.5.13 + new content |
| **HLD-05** Monitoring | ~5,000 | HLD 8 + Layer 5 monitoring |
| **HLD-06** Security | ~5,000 | HLD 4 |
| **HLD-07** K3s Deployment | ~4,000 | HLD 7 + Layer 5 infra |
| **HLD-08** Multi-Device | ~4,000 | HLD 5.6 |
| **HLD-09** Automation | ~8,000 | HLD 2.6, 12, 13 |
| **HLD-10** Scalability | ~3,000 | HLD 5, 9, 10 |
| **HLD Total** | **~59,000** | vs 42K current (allows for gap-filling) |

| Module | Estimated Tokens | Source Sections |
|--------|-----------------|-----------------|
| **LLD-01** RAG Platform Specs | ~12,000 | LLD 1.3-1.4, 5.3-5.4 |
| **LLD-02** Agent Framework | ~10,000 | LLD 9 (cleaned) |
| **LLD-03** Data Models | ~3,000 | LLD 2 |
| **LLD-04** Journal Pipeline | ~5,000 | LLD 1.5a + new Kafka/Flink specs |
| **LLD-05** Monitoring Specs | ~5,000 | LLD 11 |
| **LLD-06** CI/CD Pipeline | ~10,000 | LLD 10 (cleaned) |
| **LLD-07** Infrastructure | ~8,000 | LLD 12-14 |
| **LLD-08** Operational Runbooks | ~8,000 | LLD 5.1-5.2, 5.5-5.6, 8 |
| **LLD-09** Network/Deployment | ~4,000 | LLD 3-4 |
| **LLD Total** | **~65,000** | vs 60K current (allows for gap-filling) |

### What Gets Removed (Not Migrated)

| Content | Lines | Reason |
|---------|-------|--------|
| Conversation transcript in LLD 6.9 | ~50 | Accidentally committed chat logs |
| Duplicate headings (5.6, 10.13) | ~20 | Merge artifacts |
| Orphaned H2 headers (Purpose, Focus Areas, etc.) | ~15 | Broken frontmatter/template remnants |
| Inline YAML duplicating gitops repo | ~800 | Replace with links to gitops manifests |
| ChromaDB references (decommissioned) | ~100 | System migrated to Qdrant |
| Bifrost Gateway (not deployed) | ~30 | Never materialized |
| **Total removed** | **~1,015** | **~13% of LLD** |

---

## Consequences

### Positive

- **AI-maintainable**: Any module fits in context with room for edits (~15K + 15K + 30K conversation = 60K, well within 200K)
- **Parallel updates**: Different modules can be updated by different subagents simultaneously
- **Faster drift resolution**: `/update-docs` only loads affected modules, not entire 103K-token corpus
- **Better Obsidian UX**: Graph view shows module relationships; each module is a manageable reading unit
- **Incremental verification**: `last-verified` dates show exactly which parts are stale
- **Clean separation**: YAML manifests stay in gitops repo, docs reference them by path

### Negative

- **One-time migration effort**: ~2-4 hours of careful content splitting and verification
- **Cross-reference maintenance**: Module splits may break some internal references
- **Skill updates needed**: `/update-docs`, `/load-arch` skills need updating for new paths
- **CLAUDE.md references**: Project CLAUDE.md points to monolithic HLD/LLD paths that need updating

### Neutral

- **Total token count similar**: ~124K across all modules vs ~103K monolithic (growth from gap-filling)
- **File count increases**: 2 files becomes ~22 files (but each is manageable)

---

## Alternatives Considered

### 1. Keep Monolithic, Use Subagents Only
- **Rejected**: Subagents still need full docs in context to make coherent cross-section edits. The fundamental context ceiling remains.

### 2. Section-Based Reading (Read Only Lines X-Y)
- **Rejected**: Works for reads but not for writes. Editing line ranges without understanding surrounding context leads to broken cross-references and inconsistencies.

### 3. arc42 Full Template (12 Standardized Sections)
- **Partially adopted**: We use arc42's concept of standardized sections but adapt the boundaries to match our domain (K8s namespaces, AI/RAG stack) rather than using generic arc42 section names.

### 4. C4 Model (Context/Container/Component/Code Levels)
- **Considered for future**: The module split is compatible with evolving toward C4 levels later. HLD modules roughly map to C4 Container level; LLD modules map to Component level.

### 5. Auto-Generated Docs from Cluster State
- **Complementary, not replacement**: Drift detection generates facts; architecture docs explain *why*. Auto-generation supplements modules but can't replace the design rationale.

---

## Migration Plan

### Phase 1: Preparation (This Session)
- [x] Analyze HLD/LLD section structure and sizes
- [x] Identify data quality issues (duplicates, stale content, embedded transcripts)
- [x] Draft ADR-016 (this document)
- [x] Get ADR approval

### Phase 2: Create Module Structure
- [x] Create `09-System/Architecture/HLD/` and `LLD/` directories
- [x] Create MOC index files (HLD-Index.md, LLD-Index.md)
- [x] Create empty module files with frontmatter

### Phase 3: Content Migration (Subagent-Driven)
- [x] Extract HLD Section 2.5 → HLD-02-RAG-Platform.md
- [x] Extract HLD Layer 3 → HLD-03-AI-Layer.md
- [x] Extract HLD Section 4 → HLD-06-Security.md
- [x] Extract HLD Section 5.6 → HLD-08-Multi-Device.md
- [x] Extract HLD Sections 12+13 → HLD-09-Automation.md
- [x] Extract remaining HLD sections → appropriate modules
- [x] Extract LLD sections → appropriate modules (clean YAML, fix duplicates)
- [x] Remove conversation transcript, orphaned headers, stale data

### Phase 4: Verification & Cleanup
- [x] Verify all content migrated (diff line counts)
- [x] Update all cross-references to use `[[wiki-links]]`
- [x] Archive monolithic files to `_archive/`
- [x] Update CLAUDE.md references
- [x] Update `/update-docs` and `/load-arch` skills
- [x] Process 16 Architecture-Documentation-Update drift reports against new modules (95%+ already in modules via extraction; remaining items stale or minor)
- [x] Clean up duplicate HLD/LLD copies in `99-Meta/` and `09-System/Architecture/`

---

## References

- HLD Analysis: 3,706 lines, 14 H2 sections, Section 2 = 87% of doc
- LLD Analysis: 7,987 lines, 14+ H2 sections, ~1,600 lines YAML manifests
- IcePanel State of Software Architecture 2025: Documentation drift is #1 challenge
- arc42 Template: Standardized section structure for architecture docs
- Obsidian MOC Pattern: Maps of Content for navigating modular knowledge bases
