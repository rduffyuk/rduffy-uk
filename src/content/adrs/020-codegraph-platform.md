---
id: 20
title: "Enterprise-Grade CodeGraph Platform"
status: proposed
recordedStatus: "proposed"
date: 2026-03-11
tags: ["pdg", "code-intelligence", "enterprise", "falkordb"]
sourceKind: source-record
public: true
journeyId: "2026-03-11-adr-020-a-self-hosted-code-knowledge-graph-ast-pdg-and-community-detection"
---
# ADR-020: Enterprise-Grade CodeGraph Platform

## Status
Proposed

## Date
2026-03-11 (designed), 2026-03-15 (documented)

## Jira
VW-135

## Supersedes
ADR-012 (Code Knowledge Graph Visualization) — this ADR expands the scope from visualization to a full enterprise code intelligence platform.

## Context

The Rootweaver Platform has a working PDG (Program Dependency Graph) system:
- **12,985 nodes / 16,137 edges** in FalkorDB `code_knowledge` graph (VW-131)
- **7 MCP tools** wired into production bridge (impact analysis, dependency graphs, module search)
- **703x cache speedup** (54s → 77ms per query)
- Existing K3s infrastructure: FalkorDB, Kafka, Kong, Unleash, vLLM, Langfuse, Prefect, Grafana

The goal is to evolve this from a personal tool into an **enterprise-grade code intelligence platform** ("CodeGraph") deployable at organisations like REDACTED_EMPLOYER via self-hosted Helm chart. Key drivers:

1. **Cross-repo blindness**: Dependencies between repos are invisible
2. **Impact analysis on MRs**: No automated way to assess blast radius of code changes
3. **Multi-language support**: Current parser is Python-only (ast module)
4. **Multi-tenant isolation**: Enterprise deployment requires tenant data separation
5. **Graduated AI autonomy**: LLM-powered insights with configurable trust levels
6. **REDACTED_EMPLOYER applicability**: Practice enterprise patterns on Rootweaver, export to work

### Research Findings

Three parallel research agents investigated:
- **Academic papers**: CPGs (Joern), program slicing, taint analysis, incremental graph maintenance
- **Industry approaches**: Google (Kythe/Glean), Sourcegraph, GitLab Knowledge Graph, GitHub CodeQL
- **GitHub OSS**: Emerge, FalkorDB code-graph, tree-sitter ecosystem

Key finding: **GitLab is building the same product** — their Knowledge Graph team evaluated 7 graph databases (including FalkorDB) for code intelligence via MCP. This validates the entire architecture direction.

### Market Landscape Update (2026-03-15)

**GitNexus** (github.com/abhigyanpatwari/GitNexus, 13.4K stars, PolyForm Noncommercial):
- Zero-server code intelligence engine — indexes codebases into knowledge graphs via Tree-sitter AST parsing for **13 languages**
- Uses **KuzuDB** (embedded graph with vector support) stored in `.gitnexus/`, not a server-side DB
- **Leiden community detection** automatically discovers functional module boundaries from call patterns — CodeGraph should adopt this (see Design Section 8)
- **Process-grouped search** organizes results by execution flows, not isolated symbol matches — significant UX improvement over flat impact lists
- **7 MCP tools**: `list_repos`, `query` (hybrid BM25+semantic), `context` (360° symbol view), `impact`, `detect_changes`, `rename`, `cypher`
- **Wiki generation**: LLM-powered docs from graph — potential vault integration for CodeGraph
- **Key differentiator vs CodeGraph**: GitNexus is a local CLI tool (no server); CodeGraph is a K3s-deployed enterprise service with multi-tenant isolation, CI/CD gates, and graduated AI autonomy. They serve different deployment models but share the same core insight: precomputed relational intelligence from AST graphs.

**Gemini Embedding 2** (Google, cloud-only, $0.20/M tokens):
- **84.0 MTEB Code retrieval** — best-in-class for code search. Could enhance CodeGraph's hybrid search if a vector index is added alongside the graph.
- 3,072 dimensions with Matryoshka support (128–3,072). 8,192 token input window.
- Cloud-only (no self-hosting) — conflicts with "your code never leaves your cluster" principle. Ruled out for core pipeline, but could be offered as an optional integration for teams that allow cloud embeddings.

**Cisco MCP Scanner** (github.com/cisco-ai-defense/mcp-scanner, open source):
- Security scanner for MCP servers — detects tool poisoning, rug-pull attacks, over-privileged permissions using Yara signatures + LLM-as-judge
- **Directly applicable**: CodeGraph will expose MCP tools; MCP Scanner should be part of the CI/CD security gate.

**OpenClaw** (310K+ stars, MIT, self-hosted autonomous agent):
- Multi-channel messaging (30+ platforms) and proactive scheduling — relevant for the MR Comment Service notification pattern. If CodeGraph needs to notify developers across Slack/Teams/Matrix, OpenClaw's channel abstraction is a proven pattern to reference.

## Decision

Build **CodeGraph** as a modular monolith with microservice-ready boundaries, leveraging ~60% existing K3s infrastructure. Deploy as a self-hosted Helm chart.

---

## Design Section 1: Architecture — Modular Monolith on Existing K3s Stack

### Existing Infrastructure (Reused)

```
FalkorDB      :30637  ←── code_knowledge graph stays
MCP Bridge    :30002  ←── 7 PDG tools already wired
Qdrant        :30633  ←── vault search (separate concern)
Kong          :30810  ←── API gateway, auth, rate limiting
Kafka         :30092  ←── event bus ALREADY DEPLOYED
Prefect       :30420  ←── workflow orchestration
Grafana       :30300  ←── monitoring dashboards
Unleash       :30424  ←── feature flags (graduated autonomy)
Harbor        :30500  ←── container registry
vLLM          :30800  ←── LLM inference for AI summaries
Langfuse      :30422  ←── LLM observability
```

### Architecture Diagram

```
┌─────────────────────────── CodeGraph Platform ───────────────────────────┐
│                                                                          │
│  ┌─── NEW ────────────┐   ┌─── EXISTING ───┐   ┌─── NEW ────────────┐  │
│  │  Ingestor Module   │   │                 │   │  Analyzer API      │  │
│  │                    │   │   FalkorDB      │   │                    │  │
│  │ • Multi-repo sync  │──▶│   code_knowledge│◀──│ • Impact analysis  │  │
│  │ • tree-sitter (new)│   │   graph         │   │ • MR comments      │  │
│  │ • Python ast (have)│   │   (12,985 nodes)│   │ • Pipeline gates   │  │
│  │ • Pyright on-demand│   │                 │   │ • REST + MCP       │  │
│  │ • Webhook receiver │   └─────────────────┘   └────────────────────┘  │
│  └────────────────────┘           │                      │               │
│           │                       │                      │               │
│           ▼                       ▼                      ▼               │
│  ┌─── EXISTING ───────────────────────────────────────────────────────┐  │
│  │                         Kafka (event bus)                          │  │
│  │  codegraph.ingest.events  │  codegraph.analysis.results           │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│           │                                              │               │
│           ▼                                              ▼               │
│  ┌─── NEW ────────────┐                       ┌─── REUSE ───────────┐  │
│  │  Repo Discovery    │                       │  AI Engine          │  │
│  │                    │                       │                     │  │
│  │ • GitLab/GH API    │                       │ • vLLM (EXISTING)   │  │
│  │ • Webhook config   │                       │ • Langfuse (EXIST.) │  │
│  │ • Multi-tenant     │                       │ • Unleash flags     │  │
│  └────────────────────┘                       │   for autonomy      │  │
│                                               └─────────────────────┘  │
│                                                                          │
│  ┌─── EXISTING ──────────────────────────────────────────────────────┐  │
│  │  Kong (:30810) → Auth, rate limiting, routing to all above        │  │
│  │  Grafana (:30300) → Dashboards for graph stats, ingest metrics    │  │
│  │  Prefect (:30420) → Scheduled re-indexing flows                   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

### What's New vs Reused

| Component | Status | Work Needed |
|-----------|--------|-------------|
| FalkorDB graph | **HAVE** (12,985 nodes) | Multi-repo namespace, schema versioning |
| PDG builder (Python ast) | **HAVE** (`pdg_generator/`) | Refactor into Ingestor module |
| MCP tools (7 tools) | **HAVE** (`mcp_tools.py`) | Add multi-repo context parameter |
| Kafka | **HAVE** (running) | Add `codegraph.*` topics |
| Kong | **HAVE** (running) | Add CodeGraph routes + API keys |
| Unleash | **HAVE** (running) | Add graduated autonomy flags |
| vLLM | **HAVE** (running) | Prompt templates for impact summaries |
| Prefect | **HAVE** (running) | Add scheduled re-index flows |
| Langfuse | **HAVE** (running) | Tag CodeGraph LLM calls |
| Grafana | **HAVE** (running) | Add CodeGraph dashboards |
| Harbor | **HAVE** (running) | Push CodeGraph images |
| tree-sitter parsing | **NEW** | Go, TS, Bash, Terraform, YAML parsers |
| Pyright resolution | **NEW** | On-demand symbol resolution service |
| Multi-repo Ingestor | **NEW** | Webhook receiver, repo sync, tenant isolation |
| MR Comment Service | **NEW** | GitLab/GitHub API integration |
| Pipeline Gate | **NEW** | CI/CD webhook endpoint |
| Repo Discovery API | **NEW** | Registration + webhook auto-config |
| Helm chart | **NEW** | Package everything for external deploy |

### Microservice-Readiness Pattern

Each module follows these rules:

1. **Own package** — `codegraph/ingestor/`, `codegraph/store/`, `codegraph/analyzer/`, `codegraph/ai_engine/`, `codegraph/repo_disco/`
2. **Defined interface** — each module exposes a `service.py` with a class implementing a Protocol
3. **Communication via internal bus** — Day 1: in-process function calls. Day N: swap to Kafka topics (one config change)
4. **Own data** — each module owns its schema namespace in FalkorDB
5. **Independent entrypoint** — each module has `__main__.py` for standalone execution

---

## Design Section 2: Data Model — Multi-Repo Graph Schema

### Graph Namespace Strategy

```cypher
-- Current
CREATE (n:Module {id: 'rag_platform.core.config', name: 'config', ...})

-- Enterprise
CREATE (n:Module {
  id: 'rootweaver/rootweaver-platform/rag_platform.core.config',
  name: 'config',
  tenant_id: 'rootweaver',
  repo_id: 'rootweaver-platform',
  file_path: 'rag_platform/core/config.py',
  file_checksum: 'sha256:abc123',
  last_indexed: 1741651200,
  node_type: 'module',
  language: 'python'
})
```

### Cross-Repo Edges

The killer enterprise feature — "if I change this shared library, which services across which repos break?"

```cypher
-- Same-repo edge (normal)
(config)-[:IMPORTS {repo_id: 'platform'}]->(utils)

-- Cross-repo edge (enterprise value)
(network_ops.deploy)-[:CALLS {
  repo_id: 'network-ops',
  target_repo_id: 'shared-libs',
  cross_repo: true
}]->(shared_libs.ansible_runner)
```

### Node Types (Extended)

| Type | Source | Parser |
|------|--------|--------|
| `Module` | Python `.py` | `ast` (existing) |
| `Class` | Python | `ast` (existing) |
| `Function` | Python, Go, TS, Bash | tree-sitter |
| `Method` | Python, Go, TS | tree-sitter |
| `Variable` | Python, Go, TS | tree-sitter |
| `Service` | K8s YAML | YAML parser |
| `Package` | Go `go.mod`, Python `pyproject.toml` | regex/TOML |
| `Role` | Ansible | YAML parser |
| `Task` | Ansible playbooks | YAML parser |
| `Resource` | Terraform `.tf` | HCL parser (tree-sitter-hcl) |
| `Pipeline` | CI/CD YAML | YAML parser |
| `Stage` | CI/CD YAML | YAML parser |

### Edge Types (Extended)

| Edge | Meaning | Example |
|------|---------|---------|
| `IMPORTS` | Code import | `from x import y` |
| `CALLS` | Function/method call | `router.route()` |
| `INHERITS` | Class inheritance | `class X(Base)` |
| `CONTAINS` | Parent-child | Module contains Class |
| `INSTANTIATES` | Object creation | `client = Client()` |
| `DEPLOYS` | K8s deploys code | Service → Module |
| `DEPENDS_ON` | Infra dependency | Terraform resource refs |
| `TRIGGERS` | CI/CD triggers | Pipeline → Stage → Deploy |
| `INCLUDES` | Ansible includes | Role → Task |
| `CONFIGURES` | Config reference | ConfigMap → env var → code |

### Delta Indexing (Checksum-Based)

```python
for file in repo.changed_files(since=last_indexed):
    new_checksum = sha256(file.content)
    existing = graph.query(
        "MATCH (n {file_path: $path, repo_id: $repo}) RETURN n.file_checksum",
        params={"path": file.path, "repo": repo.id}
    )
    if existing != new_checksum:
        # Parse → MERGE nodes/edges (idempotent)
        # Update file_checksum + last_indexed
```

---

## Design Section 3: Interfaces

### Interface 1: MR/PR Comments (Primary Enterprise Value)

```markdown
## 🔍 CodeGraph Impact Analysis

**Files changed**: 3 | **Blast radius**: 12 modules | **Cross-repo**: 2 repos affected

### Direct Impact
| Changed | Type | Dependents |
|---------|------|------------|
| `shared_libs/auth/token.py` | Module | 8 downstream |
| `shared_libs/auth/middleware.py` | Module | 3 downstream |

### Cross-Repo Impact ⚠️
| Repo | Module | Risk |
|------|--------|------|
| `network-ops` | `deploy.auth_check` | CALLS `token.validate()` |
| `billing-api` | `stripe.webhook_auth` | IMPORTS `middleware.verify` |

### AI Summary (Advisor Mode)
> This MR modifies the auth token validation logic. 8 internal modules
> and 2 external repos depend on `token.validate()`. The signature
> change on line 42 is backward-incompatible.
```

### Interface 2: Pipeline Gate (CI/CD Integration)

```yaml
# .gitlab-ci.yml
codegraph-gate:
  stage: validate
  image: curlimages/curl:latest
  script:
    - |
      RESULT=$(curl -s -X POST \
        "https://codegraph.internal/api/v1/gate/evaluate" \
        -H "Authorization: Bearer $CODEGRAPH_TOKEN" \
        -d '{"repo":"$CI_PROJECT_PATH","mr_iid":"$CI_MERGE_REQUEST_IID"}')
      PASS=$(echo $RESULT | jq -r '.pass')
      if [ "$PASS" != "true" ]; then
        echo "CodeGraph gate FAILED: $(echo $RESULT | jq -r '.reason')"
        exit 1
      fi
  rules:
    - if: $CI_MERGE_REQUEST_IID
```

Gate rules (configurable per-tenant via Unleash):

| Rule | Severity | Default |
|------|----------|---------|
| Cross-repo impact > 0 | WARN | Advisory only |
| Changed module has > 20 dependents | WARN | Advisory only |
| Breaking signature change detected | BLOCK | Blocks merge |
| No tests cover changed function | WARN | Advisory only |

### Interface 3: MCP Tools (Claude Code)

Extend existing 7 tools with multi-repo context:

```python
# Existing (backward compatible)
analyze_code_impact(file_path="rag_platform/core/config.py")

# Enterprise extension
analyze_code_impact(
    file_path="src/auth/token.py",
    repo="network-ops",
    include_cross_repo=True
)
```

### Interface 4: REST API

```
Kong (:30810)
  └── /api/v1/codegraph/
        ├── POST /repos                  # Register repo
        ├── GET  /repos                  # List repos
        ├── POST /repos/:id/index       # Trigger re-index
        ├── GET  /impact/:module_id     # Impact analysis
        ├── POST /gate/evaluate          # Pipeline gate
        ├── GET  /graph/stats            # Graph statistics
        └── GET  /health                 # Health check
```

### Graduated Autonomy via Unleash

| Unleash Flag | Value | Behaviour |
|--------------|-------|-----------|
| `codegraph.autonomy.level` | `advisor` | MR comments only (read-only) |
| | `validator` | MR comments + pipeline gates (blocks merges) |
| | `autonomous` | Auto-creates fix MRs for breaking changes |
| `codegraph.ai.enabled` | bool | LLM summaries on/off |
| `codegraph.cross_repo` | bool | Cross-repo analysis on/off |
| `codegraph.gate.strict` | bool | Gate blocks vs warns |

---

## Design Section 4: Ingestor — Multi-Language Parsing Pipeline

### Parser Strategy: Hybrid

```
Incoming file
     │
     ├── .py  ──→ Python ast (EXISTING) + Pyright on-demand (NEW, ambiguous only)
     ├── .go  ──→ tree-sitter-go
     ├── .ts  ──→ tree-sitter-typescript
     ├── .js  ──→ tree-sitter-javascript
     ├── .sh  ──→ tree-sitter-bash
     ├── .tf  ──→ tree-sitter-hcl
     ├── .yaml ─→ YAML parser (K8s, Ansible, CI/CD)
     └── Dockerfile ─→ Regex parser (FROM, COPY, EXPOSE)
```

### tree-sitter Integration

GitNexus (13.4K stars) has proven tree-sitter works for 13 languages at scale with native Node.js bindings. CodeGraph uses the Python `tree-sitter` bindings for consistency with the existing PDG builder. The extraction patterns (imports, exports, classes, functions, call sites) are well-documented in GitNexus's source and can be referenced as a known-good implementation.

```python
class TreeSitterParser:
    LANGUAGES = {
        '.go':  Language(tsgo.language()),
        '.ts':  Language(tsts.language_typescript()),
        '.tsx': Language(tsts.language_tsx()),
        '.sh':  Language(tsbash.language()),
        '.tf':  Language(tshcl.language()),
    }

    def parse_file(self, path: Path) -> list[Node]:
        lang = self.LANGUAGES[path.suffix]
        parser = Parser(lang)
        tree = parser.parse(path.read_bytes())
        return self._extract_nodes(tree, lang, path)
```

### Multi-Repo Ingest Flow

```
Webhook: "push to network-ops/main"
     │
     ▼
Repo Discovery validates repo is registered
     │
     ▼
Kafka: codegraph.ingest.requests
     │
     ▼
Ingestor picks up event
     │
     ├── git clone/pull (shallow, branch only)
     ├── Diff against last_indexed commit
     ├── For each changed file:
     │     ├── Select parser by extension
     │     ├── Parse → nodes + edges
     │     ├── Checksum file content
     │     └── MERGE into FalkorDB (idempotent)
     │
     ├── Delete nodes for removed files
     └── Kafka: codegraph.ingest.completed
```

### Performance Targets

| Operation | Target | Rationale |
|-----------|--------|-----------|
| Single file parse (Python ast) | <50ms | Current: ~85ms avg |
| Single file parse (tree-sitter) | <100ms | tree-sitter benchmarks |
| Delta index (100 changed files) | <30s | Webhook response time |
| Full repo index (10K files) | <10min | Initial onboarding |
| FalkorDB query (3-hop impact) | <500ms | MR comment latency budget |
| MR comment end-to-end | <60s | Including vLLM summary |

---

## Design Section 5: Helm Chart & Self-Hosted Deployment

### Deployment Tiers

```
STARTER              TEAM                 ENTERPRISE
──────────           ──────               ──────────
1 replica            2 replicas           3+ replicas
Python only          + Go, TS             All languages
Bundled FalkorDB     Bundled FalkorDB     External FalkorDB
No AI                AI summaries         Full AI + autonomy
In-process events    In-process events    Kafka events
No auth gateway      Kong optional        Kong required
No feature flags     Unleash optional     Unleash required
```

### values.yaml — Minimal Deployment

```yaml
codegraph:
  replicaCount: 1
  image:
    repository: harbor.rduffy.uk/codegraph/codegraph
    tag: "0.1.0"
  resources:
    requests: { cpu: 500m, memory: 1Gi }
    limits:   { cpu: 2,    memory: 4Gi }
  parsers:
    python: { enabled: true, resolver: ast }
    go:     { enabled: false }
    typescript: { enabled: false }
    yaml:   { enabled: true }
  autonomy: advisor
  ai:
    enabled: false
    endpoint: ""

falkordb:
  internal: true
  port: 6379
  persistence:
    size: 10Gi

kong:
  enabled: false
kafka:
  enabled: false
unleash:
  enabled: false
monitoring:
  enabled: false
```

### Our Own Deployment (Rootweaver K3s)

```yaml
# rootweaver-gitops/infrastructure/codegraph/kustomization.yaml
# Reuses existing FalkorDB (:30637), Kong (:30810), Kafka, Unleash (:30424), vLLM (:30800)
# Zero new infrastructure — just the CodeGraph Deployment
```

---

## Design Section 6: Security & Multi-Tenancy Model

### Tenant Isolation — Three Layers

```
Layer 1: Kong API Gateway (Network)
  └── API key per tenant → routes to correct graph namespace

Layer 2: FalkorDB (Data)
  └── Separate graph per tenant:repo → query can't cross graphs

Layer 3: Application (Logic)
  └── Every function receives tenant_id → no global queries exist
```

### FalkorDB — Separate Graphs Per Tenant

```
FalkorDB instance
├── GRAPH "REDACTED_EMPLOYERnetwork-ops"          ← REDACTED_EMPLOYER's network-ops repo
├── GRAPH "REDACTED_EMPLOYERbilling-api"          ← REDACTED_EMPLOYER's billing repo
├── GRAPH "REDACTED_EMPLOYERshared-libs"          ← REDACTED_EMPLOYER's shared libraries
├── GRAPH "rootweaver__platform"     ← Our own repo (dogfood)
└── GRAPH "acme__monorepo"           ← Another customer
```

**Why separate graphs?** A bug in Cypher queries **cannot** leak data across tenants — the graph boundary is enforced by FalkorDB, not application code. Each graph has its own RW lock, so tenant A's writes don't block tenant B.

### Application — Mandatory Tenant Context

```python
class GraphStore:
    def _graph_name(self, tenant_id: str, repo_id: str) -> str:
        safe_tenant = re.sub(r'[^a-zA-Z0-9-]', '', tenant_id)
        safe_repo = re.sub(r'[^a-zA-Z0-9-]', '', repo_id)
        return f"{safe_tenant}__{safe_repo}"

    def query_impact(self, tenant_id: str, repo_id: str,
                     module_id: str, depth: int = 3) -> list[dict]:
        graph = self._graph_name(tenant_id, repo_id)
        return self.falkordb.graph(graph).query(
            "MATCH (n {id: $module})-[r*1..$depth]->(m) RETURN n, r, m",
            params={"module": module_id, "depth": depth}
        )
```

### What We Never Store

| Data | Stored? | Why |
|------|:---:|-----|
| Source code | **No** | Parse AST → extract structure → discard source |
| Git credentials | **No** | Webhook pushes diff to us |
| API tokens | **K8s Secrets only** | Never in FalkorDB or logs |
| File contents | **No** | Only file paths, function names, relationships |

### GDPR / Data Deletion

```python
def delete_tenant(self, tenant_id: str) -> dict:
    for repo in self.get_tenant_repos(tenant_id):
        graph_name = self._graph_name(tenant_id, repo)
        self.falkordb.graph(graph_name).delete()  # Atomic
    self.delete_tenant_config(tenant_id)
```

### Threat Model

| Threat | Mitigation |
|--------|-----------|
| Tenant A queries Tenant B's graph | FalkorDB graph-level isolation |
| Cypher injection | Parameterized queries only (`$params`) |
| Webhook spoofing | Webhook secret validation per-tenant |
| API key theft | Kong rate limiting + key rotation |
| Source code exfiltration | We don't store source code |
| Man-in-the-middle | TLS at Kong (Cloudflare tunnel for external) |
| Privilege escalation | K8s RBAC — no cluster-admin |
| MCP tool poisoning | Cisco MCP Scanner (Yara + LLM-as-judge) in CI/CD gate |

---

## Design Section 7: AI Engine — Graduated Autonomy

### Three Autonomy Levels

```
Level 1: ADVISOR (default)
  MR opened → Graph impact query → vLLM summary → Post COMMENT → Developer decides

Level 2: VALIDATOR
  MR opened → Graph impact query → vLLM summary → Post COMMENT → Evaluate gate rules
  → BLOCKS merge if rules fail → Developer must address

Level 3: AUTONOMOUS (future)
  MR opened → Graph impact → vLLM summary + fix suggestions
  → If breaking change: auto-creates fix MRs in affected repos
  → Developer reviews AI-generated fixes
```

### Unleash Flag Configuration

| Flag | Value | Override |
|------|-------|---------|
| `codegraph.autonomy.level` | advisor | per-repo |
| `codegraph.ai.enabled` | true | |
| `codegraph.ai.model` | qwen3-8b | |
| `codegraph.gate.breaking_change` | block | |
| `codegraph.gate.high_impact` | warn | (>20 deps) |
| `codegraph.gate.cross_repo` | warn | |
| `codegraph.autonomous.auto_fix` | false | |
| `codegraph.autonomous.auto_mr` | false | |

### vLLM Prompt Templates

```python
IMPACT_SUMMARY_PROMPT = """You are a code impact analyst. Given dependency
graph data, write a concise summary for a merge request comment.

Changed files: {changed_files}
Direct dependents ({dependent_count} modules): {dependents}
Cross-repo impact ({cross_repo_count} repos): {cross_repo_hits}

Rules:
- Lead with risk level (LOW / MEDIUM / HIGH / CRITICAL)
- Explain what could break in plain English
- If cross-repo impact, list affected repos and owners
- Keep under 200 words
"""

GATE_EVALUATION_PROMPT = """Evaluate gate rules and return JSON:
{"pass": true/false, "rules_evaluated": [...], "summary": "..."}"""

FIX_SUGGESTION_PROMPT = """Generate minimal fix for each affected file.
Return as JSON array. If unsure, flag for human review."""
```

### LLM Observability via Langfuse

Every LLM call traced — per-tenant costs, per-MR latencies, quality scores. All existing Langfuse infrastructure at `:30422`.

### Autonomous Agent Safety Rails

- Unleash kill switch — disable per-tenant instantly
- Fix must parse (AST validation before commit)
- Fix MR is always a draft — never auto-merges
- Maximum 5 auto-fix MRs per trigger
- All actions logged in Langfuse with full trace

---

## Design Section 8: Cluster Discovery & Process-Grouped Search

Inspired by GitNexus's approach to architectural discovery, CodeGraph should include automatic clustering and execution flow detection.

### Leiden Community Detection

The [Leiden algorithm](https://arxiv.org/abs/1810.08473) partitions the call graph into functional communities. Unlike manual module boundaries (which follow directory structure), Leiden discovers **actual** architectural boundaries based on call density.

```
Step 1: Build call graph (CALLS, IMPORTS, INHERITS edges)
Step 2: Run Leiden algorithm (resolution=1.0, iterations=10)
Step 3: Create Community nodes with auto-generated labels
Step 4: Store MEMBER_OF edges: Function/Class → Community
```

**Implementation**: Use [graphology](https://graphology.github.io/) (JS) or [python-igraph](https://igraph.org/) (Python) for Leiden. FalkorDB stores the results as graph nodes:

```cypher
CREATE (c:Community {
  id: 'rootweaver__platform__community_7',
  tenant_id: 'rootweaver',
  repo_id: 'platform',
  label: 'RAG Search Pipeline',     -- AI-generated from member names
  member_count: 23,
  cohesion_score: 0.87
})
```

**Enterprise value**: "Show me the functional clusters in this repo" → immediate architectural overview for new team members. Drift detection: if a function's community changes across commits, flag it as an architecture smell.

### Process-Grouped Search

GitNexus proved that grouping search results by execution flows (not isolated symbols) dramatically improves developer comprehension. CodeGraph should adopt this for its MCP `query` tool:

```
Standard search: "authentication middleware"
→ 15 flat results: validate_token(), check_perms(), AuthMiddleware, ...

Process-grouped search: "authentication middleware"
→ Group 1: LoginFlow (validate_token → create_session → set_cookie)
→ Group 2: APIAuthFlow (extract_header → validate_token → check_perms)
→ Group 3: WebhookAuthFlow (verify_signature → check_ip_whitelist)
```

**Implementation**: After standard hybrid search, run a BFS from each result node along CALLS edges, identify connected subgraphs, label each as a "process". This is a post-processing step, not a new index.

### New Node/Edge Types for Clustering

| Type | Purpose |
|------|---------|
| `Community` (node) | Leiden-discovered functional cluster |
| `Process` (node) | Execution flow connecting multiple symbols |
| `MEMBER_OF` (edge) | Symbol → Community membership |
| `STEP_IN` (edge) | Symbol → Process (ordered by call sequence) |

### Phase B Addition

- [ ] Leiden clustering integration (python-igraph or networkx)
- [ ] Community node generation after each delta index
- [ ] Process detection via BFS on CALLS edges
- [ ] Process-grouped search in MCP `query` tool
- [ ] AI-generated community labels via vLLM

---

## FalkorDB Decision: Stay + Abstraction Layer

### Why FalkorDB

1. **Write serialization is irrelevant** — delta indexing produces seconds of writes per hour
2. **Read performance is king** — GraphBLAS gives 500x better p99 than Neo4j for 3-hop traversals
3. **Multi-tenant is free** — 10K+ graphs per instance, open-source (SSPL)
4. **Redis protocol compatibility** — ops teams know how to monitor/scale Redis
5. **GitLab considered it** for their Knowledge Graph (same use case)
6. **Already running** — 12,985 nodes, proven

### License: SSPL

- **Self-hosted Helm chart**: Fine — customers run it in their own cluster
- **REDACTED_EMPLOYER internal use**: Free — SSPL only blocks offering DB-as-a-service
- **SaaS offering**: Blocked — would need commercial license or backend swap

### Escape Hatches

```python
class GraphBackend(Protocol):
    def merge_node(self, tenant: str, repo: str, node: dict) -> None: ...
    def merge_edge(self, tenant: str, source: str, target: str, edge_type: str) -> None: ...
    def query_impact(self, tenant: str, module_id: str, depth: int) -> list[dict]: ...

class FalkorDBBackend: ...  # Current (server-mode, K3s)
class AGEBackend: ...       # Apache 2.0 (PostgreSQL extension)
class KuzuDBBackend: ...    # MIT (embedded, GitNexus uses this — good for STARTER tier)
```

| Scenario | Backend |
|----------|---------|
| Self-hosted Helm chart | FalkorDB (SSPL fine) |
| STARTER tier (embedded) | KuzuDB (MIT, zero-server, GitNexus-proven) |
| Managed SaaS offering | Apache AGE (Apache 2.0) |
| Performance + open source | Custom on GraphBLAS (Apache 2.0) |

---

## Consequences

### Positive

- **~60% infrastructure reused** — Kafka, Kong, Unleash, vLLM, Langfuse, Prefect, FalkorDB all existing
- **Cross-repo impact analysis** — the primary enterprise differentiator
- **Graduated autonomy** — advisor → validator → autonomous builds trust incrementally
- **Multi-language** via tree-sitter — one parsing model for all languages
- **Self-hosted model** — "your code never leaves your cluster" addresses enterprise security
- **GraphBackend abstraction** — prevents vendor lock-in on graph database

### Negative

- **Modular monolith discipline required** — must keep internal boundaries clean
- **tree-sitter integration effort** — new parser infrastructure for Go/TS/Bash/HCL
- **SSPL licensing ceiling** — can't offer hosted SaaS without backend swap
- **PDG cache still ephemeral** — `/tmp/.pdg_cache` lost on pod restart

### Risks

| Risk | Mitigation |
|------|-----------|
| FalkorDB write lock at scale | Per-graph isolation eliminates multi-tenant contention; Memgraph fallback documented |
| tree-sitter parsing accuracy | Python ast (proven) remains primary; tree-sitter for new languages only |
| LLM hallucination in fix suggestions | AST validation before commit; drafts only; human review required |
| SSPL blocks future SaaS | GraphBackend abstraction (2 days work) enables Apache AGE swap |

---

## Implementation Phases

### Phase A: Foundation (Complete)
- [x] FalkorDB graph active (12,985 nodes) — VW-131
- [x] 7 MCP tools wired — VW-131
- [x] 703x cache fix — commit `9c044da`
- [x] Leiden community detection — 98 communities (python-igraph) — 2026-03-15
- [x] Process-grouped search via BFS — 52 execution flows — 2026-03-15
- [x] 2 new MCP tools (get_communities, get_processes) — 9 total PDG tools — 2026-03-15
- [x] tree-sitter YAML parser — 285 K8s infrastructure nodes — 2026-03-15
- [x] tree-sitter JS/TS parser — 145 nodes from linkedin-preview + arch-viz — 2026-03-15
- [x] Cross-layer DEPLOYS edges — 8 K8s→Python edges (75% accuracy) — 2026-03-15
- [x] FalkorDB exporter updated for Community/Process nodes — 2026-03-15
- [x] GitNexus benchmark — 15.4% coverage vs GitNexus's 24,509 nodes — 2026-03-15
- [x] 54 unit tests — 2026-03-15
- [x] Persist PDG cache — `PDG_CACHE_DIR` env var, K3s set to `REDACTED_WORKSPACE/rootweaver-platform/.pdg_cache` — 2026-03-15
- [ ] GraphBackend Protocol abstraction
- [ ] Multi-repo namespace in graph schema

### Phase B: Multi-Language Ingestor (Mostly Complete)
- [x] tree-sitter integration (YAML, JS/TS — reference GitNexus extraction patterns) — 2026-03-15
- [x] YAML parser for K8s manifests — 2026-03-15
- [x] Leiden community detection (python-igraph) — 2026-03-15
- [x] Process-grouped search via BFS on CALLS edges — 2026-03-15
- [x] Cross-language HTTP call detection (source metadata on JS/TS nodes) — 2026-03-15
- [ ] AI-generated community labels via vLLM (currently deterministic fallback)
- [ ] Webhook receiver for GitLab push events
- [ ] Kafka topics: `codegraph.ingest.*`
- [ ] Prefect scheduled re-index flow
- [ ] Go parser (tree-sitter-go)

### Phase C: Enterprise Interfaces
- [ ] MR comment service (GitLab API)
- [ ] Pipeline gate endpoint
- [ ] REST API via Kong routes
- [ ] Repo Discovery API
- [ ] Multi-repo MCP tool extensions

### Phase D: AI Engine
- [ ] vLLM prompt templates (impact summary, gate eval, fix suggestion)
- [ ] Unleash flags for graduated autonomy
- [ ] Langfuse tracing per-tenant
- [ ] Advisor mode (MR comments)
- [ ] Validator mode (pipeline gates)

### Phase E: Packaging
- [ ] Helm chart with deployment tiers
- [ ] Harbor image builds
- [ ] Documentation for self-hosted install
- [ ] Dogfood on Rootweaver K3s

### Phase F: Autonomous (Future)
- [ ] Auto-fix MR generation
- [ ] Cross-repo fix propagation
- [ ] Safety rails (AST validation, draft-only, rate limiting)

---

## References

### Industry & Academic
- [FalkorDB vs Neo4j Benchmarks](https://www.falkordb.com/blog/graph-database-performance-benchmarks-falkordb-vs-neo4j/)
- [FalkorDB Concurrency (DeepWiki)](https://deepwiki.com/FalkorDB/FalkorDB/8-persistence-and-replication)
- [Memgraph vs Neo4j Comparison](https://memgraph.com/blog/memgraph-vs-neo4j-performance-benchmark-comparison)
- [GitLab Knowledge Graph](https://docs.gitlab.com/user/project/repository/knowledge_graph/)
- [GitLab KG DB Selection Epic](https://gitlab.com/groups/gitlab-org/-/work_items/20822)
- [Apache AGE](https://age.apache.org/overview/)
- [GraphBLAS Open Standard](http://graphblas.org/)
- [tree-sitter](https://tree-sitter.github.io/tree-sitter/)
- [Leiden Algorithm (arXiv:1810.08473)](https://arxiv.org/abs/1810.08473)

### Market Competitors / Inspiration (2026-03-15 Research)
- [GitNexus](https://github.com/abhigyanpatwari/GitNexus) — 13.4K stars, PolyForm Noncommercial. Zero-server code graph with Tree-sitter (13 languages), KuzuDB, Leiden clustering, process-grouped search, 7 MCP tools. Validates the architecture direction. Key patterns to adopt: Leiden clustering, process-grouped search.
- [KuzuDB](https://kuzudb.com/) — MIT-licensed embedded graph DB with vector support. Used by GitNexus. Viable STARTER tier backend (no server needed).
- [Cisco MCP Scanner](https://github.com/cisco-ai-defense/mcp-scanner) — Open-source MCP security scanner (Yara + LLM-as-judge). Should be integrated into CodeGraph CI/CD security gate.
- [Gemini Embedding 2](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-embedding-2/) — 84.0 MTEB Code retrieval, 3072d, multimodal. Cloud-only ($0.20/M tokens). Conflicts with self-hosted principle but could be optional integration for code search enhancement.
- [OpenClaw](https://github.com/openclaw/openclaw) — 310K stars, MIT. Multi-channel autonomous agent runtime. Reference architecture for notification delivery across Slack/Teams/Matrix.

### Internal
- VW-131: PDG Activation (Pipeline 1)
- VW-128: Architecture Review Pipeline
- VW-135: Enterprise CodeGraph Platform (this ADR)
- ADR-012: Code Knowledge Graph Visualization (superseded)
- ADR-023: HLD-Aware Architecture Review Pipeline
