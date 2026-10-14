---
id: 78
title: "Writable Console Terminal — Socket-Bounded ttyd Supersedes Read-Only Mirror (Phase A)"
status: accepted
recordedStatus: "Accepted"
date: 2026-06-15
tags: ["agent-ops", "rootweaver-console", "security"]
sourceKind: source-record
public: true
journeyId: "2026-06-15-adr-078-writable-console-terminal-socket-bounded-ttyd-supersedes-read-only-mirror-phase-a"
---
# ADR-078: Writable Console Terminal — Socket-Bounded ttyd Supersedes Read-Only Mirror (Phase A)

**Status**: Accepted 2026-06-15 (VW-828 implemented; supersedes ADR-073 §59 writable-terminal rejection and revisits ADR-072 §Alternatives web-SSH rejection)

## Context

ADR-072 (Alternatives, line 108) explicitly rejected "Web SSH / terminal in the console" as "worst possible injection surface" — a sound call for a TCP-exposed, basic-auth-credentialled, full-shell terminal with no audit semantics. ADR-073 §59 carried that position forward: "Read-only tmux/ttyd raw-terminal mirroring is permitted (VW-745); writable web terminals remain rejected."

Between ADR-073 (2026-06-12) and now, three things changed:

1. **The threat model for the original rejection no longer applies.** The rejection was against a raw TCP ttyd with basic-auth exposed to the LAN. The implemented design binds ttyd exclusively to a **Unix domain socket** (`/run/user/1000/agent-ops/ttyd.sock`), removing the TCP listener entirely. No tailnet-reachable TCP port for ttyd exists; no credential in argv (old `ps`-visible basic-auth token eliminated).

2. **Layered CSWSH and CSRF guards were added that did not exist when ADR-072 was written.** The nginx reverse proxy now enforces an Origin allowlist on the WebSocket upgrade (keyed to the terminal's own origin `:30814`), and a CSRF guard (Origin header + custom `X-Requested-By: console` header) protects the mutating `/api/agent/` surface. These are defences-in-depth on top of the tailnet boundary.

3. **Operational need.** The read-only mirror (VW-745) proved that phone/tablet/laptop access to the Claude session was viable and valuable. Read-only is sufficient for observation but not for answering tool-approval prompts, typing follow-up instructions mid-session, or operating from a device without a full development environment. Making the terminal writable is the minimum increment to fulfil the "primary driver" use case.

The combination of unix-socket boundary, nginx CSWSH guard, CSRF protection, trusted-proxy header (`-H X-Console-User`), and the hardened tailnet (kube-proxy `nodeport-addresses=REDACTED_PRIVATE_IP/32`, so NodePorts are tailnet-only) constitutes a materially different security posture than the scenario ADR-072 rejected.

## Decision

Allow a writable browser terminal, implemented as follows:

### Component changes (Phase A, VW-828)

1. **ttyd host service** (`~/.config/systemd/user/agent-ops-terminal.service.d/vw822-tabs.conf`):
   - Binds to Unix domain socket `/run/user/1000/agent-ops/ttyd.sock` (was TCP `REDACTED_PRIVATE_IP:7681`).
   - Flags: `-W` (writable), `-O` (check-origin), `-H X-Console-User` (trust the `X-Console-User` proxy header; no credential in argv).
   - `RuntimeDirectory=agent-ops` (mode 0711); ExecStartPost `chmod 0666` on the socket (cross-uid connect from nginx worker uid → rduffy uid 1000 requires world-readable socket; single-user host, accepted).

2. **tmux attach script** (`~/.claude/agent-ops/claude-tmux-attach.sh`):
   - Dropped `-r` (read-only flag); now attaches writable.

3. **Console nginx** (`services/rootweaver-console/nginx.conf.template`):
   - `proxy_pass http://unix:/run/ttyd/ttyd.sock` (hostPath mount).
   - Injects `X-Console-User: rootweaver` on every proxied request.
   - WebSocket upgrade block enforces Origin allowlist (`:30814` only) — CSWSH defence.
   - `frame-ancestors` tightened to exact `http://REDACTED_PRIVATE_IP:30813` (no wildcard).
   - CSRF guard on `/api/agent/` (Origin + `X-Requested-By: console`).

4. **GitOps console Deployment** (`rootweaver-gitops/infrastructure/rootweaver/rootweaver-console-deployment.yaml`):
   - hostPath volume: `/run/user/1000/agent-ops` → `/run/ttyd` (dir 0711 / socket 0666).
   - Removed dead `TERMINAL_BASIC_AUTH` env var.
   - Image tag bumped to `vw828-writable-76e97512`.

5. **Host-level gate** (not gitops; applied once): kube-proxy `nodeport-addresses=REDACTED_PRIVATE_IP/32` — NodePorts 30813 (console) and 30814 (terminal origin) are tailnet-reachable only.

### Security model (Phase A)

| Layer | Mechanism |
|---|---|
| Network | NodePorts 30813/30814 reachable only on tailnet IP (kube-proxy `nodeport-addresses`) |
| Socket boundary | ttyd binds Unix socket only; no TCP listener |
| Identity | Tailnet mesh = human-auth layer (Phase A); no per-user credential inside the terminal |
| WebSocket origin | nginx Origin allowlist on WS upgrade; ttyd `-O` (check-origin) |
| Frame embedding | `frame-ancestors http://REDACTED_PRIVATE_IP:30813` (exact; no wildcard) |
| Proxy header | ttyd `-H X-Console-User`; header present → 200, absent → 407 |
| CSRF (mutating) | Origin + `X-Requested-By: console` required on `/api/agent/` routes |
| tmux scope | Named session attach (implicit allowlist: only the pre-existing claude session) |
| Audit | Hook-events JSONL (ADR-073 §4 PostToolUse logger) + launches.jsonl (ADR-072) |

### Accepted Phase A residuals

- **Tailnet-as-identity**: Any tailnet device belonging to the account can reach the terminal. There is no per-request credential distinguishing Ryan from a compromised tailnet peer. Accepted: the tailnet itself requires device approval.
- **Socket 0666**: World-readable socket on the host means any local user (uid on the single-user desktop) could connect directly to ttyd, bypassing nginx guards. Accepted for a single-user desktop.
- **Self-editable audit log**: `launches.jsonl` and `hook-events.jsonl` live on the same host; an operator could tamper with them. Accepted at this stage — audit is for debugging, not forensic integrity.
- **No rate-limiting**: The `/api/agent/` surface has CSRF guards but no rate limit. Accepted at Phase A scale.

### Phase B exit (future, not yet scheduled)

Replace the FastAPI agent-ops backend with a purpose-built authenticated backend providing: server-validated session cookies, properly managed CSRF tokens, per-session permission scopes, rate limiting, and keystroke-level tamper-resistant audit. Cloudflare Access may be added as an additive identity door over the tailnet gate. Phase B removes all residuals listed above.

## Consequences

- The rootweaver console terminal becomes fully writable from phone/tablet/laptop — the operator can steer, answer tool-approval prompts, and type mid-session from any tailnet device.
- ADR-073's read-only posture for web terminals is superseded. ADR-072's session-runner, template gating, cap/timeout/kill-switch model, and everything else in both ADRs remain in force.
- The original ADR-072 rejection ("Web SSH / terminal in the console") is now revisited: the objections applied to a TCP+basic-auth model; the unix-socket+CSWSH+CSRF+tailnet model is a different design that does not inherit those objections.
- A Phase B roadmap item is created to harden identity (server-validated auth, rate-limiting, tamper-resistant audit) once the Phase A writable terminal proves operationally stable.

## Alternatives considered

- **Maintain read-only mirror only**: Viable but insufficient for the "primary driver" use case. Answering tool-approval prompts from a phone requires writability.
- **Re-expose TCP ttyd with mutual TLS**: More complex certificate management, still exposes a TCP listener, harder to revoke per-session. Unix socket + nginx proxy has better operational ergonomics.
- **SSH from phone**: Requires an SSH client app and key management on every device. The browser-native terminal (ttyd + PWA) is the intended UX.

## Supersedes / Amends

- **Supersedes ADR-073 §59** ("writable web terminals remain rejected") — this decision reverses that position, constrained to the Phase A security model above.
- **Revisits ADR-072 §Alternatives** ("Web SSH / terminal in the console: rejected — full shell with zero structure, no audit trail, no kill semantics, worst possible injection surface") — that rejection applied to a raw TCP+basic-auth design. The unix-socket+CSWSH+CSRF design is not that design. ADR-072 otherwise remains Accepted and in force.

## Related

ADR-072 (agent-ops console, template-gated sessions), ADR-073 (interactive agent sessions, audit model), ADR-061 (run_id provenance), VW-828 (implementation), VW-822 (writable terminal feature), VW-747 (console networking), VW-735 (agent-ops module). Design docs: `02-Active-Work/Plans/2026-06-15-writable-console-terminals-phase-a.md`, `02-Active-Work/Plans/2026-06-15-writable-console-step2-3-edit-set.md`. LLD detail: LLD-07-Infrastructure-Services *(internal reference; not included)* §20.
