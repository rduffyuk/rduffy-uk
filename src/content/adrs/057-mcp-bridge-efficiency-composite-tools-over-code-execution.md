---
id: 57
title: "MCP Bridge Efficiency: Composite Tools over Full Code-Execution Migration"
status: accepted
recordedStatus: "Accepted"
date: 2026-06-03
tags: ["mcp-bridge", "token-efficiency", "benchmark", "claude-code"]
sourceKind: source-record
public: true
journeyId: "2026-06-03-adr-057-mcp-bridge-efficiency-composite-tools-over-full-code-execution-migration"
---
# ADR-057 — MCP Bridge Efficiency: Composite Tools over Full Code-Execution Migration

**Status:** Accepted
**Date:** 2026-06-03
**Refines:** ADR-027 Track D (MCP Bridge Efficiency)
**Decision drivers:** evaluation of VW-217 (full "Code Execution with MCP" migration) against real usage data + the live deferred-tool setup.

---

## Context

VW-217 (Backlog, under ADR-027 Track D, Epic VW-209) proposed migrating the MCP bridge to Anthropic's "Code Execution with MCP" pattern, citing a 150K→2K token reduction (98.7%) on tool-heavy bridges. The pattern has **two distinct benefits**, and this ADR evaluates both:

1. **Tool-definition overhead** — instead of loading all tool schemas into context, expose them as on-demand code APIs. This is the headline 98.7% number.
2. **Intermediate-result chaining** — the model writes one script chaining tools, so bulky intermediate tool results never enter its context window; only the final result returns.

A design for a full code-execution surface (working name `rw_execute`: a pooled gVisor sandbox + per-execution capability token + RPC back through the bridge's tool registry) was sketched, including NetworkPolicy confinement and the ADR-047 quarantine-LLM rail. Before building it, both benefits were sanity-checked against reality.

### Evidence

**Benefit 1 (tool-def overhead) is already largely mitigated.** Claude Code in the live setup loads MCP tools **deferred** — tools are fetched on demand via the ToolSearch mechanism rather than all 36 schemas being injected upfront (verified in-session 2026-06-03; cf. the `ToolSearch` deferral note in auto-memory). The 150K-schema tax VW-217 assumes does not apply to the current configuration.

**Benefit 2 (intermediate chaining) is rare.** A usage study over the local Claude Code corpus (407 sessions, 51,259 tool calls; `/tmp/chain_analysis.py`, 2026-06-03) found:
- MCP tool calls = **6.5%** of all tool use (3,332); retrieval/recall "target" tools = 1.65% (847).
- Of 7,572 real request-segments, only **121 (1.6%)** chain ≥2 retrieval tools; **78 (1.0%)** chain ≥3. **97.5%** make zero retrieval calls.
- Parallel-batched MCP calls: 6 total, 0 all-MCP. Near-always single-call-per-segment.
- The most common chains are **exploratory** re-querying (`auto_search_vault → hybrid_search_vault` 19×, `auto_search → graph_search` 13×) — where each result *shapes* the next call, so blind script execution would **degrade** them.

**The actual cost pain is elsewhere.** The observed token burn (~50+ sub-agents in one Workflow run) is **agent fan-out**, a different mechanism (sub-agents run in separate transcripts) that a code-execution-over-MCP surface does not touch.

**The benchmark cannot see any of this.** The harness (`memory_benchmark.py`, `tests/benchmarks/benchmark_utils.py`) measures answer quality + routing correctness only; it has no context-token, tool-call-count, end-to-end-latency, or $/query dimension (the only timing is Postgres `elapsed_ms`).

---

## Decision

**Do NOT undertake the full "Code Execution with MCP" migration (VW-217) or build a general code-execution sandbox.** Both of its benefits are weak for this platform's actual configuration and usage. Instead:

1. **Add targeted composite ("macro") MCP tools** for the two deterministic chains that genuinely recur — captured server-side, returning one merged result (VW-528):
   - `recall_layered(topic)` = recall_decisions + find_problems + auto_search_vault (the CLAUDE.md Layered Retrieval Protocol, enforced rather than hoped-for).
   - `pdg_impact_report(file)` = the analyze_code_impact / find_module_dependents / get_dependency_graph / get_pdg_stats sweep.
2. **Add efficiency metrics to the benchmark** (VW-529) so context cost becomes measurable at all — ContextEfficiency (faithfulness/tokens), tool_call_count, end-to-end latency, $/query — wiring in the per-query token logging already delivered by VW-466.
3. **Cap Workflow/Agent fan-out** (VW-530) — the real fix for the 50-agent burn — via a hard concurrency cap + confirmation above it.

`rw_execute` / VW-217 is **shelved**, documented here with the data, not deleted — revisit only if (a) tool defs stop being deferred, or (b) deterministic multi-tool chains become common (re-measure with VW-529).

## 2026-07-12 amendment — additive production re-evaluation

Ryan approved a production re-evaluation of VW-217 after the Code Mode pattern became an ecosystem-supported MCP client/server design. This amendment does **not** reverse the evidence that deferred discovery removes the original schema-loading benefit for the direct bridge. It authorizes a narrowly additive deployment to measure the remaining benefit: server-side composition and filtering of large intermediate results.

The direct MCP bridge remains the rollback path. The new Code Mode plane is a separate broker and endpoint pair: Auth0-protected remote access is limited to the existing read-only allowlist, while the trusted internal endpoint has the same authority as the existing local Codex/Claude harness. Model-written JavaScript executes only in an ephemeral gVisor pod with no host mounts, credentials, or general network access; the pod receives a short-lived broker capability for the current execution only.

Promotion is conditional, not assumed: representative deterministic workloads must show at least 25% lower returned-token estimate or latency, with no sandbox escape, authorization bypass, write-policy violation, or direct-bridge regression. VW-217 remains In Progress while this staged delivery is verified.

---

## Consequences

**Positive:** composite tools capture the residual chaining benefit at ~1% of the build cost and **zero** arbitrary-code-execution security surface; the benchmark gains a cost dimension (unblocking all future cost work); the genuine burn (fan-out) gets the cheap guardrail it needs; the Layered Retrieval Protocol becomes enforced in code rather than prompt-dependent.

**Negative / trade-offs:** composite tools are less flexible than a general code surface (only the two pre-baked chains benefit); if usage shifts toward heavy deterministic chaining later, this will need revisiting (VW-529 makes that measurable).

**Neutral:** VW-217 stays on the backlog as a documented "evaluated, deferred" item rather than being closed outright (operator decision).

---

## Alternatives considered

- **Full `rw_execute` sandbox (pooled gVisor + capability token + RPC):** rejected — 1.6% addressable, half exploratory (would degrade), large build + security cost. The cluster's default-deny + Squid egress + Sealed Secrets would have made it *safe* to host, but safety doesn't justify a feature with no market.
- **External agent-native memory (e.g. ByteRover, arXiv 2604.01599):** orthogonal; inverts the embedding pipeline. Its SOTA is on LoCoMo, which ADR-045 already rejected as domain-mismatched. Not adopted.
- **Do nothing:** rejected — leaves the fan-out burn unaddressed and the benchmark cost-blind.

---

## Related
- ADR-027 Track D (MCP Bridge Efficiency) — parent program
- ADR-052 (benchmark agentic metrics + CIs) — VW-529 extends
- ADR-047 (LLM content trust boundary) — the rail the sandbox would have reused
- VW-217 (full migration — shelved by this ADR), VW-466 (token logging — Done), VW-209 (Track D epic)
- VW-528 (composite tools), VW-529 (benchmark efficiency metrics), VW-530 (fan-out cap)
- Landscape analysis: `02-Active-Work/Reviews/2026-06-03-Adjacent-Agent-Projects-Landscape.md`
