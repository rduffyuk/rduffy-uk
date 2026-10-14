---
id: 50
title: "Personal Industry Radar Pipeline — Native Workspace Implementation"
status: accepted
recordedStatus: "Accepted"
date: 2026-05-28
tags: ["architecture", "knowledge-management", "radar", "rss", "llm", "rootweaver-radar", "workspace-package", "dual-llm-mode-a"]
sourceKind: source-record
public: true
journeyId: "2026-05-28-adr-050-personal-industry-radar-pipeline-native-workspace-implementation"
---
# ADR-050: Personal Industry Radar Pipeline — Native Workspace Implementation

**Status**: Accepted (decision 2026-05-22; deployed + verified in production 2026-05-27; record filed 2026-05-28)
**Date**: 2026-05-28
**Jira**: VW-424 (parent), VW-418 (research umbrella context)
**Supersedes-in-part**: [ADR-049-Personal-Industry-Radar-Pipeline](/adrs/049-personal-industry-radar-pipeline/) — replaces its "deploy Precis + plugins" *implementation choice* only
**Related**: [ADR-047-LLM-Content-Trust-Boundary](/adrs/047-llm-content-trust-boundary/) (radar emits via the untrusted lane), [ADR-030-Repository-Structure-for-AI-Assisted-Development](/adrs/030-repository-workspace/) (workspace pattern this respects), [ADR-029-KEDA-GPU-Swap-Controller](/adrs/029-keda-gpu-swap-controller/) (radar uses Ollama-CPU only — swap-irrelevant), [ADR-051-Radar-Feed-Acquisition-Tiered-Hierarchy](/adrs/051-radar-feed-acquisition-tiered-hierarchy/) (downstream feed-acquisition policy that consumes this)
**Design basis**: 2026-05-22-Radar-Restructure-Design *(internal reference; not included)* (`superpowers:brainstorming` output)

---

## 1. Context

### 1.1 What ADR-049 decided, and why it didn't survive review

[ADR-049-Personal-Industry-Radar-Pipeline](/adrs/049-personal-industry-radar-pipeline/) (2026-05-21) decided to build the personal industry-signal radar by **deploying [Precis](https://github.com/leozqin/precis) (a third-party MIT RSS-summariser) into K3s**, with two Rootweaver-specific plugins (Discord + vault-writer) written to `external/precis-plugins/`. The intent — curated AI/ML/SRE/telco signal ingestion, relevance filtering by a cheap LLM, vault synthesis via the Karpathy LLM Wiki pattern — was sound and is **not** revisited here.

A review on 2026-05-22 (one day later) surfaced three structural problems with the *implementation choice*:

1. **Monorepo discipline violation.** `external/precis-plugins/` is not an [ADR-030](/adrs/030-repository-workspace/) workspace member. The K3s manifests pointed at a Rootweaver-flavoured Precis image that did not exist, and the plugin code sat outside the `packages/&lt;name&gt;/ + services/&lt;name&gt;/Dockerfile` pattern that every other deployable in the platform follows.
2. **Unverified third-party surface.** At least one feed URL baked into the ADR-049 config (`https://www.anthropic.com/news/feed`) 404'd, and the team would own the operational burden of a vendored upstream with its own release cadence and dormancy risk.
3. **Process discipline.** Implementation had jumped straight to code, skipping `superpowers:brainstorming → writing-plans → test-driven-development`. The artefacts were code-first, design-after.

### 1.2 Constraints (unchanged from ADR-049 §1.2)

- **Anthropic API costs are unwelcome by default** — operator holds a Claude Code Max subscription; per-call API billing should be minimised, not necessarily zero.
- **2026-06-15 Anthropic billing change** — the announced Claude Code billing split makes the *effective* per-call cost picture uncertain; the design must be resilient to it without a rebuild.
- **Single-person operation, leverage-via-Claude** — manual curation does not scale; the pipeline must be fully autonomous on a schedule.
- **Provenance must follow [ADR-047](/adrs/047-llm-content-trust-boundary/)** — all radar content is external-authored web content and must carry `trust_level=untrusted` end-to-end.
- **No new operational surface** — reuse existing K3s + Ollama (CPU) + vault-postgres + Harbor + Prometheus.

## 2. Decision

**Build the radar as a native first-party workspace package — `packages/rootweaver-radar/` + `services/rootweaver-radar/Dockerfile` — replacing the Precis deployment entirely.** Roll back all yesterday's Precis artefacts.

The package is structured around five decisions:

### 2.1 Pluggable LLM backend behind a Protocol

A single `LLMBackend` Protocol (`score_entry(entry) -> RelevanceJudgement`) with two concrete implementations that **both ship regardless of which one is the default**:

- `OllamaBackend(base_url, model)` — HTTP, CPU-only, £0 marginal cost
- `AnthropicBackend(api_key, model, prompt_cache=True)` — Anthropic SDK, supports Haiku/Sonnet, `cache_control: ephemeral` on the stable system prompt

Backend selection is a single env var (`RADAR_BACKEND=ollama|anthropic`) — no rebuild to switch. This is the **[ADR-047](/adrs/047-llm-content-trust-boundary/) §5.4 Mode A dual-LLM pattern**: keep both lanes operational so a config change (or the 2026-06-15 billing shift) is a one-line ConfigMap edit, not a code change.

### 2.2 Empirically-selected default backend (not assumed)

The design deferred the default-backend choice to a **quality experiment shipped as deliverable #1** rather than guessing. Five configurations were scored on the same real RSS sample with the same prompt: `qwen2.5:3b`, `qwen3.5:0.8b`, `claude-haiku-4-5`, `claude-haiku-4-5+cache`, `claude-sonnet-4-6`. See §4 for the outcome — **Haiku-cached won and is the production default**, overturning the design doc's tentative Ollama default.

### 2.3 One CLI, two invocation modes

`rootweaver-radar run` is the single entry point for both manual operator runs (from Mac/desktop, with `--dry-run` for validation) and the scheduled K3s CronJob. A second console script `rootweaver-radar-bench` runs the quality experiment. No divergence between "how I test it" and "how it runs in prod".

### 2.4 State in vault-postgres `radar.*` schema

Dedup and scoring history live in a new `radar.*` schema in the existing `vault_index` Postgres database (consistent with `memory.*` and the jira-sync schema), applied by an idempotent one-shot migration Job. Dedup key: `entry_id = sha256(feed_name || entry.link || entry.published)`.

### 2.5 ADR-047 provenance on every output

Every written vault file carries `trust_level=untrusted` provenance frontmatter with the full ingest chain, plus a `wiki_candidate` flag (score ≥ 8) so the future synthesis layer can distinguish pattern-establishing content from transient news.

### What ADR-049 decisions are *inherited unchanged*

Vault folder layout (`04-Resources/AI-ML-Research/Raw/`, `Wiki/`, `Wiki/_stubs/`), the curated source-list intent, the Karpathy LLM Wiki synthesis-layer plan (still deferred — see §6), and ADR-047 provenance integration all remain valid and are carried forward.

## 3. As-built architecture

### 3.1 Package layout (deployed at `v0.1.1`)

```
packages/rootweaver-radar/src/rootweaver_radar/
├── cli.py            # `rootweaver-radar run` entry point; wires DedupStore when RADAR_POSTGRES_DSN set
├── config.py         # RadarConfig (pydantic-settings, env_prefix="radar_")
├── schema.py         # FeedEntry, RelevanceJudgement
├── feeds.py          # feedparser pull (etag/last-modified aware)
├── parser.py         # defensive RSS/Atom parse with per-feed error tolerance
├── prompt.py         # prompt builder w/ cache-padding for Anthropic ≥1024-token cache floor
├── dedup.py          # vault-postgres DedupStore
├── filter.py         # orchestrator: feeds → dedup → backend → summarizer → writer
├── summarizer.py     # secondary article-content fetch for richer vault files
├── writer.py         # markdown writer w/ ADR-047 provenance + wiki_candidate tagging
├── db_schema.sql     # radar.* DDL (idempotent)
├── backends/
│   ├── __init__.py   # LLMBackend Protocol
│   ├── ollama.py     # OllamaBackend (HTTP)
│   └── anthropic.py  # AnthropicBackend (SDK, optional prompt cache)
└── benchmarks/
    ├── quality_comparison.py   # `rootweaver-radar-bench`
    ├── sources.py              # curated source list
    └── results/*.csv,*.md      # experiment runs (2026-05-23, -25, -27)
```

Modules that emerged during TDD beyond the design sketch: `parser.py` (split from `feeds.py`), `prompt.py`, `summarizer.py` (the two-pass enrichment — see §3.2), `sources.py`, `db_schema.sql`. The design's `observability.py` was folded into the CLI rather than shipped as a separate module.

### 3.2 Two-pass enrichment (emergent, not in the original sketch)

The as-built pipeline does more than score-and-archive. For `wiki_candidate` items (score ≥ 8), a second Haiku pass adds **platform-implications framing** (commit `e7ec4dde`), and `summarizer.py` does a **secondary fetch of the full article** (commit `a3890e36`) so the vault file carries real content, not just the RSS summary. This is the cheap "is this worth a durable Wiki page?" signal the future synthesis layer will consume.

### 3.3 Database schema (as-built `db_schema.sql`)

```sql
CREATE SCHEMA IF NOT EXISTS radar;
CREATE TABLE IF NOT EXISTS radar.feed_entries (
    entry_id         TEXT PRIMARY KEY,
    feed_name        TEXT NOT NULL,
    entry_url        TEXT NOT NULL,
    title            TEXT,
    fetched_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    relevance_score  INTEGER,
    threshold_passed BOOLEAN NOT NULL DEFAULT FALSE,
    wiki_candidate   BOOLEAN NOT NULL DEFAULT FALSE,   -- added vs design sketch
    backend_used     TEXT,
    error            TEXT
);
CREATE INDEX IF NOT EXISTS idx_radar_entries_feed   ON radar.feed_entries (feed_name, fetched_at);
CREATE INDEX IF NOT EXISTS idx_radar_entries_passed ON radar.feed_entries (threshold_passed, fetched_at);
```

### 3.4 Production deployment (rootweaver-gitops)

| Artefact | Value |
|---|---|
| Image | `REDACTED_PRIVATE_IP:30500/rootweaver/rootweaver-radar:v0.1.1` |
| CronJob | `radar-cronjob.yaml` — nightly `0 3 * * *` UK, `concurrencyPolicy: Forbid`, `restartPolicy: OnFailure` |
| Backend (prod) | `RADAR_BACKEND=anthropic`, `RADAR_ANTHROPIC_MODEL=claude-haiku-4-5`, `prompt_cache=true` |
| Fallback lane | `RADAR_OLLAMA_MODEL=qwen2.5:3b` retained in env — one-line switch |
| State | `RADAR_POSTGRES_DSN` → vault-postgres `radar.*`; seeded by `radar-schema-migration-job.yaml` |
| Secret | `radar-sealedsecret.yaml` (Anthropic API key) |
| Config | `radar-configmap.yaml` (feeds.yml + prompt + threshold) |
| Egress | `radar-networkpolicy.yaml` (Anthropic, vault-postgres, HTTPS feeds) |
| Metrics | Prometheus port 9101 |
| Vault output | `04-Resources/AI-ML-Research/Raw/YYYY-MM-DD/&lt;slug&gt;.md` via hostPath mount, `runAsUser/fsGroup: 1000` |

**First production run (2026-05-27): 1,594 feed entries processed → 328 vault files written.**

## 4. The quality experiment that set the default

Run 2026-05-23, 42 entries (target 50; 8 lost to 404'd feeds), 5 backends × 42 = 210 rows. Full data: `packages/rootweaver-radar/benchmarks/results/2026-05-23-report.md`.

| Model | Mean | Pass rate (≥7) | Agreement w/ Sonnet | P50 latency | Verdict |
|---|---:|---:|---:|---:|---|
| claude-sonnet-4-6 | 5.24 | 42.9% | — (soft ground truth) | 2185 ms | Reference |
| claude-haiku-4-5 | 5.19 | 40.5% | **88.1%** | 1673 ms | — |
| claude-haiku-4-5 **+cache** | 5.19 | 40.5% | **88.1%** | 1640 ms | **✅ Selected default** |
| qwen2.5:3b | 4.12 | 9.5% | 66.7% | 17097 ms | Too conservative, slow |
| qwen3.5:0.8b | 0.00 | 0% | — | 555 ms | Catastrophic (100% model-load errors) |

**Findings that drove the decision:**

1. **Haiku-cached ≡ Haiku-uncached at 100% output agreement** — `cache_control: ephemeral` changes *cost*, not output. Cache shaved 33 ms median. So caching is free quality-wise → always on.
2. **Haiku is an 88%-faithful proxy for Sonnet** at ⅓ the cost — strong enough for a relevance gate.
3. **qwen2.5:3b agreed with Sonnet only 67%** and was dramatically more conservative (9.5% pass vs 43%) and ~10× slower on CPU (17 s/call) — not trustworthy as the relevance arbiter.
4. **qwen3.5:0.8b was unusable** (model-load failure on every call).

This **reversed the design doc's tentative Ollama default**: empirical data, not the £0 price tag, picked the backend. Ollama stays shipped as the zero-cost fallback lane (Mode A), but production runs Haiku-cached. Estimated cost at ~1,600 entries/night with caching: low single-digit £/month, comfortably inside the Max bundle.

## 5. Consequences

### 5.1 Positive

- **Monorepo consistency** — radar is a normal ADR-030 workspace member; no vendored third-party code, no upstream-dormancy risk, full ownership.
- **Billing-change resilient** — the 2026-06-15 Anthropic change is absorbed by a one-line `RADAR_BACKEND` flip, not a rebuild.
- **Empirically grounded** — the backend choice is backed by a reproducible experiment, not a guess; re-runnable as models change.
- **Provenance-clean** — every output is ADR-047 `trust_level=untrusted`, so downstream RAG/synthesis can trust-gate it.
- **TDD'd** — unit + testcontainers-postgres integration tests landed before/with implementation; `services/rootweaver-radar/Dockerfile` passes the VW-366 workspace-dep lint.

### 5.2 Negative / accepted trade-offs

- **Recurring (small) Anthropic spend** — no longer strictly £0. Accepted: quality > £0, and the fallback lane caps the downside.
- **More first-party code to maintain** than vendoring Precis — accepted as the price of monorepo discipline and option-value.
- **Relevance bar is one LLM's judgement** — the 2-week signal-quality audit (§6) is the mitigation.

### 5.3 Three production-only bugs (surfaced during 2026-05-27 deploy)

None of these were visible in unit/integration tests; all are deploy-environment-specific and worth recording for the next service that touches vault-postgres + NetworkPolicy:

1. **DSN dialect mismatch** (`5a827f03`, gitops `495b566`) — the shared Postgres DSN secret carries a SQLAlchemy `postgresql+psycopg://` scheme. `psql` (used by the migration Job) only understands bare `postgresql://`. Fixed by sed-stripping the `+psycopg` dialect suffix in the migration Job and normalising the DSN in `dedup.py`.
2. **Two-sided NetworkPolicy gating** (gitops `75490e5`, `3940c05`) — under default-deny, both the **egress** from the radar pod *and* the **ingress** to `vault-postgres:5432` must be whitelisted, and the one-shot migration Job pod needed the `app=rootweaver-radar` label to match the egress selector. A pod that "should" reach Postgres silently times out until *both* sides are open.
3. **Migration privilege + `ON_ERROR_STOP`** — the DDL runs via `psql` in the migration Job; getting the connection privilege right and failing loudly on DDL error (rather than a silent partial apply) was the third fix before the schema applied cleanly.

## 6. Scope boundaries (non-goals — deferred, not rejected)

- **Karpathy LLM Wiki synthesis layer** — the routine that reads `Raw/` and builds durable `Wiki/` topic pages. Explicitly deferred to a separate brainstorm after ~2 weeks of `Raw/` accumulation. The `wiki_candidate` flag is the forward-hook for it.
- **2-week signal-quality audit** — tune prompt / threshold / source list once nightly data exists (VW-424 Phase 3 follow-on).
- **Discord digest, cost dashboards, source-management UI, productisation** — all option-value only.

## 7. Alternatives considered

| Alternative | Why not |
|---|---|
| Keep Precis (ADR-049) | Vendored third-party outside ADR-030; upstream-dormancy + ops-burden risk; broken default feeds. |
| Ollama-only (£0, no API) | Experiment showed qwen2.5:3b only 67% agreement w/ Sonnet, far too conservative, ~10× slower; 0.8b unusable. |
| Anthropic-only (no Ollama) | Loses the billing-change escape hatch; violates Mode A dual-lane resilience. |
| Defer until after 2026-06-15 billing clarity | Pluggable backend already absorbs the billing change; no reason to wait. |

## 8. References

### Architectural decisions
- [ADR-049-Personal-Industry-Radar-Pipeline](/adrs/049-personal-industry-radar-pipeline/) — superseded-in-part (Precis implementation choice only)
- [ADR-047-LLM-Content-Trust-Boundary](/adrs/047-llm-content-trust-boundary/) — provenance schema + Mode A dual-LLM pattern
- [ADR-030-Repository-Structure-for-AI-Assisted-Development](/adrs/030-repository-workspace/) — workspace package pattern
- [ADR-051-Radar-Feed-Acquisition-Tiered-Hierarchy](/adrs/051-radar-feed-acquisition-tiered-hierarchy/) — downstream feed-acquisition policy
- [ADR-029-KEDA-GPU-Swap-Controller](/adrs/029-keda-gpu-swap-controller/) — radar is Ollama-CPU-only (swap-irrelevant)

### Design + companion artefacts
- 2026-05-22-Radar-Restructure-Design *(internal reference; not included)* — `superpowers:brainstorming` spec (the basis for this ADR)
- Experiment data: `packages/rootweaver-radar/benchmarks/results/2026-05-23-report.md`

### Jira
- VW-424 — radar implementation umbrella (Improvement); this ADR closes Phase 3 Task 3.1
- VW-418 — research umbrella (Problem)

### Code + deployment
- Package: `packages/rootweaver-radar/` (deployed `v0.1.1`)
- Service: `services/rootweaver-radar/Dockerfile`
- GitOps: `rootweaver-gitops/infrastructure/rootweaver/radar-*.yaml`

---

*Filed 2026-05-28 per VW-424 Phase 3 Task 3.1. Documents the system as deployed + verified in production on 2026-05-27 (1,594 entries → 328 vault files), not merely as designed.*
