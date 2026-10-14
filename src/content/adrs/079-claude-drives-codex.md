---
id: 79
title: "Claude-drives-Codex Autonomous Handoff (Dual-Agent Coding Routing)"
status: accepted
recordedStatus: "Accepted"
date: 2026-06-15
tags: []
sourceKind: source-record
public: true
journeyId: "2026-06-15-adr-079-claude-drives-codex-autonomous-dual-agent-coding-handoff"
---
# ADR-079: Claude-drives-Codex Autonomous Handoff (Dual-Agent Coding Routing)

**Status:** Accepted · **Date:** 2026-06-15 · **Owner:** Ryan Duffy
**Implements:** VW-841 · **Review:** VW-842 (2026-06-22) · **Relates to:** [ADR-074-AI-Agent-Subscription-Budget-Governance-Claude-Codex](/adrs/074-agent-budget-governance/)

## Context

Downgrading Claude Max 20x → Max 5x (VW-829) drops the weekly weighted cap ~4× (to ~145M). Measured Claude usage is **~81% coding by weighted-token cost** (~300M weighted/wk non-Fable, rising), so coding alone overruns Max 5x by ~2×. A paid **Codex Pro 5x** subscription is already held and only ~30% utilised (server-truth `rate_limits.secondary`). The cheapest way to fit Max 5x without losing capability is to route coding to Codex — but ad-hoc routing fails because it is easy to forget, and naive multi-agent handoff carries real overhead.

## Decision

Adopt a **single-interface, Claude-drives-Codex** division of labour:

1. **Roles.** Claude = architecture, spec, review, orchestration, vault/Jira. **Codex = implementation.** The user talks only to Claude; Claude invokes Codex via `codex exec` as a subprocess (no second interface).
2. **Handoff (`/codex-handoff` skill).** Architect (spec + acceptance gates) → isolate (git worktree, unique branch) → `codex exec --sandbox workspace-write --ignore-user-config --ignore-rules --json --cd` (preflight `>=0.38.0`) → **gate** (full test suite + a check that fails if test assertions were removed) → **cross-vendor review** (Claude reads the diff vs intent) → merge on PASS / keep-worktree on FAIL → cleanup.
3. **Always-on nudge.** A `UserPromptSubmit` hook reminds (advisory, 30-min suppressed) on every *substantial* coding prompt regardless of cap — coding routes to Codex *going forward by default*, not only near the cap (proactive habit, not damage-control).

## Subsequent Enhancement - Work Router and Lane Contract (2026-06-18 / VW-842)

VW-842 hardened the runtime policy after review found that the original design
was mechanically healthy but too advisory. The active Claude hook is now
`~/.claude/hooks/ai_work_router.py`, wired in `~/.claude/settings.json` as
`AI work router (VW-842)`.

The router reads the same budget truth as ADR-074: Claude account checkpoints,
Claude local guard state, and Codex server `rate_limits`. It emits one of four
plain routing directives:

| Directive | Meaning |
|---|---|
| `CLAUDE_ARCHITECT` | Keep Claude on architecture, spec, review, and orchestration only. Record a pending Codex handoff for the next approval/go prompt. |
| `CODEX_HANDOFF` | Route bounded implementation to `/codex-handoff` with a small spec, Jira key, exact test command, and acceptance gates. |
| `CLAUDE_SMALL_FIX` | Reserved for later if a genuinely tiny edit can safely stay on Claude while the account is not hot. |
| `PAUSE_HEAVY_WORK` | Do not start heavy automated Claude or Codex work when Codex weekly or 5h windows are near exhaustion. |

The pending-handoff state closes the failure mode where Claude designs a change
and then misses a short user approval such as "approved", "ok", or "go". The
approval prompt is routed to Codex when a recent architecture/spec turn created
pending state.

VW-842 also changes the lane contract. `run-codex-lane.sh` still uses
`codex exec --sandbox workspace-write --ignore-user-config --ignore-rules` for
isolation, but it now prepends a mandatory prompt contract plus
`~/.codex/AGENTS.md` and the nearest local `AGENTS.md` before the task spec.
This preserves Jira-first, vault staging, provenance, no-secret, no-git-in-vault,
and test-preservation rules even though Codex's normal config/rules are ignored
by the isolated subprocess.

Current verified baseline when this amendment was made:

- Claude: 100% account checkpoint; local deduped Claude Code corpus 82% and projected 83%.
- Codex: 12% weekly, 77% 5h window, 6.9x pro-rata pace.
- Tests: 32 hook/handoff tests pass.
- Config validation: Claude/Codex hook config valid; `errors=0`, one existing `.stignore` warning.

## Rationale (evidence)

- **Heterogeneous-vendor split is the validated regime.** Same-model multi-agent matches single-agent (arXiv:2601.12307); the advantage survives only across *different* base models — exactly Claude+Codex.
- **Role split pays at repo scale.** MAGIS (NeurIPS 2024) 13.94% vs 1.74% GPT-4 solo; QA/review role +1.92pp; Self-Collaboration +29.9–47.1% pass@1.
- **Test-gaming is rampant → the integrity gate + cross-vendor review are necessary,** not optional (METR 30.4%; Anthropic arXiv:2511.18397 36–75% "edits tests not code"; self-preference bias arXiv:2404.13076).
- **Route only substantial tasks.** Handoff overhead ~2.2× tokens, 53.9% comms (arXiv:2601.14470), up to 41.1% quality loss from naive multi-agent (arXiv:2602.01011); structured spec ≫ context dump (arXiv:2307.03172).

## Consequences

**Positive:** fits Max 5x (saves ~£80/mo / ~£960/yr); coding runs on the cheaper-per-token, coding-specialised Codex bucket; cross-vendor review is a free adversarial check; worktree isolation makes autonomy safe (bad run = discarded worktree).
**Negative / risks:** handoff overhead means trivial tasks should NOT be routed (mitigated: nudge fires only on substantial work); **v1 gate catches test *deletion* but not semantic *weakening*** (mitigated by cross-vendor review; v2 = shadow-test + mutation-score gate); Codex has its own weekly cap (guarded by VW-761; watch `rate_limits.secondary`).

## Alternatives considered

- **Stay on Max 20x** — rejected: ~£80/mo for capacity Codex already provides.
- **Model-mix to Sonnet on Claude** — rejected: 0.6× multiplier, not 0×; Codex offload removes the work from the cap entirely.
- **Manual handoff (no nudge/skill)** — rejected: relies on remembering; the discipline is load-bearing for the cap.
- **Same-vendor multi-agent (Claude sub-agents only)** — rejected: arXiv:2601.12307 shows no gain over single-agent for homogeneous models.

## References

- Impl report: `06-Archive/Implementation-Reports/2026/Architecture/2026-06-15-VW-841-codex-handoff-build.md`
- Plan: `02-Active-Work/Plans/2026-06-15-VW-841-codex-handoff-implementation-plan.md`
- Budget governance: [ADR-074-AI-Agent-Subscription-Budget-Governance-Claude-Codex](/adrs/074-agent-budget-governance/); VW-829 report addendum.
- Components: `~/.claude/skills/codex-handoff/`, `~/.claude/hooks/ai_work_router.py`,
  compatibility nudge `~/.claude/hooks/codex_route_nudge.py`.
