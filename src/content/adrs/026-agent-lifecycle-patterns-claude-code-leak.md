---
id: 26
title: "Agent Lifecycle Patterns — Lessons from Claude Code Source Leak"
status: proposed
recordedStatus: "Proposed"
date: 2026-04-01
tags: ["architecture", "agent-lifecycle", "memory", "performance", "benchmark"]
sourceKind: source-record
public: true
journeyId: "2026-04-01-adr-026-agent-lifecycle-patterns-lessons-from-claude-code-source-leak"
---
# ADR-026: Agent Lifecycle Patterns — Lessons from Claude Code Source Leak

**Status**: Proposed
**Date**: 2026-04-01
**Jira**: VW-182
**Benchmark Baseline**: Run 38 (2026-03-31) — Overall 0.67

## Context

On 2026-03-31, Anthropic accidentally published Claude Code v2.1.88 to npm with a 59.8MB source map containing 512,000 lines of unobfuscated TypeScript across ~1,900 files. The leak exposed the entire agent harness — tool loop, permission model, multi-agent orchestration, memory system, context management, and several unreleased features.

Rootweaver and Claude Code solve fundamentally different problems — Rootweaver is a **server-side knowledge retrieval platform** (hybrid search, graph fusion, temporal filtering), while Claude Code is a **client-side coding agent harness** (tool orchestration, permission model, terminal UI). However, Claude Code's **agent lifecycle patterns** — how it manages context, memory, caching, and parallel execution — are directly applicable to improving Rootweaver's agent layer.

This ADR evaluates 8 patterns from the leak for adoption, measuring each against current benchmark performance and implementation cost.

### Current Performance Baseline (Run 38)

| Category | Faithfulness | Relevancy | Ctx Precision | Ctx Recall | MRR | P50 Latency |
|----------|-------------|-----------|---------------|-----------|-----|-------------|
| Factual | 0.76 | 0.48 | 0.36 | 0.35 | 0.57 | 5.3s |
| Temporal | 0.84 | 0.56 | 0.64 | 0.76 | 0.80 | 0.07s |
| Analytical | 0.86 | 0.64 | 0.50 | 0.42 | 0.66 | 22.6s |
| Cross-Domain | 0.78 | 0.50 | 0.38 | 0.34 | 0.56 | 31.1s |
| Code Intel | 0.96 | 0.84 | 0.72 | 0.70 | 0.90 | 0.04s |
| Freshness | 0.78 | 0.44 | 0.38 | 0.47 | 0.70 | 4.2s |
| **Overall** | **0.83** | **0.58** | **0.50** | **0.51** | **0.70** | — |

**Key weaknesses**: Relevancy (0.58), Context Precision (0.50), Deep Research latency (22-31s), Freshness staleness (12 days).

### Current System Gaps (from audit)

- **PersistentMemory**: SQLite with SQL LIKE search, no semantic retrieval, no compaction, unbounded growth
- **Agent dispatch**: Single-agent per query, no fan-out/fan-in, no result merging
- **vLLM**: Prefix caching not enabled despite native support
- **Circuit breaker**: No exponential backoff, no metrics export, no compaction circuit breaker
- **Semantic cache**: O(n) linear scan, pure Python cosine similarity, in-memory only
- **Alert triage**: No LLM-based classifier for SRE Agent

---

## Decisions

### Pattern 1: Parallel Sub-Agent Fan-Out (ADOPT)

**What Claude Code does**: Three execution models — Fork (byte-identical context copy, shared prompt cache), Teammate (file-based mailbox, own context), Worktree (isolated git branch). Fork model means spawning 5 agents costs barely more than 1 due to prompt cache sharing.

**What Rootweaver needs**: The Fork model applied to search. Currently `UnifiedAgentRouter` selects exactly one agent per query. For ambiguous queries (complexity 3-5), dispatching FastSearch + GraphSearch + DeepSearch in parallel via `asyncio.gather()` and merging results with RRF would improve both relevancy and context precision.

**The MongoDB analogy**: This is like MongoDB's `$facet` aggregation — one query fans out to multiple pipelines, results merge into a single document. Rootweaver already has `GraphVectorFusion` doing RRF (graph_weight=0.4, vector_weight=0.6). The same fusion pattern extends to agent-level fan-out.

**Implementation**:
```python
# New method in UnifiedAgentRouter
async def fan_out_search(self, query: str, agents: list[str], config: dict) -> list:
    tasks = [self._execute_with_agent(query, agent, config) for agent in agents]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    return self._rrf_merge([r for r in results if not isinstance(r, Exception)])
```

**Predicted benchmark impact**:

| Metric | Current | Predicted | Mechanism |
|--------|---------|-----------|-----------|
| Relevancy | 0.58 | 0.65-0.70 | Multiple retrieval strategies surface different relevant docs |
| Context Precision | 0.50 | 0.55-0.60 | RRF fusion promotes docs that appear in multiple result sets |
| Cross-Domain MRR | 0.56 | 0.65-0.70 | Graph search catches connections that vector search misses |
| Analytical Latency | 22.6s | 12-15s | Parallel execution, wall clock = max(agents) not sum(agents) |

**Measurement**: Run benchmark with fan-out enabled for complexity 3-5 queries. Compare relevancy, context precision, and latency per category. Success = relevancy > 0.63, latency < 15s for analytical.

**Effort**: Medium (2-3 days). Router changes + RRF merger + Unleash flag for gradual rollout.

---

### Pattern 2: vLLM Prefix Caching with Stable/Dynamic Boundary (ADOPT)

**What Claude Code does**: System prompt split at `__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__`. Above = stable (~3K tokens, cached globally via Blake2b prefix hash). Below = dynamic (per-session CLAUDE.md, MCP tools, environment). Functions touching the stable portion annotated `DANGEROUS_uncachedSystemPromptSection()`. 14 cache-break vectors tracked with "sticky latches" that prevent mid-session flag toggles from busting the cache.

**What Rootweaver needs**: Every vLLM call (complexity scoring, Oracle reasoning, query refinement, DeepSearch GAV) rebuilds the full prompt from scratch. The system prompt for complexity scoring, persona definitions, and tool descriptions are identical across all calls. With vLLM's `--enable-prefix-caching`, the KV cache for these shared prefixes would be computed once and reused.

**Implementation**:
1. Add `--enable-prefix-caching` to `vllm-statefulset.yaml` args
2. Restructure prompts: static persona/tool/instruction block first (stable prefix), query-specific content last (dynamic suffix)
3. Ensure all agent prompts share the same prefix ordering

**Current vLLM args** (from `rootweaver-gitops/infrastructure/vllm/vllm-statefulset.yaml`):
```
--model=/models/DeepSeek-R1-0528-Qwen3-8B-AWQ
--max-model-len=114688
--gpu-memory-utilization=0.95
--max-num-seqs=6
--kv-cache-dtype=fp8
--enable-sleep-mode
```
No `--enable-prefix-caching` present.

**Predicted benchmark impact**:

| Metric | Current | Predicted | Mechanism |
|--------|---------|-----------|-----------|
| Analytical Latency | 22.6s | 15-18s | Complexity scoring + GAV iterations skip KV recomputation |
| Cross-Domain Latency | 31.1s | 20-25s | Oracle multi-hop reasoning reuses prefix KV |
| Factual Latency | 5.3s | 3-4s | Single scoring call benefits from cached prefix |

**Measurement**: Compare vLLM TTFT (time to first token) before/after. Prometheus metric `vllm:time_to_first_token_seconds`. Success = >30% TTFT reduction on repeated prompt prefixes.

**Effort**: Low (1 day). Single flag in gitops manifest + prompt reordering.

---

### Pattern 3: Tiered Memory — Index/Collection Pattern (ADOPT)

**What Claude Code does**: Three-tier memory with strict write discipline:
- **Tier 1 — Index** (`MEMORY.md`): Always loaded into context. Pointers only, ~150 chars/line. Like a book's table of contents.
- **Tier 2 — Topic files**: Actual knowledge content. Loaded on demand when the index pointer is referenced. Like reading a specific chapter.
- **Tier 3 — Transcripts**: Raw historical record. Never loaded into context, grep-only. Like the full library archive.

Write discipline: topic file first, then update index. Never dump content into the index.

**The MongoDB analogy** (as you described): MongoDB's architecture separates **indexes** (B-tree structures, always in WiredTiger cache / RAM) from **collections** (full BSON documents on disk, paged into memory on demand). The index tells you WHERE to find data; the collection holds the data itself. You never store the full document in the index — that would defeat the purpose.

Claude Code's `MEMORY.md` = MongoDB index. Topic files = MongoDB collection documents. The "never dump content into the index" rule = MongoDB's principle that indexes should be small, selective, and always fit in RAM.

**What Rootweaver's PersistentMemory currently does**: Everything in one flat SQLite table. Episodes are full rows with `query`, `agent_used`, `result_summary`, `success`, `timestamp`. Retrieval is `SQL LIKE` scan — equivalent to a MongoDB collection scan without any index. O(n) per lookup, no semantic similarity, no relevance ranking.

**Implementation — Three-tier episode memory**:

```
Tier 1: Episode Index (always queryable, lightweight)
┌─────────────────────────────────────────────────────┐
│ id | query_hash | topic_cluster | agent | success   │
│    | timestamp  | relevance_score                    │
│    | → pointer to Tier 2 detail                      │
└─────────────────────────────────────────────────────┘

Tier 2: Episode Details (loaded on demand)
┌─────────────────────────────────────────────────────┐
│ id | full_query | full_result_summary | context_docs │
│    | latency_ms | search_strategy | scores           │
└─────────────────────────────────────────────────────┘

Tier 3: Raw Transcripts (archive, never loaded)
┌─────────────────────────────────────────────────────┐
│ Full query/response pairs, debug traces, tool calls │
│ Grep-only access for debugging/auditing             │
└─────────────────────────────────────────────────────┘
```

Add semantic search on Tier 1 via embedding the `query_hash` + `topic_cluster` into a small Qdrant collection (separate from `rootweaver_vault`):
```python
# Episode retrieval: semantic similarity on index, then load detail on demand
similar_episodes = qdrant.search("episode_index", query_embedding, limit=5)
for ep in similar_episodes:
    if ep.score > 0.85:
        detail = sqlite.get_episode_detail(ep.id)  # Tier 2 load
```

**Predicted benchmark impact**:

| Metric | Current | Predicted | Mechanism |
|--------|---------|-----------|-----------|
| Relevancy | 0.58 | 0.60-0.63 | Agent learns which strategies work for which query types |
| Context Precision | 0.50 | 0.52-0.55 | Historical success data informs retrieval strategy selection |
| Freshness | 0.47 recall | 0.55-0.60 | Episode memory tracks which topics change frequently |

**Measurement**: Track episode retrieval hit rate, episode-informed routing accuracy, and memory growth rate over 30 days. Success = >10% episode-informed routing improvement, memory stays <50MB.

**Effort**: Medium (3-4 days). New SQLite schema, Qdrant episode collection, `PersistentMemory` refactor, episodic search integration.

---

### Pattern 4: Episode Consolidation — autoDream-lite (ADOPT)

**What Claude Code does**: Background `autoDream` process triggers after 24hrs + 5 sessions. Merges observations, resolves contradictions between memory entries, converts vague notes to verified facts. Runs during idle periods. Consolidation is append-only daily logs.

**What Rootweaver needs**: A Prefect scheduled flow (nightly, like the existing consistency check) that:
1. Reads all episodes from the last 24hrs
2. Clusters by query topic (embedding similarity)
3. For each cluster: identifies best-performing agent/strategy combination
4. Promotes winning patterns to long-term memory (`routing_hints` table)
5. Prunes duplicate/redundant episodes
6. Detects contradictions (same query type, different agents, divergent success rates)

**Implementation**: Prefect flow, scheduled nightly alongside `nightly_consistency_check.py`.

```python
@flow(name="episode-consolidation", log_prints=True)
async def consolidate_episodes():
    episodes = load_recent_episodes(hours=24)
    clusters = cluster_by_topic(episodes)  # embedding similarity
    for cluster in clusters:
        best = max(cluster, key=lambda e: e.success_score)
        upsert_routing_hint(cluster.topic, best.agent, best.strategy)
        prune_redundant(cluster)
    resolve_contradictions(clusters)
```

**Predicted benchmark impact**:

| Metric | Current | Predicted | Mechanism |
|--------|---------|-----------|-----------|
| Relevancy | 0.58 | 0.62-0.66 | Routing learns from episode success/failure over time |
| Overall | 0.67 | 0.70-0.72 | Compounding effect of better routing decisions |

**Measurement**: Track routing hint hit rate (% of queries where a hint exists and was used), compare agent selection accuracy before/after. Success = routing hint coverage >60% of query topics after 2 weeks, overall benchmark >0.70.

**Effort**: Medium (2-3 days). Prefect flow + clustering logic + routing hint table + integration with `UnifiedAgentRouter`.

---

### Pattern 5: Context Compaction Cascade (ADOPT — Partial)

**What Claude Code does**: 5-strategy cascade:
1. **Tool Result Budgeting** — large outputs saved to disk, model sees summary + path
2. **Context Collapse** ("marble_origami") — progressive compression of older segments
3. **Session Memory** — key facts extracted to file
4. **Full Compact (Autocompact)** — summarize entire conversation at 95% context
5. **Snip (PTL Truncation)** — drop oldest messages, fast and lossy

Critical detail: **autocompact circuit breaker** — after 3 consecutive failures, compaction disabled for the session. This 3-line fix stopped burning ~250K API calls/day.

**What Rootweaver needs**: Not the full cascade (RW doesn't have multi-turn conversations), but two specific patterns:

**5a. Result budgeting for DeepSearch**: DeepSearch GAV iterations accumulate context. Apply tool-result-budgeting pattern: after each GAV iteration, summarize intermediate results before feeding into next iteration. Currently each iteration passes full results forward.

**5b. Circuit breaker for reranker cold-start**: The DeepSearch reranker cold-start is a known issue. Apply CC's circuit breaker pattern: after N consecutive reranker timeouts, skip reranking for the rest of that request and fall back to raw Qdrant scores.

**Implementation**:
```python
# 5a: GAV iteration budgeting
async def gather_action_verify(query, max_iterations=3):
    summary = ""
    for i in range(max_iterations):
        results = await search(query, context=summary)  # summary, not full results
        summary = await summarize(results, query)  # compress before next iteration

# 5b: Reranker circuit breaker (add to existing circuit_breaker.py)
reranker_breaker = get_breaker("reranker", failure_threshold=2, timeout=15)
```

**Predicted benchmark impact**:

| Metric | Current | Predicted | Mechanism |
|--------|---------|-----------|-----------|
| Analytical Latency | 22.6s | 16-19s | GAV iterations process less redundant context |
| Cross-Domain Latency | 31.1s | 22-26s | Reranker circuit breaker avoids cold-start stalls |
| Faithfulness | 0.83 | 0.85 | Less context noise = more faithful extraction |

**Measurement**: Compare DeepSearch latency and faithfulness before/after. Track reranker circuit breaker open events in Prometheus. Success = analytical P50 < 18s, zero reranker-stall incidents.

**Effort**: Low-Medium (1-2 days). GAV summary injection + reranker circuit breaker.

---

### Pattern 6: Circuit Breaker Improvements (ADOPT)

**What Claude Code does**: Autocompact circuit breaker with a hard 3-failure limit that disables expensive operations for the rest of the session. Saved ~250K API calls/day.

**What Rootweaver's circuit breaker lacks**: No exponential backoff, no jitter, no Prometheus metrics, half-open testing limited to 1 request via asyncio.Lock.

**Implementation**: Enhance existing `circuit_breaker.py`:
1. Add exponential backoff with jitter on retry
2. Export breaker state changes to Prometheus (`circuit_breaker_state_changes_total`)
3. Add `max_lifetime_failures` parameter — after N total failures (not just consecutive), permanently degrade to fallback for that service
4. Integrate with Grafana alerting

**Predicted benchmark impact**: Indirect — prevents cascade failures during vLLM restarts, Qdrant maintenance, or reranker cold-starts. Reduces P99 latency spikes.

**Measurement**: Track `circuit_breaker_state_changes_total` in Grafana. Success = zero unrecovered cascade failures in 30-day window.

**Effort**: Low (1 day). Existing code, just enhancements.

---

### Pattern 7: LLM-as-Gate for Alert Triage (EVALUATE)

**What Claude Code does**: "Prompt" hook handler sends to Haiku-class model for single-turn semantic evaluation. Fast, cheap, context-aware gate without custom scripts.

**What Rootweaver needs**: SRE Agent currently has no LLM-based alert classifier. Alertmanager sends to Kafka, but severity classification is rule-based. A Haiku/Qwen3-8B single-token classifier could triage alerts (critical/warning/info) before engaging the full vLLM-powered SRE brain.

**Implementation**: Add a lightweight classifier stage in the SRE event-collector:
```python
# Single-token classification via Ollama (CPU, no GPU cost)
severity = await ollama.classify(
    prompt=f"Classify alert severity (CRITICAL/WARNING/INFO): {alert.summary}",
    model="qwen3-8b",
    max_tokens=1
)
if severity == "CRITICAL":
    await forward_to_sre_brain(alert)  # Full vLLM reasoning
else:
    await log_and_archive(alert)  # Skip expensive inference
```

**Predicted benchmark impact**: Not directly measurable via search benchmark. Reduces vLLM load during alert storms → more capacity for search queries → indirect latency improvement.

**Measurement**: Track % of alerts that skip full SRE brain processing. Success = >70% of INFO/WARNING alerts triaged without vLLM.

**Effort**: Low (1 day). Ollama call + routing logic in event-collector.

---

### Pattern 8: Proactive Health Agent — KAIROS-lite (EVALUATE)

**What Claude Code does**: KAIROS daemon with 15-second heartbeat, autonomous observation, `autoDream` nightly consolidation. Full autonomous agency.

**What Rootweaver needs**: Not full KAIROS autonomy, but a periodic self-assessment. A Prefect scheduled flow (hourly or on-cron) that:
1. Checks Qdrant doc count vs vault file count (drift detection)
2. Runs 3 canary queries from golden test set, compares against expected scores
3. Checks staleness: when was the newest non-benchmark doc indexed?
4. Reports to Discord/Grafana if any metric degrades

This is essentially extending the existing `nightly_consistency_check.py` with search quality probes.

**Predicted benchmark impact**: Catches freshness regressions early. Current freshness staleness = 12 days — a proactive check would have flagged this after day 3.

**Measurement**: Time-to-detect for regressions. Success = regressions detected within 1 hour vs current "noticed during manual benchmark run."

**Effort**: Medium (2 days). Prefect flow + canary queries + alerting integration.

---

## Consequences

### Positive

- **Relevancy** (weakest metric at 0.58): Patterns 1 (fan-out) + 3 (tiered memory) + 4 (consolidation) target this directly. Predicted improvement to 0.65-0.70.
- **Latency** (analytical 22.6s, cross-domain 31.1s): Patterns 2 (prefix caching) + 1 (parallel execution) + 5 (compaction) target this. Predicted improvement to 12-18s analytical, 20-25s cross-domain.
- **Context Precision** (0.50): Patterns 1 (multi-source RRF) + 4 (routing learning) target this. Predicted improvement to 0.55-0.60.
- **Freshness** (12 days stale): Pattern 8 (proactive health) catches this within 1 hour.
- **Overall score**: Predicted trajectory from 0.67 → 0.72-0.75 after full implementation.

### Negative

- **Complexity**: 8 new patterns increase system complexity. Mitigated by Unleash flags for gradual rollout.
- **Resource cost**: Fan-out (Pattern 1) increases per-query compute by 2-3x for ambiguous queries. Mitigated by only fanning out for complexity 3-5 (estimated 30% of queries).
- **Memory infrastructure**: Tiered memory (Pattern 3) requires a new Qdrant collection. Minimal resource cost (~1000 vectors initially).
- **Maintenance**: Episode consolidation (Pattern 4) adds a nightly Prefect flow. Minimal — similar to existing consistency check.

### Risk Mitigation

Every pattern is gated behind an Unleash feature flag. Rollout sequence:
1. Pattern 2 (prefix caching) — lowest effort, highest confidence, no code risk
2. Pattern 6 (circuit breaker improvements) — defensive, reduces failure impact
3. Pattern 5 (compaction/budgeting) — targeted fixes for known latency issues
4. Pattern 1 (fan-out) — core capability, needs careful RRF tuning
5. Pattern 3 (tiered memory) — schema migration, needs data migration plan
6. Pattern 4 (consolidation) — depends on Pattern 3 being in place
7. Pattern 7 (LLM-as-gate) — evaluation only, SRE-adjacent
8. Pattern 8 (proactive health) — evaluation only, monitoring-adjacent

---

## Alternatives Considered

### 1. Full KAIROS autonomous daemon
Rejected for Rootweaver. KAIROS requires a fundamentally different trust model (persistent autonomous agency). Rootweaver is a server-side platform, not a user-facing agent. The proactive health check (Pattern 8) captures 80% of KAIROS's value at 10% of the complexity.

### 2. React/Ink terminal UI
Not applicable. Rootweaver is a headless API platform. Claude Code's React-based terminal UI was widely criticized in the leak analysis (470 useState hooks in one component, rendering bugs). No adoption warranted.

### 3. Anti-distillation defenses (fake tools, connector-text)
Not applicable. Rootweaver is private infrastructure, not a commercial product being scraped by competitors.

### 4. YOLO classifier / Auto Mode permission system
Not needed currently (single-user platform with Auth0). Revisit if MCP bridge goes multi-user. The two-stage reasoning-blind classifier design is architecturally sound and worth referencing in any future RBAC ADR.

### 5. Full 5-strategy compaction cascade
Partially adopted (Patterns 5a, 5b). The full cascade targets multi-turn conversation context management — Rootweaver queries are single-turn with no conversation state. Only the result budgeting and circuit breaker patterns apply.

---

## Additional Patterns from 2026 Research (Post-Leak Analysis)

The following patterns emerged from a systematic review of **42 academic papers published January–March 2026** and Q1 2026 industry developments. These supplement the original 8 patterns from the Claude Code leak.

### Pattern 9: Memory Admission Control (ADOPT)

**Source**: A-MAC (arXiv 2603.04549, ICLR 2026 Workshop MemAgent)

**Problem**: We currently index everything to Qdrant without quality filtering. "Facts as First-Class Objects" (arXiv 2603.17781) proved that **compaction destroys 60% of facts** — but the inverse problem is equally real: low-quality content dilutes retrieval precision.

**Solution**: 5-factor admission scoring before Qdrant writes:
1. **Future utility** — will this be queried again? (based on topic frequency in episode history)
2. **Factual confidence** — is the source reliable? (vault file vs scraped web content)
3. **Semantic novelty** — does this add information beyond existing vectors? (cosine distance from nearest neighbor)
4. **Temporal recency** — is this current? (freshness decay function from ADR benchmark)
5. **Content type prior** — ADRs and HLDs have higher base value than raw notes

```python
def admission_score(doc, qdrant_client) -> float:
    nearest = qdrant_client.search("rootweaver_vault", doc.embedding, limit=1)
    novelty = 1.0 - nearest[0].score if nearest else 1.0  # high = novel
    recency = freshness_decay(doc.date)
    type_prior = {"adr": 0.9, "hld": 0.85, "report": 0.7, "note": 0.4}
    return 0.3 * novelty + 0.3 * recency + 0.2 * type_prior.get(doc.type, 0.5) + 0.2 * doc.confidence
```

**Predicted impact**: Context Precision improvement (fewer low-quality docs in retrieval results).

**Effort**: Low (1 day). Scoring function in vault indexer pipeline, Unleash flag for gradual rollout.

### Pattern 10: Selective Forgetting (ADOPT)

**Source**: MemoryAgentBench (ICLR 2026), SleepGate (arXiv 2603.14517), Cognitive Design Patterns (arXiv 2505.07087)

**Problem**: Our design archives episodes but never actively forgets from Tier 1/2. MemoryAgentBench identifies selective forgetting as one of four core memory competencies that current systems fail to master.

**Solution**: Three forgetting mechanisms:
1. **TTL decay on Redis ZSET** — scores decrease over time; episodes below threshold auto-evict (already designed in Tier 1)
2. **Contradiction-aware eviction** — when consolidation (Pattern 4) detects contradicting episodes, the losing episode is demoted to Tier 3 archive
3. **Reconstructability heuristic** (from Cognitive Design Patterns, arXiv 2505.07087) — if an episode is both low-value AND easy to reconstruct from existing knowledge, evict it. Don't waste memory on derivable facts.

**Formal basis**: Kumiho (arXiv 2603.17244) provides AGM belief revision semantics for handling contradictions: when new evidence contradicts stored beliefs, the system formally revises rather than just appending.

**Predicted impact**: Tier 1/2 stay lean, retrieval precision improves as stale/contradicted content is removed.

**Effort**: Low-Medium (1-2 days). TTL decay is native Redis. Contradiction detection is part of Pattern 4 consolidation. Reconstructability heuristic is a scoring function.

### Pattern 11: Demand Paging for Context Window (EVALUATE)

**Source**: Pichay (arXiv 2603.09023, Mar 2026)

**The key insight**: "The context window is an L1 cache, not memory." Pichay implements a transparent proxy that:
- Evicts stale content from context
- Detects "page faults" (model references evicted content) and reloads
- Pins working-set pages that are actively used

**Results**: 93% context reduction (5,038KB → 339KB) across 681 production turns. 0.0254% fault rate across 1.4M simulated evictions.

**Why this is relevant**: Our MCP tool definitions consume ~6,000 tokens per session. Pichay's analysis found **21.8% structural waste** in typical sessions from static content that's loaded but never referenced. This applies directly to our MCP bridge.

**Evaluation plan**: Measure what % of MCP tool definitions are actually used per session. If >50% go unused, implement lazy tool loading (only inject tool definitions when the agent signals intent to use them).

**Effort**: Medium (2-3 days). Requires changes to MCP bridge tool registration.

---

## 2026 Research Landscape (42 papers, Jan–Mar 2026)

### Papers by Month

| Month | Count | Key Themes |
|-------|-------|------------|
| January 2026 | 17 | Tiered memory architectures, episodic consolidation, agentic RAG surveys |
| February 2026 | 15 | Graph memory consensus, benchmarks, KV cache optimization, multi-store validation |
| March 2026 | 10 | Demand paging, admission control, formal belief revision, dual-process memory |

### Top 5 Must-Read Papers

1. **Pichay** (2603.09023) — demand paging for context, 93% reduction
2. **Facts as First-Class Objects** (2603.17781) — compaction destroys 60% of facts, external KOs are 252x cheaper
3. **A-RAG** (2602.03442) — hierarchical retrieval interfaces validate our hybrid search
4. **Kumiho** (2603.17244) — Redis + graph with formal belief revision, 0.447 F1 LoCoMo (highest reported)
5. **D-Mem** (2603.18631) — System 1/2 dual-process validates our FastSearch/DeepSearch split

### What the 2026 Literature Validates

- **Multi-store memory** (vector + graph + keyword) — FluxMem, A-RAG, Graph Memory Survey all confirm no single structure works
- **Agent routing** (fast vs deep) — D-Mem's System 1/System 2 is our FastSearch/DeepSearch pattern
- **External memory over in-context** — Facts as First-Class Objects proves compaction loss is architectural
- **Graph-based memory** — Zep/Graphiti, Kumiho, MAGMA all use temporal knowledge graphs. FalkorDB integration is on track
- **Vault-as-backing-store** — Pichay's "context = L1 cache" + Memory as Asset's user-ownership model

### What the 2026 Literature Challenges

- **E-mem argues against aggressive compression** — uncompressed episodic memory preserves contextual integrity
- **A-MAC's admission control is missing** — we index everything without quality scoring
- **Memory consistency protocols** (Multi-Agent Memory position paper) — we lack consistency between agents
- **StructMemEval** — LLMs don't autonomously organize memory; explicit structure is mandatory

### Q1 2026 Industry Developments

| Development | Date | Impact |
|------------|------|--------|
| Anthropic Auto Dream | Mar 2026 | Memory self-improvement — raw → curated knowledge |
| Graphiti + FalkorDB PR | Mar 2026 | Official integration — unifies our graph stack |
| llm-d → CNCF Sandbox | Mar 24, 2026 | K8s-native cache-aware routing, 87% cache hit rate |
| NVIDIA Dynamo 1.0 | Mar 2026 | Inference OS: vLLM + LMCache + llm-d native integration |
| Letta Conversations API | Jan 2026 | Parallel session memory for multi-agent |
| Interloom $16.5M seed | Mar 2026 | Context graphs from operational records |
| Qdrant TurboQuant | ICLR 2026 | 3-bit quantization, no recall loss |
| MemoryAgentBench | ICLR 2026 | First comprehensive benchmark: retrieval + learning + forgetting |
| Microsoft Agent Framework RC1 | Feb 2026 | AutoGen + Semantic Kernel unified with context providers |
| Google ADK Memory | Mar 2026 | PreloadMemoryTool (proactive) + LoadMemoryTool (on-demand) |

---

## Updated Implementation Priority Matrix

| Phase | Pattern | Effort | Benchmark Target | Unleash Flag |
|-------|---------|--------|-----------------|--------------|
| **Phase 1** (Week 1) | P2: vLLM prefix caching | 1 day | TTFT -30% | `rootweaver.vllm.prefix_caching` |
| **Phase 1** (Week 1) | P6: Circuit breaker improvements | 1 day | Zero cascade failures | N/A (always on) |
| **Phase 1** (Week 1) | P5: Compaction/budgeting | 1-2 days | Analytical P50 < 18s | `rootweaver.search.gav_budgeting` |
| **Phase 2** (Week 2) | P1: Agent fan-out | 2-3 days | Relevancy > 0.63 | `rootweaver.agents.fan_out` |
| **Phase 2** (Week 2) | P7: LLM-as-gate triage | 1 day | 70% alert triage rate | `rootweaver.sre.llm_triage` |
| **Phase 3** (Week 3) | P3: Tiered memory | 3-4 days | Episode retrieval <5ms | `rootweaver.memory.tiered` |
| **Phase 3** (Week 3) | P4: Episode consolidation | 2-3 days | Routing hints >60% | `rootweaver.memory.consolidation` |
| **Phase 3** (Week 3) | P9: Memory admission control | 1 day | Ctx Precision +0.03 | `rootweaver.memory.admission` |
| **Phase 3** (Week 3) | P10: Selective forgetting | 1-2 days | Tier 1 stays <1000 entries | `rootweaver.memory.forgetting` |
| **Phase 4** (Week 4) | P8: Proactive health agent | 2 days | Regression detect <1hr | `rootweaver.health.proactive` |
| **Phase 4** (Week 4) | P11: Demand paging eval | 2-3 days | Measure MCP tool usage % | `rootweaver.mcp.lazy_tools` |

**Total estimated effort**: 17-23 days across 4 phases (expanded from 13-17).
**Benchmark target**: 0.67 → 0.72-0.75 (overall score).
**Research backing**: 42 academic papers (Jan-Mar 2026) + 10 major industry developments (Q1 2026).

---

## Academic & Industry Research Backing

### Foundational Survey

"Memory in the Age of AI Agents: A Survey" (Liu et al., Dec 2025, [arXiv 2512.13564](https://arxiv.org/abs/2512.13564)) — multidimensional taxonomy across Forms (token/parametric/latent), Functions (factual/experiential/working), and Dynamics (formation/evolution/retrieval). ICLR 2026 Workshop: MemAgents confirms this is now a distinct research field.

### Pattern-Specific Academic Validation

| Pattern | Paper | Venue | Key Result |
|---------|-------|-------|------------|
| P1: Fan-out | MA-RAG (arXiv 2505.20096) | 2025 | Planner→Definer→Extractor→QA pipeline for multi-hop |
| P1: Fan-out | Collaborative Multi-Agent RAG (arXiv 2412.05838) | KDD 2025 | Specialized agents per data source, coordinator merges |
| P1: Fan-out | Agentic RAG Survey (arXiv 2501.09136) | 2025 | Canonical taxonomy: parallelization + evaluator-optimizer |
| P2: Prefix cache | LMCache (arXiv 2510.09665) | MLSys 2025 | **15x throughput** via external KV cache layer |
| P2: Prefix cache | BatchLLM (arXiv 2412.03594) | 2024 | **1.3-10.8x over vLLM** via global prefix sharing |
| P2: Prefix cache | SGLang RadixAttention (LMSYS) | 2024 | Radix tree KV cache, automatic prefix discovery |
| P3: Tiered memory | MemGPT/Letta (arXiv 2310.08560) | ICLR 2024 | OS-paging-inspired core/recall/archival tiers |
| P3: Tiered memory | EverMemOS (arXiv 2601.02163) | 2026 | Engram lifecycle: MemCell→MemScene→Recollection. SOTA 93% LoCoMo |
| P3: Tiered memory | Multi-Layered Memory (arXiv 2603.29194) | 2026 | Working/episodic/semantic layers with MoE gating |
| P3: Tiered memory | HiAgent (arXiv 2408.09559) | ACL 2025 | Subgoal-chunked working memory. **2x success, 3.8x fewer steps** |
| P4: Consolidation | SimpleMem (arXiv 2601.02553) | 2026 | Semantic compression + multi-view indexing. **30x token reduction** |
| P4: Consolidation | SleepGate (arXiv 2603.14517) | 2026 | Learned forgetting gate. O(n)→O(log n) interference |
| P4: Consolidation | "Language Models Need Sleep" (OpenReview) | 2025 | Two-phase: Memory Consolidation + Dreaming |
| P4: Consolidation | A-MEM (arXiv 2502.12110) | NeurIPS 2025 | Zettelkasten self-organizing notes, auto-linking |
| P4: Consolidation | Active Dreaming Memory (engrXiv) | 2025 | Counterfactual verification before promotion |
| P5: Compaction | Cognitive Workspace (arXiv 2508.13171) | 2025 | Active curation. **58.6% memory reuse** vs 0% passive RAG |
| Episode learning | Reflexion (arXiv 2303.11366) | NeurIPS 2023 | Verbal reflection buffer. **+8% from self-reflection** |
| Episode learning | AriGraph (arXiv 2407.04363) | IJCAI 2025 | KG world model with episodic edges. 54 citations |
| Episode learning | ACT-R-Inspired LLM Memory (ACM HAI) | 2025 | Activation-based retrieval (recency + frequency + context) |
| Episodic memory theory | Pink et al. (arXiv 2502.06975) | 2025 | 5 properties: single-shot, temporal, addressable, reconstructive, consolidation |

### Industry Framework Comparison

| System | Storage | Memory Model | Consolidation | Production |
|--------|---------|-------------|---------------|------------|
| **Letta (MemGPT)** | PostgreSQL | 3-tier (core/recall/archival) | Self-managed paging | Yes |
| **Mem0** | 24+ vector stores + graph | Flat vector + optional graph | Dedup + conflict resolution | 70+ companies |
| **Cognee** | Neo4j/FalkorDB + vector | Graph-first + embeddings | Memify pipeline | 70+ companies |
| **Zep/Graphiti** | Neo4j/FalkorDB | Temporal knowledge graph | Temporal invalidation | P95 300ms |
| **LangGraph** | Postgres/Redis/MongoDB | State + checkpoints + LangMem | Via LangMem toolkit | Uber, JP Morgan |
| **Redis Agent Memory Server** | Redis | Dual-tier (short + semantic) | No | 43% market share |

**Key industry finding**: The emerging consensus is Redis (short-term) + Vector DB (semantic) + Graph DB (relational) + Relational DB (durable state). Rootweaver already has all four deployed.

---

## Technology Decisions: Tiered Memory Database Architecture

### Design Principle: Zero New K8s Services

All four databases are already deployed. The tiered memory adds new usage patterns to existing infrastructure.

### Tier 1: Index — Redis Sorted Sets + Qdrant Named Vectors

**Why Redis ZSET for index**: Native TTL/LRU eviction, O(log N) insert/range query, sub-millisecond latency, already deployed. SQLite would need manual cleanup cron jobs.

```
Redis ZSET: agent:episodes:index
├── Key: episode_id
├── Score: composite(recency_weight * recency + relevance_weight * relevance)
├── ZADD on episode creation
├── ZRANGEBYSCORE for ranked retrieval
├── EXPIRE for stale episodes (native TTL)
└── maxmemory-policy: volatile-lru
    Memory: ~100 bytes/episode = 100KB for 1000 episodes
```

**Why Qdrant named vector for semantic index**: Enables "find episodes similar to this context" without full-text scan. Named vector `summary` (lightweight 768d embedding of episode summary) on the same `agent_episodes` collection.

| Metric | Redis ZSET | Qdrant Summary Vector |
|--------|-----------|----------------------|
| Latency | P50 0.12ms | P99 5.79ms @ 90% recall |
| Lookup type | Ranked score | Semantic similarity |
| When to use | Known topic, score-based | Unknown topic, similarity-based |

### Tier 2: Details — SQLite WAL + Qdrant Detail Vectors

**Why SQLite WAL for details**: Zero infrastructure, 70K reads/s, concurrent reads without blocking writes, already in stack. Schema:

```sql
-- Enable WAL mode (one-time)
PRAGMA journal_mode=WAL;

-- Episode details (loaded on demand via Tier 1 pointer)
CREATE TABLE episode_details (
    id TEXT PRIMARY KEY,
    full_query TEXT NOT NULL,
    full_result_summary TEXT,
    context_docs TEXT,  -- JSON array of doc IDs
    agent_used TEXT,
    search_strategy TEXT,
    latency_ms REAL,
    faithfulness REAL,
    relevancy REAL,
    context_precision REAL,
    success INTEGER,
    session_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    last_accessed TEXT
);

-- Routing hints (promoted from consolidation)
CREATE TABLE routing_hints (
    topic_cluster TEXT PRIMARY KEY,
    best_agent TEXT NOT NULL,
    best_strategy TEXT,
    success_rate REAL,
    sample_count INTEGER,
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for common access patterns
CREATE INDEX idx_episodes_agent ON episode_details(agent_used);
CREATE INDEX idx_episodes_created ON episode_details(created_at);
CREATE INDEX idx_hints_agent ON routing_hints(best_agent);
```

**Why Qdrant named vector `detail` for deep search**: 2560d full-content embedding on the same `agent_episodes` collection. Only searched when Tier 1 fast path misses.

### Tier 3: Archive — Compressed JSONL on Filesystem

```
/data/agent-archive/
├── 2026/
│   ├── 03/
│   │   ├── episodes_20260301.jsonl.gz
│   │   └── episodes_20260315.jsonl.gz
│   └── 04/
│       └── episodes_20260401.jsonl.gz
└── README.md
```

- Episodes archived after 30 days with zero access
- `zgrep` for text search, DuckDB for analytics (optional, `pip install duckdb`)
- No database, no service, no memory footprint

### Cross-Tier: FalkorDB Relationship Graph

New graph `agent_memory` alongside existing `code_knowledge`:

```cypher
// Episode relationships
(:Episode {id, topic, agent, success})-[:REFERENCES]->(:Episode)
(:Episode)-[:INVOLVES]->(:Component {name: "qdrant"})
(:Episode)-[:PART_OF]->(:Investigation {jira: "VW-XXX"})
(:Episode)-[:LED_TO]->(:RoutingHint {topic, agent, rate})
```

Sub-millisecond traversal (FalkorDB p99: 140ms vs Neo4j 46,900ms — validated by industry benchmarks and Securin case study).

### Consolidation Pipeline (autoDream-lite)

Nightly Prefect flow combining SimpleMem semantic compression (30x token reduction), Reflexion verbal reflection (+8%), and SleepGate conflict detection (O(log n)):

```
Prefect Flow: episode-consolidation (nightly, alongside consistency check)
│
├── 1. Load 24hr episodes from SQLite Tier 2
├── 2. Cluster by topic via Qdrant similarity on summary vectors
├── 3. Per cluster:
│     ├── Identify best agent/strategy (highest success score)
│     ├── Generate verbal reflection (Reflexion pattern):
│     │   "For queries about X, FastSearch+hybrid_v2 outperformed
│     │    DeepSearch because answers were in single vault files"
│     ├── Upsert routing_hint to SQLite routing_hints table
│     ├── Update FalkorDB: (:Episode)-[:LED_TO]->(:RoutingHint)
│     └── Prune redundant episodes (keep best per cluster)
├── 4. Detect contradictions (SleepGate pattern):
│     Same topic, different agents, divergent success → flag
├── 5. Archive episodes >30 days with 0 access → Tier 3 JSONL
├── 6. Update Redis ZSET scores (boost recent high-performers)
└── 7. Publish consolidation report to Grafana/Discord
```

### Infrastructure Change Summary

| Component | Current Role | New Role | Change |
|-----------|-------------|----------|--------|
| **Redis** | GatherCache (DB 0), QueryCache (DB 1) | + DB 2: Tier 1 episode index (ZSET) | Add sorted set + TTL |
| **SQLite** | Flat PersistentMemory | Tier 2: episode_details + routing_hints (WAL) | Schema migration |
| **Qdrant** | rootweaver_vault (search) | + `agent_episodes` collection (2 named vectors) | New collection |
| **FalkorDB** | code_knowledge graph | + `agent_memory` graph | New graph |
| **Filesystem** | N/A | Tier 3: `/data/agent-archive/` | Directory + archival |

**New K8s services: Zero. New pip dependencies: Zero (DuckDB optional).**

---

## Benchmark Evaluation Framework

### How Each Pattern Maps to Benchmark Metrics

```
                    ┌─────────────────────────────────────────────┐
                    │        Current Benchmark: 0.67 overall       │
                    │                                               │
                    │  Weaknesses:                                  │
                    │  • Relevancy: 0.58 ←── P1 fan-out, P3 memory │
                    │  • Ctx Precision: 0.50 ←── P1 RRF fusion     │
                    │  • Analytical P50: 22.6s ←── P2 prefix cache │
                    │  • Cross-Domain P50: 31.1s ←── P1 parallel   │
                    │  • Freshness: 12 days stale ←── P8 proactive │
                    └─────────────────────────────────────────────┘
```

### Success Criteria Per Phase

| Phase | Benchmark Run | Pass Criteria | Rollback Trigger |
|-------|--------------|---------------|------------------|
| Phase 1 (cache+breaker+compact) | Run 39 | TTFT -30%, analytical P50 <18s | TTFT regression or OOM |
| Phase 2 (fan-out+triage) | Run 40 | Relevancy >0.63, overall >0.69 | Relevancy drops below 0.55 |
| Phase 3 (tiered memory+consolidation) | Run 41-42 | Routing hint coverage >40%, overall >0.71 | Memory >100MB or SQLite corruption |
| Phase 4 (proactive health) | Run 43 | Regression detect &lt;1hr | False positive rate &gt;20% |

### Predicted Cumulative Impact

| Metric | Run 38 (baseline) | After Phase 1 | After Phase 2 | After Phase 3 | After Phase 4 |
|--------|-------------------|---------------|---------------|---------------|---------------|
| Overall | 0.67 | 0.67 | 0.70 | 0.72 | 0.73 |
| Relevancy | 0.58 | 0.58 | 0.65 | 0.68 | 0.68 |
| Ctx Precision | 0.50 | 0.50 | 0.56 | 0.58 | 0.58 |
| Analytical P50 | 22.6s | 16s | 13s | 13s | 13s |
| Cross-Domain P50 | 31.1s | 24s | 18s | 18s | 18s |

---

## References

### Claude Code Leak Analysis
- Engineer's Codex: [Diving into Claude Code's Source Code Leak](https://read.engineerscodex.com/p/diving-into-claude-codes-source-code)
- Alex Kim: [Fake tools, frustration regexes, undercover mode](https://alex000kim.com/posts/2026-03-31-claude-code-source-leak/)
- Layer5: [512,000 Lines, a Missing .npmignore](https://layer5.io/blog/engineering/the-claude-code-source-leak-512000-lines-a-missing-npmignore-and-the-fastest-growing-repo-in-github-history/)
- DecodeClaude: [Compaction Deep Dive](https://decodeclaude.com/compaction-deep-dive/)
- DeepWiki: [Context Window & Compaction](https://deepwiki.com/anthropics/claude-code/3.3-context-window-and-compaction)
- ClaudeCodeCamp: [How Prompt Caching Actually Works](https://www.claudecodecamp.com/p/how-prompt-caching-actually-works-in-claude-code)
- Anthropic Engineering: [Claude Code Auto Mode](https://www.anthropic.com/engineering/claude-code-auto-mode)
- Haseeb Qureshi: [Inside the Claude Code Source (Gist)](https://gist.github.com/Haseeb-Qureshi/d0dc36844c19d26303ce09b42e7188c1)

### Academic Papers — 2026 (42 papers, Jan–Mar)
- Pichay/Demand Paging: [arXiv 2603.09023](https://arxiv.org/abs/2603.09023)
- Facts as First-Class Objects: [arXiv 2603.17781](https://arxiv.org/abs/2603.17781)
- Kumiho (belief revision): [arXiv 2603.17244](https://arxiv.org/abs/2603.17244)
- D-Mem (dual-process): [arXiv 2603.18631](https://arxiv.org/abs/2603.18631)
- MemFactory: [arXiv 2603.29493](https://arxiv.org/abs/2603.29493)
- Neural Paging: [arXiv 2603.02228](https://arxiv.org/abs/2603.02228)
- A-MAC (admission control): [arXiv 2603.04549](https://arxiv.org/abs/2603.04549) (ICLR 2026 Workshop)
- Memory as Asset: [arXiv 2603.14212](https://arxiv.org/abs/2603.14212)
- Multi-Agent Memory: [arXiv 2603.10062](https://arxiv.org/abs/2603.10062)
- A-RAG: [arXiv 2602.03442](https://arxiv.org/abs/2602.03442)
- FluxMem: [arXiv 2602.14038](https://arxiv.org/abs/2602.14038)
- Graph Memory Survey: [arXiv 2602.05665](https://arxiv.org/abs/2602.05665)
- StructMemEval: [arXiv 2602.11243](https://arxiv.org/abs/2602.11243)
- REMem: [arXiv 2602.13530](https://arxiv.org/abs/2602.13530)
- Fast KV Compaction: [arXiv 2602.16284](https://arxiv.org/abs/2602.16284)
- Pancake: [arXiv 2602.21477](https://arxiv.org/abs/2602.21477)
- AgenticRAGTracer: [arXiv 2602.19127](https://arxiv.org/abs/2602.19127)
- Anatomy of Agentic Memory: [arXiv 2602.19320](https://arxiv.org/abs/2602.19320)
- TiMem: [arXiv 2601.02845](https://arxiv.org/abs/2601.02845)
- HiMem: [arXiv 2601.06377](https://arxiv.org/abs/2601.06377)
- SEEM: [arXiv 2601.06411](https://arxiv.org/abs/2601.06411)
- MAGMA: [arXiv 2601.03236](https://arxiv.org/abs/2601.03236)
- AgeMem: [arXiv 2601.01885](https://arxiv.org/abs/2601.01885)
- Focus Agent: [arXiv 2601.07190](https://arxiv.org/abs/2601.07190)
- Aeon: [arXiv 2601.15311](https://arxiv.org/abs/2601.15311)
- ACC: [arXiv 2601.11653](https://arxiv.org/abs/2601.11653)
- E-mem: [arXiv 2601.21714](https://arxiv.org/abs/2601.21714)
- Mem-T: [arXiv 2601.23014](https://arxiv.org/abs/2601.23014)
- JADE: [arXiv 2601.21916](https://arxiv.org/abs/2601.21916)
- ContiguousKV: [arXiv 2601.13631](https://arxiv.org/abs/2601.13631)

### Academic Papers — 2024-2025 (Foundational)
- MemGPT: [arXiv 2310.08560](https://arxiv.org/abs/2310.08560) (ICLR 2024)
- EverMemOS: [arXiv 2601.02163](https://arxiv.org/abs/2601.02163)
- SimpleMem: [arXiv 2601.02553](https://arxiv.org/abs/2601.02553)
- SleepGate: [arXiv 2603.14517](https://arxiv.org/abs/2603.14517)
- A-MEM: [arXiv 2502.12110](https://arxiv.org/abs/2502.12110) (NeurIPS 2025)
- HiAgent: [arXiv 2408.09559](https://arxiv.org/abs/2408.09559) (ACL 2025)
- Multi-Layered Memory: [arXiv 2603.29194](https://arxiv.org/html/2603.29194)
- Memory Survey: [arXiv 2512.13564](https://arxiv.org/abs/2512.13564)
- MA-RAG: [arXiv 2505.20096](https://arxiv.org/abs/2505.20096)
- Agentic RAG Survey: [arXiv 2501.09136](https://arxiv.org/abs/2501.09136)
- LMCache: [arXiv 2510.09665](https://arxiv.org/abs/2510.09665) (MLSys 2025)
- BatchLLM: [arXiv 2412.03594](https://arxiv.org/abs/2412.03594)
- Reflexion: [arXiv 2303.11366](https://arxiv.org/abs/2303.11366) (NeurIPS 2023)
- AriGraph: [arXiv 2407.04363](https://arxiv.org/abs/2407.04363) (IJCAI 2025)
- Cognitive Workspace: [arXiv 2508.13171](https://arxiv.org/abs/2508.13171)
- Episodic Memory Position Paper: [arXiv 2502.06975](https://arxiv.org/abs/2502.06975)
- Cognitive Design Patterns: [arXiv 2505.07087](https://arxiv.org/abs/2505.07087)
- ARTEM: [AAAI 2026](https://doi.org/10.1609/aaai.v40i48.42170)
- Marconi: [arXiv 2411.19379](https://arxiv.org/abs/2411.19379) (MLSys 2025)

### Industry Sources
- Letta V1 Architecture: [letta.com/blog/letta-v1-agent](https://www.letta.com/blog/letta-v1-agent)
- Mem0 Research: [arxiv.org/abs/2504.19413](https://arxiv.org/abs/2504.19413)
- Mem0 + AWS Reference: [aws.amazon.com/blogs/database/build-persistent-memory](https://aws.amazon.com/blogs/database/build-persistent-memory-for-agentic-ai-applications-with-mem0-open-source-amazon-elasticache-for-valkey-and-amazon-neptune-analytics/)
- Cognee Architecture: [cognee.ai/blog/fundamentals/how-cognee-builds-ai-memory](https://www.cognee.ai/blog/fundamentals/how-cognee-builds-ai-memory)
- Zep/Graphiti: [arxiv.org/abs/2501.13956](https://arxiv.org/abs/2501.13956)
- Redis Agent Memory Server: [redis.github.io/agent-memory-server](https://redis.github.io/agent-memory-server/)
- FalkorDB vs Neo4j: [falkordb.com/blog/best-database-for-knowledge-graphs](https://www.falkordb.com/blog/best-database-for-knowledge-graphs-falkordb-neo4j/)
- vLLM Prefix Caching: [docs.vllm.ai/en/stable/design/prefix_caching](https://docs.vllm.ai/en/stable/design/prefix_caching/)

### Rootweaver Internal
- Benchmark Run 38: `obsidian-vault/09-System/Architecture/Benchmarks/2026-03-31-Benchmark-Report.md`
- HLD Index: `obsidian-vault/09-System/Architecture/HLD-Index.md`
- LLD Index: `obsidian-vault/09-System/Architecture/LLD-Index.md`
- Related ADRs: ADR-011 (Journal Context Handling), ADR-022 (Local LLM Hybrid Routing), ADR-023 (Architecture Review Pipeline)
