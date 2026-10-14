---
id: 30
title: "Repository Structure for AI-Assisted Development"
status: accepted
recordedStatus: "Accepted"
date: 2026-05-11
tags: ["repository-structure", "ai-assisted-development", "monorepo", "uv-workspaces", "agents-md"]
sourceKind: source-record
public: true
episode: "season-3-episode-10-the-great-restructure"
journeyId: "2026-05-11-adr-030-a-workspace-with-enforceable-package-boundaries"
---
# ADR-030: Repository Structure for AI-Assisted Development

## Status

**Accepted** — 2026-05-11

Implementation tracked via VW-334 through VW-339 (see migration plan *(internal reference; not included)*).

## Context

The Rootweaver platform repository (`REDACTED_HOME/2tb/rootweaver-platform/`) has accumulated structural debt that costs measurable time per AI-assisted development session. Three concrete incidents on 2026-05-10 motivated this ADR:

1. **VW-330 audit false-negative.** A grep for `from scripts.tools.chromadb_embeddings_v2` returned zero importers; actual code uses `from chromadb_embeddings_v2` (bare-name import + `sys.path` manipulation). 16 caller sites missed; near-deletion of production-load-bearing `agents/base_agent.py`.

2. **`agents/` vs `rag_platform/agents/` split-brain.** Top-level `agents/` is migration debt referenced by `rag_platform/api/system_endpoints.py` via `from agents.router import AgentRouter`. `router.py` itself uses `from base_agent import SearchResult` (bare import, expects cwd-as-`agents/`). Production runs because pod `PYTHONPATH` is set; local dev requires the same trick.

3. **VW-274 audit predicted ~50 dead files in `scripts/`, found 68.** No "here is where new things go" convention let `scripts/` accumulate three near-distinct generations of code (pre-rename `leveling-life` paths, post-rename cosmetic-only, post-VW-189 stranded ChromaDB). An agent reading `scripts/` cannot tell which generation a file belongs to without `git log`.

These were the surface incidents. The structural state today:

- **5 Python trees** with unclear boundaries: `rag_platform/`, top-level `agents/`, `neural-vault/`, `scripts/`, `eng-intel-platform/`, plus auxiliary `sre-common/`, `sre-event-collector/`, `sre-brain/`, `core/`
- **4 separate `pyproject.toml` files** with no workspace coordination
- **3 test homes**: `tests/`, `rag_platform/tests/`, co-located `rag_platform/test_*.py`
- **Bare-name imports still live**: `rag_platform/agents/test_routing_improvements.py:20: from router import AgentRouter`
- **CLAUDE.md scatter**: `./CLAUDE.md`, `./neural-vault/CLAUDE.md`, plus stale copies in worktrees
- **ADR numbering drift**: `ADR-027` and `ADR-028` each appear twice in the vault with different 2026 dates
- **Vault `09-System/Architecture/`** has accumulated 657 files (82% of `09-System/`), of which only ~46 are genuinely canonical — the rest are activity logs (Implementation Reports, Plans, Reviews, Benchmarks runs) cohabiting with HLDs/LLDs/ADRs
- **~30 root-level orphans**: scratch `.md` files, JSON benchmark dumps, backup directories, `github-recovery-codes.md` (credential leak risk)

### Why this matters now

Industry analysis ([Mews Developers](https://developers.mews.com/navigation-is-the-real-cost-of-ai-coding-agents/)) measured **87% of AI-coding-agent tokens go to finding code, not writing it**, with unguided search scaling **worse-than-linearly** with repo size. At Claude Code session rates of 50,000–200,000 tokens/hour ([amux.io 2026](https://amux.io/guides/ai-coding-agent-costs/)), navigation cost on this repo runs estimated $435–1740/month in API spend before any productive work.

Two head-to-head 2026 empirical studies on AGENTS.md context files reached complementary conclusions: Princeton ([arxiv 2601.20404](https://arxiv.org/abs/2601.20404)) measured **28.64% runtime reduction** when human-written AGENTS.md present; ETH Zurich ([arxiv 2602.11988](https://hf.co/papers/2602.11988)) measured **3% accuracy loss + 20% cost increase** when AGENTS.md is auto-generated or contains content the agent could infer. The combined finding: sharp human-written context engineering helps; bloated or auto-generated context engineering hurts.

The decision criteria for this ADR are different from a typical human-written codebase:

- **Predictability over flexibility** — an agent picking "where does new code go" should have one obvious answer
- **Qualified imports only** — no bare-name imports requiring `sys.path` tricks
- **Co-located tests vs centralized tests** — pick one rule per test type, apply it everywhere
- **AGENTS.md per top-level dir** — short, explains "what lives here, what doesn't, what to do if you're not sure"
- **Operator-scripts vs library-code** — clear visual separation
- **One-shot historical migrations** — date-prefixed, time-boxed, deleted on merge
- **Monorepo decision** — single installable package or multiple? Current state is "ambiguous", which is the worst answer.

## Decision

Adopt a **uv-workspaces-based modular monolith** with seven concrete rules:

### 1. Architecture — `packages/` + `services/` + `tests/` + `docs/` at root

```
rootweaver-platform/
├── pyproject.toml                   ← workspace root
├── uv.lock                          ← single shared lockfile
├── README.md AGENTS.md CLAUDE.md
├── packages/                        ← ALL Python code lives here
│   ├── rootweaver-core/             ← shared library
│   ├── rootweaver-agents/           ← agents (resolves agents/ vs rag_platform/agents/ split)
│   ├── rag-gateway/                 ← deployable service
│   ├── rag-retriever/
│   ├── mcp-bridge/
│   ├── dlq-processor/
│   ├── neural-vault/
│   ├── eng-intel-platform/
│   ├── sre-common/ sre-event-collector/ sre-brain/
│   └── operator-tools/              ← was scripts/
├── services/                        ← Dockerfiles + entrypoints
├── rootweaver-console/              ← React/TS frontend modular monolith (VW-725).
│                                      NOT a Python package: packages/ stays Python-only.
│                                      Built by services/rootweaver-console/Dockerfile.
├── tests/                           ← cross-cutting only
│   ├── integration/ e2e/ benchmarks/ smoke/
├── docs/                            ← symlinks to vault per plan-archival.md
├── deploy/
└── obsidian-vault/                  ← gitignored, unchanged
```

Each `packages/&lt;pkg&gt;/` has its own `pyproject.toml`, `src/&lt;pkg_module&gt;/`, `tests/`, `AGENTS.md`. Three guiding rules:

1. **Library packages don't import service packages.** `rootweaver_core` and `rootweaver_agents` are imported by services; never the reverse.
2. **Service packages don't import sibling service packages.** `rag_gateway` does not import `rag_retriever`; cross-service communication is via API/queues only.
3. **Every Python file lives under `packages/&lt;pkg&gt;/src/&lt;pkg_module&gt;/`.** No bare-name imports possible — `sys.path` only contains installed package roots.

Backed by: LangChain `libs/` pattern, LlamaIndex monorepo overhaul ([blog](https://www.llamaindex.ai/blog/python-tooling-at-scale-llamaindex-s-monorepo-overhaul)), Apache Airflow uv workspaces at 1M+ LOC, MDPI Modular Monolith SLR ([Vol 17, Nov 2025](https://www.mdpi.com/1999-5903/17/11/496)).

### 2. AGENTS.md as canonical context layer; CLAUDE.md as Claude-specific overlay

AGENTS.md is the [Linux Foundation open standard](https://agents.md/) (60K+ adopting repos as of Dec 2025). Hierarchical loading: agents read the *nearest* AGENTS.md; per-package overrides parent rules.

**Per-package AGENTS.md template (4 sections, max 80 lines):**

```markdown
## What lives here          (~5 lines)
## What to do if you're not sure   (~15-25 lines, includes MCP tool routing)
## Tests                    (~5-10 lines, package-specific test commands)
## Gotchas                  (~5-15 lines, sharp non-inferable edges only)
```

**80-line cap is enforced by `scripts/lint_agents_md.py`** (pre-commit + CI). Per ETH Zurich measurement: AGENTS.md that's too long or auto-generated is *worse than no AGENTS.md*. Per Princeton measurement: short human-written AGENTS.md gives ~28% runtime reduction.

**AGENTS.md is the routing layer over MCP tools (PDG, RAG, vault search) — never the restatement layer.** Anything PDG's `analyze_code_impact` / `find_module_dependents` / `search_modules` returns belongs in the tool, not in AGENTS.md. Backed by ToolTrain ([arxiv 2508.03012](https://hf.co/papers/2508.03012)) and ETH Zurich's "non-inferable details only" rule.

CLAUDE.md sits *alongside* AGENTS.md (not nested) and contains only Claude Code-specific information: hooks, `.claude/rules/` references, vault staging protocol, skills. Audience-not-topic split: portable info → AGENTS.md, Claude-only → CLAUDE.md.

### 3. Import policy — fully qualified, no cross-service, cycle-free

Four rules, enforced by `import-linter`:

1. All Python lives under `packages/&lt;pkg&gt;/src/&lt;pkg_module&gt;/`. No exceptions.
2. All imports fully qualified. ✗ `from base_agent import X` ✓ `from rootweaver_core.agents.base import X`
3. Library packages never import service packages.
4. Service packages never import sibling service packages.

**Plus**: a `layered` contract for explicit cycle detection. Cyclic dependencies have direct empirical evidence of increased defect rates ([Information & Software Technology 2013, multi-system study](https://www.sciencedirect.com/science/article/abs/pii/S0164121213001878)). MDPI MMA SLR explicitly recommends "cycle detectors in CI/CD pipelines."

Pre-commit + CI enforcement. Architectural fitness function pattern (Neal Ford / Parsons / Kua).

### 4. Test policy — hybrid co-located + centralized

Six rules:

1. Unit + contract tests in `packages/&lt;pkg&gt;/tests/`
2. Integration, e2e, benchmarks, smoke in root `tests/`
3. **NEVER add `__init__.py` inside any tests/ directory** (silent pytest cache collision; documented in pytest + O'Reilly book)
4. Test files in `packages/&lt;pkg&gt;/tests/` MUST be prefixed with package name (avoids PYTHONPATH collisions across packages)
5. Per-package isolation: `uv run --package &lt;pkg&gt; pytest packages/&lt;pkg&gt;/tests/` MUST work standalone
6. Cross-cutting tests run from root: `uv run pytest tests/integration/`

**Plus**: explicit recommendation for AI agent code (rag-gateway, rootweaver-agents, mcp-bridge) to test the "Trigger component" — empirically measured as the systematic blind spot in AI agent framework testing ([arxiv 2509.19185, Sept 2025](https://hf.co/papers/2509.19185)).

Backed by Apache Airflow `provider_tests` namespace, LlamaIndex per-package test layout, LlamaIndex monorepo post-mortem.

### 5. Top-level hygiene — strict allowlist + pre-commit lint

Repo root contains only allowlisted entries (`scripts/lint_root.py` enforces). Allowlist:

```
pyproject.toml uv.lock README.md AGENTS.md CLAUDE.md LICENSE
.gitignore .gitattributes .editorconfig .pre-commit-config.yaml
.gitlab-ci.yml .python-version
packages/ services/ tests/ docs/ deploy/ scripts/
rootweaver-console/ arch-viz-frontend/ blog-astro/ code-graph-frontend/ convocanvas-landing/
obsidian-vault/
.claude/ .gemini/ .gitlab/ .worktrees/ .git/
```

Anything else at root fails pre-commit. New entries require deliberate allowlist update + commit-message justification + line in root AGENTS.md documenting why it's at root.

Frontend trees (`arch-viz-frontend/` etc.) stay at root per Nx `apps/+packages/+tools/` convention. Future ADR may move them under `frontends/`.

Backed by Bazel + Buck globally-enforced layout, Trunk Based Development monorepo guide, cognitive-load theory ([Paas & van Merriënboer 2020, SAGE](https://journals.sagepub.com/doi/10.1177/0963721420922183)) — repo-root cruft is textbook extraneous load.

### 6. ADR & Doc structure — numbering authority, no date prefix, mutability-based vault layout

**ADR rules:**
- `obsidian-vault/09-System/Architecture/ADRs/ADR-Index.md` is the canonical registry
- ADR filenames: `ADR-NNN-Slug.md` (no date prefix — date prefix caused the ADR-027/028 dual-allocation drift)
- Number allocation by `scripts/allocate_adr.py` only; no manual picking
- Pre-commit lint catches duplicate numbers, missing index rows, missing required frontmatter
- Lifecycle states: Proposed → Accepted → Deprecated/Superseded

**Doc placement (canonical homes):**
- *Thinking* artifacts (ADRs, HLDs, LLDs, plans, runbooks) → vault canonical, repo symlinks per `~/.claude/rules/workflow/plan-archival.md`
- *Operational* artifacts (READMEs, API contracts, AGENTS.md, CLAUDE.md) → repo canonical
- Confluence is one-way publishing target only; vault is source of truth

**Vault internal layout — mutability-based split (extends Section 5):**

| Mutability | Folder | What lives there |
|---|---|---|
| Canonical, slow-changing | `09-System/` | ADRs, HLDs, LLDs, runbooks, infrastructure reference |
| In-progress, fast-changing | `02-Active-Work/` | Plans (status: in-progress), current implementation reports, active reviews, latest benchmarks |
| Historical, completed | `06-Archive/` | Completed plans, old implementation reports, superseded ADRs, old benchmark runs |

Maps directly onto PARA (Forte, *Building a Second Brain*): Projects=`02-Active-Work/`, Areas=`09-System/`+`05-Personal/`, Resources=`04-Resources/`, Archives=`06-Archive/`. Folder numbering follows Johnny Decimal precedent. Cognitive-load theory anchor (Paas & van Merriënboer 2020, SAGE) — extraneous load reduction.

**Vault folder structure (post-Stage-1 restructure):**

```
obsidian-vault/
├── 01-Journal/            ← daily/session journal + Session-Reports + Status-Reports
├── 02-Active-Work/        ← PARA Projects (in-progress)
├── 03-AI-Conversations/   ← AI session transcripts
├── 04-Resources/          ← PARA Resources (consolidates 04-Knowledge-Systems + 05-Ideas-and-Automation)
├── 05-Personal/           ← PARA Areas (personal) — renamed from 04-Personal
├── 06-Archive/            ← PARA Archives (historical) + archived content from disused folders
├── 09-System/             ← canonical platform knowledge (slimmed)
├── 10-Blog/               ← publishing pipeline (Express in C.O.D.E.)
├── 99-Meta/               ← vault-about-the-vault
├── REDACTED_EMPLOYER/               ← employer (off-limits per feedback memory)
├── Excalidraw/            ← diagrams
├── Private/               ← sensitive personal
└── ryans-obsidian/        ← imported separate vault (deferred VW-D)
```

Resolves three Johnny Decimal violations (00-, 01-, 04- previously had duplicate prefixes) AND drops three folders that current workflow no longer uses (`00-Capture`, `01-Inbox`, `00-Quick-Reference` — content archived to `06-Archive/`). Current workflow goes straight from idea to canonical destination (System / Journal / Personal / Active-Work) without the PARA capture/inbox middle layer.

Free namespace post-restructure: 00, 07, 08, 11-98. Room for future folders if a genuinely new use-case emerges.

**Per-folder canonical purpose:**

| Folder | PARA / CODE role | What lives here | What does NOT live here |
|---|---|---|---|
| `01-Journal/` | Journal | Daily/weekly reflection logs, Session-Reports, Status-Reports. Date-prefixed time-series | Project state, system docs, plans |
| `02-Active-Work/` | PARA Projects | In-progress plans, current implementation reports, active project subfolders, active reviews, latest benchmarks | Completed work (→ 06-Archive), canonical system knowledge (→ 09-System) |
| `03-AI-Conversations/` | Specialized capture (automation-write target) | Tool-generated AI transcripts and summaries. Targeted by: `.claude/hooks/user_prompt_submit.py` (Claude Code session-summary hook), `neural-vault/restic_backup.py`/`rclone_backup.py` (backup), `neural-vault/file_router.py` (auto-classifier), `ai_services_exporter.py` (Prometheus). **Not a human-edit destination.** Most recent write 2026-03-25; hook currently broken on macOS due to obsolete Linux paths — fixing this is part of Stage 1 sub-task 1 code-reference audit. | Hand-written notes about AI sessions |
| `04-Resources/` | PARA Resources | Technical learning collection: AI-Infrastructure, Architecture-Patterns, Model-Guides, CI-CD, Learning-Resources, AI-Research, automation concepts. Also quick-reference checklists/howtos (formerly 00-Quick-Reference) | Active project work, canonical system docs, personal topics |
| `05-Personal/` | PARA Areas (personal) | Career, Finance, Property, personal life | Anything work/technical-related |
| `06-Archive/` | PARA Archives | Completed plans, old implementation reports, superseded ADRs, historical benchmarks, archived disused folders; date-organized by quarter/year | Anything still active or canonical |
| `09-System/` | PARA Areas (canonical system) | ADRs, HLDs, LLDs, runbooks, infrastructure reference, ecosystem evolution | Activity logs (→ 01-Journal), plans-in-progress (→ 02-Active-Work) |
| `10-Blog/` | E in C.O.D.E. (express) | Blog drafts, published episodes, LinkedIn posts, newsletter, podcast scripts, templates | Internal docs, system reference |
| `99-Meta/` | Vault-about-the-vault (vestigial; automation-referenced) | Templates, automation guides, vault setup/maintenance. Referenced by: `core/config.py` (`meta_dir`), `neural-vault/parent_retriever.py` (`99-Meta/CLAUDE.md`), `neural-vault/file_router.py`, `experiments/universal_architecture_generator.py`. `rag_platform/tests/test_models.py` explicitly EXCLUDES this folder from search. **Mostly stale** (last write 2025-10-07, 7+ months ago); HLDs/LLDs were moved out to `09-System/Architecture/` previously. Kept for code references; not a human-edit destination. | New content that should live elsewhere |

**Note on the "missing" Capture/Inbox/Quick-Reference layer:** Forte's PARA + C.O.D.E. assumes a capture-then-triage workflow. The vault owner's current workflow skips this — items go directly from idea to canonical destination (Journal for "what happened", System for "how it works", Personal for life topics, Active-Work for current projects). The empty middle layer was vestigial. If the workflow ever changes back to needing a triage step, `00-Inbox/` can be recreated; the 00 prefix is reserved.

**Stage 1 vault restructure operations** (executed in VW-334 before any rule files reference new names):

**Principle**: no deletions. Every folder being retired is moved wholesale (with content + subfolder structure intact) to `06-Archive/` with a `-archived-2026-05-11` date suffix. This preserves data, preserves the original categorization, and gives future-you a single place to re-review and reclassify if needed (deferred ticket VW-E).

| # | Operation | From | To | Files |
|---|---|---|---|---|
| 1 | Move folder | `00-Capture/` | `06-Archive/00-Capture-archived-2026-05-11/` | 13 |
| 2 | Move folder | `01-Inbox/` | `06-Archive/01-Inbox-archived-2026-05-11/` | 57 |
| 3 | Move folder | `00-Quick-Reference/` | `06-Archive/00-Quick-Reference-archived-2026-05-11/` | 12 |
| 4 | Rename | `04-Personal/` | `05-Personal/` | 18 |
| 5 | Rename | `04-Knowledge-Systems/` | `04-Resources/` | 549 |
| 6 | Move as subfolder | `05-Ideas-and-Automation/` | `04-Resources/Ideas-and-Automation/` (after op 5) | 20 |
| 7 | Move subfolder | `09-System/Session-Reports/` | `01-Journal/Session-Reports/` | 9 |
| 8 | Move subfolder | `09-System/Status-Reports/` | `01-Journal/Status-Reports/` | 4 |

After all 8 ops: ~702 files moved (82 to archive folders, 587 to renames/subfolder moves, 13 to journal). Only ordering constraint is op 6 requires op 5 (so `04-Resources/` exists as a destination). No deletions. All structure recoverable via single `git revert` at vault level.

Frontmatter `vault-path:` references updated by `scripts/migrate_vault_frontmatter.py`. Internal vault wikilinks updated by `scripts/migrate_vault_links.py` (sed-based, idempotent, reversible via git).

**Deferred — VW-E (review + reclassify archived content)**: after Stage 1 settles, scan `06-Archive/00-Capture-archived-2026-05-11/`, `01-Inbox-archived-2026-05-11/`, `00-Quick-Reference-archived-2026-05-11/`, and `04-Resources/Ideas-and-Automation/` for items still worth promoting to active folders. No deadline; casual review task.

`~/.claude/CLAUDE.md` + `~/.claude/rules/workflow/{plan-archival,benchmark,confluence-documentation}.md` + `.claude/rules/project-context/neural-vault.md` updated to route by mutability AND to reference the new folder names. New file `~/.claude/rules/workflow/vault-destination-map.md` codifies the mapping with the per-folder table above.

`neural-vault/vault_indexer.py` `should_exclude_path()` exclusion list updated to reference renamed folders (where applicable) — `06-Archive`, `REDACTED_EMPLOYER`, `Private`, `Excalidraw`, `Credentials` patterns unchanged since those folder names are unchanged.

### 7. Migration — always-deployable, 6 stages

Each stage = one VW ticket, mergeable + deployable in isolation. `main` never breaks between stages. Backward-compat shims used in Stage 3 to maintain dual-pathing during library moves; removed in Stage 6.

| Stage | VW | Effort | Risk |
|---|---|---|---|
| 1 — Foundation | VW-334 | 1 day | None (additive only) |
| 2 — Hygiene + ADRs | VW-335 | 1 day | None (file moves) |
| 3 — Library packages | VW-336 | 2 days | Low (shims) |
| 4 — Service packages | VW-337 | 3-4 days | Per-service rollback |
| 5 — Auxiliary packages | VW-338 | 2 days | Low |
| 6 — Cleanup + finalization | VW-339 | 1 day | Removes shims |

Total: ~10-11 days effort, ~6-8 weeks elapsed at typical pace alongside live work. Detailed staging in migration plan *(internal reference; not included)*.

## Consequences

### Positive

- **VW-330-class audit false-negatives become impossible by construction.** Bare-name imports cannot exist; `import-linter` enforces.
- **`agents/` vs `rag_platform/agents/` split-brain resolved.** Both fold into `packages/rootweaver-agents/` with shims for transition.
- **AI agent navigation cost reduced.** Per industry analysis: 87% navigation overhead at baseline; per Princeton measurement: ~28.64% runtime reduction with sharp AGENTS.md. Estimated savings: $130–500/month in Claude Code API spend.
- **Cyclic-dependency defect risk eliminated by lint.** Per multi-system empirical study: cycles → measurably more defects.
- **Test layout becomes pytest-collision-safe.** No `__init__.py` in tests/ + name-prefix rule prevents the silent same-name cache bug.
- **ADR numbering drift cannot recur.** Date-prefix removal + script-only allocation prevents parallel allocation.
- **Vault `09-System/Architecture/` stops growing as a black hole.** Going-forward rules route activity logs to `02-Active-Work/`; old material auto-archives to `06-Archive/` (deferred ticket VW-A).
- **Per-service Docker rebuilds become deterministic.** uv export per package gives lean per-service images; no full-platform rebuild on per-service change.
- **Documentation stays close to code where it should** (READMEs, API contracts, AGENTS.md) and close to thinking where it should (ADRs, HLDs, LLDs in vault).

### Negative

- **Migration consumes ~10-11 days of effort spread over ~6-8 weeks elapsed.** Every line of code touched is verified, but it's real time.
- **Backward-compat shims in Stage 3 add ~5 lines per old import path** during transition. Removed in Stage 6.
- **Per-service Dockerfile becomes more complex** (multi-stage uv export pattern). Documented; standardized across all 4 services.
- **uv workspaces still has rough edges in Docker caching** (per uv community posts). Multi-stage build pattern works but requires care.
- **CLAUDE.md + rule file changes require all in-flight Claude Code work to refresh memory.** One-time inconvenience.
- **Pre-commit + CI become stricter.** New lints can block commits; team needs to learn the rules. Mitigated by clear lint error messages pointing to the relevant ADR section.

### Neutral / explicit non-goals

- Does not touch frontend trees (`arch-viz-frontend/`, `blog-astro/`, etc.) — out of scope per VW-333; deferred to VW-C
- Does not migrate `obsidian-vault/` content — only its destination rules; mass rebalance deferred to VW-A
- Does not touch GitOps repo (`rootweaver-gitops`) — separate repo, separate ADR if needed
- Does not change MCP tool surface — `analyze_code_impact`, `find_module_dependents`, etc. unchanged

## Alternatives Considered

### Option A — Single src/rootweaver/ package (Anthropic SDK style)
One pyproject.toml, all code under `src/rootweaver/{api,agents,bridges,...}`. Each Docker image installs the same package, runs a different entrypoint.
- **Rejected because**: couples ship cycles — every change rebuilds every image. Doesn't match the multi-service deployable reality (5 Dockerfiles already exist). Anthropic SDK is single-package because they ship one PyPI artifact; we ship 5 Docker images.

### Option B — Status quo + src/ inside each existing tree
Keep 4 pyprojects, just enforce src/ layout inside each + add AGENTS.md per tree.
- **Rejected because**: doesn't fix the agents/ vs rag_platform/agents/ split-brain. Doesn't fix cross-service imports. Doesn't address the "no obvious place for new code" problem. Half-fix per LlamaIndex monorepo overhaul post-mortem.

### Option C — Two-tier: src/rootweaver/ + services/{...}/
Library code in single src/ package; thin deployable wrappers under services/ each with own pyproject.
- **Rejected because**: ambiguity about what's library vs service. Doesn't give the per-package isolation that uv workspaces enables. Compromise that gets the worst of both.

### Option D — Big-bang migration (LlamaIndex v0.10 style)
One coordinated weekend rewrite, accept 2-3 days broken-prod risk.
- **Rejected because**: viable only because LlamaIndex had no internal users. We do (the platform). Per-stage always-deployable migration is materially safer with negligible additional effort.

### Option E — Feature-flagged dual-state
Build packages/ alongside today's tree, validate in parallel, atomic cutover.
- **Rejected because**: 30-50% temporary code duplication. Useful when revenue-impact rollback fear is high; overkill for this case.

### Option F — AGENTS.md only (retire CLAUDE.md)
Pure standards-track approach.
- **Rejected because**: loses the Claude-only override channel for hooks, vault staging protocol, skills. Audience-not-topic split (AGENTS.md portable + CLAUDE.md Claude-specific) is cleaner.

### Option G — Both AGENTS.md and CLAUDE.md per directory, kept in sync
Maximum coverage.
- **Rejected because**: invites drift. SWE-Skills-Bench evidence ([arxiv 2603.15401](https://hf.co/papers/2603.15401)) suggests duplicated/overloaded instructions don't help and may hurt.

### Option H — Pure co-located tests (Airflow style)
Everything in `packages/&lt;pkg&gt;/tests/`, including integration.
- **Rejected because**: integration tests genuinely span multiple packages. Hybrid (unit co-located, integration centralized) reflects the real testing pyramid better; matches your existing `tests/integration/` reality.

## AI-Navigation Contract

What conventions agents may rely on, what they should never assume:

**May rely on:**
- All Python code lives under `packages/&lt;pkg&gt;/src/&lt;pkg_module&gt;/`
- All imports are fully qualified
- The nearest AGENTS.md is the canonical context source
- `import-linter` rules are enforced by CI; if code is in main, it passes the rules
- ADRs live at `obsidian-vault/09-System/Architecture/ADRs/ADR-NNN-Slug.md` with that exact filename pattern
- Vault structure follows mutability split (canonical → 09-System, in-progress → 02-Active-Work, historical → 06-Archive)
- MCP tools (PDG, RAG, vault search) are the deep-knowledge layer; AGENTS.md routes to them rather than restating their content
- Per-package tests are runnable in isolation: `uv run --package &lt;pkg&gt; pytest packages/&lt;pkg&gt;/tests/`

**Should never assume:**
- That dependency lists in AGENTS.md are current — call `mcp__ai-memory__find_module_dependents` for fresh data
- That a file at the root of the repo is "important" — root is allowlisted, only specific entries appear
- That `tests/` at root contains unit tests — it contains only cross-cutting integration/e2e/benchmarks/smoke
- That all packages have the same shape internally — only the workspace boundaries are contract; internal structure is the package author's call
- That `scripts/` at root contains operator scripts — those moved to `packages/operator-tools/`. Root `scripts/` contains only the lint scripts that pre-commit hooks call

## References

### Related VW issues
- VW-333 — this ADR's parent ticket
- VW-334 through VW-339 — implementation stages
- VW-274 — scripts/ audit that surfaced structural debt
- VW-330 — qualified-vs-bare import trap (motivating incident)
- VW-331 — 33% of scripts/ was dead, structure didn't help anyone notice for months
- VW-332 — script migration (subsumed by VW-338)
- VW-A through VW-E — deferred followup tickets (VW-E added for archived-content review + reclassification per Stage 1 ops 1-3 + 6)

### Related ADRs
- ADR-016 — Modular HLD/LLD documentation (precedent for modular ADRs)
- ADR-024 — GitLab Flow branching strategy (interacts with always-deployable migration)

### Academic — repository-level coding agents
- [How to Understand Whole Software Repository? (RepoUnderstander) — arxiv 2406.01422](https://hf.co/papers/2406.01422)
- [SWE-Adept — arxiv 2603.01327](https://hf.co/papers/2603.01327)
- [CodeScout: RL for Code Search Agents — arxiv 2603.17829](https://hf.co/papers/2603.17829)
- [OrcaLoca: LLM Agent Framework for Software Issue Localization — arxiv 2502.00350](https://hf.co/papers/2502.00350)
- [Tool-integrated RL for Repo Deep Search — arxiv 2508.03012](https://hf.co/papers/2508.03012)
- [RPG: A Repository Planning Graph — arxiv 2509.16198](https://hf.co/papers/2509.16198)
- [DependEval: Benchmarking LLMs for Repository Dependency Understanding — arxiv 2503.06689](https://hf.co/papers/2503.06689)
- [SWE-Skills-Bench — arxiv 2603.15401](https://hf.co/papers/2603.15401)
- [Inside the Scaffold: Source-Code Taxonomy of Coding Agent Architectures — arxiv 2604.03515](https://hf.co/papers/2604.03515)
- [CodeNav: Beyond tool-use to using real-world codebases — arxiv 2406.12276](https://hf.co/papers/2406.12276)
- [Beyond pip install: Evaluating LLM Agents for Automated Installation — arxiv 2412.06294](https://hf.co/papers/2412.06294)
- [APEX-SWE — arxiv 2601.08806](https://hf.co/papers/2601.08806)
- [LIDL: LLM Integration Defect Localization — arxiv 2601.05539](https://hf.co/papers/2601.05539)

### Academic — AGENTS.md and context engineering
- [On the Impact of AGENTS.md Files on Efficiency — arxiv 2601.20404 (Princeton, Jan 2026)](https://arxiv.org/abs/2601.20404) — measured 28.64% runtime reduction
- [Evaluating AGENTS.md: Are Repository-Level Context Files Helpful? — arxiv 2602.11988 (ETH Zurich, Feb 2026)](https://hf.co/papers/2602.11988) — measured 3% accuracy loss + 20% cost increase from auto-generated/bloated AGENTS.md
- [Agent READMEs: An Empirical Study of Context Files for Agentic Coding — arxiv 2511.12884 (Nov 2025)](https://hf.co/papers/2511.12884)
- [AGENTIF: Benchmarking Instruction Following in Agentic Scenarios — arxiv 2505.16944](https://hf.co/papers/2505.16944)
- [CL4SE: Context Learning Benchmark For SE Tasks — arxiv 2602.23047](https://hf.co/papers/2602.23047)
- [Context Engineering for AI Agents in OSS — arxiv 2510.21413](https://arxiv.org/html/2510.21413v1)
- [Reasoning Shift: How Context Silently Shortens LLM Reasoning — arxiv 2604.01161](https://hf.co/papers/2604.01161)

### Academic — monorepos, modular monolith, dependencies
- [Why Google Stores Billions of Lines of Code in a Single Repository — Potvin & Levenberg, CACM 2016](https://research.google/pubs/why-google-stores-billions-of-lines-of-code-in-a-single-repository/)
- [Advantages and Disadvantages of a Monolithic Repository: Case Study at Google — Jaspan et al., ICSE-SEIP 2018](https://www.researchgate.net/publication/325730963_Advantages_and_disadvantages_of_a_monolithic_repository_a_case_study_at_google) — Distinguished Paper Award; 60% engineer preference, reduced cognitive load measured
- [Evaluating Development Velocity: Systematic Comparison of Monorepo and Polyrepo — IJISRT 2025](https://www.ijisrt.com/evaluating-development-velocity-a-systematic-comparison-of-monorepo-and-polyrepo-architectures) — 14.3 min/update faster
- [Modular Monolith Architecture in Cloud Environments: SLR — MDPI Future Internet, Vol 17 (Nov 2025)](https://www.mdpi.com/1999-5903/17/11/496)
- [Modular Monolith: Is This the Trend? — arxiv 2401.11867](https://arxiv.org/pdf/2401.11867)
- [A study of cyclic dependencies on defect profile of software components — Information and Software Technology, ScienceDirect 2013](https://www.sciencedirect.com/science/article/abs/pii/S0164121213001878)
- [Circular Dependencies and Change-Proneness: An Empirical Study — ResearchGate 2015](https://www.researchgate.net/publication/273757421_Circular_Dependencies_and_Change-Proneness_An_Empirical_Study)

### Academic — testing
- [An Empirical Study of Testing Practices in Open Source AI Agent Frameworks — arxiv 2509.19185 (Sept 2025)](https://hf.co/papers/2509.19185) — Trigger component as systematic gap
- [TAM-Eval: Evaluating LLMs for Automated Unit Test Maintenance — arxiv 2601.18241 (Jan 2026)](https://hf.co/papers/2601.18241)
- [REACCEPT: Co-evolution of Production and Test Code — arxiv 2411.11033 (Nov 2024)](https://hf.co/papers/2411.11033)

### Academic — cognitive load and PKM
- [Measuring the cognitive load of software developers: SLR — Information and Software Technology, ScienceDirect 2021](https://www.sciencedirect.com/science/article/abs/pii/S095058492100046X)
- [Cognitive-Load Theory: Methods to Manage Working Memory Load — Paas & van Merriënboer, SAGE 2020](https://journals.sagepub.com/doi/10.1177/0963721420922183)
- [Cognitive Architecture and Instructional Design: 20 Years Later — Sweller, Springer 2019](https://link.springer.com/article/10.1007/s10648-019-09465-5)
- [Onboarding vs Diversity, Productivity and Quality — ICSE 2021 OpenStack study](https://2021.icse-conferences.org/details/icse-2021-papers/119/Onboarding-vs-Diversity-Productivity-and-Quality-Empirical-Study-of-the-OpenStac)
- [NoteBar: AI-Assisted Note-Taking for PKM — arxiv 2509.03610](https://hf.co/papers/2509.03610)

### Industry — production monorepos and tooling
- [Anthropic Python SDK (src/anthropic/) — GitHub](https://github.com/anthropics/anthropic-sdk-python)
- [OpenAI Python SDK (src/openai/) — GitHub](https://github.com/openai/openai-python)
- [LangChain libs/ monorepo — GitHub](https://github.com/langchain-ai/langchain)
- [LlamaIndex monorepo overhaul — official blog](https://www.llamaindex.ai/blog/python-tooling-at-scale-llamaindex-s-monorepo-overhaul)
- [Apache Airflow uv workspaces, 1M+ LOC — Jarek Potiuk Medium](https://medium.com/apache-airflow/modern-python-monorepo-for-apache-airflow-part-1-1fe84863e1e1)
- [uv workspaces documentation — Astral](https://docs.astral.sh/uv/concepts/projects/workspaces/)

### Industry — AGENTS.md, navigation cost, and PKM
- [AGENTS.md open standard — Linux Foundation Agentic AI Foundation](https://agents.md/)
- [Navigation is the Cost of AI Coding Agents — Mews Developers](https://developers.mews.com/navigation-is-the-real-cost-of-ai-coding-agents/) — 87% of tokens spent on navigation
- [The Real Cost of AI Coding in 2026 — Morph](https://www.morphllm.com/ai-coding-costs)
- [How to Build Your AGENTS.md (2026) — Augment Code](https://www.augmentcode.com/guides/how-to-build-agents-md)
- [The PARA Method — Tiago Forte / Forte Labs](https://fortelabs.com/blog/para/) — actionability-based folder organization
- [Introduction to the Zettelkasten Method — zettelkasten.de](https://zettelkasten.de/introduction/) — Luhmann's 600 publications from 90K notes precedent

### Industry — tooling and patterns
- [import-linter — Seddonym](https://github.com/seddonym/import-linter) — architectural fitness function for Python
- [Architecture Fitness Function pattern — Neal Ford / Parsons / Kua, Building Evolutionary Architectures](https://aipatternbook.com/architecture-fitness-function)
- [The Story of Scalar — GitHub Blog (Microsoft monorepo at scale)](https://github.blog/2022-10-13-the-story-of-scalar/)
- [Folder Structure — Nx](https://nx.dev/docs/concepts/decisions/folder-structure)
- [Monorepos — Trunk Based Development](https://trunkbaseddevelopment.com/monorepos/)

## Amendments

**Amendment 2026-06-11 (VW-725)**: added `rootweaver-console/` to the root allowlist —
the platform web frontend (React modular monolith). Rationale: `packages/` is reserved for
Python uv-workspace members; a frontend is a separate toolchain and deployable, following
the existing frontend-trees-at-root convention (arch-viz-frontend et al.).

## Navigation
[📋 ADRs](/adrs/) | 📐 HLD *(internal reference; not included)* | 📐 LLD *(internal reference; not included)* | 🏠 Home *(internal reference; not included)*


## Record identity correction — 14 October 2026 (VW-447)

The canonical filename and ADR registry establish this record as ADR-030. Legacy metadata/headings have been aligned with that identity. This correction does not change the historical decision or assert current deployment. The inherited legacy body signature failed verification before this edit. Its record is retained unchanged; the new signed correction does not authenticate that earlier signature. Run-Id: 01a13723-c94c-7cd0-9257-8d66c0784762.
