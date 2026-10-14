---
id: 44
title: "Memory Eval Methodology v1 — Synthesis-Layer, Anchor-Mode Toggle, Three-Tier Artifact Split [SUPERSEDED]"
status: superseded
recordedStatus: "superseded"
date: 2026-05-18
tags: ["memory", "benchmark", "methodology", "locomo", "longmemeval", "ragas", "synthesis-layer", "rootweaver-public"]
sourceKind: source-record
public: true
journeyId: "2026-05-18-adr-044-memory-eval-methodology-v1-synthesis-layer-anchor-mode-toggle-three-tier-artifact-split-superseded"
---
> **⚠ SUPERSEDED 2026-05-18 (same day as written) by [ADR-045-Memory-Eval-Methodology-v2](/adrs/045-memory-eval-methodology-v2/)**.
>
> This ADR proposed using LoCoMo + LongMemEval (chatbot/companion memory benchmarks) as the external comparability path. Research dispatched 2026-05-18 plus an end-to-end LoCoMo run (VW-397) showed:
> 1. LoCoMo / LongMemEval are wrong category — they test biographical conversational memory, not engineering work memory.
> 2. No published benchmark exists for engineering memory specifically (sessions + commits + vault docs + Jira cross-refs with originating-decision tracebacks). The closest fits all date from late-2025 / early-2026; the space is just forming.
> 3. Empirical confirmation: VW-397 scored 0/5 on LoCoMo conv-26 even with 300 facts populated — domain misalignment, not a code bug.
>
> **Forward path** ([ADR-045-Memory-Eval-Methodology-v2](/adrs/045-memory-eval-methodology-v2/)): internal benchmark on real corpus (primary, already running per VW-395/396 + VW-399 frozen fixture) + **synthetic engineering memory benchmark (VW-402)** as the publishable external artifact.
>
> Kept here as the historical record of what was tried.

# ADR-044: Memory Eval Methodology v1 — Synthesis-Layer, Anchor-Mode Toggle, Three-Tier Artifact Split [SUPERSEDED]

**Status**: Superseded by [ADR-045-Memory-Eval-Methodology-v2](/adrs/045-memory-eval-methodology-v2/)
**Date**: 2026-05-18
**Jira**: VW-391 (parent), VW-395/396 (precedents), VW-397/398 (closed — wrong category), VW-399/400/401 (still active)

---

## Context

VW-391 stood up a long-term structured memory store: 6 MCP tools (`recall_session`, `recall_origin`, `recall_decisions`, `find_problems`, `recall_state_at`, `trace_decision_chain`) backed by a Postgres `memory.*` schema populated from Claude Code session JSONLs.

VW-395 shipped an internal benchmark suite (40 queries × 8 categories, rule-based scorer). VW-396 added LLM-as-judge v2 using gpt-4o-mini. Both ran against ground truth anchored to **live** `vault_index` DB state.

Two pressures now apply:

1. **Comparability**. Industry has converged in 2025–2026 on **LoCoMo** (Snap, ICLR 2025) and **LongMemEval** (Wu et al., ICLR 2025) as the standard memory benchmarks. Top published numbers: ByteRover 92.2% LoCoMo, Letta 74.0% LoCoMo, LiCoMemory 73.8%/76.6% LongMemEval. Without aligning to those, our internal numbers cannot inform claims about how the system compares.
2. **Publication**. Rootweaver is destined for public release via `rootweaver-public`. Any benchmark numbers we publish — and any code we release — must be defensible against a Zep-style retraction event (where Zep's 84% LoCoMo was retracted to 58.4% after corrected eval). Reference: [getzep/zep-papers#5](https://github.com/getzep/zep-papers/issues/5).

The privacy constraint is non-negotiable: REDACTED_EMPLOYER employer data and the user's private session contents must never leave the private side.

## Decision

### Fork 1 — synthesis layer over structured outputs

LongMemEval and LoCoMo both expect free-form text answers. Our 6 MCP tools return structured DB rows (`{session_id, started_at, summary, ...}`). Two options were considered:

- **(a) Synthesis layer**: wrap the 6 tools behind an LLM call that formats results into natural language. Closer to how Mem0/MemGPT/Letta operate.
- **(b) Direct structured scoring**: score DB-row outputs against expected answers with a bespoke adapter.

**Decision**: **(a) synthesis layer**. Comparability is the explicit goal — matching published methodology beats bespoke scoring. Synthesis model pinned to `gpt-4o-mini` to match the VW-396 judge cost envelope.

### Fork 2 — anchor-mode toggle (frozen | live)

Our ground truth is anchored to specific UUIDs/counts in the `memory.*` schema. The schema drifts every backfill.

**Decision**: support **both** modes behind a CLI flag (VW-400):

- `--anchor-mode frozen` (**default**): loads `tests/fixtures/memory_db_2026_05_18.sql.gz` (VW-399) into testcontainers Postgres; ground truth resolved from the static fixture. Required for any published number.
- `--anchor-mode live`: connects to live `vault_index`; runs `_anchor_resolver.py` to regenerate expected counts/UUIDs deterministically. For development only.

**Critical safeguard**: live-mode reports must include a disclaimer line in frontmatter (`live_mode_disclaimer: WARNING: ...`), enforced by a Stop hook (VW-400). It is **impossible** to publish a live-mode number as a comparable score without overriding the hook.

### Fork 3 — judge model

**Decision**: **pin gpt-4o-mini** for v1 publication. Research surfaced GPT-o3-mini as better-aligned with human scores (Galtea, late 2025), but switching primary judge adds methodology variance we haven't measured. Add o3-mini as a calibration sidecar in v2 once we have a stable v1 number.

### Three-tier artifact split

| Tier | Examples | Destination |
|---|---|---|
| **Public via `rootweaver-public`** | Memory tools code (6 MCP tools), synthesis layer, judge prompts, benchmark harnesses (LoCoMo runner VW-397, LongMemEval runner VW-398), scoring scripts, this ADR, synthetic public test set template, `_bt_sanitiser` shape | Open-source repo (allowlist enforced via VW-401 design doc) |
| **Publishable static artifacts** | Benchmark numbers + methodology, LinkedIn carousels, building-in-public episodes | Vault `10-Blog/`, blog, LinkedIn — static documents only, never live services |
| **Private — never leaves** | Frozen DB fixture (VW-399), live `vault_index` DB, golden test set with real UUIDs, conversation contents, REDACTED_EMPLOYER keyword list | Local + private vault. `.gitignored` from `rootweaver-public` allowlist. |

### Benchmark suites — two parallel tracks

- **External suite** (public corpora): LoCoMo (VW-397) + LongMemEval (VW-398). Always uses public static corpora — `anchor_mode` is N/A. **Publishable.**
- **Internal suite** (our DB): VW-395/396 inherited. Uses anchor-mode toggle. **Trend tracking + bug detection only — not for comparability claims.**

### Privacy enforcement

- **REDACTED_EMPLOYER-content sanitiser** (VW-400): scans every benchmark report / fixture-derived artifact before write. Refuses if REDACTED_EMPLOYER keywords matched. Keyword list lives in private config, never ships in `rootweaver-public`.
- **Stop hook**: blocks turn end if a live-mode report is missing its disclaimer line.
- **Vault staging discipline**: continues to apply — staging file → `vault-path:` resolution → auto-copy → delete staging, per `~/.claude/CLAUDE.md` Rule 2.

### What every benchmark JSON must record

```json
"run_metadata": {
  "suite": "external_locomo" | "external_longmemeval" | "internal",
  "anchor_mode": "frozen" | "live" | null,
  "anchor_db_snapshot_sha": "sha256:..." | null,
  "anchor_db_dump_timestamp": "2026-05-18T..." | null,
  "synthesis_model": "gpt-4o-mini",
  "judge_model": "gpt-4o-mini" | "gpt-4o",
  "judge_prompt_versions": {"faithfulness": "v2", ...},
  "eval_script_git_sha": "<git rev-parse HEAD>",
  "live_mode_disclaimer": null | "WARNING: live-mode benchmark — not for comparability claims",
  "rootweaver_public_compatible": true | false
}
```

The `rootweaver_public_compatible` field is `true` only when the run could be reproduced by an external user with the public repo + our published methodology — i.e. external suite, frozen mode where applicable, no REDACTED_EMPLOYER-tainted artifacts referenced.

## Consequences

### Positive

- **Defensible publication posture**. Numbers + methodology + code all ship together; reproducibility doesn't depend on private data; methodology is documented in this ADR.
- **Two-axis trend tracking**: external suite for comparability against state of the art; internal suite for catching our own regressions (e.g. the `recall_origin` recall gap discovered 2026-05-18 — see handover doc).
- **Defense in depth on privacy**: gitignore + sanitiser + Stop hook + staging discipline. Any one of these failing leaves the others standing.
- **Designed for extraction now, cheap to release later**: VW-401 scopes the public surface up front, so when `rootweaver-public` ships, the memory-bench code moves cleanly.

### Negative

- **Synthesis layer adds LLM variance**. Our tools are deterministic; the synthesis call is not. Mitigated by pinning model + temperature, but published numbers are now "system + synthesis", not "system alone". Stated explicitly in every report.
- **Two suites = 2x maintenance**. Internal + external are not free; both need to keep working as the system evolves.
- **Frozen fixture goes stale**. A snapshot from 2026-05-18 will not reflect new backfilled sessions. Refresh cadence TBD (likely quarterly, with each refresh committing a coupled fixture + expected-answer regeneration).

### Neutral

- **No live services exposed**. All evaluation is offline: download corpus → run locally → emit JSONL → score locally → publish numbers as static artifacts. The MCP bridge stays internal-only.

## Alternatives Considered

### Vendor Mem0's eval harness as a framework (rejected)

Initial research suggested `mem0-ai/mem0` exposed a clean `MemoryBackend` plug-in interface for LoCoMo + LongMemEval + BEAM. **Verified false 2026-05-18**: their harness runs LoCoMo only, with no abstract base class — integration is sibling implementation files at `src/&lt;system&gt;/`. Building thin Mem0-pattern runners (VW-397/398) is *simpler* than vendoring and gives us the same comparability.

### Direct structured scoring instead of synthesis layer (rejected, Fork 1b)

Would have measured "our tools" not "our tools + an LLM wrapper". But it requires a bespoke scorer per benchmark and produces non-comparable numbers. We chose comparability over purity.

### Live-anchor-only (rejected, Fork 2 single mode)

Simpler. But would mean every published number is measured against a different ground truth — methodology indefensible. Frozen-default with live as an opt-in dev path is strictly better.

### Switch judge to GPT-o3-mini for v1 (rejected, Fork 3 alternative)

Better human alignment per Galtea, but adds an unmeasured methodology change to a system that already has working numbers. Deferred to v2 calibration sidecar.

### Skip publication entirely / pure-internal benchmark (rejected)

Path A from the strategy discussion. Cheaper short-term, but loses external comparability and doesn't lay foundations for `rootweaver-public` release. Given Rootweaver is on a public-release trajectory, doing benchmarking "the right way" now is materially cheaper than retrofitting later.

## Verification

We will know this methodology holds when:

1. A `--anchor-mode frozen` run of the internal suite reproduces VW-395 numbers within ±0.02 (after re-anchoring the v1 test set against the frozen fixture).
2. The external LoCoMo run (VW-397) produces a number that lands inside the published-system band (30–95%) without obvious methodological errors (we expect to be in the mid-band — Letta/Mem0 territory).
3. The external LongMemEval run (VW-398) shows per-ability variance roughly consistent with published systems (temporal reasoning + abstention should be our weakest, in line with industry).
4. The REDACTED_EMPLOYER-content sanitiser blocks a synthetic test artifact containing a REDACTED_EMPLOYER keyword before write.
5. The Stop hook refuses turn end on a synthetic live-mode report missing the disclaimer line.
6. `rootweaver_public_compatible: true` is achievable on an external-suite frozen run, demonstrating end-to-end public-extractability.

## Open Questions

- **Refresh cadence for the frozen fixture**: quarterly seems reasonable but isn't pinned. Defer until VW-399 lands and we see real usage patterns.
- **Synthesis prompt versioning**: we'll version the synthesis prompt the same way we version judge prompts. First version = `v1`, locked at VW-397 ship.
- **VW-210 coordination**: VW-210 (RAGAS `judge_alignment` calibration) is in progress. Once it produces calibration numbers, our judge prompts may move to v2. The methodology supports this — `judge_prompt_versions` is per-prompt in run metadata.
- **GPT-o3-mini sidecar**: deferred to a future ADR (likely ADR-045 if it becomes a methodology change).
- **`rootweaver-public` repo creation ticket**: not yet filed. VW-401 scopes what would extract; the repo itself is a separate organisational decision.

## References

- LoCoMo paper: [arXiv 2401.17753](https://arxiv.org/abs/2401.17753) / [project page](https://snap-research.github.io/locomo/)
- LongMemEval paper: [arXiv 2410.10813](https://arxiv.org/abs/2410.10813) / [repo](https://github.com/xiaowu0162/longmemeval) / dataset `xiaowu0162/longmemeval-cleaned`
- Mem0 paper: [arXiv 2504.19413](https://arxiv.org/abs/2504.19413) / [State of Agent Memory 2026](https://mem0.ai/blog/state-of-ai-agent-memory-2026)
- Zep LoCoMo retraction: [getzep/zep-papers#5](https://github.com/getzep/zep-papers/issues/5) — the canonical "why methodology matters" reference
- ADR-016: Modular HLD/LLD (provides the pattern for ADR-as-canonical doc this follows)
- ADR-030: Repository Structure for AI-Assisted Development (provides the `rootweaver-public` extraction context)
- Handover: `obsidian-vault/02-Active-Work/Handovers/2026-05-18-Session-Handover-Next-Session.md`
- Session log: `obsidian-vault/01-Journal/Session-Reports/2026-05-18-Memory-System-Marathon-Session.md`
