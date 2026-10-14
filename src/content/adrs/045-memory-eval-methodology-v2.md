---
id: 45
title: "Memory Eval Methodology v2 — Engineering Memory Focus"
status: proposed
recordedStatus: "proposed"
date: 2026-05-18
tags: ["memory", "benchmark", "methodology", "engineering-memory", "synthetic-corpus", "rootweaver-public"]
sourceKind: source-record
public: true
journeyId: "2026-05-18-adr-045-memory-eval-methodology-v2-engineering-memory-focus"
---
# ADR-045: Memory Eval Methodology v2 — Engineering Memory Focus

**Status**: Proposed
**Date**: 2026-05-18
**Supersedes**: [ADR-044-Memory-Eval-Methodology-v1](/adrs/044-memory-eval-methodology-v1/)
**Jira**: VW-391 (parent); supersedes-closes VW-397/398; keeps active VW-399/400/401; adds VW-402/403/404

---

## Context

ADR-044 (written same day, 2026-05-18 morning) committed to LoCoMo + LongMemEval as the external comparability path. By the afternoon, dispatched research + an end-to-end LoCoMo run (VW-397) had falsified that direction.

### What changed

**Three findings landed in sequence over a single session:**

1. **LoCoMo / LongMemEval are wrong category.** They test biographical conversational memory — fictional personas chatting about life events. Mem0, Letta, ByteRover, LiCoMemory all benchmark on these because they're general-purpose memory systems for chatbot-shaped use cases.

2. **Rootweaver is a different category.** Our memory stores engineering work (Claude Code sessions, commits, vault docs, Jira refs, technical decisions). Our schema's `fact_type` enum (`decision`, `problem`, `learning`, `tool_use`, `collaboration`, `goal`) and `artifact_type` enum (`git_commit`, `vault_doc`, `jira_issue`, `pr_url`, `file_create/modify/delete`, `k8s_apply`) are explicitly engineering-shaped. Forcing biographical content through this surface scored 0/5 on VW-397's LoCoMo run.

3. **No published engineering-memory benchmark exists.** Research dispatched 2026-05-18 identified the closest fits — all from late-2025 / early-2026:
   - **Sandelin "First Controlled Benchmark of AI Memory in Coding Agents"** (Mar 2026) — 5/5 methodology fit (controlled A/B memory ON vs OFF on production codebase), 2/5 as a drop-in.
   - **SWE-ContextBench** (Zhu et al., Feb 2026) — 4/5 fit; tests "experience reuse from prior trajectories".
   - **CodeRepoQA** (Dec 2024, SIGIR 2025) — 4/5 fit; 585K QA pairs from 30 GitHub repos' issue threads.
   - **Flynt "deterministic synthesis"** (Mar 2026) — methodology for ground-truth-by-construction.
   - **arXiv 2512.10218** — directly argues SWE-Bench-Verified scores may reflect training-data recall, not capability.

The space is wide open. Building the benchmark that's missing is more valuable than running existing ones that don't fit.

## Decision

Replace ADR-044's external-LoCoMo/LongMemEval strategy with a **two-track methodology**:

### Track 1 — Internal benchmark on real corpus (PRIMARY)

**Already running** via VW-395 (rule-based) + VW-396 (LLM-judge v2). VW-399 freezes the 2026-05-18 DB state as a reproducible fixture. VW-400 adds the anchor-mode toggle (`frozen` default, `live` opt-in) + REDACTED_EMPLOYER-content sanitiser + Stop hook.

This stays unchanged from ADR-044. Latest scores: Faith 0.650 / Relev 0.669 / CtxP 0.624 / CtxR 0.574 / MRR 0.657 on 40 hand-curated questions against Ryan's actual session corpus.

**Purpose**: trend tracking, regression detection, bug discovery (e.g. the `recall_origin` recall gap surfaced in the most recent run).

**Audience**: internal only. Not publishable as-is because the corpus contains real REDACTED_EMPLOYER-tainted paths.

### Track 2 — Synthetic engineering memory benchmark (NEW, PUBLISHABLE)

**New direction per VW-402**. Build the benchmark that's missing in the field:

1. **Deterministic synthetic corpus generator** (Flynt pattern): a seeded Python sim that emits, in a single run:
   - N synthetic Claude Code session JSONLs (engineering content)
   - Matched git commit log with Jira refs + session trailers (VW-393 pattern)
   - Matched vault doc + ADR file edits
   - Jira issue lifecycle (created → in-progress → done with linked commits)
   - **Ground-truth log emitted simultaneously**: which session originated which decision, which commit touched which file, which Jira tracked which thread.

2. **Ingest path**: same as production — synthetic JSONLs through rootweaver-memory writer.

3. **Question-type suite**: 6 categories × ~30 questions = ~180 total, one per memory tool:
   - `recall_session` — find-by-keyword
   - `recall_origin` — commit/vault_doc/jira ↔ originating round
   - `recall_decisions` — technical decisions over time window
   - `find_problems` — problems hit + resolution
   - `recall_state_at` — time-travel
   - `trace_decision_chain` — FalkorDB graph traversal

4. **Scoring**: MRR + Faithfulness + per-tool precision/recall against the ground-truth log. The Flynt pattern guarantees ground truth by construction — no after-the-fact human labelling.

5. **Reproducibility**: anyone with the seed regenerates the corpus bit-identical.

**Purpose**: external comparability + publishable artifact. The first engineering memory benchmark in the field.

**Audience**: public via `rootweaver-public` (VW-401). Stretch: arXiv preprint.

### One-off sanity check

VW-403 — run our retriever against CodeRepoQA once, capture a baseline number, write a one-paragraph vault note. Not a primary path. Confirms we're not pathologically broken on general repo-QA.

### Tool surface evaluated

Unchanged from ADR-044: 6 memory MCP tools (`recall_session`, `recall_origin`, `recall_decisions`, `find_problems`, `recall_state_at`, `trace_decision_chain`). The synthetic benchmark will exercise all 6 (including `trace_decision_chain` once VW-402 wires a FalkorDB fixture).

### Three-tier artifact split (unchanged, redrawn around the new direction)

| Tier | Examples | Destination |
|---|---|---|
| **Public via `rootweaver-public`** | 6 memory tools code, VW-402 synth-corpus generator + eval suite, judge prompts, ADR-045 methodology, synthetic test set | Open-source repo (VW-401 allowlist) |
| **Publishable static artifacts** | Numbers from internal (Track 1) + external (Track 2) benchmarks, methodology docs, blog/LinkedIn carousels, building-in-public episodes | Vault `10-Blog/`, blog, LinkedIn — static |
| **Private — never leaves** | VW-399 frozen real-DB fixture, live `vault_index`, real golden test set with UUIDs, REDACTED_EMPLOYER keyword list | Local + private vault. `.gitignored` from rootweaver-public extraction. |

### Methodology safeguards (unchanged from ADR-044)

- **Anchor-mode toggle** (VW-400, default `frozen`): applies to Track 1 internal benchmark.
- **Stop hook on live-mode reports**: refuses turn-end on live-mode reports missing the disclaimer banner.
- **REDACTED_EMPLOYER-content sanitiser** (VW-400): scans every benchmark artifact before write.
- **Run metadata**: every JSON records `suite`, `anchor_mode`, `synthesis_model`, `judge_model`, `eval_script_git_sha`, `rootweaver_public_compatible`.

### What every benchmark JSON records

```json
"run_metadata": {
  "suite": "internal_real" | "external_synthetic" | "external_sanity_coderepoqa",
  "anchor_mode": "frozen" | "live" | null,
  "anchor_db_snapshot_sha": "sha256:..." | null,
  "synthesis_model": "gpt-4o-mini",
  "judge_model": "gpt-4o-mini",
  "judge_prompt_versions": { ... },
  "synth_corpus_seed": <int> | null,
  "synth_corpus_ground_truth_sha": "sha256:..." | null,
  "eval_script_git_sha": "<git rev-parse HEAD>",
  "rootweaver_public_compatible": true | false,
  "live_mode_disclaimer": null | "WARNING: ..."
}
```

The `synth_corpus_seed` + `synth_corpus_ground_truth_sha` fields are new in v2 — they make synthetic-corpus runs reproducible across systems.

## Consequences

### Positive

- **Honest direction**: we're testing a system on the task it's actually designed for, not stress-testing it on a domain it wasn't built for.
- **Publication opportunity**: first engineering memory benchmark, ground-truth-by-construction, reproducible from seed. Six months ahead of the field.
- **License-clean public artifact**: synthetic corpus is wholly ours; no CC-BY-NC inheritance from LoCoMo, no MIT attribution chain from LongMemEval judges.
- **Internal benchmark already exists** and is producing useful signal (the `recall_origin` recall-gap discovery). Track 1 is operational.
- **VW-401's public-extraction scope simplifies**: synthetic corpus → no PII gate needed at the extraction boundary.

### Negative

- **No direct comparison to other memory systems** today. Until other systems run our synthetic corpus, we can't say "Rootweaver scored X on the same benchmark Mem0 scored Y." Mitigated by: the corpus is open + reproducible from seed, so we *can* run other systems against it ourselves as a stretch goal.
- **More work**: VW-402 is 1-2 weeks of focused work for v1 corpus + eval, vs the original "vendor Mem0 harness" plan (which seemed cheaper but turned out to be misaligned).
- **Track 1's number doesn't generalise externally** — it's "Rootweaver on Rootweaver-style content". Useful for internal trend tracking only.

### Neutral

- **VW-397 sunk cost**: ~1.5 hours of LoCoMo-specific adapter work. The `_openai_call.py` helper + `_locomo_judge.py` BLEU/F1/judge scaffolding + synthesis-layer selector pattern are reusable in VW-402. The LoCoMo ingest module is wasted but cheap.

## Alternatives Considered (post-pivot)

### Stick with LoCoMo + LongMemEval (rejected)

ADR-044's original direction. Rejected because:
- 0/5 score on VW-397 confirmed domain misalignment, not a code bug
- The user's framing ("this is more about weights for LLM models") matches the published meta-critique (arXiv 2512.10218)
- Comparable numbers against systems in a different category aren't informative

### Pure internal benchmark only (rejected)

Don't try to publish anything external. Track 1 only.

Rejected because: `rootweaver-public` is on the release trajectory, and a published benchmark in a missing category is materially more valuable than just shipping the tools alone. Six months of lead time is rare.

### Adopt SWE-ContextBench / CodeRepoQA as primary (rejected)

Both are 4/5 fits for *some* aspects but neither targets cross-session decision tracebacks specifically. CodeRepoQA tests issue-thread completion; SWE-ContextBench tests task-trajectory reuse. Neither tests "given a current change, find the originating decision in session history".

Used CodeRepoQA as a one-off sanity check (VW-403) instead.

## Verification

We will know this methodology holds when:

1. **Track 1 reproducibility**: a `--anchor-mode frozen` run on VW-399's fixture reproduces VW-395/396 numbers within ±0.02.
2. **Track 2 ground truth integrity**: VW-402's synth generator produces identical corpus + ground-truth from the same seed across 10 runs.
3. **External comparability achievable**: at least one external memory system (Mem0 or Letta) can be wired through VW-402's eval harness and produces a number we can compare against ours.
4. **REDACTED_EMPLOYER sanitiser blocks**: synthetic test artifact containing a REDACTED_EMPLOYER keyword refuses to write.
5. **Stop hook refuses**: synthetic live-mode report missing the disclaimer line blocks turn-end.
6. **CodeRepoQA sanity**: VW-403 produces a single-paragraph note with our score in the same order of magnitude as the published baselines on CodeRepoQA (or we have a structural explanation if not).

## Open Questions

- **VW-402 timeline**: 1-2 weeks focused. Want a working v1 corpus + 20-question eval before scaling to 180.
- **arXiv preprint**: stretch goal. Decision deferred until VW-402 v1 ships and we know the result-shape.
- **External-system comparison**: stretch — run Mem0/Letta/Cognee against our synthetic corpus once their plug-in interfaces are documented. Would land as a Sandelin-style controlled A/B per-system table.
- **FalkorDB fixture for `trace_decision_chain`**: needed for full 6-tool coverage in Track 2. Separate ticket when VW-402 hits that tool's bench section.
- **VW-394 (embedding/KEDA)**: still Backlog; once decided, vector-search categories light up in both Track 1 and Track 2.

## References

- ADR-044 (superseded): [ADR-044-Memory-Eval-Methodology-v1](/adrs/044-memory-eval-methodology-v1/) — the original direction this revises
- VW-391 design ticket — parent memory system
- VW-397/398 closed comments — empirical record of why LoCoMo direction was abandoned
- Sandelin "First Controlled Benchmark of AI Memory in Coding Agents" — [Medium, Mar 2026](https://medium.com/@mrsandelin/the-first-controlled-benchmark-of-ai-memory-in-coding-agents-8e0bb776d39e)
- SWE-ContextBench — Zhu et al., [arXiv 2602.08316](https://arxiv.org/abs/2602.08316), Feb 2026
- CodeRepoQA — [arXiv 2412.14764](https://arxiv.org/abs/2412.14764), SIGIR 2025
- Flynt "deterministic synthesis" — [Medium, Mar 2026](https://jeffreyflynt02.medium.com/i-ran-8-rag-pipelines-against-a-benchmark-where-the-ground-truth-is-guaranteed-1cf883561e63)
- "Does SWE-Bench-Verified Test Agent Ability or Model Memory?" — [arXiv 2512.10218](https://arxiv.org/abs/2512.10218) — the meta-critique
- MemoryArena (multi-session interdependence methodology) — [arXiv 2602.16313](https://arxiv.org/abs/2602.16313)
- Lore (git-trailer ADRs as a decision protocol) — [arXiv 2603.15566](https://arxiv.org/abs/2603.15566) — aligns naturally with our `recall_origin` commit-traceback story
- Handover doc: `obsidian-vault/02-Active-Work/Handovers/2026-05-18-Session-Handover-Next-Session.md`
- This session's research agent output: see VW-397 closure comment + ChatGPT session 22d0c3dd archive
