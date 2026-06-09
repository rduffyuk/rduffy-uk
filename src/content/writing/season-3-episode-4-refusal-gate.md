---
author: Ryan Duffy
categories:
- Season 3
- Architecture
- AI Search
description: How a single score threshold became the difference between a bot that
  hallucinates and a bot you can trust — and why the architectural decision to refuse
  synthesis is the same shape as a circuit breaker, a feature flag, and a dead-letter
  queue.
draft: false
episode: 4
featured: true
pubDatetime: 2026-05-10 12:00:00+00:00
reading_time: 20 minutes
series: 'Season 3: Building in Public (Oct 2025 — Feb 2026)'
slug: season-3-episode-4-refusal-gate
tags:
- matrix
- flashrank
- reranking
- knowledge-graph
- falkordb
- hallucination
- rootweaver
- building-in-public
- season-3
- observability
- adr-015
- ai
- apple-silicon
- bm25
- circuit-breaker
- graceful-degradation
- concept/observability
- project/adr
- project/adr-015-(matrix-accessibility-layer
- project/ai
- project/apple-silicon
- project/apple-silicon-the-neural-engine
- tech/258ms
- tech/awq
- tech/bm25
title: 'The Refusal Gate: Teaching a Bot to Say I Don''t Know'
---
## The smallest fix that mattered most

There is a forty-line file in the Matrix bot's message handler. It runs after every search, before every synthesis. It looks at one number — the top FlashRank score from the reranker — and decides whether the bot is allowed to answer. If the number is below 0.10, the bot doesn't generate a response. It says, in plain text: "I found some results, but none seem relevant enough to answer confidently. Try rephrasing your question."

That's the refusal gate. It is the most important piece of architecture I shipped in February.

Not because forty lines of code is impressive. Because the alternative — what the system did before I added it — was to confidently synthesise wrong answers from irrelevant search results, and have no mechanism whatsoever to know it was doing so. The bot had been lying to me politely and confidently for weeks. The fix wasn't a better reranker. It wasn't a different LLM. It was a single architectural decision: **the synthesis layer is allowed to refuse**.

This post is about why that decision is bigger than it looks. The same shape — *check a precondition before doing the thing, refuse cleanly if the precondition fails* — appears in a circuit breaker, a feature flag, a dead-letter queue, and the GPU priority class I'll come back to in a later episode. The refusal gate is one instance of a pattern that holds the platform together: **graceful degradation as the default, not the exception**.

If you only read one thing in what follows, read the section on the score distribution. The threshold of 0.10 isn't a tuned hyperparameter. It sits in a canyon between two clusters where the noise floor and the signal floor are nearly two orders of magnitude apart. That's not engineering luck. It's what happens when the precondition you're checking is the *right* precondition.

![A luminous threshold gate in a vast dark hall — chaotic data fragments swirling on one side, clean passage ahead, single warning light above](/posts/s3e4/01-hero-threshold-gate.png)

## Where the system stood (February 2026)

This was the platform on the day the refusal gate landed. Matrix was the brand-new addition; the rest had been live for months.

```
┌─────────────────────────────────────────────────────────────┐
│  L1 PRESENTATION                                            │
│  Obsidian · LibreChat · Grafana · Element/Matrix ← NEW      │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│  L2 SERVICE GATEWAYS                                        │
│  MCP Bridge :30002 (12 tools) · RAG Gateway :30808 · Prefect│
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│  L3 AGENTS                                                  │
│  FastSearchAgent · DeepResearchAgent · AgentRouter          │
│  (no OracleAgent yet — that lands later)                    │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│  L4 INFERENCE                                               │
│  vLLM Qwen3-14B-AWQ · Embedding service · FlashRank ← NEW   │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│  L5 DATA                                                    │
│  Qdrant ~4K docs (148K chunks) · BM25 · FalkorDB ← NEW (209)│
│  (no Jira connector yet — that's E5)                        │
└─────────────────────────────────────────────────────────────┘
                            │
┌─────────────────────────────────────────────────────────────┐
│  matrix namespace ← NEW THIS EPISODE                        │
│  Synapse · 3 mautrix bridges · Element Web · rootweaver-bot │
│  (7 pods, 4 PostgreSQL DBs, 2.4GB RAM, 60GB PVC)            │
└─────────────────────────────────────────────────────────────┘
```

Three architectural changes shipped together in this episode and they are not separable from each other.

**The Matrix stack.** A self-hosted Synapse homeserver, three mautrix bridges (WhatsApp, Telegram, Discord), Element Web for browser access, and a custom Matrix Application Service called `rootweaver-matrix-bot` that speaks MCP to the existing bridge on port 30002. This put vault search on my phone for the first time.

**The reranker layer.** A FlashRank cross-encoder (`ms-marco-TinyBERT-L-2-v2`, 34MB) that sits between hybrid BM25+vector search and synthesis, reordering results by relevance before the LLM ever sees them.

**The knowledge graph layer.** Two parallel graphs on a single FalkorDB instance — `document_knowledge` (entities and relationships extracted from vault markdown by Graphiti) and `code_intelligence` (program dependency graph from static analysis of the platform code). 209 nodes and 444 edges in the first ingestion run; 916 nodes and 2,880 edges by the end of the episode.

The refusal gate is a 40-line addition to the Matrix bot. None of the other three layers required it on their own. All three required it together — because all three together produced a bot that confidently answered questions it should have refused.

![Five layers stacked vertically in a single cyberpunk tower — each floor a separately glowing colour, each connected by light beams running between them](/posts/s3e4/02-five-layer-tower.png)

## Decision 1: Self-host the messaging layer instead of adopting OpenClaw

OpenClaw was the catalyst for this whole episode. A personal AI assistant you talk to from WhatsApp, Telegram, Discord, iMessage, Slack, Signal — twelve messaging platforms, 5,700+ community skills, BYO API key for an Anthropic or OpenAI backend. It went from 9,000 to 60,000 GitHub stars in a few weeks. The pitch was hard to argue with: "your vault, accessible from any chat app you already use".

The architectural decision was not whether to want that. It was *how* to get it. Three options.

| Option | Trade-off | Verdict |
|---|---|---|
| **Adopt OpenClaw**, point its BYO-API config at my own LLM endpoint | Twelve platforms working immediately. Massive skill marketplace. Polished setup. **But:** queries route through OpenClaw's daemon, MCP integration is via a bridge skill (not native), and 1,800+ exposed instances had been found leaking API keys. | Rejected — the privacy and audit-trail story doesn't survive a second daemon between me and the vault |
| **Build a single-platform bot** (e.g., a Telegram bot that talks to MCP) | Smallest possible deploy. One image. No Synapse, no bridges, no Application Service protocol. | Rejected — limits the audit story to one channel, and adding a second channel later means the same work twice |
| **Self-host Matrix as the universal protocol layer** with mautrix bridges | More infrastructure (7 pods, 4 databases). But a single MCP-native bot serves *every* messaging platform via the bridges. The bot is an MCP client, identical in behaviour to the desktop client. One audit trail across desktop, web, and mobile. | **Chosen.** |

The chosen path looks heavier on paper, but the architectural property it gives you is single-pane observability. Every query — from Claude Code on the desktop, from Element Web in a browser, from WhatsApp on my phone — hits the same MCP bridge on port 30002. Same logs. Same metrics. Same rate limiting. The MCP client abstraction means there is exactly one code path for "ask the vault a question", regardless of the front door.

This decision is the same shape as the producer-consumer-via-Kafka decision in next week's episode on streaming connectors, and the gateway-vs-direct-call decision in countless web apps. **Adding a uniform abstraction layer at the seam between two different ecosystems is almost always cheaper than reimplementing the integration twice.** The cost is the abstraction. The benefit is everything that comes after the abstraction working the same way.

## Decision 2: Add a reranker between search and synthesis

Before this episode, the search pipeline was hybrid BM25 + vector. Qdrant returned the top-N results by some combination of keyword match and embedding similarity, and the synthesis layer (Qwen3-14B via vLLM) read all of them and produced an answer.

That's a perfectly good pipeline for queries where the top-N results are actually relevant. It is a *terrible* pipeline for queries where the top-N includes garbage.

The reranker — a small cross-encoder model that scores query-document pairs jointly — sits between search and synthesis as a second-stage filter. It's slower per result than BM25 or vector similarity (it has to run a transformer over each pair), but it's much more accurate at distinguishing genuinely relevant from superficially-similar text.

Two architectural questions:

**Where to put the reranker?** Inside the Matrix bot? Inside the RAG gateway? Inside Qdrant as a query-time post-process? I put it inside the bot. The reasoning: the bot is what consumes the results and decides whether to refuse, so the reranker output and the refusal decision should live in the same process. Putting the reranker behind the gateway means the bot has to either trust the gateway's filtering or re-fetch raw results for its own filtering. Either choice splits a logically-coupled decision across a network boundary. Keeping them together makes the refusal gate possible.

**Which reranker?** This needed an actual benchmark, which I'll come back to in the section after next.

The trade-off the reranker introduces is latency. Adding a transformer call to every query means the round-trip from "WhatsApp message" to "answer in the chat" gets longer. The number that matters is the reranker latency: 1,422ms in the production K8s pod for FlashRank on 8 passages. Combined with the rest of the pipeline, the total round-trip lands in single-digit seconds — acceptable for a chat-style interaction, would be unacceptable for an autocomplete UI. The pattern: **rerankers are appropriate when the synthesis cost is high and the recall-vs-precision tradeoff matters**. They're inappropriate when the consumer is happy with cheap, lossy results.

## Decision 3: The refusal gate (the post's central argument)

The refusal gate is a check, not a model. The check is a single comparison:

```python
if top_score < 0.10:
    return "I don't have confident information about that."
    # Never calls synthesise() — no hallucination possible
```

That comparison is the entire architectural argument: **the synthesis layer is allowed to refuse, and the precondition for synthesising is a relevance score above a fixed threshold**.

Three things make this work, and they are interesting independently.

**The threshold sits in a canyon, not on a slope.** This is the most surprising thing about the gate, and it's why the precondition is the right precondition. Look at the actual reranker scores from the test suite:

| Query | Top FlashRank score | Vault has the answer? |
|---|---|---|
| What does the vault do? | 0.926 | ✓ |
| What are the K3s namespaces? | 0.999 | ✓ |
| What is Qdrant used for? | 0.696 | ✓ |
| How does search work? *(too generic to match)* | 0.007 | ✗ |
| Explain the agent routing | 0.000 | ✗ |

Real-answer scores cluster between 0.696 and 0.999. Noise scores cluster between 0.000 and 0.007. The gap between them is two orders of magnitude. The threshold of 0.10 sits in the empty space between the clusters with roughly 70× margin on each side. This isn't a tuned hyperparameter; the cross-encoder's joint attention naturally produces a bimodal distribution for queries that are either in-domain or completely out-of-domain. The threshold could be 0.05 or 0.20 with no observable difference in behaviour. **The gate works because the underlying model's confidence signal is genuinely bimodal, not because the threshold is precisely tuned.**

![Two glowing data clusters across a dark canyon — small dim cluster on one side, tall bright signal cluster on the other, single threshold line crossing the empty middle](/posts/s3e4/03-bimodal-canyon.png)

**The gate is a circuit breaker, not a filter.** The temptation when designing this is to think of it as a filter — strip out bad results, pass the rest to synthesis. That's wrong. A filter that drops bad results from a list of three would still call synthesis on the remaining one or two, which are also bad. The whole list is bad together; the cross-encoder failed to discriminate at all. The right shape is to refuse the *call* to synthesis entirely, not the *contents* of the call. Same shape as a circuit breaker: when downstream is degraded, stop calling it, return a fast static response, surface the degradation to the user.

**The threshold is configurable, not constant.** The value 0.10 is the default. The actual value lives in an environment variable, `RERANK_REFUSAL_THRESHOLD`, set in the Kubernetes deployment manifest. I can tune it up to 0.20 or 0.30 if I want more aggressive filtering, without rebuilding the Docker image. This matters because reranker behaviour will drift over time — vault content changes, the model's training-data overlap with the domain may shift, new query patterns emerge. The gate's strictness should be a runtime knob, not a release-time decision.

The three alternatives I considered before settling on the gate:

| Approach | Why rejected |
|---|---|
| Tune `min_results=3` lower or higher | The whole problem was that `min_results` was forcing irrelevant chunks through. Tweaking it doesn't fix the architectural shape; it just adjusts the rate of bad outputs |
| Train a domain-specific reranker | Months of work for marginal gain. The general-purpose cross-encoder is already discriminating perfectly well — it scores noise at near-zero. The bug isn't the model; it's that we weren't reading the score |
| Add a confidence-aware LLM prompt ("if the context isn't relevant, say you don't know") | Asking the LLM to refuse politely is fundamentally unreliable — LLMs hallucinate refusals about as often as they hallucinate answers. The check has to live outside the LLM call |

The architectural lesson generalises beyond rerankers. **Whenever a downstream layer can produce confidently wrong output from upstream noise, the right place to refuse is at the seam between them, not inside the downstream model.** The model can't be trusted to know when its inputs are bad, because by definition it's the model that's failing to know.

## Decision 4: FlashRank over ColBERT (and why the benchmark mattered)

Once the gate was in place, a separate question opened up: was FlashRank the *right* reranker to gate against? ColBERT is the other serious contender — a late-interaction model that encodes query and document independently and scores via token-level MaxSim. On paper, late-interaction should be cheaper because document embeddings can be precomputed.

I built an A/B benchmark behind a common interface. `RERANK_BACKEND=flashrank|colbert` selects which model serves results. `RERANK_COMPARE=true` runs both on every query and logs the comparison without affecting the response. Same queries, same dataset.

Two findings, both decisive.

**Latency in the production environment, not the dev laptop.** ColBERT looked fine on the MacBook M4 Pro — 258ms per query on 8 passages, with the Apple Neural Engine doing the work behind ONNX Runtime. In the K3s pod (1 CPU core, no Neural Engine, no embedding cache), ColBERT was 33,144ms per query. **128× slower than the laptop.** Not a tuning issue — the late-interaction pattern recomputes all passage embeddings per call because there's no precomputed index in a reranking context. On Apple Silicon the Neural Engine absorbs that cost invisibly. In a constrained CPU pod every token-level embedding hits the wall.

**Score distribution that the gate can use.** FlashRank scores spread from 0.29 to 0.96 across the test set — a range the refusal gate can work with. ColBERT scores cluster at 0.95 to 0.97 for everything. Top result and bottom result separated by 0.02. ColBERT cannot distinguish relevant from irrelevant *at all* because token-level MaxSim produces high similarity for any vaguely-related text, and in a vault of nearly 4,000 documents indexed as 148,000+ chunks, everything is vaguely related to everything else.

A reranker that scores everything 0.95+ is useless for a threshold-based refusal gate. It would either refuse nothing (threshold 0.94) or refuse everything (threshold 0.96).

| Metric | FlashRank | ColBERT |
|---|---|---|
| Latency in K3s pod | 1,422ms | 33,144ms |
| Score spread | 0.29 – 0.96 | 0.95 – 0.97 |
| Compatible with refusal gate? | Yes | No |

![Two scoreboards side-by-side in a cyberpunk control room — one shows a uniform grid of indistinguishable squares, the other shows distinct numerical readouts in clearly varied patterns](/posts/s3e4/04-parallel-scoreboards.png)

The architectural lesson: **the choice of model is downstream of the architectural pattern that consumes its output**. The gate needs a discriminating signal. FlashRank produces one. ColBERT doesn't, regardless of how fast it is in the right hardware. Picking the model first and then designing the consumer around it is exactly backwards.

The methodological lesson: **always benchmark in the production environment**. Apple Silicon flatters compute-heavy models in ways a CPU pod does not. Your laptop gives you a number. The pod gives you the truth. I would have shipped the wrong reranker if I'd trusted local benchmarks alone.

## Decision 5: Two parallel knowledge graphs, not one

Vector search finds documents with similar text. It misses *relationships*. Questions like "who wrote this ADR?", "what services depend on FalkorDB?", "which Jira issues are linked to the graph module?" are structural questions. The answers exist in the vault, scattered across frontmatter fields, inline references, and implicit connections between documents. Embeddings flatten all of that into a single 1024-dimensional vector. Structure disappears.

The architectural question wasn't whether to add a graph layer — by mid-February the case was clear. The question was whether to use a single graph or two parallel graphs.

I chose two:

- **`document_knowledge`** — Graphiti reads vault markdown files and extracts entities and relationships using vLLM (Qwen3-14B-AWQ). People, projects, decisions, dependencies. The semantic web my vault was always implicitly encoding, now made explicit as nodes and edges.
- **`code_intelligence`** — the Program Dependency Graph maps code structure. Modules, functions, imports, call chains. Built from static analysis of the platform codebase. The initial build was around 2,000 nodes and a similar number of edges.

Why two? Because they have different update cadences, different ingestion pipelines, different node-type vocabularies, and different downstream consumers. `document_knowledge` updates hourly via Prefect when vault files change. `code_intelligence` rebuilds on git commits to the platform repo. Mixing them in a single graph means coupling their lifecycles — a slow document ingestion run blocks a code graph rebuild, or vice versa. Separating them lets each have its own SLO.

They share infrastructure (the same FalkorDB instance, the same query interface) but not state. From the application's perspective, they're two completely separate graphs that happen to live in the same database. RRF (Reciprocal Rank Fusion) at the search layer combines results from both when a query benefits from both views.

The trade-off: more coordination logic at the search layer (which graph do I query for this question? both? merge how?). The benefit: independent operability. When the document ingestion failed during this episode (more on that below), the code graph kept serving queries unaffected. That isolation would be impossible in a single-graph design.

This is the same architectural pattern as splitting producer and consumer with Kafka — **separate failure domains for things that have separate operational characteristics, even when they share a substrate**.

## What broke and what the failures revealed about the design

Three ingestion bugs hit the document graph during this episode. None of them broke the search pipeline because of decisions made earlier in the architecture.

The first was a substring-match bug — `"db" in "falkordb"` returns True in Python, so the query refinement module silently mangled "FalkorDB" into "Falkordatabase" before passing it to the graph. Word-boundary regex fixed it. The interesting architectural detail: search results were unaffected because the bug was in the *query* path, not the *ingestion* path. The graph kept ingesting correctly while queries silently returned nothing.

The second was an asyncio event-loop mismatch — `asyncio.Semaphore()` created in `__init__` binds to whatever event loop is active at construction time, but Prefect's `asyncio.run()` creates a fresh loop per flow invocation. Every ingestion attempt failed with `<asyncio.locks.Lock object> is bound to a different event loop`. Lazy creation inside the running loop fixed it. The architectural detail: 100% of ingestion runs failing didn't take down search, because search and ingestion are decoupled by the storage layer. FalkorDB kept serving the 209 nodes from the initial run while the next 707 nodes waited.

The third was a write-behind progress-tracking bug — the ingestion tracker only marked files as processed after *all* chunks succeeded, so when Prefect's task timeout killed a batch mid-file, the graph had the data (FalkorDB commits per chunk) but the tracker had no record. Per-chunk disk persistence with `mark_chunk_done()` after each successful chunk fixed it. The architectural detail: this only became a problem because ingestion was being retried. The system was self-healing, and the bug was that self-healing was redoing already-done work.

All three of these are normal bugs. The reason they're worth mentioning at the architectural level is what *didn't* happen: search uptime stayed at 100% during the entire ingestion failure window. That's because of the three Unleash feature flags around the graph layer — `graph_search.enabled`, `graph_augmentation.enabled`, `graph_ingestion.enabled` — which let me disable any subset of the graph functionality without redeploying. When ingestion was 100% failing, search kept serving as if the graph layer didn't exist. **Feature flags are the deployment-side equivalent of the refusal gate: graceful degradation as the default, not the exception.**

## What the gate, the flags, and the DLQ have in common

Three patterns shipped during this episode and the next one are the same shape. Worth naming explicitly:

- **The refusal gate** (this episode): the synthesis layer is allowed to refuse when its preconditions aren't met
- **The Unleash feature flags** (this episode): the graph layer is allowed to be off without breaking the rest of the system
- **The dead-letter envelope** (next episode, E5): the consumer is allowed to fail a message cleanly without blocking the rest

Each one is **graceful degradation as a first-class architectural concern**, not a fallback you bolt on after the fact. Each one assumes failure is the normal case to design for, and success is what falls out when no failure mode triggers. Each one preserves enough state that recovery is possible later (the gate logs which queries it refused; the flags are observable; the DLQ envelope contains the original message).

The shape generalises beyond the platform. Whenever a downstream layer can produce wrong output from bad inputs, or cascade a failure to the rest of the system, or take an irrecoverable action — the right architectural response is to add a precondition check at the seam, refuse cleanly when the check fails, and surface the refusal to the operator. The cost is the check. The benefit is that everything beyond the check works correctly, because nothing reaches it that shouldn't.

![Six lanterns hanging in a dark cyberpunk hall, five glowing brightly, one extinguished — graceful degradation as one node offline while the others continue](/posts/s3e4/05-lanterns.png)

## What I'd do differently

Two retrospective notes.

**Add the score gate before adding the reranker.** The reranker's whole job is to produce a relevance score. The fact that I shipped the reranker without a gate around its score for several days — and shipped a hallucinating bot during those days — is a sequencing mistake. The next time I add a model whose output I'm going to consume, I'll add the consumption-side guard at the same time, not as a follow-up.

**Document the asyncio-event-loop pattern in CI, not just in vault notes.** I hit the same asyncio bug twice in this episode — once in the Matrix bot, once in the graph ingestion pipeline. I'd documented the pattern in the vault after the first fix. It didn't help. Pattern recognition only works if the recognition triggers before you ship. A linter rule for `asyncio.Semaphore()` and `asyncio.Lock()` at module level would have caught both before they reached production.

## Same as every episode

Same as every episode — every piece of this is tracked through git commits, vault evidence, and ADRs. The Matrix stack lives in `infrastructure/matrix/`, the bot at `services/rootweaver-matrix-bot/`, the reranker behind a `RERANK_BACKEND` env var, the threshold behind `RERANK_REFUSAL_THRESHOLD`, the graph behind three Unleash flags. The Jira issues that map to this work are VW-73 through VW-90, with ADR-015 (Matrix Accessibility Layer) capturing the self-host-vs-adopt decision.

Next episode covers the streaming connector pattern — how the Jira-to-Qdrant pipeline is two completely separate systems separated by a Kafka topic, and the four contracts that hold the seam together. The same "graceful degradation as default" theme runs through it: the producer can run when the consumer is down, the consumer can fail messages cleanly to a dead-letter envelope, the indexer can re-process the same message idempotently. Refusal-gate energy, distributed across more layers.

For the production code, blog.rduffy.uk. For the work-in-progress version with the texture, labs.rduffy.uk.
