---
id: 67
title: "Dual-Audience HTTP API Contract (LLM-First Conventions)"
status: proposed
recordedStatus: "Proposed"
date: 2026-06-10
tags: ["api-design", "rag-gateway", "llm-agents", "openapi"]
sourceKind: source-record
public: true
journeyId: "2026-06-10-adr-067-dual-audience-http-api-contract-llm-first-conventions"
---
# ADR-067 — Dual-Audience HTTP API Contract (LLM-First Conventions)

**Status:** Proposed — 2026-06-10 (drafted for Ryan's review; companion ADRs: ADR-068 memory API, ADR-069 diagnostics API)
**Decision drivers:** VW-695/VW-696 design research (two evidence passes, 2026-06-10); platform API surface review showing 40+ organically-grown gateway routes with no platform-wide contract.

## Context

The platform is about to grow new HTTP surfaces (memory API VW-695, diagnostics API VW-696, selective innovation endpoints) consumed by **two audiences**: human-facing clients (Rootweaver Console, scripts, curl) and **LLM agents — the primary consumer** (Claude Code via mcp-bridge, future agents via direct HTTP). No platform-wide API contract exists; rag-gateway's 40+ routes grew organically with inconsistent error shapes and no versioning policy beyond the `/v1` prefix.

Evidence (full citations in `02-Active-Work/Plans/2026-06-10-VW-695-Memory-API-Design.md`):

- **Human-facing**: controlled experiment (N=105) — REST design-rule violations significantly worsen comprehension for 11/12 rules (Bogner/Kotstein/Pfaff, EMSE 2023). Delphi study (Kotstein & Bogner 2021): only 28/82 rules rated high-importance, concentrated in URI design + HTTP verb/status-code correctness; Richardson maturity L2 critical, L3/HATEOAS low value. Consistent error-response structure is in the highest-impact rule cluster.
- **LLM-facing**: interface design alone moved SWE-bench resolve 3.8%→12.5% (SWE-agent ACI). Tool/option count degrades model accuracy past ~10–20 similar choices. Anthropic production evals: concise response variants (~⅓ tokens), semantic identifiers over UUIDs, actionable error strings, pagination defaults — each measurably improves agent task success. BFCL: models are weak at cross-turn memory → responses must be self-contained. Spider 2.0: frontier models solve only 10–21% of real enterprise text-to-SQL → free-form query languages are unreliable agent interfaces.

## Decision

Adopt the following **ten conventions (C1–C10) as the platform HTTP API contract**. They are mandatory for all new API surface and retrofitted opportunistically to existing routes (error schema first).

- **C1 — Richardson Level 2, no HATEOAS.** Plural-noun resources, no verbs/CRUD names in URIs, correct HTTP methods and status codes (201+`Location` on create, 204 for intentionally-empty, 401 vs 403 distinguished, 500 for malfunction). Never an error payload inside a 200.
- **C2 — One error schema: RFC 9457 `application/problem+json`** via a shared FastAPI exception handler, extended with a `hint` field containing actionable, agent-readable guidance (valid enum values, example correct call, suggested next query).
- **C3 — `response_format=concise|detailed`** on every list/read endpoint. Concise = semantic ID, title, score, date (default for agent flows); detailed = full provenance/metadata for downstream calls.
- **C4 — Semantic identifiers as public IDs** (slugs like `vw-664-vault-git-authority`), never raw row UUIDs.
- **C5 — Pagination + defaults everywhere**: `limit` (default 50, max 200), offset or cursor; all filters optional with sane defaults — a bare GET must return something useful.
- **C6 — Stateless, self-contained responses**: echo the effective query/filters/time-window in the response envelope so agents need not remember prior turns.
- **C7 — Integer URI versioning, major-only** (`/v1` → `/v2` mounted alongside on breaking change). For internal-only consumers, deliberate break-and-fix is permitted; **behavioral** breaking changes (same schema, changed semantics) MUST be changelogged even though the spec is unchanged.
- **C8 — OpenAPI is the single source of truth**: FastAPI-generated spec linted with Spectral in CI; Schemathesis property tests run against the live spec; consumers follow Tolerant Reader.
- **C9 — No free-form query languages on agent-facing endpoints** (no SQL/PromQL/Cypher passthrough). Typed, parameterized endpoints only. Existing `POST /v1/vault/query` stays flag-gated for human use and must not be extended for agents.
- **C10 — Token budgets are a contract feature**: responses pre-filtered/pre-aggregated server-side; no raw telemetry, full-document dumps, or unbounded lists. Where a large result is legitimate, it must be paginated and offer a concise format.

## Consequences

**Positive:** one contract serves console, scripts, and agents; measurable agent-accuracy levers (C2–C6, C9, C10) are baked in rather than per-endpoint folklore; CI enforcement (C8) replaces review-time vigilance; MCP layer can stay a thin adapter (cf. ADR-057, ADR-068).

**Negative / costs:** retrofitting the error schema across existing gateway routes is a real (if mechanical) effort; `response_format` doubles response-shape test cases; Spectral/Schemathesis add CI time (~1–2 min); semantic slugs require a slug-generation/uniqueness rule in each domain.

**Non-goals:** HATEOAS, GraphQL, gRPC (revisit only with a concrete consumer need); auth design (tracked separately — Kong key-auth per the approved EIP gateway decision, VW-684 keeps gateway auth env-gated until then).
