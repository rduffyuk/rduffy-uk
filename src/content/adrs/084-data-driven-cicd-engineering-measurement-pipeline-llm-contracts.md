---
id: 84
title: "Data-Driven CI/CD Engineering: Measurement, Pipeline Optimization, and LLM-Channel Contracts"
status: accepted
recordedStatus: "Accepted"
date: 2026-06-21
tags: ["ci-cd", "dora", "metrics", "opa", "llm-agents", "pipeline", "measurement", "provenance"]
sourceKind: source-record
public: true
journeyId: "2026-06-21-adr-084-data-driven-ci-cd-engineering-measurement-pipeline-optimization-and-llm-channel-contracts"
---
# ADR-084 — Data-Driven CI/CD Engineering: Measurement, Pipeline Optimization, and LLM-Channel Contracts

**Status**: Accepted
**Date**: 2026-06-21 (proposed and accepted same day)
**Jira**: VW-942
**Deciders**: Ryan Duffy
**Relates to**: ADR-024 (GitLab Flow), ADR-056 (Dynamic Test Impact Analysis), ADR-061 (Developer-Agent Provenance), ADR-075 (Workload-Level Provenance), ADR-079 (Claude-drives-Codex Handoff)

---

## Context

### The Reactive Problem

Four recent CI incidents illustrated the pattern: VW-932 (queue regression), VW-927 (WAN image re-pull), VW-931 (reverted S3 cache), VW-935 (Dockerfile layer split). Three of the four were symptom-chasing — the fix was found by inspection, not measurement. Only VW-935 was driven by identified cause (layer cache invalidation analysis). The team has no instrument that says which lever matters next or whether a change improved the system.

### The AI-Pipeline Instability Problem

Three autonomous LLM agents (Claude Code, Codex, Hermes) now commit MRs into the same pipeline. DORA research provides the mechanism: DORA 2024 (Google Cloud, N=36,000+) found AI adoption correlated with deployment frequency −1.5% and delivery stability −7.2%. The identified mechanism was **batch size** — AI-assisted development tends to produce larger, less decomposed changesets, which drive higher change-failure rates. DORA 2025 found the throughput correlation flipped positive but stability remained negative, reframed as "AI amplifies existing capabilities": mature organisations with strong testing discipline and small-batch habits convert AI into real gains; weaker organisations ship failures faster.

The implication: velocity vs. reliability is not the real axis. Engineering **capability** — which manifests as DORA metrics — is the hidden variable that buys both. You cannot manage what you cannot measure.

### Existing-State Finding

A DORA measurement stack already exists but is quietly broken:

- `packages/pdg-generator/src/pdg_generator/metrics/dora_collector.py` computes all four DORA keys (deployment frequency, lead time for change, change failure rate, MTTR) from local JSON feeds (`deployments.json`, `incidents.json`) plus a git-merge heuristic, and classifies performance against DORA 2023 Elite/High/Medium/Low thresholds.
- `pdg-dora-exporter` is deployed in the `rw-codeintel` namespace (Wave 2, ADR-080 / VW-862), Prometheus-scraped on port 9401, with a Grafana DORA dashboard (`grafana-dashboards-dora.yaml`) already wired.
- Three faults make it inert: (1) `collect_from_git` matches ticket references with the regex `(NAAS|GFD)-\d+` (≈ line 310) — stale Leveling-Life keys, so zero VW deployment links are found; (2) the `deployments.json` feed is empty because no deploy job writes a `DeploymentRecord` on successful pipeline completion; (3) no pipeline-as-system metrics exist (queue-duration vs exec-duration split, job p50/p95, cache restore hit/miss, flaky-pass rate) and no batch-size-by-author signal despite ADR-061 author labels being available.

This means **Phase 1 is extend-not-greenfield**: the exporter, its scrape config, and its Grafana dashboard are already deployed; the work is fixing the data feeds and adding new metric dimensions.

---

## Decision

A three-layer framework, sequenced so Layer 1 (Measurement) is a hard prerequisite for the other two.

### Layer 1 — Measurement (Phase 1, immediate)

**Rationale**: No pipeline-engineering win can be proven without before/after data. No OPA contract threshold can be calibrated without knowing the current distribution. Measurement is the single intervention that converts all three layers from reactive to data-driven.

**Actions**:

1. **Fix the DORA collector regex** — replace `(NAAS|GFD)-\d+` with `VW-\d+` so git-merge heuristics link to live Jira.

2. **Wire DeploymentRecord on deploy** — add a post-deploy job step (or a deploy-success hook in `.gitlab-ci.yml`) that appends a `DeploymentRecord` JSON entry on every successful production deploy, keyed by commit SHA and environment.

3. **Bridge VW-440 incident hook to IncidentRecord** — the `track_incident_creation.py` PostToolUse hook already fires when a Jira `Incident` or `Problem` is created. Bridge it to write an `IncidentRecord` entry (incident key, opened timestamp). Resolution timestamp is written when the Stop hook observes the vault incident report landing in `09-System/Incidents/`. This closes the MTTR loop without new infrastructure.

4. **Add pipeline-as-system metrics** — query the GitLab API at pipeline end to emit:
   - `ci_job_queued_duration_seconds{job}` vs `ci_job_exec_duration_seconds{job}` (the VW-932 diagnostic signal that was found manually)
   - `ci_job_duration_p50_seconds`, `ci_job_duration_p95_seconds` per job name
   - `ci_cache_restore_hit{job}` boolean (VW-927, VW-931 diagnostic)
   - `ci_job_flaky_total` (passed-on-retry count per job per week)

5. **Add batch-size-by-author signal** — the leading indicator for the DORA AI-instability mechanism. Using MR diff stats (available from the GitLab API) combined with the ADR-061 `agent:` labels already present on VW issues and the `Co-Authored-By:` / `Agent:` commit trailers (ADR-075):
   - `ci_mr_loc_delta{author_type="human|agent"}` — lines-of-code delta per MR
   - `ci_mr_files_changed{author_type="human|agent"}` — files changed per MR
   - Weekly p50/p95 per author type exposed on the DORA Grafana dashboard

**Storage backend decision (2026-06-21, VW-943)**: Deployment and incident records are persisted in the **platform Postgres** (a dedicated `dora` schema/database with a scoped sealed-secret user), **not** the JSON-file feed described in Actions 2–3 above. Chosen over a push-endpoint-on-exporter or an in-cluster git-CronJob because: (a) durability — the platform Postgres is nightly `pg_dump`'d (VW-666); (b) it **unifies Layer 1 on one store** — VW-943 (deployments/incidents) and VW-944 (pipeline-as-system + batch-size metrics) read/write the same Postgres rather than diverging into JSON files and a second mechanism. Consequences: Actions 2–3 `INSERT` rows rather than append JSON; the `DORACollector` is refactored behind a storage-backend interface and reads Postgres in production (the JSON path is retained only for unit tests); the `collect_from_git` VW-regex fix (Action 1) becomes a one-time + periodic **backfill** seeding historical deployments from gitops/platform merge history into Postgres. The cross-boundary producer paths (in-cluster CI runner → Postgres, and the Mac-resident VW-440 incident hook → Postgres) are the principal implementation risk and are specified in VW-943. This supersedes the JSON-feed framing of the Existing-State Finding for the chosen design; the regex/empty-feed faults it documents remain accurate as the *current* broken state.

**GitLab-native vs custom — tier finding (2026-06-21)**: Our SCM is **gitlab.com SaaS on the Free plan** (`"plan":"free"`, single seat — verified via `glab api /namespaces/ryanduffy.uk`; the `enterprise:true` in `/version` only reflects gitlab.com running the EE codebase, not a paid license). This makes the build-vs-buy decision for Layer 1 a tier-forced one, not a stylistic preference:

- **Native GitLab DORA is unavailable to us** — both the CI/CD Analytics DORA charts AND the `/projects/:id/dora/metrics` API are **Ultimate-only** (~$99/user/mo). Insights dashboards are Ultimate; MR Analytics and Value-Stream-Analytics custom streams are Premium. gitlab.com SaaS exposes **no Prometheus scrape endpoint** (`/-/metrics` is self-managed-only).
- **The raw REST API is free and un-tier-gated** — `/projects/:id/pipelines` and `/jobs` (carrying `duration`, `queued_duration`, `status`) and `/merge_requests` diff stats have no tier gate. This is the authoritative feed for `pdg-dora-exporter` and carries no tier dependency.
- **Free native UI as a complement, not a substitute** — GitLab's CI/CD Analytics (pipeline pass-rate, median duration) and Repository/Contributor analytics are free and fine for a zero-build in-context glance, but they are siloed in the GitLab UI, cannot be unified with the platform Prometheus/Grafana, and cannot express batch-size-by-author or `queued_duration` trends.

**Conclusion**: custom Grafana is the *only* path to the Four Keys and the AI-instability signals at our tier; GitLab gives us the free ingredients (REST API) but charges Ultimate for the cooked dashboard. The native free UI stays as a complementary sanity view.

**References**: DORA 2024 (Google Cloud), DORA 2025, SPACE framework (Forsgren, Storey et al., ACM Queue 2021), Accelerate (Forsgren et al. 2018), GitLab Docs — DORA metrics / CI-CD analytics / pipelines API (tier badges, docs.gitlab.com, 2026).

---

### Layer 2 — Pipeline Engineering (Phase 2, gated on Layer-1 baseline)

**Rationale**: The recent cache architecture work converged on the correct answer empirically. This layer formalises it as a stated principle and adds the next round of wins, now measurable.

**Confirmed architecture (VW-935, VW-927, VW-931)**:

The **cache-transfer economics rule**: a remote cache only wins when the fetch RTT + decompression cost is less than the local rebuild time. VW-927 (GitLab WAN image re-pull) and VW-931 (S3 cache revert) are both instances of the same anti-pattern — a remote fetch that costs more than the work it was meant to skip. VW-935 Dockerfile Layer A/B split (base layer containing slow apt/pip, fast layer containing application code) plus on-LAN Harbor registry is the correct cache architecture and is now the stated baseline.

**Quick wins**:

- **`rules:changes` affected-service scoping** — scope per-service build/test jobs to fire only when files under `packages/&lt;svc&gt;/` or `services/&lt;svc&gt;/` changed. Reduces pipeline wall-clock time for single-service MRs. Prerequisite: Layer-1 `ci_job_exec_duration_p95` data to measure the win.
- **Merge trains** (tier-gated, **unavailable at current tier**) — GitLab merge trains serialize MR pipelines so each train member runs against the post-merged state of its predecessors, eliminating the window where two MRs pass independently but conflict on merge. Requires GitLab **Premium**. Tier confirmed 2026-06-21: gitlab.com **Free** (`glab api /namespaces/ryanduffy.uk` → `plan: free`), so merge trains are not a config change but a paid-upgrade decision. Until/unless upgraded, the merge-conflict-window risk is mitigated instead by the Layer-3 warn-then-enforce OPA gate (diff-scope cap) plus small-batch discipline — cheaper levers that do not require a tier change.

**Larger investment (Phase 2+, informed by Layer-1 flaky and duration data)**:

- **Test impact analysis / predictive test selection** — run only the tests likely to be affected by the changed files, using a coverage-based or static-dependency map. The foundational research: Machalica et al. "Predictive Test Selection" (Meta, ICSE-SEIP 2019, arXiv:1810.05286) achieved >2× infrastructure reduction with >99.9% detection of faulty changes; Memon et al. "Taming Google-Scale Continuous Testing" (Google, ICSE-SEIP 2017) skipped 43% of test targets with no quality regression. A simpler variant already exists as ADR-056 (Dynamic Test Impact Analysis); Layer-1 per-job duration data will quantify the actual win in this repo before the investment.

---

### Layer 3 — LLM-Channel Contracts (Phase 2/3, gated on Layer-1 data)

**Rationale**: Agent-authored MRs currently pass through the same pipeline gate as human MRs, with no machine-checkable contract on scope, provenance, or risk. The Intercom engineering blog (2025) reported ~93% agent-authored PRs and ~19% auto-merge with a decomposed multi-agent review process and labelled audit trail, operating under SOC2/HIPAA constraints. This is the target maturity level. The Rootweaver pipeline already has ADR-061 provenance labels and commit trailers; what is missing is a mandatory enforcement stage.

**Decision: OPA/Conftest gate, rollout = warn-then-enforce.**

An OPA policy bundle evaluated by Conftest as a mandatory CI stage. The rollout sequence: report-only first (emit policy violations as warnings, collect rule-firing-rate data, calibrate thresholds against Layer-1 metrics), then flip to blocking once the distribution is known. The gate measures itself before it gates.

**Policy rules**:

1. **Provenance present** — every MR touching `packages/` or `services/` must carry `agent:` and `model:` labels on the linked VW issue, extending the ADR-061 / ADR-075 contract. Enforced by reading the MR description for a `Relates to: VW-\d+` trailer and querying the Jira labels via the GitLab CI Jira integration.

2. **Diff-scope cap** — soft limit ~400 LOC, hard limit ~600 LOC; more than 5 unrelated top-level directories changed triggers a warning. These thresholds are the direct counter to the DORA batch-size finding. The exact numbers are calibrated against Layer-1 `ci_mr_loc_delta{author_type="agent"}` p90 once data is available; the values above are initial estimates to seed the warn phase.

3. **CI-weakening veto** — block any MR that removes `@pytest.mark.*` decorators, reduces `--cov-fail-under` values, or adds `allow_failure: true` to previously mandatory jobs. This extends the VW-678 coverage floor enforcement from a human-review concern to a machine-enforced contract.

4. **Risk-tier routing** — paths matching `auth/`, `infra/`, regulated data handlers, or CODEOWNERS-protected files require a named human reviewer in addition to any agent review. Implemented as a Rego rule that reads `.gitlab/CODEOWNERS` and emits a warning when an agent MR touches a protected path without a human-reviewer entry in the MR.

**Provenance gap note**: SLSA / in-toto supply-chain frameworks do not yet define an AI-authorship predicate. The provenance design here (ADR-061 commit trailers + ADR-075 workload labels + the OPA rules above) is additive to SLSA but not a substitute for a formal AI-authorship predicate. This is design work worth tracking as the space matures.

**Implementation**: tracked under the VW-942 child tickets, routed to the Codex channel via the ADR-079 handoff protocol.

---

## Sequencing Rationale

```
Phase 1 (Layer 1 — Measurement)
  Fix DORA regex → wire DeploymentRecord → bridge VW-440 hook → add pipeline metrics → add batch-size signal
        |
        v  (baseline established, data flowing)
Phase 2 (Layer 2 — Pipeline + Layer 3 warn mode)
  rules:changes scoping → merge trains check → OPA warn-only gate → test impact analysis scoping
        |
        v  (firing-rate data collected, thresholds calibrated)
Phase 3 (Layer 3 — Enforce)
  OPA gate → blocking → provenance + scope + weakening-veto + risk-tier routing
```

Layer 1 is a hard dependency for both Layer 2 and Layer 3. Without the pipeline metrics from Layer 1, a `rules:changes` win cannot be measured, merge-train ROI cannot be quantified, and OPA diff-scope thresholds cannot be calibrated. Shipping Layer 2 or Layer 3 before Layer 1 produces unmeasured changes — the same reactive pattern this ADR is designed to exit.

---

## Consequences

### Positive

- **Data-driven decisions** — all future pipeline changes have a before/after measurement baseline. The "which lever matters next" question becomes answerable from the Grafana DORA dashboard.
- **AI-instability guardrail** — batch-size-by-author signal (Layer 1) makes the DORA mechanism visible before it manifests as change failures. The OPA scope cap (Layer 3) addresses the mechanism directly.
- **Cache architecture confirmed** — the Layer A/B Dockerfile split and on-LAN registry are now the stated canonical pattern, not just an implicit post-hoc fix. Future CI work starts from a documented baseline.
- **Provenance chain extended** — ADR-061 labels and ADR-075 workload provenance become machine-enforceable at the pipeline gate, not just queryable in retrospect.
- **MTTR loop closed** — bridging the VW-440 incident hook to `IncidentRecord` means MTTR is computed automatically rather than approximated manually.

### Costs and Risks

- **Instrumentation effort** — fixing the DORA collector and adding the GitLab API pipeline metrics requires work in `pdg-generator` and `.gitlab-ci.yml`. Tracked under VW-942 child tickets.
- **OPA friction in warn mode** — even report-only violations appear in MR pipelines. Expect some agent-authored MRs to surface warnings before thresholds are calibrated. The warn phase is intentional; suppress complaints until the data is in.
- **Merge-trains tier gate** — GitLab merge trains require Premium. The check must verify availability before enabling; the gate should warn if unavailable rather than silently degrading.
- **Goodhart risk** — optimising directly for DORA metrics (e.g., artificially splitting deployments to inflate deployment frequency) defeats the purpose. Mitigated by pairing metrics per the SPACE framework principle: never track a single metric in isolation, always pair deployment frequency with change failure rate and MTTR. Dashboard panels should display all four DORA keys together.
- **OPA rule maintenance** — Rego rules require maintenance as the monorepo layout evolves. The `rules:changes` path globs and the CODEOWNERS reader must be kept in sync with the actual directory structure.

---

## References

- DORA 2024 State of DevOps Report (Google Cloud)
- DORA 2025 State of DevOps Report (Google Cloud)
- Forsgren, Storey et al. "The SPACE of Developer Productivity", ACM Queue 2021
- Forsgren, Humble, Kim. *Accelerate: The Science of Lean Software and DevOps*, 2018
- Machalica, Samylkin, Porth, Agarwal. "Predictive Test Selection", ICSE-SEIP 2019 (arXiv:1810.05286)
- Memon, Mao, Moran, Nadelman. "Taming Google-Scale Continuous Testing", ICSE-SEIP 2017
- GitLab Merge Trains documentation
- OPA/Conftest documentation
- Intercom Engineering Blog, 2025 (~93% agent-authored PRs, multi-agent review, SOC2/HIPAA)
- SLSA / in-toto supply chain provenance framework
- ADR-024 (GitLab Flow Branching and Release Strategy)
- ADR-056 (Dynamic Test Impact Analysis)
- ADR-061 (Developer-Agent Provenance)
- ADR-075 (Workload-Level Provenance for Autonomous Agent Commits)
- ADR-079 (Claude-drives-Codex Autonomous Handoff)
- VW-932 (CI queue regression — queued_duration diagnostic)
- VW-927 (WAN image re-pull anti-pattern)
- VW-931 (S3 cache revert)
- VW-935 (Dockerfile layer split)
- VW-440 (Jira incident hook)
- VW-678 (coverage floor enforcement)
