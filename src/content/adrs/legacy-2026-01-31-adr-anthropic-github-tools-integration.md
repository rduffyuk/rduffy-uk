---
id: 0
title: "Anthropic GitHub Tools Integration"
status: proposed
recordedStatus: "proposed"
date: 2026-01-31
tags: ["architecture", "mcp", "anthropic", "integration"]
sourceKind: legacy-record
public: true
journeyId: "2026-01-31-legacy-adr-000-anthropic-github-tools-integration"
---
# ADR: Anthropic GitHub Tools Integration

**Date**: 2026-01-31
**Status**: Accepted (with modifications)
**Decision Makers**: Ryan Duffy

## UPDATE 2026-01-31 (Implementation Discovery)

**Key Finding**: MCP Memory and Sequential Thinking servers use **stdio transport only**, not HTTP/SSE. They cannot run as standalone K8s services.

**Resolution**: Deploy as local Claude Code plugins instead of K8s pods.
- Created: `~/.claude/plugins/mcp-memory/`
- Created: `~/.claude/plugins/sequential-thinking/`
- K8s deployments scaled to 0 (manifests retained for documentation)

## Context

Morning scan of Anthropic's GitHub (github.com/anthropics) identified several tools that could enhance the Rootweaver Platform. This ADR documents the evaluation, trade-offs, and recommended integration path.

### Current Architecture

| Component | Status | Technology |
|-----------|--------|------------|
| MCP Bridge | Running | FastMCP on K3s (rootweaver namespace, port 30002) |
| Agent Router | Active | Fast/Deep/Oracle agents with heuristic routing |
| Vector Store | Active | Qdrant (148K+ docs, Qwen3-Embedding-0.6B) |
| Search | Active | Hybrid BM25 + Vector + Temporal filtering |
| GitOps | Active | FluxCD auto-reconciliation |

## Evaluated Tools

### 1. Claude Agent SDK Python

**Repository**: github.com/anthropics/claude-agent-sdk-python (4.4k stars)

**What it does**: Python SDK for building agents that interact with Claude Code. Provides in-process MCP servers, hooks for deterministic control, and programmatic agent orchestration.

#### Key Features
- `@tool` decorator for in-process MCP tool definitions
- `ClaudeAgentOptions` for comprehensive configuration
- Hook system (`PreToolUse`) for permission control
- No subprocess IPC overhead (tools run in-process)
- Type-safe tool definitions

#### Trade-offs vs Current FastMCP

| Aspect | Current (FastMCP) | Claude Agent SDK |
|--------|-------------------|------------------|
| **Tool Definition** | `@mcp.tool()` decorator | `@tool("name", "desc", {params})` |
| **Architecture** | Standalone MCP server process | Wraps Claude Code CLI as subprocess |
| **IPC** | SSE over HTTP | In-process (SDK tools) + CLI subprocess |
| **Hooks** | ❌ None | ✅ PreToolUse for permission control |
| **Security** | ✅ Custom validation layer | ⚠️ Relies on SDK patterns |
| **Deployment** | K3s pod (NodePort 30002) | Would need architecture redesign |
| **Maturity** | 1+ year in production | Newer (released late 2025) |

#### What We Would LOSE Migrating

1. **Security Hardening** (fastmcp_bridge.py lines 10-36):
   - Custom `security_validator` with query sanitization
   - Path traversal protection
   - Injection attack prevention
   - Audit logging via `log_security_event()`

2. **Temporal Metadata System** (lines 69-200):
   - `extract_temporal_metadata()` with frontmatter priority
   - Content hashing for version tracking
   - Date range filtering (`start_date`, `end_date`)

3. **Agent Router Hot-Reload** (lines 771-800):
   - Watches router module for changes
   - Reloads without restart

4. **Lazy Loading Pattern** (lines 38-51):
   - HybridSearch loaded on demand
   - Reduces startup time

5. **15+ Production Tools**:
   - `auto_search_vault` with complexity-based routing
   - `hybrid_search_vault` (BM25 + Vector + RRF fusion)
   - `search_with_reranking` (cross-encoder)
   - `explore_vault_structure`, `grep_vault_content`
   - GPU/Ollama monitoring tools

#### What We Would GAIN

1. **Hook System**: Deterministic control over tool execution
2. **In-Process Tools**: No IPC overhead for new tools
3. **Official SDK**: Anthropic-maintained, likely future enhancements
4. **Type Safety**: Better tool parameter validation

#### Recommendation: **KEEP FastMCP, ADD SDK FOR NEW FEATURES**

**Rationale**: Migration cost outweighs benefits. Instead, use hybrid approach:
- Keep FastMCP as primary MCP bridge (production-proven)
- Use Agent SDK for new agent-to-agent communication patterns
- SDK hooks could wrap FastMCP tools for permission control

---

### 2. MCP Memory Server

**Repository**: github.com/modelcontextprotocol/servers/tree/main/src/memory

**What it does**: Knowledge graph-based persistent memory with entities, relations, and observations.

#### Architecture
```
MCP Memory Server (JSONL storage)
├── Entities: Named nodes with types and observations
├── Relations: Directed connections (active voice)
└── Storage: memory.jsonl (configurable path)
```

#### Tools Exposed
- `create_entities` / `delete_entities`
- `create_relations` / `delete_relations`
- `add_observations` / `delete_observations`
- `read_graph` / `search_nodes` / `open_nodes`

#### Integration Value

| Current Capability | Memory Server Adds |
|-------------------|-------------------|
| Qdrant (vector similarity) | Entity relationships |
| BM25 (keyword matching) | Graph traversal |
| Temporal filtering | Observation history |
| Document chunks | Entity-level abstraction |

**Example Use Case**:
- Current: "Search for ChromaDB" → Returns chunks mentioning ChromaDB
- With Memory: "What tools depend on ChromaDB?" → Returns entities with `depends_on` relations

#### Deployment Plan
```yaml
# rootweaver-gitops/infrastructure/rootweaver/mcp-memory/
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mcp-memory
  namespace: rootweaver
spec:
  template:
    spec:
      containers:
      - name: mcp-memory
        image: modelcontextprotocol/server-memory:latest
        env:
        - name: MEMORY_FILE_PATH
          value: /data/memory.jsonl
        volumeMounts:
        - name: memory-data
          mountPath: /data
      volumes:
      - name: memory-data
        persistentVolumeClaim:
          claimName: mcp-memory-pvc
```

**Port Allocation**: 30650 (after Code Graph) or 30651

**Recommendation**: ✅ **IMPLEMENT** - Low risk, high value, complements existing search

---

### 3. Sequential Thinking Server

**Repository**: github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking

**What it does**: Enables multi-step reasoning chains with revision and branching capabilities.

#### Thought Sequence Structure
```python
{
    "thought": "Current reasoning step",
    "thoughtNumber": 1,
    "totalThoughts": 5,  # Dynamic, adjustable
    "needsMoreThoughts": True,
    "isRevision": False,  # Optional: revisit earlier thought
    "revisesThought": None,  # Which thought to revise
    "branchFromThought": None,  # Fork point
    "branchId": None  # Unique branch identifier
}
```

#### OracleAgent Enhancement Value

| Current Oracle | With Sequential Thinking |
|---------------|-------------------------|
| Single-pass synthesis | Multi-step decomposition |
| Fixed response | Revise as understanding evolves |
| Linear reasoning | Branching for alternatives |
| ~15-30s one-shot | Structured thought chain |

**Integration Point**: Wire into `OracleAgent` for complex research queries

**Recommendation**: ✅ **IMPLEMENT** - Enhances deep research capabilities

---

### 4. Skills (document-skills)

**Repository**: github.com/anthropics/skills

**What it does**: Teachable skill packages for Claude. The `document-skills` package adds DOCX, PDF, PPTX, and XLSX creation/editing.

#### Installation (Quick Win)
```bash
# In Claude Code
/plugin marketplace add anthropics/skills
/plugin install document-skills@anthropic-agent-skills
```

#### Use Cases
- Export journal entries → formatted PDFs
- Generate architecture docs → PPTX presentations
- Data exports → XLSX spreadsheets
- Vault reports → DOCX documents

**Recommendation**: ✅ **IMPLEMENT TODAY** - 5-minute install, immediate value

---

## Decision Matrix

| Tool | Effort | Risk | Value | Priority |
|------|--------|------|-------|----------|
| Skills (document-skills) | Low (5 min) | Low | Medium | **P0 - Today** |
| MCP Memory Server | Medium (2-3 hrs) | Low | High | **P1 - This Week** |
| Sequential Thinking | Medium (1-2 hrs) | Low | Medium | **P2 - This Week** |
| Claude Agent SDK | High (days) | Medium | Medium | **P3 - Research More** |

## Implementation Plan

### Phase 1: Quick Wins (Today)
1. Install `document-skills` via plugin marketplace
2. Test PDF/DOCX export from vault content

### Phase 2: Knowledge Graph (This Week)
1. Write K8s manifests for MCP Memory Server
2. Allocate port 30651 in platform guardrails
3. Commit to rootweaver-gitops
4. Wire into MCP bridge as additional tool source
5. Create initial entity graph from vault structure

### Phase 3: Enhanced Reasoning (This Week)
1. Deploy Sequential Thinking server to K3s
2. Allocate port 30652
3. Integrate with OracleAgent for complex queries
4. Test with multi-hop research scenarios

### Phase 4: SDK Evaluation (Future Sprint)
1. Create proof-of-concept using Agent SDK
2. Test hook system for permission control
3. Evaluate in-process tool performance
4. Decide on hybrid vs migration approach

## Consequences

### Positive
- Knowledge graph adds relationship queries (currently impossible)
- Sequential thinking improves complex research quality
- Document skills enable export workflows
- No disruption to existing MCP bridge

### Negative
- Additional K8s pods to maintain (2 new services)
- Memory server needs PVC for persistence
- Potential context window pressure from graph data

### Neutral
- Agent SDK decision deferred (not blocking)
- Existing FastMCP remains primary interface

## References

- Anthropic GitHub: https://github.com/anthropics
- Claude Agent SDK: https://github.com/anthropics/claude-agent-sdk-python
- MCP Servers: https://github.com/modelcontextprotocol/servers
- Skills Repository: https://github.com/anthropics/skills
- Current FastMCP Bridge: `neural-vault/fastmcp_bridge.py`

---

**Next Action**: Install document-skills today, begin MCP Memory deployment tomorrow

*📖 Related: platform-guardrails *(internal reference; not included)* | mcp-integration *(internal reference; not included)* | k3s-deployment *(internal reference; not included)**
