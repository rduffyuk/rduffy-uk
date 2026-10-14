---
id: 15
title: "Matrix Accessibility Layer Architecture"
status: proposed
recordedStatus: "Proposed"
date: 2026-02-15
tags: ["matrix", "messaging", "accessibility", "mcp"]
sourceKind: legacy-record
public: true
journeyId: "2026-02-15-legacy-adr-015-matrix-accessibility-layer-architecture"
---
# ADR-015: Matrix Accessibility Layer Architecture

**Status**: Proposed
**Date**: 2026-02-15
**Jira**: VW-73

## Context

The Rootweaver platform is currently accessible only via desktop interfaces — Claude Code CLI and Claude.ai (via Cloudflare tunnel). There is no mobile access, no push notifications for journal completions or system alerts, and no way to query the vault from a phone or messaging app.

Comparison with OpenClaw (Clawdbot) revealed that an accessibility layer via messaging apps is the most impactful missing capability. OpenClaw's omni-channel messaging (WhatsApp, Telegram, Discord) allows users to interact with their AI assistant from anywhere. However, OpenClaw routes queries through third-party infrastructure and lacks Rootweaver's depth in semantic search, forensic tracing, and GitOps-managed deployment.

The key requirements are:
- **Mobile query access** to the vault via natural language
- **Push notifications** for journal summaries and system alerts
- **Data privacy** — self-hosted, no third-party AI processing
- **Forensic tracing** — every query logged in existing audit trail
- **GitOps deployment** — consistent with platform conventions

## Decision

Deploy a **self-hosted Matrix (Synapse) homeserver** on K3s with **mautrix bridges** to WhatsApp, Telegram, and Discord. Build a **rootweaver-matrix-bot** as a Matrix Application Service that routes all queries through the **existing MCP Bridge** (Streamable HTTP) for full forensic tracing.

### Architecture

```
WhatsApp / Telegram / Discord / Element
         ↓ (mautrix bridges)
    Synapse Homeserver (matrix namespace)
         ↓ (appservice API)
    rootweaver-matrix-bot
         ├── MCP Client → MCP Bridge (:30002) → RAG Gateway
         └── Kafka Consumer → journal.output → push to Matrix room
```

### Key Components

| Component | Purpose | Image |
|-----------|---------|-------|
| Synapse | Matrix homeserver | `matrixdotorg/synapse` |
| PostgreSQL | Shared database server (4 DBs) | `bitnami/postgresql` |
| mautrix-whatsapp | WhatsApp bridge | `dock.mau.dev/mautrix/whatsapp:v25.12.0` |
| mautrix-telegram | Telegram bridge | `dock.mau.dev/mautrix/telegram:v25.10.0` |
| mautrix-discord | Discord bridge | `dock.mau.dev/mautrix/discord:v0.7.5` |
| rootweaver-matrix-bot | MCP client + Kafka consumer | Custom (Harbor) |
| Element Web | Browser Matrix client | `vectorim/element-web` |

### Why MCP-Native (Not Direct HTTP to RAG Gateway)

Three approaches were evaluated:

1. **Matrix Appservice → RAG Gateway (direct HTTP)**: Simplest, but creates a second query path without forensic tracing
2. **Webhook Relay Bot**: Familiar pattern, but requires separate webhook auth and polling-based Matrix sync
3. **MCP-Native Bridge (selected)**: Bot speaks MCP to existing bridge. Every query hits the same audit log, auth layer, and tool catalog as Claude Code and Claude.ai

The MCP-native approach was selected because:
- **Single pane of glass**: One audit trail for all clients (Claude Code, Claude.ai, mobile)
- **Zero tool duplication**: All 12 MCP tools instantly available to mobile
- **Future-proof**: New tools auto-available without bot changes
- **Proven infrastructure**: MCP Bridge already handles Streamable HTTP, OAuth, rate limiting

## Consequences

### Positive

- **Mobile access** to vault search from WhatsApp, Telegram, Discord, Element
- **Push notifications** for journal summaries via Kafka consumer
- **Maximum privacy** — all data stays on self-hosted infrastructure
- **Consistent tracing** — every mobile query has the same audit trail as desktop
- **Extensible** — new bridges, write actions, and triggers can be added incrementally
- **Element Web** provides a pure-Matrix fallback independent of any bridge

### Negative

- **Resource cost**: ~2.4GB RAM requested, 60GB PVC across 7 new pods
- **Operational complexity**: 7 new pods to monitor, Synapse + 3 bridges + bot + PostgreSQL + Element
- **WhatsApp session management**: Phone must connect every 12 days or bridge session expires
- **Synapse weight**: Heavier than Conduit/Dendrite, but necessary for mautrix bridge compatibility
- **No federation**: Intentionally disabled for privacy, limits future Matrix interop

### Risks

- **Bridge stability**: mautrix bridges can disconnect on platform updates (WhatsApp app updates, Discord API changes)
- **PostgreSQL single point**: All 4 databases on one instance — if PostgreSQL fails, everything stops
- **Synapse backoff**: If bot or bridge is down >5 minutes, Synapse backs off appservice delivery

### Mitigations

- Resource limits on all pods to prevent memory leaks (learned from VW-51/52)
- StatefulSet with replicas: 1 for all bridges (documented requirement)
- Sealed Secrets for all credentials via existing kubeseal workflow
- NetworkPolicies following existing default-deny pattern
- Kafka consumer uses manual offset commit (learned from VW-62)

## Alternatives Considered

### 1. Telegram Bot (Direct, No Matrix)

- **Pros**: Simpler (1 pod, 1 API), fastest to deploy
- **Cons**: Single platform, no self-hosted privacy guarantees, no bridge to WhatsApp/Discord
- **Rejected**: User primarily uses WhatsApp, needs multi-platform

### 2. Discord Bot (Extend Existing)

- **Pros**: Already using Discord for AlertManager
- **Cons**: Heavy mobile app, no WhatsApp bridge, less convenient for quick queries
- **Rejected**: Discord mobile UX not ideal for quick interactions

### 3. Conduit Homeserver (Instead of Synapse)

- **Pros**: ~50-100MB RAM vs 1-2GB, Rust-based, fast startup
- **Cons**: Less mature bridge compatibility, smaller community, fewer battle-tested deployments
- **Rejected**: Bridge compatibility more important than RAM savings given 62GB available

### 4. OpenClaw Integration (Instead of Custom Bot)

- **Pros**: 5,700+ community skills, proven omni-channel
- **Cons**: No self-hosting guarantee, no MCP integration, no forensic tracing, early security issues
- **Rejected**: Doesn't integrate with existing MCP infrastructure or privacy model

## Port Allocations

| Service | NodePort |
|---------|----------|
| Synapse (client API) | 30448 |
| Element Web | 30449 |

## Related

- **VW-22**: MCP Bridge Cloudflare tunnel exposure (original external access work)
- **ADR-014**: MCP Bridge Authentication Strategy
- **VW-62**: Kafka consumer reliability patterns (journal pipeline)
- **VW-51/52**: Memory leak prevention (resource limits)
