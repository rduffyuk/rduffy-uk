---
id: 73
title: "Interactive Agent Sessions — Audited Free-Form Supersedes Template-Only"
status: accepted
recordedStatus: "Accepted"
date: 2026-06-12
tags: ["agent-ops", "security"]
sourceKind: source-record
public: true
episode: "season-4-episode-05-the-instrument-panel"
journeyId: "2026-06-12-adr-073-interactive-agent-sessions-with-explicit-human-approvals"
---
# ADR-073: Interactive Agent Sessions — Audited Free-Form Supersedes Template-Only

**Status**: Accepted 2026-06-12 (Ryan approved via the cockpit spec; extends/supersedes part of ADR-072)

## Context

ADR-072 gated launches to a template allowlist precisely because a free-form web prompt is an injection-to-RCE funnel. The cockpit spec (approved same day) requires **interactive sessions**: follow-up messages typed from the console into a running Claude Code session. A follow-up message IS free-form prompting — pretending templates still constrain content once a conversation starts would be dishonest. Best-practice check: the raw CLI's stream-json input and `--permission-prompt-tool` are under-documented; the **Python Claude Agent SDK** is the supported surface (streaming input + `canUseTool` callback).

## Decision

1. **Runner v2 is built on the Claude Agent SDK** (same Claude Code engine — hooks, settings, account auth unchanged). Sessions are SDK clients held open for multi-turn.
2. **Launch stays template-gated** (cwd, permission profile, model, timeout still come from templates / idea-seeding); **conversation is free-form** via `POST /v1/sessions/{id}/messages`.
3. **Protection model shifts from constrain-content to authenticate + audit + contain + approve**:
   - authenticate: dedicated token, fixed actor binding (unchanged from ADR-072)
   - audit: every inbound message appended to `launches.jsonl` with session id + ts
   - contain: global/template caps, per-session timeout, `DISABLED` kill-switch (unchanged)
   - approve: `canUseTool` parks tool requests; console answers allow-once / allow-always / deny; **deny on 5-minute timeout** (fail-closed)
4. **Observability**: universal Pre/PostToolUse logger hook appends JSONL to `agent-ops/hook-events.jsonl`; runner streams it (all desktop sessions, filterable by session). Read-only tmux/ttyd raw-terminal mirroring is permitted (VW-745); **writable** web terminals remain rejected. **[Amendment 2026-06-15: Superseded-by ADR-078 (VW-828) — writable terminal now accepted under unix-socket+CSWSH+CSRF+tailnet model; see ADR-078 for Phase A residuals and Phase B exit.]**
5. Single-user/Tailnet/own-subscription posture unchanged (ToS-verified; never multi-user).

## Consequences

- The console becomes a genuine Claude Code front-end (steer, approve, observe) at the cost of accepting that its operator can run anything their own account can — acceptable because the operator IS the account owner, and every action is audited and attributable (run_id → ADR-061 chains).
- ADR-072 remains in force for everything else (placement, tokens, caps, kill-switch, fail-closed template loading).

## Related

ADR-072 (supersedes its template-only conversation constraint), ADR-061 (run_id provenance), cockpit spec `02-Active-Work/Plans/2026-06-12-Console-IDE-Cockpit-Design.md`.
