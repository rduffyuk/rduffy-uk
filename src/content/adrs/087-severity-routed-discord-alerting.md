---
id: 87
title: "Severity-Routed Discord Alerting via Self-Built masgustavos Forwarder"
status: accepted
recordedStatus: "Accepted"
date: 2026-06-27
tags: ["alerting", "observability", "discord", "gitops"]
sourceKind: source-record
public: true
journeyId: "2026-06-27-adr-087-severity-routed-discord-alerting-via-self-built-masgustavos-forwarder"
---
# ADR-087: Severity-Routed Discord Alerting via Self-Built masgustavos Forwarder

**Status:** Accepted · **Date:** 2026-06-27 · **Ticket:** VW-1031 (follows VW-1029)

## Context

Alertmanager (`monitoring` ns, NodePort 30903) delivers alerts to Discord ("rduffy labs"
guild `391499950732607489`). Previously **all** severities — critical, warning, info — were
forwarded by `benjojo/alertmanager-discord:latest` into a single `#alertmanager` channel as
plain, uncoloured messages. Problems:

1. **No severity separation** — a page-worthy `critical` was visually indistinguishable from
   minor `warning`/`info` noise in one undifferentiated stream.
2. **Unmaintained forwarder** — the benjojo image's last release is ~2022-08; no embed
   styling, no multi-channel support.
3. **Plaintext secret** — the Discord webhook URL was committed in cleartext in the
   deployment manifest (`alertmanager.yaml`).

Ryan (visual-first preference) asked for colour-coded, per-severity routing.

## Decision

Adopt **`masgustavos/alertmanager-discord`** as the forwarder, configured for
**severity-based multi-channel routing** with colour/emoji embeds.

Because masgustavos publishes **no Docker image** (its compose builds from `Dockerfile`),
we **build from source and host in Harbor**: `REDACTED_PRIVATE_IP:30500/rootweaver/alertmanager-discord:v1`
(scratch-based Go binary, ~stable). The desktop K3s node already has Harbor creds in
`registries.yaml`, so no `imagePullSecret` is needed.

**Routing topology** (Alertmanager selects the Discord channel via the forwarder's URL path):

| Severity | Alertmanager receiver | Forwarder path | Discord channel | Embed |
|---|---|---|---|---|
| critical | discord-critical | `:8080/critical` | `#alerts-critical` | 🔴 red |
| warning  | discord-warning  | `:8080/warning`  | `#alerts-warning`  | 🟠 gold |
| info / unmatched | discord-default | `:8080/default` | `#alertmanager` | 🔵 blue |

The forwarder's channel→webhook map + per-severity colour/emoji live in masgustavos
`config.yaml`, stored as a **SealedSecret** (`alertmanager-discord-config`, monitoring ns) —
fixing the plaintext-webhook issue. Both deployments carry `reloader.stakater.com/auto: "true"`
so a config/secret change auto-restarts the pods. The existing `sre-agent` receiver
(`continue: false` catch) is preserved unchanged.

## Consequences

**Positive:** severity-separated, colour-coded alerts; webhooks no longer in cleartext;
clean literal-block Alertmanager config (was an escaped one-liner); maintained-fork features
(priority ordering, optional role mentions) available.

**Negative / trade-offs:**
- **We now own a custom image** built off a third party's `master` — no upstream image
  updates; rebuild is manual (documented in VW-1031). Pinned to `:v1` (not `:latest`).
- Routing correctness depends on the `severity` label being present and one of
  `critical|warning|info`; anything else falls to `#alertmanager` via the default receiver.

**Neutral / follow-ups:**
- The `sre-agent` receiver targeted `sre-event-collector.rootweaver`, but the `rootweaver`
  namespace was deleted (ADR-080 / VW-858) — it was silently dead-lettering. **Fixed in VW-1032**:
  re-pointed to `sre-event-collector.rw-sre:8090` (collector moved during the rw-* decomposition;
  rw-sre NetworkPolicy already allowed `monitoring → 8090`). Verified collector receiving
  `POST /webhooks/alertmanager → 200`.
- Optional: add a Discord role + `severitiesToMention` so criticals @-ping (deferred).

## Alternatives considered

- **Keep benjojo, route via Alertmanager to N instances** (one per channel). No build, but N
  deployments and still no embed styling. Rejected — Ryan wanted the visual upgrade.
- **klenkes74 fork** (has a Helm chart). Not evaluated in depth; masgustavos's per-severity
  embed model fit the requirement directly.
- **Apprise / ntfy.** Larger re-platform; ntfy better for true on-call escalation (no
  ack/escalation in Discord) — noted for future, not this change.

## Verification

Kustomize build + embedded-config YAML validated pre-merge. Post-reconcile: fire synthetic
alerts per severity via `~/.claude/mcp-servers/discord-ops/fire-test-alert.sh --pipeline -s &lt;sev&gt;`
and confirm each lands in the correct channel with the correct colour.
