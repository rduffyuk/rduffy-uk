---
title: "Twenty-six hours, twelve tickets — and the audit that started everything else"
author: Ryan Duffy
categories:
- Season 3
- Architecture
- Security
- Operations
description: A false-alarm audit on Wednesday patched 37 CVEs, reverted a cluster upgrade in fourteen minutes, then cascaded into ten more tickets on Thursday. Twelve tickets, twenty-six hours, one lesson.
draft: false
episode: 6
featured: true
pubDatetime: 2026-05-24 12:00:00+00:00
reading_time: 25 minutes
series: 'Season 3: Building in Public (Oct 2025 — May 2026)'
slug: season-3-episode-6-wednesday-audit-thursday-cascade
tags:
  - security
  - cve
  - lynis
  - ufw
  - spacy
  - ner
  - yake
  - cloudflare
  - rootweaver
  - building-in-public
  - season-3
word_count: 5120
---
## Twenty-six hours, twelve tickets — and the audit that started everything else

Between Wednesday 18 March 2026 at 22:20 UTC and Thursday 19 March at 22:37 UTC, twelve Jira tickets opened and twelve closed on a project that has exactly one engineer. None of them were planned at the start of Wednesday evening. The proximate trigger was a vague feeling in the Cloudflare logs the night before that some traffic against the platform's public hostnames had a pattern I didn't recognise.

The feeling turned out to be wrong. There was no probing. There was no compromise. There was, however, an inactive firewall, three services bound to `0.0.0.0`, thirty-eight Python dependency CVEs in the platform's venv, an LLM-based NER pipeline that had been confidently extracting *"comprehensive observability platform"* and *"leveraged cutting-edge tools"* as named entities, an Architecture documentation set that had drifted from the live cluster across five HLD modules, seven Alertmanager alerts that had been firing for days, an arch-review pipeline failing on DeepSeek-R1's thinking-mode token exhaustion, and a one-night attempted cluster upgrade that needed to be reverted fourteen minutes after it shipped.

All of those surfaced because of one false alarm.

This post is about why an audit triggered by the wrong threat model produced a list of fixes that needed addressing anyway, and what the pattern across the twelve tickets says about how the platform is actually maintained. The unifying lesson, which is the same one S3E5 closed on, generalises across all three threads: **when your problem has bounded shape, a bounded tool beats a general-purpose one — even if the general-purpose one is the impressive-looking model**. The security audit said no to defaults. The NER reversal said no to using a reasoning model for a deterministic extraction task. The infrastructure-hygiene threads each retired a piece of fluent-but-wrong abstraction. *Right tool for the shape of the problem* is the through-line.

![A retro-anime engineer at a multi-monitor cyberpunk workstation at night, three screens glowing with code and dashboards, deep purple and blue ambient lighting, city skyline through the window](/posts/s3e6/final/01-hero-patternA-seed42.png)

## Wednesday evening — the audit that found nothing also found everything

The first thing on Wednesday 18 March was a forensic sweep against both desktop and MacBook. `lastb` and `journalctl -u ssh` for failed SSH attempts: zero, on both. `ps -ef` for unfamiliar processes or reverse shells: nothing. The `authorized_keys` files were as expected. The Tailscale audit log showed only authorised mesh devices. `rkhunter --check` was clean apart from hash warnings left over from a prior OS upgrade. Pip and npm audits returned no malicious packages.

No compromise. The right move at that point was to write up the non-incident and reclaim the evening. I didn't, and the rest of the audit ran on momentum.

[UFW](https://launchpad.net/ufw) on the desktop was inactive. The firewall I had assumed was running had been off for months — SSH from anywhere, xRDP from anywhere, legacy Vast.ai ports from anywhere. I enabled it with seven rules covering [Tailscale](https://tailscale.com/), the [K3s](https://k3s.io/) pod and service CIDRs, LAN-only SSH and NodePorts, and loopback for the Cloudflare tunnel. SSH was on defaults: `PasswordAuthentication yes`, `MaxAuthTries 6`, all forwarding allowed, `MaxSessions 10`. I locked it down to key-only, three max attempts, no forwarding of any kind, two sessions per connection, verbose logging. Three services were bound to `0.0.0.0` and reachable from anything that could route to the host — PostgreSQL on 5432, Postfix SMTP on 25, Ollama on 11434. All three rebound to `127.0.0.1`. Redis config was world-readable and contained the password. The Postfix banner was leaking the OS string. xRDP and guacd were running for nobody — installed months earlier for a remote-access experiment I had abandoned without disabling.

The CVE sweep was the largest single finding. [`pip-audit`](https://pypi.org/project/pip-audit/) against the platform's Python venv (317 packages) returned **38 CVEs across 20 packages**. Eight in `aiohttp` alone, five in `urllib3`, three in `authlib`, one each across `cryptography`, `pyjwt`, `langchain-core`, plus eleven scattered across smaller libraries. Thirty-seven were patched by `pip install --upgrade`. The thirty-eighth was `diskcache 5.6.3`, CVE-2025-69872 — a pickle-deserialisation RCE with no patched version. Risk-accepted: it is a transitive dependency from [FastMCP](https://github.com/jlowin/fastmcp) and only deserialises data I control. Confirmed still present in the venv as of this writing, tagged for the next upgrade that drops the dependency.

The Cloudflare tunnel cleanup that closed out the security thread was the same shape as the UFW finding: setup decisions never revisited. Sixteen tunnel hostnames I had published over the past few months; seven had [Cloudflare Access](https://www.cloudflare.com/products/zero-trust/access/) in front of them, six had no auth at all, three pointed at offline services. The six unprotected routes came from having set up the tunnel before Cloudflare Access was wired in and never going back to retrofit auth on the early routes. Seven removed (including the three offline ones), Access kept on the rest. Internal access still works via Tailscale.

The [Lynis](https://cisofy.com/lynis/) hardening index on the desktop went from 59 out of 100, with four warnings and fifty-eight suggestions, to a much cleaner state with zero warnings remaining. The MacBook came in at 70 out of 100 with one warning and sixteen suggestions — macOS defaults are more conservative out of the box.

All of that was filed as VW-147 after it was done. The ticket was created at 20:55 UTC and resolved at 20:59 UTC. Four minutes. The Jira-first development rule on this project specifies that tickets should exist before work starts, but in practice that discipline degrades into a useful audit trail when the work is exploratory — you find what you find, then capture it. The right honest framing is *ratification* rather than *planning*. The Jira state still tracks what shipped; it just doesn't always reflect the order of decisions.

*The right time to audit is when you have the time and the forensic mindset on, not when an incident forces it.* The probe-suspicion was wrong. The audit was real. **Defaults persist unless you actively change them, and the only safe default is no default.**

![A translucent circuit board held against a glowing teal backlight panel, hairline fractures and fault lines visible along copper traces — the audit that found nothing also found everything](/posts/s3e6/final/02-xray-circuit-patternK-seed42.png)

## Wednesday late evening — the cluster upgrade that lasted fourteen minutes

VW-148 was opened at 22:17 UTC, three minutes after VW-147 was closed. Twenty-two cluster components had been on outdated chart versions for some weeks. The plan was to roll the whole set forward in one batch while I was already in the kind of cleanup headspace the security audit had triggered.

The git log records what actually happened in fourteen minutes:

```
22:20:50 UTC  chore(infra): upgrade 22 components across cluster (VW-148)
22:26:13 UTC  fix(infra): fix Tailscale v2beta2 API + Unleash tag format (VW-148)
22:34:09 UTC  fix(infra): revert Tailscale/Harbor to available chart versions (VW-148)
```

Tailscale's new release referenced a `v2beta2` API path my cluster didn't expose. [Unleash](https://www.getunleash.io/)'s new release had a tag format change that broke the existing flag rollouts. Both were attempted-fix territory at 22:26 UTC; both were reverted at 22:34 UTC because the fixes weren't going to be quick. The ticket stayed open another day and a half while the reverted state proved stable in passive use; formally closed Friday 20 March at 17:24 UTC.

![A large retro analog clock face in a dark cyberpunk instrument panel, the minute hand frozen between two positions — one tick glowing steady teal, the adjacent flickering amber](/posts/s3e6/final/03-frozen-clock-patternL-seed42.png)

Two things worth noting from that fourteen-minute window. First: the *willingness to revert quickly* is what made the rest of the week possible. Sitting with the broken upgrade for another half hour to try a hotfix would have eaten the time that Thursday's work needed. *Reverts are cheap; persistence in the face of broken state is expensive*. Second: the upgrade attempt happened because I was already in cleanup mode. The same momentum that produced the firewall fixes produced the upgrade attempt. **Energy is fungible, but only within a single sitting.** If I had waited until Thursday to attempt the upgrade I probably wouldn't have. The audit borrowed itself an extra ticket on the strength of being unfinished.

## Thursday — the cascade

The audit closing didn't mean the day was done. Thursday opened with ten more tickets that stretched from morning through to late evening, split across three threads running mostly in parallel.

The first ticket of the day was VW-149, opened early on: a read-only filesystem error in the MCP bridge's PDG cache directory. The bridge (the gateway that exposes the platform's code-knowledge graph as MCP tools to Claude Code — see S3E5 for the architecture) had been trying to write cache files into a path mounted read-only in its K8s deployment manifest. Every cache miss became a write failure became a noisy error log, which had been quietly burning Loki storage for days before anybody noticed. Twelve minutes to fix — a mount-path correction and a rebuild. It is worth naming explicitly because it set the rhythm for the rest of the day: identify the symptom, find the smallest possible fix, close the ticket, move on. *Small surface area is its own discipline.* Most of the Thursday cascade ran on this pattern.

### The NER pipeline rewrite — replacing a reasoning model with deterministic extraction

Some quick context first. The platform's vault is automatically tagged with named entities — people, organisations, technologies, projects — extracted from each markdown file as it is written. Those tags then drive the knowledge-graph view in Obsidian, the faceted-search filters, and a chunk of the RAG retrieval scoring. The job of pulling those entities out of the prose is called **Named Entity Recognition** (NER) in the literature. It is exactly the bounded extraction task this episode's framing keeps gesturing at — closed vocabulary, deterministic rules, no creativity required.

The morning's largest piece of work started with a glance at the Obsidian vault graph view. The graph was unreadable. Auto-tagged entity nodes had ballooned to the point where `project/comprehensive`, `project/leveraged`, and `tech/cutting-edge` were first-class nodes — words that should never have been named entities had been confidently extracted by the LLM-based NER pipeline and were now embedded throughout the knowledge graph.

The pipeline at that point used [DeepSeek-R1](https://huggingface.co/deepseek-ai/DeepSeek-R1) 8B (the same model that had been hallucinating in the journal pipeline back in February — the lesson from S3E2, apparently not fully internalised). Every vault file change triggered a [Prefect](https://www.prefect.io/) CronJob that re-ran the LLM against the changed files, asked it to extract named entities, and wrote the results into the file frontmatter as tags.

The problem with using a reasoning model for NER is that reasoning models want to be helpful. Given a vault note about *"the comprehensive observability platform we built using leveraged cutting-edge open-source tools"*, DeepSeek would dutifully extract `["comprehensive observability platform", "leveraged cutting-edge open-source tools", "observability", "open-source", "platform", "comprehensive", "leveraged", "cutting-edge"]`. Every adjective and adverb became a first-class entity.

Filed as VW-152 mid-afternoon, with commits landing through the rest of the day into the evening, full deploy by early evening. The actual work was wider than the ticket title suggests. The git commit sequence captures it:

```
fix(ner): strip 24,103 hallucinated NER tags from 1,463 vault files (VW-152)
build(ner): add dedicated NER consumer Docker image with spaCy baked in (VW-152)
feat(ner): switch ScaledJob to dedicated ner-consumer:v1 image (VW-152)
feat(watcher): containerize file watcher for K8s deployment
fix(ner): add noise word filter and YAKE/inotify/watchdog patterns (VW-152)
```

Five things in ninety minutes. The vault cleanup pass removed **24,103 hallucinated NER tags from 1,463 files** — only tags with NER prefixes (`tech/`, `tool/`, `concept/`, `project/`) were stripped; manual tags and document content were untouched. A new container image `rootweaver/ner-consumer:v1` was built with [spaCy](https://spacy.io/) and the `en_core_web_lg` model baked in — about 800MB, but that 800MB replaced a 60-second pip-install cold-start every time the consumer scaled up. The job (already [KEDA](https://keda.sh/)-driven — KEDA being the event-driven autoscaler for Kubernetes that spins pods up and down in response to Kafka topic lag rather than CPU thresholds) switched to the new image. The file watcher itself was containerised and migrated from a user systemd service on the desktop to a K8s Deployment with health probes — `rootweaver/file-watcher:v1` at about 30MB, [watchdog](https://pypi.org/project/watchdog/) plus [confluent-kafka](https://github.com/confluentinc/confluent-kafka-python). The noise-word filter and YAKE patterns landed in the cleanup commit.

The replacement pipeline has three stages, none of which involve an LLM. The default `NER_BACKEND=spacy` (the LLM backend code path still exists in `ner_pipeline.py` but is no longer the default — made non-default rather than deleted, to leave the option open). spaCy's `en_core_web_lg` extracts PERSON, ORG, GPE, PRODUCT, EVENT entities using the standard pre-trained model. An [EntityRuler](https://spacy.io/api/entityruler) layer adds **119 custom patterns** (113 at the time of the impl report; six added since for new domain terms) — patterns like `{"label": "TECH", "pattern": [{"LOWER": "kafka"}]}` and `{"label": "PROJECT", "pattern": [{"LOWER": "vw-"}, {"IS_DIGIT": true}]}`. [YAKE](https://github.com/LIAAD/yake) — Yet Another Keyword Extractor (Campos et al., *Information Sciences* 2020) — supplements spaCy by surfacing multi-word phrases the entity model misses. Where spaCy uses a pre-trained neural model to recognise standard entity types, YAKE uses pure statistics — term frequency, position in the document, co-occurrence patterns between candidate words — to score phrases by how *important to this particular document* they are, whether or not they match any known category. That makes it good at catching domain-specific terms (internal service names, ticket IDs, technology combinations like "Kafka topic lag" or "Qdrant scalar quantization") that no general-purpose NER model would ever have been trained on. Output gets filtered against an allowlist of namespaces and trimmed to alphanumeric plus hyphens, max 30 characters.

The shape of the change is easier to see end-to-end than to describe in prose:

```
BEFORE — LLM-BASED NER  (pre-Mar 19)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

         Vault file change
                │
                ▼
         Prefect CronJob  (every 15 min, batch over changed files)
                │
                ▼
         DeepSeek-R1 8B  (GPU — served via vLLM, contends with everything else on the GPU)
                │
                │  4600ms / file
                │  25% precision · 75% hallucinated
                ▼
         File frontmatter  (bloated with garbage tags:
                            "comprehensive", "leveraged", "cutting-edge")


AFTER — spaCy + EntityRuler + YAKE  (Mar 19, afternoon onwards)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

         Vault file change
                │
                ▼
         file-watcher pod  (watchdog + confluent-kafka, K8s Deployment)
         debounce 5s
                │
                ▼
         Kafka topic: vault.file-events
                │
                ▼
         KEDA scales ner-consumer pod  (CPU — no GPU contention)
           │
           ├── spaCy en_core_web_lg          (PERSON, ORG, GPE, PRODUCT, EVENT)
           ├── EntityRuler                   (119 domain-specific patterns)
           ├── YAKE                          (statistical keyword extraction)
           └── namespace allowlist filter    (tech/, tool/, concept/, project/)
                │
                │  328ms / file
                │  99.7% precision · 0.3% hallucinated
                ▼
         Kafka topic: vault.file-tagged
                │
                ▼
         Frontmatter writer + downstream embedding pipeline
```

The benchmark numbers were lopsided enough that the decision documented itself. From the VW-152 implementation report:

| Metric | Before (LLM) | After (spaCy + EntityRuler + YAKE) |
|---|---|---|
| NER precision | 25% | 99.7% |
| Hallucinated tags | 75% | 0.3% |
| Latency per file | 4600ms (GPU) | 328ms (CPU) |
| Cold start | 60s (pip install) | Instant (baked in image) |
| GPU required | Yes | No |

A 14× reduction in latency. A near-elimination of hallucinated tags. No GPU contention with vLLM. The only thing I gave up was the LLM's ability to surface entities the patterns didn't anticipate. The cost-benefit was completely lopsided.

VW-152 triggered four related tickets the same day. VW-150 added feature flags so the rewritten NER could be toggled independently from the wider retrieval stack — specifically, gates around two experimental retrieval patterns (Corrective RAG, where the retriever's own confidence triggers a re-query, and Speculative RAG, where multiple cheap retrievals fan out in parallel and a verifier picks the best). Both patterns were research-grade at the time and not yet on the production path; the flags let the NER rewrite ship without unblocking those. VW-151 fixed the document knowledge graph pipeline glue that had been calling the LLM and now needed to call spaCy. VW-158 — only logged because the new NER consumer crashed on first deploy with `OSError: [E050] Can't find model 'en_core_web_lg'` — added the spaCy model to the Docker image properly (I had remembered the Python dependency, forgotten the `python -m spacy download` step). And VW-156 was opportunistic cleanup of which more in a minute.

I shipped the LLM-based NER originally because *"LLMs can do anything"* is a tempting design heuristic. They can. But for tasks where the answer space is bounded — a closed list of valid entities, a deterministic rule set, a statistical pattern — a small focused tool beats a large general-purpose one. The 200× quality improvement (75% → 0.3% hallucination rate) came from picking the right tool for the shape of the problem, not from picking a better model.

S3E2 had a related lesson: *input quality beats model quality*, about the journal pipeline switching from sparse OTEL events to rich JSONL transcripts. The NER lesson is the corollary, one rung further down: **for the right task, no model at all beats any model.** spaCy plus YAKE doesn't reason. It doesn't hallucinate. It also doesn't need a GPU, a token budget, or a context window. When your problem has the shape of a deterministic extraction task, use a deterministic extractor.

![A fine mesh sieve suspended by chains in a dark industrial room, clean teal crystals falling through into a collection tray below, chaotic amber debris caught on top — bounded tool beats general-purpose](/posts/s3e6/final/04-sieve-crystals-patternM-seed42.png)

### The infrastructure-hygiene threads

While the NER work was running, four more tickets shipped in parallel across the rest of the platform. Each one had a deeper story than the Jira title suggests.

**VW-153 — fourteen drift items across five HLD modules.** The vault's high-level design is modular per ADR-016 — ten separate documents, each covering one architectural layer. The Jira ticket title captures the scope: *"Architecture documentation update — 14 drift items across 5 HLD modules."* Each drift item was a specific claim in a module that no longer matched the live cluster — stale pod counts, decommissioned components still listed, new ones missing, NodePort assignments that had been moved without any of the docs catching up. *Architecture documentation has a half-life.* If you have a deployed system and docs claiming to describe it, you need a re-verification cadence shorter than the system's change rate; otherwise the docs become a lie that everyone trusts until they don't.

**VW-154 — seven alerts, one major side-finding.** The ticket title — *"Triage and fix Alertmanager alerts (7 active)"* — names the count without claiming a root cause. The triage took most of the evening because each alert had a different shape. The matrix-bot pod's crash loop turned out to be `aiokafka 0.13.0` switching its compression backend from the Python `lz4` package to Rust-based `cramjam`; the pip-installed `lz4` was still there, aiokafka just no longer looked at it. That was the *fourth* recurrence of the matrix-bot lz4 crash-loop symptom in three months — the previous three had each been a missing-package fix. Same crash signature, fundamentally different root cause, recursive lesson: *the symptom is not the bug, even when you have seen the symptom before.* Prefect's GitLab token had been left as the literal placeholder string `MANUAL_SECRET_DO_NOT_RECONCILE`. The GPU VRAM alert was firing because vLLM's DeepSeek-R1 deployment legitimately uses about 95% of the 16GB VRAM as a steady state — the alert threshold needed raising from 95% to 98%, not the model slimming. Two of the seven were diagnosed-not-fixed and de-prioritised: a K3s `svclb-traefik` DaemonSet failing to bind ports 80/443 because nginx-ingress already holds them (the service routes via ClusterIP and the Cloudflare tunnels anyway — alert vestigial), and a Shelly smart-plug exporter that had stopped responding (physical device, low priority).

![An open dark equipment case on a workbench, precision tools each in their foam cutout slot glowing soft teal, one empty slot visible — right tool for the shape of the problem](/posts/s3e6/final/06-toolkit-case-patternO-seed42.png)

The real surprise from VW-154 was a side-finding the triage uncovered. The MacBook's vault delta indexer had **17,133 messages of Kafka consumer lag**, being repeatedly evicted from its consumer group for MAXPOLL violations because Qwen3-Embedding-4B running on Apple's Metal Performance Shaders takes about 100 seconds per file. No realistic batch size keeps up with that throughput. Three architectural fixes landed alongside the alert work: a Qdrant dedup check before embedding (5ms lookup skipping 60-84% of the backlog, because Syncthing re-fires "changed" events for files whose content matches what's already indexed); manual MPS memory cleanup via `gc.collect()` plus `torch.mps.empty_cache()` after each file, since Apple's MPS allocator doesn't auto-release tensors on long-running ML; and idle model unload after ten minutes, releasing the 4-billion-parameter model from MPS so it stops starving the rest of the OS for unified memory. *Alert triage is sometimes how you find the architectural debt nobody was reporting yet.*

**VW-155 — the AI tools auditing the AI tools fail in characteristic ways.** VW-155 fixed the arch-review pipeline: a Kafka consumer that auto-reviews every code commit using DeepSeek-R1 as the reviewer and a separate Groq Qwen3 pass as the judge. Two bugs in the same code path. The first: DeepSeek-R1 in thinking mode was consuming all 4096 of its max_tokens on the `<think>...</think>` block before producing any actual output. The fix had three layers — `enable_thinking=False` for any pass that needs to produce JSON, max_tokens raised to 16384 as the new default for the reasoning passes, plus a fallback parser that recovers content when a thinking block gets truncated without a closing tag. The second bug: `affected_files` was coming back from the LLM as a string instead of a list, causing the scorer's iteration to produce one entry per character (`"main.py"` becoming `["m","a","i","n",".","p","y"]`). Type guard added on the consumer side. *Iterating a string in Python silently iterates characters; iterating it as a list of files is what you actually wanted — the difference shows up as garbage in the output, not as an error at parse time.*

The VW-155 fix pulled in the Scout fleet pipeline too, which had been hitting the same DeepSeek thinking-mode issue plus a separate bug in its HLD-module mapping. Scout consumers were tagging file changes with module names like `HLD-FA` and `HLD-IN` because the original mapping used `f"HLD-{module_name[:2]}"` — first two characters of the module name, treating the module names as opaque strings. Replaced with a keyword-based lookup against an explicit allowlist of the actual HLD module names. Plus a vault-writer fix to switch fence syntax from triple-backticks to `~~~` (Obsidian's renderer was choking on the nested fence syntax that the LLM kept producing) and proper `vault-path:` frontmatter so the Scout reports actually land in the right vault location. 660 junk review files purged from the vault during the cleanup pass — files that had been written to the wrong location over the previous weeks while the pipeline was producing `[File not readable]` outputs and dutifully writing them up as "reviews."

**VW-157 — the bug looked like noise, the real shape was wrong input.** The current trigger was `vault.file-events`, the Kafka topic that fires on every vault edit. The arch-review batcher was consuming it and then trying to read the source files via a `CODE_PATH` environment variable that pointed at the platform repo, not the vault. Every vault file change triggered a review attempt; the consumer looked for the file at the platform path where most vault files don't exist; the LLM received `[File not readable]` for every file — and then dutifully wrote an arch-review report based on no actual content. The PDG-based HLD-module mapping was downstream of the same broken read, so even the routing was wrong. The fix added a new GitLab CI stage (`deploy:arch-review-trigger`) that runs on main-branch pushes that touch code files. That stage produces a `CommitEvent` to a new Kafka topic `arch-review.commits`. The batcher was rewritten to consume the new topic, parse the commit event, and read the actual changed files from the platform's hostPath mount. KEDA's ScaledJob trigger swapped from the vault topic to the commits topic. *The bug looked like a noisy-trigger problem; the real shape was a wrong-input-source problem.* Triggers should fire on the events that actually carry the data the consumer needs, not on events that happen to fire in the same neighbourhood.

### VW-156 — what "Done" sometimes hides

VW-156 was opportunistic cleanup riding alongside the NER rewrite: rename ChromaDB references in the active pipeline to function-based naming. The commit message records exactly what was renamed and what was explicitly kept:

> *Renamed: `to_chromadb_filter()` → `to_vector_store_filter()`, `index_file_to_chromadb()` → `index_file_to_vector_store()`, `direct_chromadb` → `direct_vector_search`, `mock_chromadb_*` → `mock_vector_store_*` (33 refs), VectorStoreFactory default `"chromadb"` → `"qdrant"`. Comments/docstrings updated to "vector store" or marked "(legacy)".*
>
> *Kept as-is: config field names (`chromadb_host`/`port`), adapter class (`ChromaDBAdapter`), adapter file (`chromadb.py`), directory names.*

19 new tests added to verify naming consistency. Ticket closed Thursday 19 March at 20:17 UTC.

Two months later, while researching this post, I grepped the live codebase for residual references. Across the workspace packages (`packages/`) and the neural-vault utilities (`neural-vault/`), 426 references to `chromadb` or `ChromaDB` remain. The legacy shim layer (`rag_platform/`, the old import paths kept as PEP 562 re-exports during the ADR-030 migration) has zero. Some of the 426 are the explicitly-kept items the commit message named — the adapter class, the config fields. But many are new references that appeared *after* VW-156 closed, written into the workspace migration code under the assumption that the existing `chromadb`-named methods and config keys were intentional.

The structural lesson is one I want to land carefully. VW-156 itself was scoped correctly — the rename it set out to do, it did. What broke down was the assumption that closing the ticket would prevent the old names from reappearing. The post-VW-156 workspace migration treated the surviving chromadb names as load-bearing and reproduced them. *Naming-cleanup tickets need a follow-up audit, not just a "Done" status.* **The ticket isn't the work; the codebase is.** A clean Jira state on a rename ticket can coexist with a codebase that drifts back toward the old names if no process catches the drift.

## Twelve tickets across twenty-six hours — how it's actually possible

I want to be honest about the mechanism because the count is easy to misread. Twelve tickets opened and closed in twenty-six hours sounds like a productivity flex. It isn't. The day-and-a-bit was possible because of two structural things that have nothing to do with intelligence or focus.

The first is that AI assistance turns context-switching from a cost into a tool. When the security audit revealed UFW was off, I could send Claude Code at the UFW config while I was reading the SSH hardening docs. When the NER hallucinations surfaced in the vault graph, I could research spaCy patterns while Claude wrote the EntityRuler config from a small starter set. When the arch-review pipeline was failing on DeepSeek thinking-mode tokens, the diagnosis and the fix could run in parallel sessions because each was self-contained enough to dispatch. The cap on parallel work for a one-person platform isn't intelligence — it's the cost of switching between threads, and AI assistance reduces that cost by an order of magnitude when the threads are well-scoped.

The second is the Jira-first development rule. Of the twelve tickets across these twenty-six hours, five resolved in under ten minutes (VW-147 in four minutes, VW-150 in two, VW-153 in three, VW-155 in five, VW-158 in eight). Those are *ratification tickets* — opened after the work was done to maintain the audit trail. The rule says tickets should exist before work starts; in practice that discipline degrades into a useful audit trail when the work is exploratory. The system holds the state about what shipped; the model only needs to hold *"which thread am I on right now."* Twelve tickets in twenty-six hours is only possible because nine of them were dispatched, paused, swapped, and resumed in some order rather than worked end-to-end. **The Jira-first rule isn't bureaucracy. It's the cache that makes parallel cognition possible.**

![A wall of small glowing holographic cards arranged in three columns on a dark wall, most glowing soft teal green, two glowing amber — twelve tickets across twenty-six hours](/posts/s3e6/final/05-ticket-wall-patternN-seed42.png)

## What I'd do differently

Two retrospective notes.

**Re-verify HLD modules on the same cadence as the system changes.** VW-153's fourteen drift items across five HLD modules weren't there because the modules were written badly. They were there because three to six weeks of platform changes had landed without a re-verification pass. The vault now has a `last-verified:` date on every HLD frontmatter, which is the right primitive. But there is no process that *enforces* re-verification at any cadence. The right fix is a scheduled job that opens a ticket every two weeks for any HLD module whose `last-verified:` is older than two weeks — turning the drift problem from "remember to check" into "the system tells me what to check." The lesson generalises: if a document is supposed to describe a system, the system should be the source of truth for whether the document is still accurate, not a human's memory of when they last reviewed it.

**Naming-cleanup tickets need a follow-up audit cadence, not just a "Done" status.** VW-156 did exactly what it set out to do. What it could not do is prevent later work from reintroducing the names it had retired. Two months on, 426 references to the old names exist across `packages/` and `neural-vault/` — some intentional, some not, and there is no current process that distinguishes between the two. The fix is the same shape as the HLD-drift fix: a scheduled grep against the live codebase for the patterns the rename was supposed to retire, opening a follow-up ticket whenever the count creeps back up. *A clean Jira state on a rename ticket can coexist with a codebase that drifts back toward the old names if no process catches the drift.*

## Same as every episode

Same as every episode — every piece of this is tracked through git commits, vault evidence, and Jira. The NER pipeline lives at `neural-vault/ner_pipeline.py` with the EntityRuler patterns in `ner_entity_patterns.json` and the consumer image at `rootweaver/ner-consumer:v1` on [Harbor](https://goharbor.io/). The [Kafka](https://kafka.apache.org/) topic chain runs `vault.file-events` → `vault.file-tagged`. The Jira issues are VW-147 through VW-158, split across Wednesday 18 March and Thursday 19 March 2026.

Next episode picks up nine days later — the late-March weekend (28-29 March) that doubled search quality and finally delivered the MCP transport migration from S3E3's dangling promise. Same kind of compounding day, different shape: this time two parallel sprints converged on one Sunday session.

For the production code, blog.rduffy.uk. For the work-in-progress version with the texture, labs.rduffy.uk.
