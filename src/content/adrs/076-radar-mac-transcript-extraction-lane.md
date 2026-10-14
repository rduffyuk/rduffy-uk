---
id: 76
title: "Radar→Mac YouTube Transcript-Extraction Lane (off-cluster, rationed, BYO-data)"
status: accepted
recordedStatus: "Accepted"
date: 2026-06-14
tags: ["architecture", "knowledge-management", "radar", "youtube", "transcripts", "yt-ingest", "rate-limiting", "byo-data"]
sourceKind: source-record
public: true
journeyId: "2026-06-14-adr-076-radar-mac-youtube-transcript-extraction-lane-off-cluster-rationed-byo-data"
---
# ADR-076: Radar→Mac YouTube Transcript-Extraction Lane (off-cluster, rationed, BYO-data)

**Status**: Accepted (2026-06-14; posture proven in production 2026-06-13/14, VW-796 — 18 notes filed)
**Date**: 2026-06-14
**Jira**: VW-821 (parent), VW-796 / VW-816 / VW-817 (context)
**Consumes**: [ADR-051-Radar-Feed-Acquisition-Tiered-Hierarchy](/adrs/051-radar-feed-acquisition-tiered-hierarchy/) — radar *discovery* feeds this lane
**Respects**: [ADR-047-LLM-Content-Trust-Boundary](/adrs/047-llm-content-trust-boundary/) — transcripts enter via the untrusted-external-web lane
**Benefits-from**: [ADR-050-Personal-Industry-Radar-Native-Implementation](/adrs/050-personal-industry-radar-native-implementation/) — the trending lane (VW-794/795) that surfaces the YouTube items
**Related reports**: `06-Archive/.../2026-06-14-VW-816-yt-ingest-hardening-and-youtube-policy.md`, `06-Archive/.../2026-06-14-VW-817-radar-content-acquisition-vendor-ranking.md`, `02-Active-Work/.../2026-06-14-VW-796-radar-youtube-mining-gaps-synthesis.md`

---

## 1. Context

### 1.1 The gap ADR-051 does not cover

[ADR-051-Radar-Feed-Acquisition-Tiered-Hierarchy](/adrs/051-radar-feed-acquisition-tiered-hierarchy/) defines a tiered policy (Tier 0–5) for **discovering** industry signal from sites without native RSS. It answers "how do we *find out an item exists*?" For YouTube it lands on Tier 0: the official per-channel Atom feed (`youtube.com/feeds/videos.xml?channel_id=&lt;ID&gt;`), consumed on the radar's normal `fetch_feed` path. That is sufficient for the trending lane's job, which is a relevance **gate** scored on title + description only.

ADR-051 is silent on a second, fundamentally different problem: **extracting the full caption transcript** of an already-discovered YouTube item for deep, grounded ingestion into the vault (the `/yt-ingest` deep-analysis flow, VW-710/712). This is not discovery — the item is already known — and it has a completely different cost/risk profile:

- **Discovery is free and unlimited.** Atom metadata hits neither the `timedtext` endpoint nor any quota.
- **Extraction is rationed.** The caption endpoint enforces a **~25-request quota per public IP** (empirically confirmed twice on fresh cellular IPs, 2026-06-14; spacing-independent; block lasts hours — VW-816). It is also a **legal boundary**: no licensed third-party-caption route exists; personal non-commercial use is low-risk under UK CDPA s.29A, but a commercial product must use BYO-data, never centralised scraping (VW-816 policy note).

### 1.2 Why extraction is exiled off the cluster

VW-796 set `RADAR_TRENDING_YOUTUBE_ENRICH=false` in the radar's trending config. Two reasons:

1. **The cluster's egress IP is precious and singular.** Cluster-side caption enrichment was 100% IP-blocked, and burning the cluster's fixed-line IP on a ~25-request quota would poison every other cluster service that touches YouTube — with no cheap reset (the EE Smart Hub has no IP-rotation lever; a router reboot returns the same sticky IP — VW-816).
2. **The Mac has a cheap rotation lever the cluster lacks.** A cellular airplane-toggle gives a fresh CGNAT IP with a fresh ~25 budget. The Mac is also where the deep-analysis `/yt-ingest` flow already lives (mlx-whisper, captions-first).

So transcript extraction belongs on the Mac, downstream of (free) cluster discovery. The radar discovers; the Mac extracts.

### 1.3 The artifact this ADR makes permanent

VW-796 proved the posture with a `/tmp` prototype, `scope_channels.py`: fetch the radar's 11 YouTube channel Atom feeds, dedup against vault notes, apply a local relevance gate, write a mining queue. It worked (broadband block → one cellular toggle → 7/7 captions; 18 notes filed). But it was ephemeral and the channel list was duplicated by hand from the gitops configmap. This ADR promotes it into the skill and records the design.

## 2. Decision

Establish a **transcript-extraction lane** as a first-class, off-cluster complement to ADR-051's discovery tiers, embodied by a permanent bridge script in the `/yt-ingest` skill. The lane is a three-stage pipeline with a deliberate human-driven seam:

```
[cluster, free]                 [Mac, free]                       [Mac, rationed, human-driven]
radar trending discovery  ─►   scope + gate (scope_channels.py)  ─►  drain (yt_fetch.py --batch)
(ADR-050/051, Atom)             writes mining-queue.txt               ≤20/day + cellular overflow
```

Promote `scope_channels.py` from `/tmp` to `~/.claude/skills/yt-ingest/scripts/scope_channels.py`. Three design decisions (VW-821, chosen 2026-06-14):

### 2.1 Channel source = HYBRID (live configmap, vendored fallback)

The single source of truth is the gitops configmap `radar-trending-config` (key `trending-feeds.yml`) — the same list the radar runs on, so the bridge never drifts from what the radar actually tracks. The script reads it live via `ssh &lt;desktop&gt; kubectl get cm … -o json` and regex-extracts the `name`/`channel_id` pairs. On **any** failure (desktop unreachable, offline, SSH refused) it falls back to a **vendored copy** baked into the script.

- *Why not live-only:* the lane's whole premise is off-cluster + offline-capable; a hard cluster dependency would betray it.
- *Why not vendored-only:* silent drift when the radar adds a channel (it gained AI Engineer on 2026-06-13).
- *Stdlib constraint:* the configmap value is YAML, but the script is **stdlib-only by design** (no PyYAML → never breaks on the Mac). Resolved by fetching `-o json` (parsed by stdlib `json`) and regex-extracting the channel pairs from the embedded YAML string. No new dependency.

### 2.2 Command scope = discovery + gate + queue ONLY

The script stops at writing `mining-queue.txt`. It does **not** orchestrate the drain. The rationed extraction stays human-driven: `yt_fetch.py --batch mining-queue.txt`, ≤~20/day on broadband, cellular airplane-toggle on a 429.

- *Why:* the drain is the IP-quota-sensitive, legally-bounded, judgement-requiring step (when to toggle cellular, when to stop). Automating it removes the human from exactly the decision that needs one, and raises blast radius if a block lands mid-run. Clean separation of *free/safe/unlimited* (discovery+gate) from *rationed/judged* (drain).

### 2.3 Relevance gate = static keyword scorer

A zero-dependency keyword scorer: `+1` per SIGNAL term (Ryan's stack: rag, retrieval, agent, memory, context, eval, embedding, rerank, mcp, long-context, harness, …), hard-drop on NOISE terms (campaign, vibe reel, keynote slot, …). Tunable by editing two lists.

- *Why not reuse the radar's Haiku scorer:* it needs API spend + the radar package importable on the Mac — pulling cluster dependencies into the offline tool. The radar already applied its Haiku ≥6 gate upstream; this is a cheap, transparent **second** filter for Ryan's specific interests, not a replacement.

## 3. Consequences

**Positive**
- The radar→Mac mining workflow becomes a repeatable command, not a one-off `/tmp` artifact.
- No drift from the radar's real channel set (live configmap is authoritative; fallback keeps it offline-safe).
- The free/rationed seam is explicit in code and docs — the IP quota is spent only on a curated, deduped, relevance-gated trickle.
- Records the BYO-data boundary (VW-816) at the architecture layer: this lane is *personal-use, user-side ingestion*; it is deliberately **not** a centralised scraping service, and must never become one in a productised Rootweaver.

**Negative / costs**
- The lane is intentionally **not** fully automated — bulk transcript mining still requires human attention for the rationed drain. This is a feature (judgement on the legal/quota boundary), not a bug, but it caps throughput.
- The vendored fallback can go stale if the live read is unavailable *and* the radar changed channels in between. Mitigated by a documented one-command re-sync in the script header.

## 4. Risks & accepted trade-offs

- **XXE / billion-laughs on stdlib XML (accepted).** The script parses Atom with `xml.etree.ElementTree`. ElementTree does **not** resolve external entities (the classic XXE fetch vector is already closed); the only residual is an entity-expansion DoS that would crash this local throwaway script. The feeds are served by `youtube.com` over TLS (Google infra, not attacker-controlled), and the radar itself parses these same feeds server-side. Adding `defusedxml` would breach the load-bearing stdlib-only/offline premise. **Decision: accept the risk and document it here** rather than add the dependency. Revisit if the lane ever ingests attacker-controlled feed URLs.
- **IP quota (managed, not eliminated).** ~25 caption fetches per IP, multi-hour refill. The gate keeps the curated trickle well under quota; cellular toggle handles overflow. Do **not** probe-to-failure on broadband (blocks the whole house — VW-816).
- **Legal boundary (bounded by scope).** Personal non-commercial only. A commercial Rootweaver must use BYO-data (user fetches on their own infra/ToS) — this lane is the personal-scope reference implementation of that principle, not a product feature.

## 5. Alternatives considered

- **Fold into ADR-051.** Rejected — ADR-051 is discovery (cluster-side, free, unlimited); extraction is a distinct concern (off-cluster, rationed, legally bounded). Bloating ADR-051 would conflate two different cost/risk models.
- **Buy a transcript vendor (Supadata/Apify/Bright Data).** Rejected in VW-817 — all vendors scrape the same unlicensed endpoints and shift liability to the customer; ~$0.21/mo radar economics don't justify it; rate-limit + cellular is sufficient. Parked as a costed scale-up trigger (first reach = Apify YT-transcript actors when single-IP becomes the bottleneck).
- **Re-enable cluster-side enrichment with a proxy.** Rejected — burns the cluster's singular egress IP, no cheap reset, and the proxy is the same vendor problem.
- **Fully automate the drain.** Rejected (see §2.2) — removes the human from the quota/legal-judgement step.

## 6. Verification

- `scope_channels.py` run live 2026-06-14: live configmap path resolved 11 channels; 165 videos → 147 fresh → 47 gated; queue written. Vendored fallback exercised by design (offline path).
- Drain proven under VW-796: broadband block → one cellular toggle → 7/7 captions clean; 18 vault notes filed.
