---
id: 61
title: "Developer-Agent Provenance & Cryptographic Attribution"
status: accepted
recordedStatus: "Accepted"
date: 2026-06-05
tags: ["architecture", "provenance", "attribution", "multi-agent", "signing", "trust-boundary", "vw-585"]
sourceKind: source-record
public: true
journeyId: "2026-06-05-adr-061-developer-agent-provenance-cryptographic-attribution-for-ai-authored-commits"
---
# ADR-061: Developer-Agent Provenance & Cryptographic Attribution

**Status**: Accepted (2026-06-05) — Phase 0 + Phase 1 (git surface) shipped.
**Extends**: [ADR-047-LLM-Content-Trust-Boundary](/adrs/047-llm-content-trust-boundary/)
**Extended by**: [ADR-075-Workload-Level-Provenance](/adrs/075-workload-level-provenance/) — adds workload-level trailers (`Automation-Source`/`Automation-Component`) so autonomous-agent commits reveal *which workload* produced them (VW-804, 2026-06-13).
**Jira**: VW-585 (story), VW-584 (Phase-0 bug, Done), under VW-418 umbrella.

---

## 1. Context

Rootweaver is now built by **multiple AI coding agents running concurrently** — Claude Code, Codex (since 2026-06), Hermes — plus local-model services (rag-gateway/sre-brain on vLLM) and direct-API scripts (Haiku, GPT-4). They all produce artifacts: git commits (GitLab/GitHub), vault markdown, Jira issues, memory facts.

**Attribution was broken:**
- Git committer is always `ryanduffy.uk` — no agent/model distinction.
- The VW-393 commit-trailer hook **misattributed under concurrency** (VW-584): it picked the most-recently-modified Claude JSONL by cwd+mtime, so a Codex commit (`codex/vw-580` `bd35da0e`) wore a *Claude* session-id, and concurrent Claude sessions cross-stamped each other.
- Jira carries zero producer identity (every ticket = `ryanduffy.uk`, no agent label).

**Goals** (all four): audit/forensics, trust/review-routing, IP/ownership, and **self-evaluation of models across all sources** (cloud + local + API).

### 1.1 Relationship to ADR-047

ADR-047 governs **input/content trust** — where ingested content *came from* (`trust_level`) drives what an LLM may *do* with it. This ADR adds the **output/producer** half ADR-047 anticipates but does not build: which exact model *produced* an artifact, cryptographically attributable. They share **one canonical provenance record**; the producer is a `{"step":"generate", ...}` entry in ADR-047's `chain[]`. The shared schema (`rootweaver-core/provenance.py`) is co-owned with the Hermes trust-contracts plan (VW-420).

## 2. Decision

A unified provenance **contract** — a versioned schema + identity protocol + per-surface output formats + per-agent key registry — that any tool conforms to. The contract (not shared code) is the product; each surface has a stamper; the verifier validates artifacts, so new tools onboard without verifier changes.

### 2.1 Canonical identity record

`human_owner`, `agent`, `model` (exact, canonical), `provider`, `invocation` (interactive-cli | api | batch), `account_alias` (key/account, never the secret), `endpoint` (cloud API or local host), `run_id`, `ticket`, `ts`; plus Phase-2 `signed_by` + `sig`. Local-model services: `agent` = the service, `model` = the local LLM, sign as the service.

### 2.2 Identity protocol — declare, never guess

- **Interactive harness** (Claude Code): authoritative via `$CLAUDE_CODE_SESSION_ID`. **This is the misattribution fix (VW-584).**
- **Any other conforming tool** (Codex, Hermes, future): declares itself by exporting `AI_AGENT`/`AI_MODEL` (+ optional `AI_RUN_ID`/`AI_PROVIDER`/`AI_ACCOUNT_ALIAS`). Codex does this via `~/.codex/config.toml [shell_environment_policy.set]`.
- **API/programmatic** (Haiku/GPT-4 scripts): stamp from the `model=` param + key alias at call time.
- A canonical model registry (`~/.claude/provenance.toml` `[models]`) normalizes friendly→canonical and rejects vague names (`claude`/`gpt` → `unknown`).

### 2.3 Per-surface stampers (projections of one record)

- **Git** (`~/.claude/scripts/inject-commit-trailers.py`, universal): `Run-Id` + `AI-Agent/AI-Model/AI-Provider/AI-Invocation/AI-Account/Human-Owner` + email-aliased `Co-authored-by: &lt;model&gt; &lt;ryan+<agent&gt;@rduffy.uk>` (forge-rendered, filterable). One hook stamps every agent.
- **Vault md**: `provenance:` frontmatter block (output projection of the rootweaver-core schema; aligns with the radar writer's ADR-047 emitter).
- **Jira**: `agent:&lt;id&gt;` + `model:&lt;canonical&gt;` labels + a `provenance:` comment.

### 2.4 Cryptographic integrity (Phase 2)

Per-agent ed25519 SSH keys (`ryan-human`/`claude-bot`/`codex-bot`/`rootweaver-services`) sign **both** commits (`gpg.format=ssh`) and vault docs (`ssh-keygen -Y sign/verify` + `allowed_signers`). Signature proves *which agent* — upgrading ADR-047's (and Hermes') plain-text `generated_by` to non-repudiable. Service keys via SealedSecret.

### 2.5 Self-evaluation (Phase 3)

Stamped artifacts feed revealed-preference scoring (commit reverted? churn half-life? CI pass? ticket reopened? doc edited-after? retrieval-cited?) → Langfuse **scores grouped by model** → a **model × trust-tier** scorecard (safety-under-untrusted-input), merged with controlled bench (RAGAS/eng_memory_bench). Complements Hermes Task 16 (VW-529).

### 2.6 Content-producing services (NER, RAG synthesis, SRE triage)

Producers are not only interactive coding agents. Platform services that *generate content into durable stores* are first-class producers and stamp the same way:

- **NER auto-tagger** (`ner-consumer`: spaCy `en_core_web_lg` + EntityRuler + YAKE, no LLM — VW-152) writes `ner_*` tags into vault frontmatter (`neural-vault/ner_pipeline.py:update_frontmatter`). It is **trust-blind today** — the gap behind VW-134 (hallucinated entities from prompt-injected context). Required:
  1. **Output stamp** — append a `chain[].generate` step `{step:"generate", agent:"ner-consumer", model:"spacy-en_core_web_lg+yake", ts}` to the doc's `provenance`.
  2. **Input-trust inheritance** (ADR-047 §2.5 taint) — tags derived from `untrusted`/`unknown-legacy` content inherit that level; NER must **not launder** trust. Source trust comes from the file's `provenance.trust_level` (or the `vault.file-events` payload).
- **rag-gateway / sre-brain** (vLLM-served): same pattern — `agent` = the service, `model` = the local LLM, `endpoint` = the serving host.

This is the join with ADR-047's memory-amplification concern (§1.2.5): NER tags flow into embeddings → Qdrant → future memory facts; stamping + trust-inheritance at the NER write-point keeps that chain attributable. NB: `ner-consumer` is a deployed Kafka-consumer service (Harbor image) — this change ships via image rebuild + GitOps, not a hot edit.

## 3. Consequences

- **Positive**: every artifact attributable to an exact model; cross-source model evaluation; the misattribution bug eliminated; new tools onboard by conforming to the contract (no verifier change); IP/ownership trail; integrity once Phase 2 lands.
- **Negative / mitigations**: stampers must never block work (defensive exit-0, inherited from VW-393); per-committer signing-key selection (Phase 2) is fiddly (resolved at `git commit -c user.signingkey=…`); static `AI_MODEL` for Codex needs manual update on model switch; the shared `rootweaver-core/provenance.py` requires field-name reconciliation with Hermes Task 1 before either lands.

## 4. Phasing & status

- **Phase 0** (VW-584, **Done** 2026-06-05): misattribution fix — env-authoritative session resolution; 5 tests; verified.
- **Phase 1** (VW-585, **in progress**): **Shipped + verified** — git stamper (Claude + Codex, 10 tests) + `~/.claude/provenance.toml` contract; Jira `agent:`/`model:` labels (CLAUDE.md rule); Codex `[shell_environment_policy.set]`; **vault frontmatter stamper** (`~/.claude/hooks/vault_provenance_stamp.py`, PostToolUse, fail-open, idempotent — wired in settings.json); this ADR. **Remaining**: `rootweaver-core/provenance.py` schema (Hermes-coordinated, VW-585) and NER producer stamping (VW-586).
- **Phase 2/3**: designed, deferred (signing, eval).

## 5. References

- Plan: `~/.claude/plans/` (Phase 0+1 detail).
- Contract: `~/.claude/provenance.toml`. Hook: `~/.claude/scripts/inject-commit-trailers.py`.
- Extends ADR-047; co-schema with Hermes plan `.hermes/plans/2026-06-04_…rootweaver-trust-contracts-feedback-plan.md` (Task 1/11).
- Standards basis: `Co-authored-by` git convention; C2PA v2.3 + EU AI Act Art. 50 (content marking); SSH signing.
