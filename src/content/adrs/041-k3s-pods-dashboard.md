---
id: 41
title: "K3s Pods Dashboard Architecture"
status: accepted
recordedStatus: "accepted"
date: 2026-02-02
tags: ["architecture", "dashboard", "k3s", "cloudflare"]
sourceKind: source-record
public: true
journeyId: "2026-02-02-adr-041-k3s-pods-dashboard-architecture"
---
# ADR: K3s Pods Dashboard Architecture

**Date**: 2026-02-02
**Status**: Accepted
**Decision Makers**: Ryan Duffy

## Context

Need for real-time visibility into the K3s cluster state from any device. Existing options (kubectl, K9s, Lens) require CLI access or desktop apps. Grafana dashboards lack pod-level detail and interactivity.

### Requirements

1. View all pods across namespaces with status indicators
2. Access from MacBook, Desktop, and mobile (via Cloudflare)
3. Show meaningful pod descriptions (not just "Pod in X namespace")
4. Interactive drill-down for pod details
5. Pure black theme matching existing dashboards
6. Minimal resource footprint

## Decision

Implement a **static HTML + REST API** architecture:

| Component | Technology | Port |
|-----------|------------|------|
| **Frontend** | Static HTML/CSS/JS served by nginx | 30654 |
| **API** | FastAPI (Python) with kubectl subprocess | 30655 |
| **Hosting** | K3s Deployments in rootweaver namespace | - |
| **External Access** | Cloudflare Tunnel + Zero Trust | - |

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Edge                          │
│  pods.rduffy.uk ─────► Zero Trust Auth                      │
│  pods-api.rduffy.uk ─► Tunnel                               │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    K3s Cluster                               │
│  ┌─────────────────┐       ┌─────────────────┐              │
│  │ arch-viz-frontend│       │ cluster-info-api │             │
│  │ (nginx:alpine)   │       │ (FastAPI)        │             │
│  │ Port: 30654      │◄─────►│ Port: 30655      │             │
│  │                  │  API  │                  │             │
│  │ /dist/*.html     │ calls │ kubectl + nvidia │             │
│  └─────────────────┘       └─────────────────┘              │
│         ▲                           │                        │
│         │                           ▼                        │
│    hostPath mount            K8s API + nvidia-smi            │
│    REDACTED_WORKSPACE/.../dist/                                        │
└──────────────────────────────────────────────────────────────┘
```

### Key Design Choices

1. **Static HTML over SPA framework**: No build step, instant updates by editing files, minimal bundle size (~27KB)

2. **Separate API service**: Decouples data fetching from presentation, enables API reuse

3. **hostPath volume mount**: Allows live file updates without rebuilding images (files in `/dist/` served directly)

4. **Auto-environment detection**: JavaScript detects `*.rduffy.uk` hostname and switches API endpoints automatically

5. **50+ pod metadata entries**: Rich descriptions, icons, and tags in `POD_METADATA` dictionary

## Alternatives Considered

### 1. Kubernetes Dashboard (Official)

| Aspect | Kubernetes Dashboard | Our Solution |
|--------|---------------------|--------------|
| Setup complexity | High (RBAC, certs) | Low (nginx + FastAPI) |
| Customization | Limited | Full control |
| Resource usage | ~200MB RAM | ~64MB RAM |
| Theming | Light theme only | Custom pure black |
| Pod descriptions | Generic | 50+ custom descriptions |

**Rejected**: Too heavy, limited customization, doesn't match aesthetic.

### 2. Grafana with Kubernetes Plugin

| Aspect | Grafana | Our Solution |
|--------|---------|--------------|
| Pod drill-down | Limited | Full side panel |
| Real-time status | Via Prometheus | Direct kubectl |
| Custom icons | ❌ | ✅ Per-namespace/pod |
| Click interactions | Chart zoom only | Pod selection + details |

**Rejected**: Grafana excels at metrics, not pod management UX.

### 3. React/Vue SPA

| Aspect | SPA | Static HTML |
|--------|-----|-------------|
| Build step | Required | None |
| Bundle size | 200KB-1MB | 27KB |
| Update workflow | Build → Deploy | Edit → Done |
| Dependencies | npm packages | Zero |

**Rejected**: Over-engineered for this use case.

## Consequences

### Positive

- **Fast iteration**: Edit HTML/CSS, instantly reflected (hostPath mount)
- **Low overhead**: nginx:alpine (~5MB) + Python API (~50MB)
- **Full customization**: Theme, icons, descriptions all controllable
- **Multi-device access**: Cloudflare Tunnel enables secure mobile access
- **Zero Trust ready**: Single checkbox to add authentication

### Negative

- **Manual metadata**: Pod descriptions must be added to `POD_METADATA` dict
- **No hot reload**: Browser refresh required after file edits
- **kubectl dependency**: API pods need kubectl access (ServiceAccount)

### Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| kubectl API abuse | Rate limiting, read-only operations only |
| Stale data | 5-second polling interval |
| Cloudflare dependency | Tailscale access as fallback |

## Implementation Details

### File Locations

```
arch-viz-frontend/
├── public/          # Source files (edit these)
│   └── k3s-pods-interactive.html
├── dist/            # Served files (nginx mounts this)
│   └── k3s-pods-interactive.html
└── cluster-info-api/
    └── main.py      # FastAPI with POD_METADATA
```

**Important**: Edit `public/`, then copy to `dist/` for changes to take effect.

### Access URLs

| Environment | Dashboard | API |
|-------------|-----------|-----|
| Cloudflare | REDACTED_PRIVATE_URL | REDACTED_PRIVATE_URL |
| Tailscale | http://REDACTED_PRIVATE_IP:30654 | http://REDACTED_PRIVATE_IP:30655 |

### Security

- `pods.rduffy.uk`: Protected by Cloudflare Zero Trust
- `pods-api.rduffy.uk`: Public (returns non-sensitive cluster metadata)
- Tailscale access: Private mesh network only

## Related Documents

- 2026-02-02-K3s-Pods-Dashboard *(internal reference; not included)* - Full documentation
- Environment-Cheatsheet *(internal reference; not included)* - Port reference
- System-High-Level-Design-hld *(internal reference; not included)* - HLD Section 2.5
