---
id: 69
title: "LLM-Facing Diagnostics API (Curated, Read-Only, sre-brain)"
status: proposed
recordedStatus: "Proposed"
date: 2026-06-10
tags: ["diagnostics", "sre", "llm-agents", "sre-brain", "observability"]
sourceKind: source-record
public: true
journeyId: "2026-06-10-adr-069-llm-facing-diagnostics-api-curated-read-only-sre-brain"
---
# ADR-069 — LLM-Facing Diagnostics API (Curated, Read-Only, sre-brain)

**Status:** Proposed — 2026-06-10 (VW-696 design phase)
**Decision drivers:** Ryan's primary use case — an LLM calling endpoints to check whether platform systems are healthy and diagnose what is wrong; agentic-operations evidence pass of 2026-06-10.

## Context

The platform has rich **human-facing** observability (Grafana, Prometheus :30090, Alertmanager :30903, VictoriaLogs, Kibana) but no **agent-facing** diagnostic surface: sre-event-collector only ingests webhooks; sre-brain exposes `/triage` and `/status`; everything else requires a human dashboard or raw datasource queries.

Evidence says pointing agents at raw observability is the failure mode, not the solution:

- **AIOpsLab** (Microsoft, arXiv:2501.06706): documented agent failure modes are *information overload from raw metrics/traces*, context-window exhaustion, repeated invalid calls, and **false positives on healthy systems**. Their Agent-Cloud Interface deliberately exposes a small curated API set. Best agent: 76.9% fault localization but 45.5% root-cause accuracy.
- **ITBench** (IBM, arXiv:2502.05352): SOTA agents resolve 13.8% of real SRE scenarios; 2026 frontier models still <50% (ITBench-AA best: 46.7%). Auto-mitigation is premature; assisted diagnosis is the supported scope.
- **RCACopilot** (Microsoft EuroSys'24): 0.766 RCA accuracy, 4+ years in production — the accuracy comes from per-alert-type **diagnostic collection** (pre-aggregated incident bundles), not model capability.
- **Telemetry volume**: ~18,000 lines / 3.8M chars per minute of system activity (arXiv:2504.18776) — server-side filtering is mandatory.
- **Spider 2.0** (arXiv:2411.07763): 10–21% solve rate on real enterprise query generation — no free-form PromQL/LogQL for agents (ADR-067 C9).

## Decision

1. **Build `/v1/diagnostics/*` as an sre-brain expansion** (NodePort 30851) — the ops-plane API stays beside triage and the event collector, separate from the knowledge-plane (rag-gateway), but under the same ADR-067 contract.
2. **Endpoint set v0** (curated, all read-only):
   - `GET /v1/diagnostics/health` — fleet aggregate, `application/health+json` (IETF draft-inadarei): status pass/warn/fail per service + `checks[]`.
   - `GET /v1/diagnostics/health/{service}` — deep checks with `affectedEndpoints`, `observedValue`, threshold context.
   - `GET /v1/diagnostics/alerts?since=&severity=` — condensed Alertmanager view (name, severity, age, summary, runbook link) — never the raw webhook payload.
   - `GET /v1/diagnostics/logs/{service}?since=&level=&pattern=&limit=` — pattern-grouped (Drain-style), token-budgeted log summaries from VictoriaLogs; counts per pattern + representative lines, not raw streams.
   - `GET /v1/diagnostics/metrics/{service}?window=` — pre-aggregated rates/percentiles **expressed relative to baseline** ("p95 = 2.3× its 7-day median"), countering the false-positive failure mode by encoding "normal" server-side.
   - `GET /v1/diagnostics/bundle/{alert}` — RCACopilot-pattern incident bundle: per-alert-type collector assembling related log patterns, metric deltas, recent deploys (Flux/GitLab), and **prior similar incidents via the VW-695 memory API** (`find_problems`/`recall_decisions` cross-link).
3. **Read-only is a v1 invariant.** No mitigation/action endpoints; any future action surface requires its own ADR with gating (human confirm, allow-listed verbs), consistent with ITBench evidence and the platform's compose-and-confirm posture.
4. **No raw datasource passthrough**: the router queries Prometheus/Alertmanager/VictoriaLogs server-side with fixed, parameterized templates; agents never submit PromQL/LogQL (ADR-067 C9/C10).

## Consequences

**Positive:** an agent can answer "is anything wrong, where, why, and has this happened before" in a handful of bounded calls; the memory⇄diagnostics bundle composition is a differentiator no off-the-shelf stack provides; the same endpoints feed the Console's status view; SessionStart alert hook (already live) can later consume `/alerts` instead of scraping Alertmanager directly.

**Negative / costs:** baseline computation (7-day medians) needs a cheap recording-rule or on-the-fly Prometheus quantile query — to be benchmarked; pattern-grouping logs adds a dependency (Drain3 or VictoriaLogs' own grouping); per-alert-type bundle collectors are ongoing curation work (start with the ~6 recurring alert families: GPU device-plugin, embedding backlog, KEDA, Syncthing, CI runner, backup jobs); sre-brain gains egress to the monitoring namespace (NetworkPolicy work, ipBlock pattern per VW-567).

**Non-goals (v1):** auto-mitigation, fleet-wide anomaly detection, replacing Grafana for humans, exposing traces (no active Jaeger/Tempo consumer per VW-647 trim — revisit if tracing returns).
