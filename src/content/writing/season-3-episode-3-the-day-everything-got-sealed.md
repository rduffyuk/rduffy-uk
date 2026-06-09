---
author: Ryan Duffy
featured: true
categories:
- Season 3
- Security
- DevOps
pubDatetime: 2026-02-11 15:00:00+00:00
draft: false
episode: 3
series: 'Season 3: Building in Public (Oct 2025 — Feb 2026)'
description: "I exposed my MCP bridge to the internet so Claude.ai could search my vault remotely. Within 26 hours, Cloudflare logs showed 39 searches from 15+ Anthropic IPs — and I had no way to tell what they'd asked for. Here's the incident response that sealed every secret, obfuscated every endpoint, and bootstrapped a proper engineering workflow in the process."
tags:
- security
- sealed-secrets
- cloudflare
- mcp
- qdrant
- incident-response
- jira
- rootweaver
- building-in-public
- season-3
title: 'The Day Everything Got Sealed'
word_count: 4200
---
# Episode 3: The Day Everything Got Sealed

**Series**: Season 3 - Building in Public (Oct 2025 — Feb 2026)
**Episode**: 3 of 5
**Date**: February 1 — February 11, 2026
**Reading Time**: 25 minutes

---

## Opening the Door

![Opening the door — exposing the MCP bridge to the internet](../../assets/images/s3e3/01-opening-the-door.webp)

February 5th. I had a problem that had been bugging me for weeks: Claude Code on my MacBook could search my vault through the MCP bridge at `localhost:30002`. But Claude.ai — the web version, the mobile app — couldn't. My entire 148K-document knowledge base was locked behind SSH sessions and terminal windows.

I wanted to ask questions about my own architecture from my phone during commutes. I wanted Claude.ai Projects to have the same vault access as Claude Code. The MCP bridge was already running in K3s, already had tools for search, GPU status, model listing — everything I needed. The only problem was making it reachable from outside localhost.

The fix seemed straightforward. Cloudflare tunnel was already running on the cluster, exposing Grafana and a few other services. Route `mcp.rduffy.uk` to a new read-only MCP bridge. Strip all write operations. Ship it.

*Git evidence: commit `44fb96e` (Feb 5) — "feat(mcp): add read-only MCP bridge facade for Claude.ai remote access" — 445 lines creating `mcp_bridge_readonly.py`.*

The read-only facade was careful work. 445 lines of Python wrapping the 12 safest tools from the full MCP bridge:

- `auto_search_vault` — semantic search (the main one)
- `hybrid_search_vault` — BM25 + vector
- `search_with_reranking` — cross-encoder reranking
- `search_with_confidence` — confidence scoring
- `search_compressed` — token-efficient results
- `get_gpu_status` — GPU metrics
- `list_ollama_models` — available models
- `get_router_stats` — search performance stats
- `get_semantic_cache_stats` — cache hit rates
- `workflow_search_rules` — search CLAUDE.md rules
- `workflow_get_stats` — workflow statistics
- `workflow_analyze_commit` — git commit analysis

Explicitly excluded: `index_file_to_chromadb` (writes), `web_search_vault` (makes external API calls with my API key), `workflow_create_jira_issue` (writes to Jira). The threat model was clear: reads only, no side effects, no credential exposure through tool parameters.

I even wrote a proper implementation plan. It's in the vault: `2026-02-05-MCP-Remote-Access-Plan.md`. Four security layers documented:

1. **Read-only facade** — 12 search tools, write operations stripped
2. **Separate pod** — own K3s deployment, own NetworkPolicy, own port (8003)
3. **Cloudflare IP allowlist** — restrict to Anthropic's IP range
4. **Input validation** — query length limits (2,000 chars), sanitised parameters

Professional. Thorough. And completely missing the actual vulnerability.

*Git evidence: commit `8a7576e` (Feb 5, gitops) — "feat(mcp): deploy read-only MCP bridge + Cloudflare route for Claude.ai" — 8 files, NetworkPolicy, Prometheus scraping enabled.*

By 8AM on February 5th, `mcp.rduffy.uk` was live. Claude.ai could search my vault. I tested it from my phone over mobile data — asked about the RAG platform architecture, got proper results. Beautiful.

What I didn't check: what else was in the search index besides vault documents.

## The Indexer Was Indexing Everything

![The indexer was indexing everything — not just the vault](../../assets/images/s3e3/02-indexer-everything.webp)

The vault indexer is a straightforward component. It watches a directory, finds markdown and text files, generates embeddings via the Qwen3-Embedding-0.6B model, and pushes vectors to Qdrant. It runs as a K3s deployment with a `WATCH_PATH` environment variable that tells it where to look.

The `WATCH_PATH` was set to `/mnt/2tb/rootweaver-platform`.

Not `/mnt/2tb/rootweaver-platform/obsidian-vault`. Not the vault. The **entire platform directory**. Every file in every subdirectory. The indexer was faithfully doing exactly what it was configured to do — finding and indexing every piece of text it could reach.

That included:

- **Source code** — Python, YAML, JavaScript, Dockerfiles across 15+ services
- **Environment files** — `.env` files with API keys
- **GitOps manifests** — Helm values with inline passwords
- **Container registry configs** — `harbor-robot-claude.env` with registry credentials
- **Infrastructure details** — Internal IPs, NodePort assignments, service mesh topology
- **Full session transcripts** — Claude Code JSONL files with complete conversation history

All of it was indexed. All 148,000+ documents in Qdrant included source code, credentials, and infrastructure details mixed in with the vault content.

And now all of it was searchable from `mcp.rduffy.uk`.

The read-only facade I'd carefully built? It prevented writes. It didn't prevent reads from Qdrant — because reads are its entire purpose. "Search the vault and return results" is the happy path. The security boundary I needed wasn't at the API layer. It was at the indexer scope.

## Someone Walked In

![Unauthorized access — someone from outside querying the vault](../../assets/images/s3e3/03-someone-walked-in.webp)

I have a habit after deploying anything new: I watch the traffic. Cloudflare analytics, HTTP requests to pages and directories, security logs — partly to check nothing weird is happening, partly for the dopamine hit of seeing real traffic hit something I just built. After making the MCP bridge publicly accessible via Cloudflare on February 7th, I'd been doing exactly that. Within hours the logs showed something I didn't expect. Requests hitting the read-only MCP bridge from 15+ distinct IP addresses in the United States, all within Anthropic's IP range (160.79.106.x). Around 39 searches total. Timestamps that didn't align with any Claude.ai session I'd run. Traffic I hadn't generated.

The worst part? I had no way to tell what they'd searched for. The Cloudflare logs showed source IPs, request paths, and timestamps — but MCP Streamable HTTP POST bodies aren't logged. I could see that someone was searching my vault. I couldn't see what they asked. That uncertainty is worse than knowing.

I killed the DNS record from the Cloudflare dashboard immediately — manual deletion, not a git commit. The bridge was publicly accessible for roughly 26 hours before I pulled the plug. The gitops commits that followed over the next few days (scoping the indexer, obfuscating the subdomain, rotating credentials) were hardening an endpoint that was already offline.

*Git evidence: commit `044adb3` (Feb 11, gitops) — "fix(cloudflare): obfuscate MCP bridge subdomain for security" — the commit message includes the phrase "incident response for unauthorized access." But the actual takedown happened days earlier via the Cloudflare dashboard.*

Someone — likely other Claude.ai users whose MCP connector requests route through Anthropic's infrastructure — had hit my endpoint. They didn't need to break in. The endpoint was published at a predictable DNS name with no authentication. The Cloudflare WAF was configured to allow Anthropic's IP range. The tools were designed to return results. They asked, and the system answered — 39 times.

What could they have found by searching?

- **Harbor admin password**: `Harbor12345` (yes, the default — I hadn't rotated it since initial deployment months ago)
- **Internal service topology**: Which services talk to which, on what ports
- **Source code logic**: How the RAG pipeline processes queries, routes between agents
- **API configurations**: vLLM endpoints, Kafka topic names, KEDA thresholds
- **Session transcripts**: Full Claude Code conversations including debugging sessions

The read-only facade would have stopped anyone from modifying anything. But in a knowledge system, read access *is* the sensitive operation. The whole point of building a search platform is to make information easy to find. I'd made my own credentials easy to find too — and I couldn't prove nobody had looked.

## But First — The System That Tracks Itself

Rewind four days. February 1st, midnight. Before the MCP exposure, before the incident, before any of the security work — Claude and I spent the small hours of the morning building something that turned out to be essential.

*Git evidence: VW-1 created at 00:07 UTC, Feb 1 — "Test issue - Vectorweave project setup complete."*

At midnight on February 1st, we bootstrapped the entire Jira/Confluence workflow from scratch. Not just "created a project" — we built the automation rules that would auto-track all future work:

| Time | Issue | What Happened |
|------|-------|---------------|
| 00:07 | VW-1 | Project setup verified |
| 00:33 | VW-2 | Jira/Confluence MCP integration wired up |
| 01:32 | VW-3 | API-friendly diagrams for Confluence pages |
| 01:35 | VW-4 | Behaviour-based detection rules written |

Four issues in 88 minutes. The `jira-first-development.md` rules file I wrote that night has a section called "Rule 0: Behavior-Based Detection." It says: *"Don't just look for keywords — detect work from what you're ABOUT TO DO."* The detection table maps actions to issue types — "investigate/debug something" maps to Bug, "install tools/dependencies" maps to Improvement, "troubleshoot errors" maps to Incident.

I also set up the Confluence space that night: VW home page, Runbooks section (parent ID: 7372985), Architecture section (parent ID: 7438337), ADRs section (parent ID: 7503874). Templates for incident runbooks, post-incident reviews, ADRs, HLDs. All created between midnight and 2AM while the journal pipeline (Episode 2) was building in parallel.

The irony is thick: I built an issue tracking system that auto-creates tickets for security incidents, then four days later created the security incident it needed to track. But the system worked. When February 7th arrived, every single response action had a VW number before it had a commit.

## Same Night: The Monitoring Stack

![Fixing the monitoring stack at 2AM](../../assets/images/s3e3/04-monitoring-stack-2am.webp)

February 1st and 2nd weren't just about journals (Episode 2) and Jira. Late on February 1st I was updating architecture documentation — writing up the current state of the platform — and ran a pod status check as part of that work. Four monitoring issues fell out of it back to back, spilling into the early hours of February 2nd.

**VW-16** (23:47 → 00:08): Loki in CrashLoopBackOff. The log aggregator — the system that collects logs from every other pod — was itself down. Not for hours. For **eleven days**. 258 restarts, crash-looping every 30 seconds since late January. I don't sit watching Grafana dashboards — I rely on alerts routed to Discord — but the alerts depend on the log pipeline, and the log pipeline was the thing that was broken. A perfect circular dependency: the system that should have told me it was down couldn't tell me it was down. The root cause: deprecated config fields in Loki 3.6.4. `blocks_downloading_queue` and `bloom_compactor` had been removed entirely, and a YAML sequence parsing error on top. Three config problems stacked, each one enough to crash the pod on startup.

**VW-17** (00:29): Grafana datasource UIDs pointing at datasources that didn't exist. Six dashboards showing "No data" — and I'd been assuming "no data" meant "nothing interesting is happening" rather than "the dashboard is broken." The provisioned datasource UIDs had been regenerated during a Helm upgrade weeks ago. Every `${DS_PROMETHEUS}` reference was dangling. The dashboards looked fine at a glance. They just weren't connected to anything.

**VW-18** (00:47): Three datasources not provisioned at all — Tempo (traces), Loki (logs), and Jaeger (distributed tracing). The dashboards existed but had no backends. Like a car with a full instrument panel and every gauge disconnected — it looks operational until you try to read the speedometer.

**VW-19** (01:19): OpenLIT and DORA dashboards referencing the wrong Prometheus endpoint. The DORA metrics dashboard — the one measuring deployment frequency, lead time, change failure rate, the metrics that are supposed to tell you how healthy your engineering process is — was querying a Prometheus instance that didn't have the `flux_` metrics it needed. The dashboard designed to measure deployment reliability couldn't reliably measure anything.

*Git evidence: four gitops commits between 00:08 and 02:04 — Helm value patches, datasource ConfigMaps, dashboard JSON updates.*

Classic monitoring antipattern: the system that's supposed to tell you things are broken was itself broken. These four fixes at 2AM gave us actual visibility into the cluster — Loki for logs, Tempo for traces, Prometheus for metrics, Grafana dashboards that actually showed data. Which turned out to be essential five days later when we needed to understand what had happened.

## The Quiet Days

February 3rd and 4th were quieter. The journal pipeline (Episode 2) was churning through prompt versions — v5 and v6 landed during those days — and I was doing general platform maintenance. Nothing that warranted its own narrative. February 6th was similar: the MCP bridge was live but I was focused on testing it from Claude.ai, iterating on connection issues that would become Episode 4's story. The security exposure hadn't surfaced yet.

These gaps matter for the timeline. The gitops commit adding the Cloudflare route landed on February 5th, but the bridge wasn't fully accessible until February 7th. I spotted the unauthorized traffic within a day and killed the DNS record from the Cloudflare dashboard on February 8th. Roughly 26 hours of public exposure — enough for 39 searches from 15+ Anthropic IPs. The git commits that followed over the next three days (indexer scoping, subdomain obfuscation, credential rotation) were hardening work on an endpoint I'd already pulled offline.

## February 7: The Sealing Sprint

![The 86-minute sealing sprint](../../assets/images/s3e3/05-sealing-sprint.webp)

The security response on February 7th was the most concentrated burst of work in the project's history. Eight Jira issues created and resolved between 10:05 and 11:31 — eighty-six minutes of continuous execution. And it wasn't the only thing happening that day — VW-32 (NetBox IPAM deployment) was running in parallel across separate sessions, but the security work took absolute priority.

### 10:05 — VW-25: Should We Use HashiCorp Vault?

First instinct: "We need a proper secrets manager. Enterprise-grade. HashiCorp Vault."

Claude and I evaluated it seriously. Vault OSS needs its own highly-available deployment — three replicas minimum for production use. It needs auto-unseal configuration (otherwise someone has to manually unseal after every restart). It needs backup and restore procedures for the encryption keys. It needs audit logging, access policies, secret engines.

For a single-node K3s homelab running on a desktop under my TV? The operational overhead would be higher than running the actual platform.

*Vault evidence: ADR — "Evaluate HashiCorp Vault OSS for secret management" — Status: Rejected. Reason: operational overhead exceeds security benefit for single-node deployment.*

### 10:25 — VW-26: Secret Leak Prevention Hook

While evaluating Vault, a second concern surfaced: even if we seal all the K8s secrets, what about secrets that flow through Claude Code sessions? If I paste an API key into a conversation, it goes to Anthropic's API. If the session transcript gets indexed, it goes into Qdrant. Same exposure vector, different path.

The fix: a Claude Code pre-send hook that scans every outbound message for high-entropy strings. Shannon entropy above 4.5 on a token longer than 20 characters gets flagged as a potential secret. The hook blocks the message and asks for confirmation.

```
# Example: hook catches a pasted API key
⚠️  Potential secret detected: "sk-ant-api03-..."
    Entropy: 5.2 (threshold: 4.5)
    Block sending? [Y/n]
```

Built, tested, deployed in 5 minutes. Then immediately hit the first false positive.

### 10:34 — VW-27: Local Key Vault

For MacBook-side secrets, we built a macOS Keychain integration. API keys stored in the system keychain, retrieved at runtime via `security find-generic-password`, never written to disk as plaintext. Claude Code accesses them through environment variables injected at session start.

### 10:57 — VW-28: Sealed Secrets — The Real Fix

This was the core response. Bitnami Sealed Secrets uses asymmetric encryption — you encrypt secrets client-side with the controller's public certificate, commit the encrypted `SealedSecret` to Git, and the controller inside the cluster decrypts them into regular Kubernetes `Secret` objects.

The beauty: encrypted secrets are safe to commit to Git. You get GitOps for secrets. No manual `kubectl apply` for sensitive values.

```bash
# The workflow for each service:
# 1. Write the plain-text secret
cat <<EOF > /tmp/harbor-secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: harbor-admin
  namespace: harbor-system
stringData:
  password: "new-rotated-password-here"
EOF

# 2. Seal it with the cluster's public cert
kubeseal --format yaml \
  --cert ~/sealed-secrets-pub-cert.pem \
  < /tmp/harbor-secret.yaml > sealed-harbor-secret.yaml

# 3. Commit the sealed version (encrypted, safe in Git)
git add sealed-harbor-secret.yaml
git commit -m "security(secrets): seal harbor-admin credentials"

# 4. Push — FluxCD reconciles — controller decrypts inside cluster
git push

# 5. Clean up plaintext
rm /tmp/harbor-secret.yaml
```

Six services sealed in one session: Harbor registry, Qdrant authentication, vLLM API access, Perplexity API key, MCP bridge tokens, monitoring stack credentials. Each one: write plaintext to `/tmp`, seal with cert, commit encrypted version, push, delete plaintext.

There was a gotcha I hit immediately. The Sealed Secrets controller refused to create secrets that already existed: *"already exists and is not managed by this controller."* The fix: `kubectl delete secret harbor-admin -n harbor-system` first, then let the controller recreate it from the SealedSecret. After deleting the old secret, sometimes I had to also delete and recreate the SealedSecret because the controller cached the failure.

### 10:58 — VW-29: False Positive Fix

One minute after the Sealed Secrets issue was created, the secret scanner false positive issue landed. The entropy-based scanner was flagging file paths as potential secrets because long filesystem paths have high Shannon entropy. `/Users/rduffy-mac/2tb/rootweaver-platform/obsidian-vault/09-System/Architecture/` easily exceeds 4.5 entropy.

Fixed with a path detection heuristic: if the string contains `/` characters in a pattern consistent with Unix paths, skip the entropy check. Also added a whitelist for known safe patterns like Obsidian vault paths and Git commit hashes.

### 11:10 — VW-30: Error Masking and Input Sanitisation

With the secrets sealed and the scanner running, one more layer: making sure the bridge itself didn't leak information through error messages. Stack traces, file paths, internal service names — all of these can appear in unhandled error responses. VW-30 added structured error masking to the read-only bridge. External callers get a generic error code. Internal details stay internal.

### 11:25 — VW-31: Rotate the Perplexity API Key

The Perplexity API key had been sitting in a plain-text Kubernetes secret since the service was first deployed. Now that Sealed Secrets was running, we could do this properly: generate new key on the Perplexity dashboard, seal it, commit, push, FluxCD reconciles, pods restart with the new key. Old key revoked.

### 11:31 — Sprint Complete

Eight issues. Eighty-six minutes. From "we have a problem" to "every secret is sealed, every key is rotated, every hook is in place."

But the blast radius wasn't fully controlled yet.

## February 9-11: Blast Radius Control

![Nuking and rebuilding the Qdrant collection](../../assets/images/s3e3/06-nuke-and-rebuild.webp)

Sealed Secrets stopped new credentials from leaking into Git as plaintext. But Qdrant still contained everything the indexer had scraped over the previous weeks — including the Harbor password, source code, and infrastructure manifests. Anyone querying through the MCP bridge could still find them.

February 8th was a full day of continued platform work — VW-33 through VW-44 landed across five sessions, mostly non-security improvements and the continued journal pipeline iteration from Episode 2. But the Qdrant exposure was the priority.

### VW-45: Nuke and Rebuild

*Git evidence: commit `bca174c` (Feb 9) — "feat(index): rename collection to rootweaver_vault, scope to obsidian-vault only" — 10 files changed, 1,497 insertions.*

No half measures. The entire Qdrant collection was deleted and rebuilt from scratch, this time with a properly scoped indexer:

```yaml
# Before (EXPOSED — indexed the entire platform)
WATCH_PATH: "/mnt/2tb/rootweaver-platform"

# After (FIXED — vault content only)
WATCH_PATH: "/mnt/2tb/rootweaver-platform/obsidian-vault"
```

The collection was renamed from `leveling_life_qwen3` to `rootweaver_vault` — a clean break that also made any cached references to the old collection fail safely. New exclusion rules added: no credentials, no full session transcripts, no `.makemd` Obsidian metadata, no `.space` files.

The rebuild itself took about 45 minutes. The Qwen3-Embedding-0.6B model running on vLLM processed the vault's ~37,000 documents at roughly 800 documents per minute — each one chunked, embedded into 1024-dimensional vectors, and upserted into the fresh collection. During that window, search was completely offline — though it didn't matter externally, because the Cloudflare DNS record had been killed two days earlier. The bridge was dark to the outside world. Internally, any Claude Code query via the local MCP bridge on port 30002 returned empty results until the reindex completed.

A critical detail: this change was made in the application code on Feb 9, but the GitOps deployment manifest still had the old `WATCH_PATH`. If the pod restarted before the GitOps fix landed, it would revert to indexing the entire platform. Commit `df2acbe` on Feb 11 persisted the scope change to the deployment YAML. That two-day gap between the code fix and the manifest fix was a risk window I didn't love.

### VW-46: Rotate Harbor

*Git evidence: commit `77fea4f` (Feb 11, gitops) — "fix(harbor): rotate admin password after credential exposure."*

The commit message is explicit: *"Previous default password (Harbor12345) was indexed in Qdrant and searchable via MCP bridge before VW-45 scoped the index to vault-only."*

New password generated via `openssl rand`, sealed with kubeseal, committed to GitOps. FluxCD reconciled it into the cluster. Old password burned. The default that was supposed to be "temporary" for three months was finally gone.

### DNS Obfuscation

*Git evidence: commit `044adb3` (Feb 11, gitops) — "fix(cloudflare): obfuscate MCP bridge subdomain for security."*

`mcp.rduffy.uk` became `<sha256-hash>.rduffy.uk`. A hash-based subdomain. Can't enumerate it. Can't guess it. The MCP bridge still works for Claude.ai — you just need to know the exact URL, which only exists in my Claude.ai Project configuration.

## The Numbers

![The numbers — incident response by the data](../../assets/images/s3e3/07-the-numbers.webp)

| Metric | Value |
|--------|-------|
| **Jira issues (security)** | 10 (VW-10, 13, 25-31, 45, 46) |
| **Jira issues (monitoring)** | 4 (VW-16-19) |
| **Jira issues (workflow bootstrap)** | 4 (VW-1-4) |
| **Services sealed** | 6 (Harbor, Qdrant, vLLM, Perplexity, MCP, monitoring) |
| **Secrets rotated** | 2 (Harbor admin, Perplexity API) |
| **Exposure window** | ~26 hours (Feb 7-8) |
| **Unauthorized searches** | ~39 from 15+ Anthropic IPs |
| **Sealing sprint duration** | 86 minutes |
| **Qdrant docs before** | 148,000+ (full platform) |
| **Qdrant docs after** | ~37,000 (vault-only) |
| **Reindex duration** | ~45 minutes |
| **Monitoring dashboards fixed** | 4 |
| **Grafana datasources corrected** | 6 |
| **Secret scanner false positive rate** | ~15% (fixed with path heuristic) |

## What Worked

**Jira-first workflow caught everything.** Every action in the response had a ticket before it had a commit. When I look back at February 7th, there's a complete audit trail — what was found, what was done, in what order. That only exists because the tracking system was built four days earlier.

**Sealed Secrets was the right tool.** HashiCorp Vault would have taken days to deploy properly. Sealed Secrets took 86 minutes for 6 services. The asymmetric encryption model fits a homelab perfectly — zero operational overhead after initial setup. Secrets live in Git, encrypted, versioned, reconciled by FluxCD like everything else.

**Nuking the Qdrant collection was correct.** Trying to selectively delete exposed documents from a 148K-doc vector database would have been error-prone and incomplete. Delete the collection, fix the scope, rebuild from clean. It's the only approach that guarantees nothing leaks through.

**Having monitoring working mattered.** The Feb 2 monitoring fixes (VW-16-19) weren't sexy work. Fixing datasource UIDs and Helm config fields at 2AM feels like busywork. But when the security incident hit, we had Loki logs, Prometheus metrics, and Grafana dashboards that actually showed data. The 2AM fixes paid for themselves five days later.

## What I Learned

![What I learned — search systems are exfiltration vectors](../../assets/images/s3e3/08-what-i-learned.webp)

**1. Search systems are exfiltration vectors**

A vector database is designed to find things. If you index secrets and expose the search endpoint, you've built a secrets search engine. The security boundary isn't the API layer — it's the indexer scope. Every search system should have an explicit content boundary, not just an access boundary.

**2. Default passwords are never temporary**

`Harbor12345` was supposed to be changed "after initial setup." That was three months ago. Defaults persist because nothing forces you to change them — until someone finds them. The only safe default is no default.

**3. Security layers need to be composed, not stacked**

Four security layers sounds impressive on an architecture diagram. But none of them addressed the actual vulnerability — what was *in* the database. Read-only facade, IP allowlist, input validation, separate pod — all protecting the door while the contents of the room were the problem. The layers were stacked (each adding marginal protection) when they should have been composed (each covering a different dimension of risk).

**4. Build the tracking system before you need it**

The Jira bootstrap on February 1st felt like overhead at the time — creating issue types, writing detection rules, configuring Confluence templates. Four days later it was the difference between "we responded to an incident with a complete audit trail" and "something happened and we're not entirely sure what." Invest in observability and tracking *before* the crisis.

**5. GitOps makes incident response reproducible**

Every fix was a git commit. Every commit was reconciled by FluxCD. If we needed to redo the entire response — seal secrets, rotate keys, fix monitoring — it's all in version control. `git log --oneline` *is* the incident timeline. That's not possible with manual `kubectl apply` workflows.

**6. Not all AI traffic is the same — and Cloudflare lets you choose**

While investigating the MCP bridge traffic, I fell down a rabbit hole about AI bot management. Cloudflare's AI Audit dashboard showed my site was being hit by scraper farms — aggressive bots from China and the Netherlands, hundreds of requests, ignoring `robots.txt` entirely. But Cloudflare splits AI traffic into three categories that matter:

- **AI Crawlers** (GPTBot, ClaudeBot, Bytespider, Meta-ExternalAgent) — scraping for training data. Block unless you want your content in the next model.
- **AI Search** (Claude-SearchBot, PerplexityBot, OAI-SearchBot) — fetching content to answer user queries in real-time. Block and your site disappears from AI search results.
- **AI Assistant** (ChatGPT-User, Claude-User) — fetching a specific URL because a user explicitly asked. Block and nobody can say "summarise this page."

You can toggle each category independently. And for the crawlers that ignore the rules entirely, Cloudflare has AI Labyrinth — instead of returning a 403 (which tells the bot to try harder), it serves them an AI-generated maze of convincing fake pages. The bot follows link after link of plausible nonsense, wasting its crawl budget on junk. Real visitors never see it. It's the cleverest honeypot I've encountered — and another reason Cloudflare sits in front of everything I expose to the internet.

## What's Next

The MCP bridge is still live — behind an obfuscated DNS name, with vault-only indexing, sealed secrets, input validation, and error masking. The read-only facade remains the right pattern. The scope fix was the missing piece.

But getting Claude.ai to actually *connect* to the bridge? That was its own three-day debugging saga. SSE transport vs Streamable HTTP. Accept headers that FastMCP requires but Claude.ai doesn't send. A 406 error that only appears on the initial probe.

That's Episode 4.

---

*This is Episode 3 of "Season 3: Building in Public" — documenting what happens when you expose a search system to the internet without checking what it's searching.*

**Previous**: [Episode 2 — Streaming Journals: Kafka Meets LLMs](/posts/season-3-episode-2-streaming-journals)
**Next**: [Episode 4 — MCP Everywhere](/posts/season-3-episode-4-mcp-everywhere) (Coming Soon)
**Complete Series**: [Season 3](/tags/season-3/)
