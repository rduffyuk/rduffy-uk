---
id: 74
title: "AI Agent Subscription Budget Governance (Claude + Codex)"
status: accepted
recordedStatus: "Accepted"
date: 2026-06-12
tags: ["agent-ops", "observability", "budget", "claude-code", "codex"]
sourceKind: source-record
public: true
journeyId: "2026-06-12-adr-074-treating-ai-agent-spend-as-a-metered-resource"
---
# ADR-074: AI Agent Subscription Budget Governance (Claude + Codex)

**Status**: Accepted 2026-06-12

## Context

Ryan runs two AI coding agents on flat-rate subscriptions:

- **Claude Code** (Anthropic) — billed per subscription cycle; usage is tracked in per-session JSONL files under `~/.claude/projects/`.
- **Codex CLI** (OpenAI, plan "prolite") — subject to two rate-limit windows: a 5-hour rolling window and a 7-day rolling window. Usage snapshots are embedded as `token_count` events in per-session rollout JSONL files under `~/.codex/sessions/`.

Neither vendor provides proactive in-session pacing signals. Both agents can exhaust quota in bursty sessions. Observed Codex usage in the 7 days to 2026-06-12: 41 sessions across 5 active days, 1.16B input tokens (95.6% cache-hit), 3.35M output tokens. The 5-hour window moved from 63% to 71% used in a single evening — burst risk sits in the short window, not the weekly one.

The absence of in-session feedback creates two failure modes: quota exhaustion mid-task (hard stop, work lost) and unnoticed overspend against a hand-set budget target.

## Decision

Adopt a common **three-layer governance pattern** per agent, implemented via VW-755 (Claude) and VW-761 (Codex).

### Layer 1 — In-session advisory guard (UserPromptSubmit hook)

Each guard is a `UserPromptSubmit` hook: it fires before every prompt, reads current usage, and injects a pacing advisory into the agent context if warranted. Design constraints: fail-open (any error silently passes through), env kill switch, no hard blocking.

**Claude guard** (`~/.claude/hooks/weekly_budget_guard.py`, VW-755):

- Parses `~/.claude/projects/*/*.jsonl` usage records and computes a weighted token spend against a hand-configured weekly budget.
- Pace tiers: `>=1.6` "WAY ahead of pace", `>=1.3` "well ahead", `>=1.0` "ahead"; near-limit warning at 90% of budget. *(Superseded 2026-06-15 — pace-ratio tiers replaced by forward-projection, the 90% hard clamp lifted to 95%; see [Subsequent Enhancements](#subsequent-enhancements--claude-guard-2026-06-15).)*
- Kill switch: `CLAUDE_BUDGET_GUARD=off`.
- Companion hooks in the same suite: `context_compact_guard.py` (tightens compact ceiling — default 600k, ~150k only at near-lockout, nudges `/handover` and `/clear` at breakpoints), `bash_output_filter.py` and `lean_jira_guard.py` (output-volume reducers).

**Codex guard** (`~/.codex/hooks/codex_budget_guard.py`, VW-761):

- Reads the newest rollout JSONL under `~/.codex/sessions/`, takes the last `token_count` event's server-truth `rate_limits` block (primary 5-hour window and secondary 7-day window: `used_percent` and `resets_at`).
- Computes a weekly pace estimate via elapsed-window fraction.
- Same tier labels as the Claude guard; adds a dedicated throttle warning when the 5-hour window reaches 80% or above, with UK-local reset time appended.
- Staleness suffix injected when the snapshot is older than 6 hours.
- Kill switch: `CODEX_BUDGET_GUARD=off`.
- Injects advisory via `{"additionalContext": ...}` in the hook return payload.

### Layer 2 — Durable ledger (VictoriaLogs)

Every guard and audit hook POSTs a jsonline to VictoriaLogs:

```
POST http://REDACTED_PRIVATE_IP:30428/insert/jsonline?_stream_fields=source
Content-Type: application/stream+json
```

Omitting `Content-Type: application/stream+json` silently drops the record — this was the VW-677 lesson that hardened the implementation. Active streams:

- `source:model-usage-audit` — per-message Claude token and cost records (VW-677, `model_usage_audit.py`).
- `source:codex-budget-guard` — Codex snapshot fields: `agent`, `plan_type`, `weekly_used_percent`, `weekly_pace`, `fivehour_used_percent`, `snapshot_age_seconds`.

Records are queryable via `/select/logsql/query`. A unified Claude + Codex Grafana panel is a planned follow-on.

### Layer 3 — Retrospective stats (ccusage)

`npx ccusage` (no install, uses npx) reads both vendors' local session logs and produces daily and monthly token-and-cost tables. Codex variant: `npx ccusage@latest codex daily` (verified at v20.0.11).

**Caveat**: ccusage dollar figures are API list-price equivalents (e.g. $718.90 for the observed Codex week), not subscription cost. They measure token volume against public per-token rates, not against the flat-rate quota windows the guards read. These are complementary measures, not the same metric. Ad-hoc deep analysis uses direct JSONL parsing of `token_count` / usage records for either agent.

## Architectural Asymmetry

The two guards share advisory surface and tier labels but draw on opposite data sources:

| Dimension | Claude guard | Codex guard |
|---|---|---|
| Usage signal | Raw per-message token counts in local JSONL | Server-reported `used_percent` from `rate_limits` in rollout JSONL |
| Budget reference | Hand-configured weekly budget (env var) | Vendor-provided quota windows (5h, 7d) |
| Estimation approach | Must estimate spend against a self-set target | Reads server-truth quota directly |
| Staleness risk | JSONL updated every prompt | Snapshot age tracked; guard warns if older than 6 hours |

This asymmetry is a permanent property of the two vendors' data exposure, not an implementation gap. Anthropic exposes raw per-message token usage but no server quota readout; OpenAI exposes server-truth quota `used_percent` but no cumulative token counters. Same advisory surface, opposite data sources.

## Subsequent Enhancements — Claude guard (2026-06-15)

The original decision stands; the Claude Layer-1 guard was refined through four follow-on
tickets. The core three-layer pattern and the Claude/Codex asymmetry are unchanged. Full
narrative + verification: `06-Archive/Implementation-Reports/2026/Architecture/2026-06-15-budget-guard-projection-tier-lever.md`.

- **VW-774 — model-aware weighting.** Each message's weighted-token sum is scaled by a
  per-model multiplier (`model_weights` in `budget.json`: fable 2.0, opus 1.0, sonnet 0.6,
  haiku 0.2 = API list-price ratios vs Opus) so weighted spend tracks cap consumption across
  the model mix, not raw token volume. Changing a weight requires a `CACHE_VERSION` bump to
  force re-parse of the pre-aggregated per-file sums.
- **VW-829 — subscription-tier lever.** `budget.json` gains `active_tier` + a `tiers` map
  (`max20x`/`max5x`); `~/.claude/scripts/set-max-tier.sh &lt;tier&gt;` flips the active budget in one
  command. Honest to the use-it-or-lose-it weekly cap — switches plan ceiling, no cross-week
  rollover. Invoice history confirms Ryan switches tiers ~5×/year, so this is a recurring action.
- **VW-838 — forward-projection throttle.** Replaces the static `spent_frac >= 0.90` clamp
  (which ignored pace, so a recovered burn rate stayed invisible behind a monotonic cumulative
  %) with a trajectory check: `projected_end = spent + recent_6h_rate × time_to_reset`. Warn
  tiers key on `projected_frac`; only a genuine near-lockout (`spent_frac >= 0.95`) hard-clamps.
  A frugal/idle day now relaxes the nag automatically.
- **VW-840 — JSONL dedup (correctness bug).** The Layer-1 "raw per-message token counts" data
  source (see Architectural Asymmetry) had **no deduplication**, while Claude Code JSONL repeats
  usage entries on session resume/compaction/sidechain replay (~58% duplicates measured). The
  guard over-counted ~2.4×. **Caught by cross-checking ccusage** (Layer 3 promoted from
  retrospective-only to an adversarial correctness check): same files, 706M un-deduped vs 290M
  deduped. Fix: dedup by `(message.id, requestId)` via a persisted per-cycle seen-set + exclude
  non-Anthropic models (`gpt-*` from Codex sessions logged in the same dir). Budget then
  recalibrated (the prior VW-839 1430M was compensating for this bug → corrected to 580M; deduped
  290M = 50% real `/usage`). `CACHE_VERSION` 2→3.

**Asymmetry note (extends the table above):** the Claude guard's reliance on *raw local token
counts* is precisely what exposed it to the dedup bug — the Codex guard, reading server-truth
`used_percent`, is structurally immune. The vendor data-source asymmetry has a correctness
dimension, not just a staleness one.

## Subsequent Enhancements — Account-Aware Arbiter and Workflow Ledger (2026-06-18)

The original three-layer pattern is retained, but VW-886 and VW-887 add an account-aware
arbitration layer because local Claude Code JSONL cannot represent every quota-consuming
surface.

### Problem

Claude Max20x reached account-level exhaustion while the local Claude Code-derived guard
reported ~82% of the weekly cap. The missing spend was not a parser bug by itself:
Claude browser, mobile, Claude.ai, and Claude Desktop usage share the same subscription
limit but do not appear in `~/.claude/projects` JSONL.

The MacBook and desktop also share/sync the 2TB workspace, and both `~/.claude/projects`
trees can contain the same logical transcript corpus. Treating Mac + desktop local parses
as independent spend sources would double count or create false confidence.

### Decision

Add a fourth, account-aware source arbitration layer above the local parsers:

1. **Account checkpoint beats local estimate.** A structured checkpoint under
   `REDACTED_WORKSPACE/.ai-budget-digest/account_checkpoints.json` or
   `REDACTED_WORKSPACE/.ai-budget-digest/account_checkpoints.json` can record account-observed Claude
   usage such as Claude.ai/browser/mobile showing 100%. While active, this is the Claude
   headline source.
2. **Local Claude corpus is deduped by logical corpus.** The digest fingerprints the
   Claude JSONL path list under `~/.claude/projects` and collapses matching MacBook +
   desktop corpora into one logical corpus. Multiple hosts are validation views, not
   additive totals.
3. **`ccusage` is pinned and validator-scoped.** The digest uses pinned `ccusage@20.0.14`
   from `~/ai-budget-digest/node_modules/.bin/ccusage`, scoped to the current Claude cycle,
   as a local validator. Hooks must not run `ccusage` on every prompt.
4. **Codex server rate-limit data remains primary.** Codex headline quota still comes from
   Codex `rate_limits` JSONL events. `ccusage codex` is a validator/trend input only.
5. **Prompt hooks get cached account context.** A shared prompt hook
   (`ai_budget_prompt_context.py`) is wired into Claude and Mac Codex `UserPromptSubmit`.
   It reads only cached/account state and emits fail-open, low-latency context such as
   `Claude account: 100% ... local Claude logs: 82% ... +18pp external delta`.
6. **Workflow events get their own ledger.** `/compact`, `/clear`, and `/handover` prompt
   events, plus actual `PreCompact` firings, append structured rows to
   `usage_events.jsonl` in the shared 2TB state directory. The digest renders current-cycle
   counts so compaction and reset behavior is visible alongside budget pressure.

### Current Trust Order

| Provider | Headline source order | Validator / secondary |
|---|---|---|
| Claude | account checkpoint -> local deduped guard state -> stale/missing degraded | pinned `ccusage`, duplicate-corpus notes |
| Codex | Codex `rate_limits` snapshot -> stale/missing degraded | pinned `ccusage`, digest dry render |

### Consequences

- Browser/mobile Claude usage is no longer invisible to the digest or prompt-time advisory
  once a checkpoint is recorded.
- The digest must never sum Mac + desktop Claude usage unless event-level IDs prove they
  are distinct corpora. Matching corpus fingerprints are counted once.
- `/compact`, `/clear`, and `/handover` are measured as workflow events, not as separate
  token-cost categories. Their token spend remains part of normal Claude/Codex usage.
- Prompt hooks stay lightweight: they read checkpoint/guard/rate-limit state only.
- Desktop currently has Claude hook integration and digest collection. Desktop Codex hook
  integration is not applicable until a desktop `~/.codex/hooks.json` exists.

## Alternatives Considered

**Langfuse for subscription tracking** — rejected. Langfuse models cost as tokens-times-unit-price. It has no concept of rolling quota windows. It would measure API-equivalent spend, not flat-rate subscription pressure, making it unsuitable as a quota-window guard.

**Hard-blocking guards** — rejected. Budget pressure is advisory; a spending rate above pace is not a hard error. Fail-open keeps agents usable when telemetry breaks, and avoids disrupting a session mid-task where a hard stop would lose in-progress work.

**Vendor dashboards only** — rejected. Dashboards provide no in-session signal, require context-switching out of the agent, and offer no cross-agent aggregated view. The VictoriaLogs ledger provides the unified view the individual dashboards cannot.

## Consequences

- Per-prompt pacing is visible in both agents without manual dashboard checks during sessions.
- Unified VictoriaLogs ledger enables a single Grafana panel spanning Claude and Codex usage.
- Guards are advisory only — they inject context, they do not block. A runaway agent or long session can exhaust quota despite warnings.
- The Codex guard depends on the rollout JSONL `token_count` event schema and `rate_limits` field. This schema is undocumented but stable across observed versions. Schema drift would silently degrade the guard to no-op (fail-open by design).
- Each `hooks.json` change for Codex triggers a one-time CLI trust prompt per the hook bridge architecture (VW-759).
- ccusage dollar figures must not be cited as subscription cost in any report or blog post — they are API list-price equivalents and will mislead comparisons against flat-rate plan value.
- Account checkpoints are manually observed truth until a stable browser-readable Claude
  account usage source exists. They expire at the configured Claude reset and should not be
  treated as permanent history.

## References

- VW-755: Claude weekly budget guard suite (Done)
- VW-761: Codex budget guard (Done, 2026-06-12); impl report at `02-Active-Work/Implementation-Reports/2026-Q2/2026-06-12-VW-761-codex-budget-guard.md`
- VW-677: Model-tier enforcement and VictoriaLogs ledger; Content-Type lesson for jsonline ingestion
- VW-762: This ADR (tracking ticket)
- VW-774: Model-aware weighting (Done); VW-829: tier lever (Done); VW-838: forward-projection throttle (Done); VW-839: recalibration, corrected by VW-840 (Done); VW-840: JSONL dedup bug + fix (Done)
- VW-886: Usage arbiter with pinned ccusage and account checkpoints (Done); impl report at `02-Active-Work/Implementation-Reports/2026-Q2/2026-06-18-VW-886-ai-budget-usage-arbiter.md`
- VW-887: Prompt context hook and usage-event ledger (Done); impl report at `02-Active-Work/Implementation-Reports/2026-Q2/2026-06-18-VW-887-ai-budget-hook-context-ledger.md`
- Impl report (2026-06-15 enhancements): `06-Archive/Implementation-Reports/2026/Architecture/2026-06-15-budget-guard-projection-tier-lever.md`
- ADR-061: Developer-agent provenance and cryptographic attribution
