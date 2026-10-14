---
id: 51
title: "Radar Feed Acquisition — Tiered Hierarchy for Sites Without Native RSS"
status: proposed
recordedStatus: "Proposed"
date: 2026-05-23
tags: ["architecture", "radar", "rss", "feed-acquisition", "rsshub", "sitemap", "playwright", "firecrawl"]
sourceKind: source-record
public: true
journeyId: "2026-05-23-adr-051-radar-feed-acquisition-tiered-hierarchy-for-sites-without-native-rss"
---
# ADR-051: Radar Feed Acquisition — Tiered Hierarchy for Sites Without Native RSS

**Status**: Proposed (2026-05-23)
**Date**: 2026-05-23
**Jira**: VW-424
**Related**:
- [ADR-049-Personal-Industry-Radar-Pipeline](/adrs/049-personal-industry-radar-pipeline/) — original radar design
- [ADR-050-Personal-Industry-Radar-Native-Implementation](/adrs/050-personal-industry-radar-native-implementation/) — radar consumes this policy
- 2026-05-22-Radar-Restructure-Design *(internal reference; not included)* — companion design spec
- 2026-05-23-Radar-Quality-Comparison *(internal reference; not included)* — empirical experiment surfacing the "no RSS" problem

---

## 1. Context

### 1.1 Problem

The radar pipeline (ADR-049, ADR-050) reads RSS/Atom feeds to acquire industry signal. The Phase 1 quality experiment (2026-05-23) ran against 11 hand-curated sources and discovered:

1. **Anthropic does not publish an RSS feed** for `/news/` — the URL specified in `sources.py` (`https://www.anthropic.com/news/rss.xml`) returns HTTP 404 because it never existed (controller-hallucinated during spec authoring).
2. **NVD CVE XML feed deprecated** — `https://nvd.nist.gov/feeds/xml/cve/misc/nvd-rss-analyzed.xml` returns 404; NVD migrated to JSON API 2.0 in late 2023 and no longer publishes XML feeds.

Net impact of these two missing feeds in the experiment: 8/50 target entries lost (16% sample shrinkage from the planned composition).

This raises the broader question: **for any future source the operator wants to add to the radar, what acquisition mechanism do we use?** The space of options has expanded considerably since RSS's heyday:

- Some sites still publish RSS/Atom natively (Simon Willison, Lilian Weng, arXiv)
- Some have community-maintained RSS bridges (taobojlen/anthropic-rss-feed, RSSHub)
- Some publish `sitemap.xml` with `&lt;lastmod&gt;` timestamps (Anthropic, most modern CMSes)
- Some require headless-browser scraping (SPAs without sitemaps)
- Some emit only via email newsletter (AlphaSignal, Latent Space, Pragmatic Engineer)
- Some require AI-powered structured extraction (high-churn job/product sites)
- Some publish only via change-detection (track-this-page tools)

Choosing per-site ad-hoc has produced two failure modes already (hallucinated URL, deprecated XML). The radar needs an explicit, evidence-based acquisition policy.

### 1.2 Constraints

- **One-person operation** with leverage-via-Claude — per-site custom code does not scale; standardised adapters do
- **Cost-conscious** — operator has Claude Code Max5x subscription; per-call API spend should be modest (radar budget: ~$1/month). Bare-LLM scraping at scale is incompatible
- **Container weight budget** — every dep that ships in the radar Docker image (Chromium ~250 MB) compounds image build time, K3s pull time, and node-disk pressure
- **GitOps + FluxCD constraint** — any external service the radar depends on (e.g. a self-hosted scraper sidecar) must be modeled as a workspace package + gitops manifest, not a one-off operator artefact
- **License integrity** — radar code is currently MIT-class; AGPL components (RSSHub) can be consumed over a network boundary but must not be statically linked
- **ADR-047 provenance** — every feed adapter must produce `FeedEntry` objects compatible with the existing `trust_level=untrusted-external-web` provenance chain

### 1.3 Evidence — empirical findings from 2026-05-23 research session

Three discoveries reshaped the option space:

1. **`anthropic.com/sitemap.xml` works**. HTTP 200, valid XML, 214 `/news/` URLs each carrying ISO-8601 `&lt;lastmod&gt;`. Most-recent news entry: 2026-05-20 (3 days lag relative to publish). No scraping needed.

2. **RSSHub already has Anthropic routes** ([DIYgod/RSSHub#18943](https://github.com/DIYgod/RSSHub/issues/18943) closed via merged PR #19070, April 2025). Both `/anthropic/news` and `/anthropic/engineering` routes are first-class supported, maintained by the community. Self-host: `docker run -d -p 1200:1200 rsshub/rsshub:latest`.

3. **taobojlen/anthropic-rss-feed scraper** is alive and fresh — last entry 2026-05-22 ("Project Glasswing: An initial update"). Cron runs every 6 hours via GitHub Actions on the maintainer's repo. Notably, the sitemap had NOT picked up the Glasswing post yet at the same poll time — confirming different acquisition mechanisms have different latency/coverage profiles.

---

## 2. Decision

Adopt a **six-tier acquisition hierarchy**. For every new feed source, evaluate tiers top-down; use the first tier that satisfies the source's constraints. Each tier has explicit applicability conditions, container cost, and maintenance burden.

### 2.1 The tiers

| Tier | Mechanism | When to use | Container cost (added to radar) | Per-site effort | Failure modes |
|---:|---|---|---:|---:|---|
| **0** | Native RSS / Atom feed (if site publishes one) | Site has an official `feed.xml`, `atom.xml`, `/feed`, `/rss/`, etc. | 0 (already in feedparser) | 1 line in `sources.yml` | URL changes; site drops feed |
| **1** | `sitemap.xml` polling | Site publishes a sitemap with `&lt;lastmod&gt;` and the URL prefix you care about is filter-able (e.g. `/news/`, `/blog/`) | ~30 LoC adapter, no new deps | 1-line config + per-site URL-prefix filter | Sitemap publish-lag (often hours-days); no title/summary in sitemap (requires secondary fetch per URL) |
| **2** | Community RSS bridge (RSSHub) | Tier 0/1 unavailable AND RSSHub has a route already, OR you're willing to write/contribute one | 1 RSSHub sidecar container (~50 MB) shared across all RSSHub-routed feeds | 0 lines per site (just consume `http://rsshub/route/&lt;site&gt;`) | RSSHub instance downtime; AGPL license (acceptable over network boundary) |
| **3** | Project-local headless-browser scraper (Playwright pattern) | Tier 0-2 unavailable AND the site is genuinely high-value AND no community scraper exists | Separate scraper sidecar container (~300 MB with Chromium); radar core stays clean | ~150 LoC per site + CSS-selector maintenance when site refactors | Brittle selectors; ~10s per scrape; legal grey area for some sites |
| **4** | AI-powered scraper (Firecrawl / Crawl4AI / ScrapeGraphAI) | Tier 0-3 fail OR the site has high layout churn that breaks Tier 3 selectors weekly | Either external API ($50-200/month) OR LLM tokens against own backend | Per-target schema definition (~10 LoC) | LLM cost; output quality model-dependent; rate limits |
| **5** | Email-to-RSS bridge (kill-the-newsletter, Feedrabbit) | Source only publishes via email newsletter | 0 (consumed as RSS) | Subscribe an alias email; add the bridge-generated Atom URL to `sources.yml` | Bridge service uptime; delivery delay |

### 2.2 Tier-0 — Native RSS/Atom (current radar baseline)

Already implemented in `packages/rootweaver-radar/src/rootweaver_radar/feeds.py` (`fetch_feed` + `parse_feed_text`). No change required.

### 2.3 Tier-1 — `SitemapFetcher` (Phase 2 addition)

Add as a sibling of `fetch_feed` in `feeds.py`:

```python
async def fetch_sitemap(url: str, feed_name: str, url_prefix: str = "",
                       since: datetime | None = None,
                       timeout: float = 15.0) -> list[FeedEntry]:
    """Fetch a sitemap.xml and return entries published since `since`.

    Each <url><loc> matching `url_prefix` becomes a FeedEntry with
    link=<loc>, published=<lastmod>, title=URL slug (placeholder).
    Caller can do a secondary fetch to enrich title+summary if desired.
    """
```

Wire it up:
- Extend `sources.yml` schema with a `type: rss | sitemap` discriminator
- Where `type: sitemap`, the runner calls `fetch_sitemap(url=..., url_prefix=...)`
- Default to RSS for backward compat

**Cost-to-benefit**: ~30 LoC + 4 tests covers ~90% of sites that lack RSS but have sitemaps (Anthropic, OpenAI, HuggingFace, most CMS-driven sites).

**Secondary-fetch caveat**: sitemaps give URL + lastmod but no title/summary. Two responses are acceptable:
- (a) Accept "title = URL slug" for the relevance scoring; the LLM filter handles short titles fine in practice
- (b) Do an async secondary GET per new URL; extract `&lt;title&gt;` and `&lt;meta property="og:description"&gt;` via `html.parser` (no Chromium needed for static metadata). Adds ~100 ms per new entry.

Recommend (a) for MVP; (b) becomes worth it once we have a week of operational data showing the LLM struggles with slug-only titles.

### 2.4 Tier-2 — RSSHub sidecar

Deploy RSSHub as a K3s Deployment in the `rootweaver` namespace:

```yaml
# rootweaver-gitops/infrastructure/rootweaver/rsshub-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: rsshub
  namespace: rootweaver
spec:
  replicas: 1
  selector:
    matchLabels: { app: rsshub }
  template:
    spec:
      containers:
      - name: rsshub
        image: diygod/rsshub:latest
        ports: [{ containerPort: 1200 }]
        env:
        - { name: CACHE_EXPIRE, value: "3600" }     # 1h route cache
        resources:
          requests: { memory: 256Mi, cpu: 100m }
          limits:   { memory: 512Mi, cpu: 500m }
---
apiVersion: v1
kind: Service
metadata:
  name: rsshub
  namespace: rootweaver
spec:
  selector: { app: rsshub }
  ports: [{ port: 1200, targetPort: 1200 }]
```

Radar consumes routes as if they were native RSS:

```yaml
# in radar-configmap.yaml feeds.yml
- name: Anthropic News
  type: rss
  url: http://rsshub.rootweaver.svc.cluster.local:1200/anthropic/news
- name: Anthropic Engineering
  type: rss
  url: http://rsshub.rootweaver.svc.cluster.local:1200/anthropic/engineering
- name: HuggingFace Daily Papers
  type: rss
  url: http://rsshub.rootweaver.svc.cluster.local:1200/huggingface/daily-papers
```

**License**: RSSHub is AGPL-3.0. We consume it over HTTP/JSON inside the cluster; we do not statically link or distribute its code. Per AGPL §13, this network-boundary consumption does not impose AGPL on the consuming code. Acceptable.

**Catch**: 900+ routes means 900+ surface area for the upstream project's bugs. Pin to a specific RSSHub release tag rather than `latest` in production.

### 2.5 Tier-3 — Project-local Playwright scraper

Only deploy when **all** of the following hold:
- Tier 0 (no native RSS)
- Tier 1 (no useful sitemap, OR sitemap lacks the URLs you care about)
- Tier 2 (no RSSHub route AND you don't want to write/upstream one)
- The site is genuinely high-value (criterion: "would I miss meaningful signal if I dropped this source?")

When all four hold, deploy as a SEPARATE sidecar (not in the radar container):

```
packages/rootweaver-radar-scrapers/   ← new sibling workspace member
├── src/rootweaver_radar_scrapers/
│   ├── <site>.py    ← one Playwright script per scraped site
│   └── ...
services/rootweaver-radar-scrapers/Dockerfile  ← carries Chromium
```

Output: emit RSS XML to a shared volume (PVC) that the main radar reads via `file://` URL. Keeps Playwright out of the main radar's container image.

**Pattern reference**: [taobojlen/anthropic-rss-feed](https://github.com/taobojlen/anthropic-rss-feed) is the canonical example of this tier — ~150 LoC, Playwright + feedgen + GitHub Actions cron. Useful even if we don't fork it (the code is the documentation).

### 2.6 Tier-4 — AI-powered scrapers (self-hosted only)

Evaluation only; not a default-deployment tier. Adopt only when Tier 3's CSS-selector maintenance burden becomes unsustainable for a specific high-value target.

**Operator constraint (locked 2026-05-25)**: paid managed services are explicitly rejected. Any Tier-4 adoption must use a self-hosted open-source library; per-page LLM cost is acceptable (radar's volume is tiny — see §2.6.3 below), but recurring SaaS subscriptions are not.

#### 2.6.1 Candidates — self-hosted (in scope)

| Tool | License | Best fit | Cost per radar page | Status |
|---|---|---|---|---|
| **[Crawl4AI](https://github.com/firecrawl/firecrawl)** | Apache 2.0 | Python lib; brings own Playwright + your LLM API key | ~$0.003 (Haiku) / ~$0.015 (Sonnet) | **Preferred** — closest to "Firecrawl but free", actively maintained |
| [ScrapeGraphAI](https://scrapegraphai.com/) | MIT | Python lib; LLM-driven graph extraction; chains pages | ~$0.003 (Haiku) | Backup — useful if a target needs multi-page chained extraction |
| [BrowserUse](https://browse-use.com/) | MIT (OSS tier) | Python agent that drives a real browser per task | ~$0.005-0.01 (Haiku, multi-call agent loop) | Niche — only if a target genuinely needs multi-step browser interaction (login, captcha, etc.) |

#### 2.6.2 Rejected — paid managed services

| Tool | Cost | Why rejected |
|---|---|---|
| [Firecrawl](https://www.firecrawl.dev/) | $83/mo (100k credits) | Recurring SaaS spend disallowed by operator constraint |
| [Browse AI](https://www.browse.ai/) | $50+/mo | Same — managed-only, no self-host path |
| [Diffbot](https://www.diffbot.com/) | $500+/mo | Out of personal-budget scope by an order of magnitude |

#### 2.6.3 Why self-hosted is cheap *enough* for radar

The Firecrawl-vs-Crawl4AI cost arithmetic flips when the page volume is small. Radar's projected volume:

- 30 entries/day × 30 days = **900 pages/month**
- If 10% of those needed Tier-4 (i.e. only the worst long-tail sources): 90 LLM calls/month
- Per-call cost at Haiku-cached: ~$0.003
- **Monthly Tier-4 cost ceiling: ~$0.30 — well within the $1/month radar budget**

This holds because radar is daily-cadence, low-volume, and Tier 4 is reserved for a tiny minority of sources. The economics would invert for a high-volume application (e.g. monitoring 10k product pages hourly) — Firecrawl's managed-proxies + anti-bot value would dominate. Not radar's shape.

#### 2.6.4 Preferred Tier-4 stack — if/when needed

When (and only when) Tier 3 maintenance exceeds **1 hour/month for a single source**:

1. Add `crawl4ai` to `packages/rootweaver-radar/pyproject.toml` deps
2. Wire a `Crawl4AIBackend` adapter into `feeds.py` (parallel to `fetch_feed` and `fetch_sitemap`)
3. Reuse the existing Haiku-cached Anthropic SDK call path — same `ANTHROPIC_API_KEY` SealedSecret, same model, no new credentials needed
4. Per-source config in `sources.yml`: `type: crawl4ai` + `extraction_schema: {...}` for the LLM-driven extraction
5. Container cost: Chromium ships with crawl4ai (~250 MB). Add this to the radar core image OR run as a separate sidecar — decide at the time based on how many sources end up needing it

**The decision-trigger remains**: don't deploy Tier 4 speculatively. Adopt it only when a specific Tier-3 scraper's CSS-selector commits become repetitive.

### 2.7 Tier-5 — Email-to-RSS bridges

For sources that publish only via email newsletter. Per ADR-049 §2.1 Tier 1 ingestion, these are explicitly in scope:

| Source | Mechanism |
|---|---|
| AlphaSignal | Subscribe → `@kill-the-newsletter.com` alias → Atom URL → `sources.yml` |
| Latent Space | same |
| Smol AI News | same |
| The Batch (Andrew Ng) | same |
| Pragmatic Engineer | same |

Cost: free (leafac.com hosts kill-the-newsletter publicly), with optional self-host on a 50 MB Node.js container if Ryan wants ownership.

### 2.8 Out-of-scope (deliberately)

- **Change-detection tools** ([changedetection.io](https://github.com/dgtlmoon/changedetection.io), Visualping, etc.) — different problem space; tells you _if_ a page changed but doesn't extract structured items. Useful for "track this pricing page" or "alert me when this status changes" but not for ingesting a feed of new posts. The radar is a feed-of-items system, not a watch-this-page system.

- **Polling RSS aggregators** (Inoreader, NewsBlur, Feedly) — Ryan already considered + rejected in ADR-049 (£72/yr Inoreader Pro replaceable by self-host). Mentioned here only for completeness.

---

## 3. Consequences

### 3.1 Positive

1. **Predictable acquisition cost-curve**: each new source is classified into a tier; tier-0/1/2 should cover ~95% of cases at near-zero marginal cost. Tier-3+ is rare.
2. **Radar container stays lean**: Playwright never enters the main radar image. Chromium-heavy work is sidecar-isolated.
3. **Future-productisation friendly**: Tier 0-2 are vendor-neutral; Tier 3-4 (RSSHub AGPL, Firecrawl proprietary, Playwright Apache) have explicit license trade-offs surfaced upfront.
4. **Anthropic-news problem solved three different ways**: pick the tier that fits operational comfort (taobojlen feed = laziest; sitemap = leanest; RSSHub = most-future-proof).
5. **`SitemapFetcher` is a high-leverage Phase 2 addition**: ~30 LoC unlocks Anthropic + dozens of other sites without RSS.
6. **Cross-tier signal triangulation as a bonus**: taobojlen had "Project Glasswing" 2026-05-22; Anthropic sitemap didn't yet (lag); Cloudflare's separate blog post about the same Mythos work was already in the radar. Each tier catches different framings/timings of the same event — useful redundancy.

### 3.2 Negative

1. **Classification cognitive overhead**: every new source requires the operator to evaluate "which tier?" before adding. A short checklist in `sources.yml` schema (`type: rss | sitemap | rsshub | scraper | ai-scraper | email-bridge`) plus this ADR mitigates.
2. **RSSHub adds an in-cluster dep**: another container to deploy + monitor + version-pin. Worth it given the breadth (900+ routes), but it's a moving part.
3. **AGPL contagion risk**: misuse of RSSHub (e.g. fork + run as a managed service) would impose AGPL on the fork. Personal-use over-network-boundary is safe.

### 3.3 Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| taobojlen abandons their scraper | Medium (community feeds die regularly) | Low (have Tier 0/1/2 alternatives for Anthropic) | Fork as insurance; document the failover path |
| RSSHub becomes paid / restricted | Low (10+ year MIT→AGPL history of openness) | Medium (radar loses a tier) | Self-host pinned version; routes are vendored in the image |
| Site adds anti-scraping (Cloudflare, bot challenges) | Medium for Tier-3 targets | High (scraper stops working) | Prefer Tier 0/1 sources; rotate to Tier 4 (Firecrawl handles anti-bot) if Tier 3 fails |
| Sitemap publish-lag misses time-sensitive items | Always present | Low (radar is a daily cadence, not real-time) | Pair sitemap polling with RSSHub for sites where latency matters |
| Chromium CVEs in Tier-3 scraper sidecar | Continuous | Medium (sidecar is non-internet-facing but processes external content) | Pin Playwright + Chromium versions in the scraper Dockerfile; gate updates through gitops |

---

## 4. Alternatives Considered

### 4.1 Tier-3-only (everything is Playwright)

**Rejected.** Bakes Chromium into the radar's primary container, ~300 MB image bloat for the 95% of sources that don't need it. Selector-maintenance burden compounds with every source added. ([taobojlen pattern is the demonstration of what this would look like in isolation — it's fine for one site, hostile at radar's intended source count.])

### 4.2 Tier-4-only (everything goes through Firecrawl)

**Rejected.** $83+/month for managed Firecrawl vs the radar's $0.21/month projected LLM spend on Haiku-cached. Cost-asymmetry off the chart. Also: Firecrawl's value is layout-change robustness, which Tier 0/1 sources don't need.

### 4.3 No policy — per-site ad-hoc

**Rejected.** This is what produced the two broken URLs in Phase 1. Without a policy, the next person (Ryan in 6 weeks, or any future maintainer/agent) repeats the hallucinate-URL or trust-stale-URL failure mode.

### 4.4 Inoreader Pro (£72/yr managed aggregator)

**Rejected** by ADR-049. Closed source, externalises trust, no provenance integration with ADR-047, recurring cost without proportional value.

### 4.5 Build our own RSSHub-equivalent

**Rejected.** RSSHub is a 10-year project with ~1000 contributors. Not a wheel worth re-inventing for a personal radar.

---

## 5. Implementation Hooks

### 5.1 Phase 2 (immediate consequence of this ADR)

1. **Update `sources.yml` schema** with `type: rss | sitemap` field (default `rss` for back-compat). Phase 2 Task 2.8 ConfigMap update.
2. **Add `fetch_sitemap()` to `feeds.py`** (Tier-1 implementation) per §2.3 above. New plan task — **Phase 2 Task 2.X (insert before 2.4)**.
3. **Replace broken Anthropic URL in `sources.py`** with one of:
   - Tier 1: `https://www.anthropic.com/sitemap.xml` (with `url_prefix=/news/`)
   - Tier 2 (after RSSHub deployed): `http://rsshub.rootweaver.svc.cluster.local:1200/anthropic/news`
   - Tier 3 (zero-effort now): `https://raw.githubusercontent.com/taobojlen/anthropic-rss-feed/main/anthropic_news_rss.xml`

   Recommend Tier-1 sitemap as the canonical solution; Tier-3 as a stopgap until Tier-1 ships.
4. **Replace broken NVD CVE URL** with one of:
   - Tier 5 (simplest): subscribe to CISA KEV email digests + bridge via kill-the-newsletter
   - Tier 4 (cleanest, future): add a JSON-Feed adapter to consume NVD's JSON API 2.0 — separate Jira

### 5.2 Phase 3 (optional)

5. **Deploy RSSHub sidecar** per §2.4 manifest. Unblocks ~10 more sources (Twitter accounts, individual ArXiv authors, GitHub releases per repo, Substack-by-author, etc.) without per-site code.
6. **Document the tier-classification checklist** in `packages/rootweaver-radar/AGENTS.md` so operator + future agents apply this ADR mechanically.

### 5.3 Deferred

7. **Tier-4 evaluation gate** — revisit only if Tier-3 maintenance burden empirically exceeds 1h/month on any single source. Until that signal arrives, do nothing.

---

## 6. References

### Architectural decisions
- [ADR-049-Personal-Industry-Radar-Pipeline](/adrs/049-personal-industry-radar-pipeline/) — original three-tier (ingest / filter / synthesise) radar design
- [ADR-050-Personal-Industry-Radar-Native-Implementation](/adrs/050-personal-industry-radar-native-implementation/) — native workspace package; consumes this ADR for feed acquisition
- [ADR-047-LLM-Content-Trust-Boundary](/adrs/047-llm-content-trust-boundary/) — provenance frame this ADR's outputs flow into

### Empirical evidence
- 2026-05-22-Radar-Restructure-Design *(internal reference; not included)* §11 — original risk register that flagged broken feeds
- 2026-05-23-Radar-Quality-Comparison *(internal reference; not included)* — experiment that surfaced the broken URLs
- 2026-05-23-Radar-Surfaced-Items *(internal reference; not included)* — concrete signal the radar caught

### External references (validated 2026-05-23)
- [RSSHub project docs](https://docs.rsshub.app/) — community RSS bridge
- [RSSHub Anthropic engineering issue #18943](https://github.com/DIYgod/RSSHub/issues/18943) — Anthropic route merged
- [taobojlen/anthropic-rss-feed](https://github.com/taobojlen/anthropic-rss-feed) — Playwright-pattern reference
- [Firecrawl](https://www.firecrawl.dev/) and [Firecrawl vs Crawl4AI](https://www.firecrawl.dev/alternatives/firecrawl-vs-crawl4ai) — AI-scraper landscape
- [Crawl4AI](https://github.com/firecrawl/firecrawl) — open-source Python crawler
- [ScrapeGraphAI](https://scrapegraphai.com/) — LLM-graph extraction
- [changedetection.io](https://github.com/dgtlmoon/changedetection.io) — out-of-scope change-detection tool
- [Sitemap protocol spec](https://www.sitemaps.org/protocol.html) — Tier-1 reference

### Jira
- VW-424 — radar implementation umbrella
- VW-418 — research umbrella
- VW-436 — pytest config consolidation (unrelated, surfaced in same session)

---

*ADR-051 authored 2026-05-23 after the Phase 1 quality experiment surfaced the no-RSS problem empirically. Tiered hierarchy informed by RSSHub catalogue review, sitemap.xml live verification on anthropic.com, taobojlen source-code review, and 2026 AI-scraper landscape survey.*
