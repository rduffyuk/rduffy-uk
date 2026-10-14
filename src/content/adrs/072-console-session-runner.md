---
id: 72
title: "Agent-Ops Console Module — Desktop Session Runner with Template-Gated Launch"
status: accepted
recordedStatus: "Accepted"
date: 2026-06-12
tags: ["agent-ops", "rootweaver-console", "security"]
sourceKind: source-record
public: true
episode: "season-4-episode-05-the-instrument-panel"
journeyId: "2026-06-12-adr-072-launch-agent-sessions-through-a-bounded-console-runner"
---
# ADR-072: Agent-Ops Console Module — Desktop Session Runner with Template-Gated Launch

**Status**: Accepted 2026-06-12 (Ryan approved same day; implementation proceeding under VW-735)
**Context epic**: VW-730 rootweaver-console command center. Five read-only modules shipped 2026-06-12 (review queue, coverage, vault explorer, idea map, ops, Jira board). Agent-ops is the only mutating module: launch and monitor Claude Code sessions from the console (and later iPhone/PWA).

## Context

Launching an AI coding session from a web page is remote code execution on the desktop by construction. The VW-725 brainstorm locked three constraints this design must honour:

1. **Hooks stay machine-local** — Claude Code's safety hooks, auth (keychain), git signing (Secretive/file keys), repos and `~/.claude` config all live on the desktop host. Sessions cannot run in K3s pods without losing all of them.
2. **SSE through the existing proxy** — the console nginx was built with `proxy_buffering off` precisely for this.
3. **The shared review-tracker token is not good enough for a mutating surface** — VW-735 is the forcing function for per-client tokens with actor binding (deferred v1b item in `server.py`).

## Decision

### 1. Runner = systemd *user* daemon on the desktop, outside K3s

A small FastAPI service (`agent-ops-runner`) runs as Ryan's user on the desktop, managed by `systemctl --user`, unit file tracked in the claude-config repo. It binds the Tailscale interface (`REDACTED_PRIVATE_IP:8030` — host port, deliberately outside the NodePort table; documented here). K3s pods reach the node's Tailscale IP directly; the console netpol gains an egress `ipBlock REDACTED_PRIVATE_IP/32` on 8030 (same pattern rag-gateway uses for the GPU exporter on 9400).

### 2. Path and auth

`/api/agent/` location in the console nginx → `http://REDACTED_PRIVATE_IP:8030`, `proxy_buffering off`. The runner has its **own bearer token** (never the review-tracker token), injected server-side by nginx envsubst from a separate secret. The runner maps token → fixed `actor` (`rduffy-web`); the request body cannot claim a different actor. Binding the Tailscale interface + token means: no Tailnet, no access; on the Tailnet, no token, no access.

### 3. Launch model: template allowlist only (v1)

Free-form prompts from a web form are deferred — a textarea that spawns an agent with repo access is an injection-to-RCE funnel. v1 launches only **templates**: files in `~/.claude/agent-ops/templates/*.toml`, each defining `id`, `description`, `cwd`, a prompt template with **enumerated, validated parameters** (no raw string splice into shell — the runner execs `claude` with an argv array, never a shell), `permission_mode`, `allowed_tools`, `timeout_s`, `max_concurrent`. Editing templates requires desktop access — the console can only invoke what already exists on disk. Free-form lands later, if ever, behind plan-mode default + an explicit per-launch confirm.

### 4. Execution and streaming

The runner spawns `claude -p &lt;rendered prompt&gt; --output-format stream-json --verbose` in the template's `cwd`, parses the stream-json events and relays them per-session over SSE. API surface:

| Endpoint | Purpose |
|---|---|
| `GET /v1/sessions` | list (id, template, actor, state, started, run_id) |
| `POST /v1/sessions` | launch `{template_id, params}` — 409 if disabled or at cap |
| `GET /v1/sessions/{id}/events` | SSE stream of session events |
| `POST /v1/sessions/{id}/stop` | SIGTERM, SIGKILL after grace |
| `POST /v1/stop-all` | kill switch (also creates the disable flag) |
| `GET /healthz` | liveness |

Global cap: 2 concurrent sessions (per-template `max_concurrent` may be lower). Per-session timeout from the template; the runner reaps on expiry.

### 5. Kill switch and failure posture

A flag file (`~/.claude/agent-ops/DISABLED`) is checked before every launch — touch it (or `POST /v1/stop-all`, or `systemctl --user stop agent-ops-runner`) and nothing new starts. Fail-closed: if templates fail to parse, the runner serves an empty template list rather than guessing.

### 6. Audit and provenance

Each launch appends a JSONL record (ts, actor, template, params, claude session id) to `~/.claude/agent-ops/launches.jsonl`. The Claude session id **is** the ADR-061 `run_id`: commits made by launched sessions already carry Session-Id trailers, Jira comments carry Run-Id, so `console launch → run_id → commits/tickets` pivots work with zero new plumbing. The console session list links each session to its artifacts.

## Consequences

- One new host service outside GitOps — managed like the other desktop user services; unit + runner code live in claude-config (Mac-authored, desktop pulls), runbook in the vault.
- The console gains its first mutating, RCE-adjacent surface with three independent gates (Tailnet, token, template allowlist) plus cap/timeout/kill-switch containment.
- The PWA/iOS client planned later consumes the same API unchanged.
- Template ergonomics become the UX bottleneck by design: adding a new capability = writing a template on the desktop, which is exactly the human-in-the-loop step we want.

## Alternatives considered

- **Sessions as K8s Jobs**: rejected — loses keychain auth, machine-local hooks, signing keys, and live repos; containerising those secrets makes the cluster the attack surface.
- **Reuse device-exec MCP**: rejected — built for one-shot command execution, no session lifecycle or streaming semantics; bolting them on duplicates the runner anyway.
- **Web SSH / terminal in the console**: rejected — full shell with zero structure, no audit trail, no kill semantics, worst possible injection surface. **[Amendment 2026-06-15: Revisited by ADR-078 (VW-828) — that rejection applied to a TCP+basic-auth design; the unix-socket+CSWSH+CSRF+tailnet design adopted in Phase A is a different model and does not inherit this rejection.]**
- **Free-form prompt in v1**: rejected as above; templates first.

## Related

- ADR-061 (provenance chains — run_id linkage), ADR-047 (attribution), VW-725 spec (constraints), VW-730 roadmap doc (`02-Active-Work/Plans/2026-06-12-VW-730-Console-Command-Center-Roadmap.md`)
