---
id: 13
title: "Migrate LLM Observability from OpenLIT+ClickHouse to Kafka→Vector→Elasticsearch"
status: proposed
recordedStatus: "Proposed"
date: 2026-02-17
tags: ["observability", "llm", "openlit", "clickhouse", "elasticsearch", "kafka", "vector", "otel"]
sourceKind: source-record
public: true
journeyId: "2026-02-17-adr-013-migrate-llm-observability-from-openlit-clickhouse-to-kafka-vector-elasticsearch"
---
# ADR-013: Migrate LLM Observability from OpenLIT+ClickHouse to Kafka→Vector→Elasticsearch

**Status**: Proposed
**Date**: 2026-02-17
**Jira**: VW-91 *(internal reference; destination redacted)*

---

## Context

### What Is LLM Observability?

When your applications call large language models (Ollama, Anthropic, OpenAI), you want to track:

| Signal | Why It Matters | Example |
|--------|---------------|---------|
| **Token usage** | Cost control — every token costs money or compute | "rag-gateway used 45K input tokens and 12K output tokens today" |
| **Cost per request** | Budget visibility — which models/features are expensive? | "Deep research queries cost 3x more than fast search" |
| **Latency** | Performance — how long does each LLM call take? | "Ollama P95 latency is 8.2s, Anthropic P95 is 2.1s" |
| **Model routing** | Operational — which model handled which request? | "80% of queries went to mistral:7b, 20% to deepseek-r1" |
| **Prompt/completion content** | Debugging — what did the LLM actually receive and produce? | Full request/response for failed or low-quality outputs |
| **Hallucination detection** | Quality — is the LLM making things up? | "This response has a 0.3 faithfulness score against the source context" |

### How OpenTelemetry Captures This

OpenTelemetry (OTEL) is the standard way to emit this data. The `gen_ai.*` semantic conventions define span attributes for LLM calls:

```
HTTP Span: POST /v1/rag/search (2.3s)
  └── gen_ai.chat Span: ollama/mistral:7b (1.8s)      ← THIS is LLM observability
        ├── gen_ai.usage.input_tokens = 1,250
        ├── gen_ai.usage.output_tokens = 340
        ├── gen_ai.usage.cost = 0.0
        ├── gen_ai.request.model = "mistral:7b"
        ├── gen_ai.provider.name = "ollama"
        ├── gen_ai.request.temperature = 0.3
        ├── gen_ai.response.finish_reasons = ["stop"]
        └── gen_ai.operation.name = "chat"
```

The HTTP span already flows through your pipeline (that's the 117K traces in Kafka). The `gen_ai.*` child span is what's missing — it requires the OpenLIT SDK to instrument the LLM client libraries.

### What OpenLIT Is (Three Separate Things)

OpenLIT is often described as one tool, but it's actually three independent components:

#### 1. OpenLIT Python SDK (`pip install openlit`)
**This is the valuable part.** A Python library that monkey-patches LLM client libraries (Ollama, Anthropic, OpenAI, LangChain, etc.) to emit `gen_ai.*` OTEL spans. One line of code:

```python
import openlit
openlit.init(otlp_endpoint="http://otel-collector:4317")
```

After this, every `ollama.chat()` or `anthropic.messages.create()` call automatically emits a span with token counts, cost, model info, and latency. The SDK doesn't care where the spans go — it just uses the standard OTEL exporter.

**Instruments**: 50+ providers including Ollama, Anthropic, OpenAI, Qdrant, ChromaDB, LangChain, FastAPI.

#### 2. OpenLIT Dashboard (Next.js app on port 3000)
A web UI that queries ClickHouse to show token usage charts, cost breakdowns, and latency percentiles. It **only speaks ClickHouse** — you can't point it at Elasticsearch, Postgres, or anything else. This is the part running on `:30301`.

#### 3. ClickHouse (analytics database)
A columnar OLAP database designed for massive-scale analytics (billions of rows). OpenLIT uses it to store and query OTEL spans. In our case, it stores 120K traces (5.3MB) but generates 4.3GB of its own system logs.

**Key insight**: Component 1 (SDK) is independent of components 2 and 3. You can use the SDK to instrument your apps and send data anywhere OTEL can reach.

### Current Architecture (What We Have Today)

```
┌──────────────────────────────────────────────────────────┐
│                    Application Layer                      │
│                                                          │
│  rag-gateway ──→ OTEL auto-instrumentation (FastAPI)     │
│       │            Produces HTTP spans only               │
│       │            NO gen_ai.* attributes                 │
│       ▼                                                  │
│  OTEL Collector (buffered) ──→ Kafka                     │
│       │                          │                       │
│       │                    ┌─────┴──────────┐            │
│       │                    │  otel.traces.raw (117K)  ←──│──── Nobody reads this!
│       │                    │  otel.logs.raw (10K)     ←──│──── Vector reads this ✓
│       │                    │  otel.metrics.raw (66K)  ←──│──── Nobody reads this!
│       │                    └────────────────┘            │
│       │                                                  │
│       └──→ OpenLIT OTEL Collector ──→ ClickHouse         │
│                  (separate collector)    749Mi memory     │
│                                         4.5GB disk       │
│                                         5.3MB actual     │
│                                                          │
│  OpenLIT Dashboard (:30301) ──→ queries ClickHouse       │
│       123Mi memory                                       │
└──────────────────────────────────────────────────────────┘

                     ┌────────────────────┐
                     │  Vector Pipeline   │
                     │                    │
                     │  otel.logs.raw ──→ Elasticsearch  ✓ Working
                     │                ──→ Loki           ✓ Working
                     │                    │
                     │  (traces, metrics  │
                     │   not consumed)    │
                     └────────────────────┘

                     ┌────────────────────┐
                     │  Elasticsearch     │  2,907Mi memory
                     │  Kibana (:30601)   │  620Mi memory
                     │  (already running) │
                     └────────────────────┘
```

### Problems With Current Architecture

1. **ClickHouse is 99.9% waste** — 4.3GB of self-logging, 5.3MB of actual OpenLIT data. OOMKilled every 9 hours for 70 days (VW-88).

2. **Two separate trace stores** — HTTP traces go to Kafka (unread), LLM traces go to ClickHouse. No unified view.

3. **183K OTEL messages in Kafka going unread** — `otel.traces.raw` (117K) and `otel.metrics.raw` (66K) have no consumer. Data ages out at 3-day retention.

4. **No `gen_ai.*` attributes** — The OpenLIT SDK isn't initialized in the apps, so even the ClickHouse data is just basic OTEL collector passthrough, not rich LLM telemetry.

5. **872Mi memory for marginal value** — ClickHouse (749Mi) + OpenLIT app (123Mi) for a dashboard that nobody regularly checks.

6. **OpenLIT dashboard is a dead end** — It only queries ClickHouse. Can't integrate with Grafana, Kibana, or any other visualization tool.

---

## Decision

### Migrate to: Kafka → Vector → Elasticsearch

**Keep** the OpenLIT Python SDK (instrumentation layer).
**Remove** the OpenLIT dashboard and ClickHouse.
**Route** all OTEL data through the existing Kafka → Vector → Elasticsearch pipeline.

### Proposed Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Application Layer                      │
│                                                          │
│  rag-gateway:                                            │
│    import openlit                                        │
│    openlit.init(otlp_endpoint="otel-collector:4317")     │
│       │                                                  │
│       │  Now every LLM call emits gen_ai.* spans:        │
│       │  ┌──────────────────────────────────┐            │
│       │  │ HTTP Span: POST /v1/rag/search   │            │
│       │  │  └── gen_ai.chat: mistral:7b     │            │
│       │  │       input_tokens: 1250         │            │
│       │  │       output_tokens: 340         │            │
│       │  │       cost: 0.0                  │            │
│       │  │       temperature: 0.3           │            │
│       │  └──────────────────────────────────┘            │
│       ▼                                                  │
│  OTEL Collector ──→ Kafka                                │
│                       │                                  │
│                 ┌─────┴──────────┐                       │
│                 │ otel.traces.raw  │ ← now contains       │
│                 │ otel.logs.raw    │   gen_ai.* attributes│
│                 │ otel.metrics.raw │                      │
│                 └─────┬──────────┘                       │
│                       │                                  │
│                       ▼                                  │
│                 Vector Pipeline                          │
│                 ┌─────────────────────────────┐          │
│                 │ [sources]                    │          │
│                 │   kafka_logs_raw      ✓ existing       │
│                 │   kafka_traces_raw    🆕 new           │
│                 │   kafka_metrics_raw   🆕 new           │
│                 │                              │          │
│                 │ [transforms]                 │          │
│                 │   enrich_traces  → add index │          │
│                 │   enrich_metrics → add index │          │
│                 │                              │          │
│                 │ [sinks]                      │          │
│                 │   elasticsearch_traces  🆕   │          │
│                 │   elasticsearch_metrics 🆕   │          │
│                 │   elasticsearch_logs    ✓    │          │
│                 │   loki_logs             ✓    │          │
│                 └─────────────────────────────┘          │
│                       │                                  │
│                       ▼                                  │
│            ┌──────────────────────┐                      │
│            │  Elasticsearch       │                      │
│            │                      │                      │
│            │  Indices:            │                      │
│            │  logs-otel-*    ✓    │                      │
│            │  traces-otel-* 🆕   │ ← gen_ai.* fields    │
│            │  metrics-otel-* 🆕  │   mapped as numeric   │
│            └──────────┬───────────┘                      │
│                       │                                  │
│            ┌──────────┴───────────┐                      │
│            │                      │                      │
│       Kibana (:30601)       Grafana (:30300)             │
│       - Trace drilldown     - Token dashboards           │
│       - Span search         - Cost over time             │
│       - Content view        - Model comparison           │
│       - Discovery           - Latency percentiles        │
│                                                          │
│  REMOVED:                                                │
│  ✗ ClickHouse (749Mi freed)                              │
│  ✗ OpenLIT dashboard (123Mi freed)                       │
│  ✗ OpenLIT OTEL Collector (separate one, not main)       │
└──────────────────────────────────────────────────────────┘
```

### How Each Component Works in the New Pipeline

#### OpenLIT SDK (kept — runs inside app pods)
- **What it does**: When `openlit.init()` is called, it hooks into LLM client libraries at the Python level. When your code calls `ollama.chat(model="mistral:7b", messages=[...])`, the SDK wraps that call in an OTEL span, measures timing, extracts token counts from the response, calculates cost, and exports the span via OTLP.
- **Where it runs**: Inside each app container (rag-gateway, rag-retriever). No separate pod.
- **Resource cost**: Negligible — a few MB of Python memory, microseconds of overhead per LLM call.

#### OTEL Collector (existing — no changes needed)
- **What it does**: Receives OTLP spans from apps, batches them, and produces to Kafka topics. Already running as `otel-collector-buffered` in the monitoring namespace.
- **Why no changes**: It already routes traces to `otel.traces.raw`, logs to `otel.logs.raw`, metrics to `otel.metrics.raw`. The new `gen_ai.*` attributes are just additional span attributes — they flow through automatically.

#### Kafka (existing — no changes needed)
- **What it does**: Durable message buffer between OTEL Collector and Vector. Provides backpressure, replay ability, and decouples producers from consumers.
- **Why no changes**: Topics already exist with data. We're just adding consumers (Vector sources) for the currently-unread topics.

#### Vector (existing — ConfigMap update only)
- **What it does**: Consumes from Kafka topics, enriches messages (adds timestamps, index names, extracts metadata), and sinks to Elasticsearch and Loki.
- **What changes**: Add two new source blocks (`kafka_traces_raw`, `kafka_metrics_raw`), two new transforms, and two new Elasticsearch sinks. Same pattern as the existing `kafka_logs_raw` source.
- **Why Vector and not Logstash**: Logstash exists as a dormant ConfigMap only (no running pod). Vector is already running and consuming Kafka successfully. Vector is also more memory-efficient than Logstash (~50MB vs ~500MB).

#### Elasticsearch (existing — index mapping addition)
- **What changes**: A component template that maps `gen_ai.*` fields as numeric types instead of strings. Without this, token counts like `1250` would be stored as the string `"1250"` and you couldn't sum/average them in dashboards.

```json
{
  "properties": {
    "gen_ai_usage_input_tokens":  { "type": "integer" },
    "gen_ai_usage_output_tokens": { "type": "integer" },
    "gen_ai_usage_cost":          { "type": "float" },
    "gen_ai_request_model":       { "type": "keyword" },
    "gen_ai_provider_name":       { "type": "keyword" },
    "gen_ai_operation_name":      { "type": "keyword" }
  }
}
```

#### Kibana (existing — dashboard creation)
- **Discover**: Search for `gen_ai_operation_name: "chat"` to find all LLM calls
- **Lens**: Build visualizations — token usage over time, cost by model, latency percentiles
- **APM**: If using Elastic APM ingest, get trace waterfall views showing HTTP → LLM call nesting

#### Grafana (existing — dashboard creation)
- **Elasticsearch datasource**: Already supported. Build panels for aggregated metrics (sum of tokens per hour, cost per day).
- **OpenLIT provides a Grafana dashboard JSON** for Prometheus+Tempo that can be adapted for Elasticsearch queries.

### Hallucination Detection

OpenLIT's hallucination detection is an **active LLM-as-judge evaluation**, not passive monitoring. It sends your prompt + context + LLM response to a separate evaluator LLM that scores faithfulness.

This ADR **does not implement hallucination detection** but establishes the telemetry pipeline that enables it. Two future approaches:

| Approach | Method | Where It Runs | Latency Impact |
|----------|--------|---------------|----------------|
| **NLI Model** | `vectara/hallucination_evaluation_model` — a small (~200MB) Natural Language Inference model that scores whether a response is grounded in the provided context | Ollama on CPU (already running) | +200ms per request |
| **LLM-as-judge** | Send prompt+context+response to an evaluator LLM (Ollama or Anthropic) | Inline in rag-gateway or as async Kafka consumer | +2-5s per request |

Both emit scores as OTEL span attributes (`eval.faithfulness_score`, `eval.hallucination_detected`) that flow through the same pipeline into Elasticsearch automatically.

---

## Implementation Steps

### Phase 1: Wire the Pipeline (Vector + ES mapping)

1. **Update Vector ConfigMap** — add sources for `otel.traces.raw` and `otel.metrics.raw`, transforms for enrichment, sinks to Elasticsearch
2. **Create ES index template** — map `gen_ai.*` fields as numeric types
3. **Verify** — confirm traces and metrics flow from Kafka through Vector into ES indices

### Phase 2: Add SDK Instrumentation

4. **Add `openlit` to requirements.txt** for rag-gateway and rag-retriever
5. **Add `openlit.init()`** to app startup code
6. **Rebuild and deploy** container images
7. **Verify** — confirm `gen_ai.*` attributes appear in Elasticsearch spans

### Phase 3: Build Dashboards

8. **Kibana Discover** saved searches for LLM spans
9. **Kibana/Grafana dashboards** for token usage, cost, latency, model distribution
10. **Adapt OpenLIT's Grafana dashboard JSON** if using Prometheus metrics export

### Phase 4: Decommission

11. **Remove ClickHouse StatefulSet** from `openlit.yaml`
12. **Remove OpenLIT dashboard Deployment** from `openlit.yaml`
13. **Keep PVCs temporarily** as backup, delete after 7 days of stable operation
14. **GitOps commit** and FluxCD reconciliation

### Phase 5: Hallucination Detection (Future)

15. **Evaluate NLI model** (`vectara/hallucination_evaluation_model`) on Ollama
16. **Prototype inline evaluation** in rag-gateway for Deep Research responses
17. **Emit scores as OTEL attributes** — automatic pipeline to ES

---

## Consequences

### Positive

- **872Mi memory freed** — ClickHouse (749Mi) + OpenLIT dashboard (123Mi) removed
- **Unified trace store** — all OTEL data (HTTP + LLM + logs + metrics) in Elasticsearch, queryable from Kibana
- **183K unread messages consumed** — fixes the gap of traces and metrics aging out in Kafka
- **Rich LLM telemetry** — `gen_ai.*` attributes enable token/cost/latency tracking that didn't exist before
- **Two visualization options** — Kibana for trace drilldown, Grafana for metric dashboards
- **No new infrastructure** — every component in the new pipeline already exists and runs
- **Eliminates ClickHouse OOM risk** — root cause of VW-88 (190 restarts over 70 days) is removed entirely

### Negative

- **Lose OpenLIT's prebuilt dashboard** — need to build Kibana/Grafana dashboards (one-time effort)
- **Elasticsearch memory may increase slightly** — additional traces and metrics data, though volume is small (~5MB/week based on current rates)
- **Hallucination detection deferred** — requires a separate future effort (Phase 5)

### Neutral

- **OpenLIT SDK remains a dependency** — it's actively maintained (50+ provider integrations) but could be replaced with manual OTEL instrumentation if needed
- **Vector ConfigMap grows** — adds ~40 lines of config for the new sources/transforms/sinks

---

## Alternatives Considered

### Alternative 1: Keep OpenLIT + Fix ClickHouse

Add TTL configuration to ClickHouse system tables to prevent bloat. Keep the existing architecture.

**Rejected because:**
- Still runs two separate trace stores (ClickHouse + whatever consumes Kafka)
- 183K Kafka messages still unread
- ClickHouse remains a single-purpose database for one small dashboard
- Doesn't address the fragmented observability architecture

### Alternative 2: Replace ClickHouse with PostgreSQL for OpenLIT

OpenLIT dashboard also supports PostgreSQL as a backend (experimental).

**Rejected because:**
- Still keeps a separate dashboard when Kibana/Grafana already exist
- PostgreSQL would need deployment and maintenance
- Doesn't consolidate the data pipeline

### Alternative 3: Remove All LLM Observability

Delete OpenLIT entirely and don't replace it.

**Rejected because:**
- LLM token usage and cost tracking are essential for a platform running multiple models
- The OTEL pipeline already exists — we'd be throwing away working infrastructure
- Hallucination detection is a stated goal for the platform

### Alternative 4: Use Grafana Tempo Instead of Elasticsearch for Traces

Route traces to Tempo (already running in monitoring namespace) instead of Elasticsearch.

**Considered viable but deferred because:**
- Tempo is optimized for trace storage and querying via TraceQL
- However, Tempo doesn't support arbitrary metric aggregations on span attributes (e.g., "sum of tokens per hour by model")
- Elasticsearch with Kibana Lens provides both trace drilldown AND metric aggregation
- Could add Tempo as a secondary sink later for Grafana trace UI integration

---

## References

- VW-88: ClickHouse OOMKilled incident (190 restarts)
- VW-89: Beyla memory pressure (related monitoring fix)
- 2026-02-17-Alert-Review-Matrix-ClickHouse-Beyla-Fixes *(internal reference; not included)*: Implementation report
- 2026-02-17-ClickHouse-OOMKilled-Incident *(internal reference; not included)*: Incident report
- [OpenTelemetry Gen AI Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-spans/)
- [OpenLIT SDK Documentation](https://docs.openlit.io/latest/sdk/overview)
- [OpenLIT GitHub](https://github.com/openlit/openlit)
- [Elastic + OpenLIT Integration Blog](https://www.elastic.co/observability-labs/blog/elastic-opentelemetry-langchain-openlit-tracing)
- [Grafana LLM Observability Guide](https://grafana.com/blog/2024/07/18/a-complete-guide-to-llm-observability-with-opentelemetry-and-grafana-cloud/)
- OpenLIT Grafana dashboard: `docs.openlit.io/latest/sdk/destinations/prometheus-tempo`
- Vectara hallucination evaluation model: `huggingface.co/vectara/hallucination_evaluation_model`

---
*Glossary *(internal reference; not included)**
