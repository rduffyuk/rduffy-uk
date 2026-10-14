---
id: 49
title: "Personal Industry Radar Pipeline — Precis + Karpathy LLM Wiki + Claude Code Subscription Synthesis"
status: superseded
recordedStatus: "Superseded-in-part-by-ADR-050"
date: 2026-05-21
tags: ["architecture", "knowledge-management", "radar", "rss", "llm", "karpathy-wiki-pattern", "claude-code-subscription", "vw-424"]
sourceKind: source-record
public: true
journeyId: "2026-05-21-adr-049-personal-industry-radar-pipeline-precis-karpathy-llm-wiki-claude-code-subscription-synthesis"
---
# ADR-049: Personal Industry Radar Pipeline — Precis + Karpathy LLM Wiki + Claude Code Subscription Synthesis

> **Status amendment (2026-05-22, ADR-050 filed 2026-05-28)**: The "deploy Precis + plugins" implementation choice in this ADR is superseded by [ADR-050-Personal-Industry-Radar-Native-Implementation](/adrs/050-personal-industry-radar-native-implementation/) (Accepted — native `packages/rootweaver-radar/` workspace package, deployed to production 2026-05-27). Other decisions (vault folder layout §2.2, source list §2.1, Karpathy synthesis layer plan §2.1 Tier 3, ADR-047 provenance integration) remain valid and are inherited by ADR-050.

**Status**: Proposed (2026-05-21)
**Date**: 2026-05-21
**Jira**: VW-424 (parent), VW-418 (research umbrella context)
**Related**: [ADR-047-LLM-Content-Trust-Boundary](/adrs/047-llm-content-trust-boundary/) (this pipeline consumes via the untrusted lane), [ADR-029-KEDA-GPU-Swap-Controller](/adrs/029-keda-gpu-swap-controller/) (radar uses Ollama-CPU only, swap-aware by accident), [ADR-034-Data-Source-Connector-Architecture](/adrs/034-data-source-connectors/) (future migration target)
**Research basis**: 2026-05-21-LLM-Input-Format-Trust-Pipeline-Migration-Archaeology *(internal reference; not included)*

---

## 1. Context

### 1.1 Problem

The 2026-05-21 research session (VW-418 *(internal reference; not included)*) surfaced a structural gap in Rootweaver's architecture: the platform has **9 systems-of-record connectors** (Jira, Confluence, GitLab, Discord, Slack, Gmail, IMAP, Web, File) but **no curated industry-signal-ingestion path**. Industry signal (ArXiv papers, vendor PSIRTs, lab blogs, newsletters, conference talks, RFCs) is currently only ingested when the operator actively goes looking — meaning the platform is structurally behind the field by however long it takes between someone explaining a topic and the operator reading about it.

The acute trigger: today's session discovered three architectural patterns (HTML accessibility tree, dual-LLM defence, migration archaeology) that have been published consensus for 6-12 months and weren't in the vault. A one-conversation knowledge transfer shouldn't be the mechanism by which architectural patterns reach the vault.

### 1.2 Constraints

- **Single GPU** (RTX 4080, 15 GB VRAM) time-shared between vLLM and TEI per [ADR-029-KEDA-GPU-Swap-Controller](/adrs/029-keda-gpu-swap-controller/)
- **Anthropic API costs are unwelcome** — operator has Claude Code Pro/Max subscription; per-call API billing should be avoided
- **One-person operation** with leverage-via-Claude — manual curation does not scale; automation is mandatory
- **Provenance must follow ADR-047** — radar content is external-authored web content, must carry `trust_level=untrusted-external-web` end-to-end
- **Storage cost must be modest** — vault is currently 148K+ chunks in Qdrant; radar should add bounded volume (~6K/month)
- **No new operational surface** — must use existing K3s + Ollama + vLLM + Cloudflare + Discord webhook infrastructure

### 1.3 Existing landscape (researched 2026-05-21)

| Class | Best option | Status |
|---|---|---|
| Paid SaaS aggregator | Inoreader Pro (£72/yr) | Replaceable by self-host |
| Enterprise CI platform | Crayon / Klue / Contify (£20-40K/yr) | Wrong shape — competitor-focused not tech-evolution-focused |
| Self-hosted RSS reader | FreshRSS / Miniflux / NewsBlur | Pure RSS, no AI summary |
| AI-enhanced RSS reader | **Precis** (MIT, Ollama-native), RSSbrew (AGPL — reject), auto-news (too big) | Precis fits |
| Paper-discovery academia | Scholar Inbox (free, daily-indexes arXiv with personalised recs from user ratings) | Use directly |
| Email→RSS bridge | Kill The Newsletter (free hosted by leafac, or self-host) | Use hosted |
| Newsletter signal layer | AlphaSignal (100K subs, ML-ranked), Latent Space (200K subs, AI engineer focus), The Batch (Andrew Ng) | Subscribe directly |

The 5 candidate radar projects were cloned and code-reviewed in the same session — findings documented in 2026-05-21-LLM-Input-Format-Trust-Pipeline-Migration-Archaeology *(internal reference; not included)* §11. Key license + maintenance findings:

| Project | License | Last commit | Verdict |
|---|---|---|---|
| Precis | **MIT** | Dec 2024 | ★ Deploy |
| RSSbrew | AGPL v3 ⚠️ | Sep 2025 | Reject — viral copyleft, future productisation blocker |
| auto-news | MIT | Jul 2025 | Too large (Notion+iOS+Android+Airflow), harvest Helm pattern only |
| ArxivDigest | MIT | Jul 2023 | Stale; harvest relevancy prompt only |
| Kill The Newsletter | (check) | Feb 2026 | Use hosted version |

### 1.4 Pattern selection — Karpathy LLM Wiki vs swyx ai-notes

Two reference patterns examined:

- **swyx's `ai-notes` repo**: hand-curated, no automation; 10 topic pages + monthly diary + stub notes. 2.4 MB total. Proven across 2+ years.
- **Karpathy's LLM Wiki (2026)**: LLM agent reads `/raw`, writes `/wiki` topic pages. Bypasses traditional RAG for personal-KB use. Self-updating.

Decision: **adopt swyx's structure (topic + monthly + stubs + resources + blog ideas) with Karpathy's automation** (LLM-driven synthesis via Claude Code subscription). Best of both — proven structure, automated curation, zero manual maintenance burden.

---

## 2. Decision

Deploy a three-tier radar pipeline composed entirely of existing infrastructure plus one new K3s service (Precis):

### 2.1 The three tiers

**Tier 1 — Ingestion (free, mostly hosted)**

| Source class | Mechanism | Authority |
|---|---|---|
| Curated newsletters (AlphaSignal, Latent Space, Smol AI, The Batch, Pragmatic Engineer) | Email → kill-the-newsletter.com → per-subscription Atom feed → Precis | Hand-curated by editors (highest quality-per-byte) |
| ArXiv papers (cs.AI, cs.CR, cs.SE, cs.LG, cs.CL) | Scholar Inbox personalised recs (account, ratings-trained) + raw arXiv RSS as backup | Personalised academic signal |
| Vendor advisories (Cisco PSIRT, Juniper PSIRT, NVD/CVE feed) | RSS direct → Precis | Security-critical signal |
| AI lab blogs (Anthropic, OpenAI, DeepMind, HuggingFace, Cloudflare) | RSS direct → Precis | Vendor-of-record signal |
| Curated discovery (Simon Willison, Lilian Weng, Sebastian Raschka, Eugene Yan) | RSS direct → Precis | Individual high-signal authors |
| Tech aggregators (HN front-page filtered, GitHub trending) | RSS direct → Precis | Community signal |

**Tier 2 — Filter + summarise (free, local LLMs)**

- **Precis** deployed in `rootweaver` K3s namespace as a Deployment
- LLM backend: existing **Ollama** with `qwen2.5:3b` (CPU-only, ~1.9 GB RAM, ~10 tok/s)
- Per-item relevance scoring (1-10 scale, threshold ≥7) using the **ArxivDigest relevancy prompt** (proven prompt template, ported into Precis config)
- Per-item ~100-word summary for items above threshold
- Provenance auto-tagged per ADR-047: `trust_level=untrusted-external-web`, `source_system=radar/&lt;feed-name&gt;`, `field_owner=external-untrusted-web`
- Two custom Precis plugins (~80 LoC total, MIT, upstreamable):
  - `notification/discord.py` — Discord webhook handler (existing pattern, copy `slack.py`)
  - `notification/vault_writer.py` — writes summaries to `04-Resources/AI-ML-Research/Raw/YYYY-MM-DD/item-&lt;slug&gt;.md`

**Tier 3 — Synthesise (free, Claude Code subscription)**

- Two **Claude Code scheduled agents** via the `/schedule` skill (uses subscription quota, not API tokens):
  - `ai-radar-nightly` — runs 02:00 UK daily; reads `Raw/&lt;today&gt;/`, updates `Wiki/&lt;Topic&gt;.md` (Karpathy pattern), creates `Wiki/_stubs/` for emerging topics (swyx pattern), appends to `01-Journal/AI-Radar/YYYY-MM.md`
  - `ai-radar-weekly-digest` — runs 18:00 UK Friday; top-5 items + gap analysis against current HLD/LLD + Discord webhook post

### 2.2 Vault folder layout (adopted from swyx with Karpathy automation)

```
04-Resources/AI-ML-Research/
├── Raw/                            ← Precis writes here, untrusted-external-web
│   └── 2026-05-21/
│       └── item-<slug>.md
├── Wiki/                           ← Claude Code agent maintains, Karpathy pattern
│   ├── Prompt-Injection-Defence.md
│   ├── Accessibility-Tree-Consumption.md
│   ├── GraphRAG-Patterns.md
│   ├── Migration-Archaeology.md
│   └── _stubs/                     ← swyx pattern — watch-list items
│       └── *.md
├── Resources/                      ← existing — standing references
└── (existing files...)

01-Journal/AI-Radar/                ← chronological diary
└── 2026-05.md
```

### 2.3 What does NOT happen here

To prevent scope creep, this ADR explicitly **does not** mandate:

- Migration to a native RSS connector in the connector framework (this is a future option in Sprint 3+ review, not a requirement)
- Indexing of Raw items into Qdrant beyond what vault-indexer naturally does (no special-case logic)
- Multi-user / multi-tenant operation (Precis is single-user, fine)
- Real-time alerting (daily cadence is sufficient; sub-daily not justified by signal velocity)
- Synthesis using Anthropic API (Claude Code subscription only — see §3.2 cost rationale)

---

## 3. Consequences

### 3.1 Positive

- **£0/yr marginal cost** vs. £72/yr (Inoreader Pro), or £20-40K/yr (enterprise CI). All inference free at marginal level (Ollama CPU, Claude Code subscription)
- **Zero new infrastructure** — Ollama already deployed (HLD-02 §1); Claude Code subscription already paid; Cloudflare/Discord webhooks already configured
- **Vault becomes synthesis substrate** (Karpathy pattern) — radar output is searchable via existing Qdrant indexing, joinable via vault-postgres, and traceable via FalkorDB once provenance is implemented (VW-420/421)
- **Trust boundary preserved** — all radar content carries ADR-047 `untrusted-external-web` provenance; downstream consumers (Oracle agent, recall_decisions) can downweight via existing trust-aware retrieval
- **GPU-swap-aware by accident** — radar uses Ollama CPU only, so remains operational during TEI embedding windows when vLLM is paused (ADR-029)
- **Survives operator vacation** — automated daily ingest + automated synthesis means going on holiday doesn't accumulate signal debt
- **Composable** — Precis's handler abstraction (`LLMHandler` / `NotificationHandler` / `StorageHandler` / `ContentHandler`) makes future extensions cheap (e.g., add Telegram notification by writing one Python class)
- **Strategic option-value** — if Personal Radar succeeds, the same architecture can be productised as a service for client work (one of the strategic options flagged in 2026-05-21-HLD-LLD-Review-LLM-Trust-Boundary *(internal reference; not included)* §8.1)

### 3.2 Negative

- **Precis is semi-stale** (last commit Dec 2024, 5 months ago). Risk: critical bugs or security issues remain unpatched. **Mitigation**: MIT licence — operator can fork at any point; codebase is ~3K LoC Python (auditable in one sitting); maintain a local patch set if upstream goes dormant.
- **Hosted Kill The Newsletter is a third-party dependency** (run by leafac). If service shuts down, newsletter→RSS layer breaks. **Mitigation**: self-host backup option exists (Docker variant at `semiformal-net/kill-the-newsletter`); migration is ~1 day of work if needed.
- **Ollama `qwen2.5:3b` quality cap** — 3B params is small; relevance-judgement quality may be insufficient for nuanced topics. **Mitigation**: bump to `qwen2.5:7b` (CPU still works, slower; ~30s per call instead of ~5s) if accuracy audit reveals gaps. Alternative: use vLLM Qwen3-8B-AWQ for filter step when vLLM is idle.
- **Claude Code subscription quota** — heavy synthesis use could brush against monthly limits. **Mitigation**: nightly+weekly cadence is bounded; if quota exhausted, fall back to vLLM Qwen3-8B-AWQ for synthesis (lower quality but free).
- **No Discord notification in Precis upstream** — one of the few notification destinations missing. **Mitigation**: write `notification/discord.py` (~30 LoC, MIT contribution back); already-committed work in VW-424 acceptance criteria.
- **No vault-writer notification in Precis upstream** — needed for Karpathy pattern. **Mitigation**: write `notification/vault_writer.py` (~50 LoC); upstream-able as a generic markdown-writer plugin if desired.
- **Karpathy LLM Wiki pattern is unproven at scale** — the academic claim is recent (2026), few production references. **Mitigation**: hybrid with swyx's proven structure; if Karpathy automation fails, fall back to chronological diary (still useful, just less curated).
- **Signal-quality risk** — automation may surface noise instead of signal; relevance scoring may miscalibrate. **Mitigation**: 2-week pilot before declaring victory; signal-quality audit in acceptance criteria; threshold and prompt tuning iteratively.

### 3.3 Risks (severity × likelihood)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Precis upstream goes fully dormant | Medium | Medium | Fork; ~3K LoC, owner-able |
| Hosted Kill The Newsletter dies | Low | Medium | Self-host (1-day migration) |
| Ollama qwen2.5:3b too small for relevance scoring | Medium | Low | Bump to 7b or use vLLM idle windows |
| Claude Code subscription quota exhaustion | Low | Low | Reduce cadence or fall back to vLLM |
| Radar output drifts toward low-signal aggregator content | Medium | Medium | Re-tune relevance prompt + threshold; rotate sources quarterly |
| Discord webhook gets compromised → injection vector | Very low | Low | Webhook is outbound only; no inbound risk |
| Prompt-injection content in newsletters reaches Claude Code synthesis agent | Medium | Medium | ADR-047 spotlighting + provenance tagging contains it; agent has no destructive tools |

### 3.4 Compliance posture

This pipeline is **compatible with future EU AI Act / NIST AI RMF compliance documentation** because:

- Every radar chunk carries provenance with traceable source URL + ingest timestamp + transformation chain (ADR-047 §2.2)
- Source list is config-driven and auditable (YAML in `configs/precis.yaml`)
- Synthesis decisions are logged (Claude Code session transcripts + memory-writer captures all reasoning rounds)
- "Right to know" queries answerable via `SELECT chunks WHERE provenance->'chain' @> '[{"step":"ingest","system":"radar"}]'` once VW-420 lands

---

## 4. Alternatives Considered

### 4.1 Paid SaaS (Inoreader Pro + Readless or similar)

Subscribe to Inoreader Pro (£72/yr) + an AI-digest service like Readless. Bypass self-hosting entirely.

**Rejected** because:
- Recurring £72-200/yr cost vs free
- Vendor lock-in for the curation layer
- Provenance metadata can't be added at the SaaS layer (no integration with ADR-047 trust boundary)
- No path to vault-native synthesis (Karpathy pattern requires file system access)

### 4.2 Pure-build RSS connector in existing framework

Skip Precis entirely. Build the RSS connector planned for Sprint 3+ as part of the connector framework (`packages/rootweaver-connectors/sources/rss/`). Filter + summarise as KEDA-scaled consumers.

**Rejected (for now, kept as future option)** because:
- ~1-2 sprints of original work vs ~2 hours deploying Precis
- Reinvents Precis's handler abstraction without clear benefit
- Operator gets zero radar signal during the build period

**Future migration path retained**: after 6 months of running Precis, re-evaluate. If radar is heavily used and Precis goes dormant, port functionality into the native connector framework. ADR-049 supersession would be the trigger.

### 4.3 RSSbrew (AGPL v3) self-hosted

Active maintenance (Sep 2025), Docker-deployable, similar feature set to Precis.

**Rejected** because:
- AGPL v3 viral copyleft — any modification must be released under AGPL when run as network service
- Future productisation (migration archaeology pivot in 2026-05-21-HLD-LLD-Review-LLM-Trust-Boundary *(internal reference; not included)* §8.1) would be legally compromised
- No Ollama support in `requirements.txt` — would need fork to add local LLMs, ironically triggering AGPL release requirements
- "Still under development" — author's own assessment of completeness

### 4.4 auto-news (MIT, K8s-native via Helm)

Largest scope of the 5 reviewed projects; ships with a Helm chart matching Rootweaver's deployment model.

**Rejected** because:
- Scope mismatch — multi-source (Twitter, Reddit, YouTube, RSS), Notion-based reading UI, iOS+Android mobile apps. ~10K LoC.
- Tech stack mismatches: Airflow DAGs (we use Prefect), Notion (we use Obsidian), embedded ChromaDB (we use Qdrant)
- Helm chart pattern is interesting but not worth importing the whole project for

**Retained value**: the Helm chart pattern is a useful reference for future Sprint 3+ RSS connector if we build native.

### 4.5 ArxivDigest deployed as a service

Direct deployment of `AutoLLM/ArxivDigest` as a GitHub Actions cron.

**Rejected** because:
- Last commit Jul 2023 — 3 years stale
- Hardcoded to `gpt-3.5-turbo-16k` (OpenAI API only)
- Would need a fork to swap to Ollama, defeating the "use OSS as-is" benefit

**Retained value**: the relevancy prompt is excellent and portable — adopted verbatim in Precis config.

### 4.6 Anthropic API for synthesis (instead of Claude Code subscription)

Use Anthropic Messages API directly from a Prefect flow for synthesis, with prompt caching for cost reduction.

**Rejected** because:
- Per-call API billing vs already-paid Claude Code subscription
- Estimated cost: £100-300/mo at typical synthesis volume even with prompt caching
- Claude Code scheduled agents are the natively-supported path (`/schedule` skill, `CronCreate` tool)
- API path adds an Anthropic billing dependency that doesn't exist today

### 4.7 Build-from-scratch in connector framework (no external project)

Skip Precis. Build the radar pipeline natively in `packages/rootweaver-connectors/sources/radar/` with KEDA consumers for filtering and summarisation.

**Rejected (for now)** because:
- ~2 sprints of original work
- Operator gets zero radar signal during the build period
- Precis already does 80% of what we'd build, at MIT license

**Future migration path**: if Precis goes dormant or doesn't suit, this is the natural fallback. ADR-049 would be superseded by a new ADR articulating the native-connector decision.

---

## 5. Implementation Plan

### 5.1 Weekend / today (~2 hours, zero infrastructure changes)

| # | Action | Effort | Cost |
|---|---|---|---|
| 1 | Sign up to Scholar Inbox | 5 min | £0 |
| 2 | Subscribe to AlphaSignal + Latent Space + Smol AI News + The Batch + Pragmatic Engineer (Gmail label `ai-radar`) | 10 min | £0 |
| 3 | Set up kill-the-newsletter.com — one feed per newsletter | 10 min | £0 |
| 4 | Deploy Precis to K3s `rootweaver` namespace (Deployment + Service + PVC for data dir) | 30 min | £0 |
| 5 | Configure Precis: Ollama backend (`qwen2.5:3b`), 8-10 initial sources, Discord webhook | 20 min | £0 |
| 6 | Copy ArxivDigest relevancy prompt into Precis system prompt | 5 min | £0 |
| 7 | Pull `qwen2.5:3b` on Ollama: `kubectl exec -n rootweaver ollama-... -- ollama pull qwen2.5:3b` | 5 min | £0 |
| **Total weekend** | | **~85 min** | **£0** |

### 5.2 Sprint 2 (0.5 sprint, plugins + agents)

| # | Action | Effort |
|---|---|---|
| 8 | Write `notification/discord.py` Precis plugin (~30 LoC, copy `slack.py` pattern) | 0.5 day |
| 9 | Write `notification/vault_writer.py` Precis plugin (~50 LoC, writes markdown to vault-mounted PVC) | 0.5 day |
| 10 | Configure provenance metadata in vault-writer plugin per ADR-047 | 0.5 day |
| 11 | Create Claude Code scheduled agent: `ai-radar-nightly` (02:00 UK daily) | 0.5 day |
| 12 | Create Claude Code scheduled agent: `ai-radar-weekly-digest` (18:00 UK Friday) | 0.5 day |
| 13 | Optional: upstream the Discord plugin to leozqin/precis as a PR | 0.5 day |
| **Total Sprint 2** | | **~3 days** |

### 5.3 Sprint 3+ (review + iterate)

| # | Action | Trigger |
|---|---|---|
| 14 | 2-week signal-quality audit: % relevant items, % missed important items | After 2 weeks running |
| 15 | Prompt + threshold tuning based on audit | After audit |
| 16 | Source-list rotation (add/remove based on signal-to-noise observed) | Quarterly |
| 17 | Optional: bump Ollama model to `qwen2.5:7b` if 3b quality insufficient | If audit shows accuracy gaps |
| 18 | Optional: native RSS connector migration (re-evaluate need vs Precis) | 6 months in |
| 19 | Optional: productise externally if pattern proves valuable for client work | If §8.1 strategic decision goes that way |

---

## 6. Validation Approach

### 6.1 Pilot success criteria (2 weeks post-deployment)

- **Coverage metric**: of the 12 "tier 1 + tier 2" gaps identified in 2026-05-21-HLD-LLD-Review-LLM-Trust-Boundary *(internal reference; not included)*, does the radar surface ≥6 of them organically in the 2-week window?
- **Signal-to-noise**: of items reaching the operator (above threshold), what fraction are flagged as relevant on manual review? Target: ≥70%
- **False-negative audit**: review a known industry event (e.g., major model release, paper publication) — did the radar catch it?
- **Wiki growth**: at least 5 new Wiki pages or stub notes created per week by the synthesis agent

### 6.2 Failure modes to monitor

- **Aggregator-of-aggregators effect**: if Smol AI / AlphaSignal references content that other sources also reference, the radar would surface it multiple times. Dedupe by article URL in vault-writer plugin.
- **Drift toward low-signal sources**: any source contributing < 10% of through-threshold items over 4 weeks gets a quarterly review for removal.
- **Synthesis agent hallucination**: Claude Code's nightly synthesis pulling concepts from injected content. ADR-047 spotlighting + provenance check should catch — verify in audit.

### 6.3 Decision points

- **Week 2**: continue or kill? If signal-quality < 50%, prompt-tuning sprint. If < 30%, reconsider Precis vs build-native.
- **Month 3**: scope expansion? Add more sources, multi-modal (YouTube transcripts via auto-news pattern), or hold steady.
- **Month 6**: integration depth? Migrate to native RSS connector OR stick with Precis for another period.

---

## 7. Related

- VW-424 *(internal reference; not included)* — implementation Jira ticket
- VW-418 *(internal reference; not included)* — research umbrella that produced this ADR
- [ADR-047-LLM-Content-Trust-Boundary](/adrs/047-llm-content-trust-boundary/) — radar consumes via the untrusted lane; Mode A defence applies to synthesis-agent reading of radar content
- [ADR-029-KEDA-GPU-Swap-Controller](/adrs/029-keda-gpu-swap-controller/) — radar's CPU-only Ollama use is naturally swap-aware
- [ADR-034-Data-Source-Connector-Architecture](/adrs/034-data-source-connectors/) — future migration target if native RSS connector built
- [ADR-046-Memory-System-Embedder-Architecture](/adrs/046-memory-system-embedder-architecture/) — radar wiki content gets embedded by the existing pipeline (Qwen3-Embedding-4B, 2560d)
- 2026-05-21-LLM-Input-Format-Trust-Pipeline-Migration-Archaeology *(internal reference; not included)* — research synthesis (companion canonical doc)
- 2026-05-21-HLD-LLD-Review-LLM-Trust-Boundary *(internal reference; not included)* — gap analysis that surfaced the radar need
- HLD-02-RAG-Platform *(internal reference; not included)* — current connector framework (potential future home)

---

## 8. References

### Deployed projects (cloned and code-reviewed 2026-05-21)

- [Precis (leozqin/precis)](https://github.com/leozqin/precis) — MIT, Ollama-native, FastAPI; the deployed radar service
- [Kill The Newsletter (leafac/kill-the-newsletter)](https://github.com/leafac/kill-the-newsletter) — email→RSS, hosted version preferred ([kill-the-newsletter.com](https://kill-the-newsletter.com))

### Pattern donors (concepts harvested, not deployed)

- [ArxivDigest (AutoLLM/ArxivDigest)](https://github.com/AutoLLM/ArxivDigest) — relevancy prompt template ported verbatim
- [swyxio/ai-notes](https://github.com/swyxio/ai-notes) — folder structure pattern (topic + monthly + stub + resources + blog ideas)
- [Karpathy's LLM Wiki pattern (2026)](https://codersera.com/blog/karpathy-llm-knowledge-base-second-brain/) — automation pattern (LLM writes wiki pages from raw)

### Source list (initial, evolvable)

- [Scholar Inbox](https://www.scholar-inbox.com/) — personalised arXiv recs
- [AlphaSignal](https://alphasignal.ai/) — weekly ML-ranked research breakdowns
- [Latent Space](https://www.latent.space/) — AI engineer weekly
- [Smol AI News](https://news.smol.ai/) — daily AI-Discord/Twitter recap
- [The Batch (DeepLearning.AI)](https://www.deeplearning.ai/the-batch/) — Andrew Ng's weekly digest
- [Simon Willison's blog](https://simonwillison.net/) — high-signal individual author
- [Anthropic news](https://www.anthropic.com/news) — vendor-of-record
- [Cisco PSIRT](https://sec.cloudapps.cisco.com/security/center/publicationListing.x) — security advisories
- [NVD CVE feed](https://nvd.nist.gov/vuln/data-feeds) — security advisories

### Foundational references

- [Karpathy's LLM Wiki step-by-step](https://www.thetoolnerd.com/p/step-by-step-guide-build-your-own-second-brain-obsidian-kaparthy)
- [Obsidian AI Second Brain Complete Guide 2026 (NxCode)](https://www.nxcode.io/resources/news/obsidian-ai-second-brain-complete-guide-2026)
- [AI Newsletter Arena (Arize comparison)](https://arize.com/ai-newsletter/)

---

*Proposed 2026-05-21. Awaiting architect review (operator self-review) before VW-424 implementation begins. First concrete action: §5.1 weekend deployment (~85 min).*
