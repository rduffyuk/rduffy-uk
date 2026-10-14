---
id: 14
title: "MCP Bridge Authentication Strategy"
status: proposed
recordedStatus: "proposed"
date: 2026-02-12
tags: ["mcp", "security", "authentication", "oauth", "auth0", "cloudflare"]
sourceKind: legacy-record
public: true
journeyId: "2026-02-12-legacy-adr-014-mcp-bridge-authentication-strategy"
---
# ADR-014: MCP Bridge Authentication Strategy

**Status**: Proposed
**Date**: 2026-02-12
**Jira**: VW-67 *(internal reference; destination redacted)*
**Related**: VW-22 (original tunnel exposure), VW-10 (security audit)

---

## Context

The MCP bridge at `mcp.rduffy.uk` was deployed in VW-22 (2026-02-05) to give Claude.ai and mobile access to vault search tools via Cloudflare tunnel. At the time, Claude.ai only supported **authless or OAuth** MCP connectors, and the pragmatic decision was to ship authless with an obfuscated subdomain.

### Current Security Posture

| Layer | Implementation | Effectiveness |
|-------|---------------|---------------|
| Network | Obfuscated Cloudflare subdomain (`REDACTED_PRIVATE_HOST`) | Security by obscurity — URL discovery = full access |
| Application | Read-only tool facade (12 of 15 tools) | Limits blast radius but doesn't prevent data exfiltration |
| Input validation | `@safe_tool` decorator (query length limits) | Prevents injection, not unauthorized access |
| Error masking | Generic error messages | Prevents info leakage, not unauthorized access |
| Audit | stderr tool call logging | Forensic only, no prevention |

### Threat Model

| Threat | Likelihood | Impact | Current Mitigation |
|--------|-----------|--------|-------------------|
| URL discovery (DNS enumeration, traffic intercept, accidental leak) | Medium | High — full vault read access (148K docs) | Obfuscated subdomain only |
| Automated scanning (shodan, censys) | Low | High | None — responds to any HTTP request |
| Credential theft from vault search | Medium (if URL known) | Critical — API keys, infra details in vault | Read-only facade (partial) |

### What Changed Since VW-22

The MCP ecosystem has matured significantly:

- **Claude.ai** now supports full OAuth 2.1 with PKCE + Dynamic Client Registration (DCR)
- **Claude.ai** now allows static client ID + secret (no DCR required)
- **FastMCP 2.12+** ships a built-in `Auth0Provider` class
- **FastMCP 3.0** (Jan 2026) added granular authorization and OpenTelemetry
- **Auth0** published official MCP integration guides

---

## Decision

Implement **defense-in-depth authentication** using two layers:

### Layer 1: Cloudflare Access (Zero Trust Perimeter)

Cloudflare Access sits in front of the tunnel, blocking requests before they reach K3s.

**Policy:**
- **Allow**: Anthropic IP range `160.79.104.0/21` + home IP
- **Bypass**: `/.well-known/*` and `/auth/callback` paths (required for OAuth discovery handshake)
- **Session**: 24-hour duration

**Purpose**: Eliminates automated scanning, DNS enumeration attacks, and casual URL discovery. Even if the URL leaks, only Anthropic infrastructure and your home network can reach the endpoint.

### Layer 2: Auth0 + FastMCP Auth0Provider (Application Identity)

Auth0 provides OAuth 2.1 identity verification — proving the request is from *you*, not just from an allowed IP range.

**Configuration:**
- Auth0 free tier (25K MAU — far exceeds single-user needs)
- Single Regular Web Application with callback URL `https://claude.ai/api/mcp/auth_callback`
- **Sign-ups disabled** — only one pre-created account (Ryan)
- API audience: `https://mcp.rduffy.uk`
- JWT validation via Auth0 JWKS endpoint (RS256, auto key rotation)

**Code change** (~20 lines in `mcp_bridge_readonly.py`):

```python
from fastmcp.server.auth.providers.auth0 import Auth0Provider

auth_provider = Auth0Provider(
    config_url=os.getenv("AUTH0_CONFIG_URL"),
    client_id=os.getenv("AUTH0_CLIENT_ID"),
    client_secret=os.getenv("AUTH0_CLIENT_SECRET"),
    audience=os.getenv("AUTH0_AUDIENCE", "https://mcp.rduffy.uk"),
    base_url=os.getenv("MCP_BASE_URL", "https://mcp.rduffy.uk"),
)

mcp = FastMCP(
    name="ai-memory-bridge-readonly",
    auth=auth_provider,
)
```

**Secrets**: Managed via Sealed Secrets in K3s (AUTH0_CONFIG_URL, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET, AUTH0_AUDIENCE).

### Authentication Flow

```
Claude.ai -> mcp.rduffy.uk
  -> Cloudflare Access: IP in allowlist? -> YES -> pass through
  -> FastMCP: Has valid JWT? -> NO -> return 401
  -> Claude.ai: Discovers OAuth metadata at /.well-known/openid-configuration
  -> Claude.ai: Opens Auth0 login (browser redirect)
  -> Ryan: Authenticates with Auth0 credentials
  -> Auth0: Issues JWT (RS256, includes user claims)
  -> Claude.ai: Attaches JWT to all subsequent MCP tool calls
  -> FastMCP: Validates JWT via Auth0 JWKS -> tool executes
```

### What Stays Unchanged

- Read-only tool facade (12 tools)
- `@safe_tool` input validation
- Error masking
- Audit logging
- Claude Code local access (uses different MCP bridge on port 30002 via NodePort, not through Cloudflare)

---

## Known Risks & Mitigations

Research into the FastMCP + Claude.ai OAuth ecosystem revealed several known issues:

| Risk | Source | Severity | Mitigation |
|------|--------|----------|------------|
| OAuth proxy 5-minute token timeout | [FastMCP #2670](https://github.com/jlowin/fastmcp/issues/2670) | Medium | **Fixed** in recent PR #2796. Pin FastMCP >= fixed version |
| Claude.ai skips DCR, sends stale client_id | [FastMCP #1919](https://github.com/jlowin/fastmcp/issues/1919) | Medium | **Fixed**. Proper 401/invalid_client response triggers re-registration |
| Bearer token not sent after OAuth completion | [MCP spec #2157](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/2157) | High | Intermittent. Rollback plan available (remove auth param) |
| OAuth works in Inspector but fails in Claude.ai | [FastMCP #972](https://github.com/jlowin/fastmcp/issues/972) | Medium | Specific to custom OAuth implementations, not Auth0Provider |
| Cloudflare Access may intercept OAuth flow | Design risk | Medium | Bypass rules for /.well-known/* and /auth/callback |

### Rollback Plan

If Auth0 integration causes issues with Claude.ai:
1. Remove `auth=auth_provider` from FastMCP constructor
2. Rebuild and redeploy container
3. Cloudflare Access still provides perimeter security
4. Back to current security posture (IP restriction only) — strictly better than today

---

## Alternatives Considered

### Alternative 1: Cloudflare Access Only (No Auth0)

- **Pros**: Zero code changes, dashboard-only config
- **Cons**: Uncertain Claude.ai compatibility — Cloudflare Access uses its own auth flow that may conflict with MCP's OAuth spec. Claude.ai expects to negotiate auth with the MCP server directly, not with a proxy layer. Also provides no application-level identity.
- **Rejected because**: Compatibility risk too high, and no way to distinguish *who* is calling from an allowed IP.

### Alternative 2: Custom JWT Middleware (DIY)

- **Pros**: Simple, no external dependencies
- **Cons**: Manual token generation/rotation. Claude.ai has a known bug where it sometimes doesn't send Bearer tokens. No standard OAuth discovery endpoints means Claude.ai may not handle it gracefully. No DCR support.
- **Rejected because**: Fragile, not aligned with MCP spec direction, manual operational burden.

### Alternative 3: Auth0 Only (No Cloudflare Access)

- **Pros**: Simpler — single auth layer
- **Cons**: Every scanner, bot, and curious browser hits the FastMCP OAuth flow. More attack surface for OAuth-specific vulnerabilities (token theft, redirect attacks).
- **Rejected because**: Defense in depth is worth the small extra config effort.

---

## Consequences

### Positive

- **Closes CVSS 9.1 vulnerability** — no more unauthenticated vault access
- **Defense in depth** — two independent auth layers (network + application)
- **Future-proof** — aligned with MCP OAuth 2.1 spec direction
- **Auditable** — JWT claims provide identity in audit logs
- **No infra cost** — Auth0 free tier + Cloudflare free tier
- **Minimal code change** — ~20 lines in one file

### Negative

- **Auth0 dependency** — external SaaS for auth (free tier, but still a dependency)
- **OAuth complexity** — more moving parts than authless
- **Session expiry UX** — Claude.ai must re-auth when JWT expires (configurable in Auth0)
- **FastMCP version coupling** — must stay on >= 2.12.3 for Auth0Provider

---

## Implementation Notes

- **FastMCP version**: Verify current pinned version in `requirements-mcp.txt`, upgrade to >= 2.12.3
- **Subdomain**: Can switch from obfuscated to `mcp.rduffy.uk` since security no longer relies on obscurity
- **Sealed Secrets**: Create new sealed secret for Auth0 credentials using existing kubeseal workflow
- **Testing**: Test with MCP Inspector first, then Claude.ai connector
- **Claude Code**: Unaffected — uses local NodePort 30002, not Cloudflare tunnel

---

### External Links
| Platform | Link |
|----------|------|
| Confluence | ADR-014 *(internal reference; destination redacted)* |
| Jira | VW-67 *(internal reference; destination redacted)* |
