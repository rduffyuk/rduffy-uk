---
id: 63
title: "Dreaming Enrich Re-Extraction — Hardened Two-Phase Memory Re-Mining with Supersede Gate"
status: proposed
recordedStatus: "Proposed"
date: 2026-06-07
tags: ["memory", "dreaming", "extraction", "prompt-injection", "supersede", "bitemporal"]
sourceKind: source-record
public: true
journeyId: "2026-06-07-adr-063-the-dreaming-loop-self-curating-typed-memory"
---
# ADR-063: Dreaming Enrich Re-Extraction — Hardened Two-Phase Memory Re-Mining with Supersede Gate

## Status

**Proposed** (2026-06-07). The pipeline below is **built and validated end-to-end in dry-run** (no DB
writes). The pipeline *architecture*, *security model*, *prompt*, *schema additions*, and *supersede
mechanism* are decided. The *production engine* (Opus vs Sonnet, host-launchd vs K8s) and the *write-path*
(applying decisions to `memory.facts`) are **deferred** to follow-ups (see Open Items). Sibling to the
unbuilt VW-480 (consolidate half).

## Context

Anthropic's "dreaming" (Claude Managed Agents) does two things: **enrich** (re-read transcripts to recover
facts the original pass missed) and **consolidate** (merge dupes, drop stale). VW-480 covers consolidate;
this ADR is the **enrich** half (VW-618).

Our memory subsystem extracts typed facts from Claude Code session JSONL once at ingest via a
**`gpt-4o-mini`** first pass (`source_model_version` confirms; NOT the local vLLM — that's the journal E2A
pipeline, HLD-04). Code-verified problem: the first pass is **duplicate-heavy and low-fidelity**. Concrete
evidence (session `feea4678`): 22 stored facts included bare `tool_use` stubs ("Perplexity Sonar Pro",
"VADER", "FinBERT") **duplicated across the v1 and v2 mini runs**, and thin decisions ("Chose IBKR for trade
execution") with no rationale. A pilot Opus re-read of the same sessions recovered the *specifics* the mini
dropped — ports, CVEs, version pins, the **why** behind a choice.

Two problems surfaced during the pilot that shape this decision:
1. **Transcript injection.** The transcript contains `USER:`/`ASSISTANT:` turns with real instructions.
   Piping it into a less-steered model (Sonnet) caused **hijacking on 2 of 5 sessions** — it *performed the
   embedded task* / continued the session (6 and 13 turns) instead of extracting. This is ADR-047's trust
   boundary, concrete: the transcript is untrusted, instruction-bearing data.
2. **The gate must supersede, not net-new-only.** The re-read mostly produces *better versions of existing
   facts*, so a "drop if similar" novelty gate would discard the richer version — backwards.

Prompt + schema guidance is grounded in salvaged research (search phase of `wf_95afa971-433`); full cites in
2026-06-07-VW-618-Memory-Extraction-Prompt-and-Schema-Research *(internal reference; not included)*; pilot detail in
2026-06-06-VW-618-Dreaming-Enrich-Reextract-Design *(internal reference; not included)*.

## Decision

Adopt a **three-stage hardened dream-enrich pipeline**, offline/idle (Letta sleep-time model), never on the
query hot path.

### 1. EXTRACT — hardened `claude -p`
- Engine: `claude -p`, model **Opus** as the robust default (Sonnet permitted *only* with the hardening
  below — see Alternatives C). Flags: `--allowedTools ""` (no built-in tools), `--strict-mcp-config` with no
  `--mcp-config` (no MCP servers), `--system-prompt` (REPLACE the agentic identity with a pure extractor),
  `--output-format json`, `--max-budget-usd` (runaway cost cap). No `--max-turns` (absent in CLI 2.1.167) —
  unnecessary, because with zero tools a hijacked model can only emit text.
- **Role separation (StruQ):** extraction rules + schema live in the *system* role; the transcript goes in
  the *user* role inside an **unguessable-nonce data block**, with the nonce stripped from the transcript
  first (separator-spoof guard). Spotlighting *datamarking* is available but **OFF by default** (it corrupts
  `source_span` verbatim quotes, and no-tools already makes a hijack inert).
- Prompt (research-backed): **atomic-with-context** facts (not bare atoms), **salience 1–10** (Generative
  Agents), explicit keep/discard criteria, **few-shot positive + negative** examples (Mem0 docs).
- **Output validation:** post-pass drops any fact that is malformed, out-of-enum, or missing required keys
  (defense-in-depth per OWASP — a hijack cannot produce side effects, only invalid JSON that is discarded).
- **Validated:** an adversarial transcript (instructing shell commands + output override) run on Sonnet →
  `turns=1`, zero side effects, valid JSON; the model recorded the attack *as a fact*.

### 2. GROUND — fuzzy source-span check (WARN)
- Each fact carries a `source_span`. Grounding = fraction of the span's **distinctive content tokens**
  (words/numbers/identifiers minus stopwords) present in the transcript; **threshold 0.6**.
- **WARN, not a hard gate** (for now): free-form `claude -p` *paraphrases* spans (exact-substring grounded
  only 1/9; fuzzy grounds 9/9 real, flags fabricated spans at 0.08 — wide separation). langextract-style
  verbatim grounding needs constrained decoding we don't have. Promote to a gate after the write-path exists.

### 3. RECONCILE — supersede gate (Mem0 ADD/UPDATE/NOOP/DELETE)
- For each candidate, retrieve top-k most-similar existing `memory.facts`, then a **second hardened
  `claude -p`** call decides **ADD** (net-new) / **UPDATE** (candidate is materially richer → supersede the
  neighbor) / **NOOP** (existing equal-or-better) / **DELETE** (candidate contradicts → existing stale).
- Matching: **content-token Jaccard** in v1 (free, embedder-independent); **vector ANN on `embedding`**
  (Zep-style) in production once the embedder is up (ADR-059 context).
- **Supersede is non-destructive:** invalidate-not-delete via the existing **bitemporal `t_invalid` +
  `fact_corrections`** columns (Zep pattern). Recovered facts tagged `source='dream-reextract'` +
  `source_model_version` + `dream_run_id` + originating round/session.
- **Validated** (feea4678, 9 candidates vs 22 existing): 7 ADD / 1 UPDATE / 1 NOOP, reasoning verified sound
  (distinguished "rationale-for-X" from "absence-of-X", and rich fact from bare stub).

### Schema additions to `memory.facts`
Keep all current columns (the bitemporal `t_valid`/`t_invalid` are Zep-validated, +18.5% LongMemEval). **ADD:**
`context_description` (A-MEM — fixes bare-tool-name noise), `salience` smallint 1–10 (Generative Agents/Mem0),
`source_span` text (grounding quote). **EXTEND** the `fact_type` enum with **`reference`** (durable external
pointers: chart/version/CVE/path — the type the model repeatedly reached for). Keep `reasoning` (Mem0 ablation:
removing structured/reasoning fields costs 4–8pp QA accuracy).

## Consequences

**Positive**
- Recovers high-fidelity facts the mini dropped; **supersede preserves signal** instead of dedup-destroying it.
- **Injection-safe by construction** (no-tools + role-sep + output validation), validated on the weak model.
- Cheap: ~$0.14–0.44/session; full ~240-session sweep ≈ ~$105 one-time on Opus (less on Sonnet).
- Reuses existing bitemporal schema + `fact_corrections`; aligns with VW-480 (consolidate) as the other half.
- Closes the outcome-metric gap (recall-quality before/after a dream pass on the golden set).

**Negative / costs**
- Per-session LLM token cost (offline, budget-capped).
- Grounding is WARN not a hard gate until the write-path lands.
- v1 matching is content-token Jaccard, not vector ANN — recall ceiling until the embedder is restored.
- Requires a schema migration (3 new columns + enum value).
- The **write-path is not built** — nothing mutates `memory.facts` yet (deliberate).

## Alternatives Considered

- **A — Reuse `extractor.py` with a Claude-API model swap (non-agentic):** cleaner to containerize as a K8s
  CronJob; loses `claude -p` simplicity. **Still open** as the production engine option vs host-launchd.
- **B — Net-new-only novelty gate (drop-if-similar):** **Rejected** — discards the richer supersede versions,
  defeating the purpose.
- **C — Sonnet as default for cost:** **Deferred** — Sonnet is injection-safe *only with* the hardening
  (hijacked 2/5 without it). A hardened Opus-vs-Sonnet quality re-A/B will settle the engine on cost.
- **D — Datamarking on by default:** **Rejected (for now)** — corrupts `source_span` verbatim quotes; no-tools
  already neutralizes hijacks. Kept as a toggle.
- **E — Vector ANN matching now:** **Deferred** — embedder scaled down (ADR-059); content-token Jaccard is
  sufficient for the dry-run and embedder-independent.

## Open Items (follow-ups, not blocking this ADR)

1. Hardened Opus-vs-Sonnet quality re-A/B (all 5 sessions) → settle production engine on cost.
2. Production engine + scheduling: `claude -p` host-launchd (Mac) vs K8s CronJob → Claude API (Alt A).
3. **Write-path** (explicit go + embedder): apply decisions via `t_invalid` + `fact_corrections`, behind a
   feature flag, with an opt-in human-review surface. First thing that mutates real memory.
4. Promote fuzzy grounding from WARN to a hard gate once the write-path is trusted.
5. Swap matching to vector ANN when the embedder is restored.

## References

- Vault: 2026-06-06-VW-618-Dreaming-Enrich-Reextract-Design *(internal reference; not included)* (pilot + harness §8.1–8.4),
  2026-06-07-VW-618-Memory-Extraction-Prompt-and-Schema-Research *(internal reference; not included)* (cited prompt/schema research),
  2026-05-29-Memory-Enhancements-External-Cross-Check *(internal reference; not included)*.
- ADRs: [ADR-047-LLM-Content-Trust-Boundary](/adrs/047-llm-content-trust-boundary/) (Mode C trust boundary), [ADR-046-Memory-System-Embedder-Architecture](/adrs/046-memory-system-embedder-architecture/),
  [ADR-059-Memory-Writer-Asynchronous-Embedding](/adrs/059-memory-writer-asynchronous-embedding/), [ADR-043-Memory-System-Derived-Data-GDPR-Position](/adrs/043-memory-system-derived-data-gdpr-position/).
- Jira: VW-618 (this), VW-480 (consolidate sibling), VW-477/478/479 (memory-enhancement cluster), VW-152 (NER).
- Primary sources: Mem0 (arXiv:2504.19413, extract-then-update ADD/UPDATE/DELETE/NOOP), Zep (arXiv:2501.13956,
  bitemporal + supersede, +18.5% LongMemEval), A-MEM (arXiv:2502.12110, context/keywords fields), Generative
  Agents (arXiv:2304.03442, 1–10 salience), Spotlighting (arXiv:2403.14720, datamarking/delimiting), StruQ
  (arXiv:2402.06363, role separation), OWASP LLM01 Prompt-Injection Cheat Sheet.
- Harness: `scripts/dream_enrich_pilot/` (rootweaver-platform, MR !121 — recovered 2026-06-09 from JSONL archives after the original `/tmp/vw618-pilot/` scratch copy was lost to reboot; formatter-normalized, pristine bytes in the 2026-06-07 archive).

**Run-Id:** 0c36ee0f-b18d-4344-a356-a2b794d6b270 · agent:claude-code · model:claude-opus-4-8
