---
id: 34
title: "Data Source Connector Architecture"
status: proposed
recordedStatus: "Proposed"
date: 2026-04-15
tags: ["architecture", "connectors", "ingestion", "rag"]
sourceKind: source-record
public: true
episode: "season-3-episode-9-scout-fleet-and-the-async-ceiling"
journeyId: "2026-04-15-adr-034-auditable-connectors-feeding-a-shared-retrieval-path"
---
# ADR-034: Data Source Connector Architecture

**Status**: Proposed
**Date**: 2026-04-15
**Jira**: VW-184
**Deciders**: Ryan Duffy

## Context

Rootweaver currently ingests data from a single source: the local Obsidian vault via inotify file-watcher → Kafka → KEDA ScaledJob → Qdrant. Jira and Confluence are accessible via MCP tools (Atlassian MCP server) but their content is **not indexed into Qdrant** — it's only available as live API queries during Claude Code sessions.

Market analysis (April 2026) shows that connector coverage is the #1 differentiator between Rootweaver and competitor platforms:

| Platform | Connectors | Indexed into Search |
|----------|-----------|-------------------|
| **Glean** | 100+ | Yes (enterprise graph) |
| **Onyx (Danswer)** | 40+ | Yes (hybrid search) |
| **Rootweaver** | 1 (vault) + 2 MCP (Jira/Confluence, live query only) | Vault only |

This limits Rootweaver's ability to answer questions that span multiple data sources (e.g., "what Jira issues relate to the search pipeline changes last week?" requires both vault context and Jira data in the same search index).

### What We Have Today

| Source | Integration Type | Indexed in Qdrant | Bi-directional | Status |
|--------|-----------------|-------------------|----------------|--------|
| **Obsidian Vault** | File watcher → Kafka → Qdrant | Yes (45K chunks) | Read-only | Production |
| **Jira** | MCP tool (Atlassian MCP server) | **No** | Read + Write (CRUD, transitions) | Production |
| **Confluence** | MCP tool (Atlassian MCP server) | **No** | Read + Write (CRUD, search) | Production |
| **GitLab** | CI/CD runner only | **No** | Push only | Production |
| **Web** | Perplexity API + SearXNG | **No** (ephemeral) | Read-only | Production |

### How Onyx (Danswer) Does It

Onyx is the closest open-source architectural peer. Their connector model:

1. **Base class**: `BaseConnector` with `load_from_state()` (incremental) and `poll_source()` (periodic)
2. **Document model**: Normalised `Document` with typed `Section` objects (text, metadata, source link)
3. **Polling-based**: Configurable intervals per connector (not webhook-driven)
4. **Credential management**: Per-connector OAuth flows or API key storage, encrypted at rest
5. **Permission sync**: Optional per-connector — Google Drive, Confluence, Slack respect source ACLs
6. **Processing pipeline**: Connector → Document model → Chunker → Embedder → Vespa (their vector store)
7. **Connector effort**: ~200-400 lines of Python per connector (API pagination, rate limiting, doc normalisation)

**40+ connectors** including: Slack, Google Drive, Gmail, Notion, GitHub, GitLab, Linear, Zendesk, Salesforce, HubSpot, SharePoint, Teams, Discourse, Bookstack, Guru, Zulip, Productboard, ClickUp, S3, GCS, Asana, MediaWiki, Freshdesk, Fireflies, Axero, web scraping, file upload.

## Decision

### Architecture: Kafka-Native Connector Framework

Build connectors as **Kafka producers** that emit documents to a `vault.connector-docs` topic, consumed by the existing indexing pipeline (chunker → embedder → Qdrant). This reuses the event-driven architecture already in place for vault file indexing.

```
┌─────────────────────────────────────────────────────┐
│                  Data Sources                        │
│                                                      │
│  Jira    Confluence  GitLab   Slack   Google Drive   │
│   │         │          │        │         │          │
│   ▼         ▼          ▼        ▼         ▼          │
│  ┌──────────────────────────────────────────────┐    │
│  │     Connector Framework (Python)              │    │
│  │                                               │    │
│  │  BaseConnector                                │    │
│  │    ├─ poll_source() → List[ConnectorDoc]      │    │
│  │    ├─ incremental_sync(last_sync) → delta     │    │
│  │    └─ get_permissions() → ACL (future)        │    │
│  │                                               │    │
│  │  ConnectorDoc (normalised model)              │    │
│  │    ├─ source: str (jira/confluence/slack/...) │    │
│  │    ├─ source_id: str (unique in source)       │    │
│  │    ├─ title: str                              │    │
│  │    ├─ content: str (markdown-normalised)      │    │
│  │    ├─ url: str (link back to source)          │    │
│  │    ├─ author: str                             │    │
│  │    ├─ created_at: datetime                    │    │
│  │    ├─ updated_at: datetime                    │    │
│  │    └─ metadata: dict (source-specific)        │    │
│  └──────────────────────────────────────────────┘    │
│                       │                              │
│                       ▼                              │
│              Kafka: vault.connector-docs              │
│                       │                              │
│                       ▼                              │
│  ┌──────────────────────────────────────────────┐    │
│  │  Connector Indexer (KEDA ScaledJob)           │    │
│  │    ├─ Consume from vault.connector-docs       │    │
│  │    ├─ Chunk (reuse ObsidianMarkdownChunker)   │    │
│  │    ├─ Embed (Qwen3-Embedding-4B, 2560d)       │    │
│  │    ├─ Upsert to Qdrant (rootweaver_vault)     │    │
│  │    └─ Source metadata preserved for filtering  │    │
│  └──────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

### Why Kafka, Not Direct Qdrant Writes

1. **Existing pattern**: Vault file indexing already uses Kafka (`vault.file-events`). Adding a new topic is trivial.
2. **Decoupled**: Connectors don't need Qdrant access — they just produce messages. The indexer handles embedding and storage.
3. **Backpressure**: KEDA scales the indexer based on Kafka consumer lag. Burst of 10K Confluence pages? Indexer scales up, processes, scales back to zero.
4. **Replayable**: If the embedding model changes (like the recent Qwen3-Embedding-4B upgrade), replay the topic to re-embed all connector docs.
5. **Observable**: Kafka lag metrics already feed Prometheus → Grafana. Connector health is automatically monitored.

### Why Not Adopt Onyx Wholesale

Onyx is MIT-licensed and could be deployed alongside Rootweaver. However:

1. **Vespa dependency**: Onyx uses Vespa for search, not Qdrant. Running both vector stores doubles infrastructure.
2. **No Kafka**: Onyx uses polling + direct DB writes. We'd lose our event-driven architecture.
3. **No temporal search**: Onyx doesn't have date-aware retrieval strategies.
4. **No quality benchmarks**: No benchmark regression suite.
5. **Python connector code is portable**: Individual connector implementations (~200-400 lines each) can be adapted without adopting the full Onyx stack.

**Decision**: Build our own connector framework, borrowing Onyx's connector patterns (BaseConnector interface, Document model, incremental sync) but integrating into our existing Kafka + KEDA + Qdrant pipeline.

### Connector Interface

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional, Dict, Any, Iterator
from enum import Enum

class SourceType(str, Enum):
    VAULT = "vault"
    JIRA = "jira"
    CONFLUENCE = "confluence"
    GITLAB = "gitlab"
    SLACK = "slack"
    GOOGLE_DRIVE = "google_drive"
    NOTION = "notion"
    EMAIL = "email"
    WEB = "web"

@dataclass
class ConnectorDoc:
    """Normalised document from any source."""
    source: SourceType
    source_id: str              # Unique ID within source (e.g., JIRA issue key)
    title: str
    content: str                # Markdown-normalised content
    url: Optional[str] = None   # Link back to source
    author: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

class BaseConnector(ABC):
    """Base class for all data source connectors."""

    @abstractmethod
    def poll_source(self) -> Iterator[ConnectorDoc]:
        """Full sync — yield all documents from source."""
        ...

    @abstractmethod
    def incremental_sync(self, since: datetime) -> Iterator[ConnectorDoc]:
        """Delta sync — yield documents changed since last sync."""
        ...

    @abstractmethod
    def validate_credentials(self) -> bool:
        """Test that credentials are valid."""
        ...

    def get_source_type(self) -> SourceType:
        """Return the source type for this connector."""
        ...
```

### Connector Priority and Effort

Prioritised by value (what data is most useful for search) and effort (how hard to build):

| Priority | Connector | Value | Effort | Notes |
|----------|-----------|-------|--------|-------|
| **P0** | **Jira → Qdrant** | HIGH | LOW | Already have MCP read access. Wrap in BaseConnector, produce to Kafka. Issues, comments, worklogs become searchable. |
| **P0** | **Confluence → Qdrant** | HIGH | LOW | Already have MCP read access. Pages + comments into search index. Replaces live-query-only model. |
| **P1** | **GitLab Issues/MRs** | HIGH | MEDIUM | GitLab API. Index issue discussions, MR descriptions, code review comments. Complements code_knowledge graph. |
| **P1** | **Slack** | HIGH | MEDIUM | Slack API (Bot token). Channel messages, threads. Captures decisions made in chat that never reach docs. |
| **P2** | **Google Drive** | MEDIUM | MEDIUM | OAuth2. Docs, Sheets, Slides → markdown conversion. PDF extraction. |
| **P2** | **Notion** | MEDIUM | LOW | Notion API. Block-based → markdown conversion. |
| **P3** | **Email (IMAP)** | LOW | LOW | IMAP polling. Subject + body. Privacy-sensitive — needs careful filtering. |
| **P3** | **Web Scraping** | LOW | LOW | Targeted URL list → markdown. SearXNG already available. |
| **Future** | **Linear, Zendesk, Teams, SharePoint** | MEDIUM | MEDIUM | Enterprise connectors if the product path is pursued. |

### Comparison: Current MCP Integration vs Proposed Connectors

| Dimension | Current (MCP Tools) | Proposed (Connectors) |
|-----------|--------------------|-----------------------|
| **When data is available** | Only during active Claude Code session | Always (indexed in Qdrant) |
| **Search integration** | Separate tool call, not in RAG results | Fused with vault results via hybrid search |
| **Temporal search** | Not supported (live query) | Full temporal filtering (created_at, updated_at) |
| **Knowledge graph** | Not linked | ConnectorDocs feed document_knowledge graph |
| **Latency** | 2-5s per API call | <50ms (pre-indexed in Qdrant) |
| **Offline access** | No (requires API connectivity) | Yes (already in Qdrant) |
| **Bi-directional** | Yes (create/update issues) | Read-only ingestion. MCP tools retained for writes. |

**Key point**: Connectors **complement** the existing MCP tools, they don't replace them. MCP tools are for *writing* (create issue, update page). Connectors are for *reading at scale* (index all issues into search).

### Qdrant Collection Strategy

Two options considered:

**Option A: Single collection with source metadata** (Recommended)
- All connector docs go into `rootweaver_vault` alongside vault documents
- `source` field in payload enables filtering: `source = "jira"`, `source = "vault"`
- Hybrid search naturally fuses results from all sources
- Temporal filtering works across sources

**Option B: Separate collection per source**
- `rootweaver_jira`, `rootweaver_confluence`, etc.
- Requires federation logic at search time
- More complex, no clear benefit for single-user

**Decision**: Option A — single collection. The existing `vault_section` facet pattern extends naturally to a `source` facet.

### Deployment Model

Each connector runs as a **KEDA ScaledJob** (same pattern as scout-fleet and NER consumer):

- Triggered by a Prefect scheduled flow or Kafka message
- Scales to 0 when idle (no resource cost)
- Produces to `vault.connector-docs` Kafka topic
- Connector Indexer consumes and upserts to Qdrant

Credentials stored as **SealedSecrets** (existing pattern, ADR-013).

### Scheduling

| Connector | Sync Interval | Rationale |
|-----------|--------------|-----------|
| Jira | Every 15 min | Issues change frequently during work hours |
| Confluence | Every 1 hour | Pages change less frequently |
| GitLab | Every 30 min | MR activity during development |
| Slack | Every 5 min | Conversations are time-sensitive |
| Google Drive | Every 1 hour | Documents change infrequently |

Incremental sync (delta) by default. Full re-sync triggered manually or weekly via Prefect scheduled flow.

## Consequences

### Positive

- Jira issues, Confluence pages, GitLab MRs, and Slack messages become searchable alongside vault docs in a single query
- Temporal search works across all sources ("what happened last week" returns vault notes + Jira issues + Slack messages)
- Knowledge graph enrichment — connector docs feed entity extraction (NER pipeline) and document_knowledge graph
- Benchmark suite can evaluate cross-source retrieval quality
- Reuses existing infrastructure (Kafka, KEDA, Qdrant, Prometheus)

### Negative

- Increased Qdrant storage (~2x-5x depending on connector volume)
- More SealedSecrets to manage (one per connector's credentials)
- Connector maintenance burden — API changes, rate limits, OAuth token refresh
- Single-collection approach means noisy sources (e.g., high-volume Slack) could dilute search quality without proper weighting

### Risks

- **Slack volume**: Active Slack workspaces can produce 10K+ messages/day. Need per-channel filtering and message-length thresholds.
- **Stale data**: If a connector fails silently, indexed data becomes stale. Need health checks and staleness alerts.
- **Credential rotation**: OAuth tokens expire. Need automated refresh or alerting on expiry.

## Implementation Plan

### Phase 1: Framework + P0 Connectors (1-2 weeks)
1. Define `BaseConnector`, `ConnectorDoc` models in `rag_platform/connectors/`
2. Create `vault.connector-docs` Kafka topic
3. Build Connector Indexer (KEDA ScaledJob consuming from topic)
4. Implement `JiraConnector` (wrap existing Atlassian MCP read calls)
5. Implement `ConfluenceConnector` (wrap existing Atlassian MCP read calls)
6. Add `source` facet index to Qdrant collection
7. Verify cross-source search works in benchmark suite

### Phase 2: P1 Connectors (2-3 weeks)
8. Implement `GitLabConnector` (issues, MRs, comments via GitLab API)
9. Implement `SlackConnector` (channels, threads via Slack Bot API)
10. Add connector health dashboard to Grafana
11. Add staleness alerts to Prometheus

### Phase 3: P2+ Connectors (as needed)
12. Google Drive, Notion, Email connectors
13. Permission-aware filtering (future, if multi-user)

## Alternatives Considered

### Alternative 1: Adopt Onyx Wholesale
Deploy Onyx alongside Rootweaver for its connectors.
**Rejected**: Adds Vespa dependency, loses Kafka/KEDA pipeline, no temporal search, no benchmark integration.

### Alternative 2: MCP-Only (Current State)
Keep using MCP tools for live queries, don't index external data.
**Rejected**: Doesn't support cross-source search, no temporal filtering on external data, requires active session.

### Alternative 3: Build Connectors as MCP Tools
Add `index_jira_to_qdrant` and similar MCP tools.
**Rejected**: Manual trigger model, doesn't scale, no scheduled sync.

## References

- Onyx (Danswer) connector architecture: https://github.com/onyx-dot-app/onyx
- ADR-013: Secret Management Strategy (SealedSecrets)
- ADR-016: Modular Architecture Documentation
- Existing vault indexing: `neural-vault/vault_indexer.py`
- Existing MCP tools: `rag_platform/bridges/mcp_bridge.py`
- Federation innovation: `rag_platform/innovations/federation.py`
- Kafka topics: `vault.file-events`, `vault.file-tagged`


## Record identity correction — 14 October 2026 (VW-447)

The canonical filename and ADR registry establish this record as ADR-034. Legacy metadata/headings have been aligned with that identity. This correction does not change the historical decision or assert current deployment. Run-Id: 01a13723-c94c-7cd0-9257-8d66c0784762.
