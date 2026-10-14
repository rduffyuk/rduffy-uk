---
id: 17
title: "SRE Agent Architecture — Autonomous Infrastructure Monitoring with Change Intelligence"
status: proposed
recordedStatus: "Proposed"
date: 2026-02-20
tags: ["architecture", "sre", "agent", "alertmanager", "kafka", "change-intelligence", "remediation", "causal-reasoning"]
sourceKind: source-record
public: true
journeyId: "2026-02-20-adr-017-sre-agent-architecture-autonomous-infrastructure-monitoring-with-change-intelligence"
---
# ADR-017: SRE Agent Architecture — Autonomous Infrastructure Monitoring with Change Intelligence

**Status**: Proposed
**Date**: 2026-02-20
**Jira**: VW-105
**Deciders**: Ryan Duffy
**Inspired By**: [NetClaw](https://github.com/automateyournetwork/netclaw) agent pattern, adapted for Rootweaver K3s infrastructure

---

## Context

### Problem Statement

The Rootweaver platform runs 22+ K3s namespaces with ~50 pods, Kafka event streams, GPU workloads, and a multi-device mesh (Desktop + MacBook). Current monitoring is reactive:

- **Alertmanager** fires SLO burn-rate alerts → Discord webhook → human reads and reacts
- **Kafka** topics produce events (eip.pipeline.executed, eip.audit.log, etc.) → no automated consumer for operational intelligence
- **Code changes** (GitLab commits/MRs to `rootweaver-platform` and `rootweaver-gitops`) deploy via FluxCD → no pre-deployment risk analysis
- **Incidents** require manual RCA — no correlation between alerts, code changes, and historical patterns

### Scale of the Problem

| Metric | Current State |
|--------|--------------|
| Alert sources | Alertmanager (SLO burn-rate, infra rules) |
| Kafka topics | 6 EIP topics + DLQ, unmonitored operationally |
| Pods monitored | ~50 across 22 namespaces |
| Mean time to detect | Minutes (Alertmanager) to hours (silent failures) |
| Mean time to resolve | 30min–4hrs (manual investigation) |
| Change frequency | 5-15 commits/day across 2 GitLab repos |
| Historical incidents | VW-51/52 (memory leak), VW-62 (crash loop), VW-86 (event loop) — all required manual deep-dive |

### Why Now

Three recent incidents demonstrate the need:

1. **VW-51/52** (Memory Leak): Dead `import chromadb` paths leaked 7.5GB per replica over weeks. Health checks passed. An agent watching memory trends + correlating with deployment history would have caught this within hours.
2. **VW-62** (Kafka Consumer Crash Loop): 837 restarts over 2 days. An agent monitoring restart counts + Kafka consumer lag would have escalated immediately.
3. **VW-86** (Asyncio Event Loop): 100% graph ingestion failure from event loop mismatch after a code change. Pre-deploy diff analysis would have flagged `asyncio.run()` usage in a singleton context.

---

## Decision

We will build a **four-engine SRE agent** deployed as a **microservice pair** (event-collector + sre-brain) on K3s, using a **hybrid LLM strategy** (vLLM for routine, Claude API for critical/novel), operating in **four operational modes** (NORMAL/CHANGE/MAINTENANCE/DEV_ACTIVE), with **episodic memory** backed by Qdrant and **causal graph reasoning** via FalkorDB.

### Architecture Selection: Microservice Split (Approach B)

Three approaches were evaluated:

| Approach | Topology | Pros | Cons |
|----------|----------|------|------|
| A. SRE Copilot | Single pod | Simple, low latency | Single point of failure, tight coupling |
| B. Microservice Split | Two pods (collector + brain) | Independent scaling, fault isolation, clear data flow | Inter-pod latency, more complex deployment |
| C. Prefect-Hybrid | Event-triggered flows | Leverages existing Prefect | Cold start latency, not suited for real-time triage |

**Selected**: Approach B — aligns with industry consensus pattern (Unified Data Plane → Reasoning Layer) observed in KubeIntellect, cloud-sre-agent, and Confluent's event-driven agent architectures. The collector can restart independently without losing brain state, and the brain can be upgraded without missing events (Kafka durability).

---

## Architecture

### Four-Engine Model

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     ROOTWEAVER SRE AGENT                                │
├─────────────────────┬───────────────────────┬──────────────────────────┤
│   RESPONSE ENGINE   │  PREDICTION ENGINE    │    DIRECTION ENGINE      │
│   (Reactive)        │  (Proactive)          │    (Strategic)           │
│                     │                       │                          │
│ • Alert triage      │ • Pre-deploy risk     │ • Codebase trajectory    │
│ • Causal graph RCA  │   scoring             │ • ADR alignment          │
│ • Episodic memory   │ • Steady-state drift  │ • Tech debt hotspots     │
│ • Runbook execution │   detection           │ • Dependency freshness   │
│ • Escalation paths  │ • SLO burn-rate       │ • Architecture drift     │
│                     │   forecasting         │                          │
├─────────────────────┴───────────────────────┴──────────────────────────┤
│                      REMEDIATION ENGINE (Generative)                    │
│                                                                         │
│ • Analyze failure → Generate fix → Verify backward compat → Propose MR │
│ • Revert-or-forward decision logic                                      │
│ • GitLab MR creation with test evidence                                 │
│ • Consumer map validation (MCP tools, APIs, Kafka schemas, K8s svc)    │
└─────────────────────────────────────────────────────────────────────────┘
```

### Pod Architecture

```
┌──────────────────────────────────────────────┐
│              POD 1: EVENT-COLLECTOR           │
│              (rootweaver namespace)           │
│                                              │
│  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Alertmanager  │  │ Kafka Consumer       │  │
│  │ Webhook       │  │ (eip.*, sre.*)       │  │
│  │ Receiver      │  │                      │  │
│  └──────┬───────┘  └──────────┬───────────┘  │
│         │                     │              │
│  ┌──────┴─────────────────────┴───────────┐  │
│  │         Event Normalizer               │  │
│  │  • Dedup (session_id + monotonic TTL)  │  │
│  │  • Enrich (pod labels, namespace)      │  │
│  │  • Mode detection (NORMAL/CHANGE/...)  │  │
│  └──────────────┬─────────────────────────┘  │
│                 │                             │
│  ┌──────────────┴─────────────────────────┐  │
│  │ GitLab Webhook Receiver                │  │
│  │  • Push events (main branch)           │  │
│  │  • MR events (opened, merged)          │  │
│  │  • Pipeline status events              │  │
│  └──────────────┬─────────────────────────┘  │
│                 │                             │
│  ┌──────────────┴─────────────────────────┐  │
│  │ Drift Detector                         │  │
│  │  • Steady-state metric baselines       │  │
│  │  • Periodic comparison (every 60s)     │  │
│  └──────────────┬─────────────────────────┘  │
│                 │                             │
│                 ▼                             │
│         Kafka Producer                       │
│  sre.incidents.normalized                    │
│  sre.changes.analyzed                        │
└──────────────────────────────────────────────┘
                  │
                  │ Kafka
                  ▼
┌──────────────────────────────────────────────┐
│              POD 2: SRE-BRAIN                │
│              (rootweaver namespace)           │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │     BDI Cognitive State              │    │
│  │  Beliefs: cluster state, metrics     │    │
│  │  Desires: SLO targets, ADR goals     │    │
│  │  Intentions: active investigations   │    │
│  └──────────────┬───────────────────────┘    │
│                 │                             │
│  ┌──────────────┴───────────────────────┐    │
│  │     Context Enrichment               │    │
│  │  • Qdrant: episodic memory recall    │    │
│  │  • FalkorDB: causal graph traversal  │    │
│  │  • PDG: code dependency analysis     │    │
│  │  • Vault: historical pattern match   │    │
│  └──────────────┬───────────────────────┘    │
│                 │                             │
│  ┌──────────────┴───────────────────────┐    │
│  │     Reasoning Layer                  │    │
│  │  • Skill-based analysis (6 skills)   │    │
│  │  • LLM triage (vLLM or Claude API)   │    │
│  │  • Bayesian RCA probability          │    │
│  │  • Change correlation scoring        │    │
│  └──────────────┬───────────────────────┘    │
│                 │                             │
│  ┌──────────────┴───────────────────────┐    │
│  │     Action Router                    │    │
│  │  • READ-ONLY: auto-execute           │    │
│  │    (kubectl get, logs, describe,     │    │
│  │     metric queries, vault search)    │    │
│  │  • MUTATIONS: human approval gate    │    │
│  │    (rollout restart, scale, patch,   │    │
│  │     GitLab MR creation)             │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  Output Channels:                            │
│  • Discord (alerts, summaries)               │
│  • Jira (auto-create VW issues)              │
│  • GitLab (MR proposals)                     │
│  • Vault (episodic memory write-back)        │
└──────────────────────────────────────────────┘
```

---

## Kafka Topics

### New Topics

| Topic | Producer | Consumer | Schema |
|-------|----------|----------|--------|
| `sre.incidents.normalized` | event-collector | sre-brain | `{severity, source, fingerprint, labels, mode, timestamp, raw}` |
| `sre.changes.analyzed` | event-collector | sre-brain | `{commit_sha, repo, files_changed, risk_score, diff_summary, author, timestamp}` |
| `sre.actions.proposed` | sre-brain | (human review UI / Discord) | `{action_type, target, command, risk, justification, requires_approval}` |
| `sre.memory.episodes` | sre-brain | (self-consume for replay) | `{episode_id, incident_ref, mode, beliefs, actions, outcome, timestamp}` |

### Existing Topics (Consumed)

| Topic | Purpose |
|-------|---------|
| `eip.pipeline.executed` | Detect pipeline failures/anomalies |
| `eip.audit.log` | Track API usage patterns |
| `eip.search.events` | Monitor search performance degradation |
| `eip.dlq` | Dead letter queue — automatic escalation trigger |

### Configuration

```yaml
# Strimzi KafkaTopic CRDs
apiVersion: kafka.strimzi.io/v1beta2
kind: KafkaTopic
metadata:
  name: sre.incidents.normalized
  labels:
    strimzi.io/cluster: rootweaver-kafka
spec:
  partitions: 3
  replicas: 1
  config:
    retention.ms: 604800000    # 7 days
    max.message.bytes: 1048576 # 1MB (claim-check for larger)
    cleanup.policy: delete
```

---

## Skill Templates

Domain-specific runbook prompts loaded as markdown skill files. Each skill encodes operational knowledge that would otherwise require human expertise.

### Skill: k8s-pod-triage

```markdown
# K8s Pod Triage Skill

## Trigger
Pod in CrashLoopBackOff, Error, or OOMKilled state

## Investigation Steps
1. `kubectl describe pod {pod} -n {namespace}` — check events, exit codes
2. `kubectl logs {pod} -n {namespace} --previous` — last crash output
3. `kubectl top pod {pod} -n {namespace}` — resource usage at failure
4. Cross-reference with recent deployments in sre.changes.analyzed
5. Check if pod's image tag changed in last 24h (FluxCD reconciliation)

## Decision Tree
- Exit code 137 → OOMKilled → Check memory limits vs actual usage
- Exit code 1 → Application error → Parse logs for exception
- Repeated restarts → Check liveness probe config and startup time
- Image pull error → Check Harbor registry health and image tag

## Escalation
- >5 restarts in 10min → P2 alert to Discord
- >20 restarts in 1hr → P1 alert + auto-create Jira incident
```

### Skill: kafka-consumer-health

```markdown
# Kafka Consumer Health Skill

## Trigger
Consumer lag >1000 messages OR consumer group rebalancing repeatedly

## Investigation Steps
1. Check consumer lag: `kafka-consumer-groups --describe --group {group}`
2. Check broker health: `kubectl get pods -n kafka`
3. Check topic retention vs consumption rate
4. Cross-reference with producer throughput changes
5. Check for poison messages in DLQ topic

## Decision Tree
- Lag increasing linearly → Consumer too slow → Check processing time per message
- Lag spike then recovery → Temporary burst → Monitor, no action
- Consumer rebalancing → Check pod restarts, network policies
- DLQ growing → Poison messages → Inspect message format, schema changes

## Known Patterns (from vault)
- VW-62: Crash loop from oversized messages → claim-check pattern
- Large JSONL sessions exceed message.max.bytes → check payload size
```

### Skill: slo-burn-analysis

```markdown
# SLO Burn-Rate Analysis Skill

## Trigger
SLO burn-rate alert from Alertmanager (recording rules in slo-alerting-rules.yaml)

## Investigation Steps
1. Query Prometheus: `slo:burn_rate:5m{service="{service}"}`
2. Compare against 1h, 6h, 3d windows for trend analysis
3. Identify which SLI is degrading (latency, error rate, throughput)
4. Correlate with recent deployments (sre.changes.analyzed within 2h window)
5. Check downstream dependencies (dependency graph from FalkorDB)

## Decision Tree
- Fast burn (5m window) → Active incident → Immediate triage
- Slow burn (6h window) → Gradual degradation → Investigate resource exhaustion
- Multi-service burn → Shared dependency failure → Check data layer pods
- Burn after deploy → Change-correlated → Flag commit in sre.changes.analyzed
```

### Additional Skills

| Skill | Trigger | Focus |
|-------|---------|-------|
| `gpu-thermal-response` | GPU temp >80C or VRAM >90% | vLLM pod health, model offloading |
| `rag-pipeline-debug` | Search latency >2s or error rate >1% | Gateway → Retriever → Qdrant chain |
| `network-policy-debug` | Connection refused between pods | NetworkPolicy rules, egress/ingress checks |

---

## Operational Modes

### Mode Definitions

| Mode | Trigger | Alert Behavior | Memory Tagging | Duration |
|------|---------|---------------|----------------|----------|
| **NORMAL** | Default state | Full response engine active | `mode: normal` | Indefinite |
| **CHANGE** | FluxCD reconciliation, `kubectl rollout restart`, GitLab pipeline running | Observe + correlate (suppress non-critical alerts for 15min) | `mode: change_event` | Auto-expires after 15min post-last-change |
| **MAINTENANCE** | Alertmanager silence active, K8s node cordon/drain | Suppress all non-P1 alerts, log only | `mode: maintenance` | Matches Alertmanager silence duration |
| **DEV_ACTIVE** | Claude Code OTEL events detected, high commit frequency | Elevate alert thresholds (+2x), reduce notification frequency | `mode: dev_activity` | 30min after last detected activity |

### Mode Detection Signals

```python
class ModeDetector:
    """Detects operational mode from multiple signals."""

    def detect_mode(self) -> OperationalMode:
        # Priority order: MAINTENANCE > CHANGE > DEV_ACTIVE > NORMAL

        if self._alertmanager_silence_active():
            return OperationalMode.MAINTENANCE

        if self._fluxcd_reconciling() or self._recent_deployment(window_minutes=15):
            return OperationalMode.CHANGE

        if self._claude_code_active() or self._high_commit_frequency(threshold=3, window_minutes=30):
            return OperationalMode.DEV_ACTIVE

        return OperationalMode.NORMAL
```

### Post-Change Verification Sweep

When CHANGE mode expires, the agent automatically runs a verification sweep:

1. **Pod Health**: All pods in affected namespaces are Running with 0 recent restarts
2. **SLO Check**: No active burn-rate alerts in last 5 minutes
3. **Kafka Lag**: Consumer lag within normal bounds (< 500 messages)
4. **Endpoint Probe**: HTTP health checks on affected service endpoints
5. **Resource Delta**: Memory/CPU usage within 20% of pre-change baseline

If any check fails, the agent transitions back to CHANGE mode and escalates.

---

## Change Intelligence

### Three Levels of Change Awareness

```
Level 1: Change Correlation (Reactive)
─────────────────────────────────────
Alert fires → Check: "Was there a deployment in the last 2 hours?"
If yes → Include change context in RCA

Level 2: Change-Aware RCA (Reactive + Context)
──────────────────────────────────────────────
Alert fires → Retrieve commit diff → Identify changed files
→ Cross-reference with affected pod's codebase (PDG)
→ Bayesian probability: P(incident | change) vs P(incident | no_change)

Level 3: Pre-Emptive Change Analysis (Predictive)
─────────────────────────────────────────────────
GitLab webhook (push to main) → Retrieve diff
→ PDG impact analysis (which modules/pods affected)
→ Vault pattern match (similar diffs that caused past incidents)
→ LLM diff review (known anti-patterns)
→ Risk score: LOW / MEDIUM / HIGH / CRITICAL
→ If CRITICAL: Block deploy notification to Discord + Jira
```

### GitLab Webhook Integration

```yaml
# GitLab webhook → event-collector
POST /webhooks/gitlab

Events consumed:
- Push Events (commits to main)
- Merge Request Events (opened, merged, closed)
- Pipeline Events (success, failure)
```

### Pre-Deploy Risk Scoring

Based on DRS-OSS research: "Gating only the riskiest 30% of diffs captures 86.4% of defect-inducing commits" (arXiv:2412.06981).

```python
class PreDeployAnalyzer:
    """Score deployment risk from commit diff."""

    def score_risk(self, commit: GitCommit) -> RiskAssessment:
        signals = []

        # 1. File entropy: How many distinct modules touched?
        modules_touched = self.pdg.get_affected_modules(commit.files_changed)
        signals.append(("module_spread", len(modules_touched) / self.pdg.total_modules))

        # 2. Historical risk: Did similar file patterns cause past incidents?
        similar_incidents = self.memory.search(
            query=f"incident caused by changes to {commit.files_changed}",
            filter={"mode": "normal"},  # Only count real incidents
            n_results=5
        )
        signals.append(("historical_risk", len(similar_incidents) / 5))

        # 3. Anti-pattern detection (LLM-based)
        diff_review = self.llm.analyze(
            prompt=DIFF_REVIEW_PROMPT,
            context=commit.diff,
            max_tokens=500
        )
        signals.append(("anti_pattern_score", diff_review.risk_score))

        # 4. Dependency depth: How deep in the dependency graph?
        max_depth = max(self.pdg.get_depth(f) for f in commit.files_changed)
        signals.append(("dependency_depth", min(max_depth / 10, 1.0)))

        # Weighted composite score
        weights = {"module_spread": 0.2, "historical_risk": 0.3,
                   "anti_pattern_score": 0.35, "dependency_depth": 0.15}
        score = sum(weights[k] * v for k, v in signals)

        return RiskAssessment(
            score=score,
            level=self._score_to_level(score),  # LOW/MEDIUM/HIGH/CRITICAL
            signals=signals,
            recommendation=diff_review.recommendation
        )
```

---

## Direction Engine

### Purpose

Track codebase trajectory against architectural intent (ADRs) and detect strategic drift, not just operational failures.

### Capabilities

| Capability | Description | Data Source |
|------------|-------------|-------------|
| **Trajectory Tracking** | Is the codebase converging on or diverging from ADR decisions? | Git history + ADR vault docs |
| **ADR Alignment** | Per-ADR compliance score based on actual code state | ADRs + codebase scan |
| **Tech Debt Hotspots** | Files with highest churn × complexity × incident correlation | Git log + PDG + incident memory |
| **Dependency Freshness** | Stale dependencies, security vulnerabilities, EOL warnings | `requirements.txt`, `package.json`, NVD CVE database |
| **Architecture Drift** | Actual service topology vs documented HLD/LLD | K8s API + HLD/LLD vault docs |

### Trajectory Patterns

```python
class TrajectoryPattern(Enum):
    CONVERGING = "converging"       # Code moving toward ADR intent
    DIVERGING = "diverging"         # Code moving away from ADR intent
    DRIFTING = "drifting"           # Unrelated to any ADR (organic growth)
    DEBT_ACCUMULATING = "debt"      # Shortcuts accumulating in hotspot files
```

### Example Output

```
Direction Engine Weekly Report (2026-02-20)
──────────────────────────────────────────
ADR-016 (Modular Docs):     CONVERGING ✅  (8/10 modules split)
ADR-012 (Journal Quality):  CONVERGING ✅  (quality gates active)
ADR-011 (LLM Context):      DRIFTING ⚠️   (no recent work, context limits unchanged)

Tech Debt Hotspots:
  1. rag_platform/agents/router.py     — 47 commits, 3 incident correlations
  2. neural-vault/fastmcp_bridge.py    — 32 commits, 2 incident correlations
  3. rag_platform/api/gateway.py       — 28 commits, 1 incident correlation

Dependency Alerts:
  - chromadb==0.4.x: No longer used (ADR: migrated to Qdrant) — REMOVE
  - strimzi-kafka: v0.40 available (current: v0.38) — MINOR update
```

---

## Remediation Engine

### Purpose

When the Response Engine identifies a root cause AND the brain has high confidence (>0.8 Bayesian probability), the Remediation Engine can generate a fix proposal.

### Workflow

```
Incident Detected
       │
       ▼
┌─────────────────┐     No      ┌──────────────────┐
│ Root cause       ├────────────►│ Escalate to human │
│ identified?      │             └──────────────────┘
└───────┬─────────┘
        │ Yes
        ▼
┌─────────────────┐     No      ┌──────────────────┐
│ Confidence >0.8? ├────────────►│ Include in RCA    │
│                  │             │ report only       │
└───────┬─────────┘             └──────────────────┘
        │ Yes
        ▼
┌─────────────────┐
│ Generate fix     │
│ (revert or       │
│  forward-fix)    │
└───────┬─────────┘
        │
        ▼
┌─────────────────┐     Fail    ┌──────────────────┐
│ Backward compat  ├────────────►│ Reject fix,      │
│ check passes?    │             │ propose manual    │
└───────┬─────────┘             └──────────────────┘
        │ Pass
        ▼
┌─────────────────┐
│ Create GitLab MR │
│ with evidence:   │
│ • Incident ref   │
│ • Root cause     │
│ • Test results   │
│ • Risk score     │
└─────────────────┘
```

### Backward Compatibility Guardian

Before any remediation is proposed, it must pass compatibility checks:

| Check | Method | Example |
|-------|--------|---------|
| **MCP Tool Signatures** | Parse `@mcp.tool()` decorators, compare input/output schemas | Removing a parameter from `auto_search_vault` would break Claude Code |
| **API Response Schemas** | Pydantic model comparison, field additions OK, removals blocked | Removing `trace_id` from `SearchResponse` would break consumers |
| **Kafka Message Schemas** | JSON schema diff on topic message formats | Renaming `severity` to `level` in `sre.incidents.normalized` |
| **K8s Service Names/Ports** | Check service YAML for name/port changes | Renaming `chromadb` service would break all pods using DNS discovery |
| **Helm Values Interface** | Compare values.yaml keys before/after | Removing a values.yaml key breaks downstream overrides |

```python
class BackwardCompatChecker:
    """Verify proposed changes don't break consumers."""

    def check(self, diff: GitDiff) -> CompatResult:
        violations = []

        # Check MCP tool signatures
        for file in diff.files_matching("**/mcp_bridge*.py"):
            old_tools = self._extract_mcp_tools(file.old_content)
            new_tools = self._extract_mcp_tools(file.new_content)
            for tool_name, old_sig in old_tools.items():
                if tool_name in new_tools:
                    if not self._is_compatible(old_sig, new_tools[tool_name]):
                        violations.append(CompatViolation(
                            type="mcp_tool_signature",
                            tool=tool_name,
                            detail=f"Breaking change in {tool_name} signature"
                        ))
                else:
                    violations.append(CompatViolation(
                        type="mcp_tool_removed",
                        tool=tool_name,
                        detail=f"Tool {tool_name} removed — consumers will fail"
                    ))

        # Check API schemas, Kafka schemas, K8s services...
        # (similar pattern for each consumer type)

        return CompatResult(
            compatible=len(violations) == 0,
            violations=violations
        )
```

---

## Memory Model

### Episodic Memory (Qdrant)

Each incident investigation is stored as an episode with mode tagging to prevent context pollution.

```python
@dataclass
class Episode:
    episode_id: str              # UUID
    timestamp: datetime
    mode: OperationalMode        # NORMAL, CHANGE, MAINTENANCE, DEV_ACTIVE
    incident_ref: Optional[str]  # Alertmanager fingerprint or Jira key

    # BDI snapshot
    beliefs: Dict[str, Any]      # Cluster state at time of incident
    desires: List[str]           # Active SLO targets
    intentions: List[str]        # Investigation steps taken

    # Outcome
    root_cause: Optional[str]
    resolution: Optional[str]
    confidence: float            # 0.0-1.0
    duration_seconds: int

    # Tags for filtered retrieval
    services_involved: List[str]
    namespaces: List[str]
    change_correlated: bool

    # Embedding vector (generated from summary text)
    summary: str                 # Human-readable narrative for embedding
```

### Memory Retrieval with Mode Filtering

```python
def recall_similar_incidents(
    self,
    current_incident: str,
    mode_filter: Optional[OperationalMode] = None,
    exclude_modes: Optional[List[OperationalMode]] = None,
    n_results: int = 5
) -> List[Episode]:
    """
    Retrieve episodic memory with mode-aware filtering.

    Key: During NORMAL mode, exclude MAINTENANCE and DEV_ACTIVE episodes
    to prevent false pattern matches from noise events.
    """
    filters = {}
    if mode_filter:
        filters["mode"] = mode_filter.value
    if exclude_modes:
        filters["mode"] = {"$nin": [m.value for m in exclude_modes]}

    results = self.qdrant.search(
        collection_name="sre_episodes",
        query_text=current_incident,
        query_filter=filters,
        limit=n_results
    )
    return [Episode.from_qdrant(r) for r in results]
```

### Causal Graph (FalkorDB)

Service topology and causal relationships stored as a graph for probabilistic RCA.

```cypher
// Node types
(:Service {name, namespace, port, health_status})
(:Alert {fingerprint, severity, source, timestamp})
(:Change {commit_sha, repo, risk_score, timestamp})
(:Incident {jira_key, root_cause, resolution, confidence})

// Relationships
(s1:Service)-[:DEPENDS_ON {protocol, port}]->(s2:Service)
(a:Alert)-[:FIRED_FOR]->(s:Service)
(c:Change)-[:DEPLOYED_TO]->(s:Service)
(i:Incident)-[:CAUSED_BY]->(c:Change)
(i:Incident)-[:AFFECTED]->(s:Service)
(a:Alert)-[:CORRELATED_WITH]->(i:Incident)
```

### Bayesian RCA

```python
def compute_root_cause_probability(
    self,
    alert: Alert,
    candidate_causes: List[CauseCandidate]
) -> List[Tuple[CauseCandidate, float]]:
    """
    P(cause | alert) ∝ P(alert | cause) × P(cause)

    - P(cause): Prior from historical frequency
    - P(alert | cause): Likelihood from causal graph edge weights
    """
    results = []
    for cause in candidate_causes:
        prior = self.graph.get_edge_weight(cause.node, alert.service)
        likelihood = self.memory.count_co_occurrences(
            cause_type=cause.type,
            alert_fingerprint=alert.fingerprint
        ) / max(self.memory.total_episodes, 1)

        posterior = prior * likelihood
        results.append((cause, posterior))

    # Normalize
    total = sum(p for _, p in results)
    return [(c, p / total) for c, p in results] if total > 0 else results
```

---

## Safety Mechanisms

### Semi-Autonomous Action Model

| Action Type | Examples | Approval | Rationale |
|-------------|----------|----------|-----------|
| **READ-ONLY** | `kubectl get`, `kubectl logs`, `kubectl describe`, Prometheus queries, vault search, Kafka consumer lag check | Auto-execute | No side effects, no state changes |
| **DIAGNOSTIC** | `kubectl exec -- curl healthcheck`, `kubectl top`, port-forward for testing | Auto-execute | Temporary, no persistent changes |
| **MUTATION** | `kubectl rollout restart`, `kubectl scale`, `kubectl delete pod` | Human approval required | Changes cluster state |
| **EXTERNAL** | Create Jira issue, send Discord alert, create GitLab MR | Auto-execute (write to external systems) | Auditable, reversible |
| **DESTRUCTIVE** | `kubectl delete deployment`, `helm uninstall`, force-push | BLOCKED — never auto-execute | Irreversible |

### Circuit Breakers

Inspired by Hyx patterns in cloud-sre-agent:

```python
class LLMCircuitBreaker:
    """Prevent cascading failures from LLM unavailability."""

    def __init__(self, failure_threshold=3, recovery_timeout=60):
        self.failure_count = 0
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.state = CircuitState.CLOSED  # CLOSED=healthy, OPEN=tripped
        self.last_failure = None

    async def call(self, llm_func, *args, **kwargs):
        if self.state == CircuitState.OPEN:
            if time.monotonic() - self.last_failure > self.recovery_timeout:
                self.state = CircuitState.HALF_OPEN
            else:
                return self._fallback_response(*args, **kwargs)

        try:
            result = await asyncio.wait_for(llm_func(*args, **kwargs), timeout=30)
            self.failure_count = 0
            self.state = CircuitState.CLOSED
            return result
        except (asyncio.TimeoutError, Exception) as e:
            self.failure_count += 1
            if self.failure_count >= self.failure_threshold:
                self.state = CircuitState.OPEN
                self.last_failure = time.monotonic()
            return self._fallback_response(*args, **kwargs)

    def _fallback_response(self, *args, **kwargs):
        """Rule-based fallback when LLM is unavailable."""
        return TriageResult(
            severity="unknown",
            action="escalate_to_human",
            reason="LLM circuit breaker open — falling back to rule-based triage"
        )
```

### Rate Limiting

| Resource | Limit | Rationale |
|----------|-------|-----------|
| LLM calls (vLLM) | 20/min | Protect GPU from inference storms |
| LLM calls (Claude API) | 5/min | Cost control ($3/MTok input, $15/MTok output) |
| Kubernetes API | 60/min | Prevent API server overload |
| GitLab API | 10/min | Respect rate limits |
| Discord webhooks | 10/min | Prevent notification fatigue |
| Jira creation | 5/hr | Prevent issue spam |

### Immune System Pattern: Self/Non-Self Discrimination

The agent maintains a "known good" baseline of cluster state (inspired by biological immune systems):

```python
class SteadyStateModel:
    """Digital twin of healthy cluster state."""

    def __init__(self):
        self.baselines = {}  # service -> {metric: (mean, stddev)}

    def learn_baseline(self, service: str, metrics: Dict[str, float]):
        """Update rolling baseline from healthy observations."""
        if service not in self.baselines:
            self.baselines[service] = {}
        for metric, value in metrics.items():
            if metric not in self.baselines[service]:
                self.baselines[service][metric] = RunningStats()
            self.baselines[service][metric].update(value)

    def is_anomalous(self, service: str, metrics: Dict[str, float]) -> List[Anomaly]:
        """Compare current state against learned baseline."""
        anomalies = []
        baseline = self.baselines.get(service, {})
        for metric, value in metrics.items():
            if metric in baseline:
                z_score = baseline[metric].z_score(value)
                if abs(z_score) > 3.0:  # >3 sigma = anomaly
                    anomalies.append(Anomaly(
                        service=service,
                        metric=metric,
                        value=value,
                        expected=baseline[metric].mean,
                        z_score=z_score
                    ))
        return anomalies
```

---

## Deployment Specification

### K3s Resources

```yaml
# Pod 1: Event Collector
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sre-event-collector
  namespace: rootweaver
spec:
  replicas: 1
  template:
    spec:
      containers:
        - name: event-collector
          image: REDACTED_PRIVATE_IP:30500/rootweaver/sre-event-collector:latest
          ports:
            - containerPort: 8090  # Webhook receiver
          resources:
            requests:
              memory: "256Mi"
              cpu: "100m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          env:
            - name: KAFKA_BOOTSTRAP
              value: "rootweaver-kafka-bootstrap.kafka.svc:9092"
            - name: ALERTMANAGER_URL
              value: "http://prometheus-alertmanager.monitoring.svc:9093"
            - name: GITLAB_WEBHOOK_SECRET
              valueFrom:
                secretKeyRef:
                  name: sre-agent-secrets
                  key: gitlab-webhook-secret

---
# Pod 2: SRE Brain
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sre-brain
  namespace: rootweaver
spec:
  replicas: 1
  template:
    spec:
      containers:
        - name: sre-brain
          image: REDACTED_PRIVATE_IP:30500/rootweaver/sre-brain:latest
          resources:
            requests:
              memory: "512Mi"
              cpu: "200m"
            limits:
              memory: "1Gi"
              cpu: "1000m"
          env:
            - name: KAFKA_BOOTSTRAP
              value: "rootweaver-kafka-bootstrap.kafka.svc:9092"
            - name: QDRANT_URL
              value: "http://qdrant.rootweaver.svc:6333"
            - name: FALKORDB_URL
              value: "redis://falkordb.rootweaver.svc:6379"
            - name: VLLM_URL
              value: "http://vllm.vllm.svc:8000"
            - name: CLAUDE_API_KEY
              valueFrom:
                secretKeyRef:
                  name: sre-agent-secrets
                  key: claude-api-key
            - name: DISCORD_WEBHOOK_URL
              valueFrom:
                secretKeyRef:
                  name: sre-agent-secrets
                  key: discord-webhook-url
```

### NodePort Allocation

| Service | Port | Purpose |
|---------|------|---------|
| sre-event-collector webhook | 30850 | GitLab webhook receiver |
| sre-brain API (future) | 30851 | Human review UI / status dashboard |

### NetworkPolicy

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: sre-agent-network
  namespace: rootweaver
spec:
  podSelector:
    matchLabels:
      app: sre-brain
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: rootweaver
  egress:
    - to:
        - namespaceSelector:
            matchLabels:
              name: kafka
      ports:
        - port: 9092
    - to:
        - namespaceSelector:
            matchLabels:
              name: rootweaver
      ports:
        - port: 6333  # Qdrant
        - port: 6379  # FalkorDB
    - to:
        - namespaceSelector:
            matchLabels:
              name: vllm
      ports:
        - port: 8000  # vLLM
    - to:
        - namespaceSelector:
            matchLabels:
              name: monitoring
      ports:
        - port: 9090  # Prometheus
        - port: 9093  # Alertmanager
    - to:  # External: Claude API, GitLab, Discord
        - ipBlock:
            cidr: 0.0.0.0/0
            except:
              - REDACTED_PRIVATE_IP/8
              - REDACTED_PRIVATE_IP/12
              - REDACTED_PRIVATE_IP/16
      ports:
        - port: 443
```

---

## LLM Strategy

### Hybrid Model Selection

| Scenario | Model | Rationale |
|----------|-------|-----------|
| Routine alert triage | vLLM (local, GPU) | Low latency, no cost, handles >80% of cases |
| Diff review / anti-pattern detection | vLLM (local, GPU) | Sufficient for pattern matching in code |
| Novel incident (no episodic memory match) | Claude API | Superior reasoning for unknown scenarios |
| Remediation code generation | Claude API | Better code quality for safety-critical fixes |
| Direction Engine weekly report | Claude API | Complex multi-source synthesis |
| Backward compat analysis | vLLM (local, GPU) | Schema comparison is structured, LLM validates edge cases |

### Cost Estimation

| Component | Monthly Volume | Unit Cost | Monthly Cost |
|-----------|---------------|-----------|-------------|
| vLLM (local) | ~10,000 calls | $0 (own GPU) | $0 |
| Claude API (escalation) | ~200 calls | ~$0.05/call avg | ~$10 |
| Qdrant storage | ~10K episodes/year | Included (self-hosted) | $0 |
| FalkorDB queries | ~5,000/month | Included (self-hosted) | $0 |
| **Total** | | | **~$10/month** |

---

## Research Basis

This architecture is informed by the following sources:

### Academic Papers

| Source | Key Insight | Applied Where |
|--------|-------------|---------------|
| **KubeIntellect** (arXiv, 2025) | LLM-driven K8s management with multi-agent collaboration | Overall agent architecture, skill-based prompting |
| **CrewAI SRE** (ICSSSM-25, 2025) | Multi-agent SRE with role specialization | Four-engine separation of concerns |
| **DRS-OSS** (arXiv:2412.06981) | Diff risk scoring: "30% of diffs → 86.4% of defects" | Pre-deploy risk scoring thresholds |
| **A-MEM** (arXiv, 2024) | Agentic memory with self-organizing episodic retrieval | Episodic memory model, mode-tagged retrieval |

### Open-Source Implementations

| Project | Key Insight | Applied Where |
|---------|-------------|---------------|
| **cloud-sre-agent** (GitHub) | Circuit breakers (Hyx), health checks, fallback patterns | LLM circuit breaker, safety mechanisms |
| **sre-ai-agent** (GitHub) | Python SRE agent with LLM integration | Agent structure, tool patterns |
| **IncidentFox** (GitHub) | Change-aware incident management | Change correlation in RCA |

### Industry Patterns

| Source | Key Insight | Applied Where |
|--------|-------------|---------------|
| **Confluent** | Event-driven AI agents with Kafka backbone | Kafka as inter-pod message bus |
| **Causely** | Causal reasoning for RCA (not just correlation) | FalkorDB causal graph, Bayesian RCA |
| **BDI Architecture** (Bratman, 1987) | Belief-Desire-Intention cognitive model | BDI state in sre-brain, prevents alert thrashing |
| **Immune System Pattern** | Self/non-self discrimination for anomaly detection | Steady-state model, baseline learning |

---

## Consequences

### Positive

- **Faster MTTR**: Automated triage + episodic memory recall should reduce mean time to resolve from hours to minutes for known incident patterns
- **Pre-emptive detection**: Change intelligence catches ~86% of risky deploys before they cause incidents (based on DRS-OSS research)
- **Architectural health**: Direction Engine provides continuous visibility into ADR compliance and tech debt accumulation
- **Knowledge retention**: Episodic memory ensures lessons from past incidents (VW-51, VW-62, VW-86) are automatically recalled for future similar events
- **Low cost**: Self-hosted components (vLLM, Qdrant, FalkorDB) keep running costs to ~$10/month (Claude API only)

### Negative / Trade-offs

- **Complexity**: Two-pod architecture + 4 Kafka topics + 6 skills + 4 modes = significant operational surface area
- **Cold start**: Episodic memory is empty at launch — agent effectiveness increases over time as it observes more incidents
- **LLM dependency**: Novel incidents require Claude API — if Anthropic API is down, agent degrades to rule-based triage only
- **False positives**: Pre-deploy risk scoring will flag some safe changes — requires tuning the risk threshold over time
- **Maintenance burden**: Skills need updating as infrastructure evolves — stale skills could provide wrong guidance

### Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Agent creates too many Jira issues | Medium | Low | Rate limit: 5/hr max, dedup by fingerprint |
| Remediation Engine proposes broken fix | Low | High | Backward compat checker + human approval gate |
| Memory poisoning from noisy mode | Medium | Medium | Mode tagging + filtered retrieval |
| vLLM overloaded by agent + search workloads | Low | Medium | Rate limit: 20 LLM calls/min, separate queue |
| GitLab webhook DDoS | Low | Low | Rate limit + HMAC signature validation |

---

## Implementation Phases

| Phase | Scope | Effort | Dependencies |
|-------|-------|--------|-------------|
| **Phase 1** | Event Collector + Alertmanager integration + basic Response Engine | 2-3 weeks | Kafka topics, webhook receiver |
| **Phase 2** | SRE Brain + episodic memory + skill-based triage | 2-3 weeks | Qdrant collection, vLLM integration |
| **Phase 3** | GitLab webhook + Change Intelligence (Level 1-2) | 1-2 weeks | GitLab webhook config, PDG integration |
| **Phase 4** | Pre-deploy risk scoring (Level 3) + Direction Engine | 2-3 weeks | PDG, vault historical data |
| **Phase 5** | Remediation Engine + backward compat checker | 2-3 weeks | GitLab MR API, schema extraction |
| **Phase 6** | Causal graph (FalkorDB) + Bayesian RCA | 1-2 weeks | FalkorDB service topology |

**Total estimated**: 10-16 weeks, phased delivery with each phase independently valuable.

---

## Alternatives Considered

### A. Single Pod Architecture

Single Python process handling all functions. Simpler deployment but:
- No fault isolation (brain crash loses event buffering)
- Cannot scale collector independently
- Rejected in favor of microservice split

### B. Prefect-Hybrid

Use Prefect flows triggered by events. Leverages existing infrastructure but:
- Cold start latency (flow scheduling adds 5-15s)
- Not suited for real-time alert triage
- Rejected for real-time engine, may complement for batch analysis

### C. Off-the-Shelf (PagerDuty AIOps, BigPanda)

Commercial SRE AI tools. Would provide:
- Faster time to value
- Less maintenance burden
But:
- No integration with vault/episodic memory
- No change intelligence from GitLab
- No Direction Engine (codebase trajectory)
- Subscription cost >> $10/month
- Rejected: our platform's unique value is deep integration with existing knowledge systems

---

## Navigation

Home *(internal reference; not included)* | [ADRs](/adrs/) | HLD *(internal reference; not included)* | LLD *(internal reference; not included)*
