---
id: 56
title: "Dynamic Test Impact Analysis for CI (selective per-package testing)"
status: proposed
recordedStatus: "Proposed"
date: 2026-06-03
tags: ["ci", "test-impact-analysis", "pdg"]
sourceKind: source-record
public: true
journeyId: "2026-06-03-adr-056-dynamic-test-impact-analysis-for-ci-selective-per-package-testing"
---
# ADR-056: Dynamic Test Impact Analysis for CI (selective per-package testing)

## Status

**Proposed** — 2026-06-03

## Context

CI currently runs a fixed set of broad test jobs (`test:unit:rag-platform`, `test:unit:agents`, `test:unit:scripts`) on every MR regardless of which files changed. Two problems surfaced while unblocking the pipeline (VW-509 → VW-524):

1. **Wasted work + slow feedback.** An MR touching only `packages/rootweaver-radar/` still triggers the full agents/rag-platform suites; conversely radar has *no* dedicated CI test job at all. Selection is coarse and hand-maintained via per-job `-k`/`--ignore` lists.
2. **Coverage is measured against the wrong denominator.** `pytest.ini` injects a global `--cov=.` (whole repo, ~33.7k statements). Per-job `--cov=packages/&lt;pkg&gt;` is *additive*, not narrowing, so a per-package gate actually measured **whole-repo** coverage during a narrow test subset — diluting from 18%→17% purely as the platform grew (VW-524). The fix there (`-o addopts=` to scope coverage to one package) is the unit this ADR generalises.

We want CI to **dynamically select and run only the test subset relevant to the files an MR touches, and scope coverage to that subset** — bespoke, diff-driven testing.

We are well-positioned for this:
- **Clean boundaries** — the uv workspace gives `packages/&lt;pkg&gt;/` with per-package tests at `packages/&lt;pkg&gt;/tests/` (ADR-030 §4). "Which package did a file touch?" is a path lookup.
- **An impact engine already runs in CI** — `pdg:impact-analysis` emits `impact-report.json` (the Program Dependency Graph's transitive "what depends on X") every pipeline.
- **Per-package coverage scoping already exists** (VW-524).

## Decision

Adopt **dependency-graph-based Test Impact Analysis (TIA)** implemented with **GitLab parent–child dynamic pipelines**:

1. A **generator job** (early stage, e.g. `prepare`) runs `scripts/select_tests.py`, which:
   - reads the changed files for the MR (`git diff --name-only $CI_MERGE_REQUEST_DIFF_BASE_SHA...HEAD`);
   - maps them to **affected packages** and expands to **dependents** (reverse-deps);
   - emits a child pipeline YAML containing one **scoped** `test:unit:&lt;pkg&gt;` job per affected package.
2. A **trigger job** runs the child pipeline (`trigger: include: [artifact: child-tests.yml]`, `strategy: depend`).
3. Each generated job uses the **VW-524 scoping pattern**: `pytest -o addopts= packages/&lt;pkg&gt;/tests --cov=packages/&lt;pkg&gt;/src --cov-fail-under=&lt;pkg-threshold&gt;` — so coverage is a real *per-package* signal.

**Mapping is layered, built in order (each safe to ship independently):**

| Level | Source | "Touched X → run…" |
|---|---|---|
| **L1 path** | `git diff` → first path component | the touching package's own `tests/` |
| **L2 reverse-deps** | uv workspace `dependencies` graph | the package **+ everything that imports it** |
| **L3 PDG transitive** | existing `impact-report.json` / `find_module_dependents` | module-precise transitive impact |

Start at **L1+L2**; graduate to **L3** (the PDG is the exact reverse-dependency answer and is our differentiator).

**Non-negotiable safety rails** (see Research):
- **Always run a baseline** regardless of diff: the full lint gate (`validate`) + a fast smoke set + any newly-added or previously-failing tests.
- **Conservative fallback to the FULL suite** on ambiguous/shared changes: root files, `.gitlab-ci.yml`, `pyproject.toml`/`uv.lock`, shared `conftest.py`/fixtures, or a library package (`rootweaver-core`) whose reverse-dep closure is "most of the repo."
- **`main` always runs everything** — selection is an MR-time speed optimisation only.
- **Periodic full run** (nightly) to catch dependency-graph staleness.

## Consequences

**Positive**
- Faster, cheaper MR feedback proportional to change size; radar (and every package) gets first-class per-package testing.
- Coverage becomes a meaningful per-package gate instead of a whole-repo number that dilutes with growth (resolves the VW-524 class of problem structurally).
- Reuses existing assets (uv graph, PDG `impact-report.json`, VW-524 scoping) rather than new infrastructure.

**Negative / risks**
- **False negatives** are the core risk: an incorrect/stale dependency map skips a test that *should* run → green CI, latent bug. Mitigated by L3 PDG precision + always-full `main`/nightly + conservative fallback.
- Dependency-map maintenance (L2) — partly free from uv/pyproject; L3 shifts source-of-truth to the PDG.
- Added moving parts (generator + child pipeline) and ~one extra short job per MR.
- Non-code dependencies (resource files, fixtures) must be mapped explicitly or bucketed into "always run."

## Alternatives Considered

- **Status quo (fixed broad jobs).** Rejected: slow, coarse, and the coverage-denominator bug persists.
- **Static `rules: changes:` per-package jobs (no dynamic generation).** A reasonable stepping stone (and already used for `build:rag-gateway`), but the dependent mapping is hand-maintained in YAML and can't express transitive impact cleanly. Good as an L1 fallback; insufficient as the target.
- **Runtime coverage/trace-based TIA (Microsoft-style):** instrument tests to record which files each exercises. More precise for reflection/dynamic calls, but needs per-build instrumentation overhead and a maintained coverage map; heavier than our dependency-graph already provides.
- **ML predictive test selection (Meta-style):** learns a model from historical change→outcome data. Best-in-class results at scale, but requires a large labelled history and ML infra — overkill for a solo platform. Our PDG gives most of the benefit deterministically.
- **`pytest-testmon` / coverage-DB tools:** per-developer local DB, not designed for distributed CI; brittle across runners.

## Research — data-driven evidence ("what works")

- **Meta — Predictive Test Selection (ICSE 2019).** Runs **~1/3** of the tests that transitively depend on a change while still catching **>99.9%** of faulty changes and **>95%** of individual test failures before they hit trunk; **~2×** reduction in total testing infra cost. (ML model over historical change/outcome data.) — engineering.fb.com / arXiv:1810.05286
- **Google — TAP / Bazel affected-targets.** Dependency-graph selection at scale (a studied dataset: **500K commits, 5.5M targets, 4B target executions**); transition-based selection orders/skips affected targets. Reported **~60–70%** time savings from not running unaffected tests — but explicitly **"inconsistent"** depending on change patterns (small shared-lib edits fan out widely). — research.google "Taming Google-Scale Continuous Testing"; Fowler.
- **Martin Fowler — "The Rise of Test Impact Analysis."** Two approaches: **(a) dependency-graph/static** (Google Blaze, FB Buck) — precomputed, scales, needs maintained metadata; **(b) runtime coverage/trace** (Microsoft) — dynamic, captures reflection, needs execution overhead. Core safety assumption: *tests that passed before pass again if the code they exercise is unchanged* — which fails for **non-code inputs** (resource files) unless mapped. Microsoft's safety net: **run newly-added + previously-failing tests unconditionally**. Case study (HedgeServ, 12k integration tests): quickest run **~10 min** vs prior lengthy runs.
- **Industrial TIA (pertinent selection):** **~65%** execution-time/resource reduction while maintaining full coverage visibility on large systems.

**Takeaways that shaped the decision:** dependency-graph TIA is the proven, deterministic baseline (Google/FB); ML adds marginal gains only at huge scale (Meta) — not worth it here; the universal failure mode is **false negatives**, so an always-run baseline + conservative fallback + periodic full runs are mandatory, not optional; savings are real but **change-pattern-dependent** (don't promise a fixed %).

## Phased rollout (tracked in VW-525)

1. **Phase 1 — L1+L2 + plumbing.** `select_tests.py` (path → affected packages → uv reverse-deps) + parent/child pipeline + per-package scoped jobs + the safety rails (baseline, fallback, `main`=full).
2. **Phase 2 — L3 PDG.** Source affected set from `impact-report.json` for transitive precision; keep L2 as fallback when the PDG is unavailable.
3. **Phase 3 — tune & measure.** Track selection ratio + escaped-failure rate against the nightly full run; adjust conservatism.

## Evaluation — PDG readiness (2026-06-03, VW-525)

Live review of the `packages/pdg-generator/` codebase + `analyze_code_impact` against a real change (`rootweaver-agents/router.py`):

**Robust + correctly targeted (the hard part is done):**
- PDG is live and actively maintained: **8,915 nodes / 13,547 edges** (grew since VW-468's 8,804). `analyze_code_impact` works — returns `risk_score`, `affected_modules`, `affected_services`, `recommendations`.
- Granularity is function/method level: `NodeType` = MODULE/CLASS/FUNCTION/METHOD/VARIABLE/PACKAGE **+** SERVICE/PROCESS/CONFIG_MAP/SECRET/NETWORK_POLICY/HELM_RELEASE/KAFKA_TOPIC; `EdgeType` = IMPORTS/CALLS/INHERITS/USES/CONTAINS/DEPENDS_ON/DEPLOYS/STEP_IN/… So it resolves transitive code impact AND the **service layer** (the query correctly named `rag-gateway` for a router change) AND K8s/Kafka topology.
- VW-368 is **stale**: all 24 pdg-generator modules are committed, incl. `impact_analyzer.py`, `journey_tracer.py`, and `gitlab_integration/{mr_comment,risk_gate}.py` (already wired into the `pdg:*` CI jobs).

**The single gap for TIA — code→test linkage is absent:**
- `analyze_code_impact` returns `affected_tests: []` with "No test coverage detected." Root cause: `pdg_builder.py` **excludes tests by default** (`DEFAULT_EXCLUDE_DIRS` has `/tests/`; `DEFAULT_EXCLUDE_PATTERNS` has `test_*.py`; `include_tests=False`), so no test nodes exist; and the fallback `impact_analyzer._find_related_tests()` only matches **exact** `test_&lt;name&gt;.py`/`&lt;name&gt;_test.py`, missing `test_&lt;name&gt;_*.py` and per-package `tests/` layouts.
- `impact_analyzer` already reserves the `affected_tests` slot and the merge logic — it is starved of inputs, not missing the feature.

**Maps to the three test tiers:**
1. **Unit (per-package)** — needs the test-linkage layer (below). The only blocker.
2. **Integration / "report" tests** — same linkage; SERVICE nodes already resolve which service/report path a test exercises.
3. **E2E / platform (services & journeys)** — `affected_services` already works today; `journey_tracer` + PROCESS/STEP_IN give journey-level impact. Needs a service→e2e-suite map, but the *impact* side is solved.

**Verdict: green light.** The PDG is robust enough and targets the right granularity. The L3 prerequisite is a single **additive** work item — *the PDG test-linkage layer*: (a) ingest test files as nodes with IMPORTS edges to the modules they exercise (build a test-aware PDG, `include_tests=True`, ideally as a separate layer so the main graph stays test-free); (b) broaden `_find_related_tests` to `test_&lt;name&gt;*.py` + per-package dirs as a fallback. Then `affected_tests` populates precisely and drives unit/integration selection; service/journey impact already covers the e2e tier.

## References

- Related Jira: VW-525 (implementation), VW-524 (per-package coverage scoping — the reused unit), VW-509 (the unblock that surfaced the coverage-denominator issue)
- Related ADRs: ADR-030 (repo structure / per-package test layout that makes this possible)
- External: Meta Predictive Test Selection — https://engineering.fb.com/2018/11/21/developer-tools/predictive-test-selection/ , arXiv:1810.05286 ; Google "Taming Google-Scale Continuous Testing" — https://research.google.com/pubs/archive/45861.pdf ; Martin Fowler, "The Rise of Test Impact Analysis" — https://martinfowler.com/articles/rise-test-impact-analysis.html ; GitLab parent-child / dynamic child pipelines docs
