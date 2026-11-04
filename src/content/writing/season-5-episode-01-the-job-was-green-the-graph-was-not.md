---
title: "The Job Was Green. The Graph Was Not."
author: Ryan Duffy
pubDatetime: 2026-07-01T12:00:00Z
shippingDatetime: 2026-11-03T17:50:00Z
draft: false
episode: 1
series: "Season 5: Rootweaver (Provisional)"
description: "A four-month intent story meets a one-week debugging reality: the ingestion job finished, the knowledge graph did not."
tags: [rootweaver, engineering, building-in-public, season-5-proposal, adr-015, graphrag]
---

The job finished green. The graph inside it was not.

By Wednesday 1 July, the work had crossed a familiar boundary: code had been changed, an image had been built, and a job had run. Yet individual documents were still failing on their way into the knowledge graph. A successful process exit was concealing a much less successful piece of work.

![The established Rootweaver engineer in a grounded story setting.](/posts/s5e01/review-v2/hero-A.png)

<p class="caption">Making a hidden failure visible changes what can be diagnosed; it does not itself complete the work. Conceptual artwork; provisional hero for review.</p>

This is a proposed Season 5 opener, though the season map itself is provisional — the structure will shift as the publishing pipeline sees fit. The setup began on June 30; the core diagnosis is July 1, with a declared July 2 follow-up because it changes what the fixes actually established. I set the engineering direction and acceptance; agents assisted with diagnosis, code and review. The historical reports and directly inspected source have different roles in this account.

But the debugging is only half the story. The other half is intent: why I wanted a knowledge graph at all, and what four months of design decisions had committed the platform to before this job ever ran.

## What this season is for

Season 4 ended with a question about boundaries: what an agent's output should be allowed to do, and how to check it. This season starts one layer below that question. Before an agent's output matters, the data product underneath it has to be real. A retrieval path that answers from an empty or half-populated graph is not a trustworthy answer no matter how well the agent behaves above it.

## The Graph's Charter: Four Months of Intent

This wasn't a sprint. It was a four-month campaign to build something structurally different from what the platform already had. The story of the intent arc is as important as the debugging that followed it.

### February 7: The Initial Pitch

The engineering brief, "AI Ecosystem Research Briefing," framed the problem on February 7. The proposal wasn't just to add a new tool — it was to change the fundamental way the system retrieved and understood data:

> **"Implementation: Design knowledge graph schema, build entity extraction pipeline (could leverage NER tagging skill), populate FalkorDB, add graph retrieval to hybrid search fusion."**

The proposal identified a key insight: the existing search was capable, but structurally blind. It could find text, but it couldn't reason about relationships.

### February 15: The Blueprint (ADR-015)

A week later, ADR-015 ("Graphiti + [FalkorDB](https://github.com/FalkorDB/FalkorDB) Knowledge Graph Integration") turned the proposal into a decision. The document identified the specific blind spots we were solving for:

1.  **No relationship awareness** — Vector search can't traverse entity relationships (e.g., "what depends on rag-gateway?" or "which docs reference Kafka?").
2.  **No impact analysis** — No way to calculate the blast radius of a change across the knowledge base.
3.  **Disconnected code graph** — FalkorDB already hosted code intelligence, but it was isolated from document search.
4.  **No temporal entity tracking** — The system couldn't track how entities evolved over time.

The architecture decided upon was a **hybrid stack**. Instead of replacing the existing vector search, we would fuse it:

> **"Links between document entities and code entities enable 'which docs describe this module?' without breaking the existing search."**

This was the pivotal moment: the goal wasn't just search, it was *understanding*. We weren't just adding features; we were changing the fundamental nature of what the system "knew."

### April 18: The Model Allocation Decision

By April, the scoping became more specific. A major technical constraint arose: the main vector database indexing was critical for the platform's performance. Any experiment or heavy lifting for the knowledge graph could not starve the main pipeline.

The decision was made to **isolate the graph work** from the main vector indexing infrastructure. This was the moment the "hybrid" architecture became a technical requirement, not just a nice-to-have.

### June 30: The Validation Checkpoint

By the end of June, all the pieces were in place — the schema, the pipeline, the infrastructure, the security policies (the path-scoping requirement from the charter). The system was *deployed*.

The only question left was: *does it actually work?*

That question was the pivot point for this episode.

## A count was too small an acceptance test

The goal was to populate the document knowledge graph from architecture documents. Graphiti, developed by Zep, supplied the graph-building machinery; Rootweaver supplied its integration, a self-hosted [vLLM](https://docs.vllm.ai/) inference server for the extraction model, and the embedding path. Those are multiple opportunities for a document to fail even when the surrounding job remains healthy enough to continue.

The acceptance check written for this work was empirical: the graph should contain Entity nodes produced by a live backfill, not by a probe. The June 30 handover reports the count at zero even after that day's code fixes were merged to main. Four nodes had appeared by July 1, up from zero.

Four is progress through the path. It is not a corpus. It did not show that the selected documents had been ingested, that each one succeeded, or that recurring operation was ready. It also could not distinguish between a pipeline that was slowly filling and one that was filling almost everything by exception.

The same July 1 report says the ingestion job completed with exit code zero while catching per-document failures and continuing. That behaviour can be intentional: one bad item should not always stop a batch, because a single malformed document should not block a thousand good ones. But it means the scheduler's success state and the data product's completion state need separate definitions. The scheduler says the job ran. Only the item-level record can say what the job actually did.

I would want to know how many items were selected, attempted, completed and failed, alongside the markers that determine whether a later run retries them. A graph count is one signal in that account, not a substitute for it.

## The first useful fix made failure visible

The June 30 session had already shipped two sets of fixes to the platform's main branch, and the first live backfill against that image failed. The failure was hard to read. The July 1 diagnosis identified the observability layer first, because without it nothing else could be named.

The sequence on June 30 is worth retelling because it shows how a fix can be correct and still fail in production. Two merge requests shipped to the platform's main branch that day, and each moved separately through the deployment path.

| Change merged to main | What it carried | What the running cluster actually had |
|---|---|---|
| First merge request | A guided-JSON subclass with a token cap, plus a selector path-scoping fix | Pinned into the first image bump before the second merge landed |
| Second merge request | A contract correction for the structured-decoding request | Not in any image yet; its own container build was still running at handover |

The first live backfill then ran against the image that had the first fix but not the second, and the inference server rejected the request combination that the second fix addressed. The graph stayed clean, which the retry design made possible, but the backfill did not complete. The second fix was on main, but it was not in the image the cluster was running.

That is not a story about a bad fix. It is a story about the delay between merging code and running it, and how a deployment can look finished while it is still catching up to what main already knows.

The second fix's contract correction also had a design purpose worth showing. It put the structured-decoding mode behind an environment switch, so the request contract could change without another image rebuild:

<p class="code-source">Two dedented fragments, condensed: packages/rootweaver-graph/src/rootweaver_graph/graphiti_client.py, guided-decoding selection, historical commit 1e61f206. Unrelated branches between them omitted; shown lines unchanged.</p>

```python
def _guided_decoding_mode() -> str:
    return os.getenv(GRAPHITI_GUIDED_DECODING_ENV, "guided_json").strip().lower()
```

and within the guided client's completion call:

```python
guided_decoding = _guided_decoding_mode()
if response_model is None or guided_decoding == "off":
    return await super()._create_completion(
        model=model,
        messages=messages,
        temperature=temperature,
        max_tokens=max_tokens,
        response_model=response_model,
        reasoning=reasoning,
        verbosity=verbosity,
    )
...
if guided_decoding == "json_schema":
    request_kwargs["response_format"] = {
        "type": "json_schema",
        "json_schema": {
            "name": response_model.__name__,
            "schema": schema,
        },
    }
```

The retained default is guided JSON; the JSON-schema branch is the mode the July 2 fix would adopt on the generic chat path. A contract that is a deployment variable rather than a compiled-in choice is what let the later correction ship as configuration.

The ingestion path recorded the exception's string representation. Some exceptions do not have a helpful string. A timeout can carry an empty message, which would leave a log line saying that an episode failed without revealing the type or the stack that explained where it failed. The historical record describes exactly that: a blank-looking failure that kept having to be rediscovered.

The historical source changed the handler to logger.exception and still returned False. The code did not make the document succeed. It made the unsuccessful attempt more inspectable.

<p class="code-source">Exact fragment, dedented: packages/rootweaver-graph/src/rootweaver_graph/graphiti_client.py, add_episode(), historical commit 1e61f206. Intervening explanatory comments omitted; executable statements unchanged.</p>

```python
except Exception:
    logger.exception(f"Failed to add episode '{name}'")
    return False
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

1. The except branch catches any exception raised during the episode addition attempt.
2. `logger.exception` records the message with the full traceback and exception type. The document name identifies the failed item.
3. Returning `False` signals that this specific episode did not succeed, without aborting the surrounding batch.

</details>

The [Python Software Foundation's logging reference](https://docs.python.org/3/library/logging.html#logging.Logger.exception) explains that exception-logging behaviour. The change went in through a merge request authored by the coding agent. A regression test was written to fail against the old code and pass against the fix, and the package's full test suite ran green across two seeds.

The important engineering change was not that documents suddenly succeeded. It was that failures could now be seen and classified.

## One symptom concealed independent causes

Once the exceptions became visible, the July 1 record identified two independently fatal paths. The embedder could run out of time while processing a large batch. The extraction model could return text that did not parse as the required JSON.

| Failure | Evidence in the July 1 report | Intervention it needs |
|---|---|---|
| Embedding read timeout | Large batch against a 30-second client timeout | Configurable timeout and bounded sub-batches |
| Extraction JSON error | A large response failed parsing | Inspect the actual client and structured-output request path |
| Job completion despite failures | Per-item errors caught and continued | Inspect item outcomes and graph/marker state |
| Model-service cycling | Connection failures during a full backfill | File as its own dependency-resilience work item |

Those require different interventions. Waiting longer for an embedding request cannot repair malformed extraction output. A schema correction cannot make an overloaded embedding batch finish before its client timeout. Treating both as one vague graph-ingestion failure makes it easy to keep changing the wrong layer.

<figure class="story-flow" data-policy-flow id="story-path"><h3>Job health and document outcomes are separate</h3><div class="flow-desktop"><svg aria-labelledby="s5e01-d-title s5e01-d-desc" class="publish-svg" role="img" viewBox="0 0 720 340" xmlns="http://www.w3.org/2000/svg"><title id="s5e01-d-title">Job health and document outcomes are separate</title><desc id="s5e01-d-desc">Simplified dependency map. Graphiti can make interleaved extraction and embedding calls; this diagram is not an exact call-order trace. Per-item failure can coexist with process exit zero. Arrows show conceptual dependencies, not completed processing.</desc><defs><pattern height="24" id="s5e01-d-grid" patternunits="userSpaceOnUse" width="24"><circle cx="2" cy="2" fill="#3b3f4a" r=".8"></circle></pattern><marker id="s5e01-d-arrow" markerheight="6" markerwidth="6" orient="auto" refx="9" refy="5" viewBox="0 0 10 10"><path d="M0 0L10 5 0 10" fill="none" stroke="#a78bfa" stroke-width="1.5"></path></marker></defs><style>.publish-svg{font-family:system-ui,sans-serif}.publish-svg .flow-motion{fill:none;stroke:#a78bfa;stroke-width:1.8;stroke-dasharray:3 7;animation:flowdash 1.4s linear infinite}@keyframes flowdash{to{stroke-dashoffset:-20}}.flow-paused .publish-svg .flow-motion{animation-play-state:paused}@media(prefers-reduced-motion:reduce){.publish-svg .flow-motion{animation:none}}</style><rect fill="#141414" height="340" rx="12" width="720"></rect><rect fill="url(#s5e01-d-grid)" height="340" rx="12" width="720"></rect><path class="flow-motion" d="M159 57H321" data-flow-edge="" marker-end="url(#s5e01-d-arrow)"></path><path class="flow-motion" d="M399 57H561" data-flow-edge="" marker-end="url(#s5e01-d-arrow)"></path><path class="flow-motion" d="M321 57H280V156H120V166" data-flow-edge="" marker-end="url(#s5e01-d-arrow)"></path><path class="flow-motion" d="M639 57H692V156H360V166" data-flow-edge="" marker-end="url(#s5e01-d-arrow)"></path><path class="flow-motion" d="M159 205H321" data-flow-edge="" marker-end="url(#s5e01-d-arrow)"></path><path class="flow-motion" d="M399 205H561" data-flow-edge="" marker-end="url(#s5e01-d-arrow)"></path><g transform="translate(120,57)"><circle fill="#1c1e24" r="30" stroke="#4b435e"></circle><g fill="none" stroke="#c4b5fd" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"><rect height="32" rx="2" width="24" x="-12" y="-16"></rect><path d="M-6-7h12M-6 0h12M-6 7h9"></path></g></g><text fill="#e9eaee" font-size="18" font-weight="650" text-anchor="middle" x="120" y="110">Documents</text><text fill="#aab0bc" font-size="14" text-anchor="middle" x="120" y="133">Selected corpus</text><g transform="translate(360,57)"><circle fill="#1c1e24" r="30" stroke="#4b435e"></circle><g fill="none" stroke="#c4b5fd" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"><path d="M-8 10v-5c-14-12-3-25 8-23 13 0 20 13 8 23v5zM-7 15H7M-5 19H5"></path></g></g><text fill="#e9eaee" font-size="18" font-weight="650" text-anchor="middle" x="360" y="110">Graphiti</text><text fill="#aab0bc" font-size="14" text-anchor="middle" x="360" y="133">Per-item attempt</text><g transform="translate(600,57)"><circle fill="#1c1e24" r="30" stroke="#4b435e"></circle><g fill="none" stroke="#c4b5fd" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"><path d="M-16-15v30h33M-9 8V0M0 8v-17M9 8v-12"></path></g></g><text fill="#e9eaee" font-size="18" font-weight="650" text-anchor="middle" x="600" y="110">Extraction</text><text fill="#aab0bc" font-size="14" text-anchor="middle" x="600" y="133">Valid structure</text><g transform="translate(120,205)"><circle fill="#1c1e24" r="30" stroke="#4b435e"></circle><g fill="none" stroke="#c4b5fd" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"><path d="M-16-15v30h33M-9 8V0M0 8v-17M9 8v-12"></path></g></g><text fill="#e9eaee" font-size="18" font-weight="650" text-anchor="middle" x="120" y="258">Embeddings</text><text fill="#aab0bc" font-size="14" text-anchor="middle" x="120" y="281">Batch / timeout</text><g transform="translate(360,205)"><circle fill="#1c1e24" r="30" stroke="#4b435e"></circle><g fill="none" stroke="#c4b5fd" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"><rect height="32" rx="2" width="24" x="-12" y="-16"></rect><path d="M-6-7h12M-6 0h12M-6 7h9"></path></g></g><text fill="#e9eaee" font-size="18" font-weight="650" text-anchor="middle" x="360" y="258">Graph write</text><text fill="#aab0bc" font-size="14" text-anchor="middle" x="360" y="281">Inspect data</text><g transform="translate(600,205)"><circle fill="#1c1e24" r="30" stroke="#4b435e"></circle><g fill="none" stroke="#c4b5fd" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"><path d="M0-17l15 6v12c-1 9-8 14-15 17-7-3-14-8-15-17v-12z"></path><path d="M-6 0l4 5 9-11"></path></g></g><text fill="#e9eaee" font-size="18" font-weight="650" text-anchor="middle" x="600" y="258">Marker</text><text fill="#aab0bc" font-size="14" text-anchor="middle" x="600" y="281">Only after success</text><text fill="#aab0bc" font-size="13" text-anchor="middle" x="360.0" y="316">Conceptual path; dots are not live traffic.</text></svg></div><div class="flow-mobile"><svg aria-labelledby="s5e01-m-title s5e01-m-desc" class="publish-svg" role="img" viewBox="0 0 360 640" xmlns="http://www.w3.org/2000/svg"><title id="s5e01-m-title">Job health and document outcomes are separate</title><desc id="s5e01-m-desc">Simplified dependency map. Graphiti can make interleaved extraction and embedding calls; this diagram is not an exact call-order trace. Per-item failure can coexist with process exit zero. Arrows show conceptual dependencies, not completed processing.</desc><defs><pattern height="24" id="s5e01-m-grid" patternunits="userSpaceOnUse" width="24"><circle cx="2" cy="2" fill="#3b3f4a" r=".8"></circle></pattern><marker id="s5e01-m-arrow" markerheight="6" markerwidth="6" orient="auto" refx="9" refy="5" viewBox="0 0 10 10"><path d="M0 0L10 5 0 10" fill="none" stroke="#a78bfa" stroke-width="1.5"></path></marker></defs><style>.publish-svg{font-family:system-ui,sans-serif}.publish-svg .flow-motion{fill:none;stroke:#a78bfa;stroke-width:1.8;stroke-dasharray:3 7;animation:flowdash 1.4s linear infinite}@keyframes flowdash{to{stroke-dashoffset:-20}}.flow-paused .publish-svg .flow-motion{animation-play-state:paused}@media(prefers-reduced-motion:reduce){.publish-svg .flow-motion{animation:none}}</style><rect fill="#141414" height="640" rx="12" width="360"></rect><rect fill="url(#s5e01-m-grid)" height="640" rx="12" width="360"></rect><path class="flow-motion" d="M50 90V110" data-flow-edge="" marker-end="url(#s5e01-m-arrow)"></path><path class="flow-motion" d="M50 186V206" data-flow-edge="" marker-end="url(#s5e01-m-arrow)"></path><path class="flow-motion" d="M81 148H88V340H82" data-flow-edge="" marker-end="url(#s5e01-m-arrow)"></path><path class="flow-motion" d="M81 244H88V436H82" data-flow-edge="" marker-end="url(#s5e01-m-arrow)"></path><path class="flow-motion" d="M50 378V398" data-flow-edge="" marker-end="url(#s5e01-m-arrow)"></path><path class="flow-motion" d="M50 474V494" data-flow-edge="" marker-end="url(#s5e01-m-arrow)"></path><g transform="translate(50,52)"><circle fill="#1c1e24" r="30" stroke="#4b435e"></circle><g fill="none" stroke="#c4b5fd" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"><rect height="32" rx="2" width="24" x="-12" y="-16"></rect><path d="M-6-7h12M-6 0h12M-6 7h9"></path></g></g><text fill="#e9eaee" font-size="18" font-weight="650" text-anchor="start" x="103" y="47">Documents</text><text fill="#aab0bc" font-size="14" text-anchor="start" x="103" y="70">Selected corpus</text><g transform="translate(50,148)"><circle fill="#1c1e24" r="30" stroke="#4b435e"></circle><g fill="none" stroke="#c4b5fd" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"><path d="M-8 10v-5c-14-12-3-25 8-23 13 0 20 13 8 23v5zM-7 15H7M-5 19H5"></path></g></g><text fill="#e9eaee" font-size="18" font-weight="650" text-anchor="start" x="103" y="143">Graphiti</text><text fill="#aab0bc" font-size="14" text-anchor="start" x="103" y="166">Per-item attempt</text><g transform="translate(50,244)"><circle fill="#1c1e24" r="30" stroke="#4b435e"></circle><g fill="none" stroke="#c4b5fd" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"><path d="M-16-15v30h33M-9 8V0M0 8v-17M9 8v-12"></path></g></g><text fill="#e9eaee" font-size="18" font-weight="650" text-anchor="start" x="103" y="239">Extraction</text><text fill="#aab0bc" font-size="14" text-anchor="start" x="103" y="262">Valid structure</text><g transform="translate(50,340)"><circle fill="#1c1e24" r="30" stroke="#4b435e"></circle><g fill="none" stroke="#c4b5fd" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"><path d="M-16-15v30h33M-9 8V0M0 8v-17M9 8v-12"></path></g></g><text fill="#e9eaee" font-size="18" font-weight="650" text-anchor="start" x="103" y="335">Embeddings</text><text fill="#aab0bc" font-size="14" text-anchor="start" x="103" y="358">Batch / timeout</text><g transform="translate(50,436)"><circle fill="#1c1e24" r="30" stroke="#4b435e"></circle><g fill="none" stroke="#c4b5fd" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"><rect height="32" rx="2" width="24" x="-12" y="-16"></rect><path d="M-6-7h12M-6 0h12M-6 7h9"></path></g></g><text fill="#e9eaee" font-size="18" font-weight="650" text-anchor="start" x="103" y="431">Graph write</text><text fill="#aab0bc" font-size="14" text-anchor="start" x="103" y="454">Inspect data</text><g transform="translate(50,532)"><circle fill="#1c1e24" r="30" stroke="#4b435e"></circle><g fill="none" stroke="#c4b5fd" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"><path d="M0-17l15 6v12c-1 9-8 14-15 17-7-3-14-8-15-17v-12z"></path><path d="M-6 0l4 5 9-11"></path></g></g><text fill="#e9eaee" font-size="18" font-weight="650" text-anchor="start" x="103" y="527">Marker</text><text fill="#aab0bc" font-size="14" text-anchor="start" x="103" y="550">Only after success</text><text fill="#aab0bc" font-size="13" text-anchor="middle" x="180.0" y="620">Conceptual path; dots are not live traffic.</text></svg></div><div class="flow-tools"><button aria-pressed="false" data-flow-motion type="button">Pause flow</button><button data-flow-expand type="button">Expand diagram</button></div><figcaption>Simplified dependency map. Graphiti can make interleaved extraction and embedding calls; this diagram is not an exact call-order trace. Per-item failure can coexist with process exit zero. Arrows show conceptual dependencies, not completed processing.</figcaption></figure>
<p><dialog aria-label="Expanded diagram" data-flow-dialog><button data-flow-close type="button">Close expanded diagram</button><div data-flow-expanded-content></div></dialog></p>
<script is:inline src="/posts/s5e01/review-v2/flow-ui.js"></script>
<script is:inline src="/posts/s5e01/review-v2/flow-motion.js"></script>


## Cause A: the embedder's 30-second ceiling

The first cause was an embedding timeout, and it was the cleaner of the two. The embedding client was configured with a thirty-second timeout and sent the whole document batch in one request. The embedding model behind that request was [Qwen3-Embedding-4B](https://huggingface.co/Qwen/Qwen3-Embedding-4B), a four-billion-parameter model producing 2560-dimension vectors. The July 1 report notes the inference server doing extraction was contending for the same graphics card, which slowed the embedding service's response.

The retained embedder source shows the shape of the problem directly. One helper builds a single HTTP client with a thirty-second timeout, and the batch path funnels the whole workload through one POST to it:

<p class="code-source">Exact fragment, dedented: packages/rootweaver-graph/src/rootweaver_graph/embedder.py, _embed() and create_batch(), historical commit 1e61f206 — the state that produced the timeout. Docstring and interface comments omitted; executable statements unchanged.</p>

```python
async def _embed(texts: list[str]) -> list[list[float]]:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            EMBEDDING_SERVICE_URL,
            json={"model": EMBEDDING_MODEL, "input": texts},
        )
        resp.raise_for_status()
        return [d["embedding"] for d in resp.json()["data"]]

class LocalEmbedder(EmbedderClient):
    async def create_batch(self, input_data_list: list[str]) -> list[list[float]]:
        if not input_data_list:
            return []
        return await _embed(input_data_list)
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

1. The thirty-second timeout is a client-side setting on a single shared HTTP client.
2. `_embed` posts one request whose body is the entire `texts` list — the code puts no bound on how large that list can be.
3. The July 1 report traces the failing call to Graphiti's deduplication path, which asks the embedder for a large batch during a backfill.
4. `create_batch` forwards that whole list to `_embed` unchanged, so a large batch becomes one large request.
5. Against a contended GPU, that one request is the one that can outlast the client-side thirty seconds and fail the episode.

</details>

The proposed fix was to raise the configurable timeout and split the batch into bounded sub-batches so that a slow embedding request could finish without hitting the client ceiling.

The embedder proposal was concrete: split one large request into ordered smaller requests and make the timeout configurable. For a synthetic batch of 100 items with a limit of 32, the request sizes would be 32, 32, 32 and 4. That arithmetic is not a throughput benchmark. It explains the shape of the change and the ordering contract it needed to preserve.

<p class="code-source">Synthetic explanation of the reported sub-batch proposal, not an exact production implementation.</p>

```python
items = list(range(100))
batches = [items[start:start + 32] for start in range(0, len(items), 32)]
assert [len(batch) for batch in batches] == [32, 32, 32, 4]
assert [item for batch in batches for item in batch] == items
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

1. `items` stands in for a hundred work units that must be embedded in order.
2. The list comprehension slices them into chunks of at most 32, preserving order.
3. The first assertion checks the request sizes a real batching implementation would produce: 32, 32, 32 and 4.
4. The second assertion checks that concatenating the sub-batches reproduces the original sequence exactly — no item lost, reordered, or duplicated.

</details>

The first assertion checks request sizes. The second checks that reconstruction preserves every item's position. Without that second contract, a faster or more resilient embedder could quietly associate vectors with the wrong inputs — a failure that would look like success and corrupt semantic matching downstream.

## Cause B: the extraction response that was not truncation

The second cause was harder. The extraction response from the [Qwen3-8B](https://huggingface.co/Qwen/Qwen3-8B) model was structurally invalid JSON despite the schema enforcement and the token cap. The error appeared at a specific character position deep in the response, suggesting a malformed structure rather than a simple truncation.

The first guess was truncation: a large response cut off mid-way would produce exactly this kind of parse failure. The evidence did not match that guess. A truncated response fails at the end of the payload, where the cut lands. This error position meant something inside the payload itself was malformed — the structured-output instructions and the model's actual output were interacting in a way the parser could not accept.

The open question was whether structured-output enforcement was actually taking effect on the production request path, not just in isolated probes. The answer required inspecting the actual request that the extraction client sent to the inference server. The July 2 follow-up's corrected extraction client and explicit token-limit forwarding is the resolution of exactly that question: the request path was wrong in a way that only became visible once the exception text was being logged properly.

### Why the token cap never reached the model

The retained source shows how the token cap was supposed to travel. A helper reads `GRAPHITI_MAX_TOKENS` from the environment with explicit validation, the configuration object carries it, and the client is constructed with that configuration plus the same value passed again as its own parameter:

<p class="code-source">Exact fragment, dedented: packages/rootweaver-graph/src/rootweaver_graph/graphiti_client.py, client construction, historical commit 1e61f206 — the state the July 2 fix replaced. Intervening explanatory comments omitted; executable statements unchanged.</p>

```python
graphiti_max_tokens = _graphiti_max_tokens_from_env()
llm_config = LLMConfig(
    api_key="not-needed",
    base_url=vllm_base_url,
    model=llm_model,
    small_model=llm_model,
    max_tokens=graphiti_max_tokens,
)
llm_client = GuidedJSONOpenAIClient(
    config=llm_config,
    max_tokens=graphiti_max_tokens,
)
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

1. The environment helper reads `GRAPHITI_MAX_TOKENS`, rejecting empty, non-integer and non-positive values with a logged warning instead of a silent fallback.
2. The validated value lands in the `LLMConfig` object that the Graphiti library receives.
3. The same value is passed a second time as the constructor's own `max_tokens` argument.
4. That double passing is deliberate. The July 2 follow-up reports that the corrected generic client's initialiser reads the configuration value and then overwrites its token attribute with its own parameter default of 16384 — so an environment-configured cap would have been silently dead unless it was also forwarded explicitly.
5. The historical construction targets the guided-JSON subclass. The corrected client switched to the generic chat path with the token limit forwarded explicitly, and the guided subclass remained as deliberately orphaned code for a later cleanup.

</details>

The override explains why a configuration that looked correct could still leave the real request carrying a different value than the operator set. It is the same shape of lesson as the empty log: the outer system held one value while the actual request path carried another. Verifying that parameter forwarding reaches the request is now a standing check rather than an assumption.

## Fixes still needed a stable opportunity to run

The July 2 follow-up reports the batching and timeout change merged, alongside a corrected extraction client that forwarded the token limit explicitly. It describes a successful single-document probe: total nodes moved from eleven to twelve and completion markers from three to four, without the earlier JSON error in that probe.

Those total-node observations are not directly comparable to the earlier Entity-only count. They measure different scopes. I have not retained the raw original probe output here, so the numbers remain attributed to that handover rather than presented as newly measured results.

Each code fix also had to travel a fixed path before it could run against real documents: the change merges to main, a container image builds, the CronJob's image reference is updated through the GitOps repository, and the controller reconciles the cluster. Only then does a new backfill run against the fix. The July 1 record describes this as roughly a forty-minute loop per fix, end to end.

That cadence shaped the work. A fix that cannot be tested locally has to survive a deployment loop before it can be evaluated, which means the diagnosis has to be as precise as possible before each loop starts.

The full backfill still did not complete. The same follow-up describes the model service cycling under the GPU-priority arrangement, creating connection failures. That is another layer: code can handle the request correctly when a dependency is available and still fail when that dependency is deliberately removed.

The important change was learning to name those layers separately. Visibility exposed timeout and format problems. The follow-up supplied bounded evidence for code fixes. Stable dependency access and full-corpus completion remained work to do.

The graph would only become a useful memory if successful items and failed items stayed distinguishable across retries. More visible progress was useful; it was not permission to forget the missing part.

![Engineer sorts parcels into distinct trays with unfinished items retained aside.](/posts/s5e01/review-v2/inline.png)

<p class="caption">Different failures need separate explanations, and unfinished items remain visible for retries. Conceptual artwork; placement pending review.</p>

## The retries were safe by construction

One design in the June 30 record was worth naming: content-hash idempotency. A document's completion marker is written only when the ingestion of that document succeeds. A document that fails leaves no marker. A later run reprocesses exactly the unmarked documents and skips the marked ones.

That gives retries a property that is easy to lose: they make progress without making garbage. A failed document does not leave half-written entities behind. The graph fills cumulatively across runs, and the set of documents that still need work is exactly the set without markers.

## Empty logs are a symptom too

One more lesson from the July 2 record: the ingestion job's own logging handler was never configured at the entry point. Even after the client library's exception logging was fixed, the job's container logs stayed empty on failure. The historical record describes the cost: a stalled backfill that looked like a hang until a manual probe revealed the real error. The follow-up filed the entry-point logging fix as its own small work item, to be done before the next backfill so that failures are visible — and the handler work was not completed inside this episode's window.

## What I would carry into the next run

I do not need to make the historical result look cleaner than it was. It was progress from a poorly explained failure to specific code changes and a better understanding of the remaining dependency problem.

| Lesson | Practical response |
|---|---|
| A count is not a corpus | Track selected, attempted, completed and failed items separately |
| Silent failure is a design flaw | Configure logging at the entry point before the first run |
| Client library defaults can override config | Verify parameter forwarding reaches the actual request |
| Batching has a latency ceiling | Bound batch sizes and make timeouts configurable |
| Schema enforcement must be verified live | Inspect the production request path, not just probes |
| Retry markers are the ledger | Only mark completion on genuine success |
| Deployment lag is real | A fix on main is not a fix in the running container |
| Diagnosis precision beats fix speed | Name the layer before writing code for it |
| Model contention is a shared-GPU reality | Budget for interference between workloads |
| Intent and validation are different gates | A deployed system is not a working one |

Next: the proposed second chapter follows a smaller model into the same platform. Its fit on the GPU mattered, but so did the benchmark that justified it and the consumers still expecting an old model name.

## Terms and references

<details data-glossary class="glossary"><summary>Glossary — plain-English definitions</summary><div class="glossary-tools" hidden><label for="glossary-search">Find a term</label><div class="glossary-search-row"><input id="glossary-search" type="search"><button type="button">Clear</button></div><p role="status" aria-live="polite"></p></div><section class="glossary-term"><h3>Knowledge graph</h3><p>A representation of entities and their relationships, built so that queries can traverse connections rather than only match text.</p></section><section class="glossary-term"><h3>Hybrid search</h3><p>Combining multiple retrieval signals — vector similarity, keyword matching and graph traversal — into one merged result set.</p></section><section class="glossary-term"><h3>Embedding</h3><p>A numeric representation of text used for semantic matching; producing one has latency and ordering contracts.</p></section><section class="glossary-term"><h3>Structured output</h3><p>Constraining a language model's response to a schema so downstream code can parse it reliably.</p></section><section class="glossary-term"><h3>Episode</h3><p>Graphiti's unit of ingestion: one attempt to add one document's content to the graph.</p></section><section class="glossary-term"><h3>Traceback</h3><p>The recorded chain of calls leading to an exception.</p></section><section class="glossary-term"><h3>Per-item outcome</h3><p>The success or failure of one selected document, separate from a whole-job exit code.</p></section><section class="glossary-term"><h3>Retry marker</h3><p>A record that a document has been successfully processed; its absence is what identifies work still to do.</p></section><section class="glossary-term"><h3>vLLM</h3><p>A self-hosted inference server exposing language models behind an OpenAI-compatible HTTP interface; its request contracts had to be verified on the live path, not only in probes.</p></section><section class="glossary-term"><h3>GitOps</h3><p>Managing cluster configuration by committing desired state to a repository and letting a controller reconcile the running system against it — so a merged fix still has to travel through an image build and a repository update before it runs.</p></section><section class="glossary-term"><h3>CronJob</h3><p>A scheduled job object in Kubernetes; this episode's ingestion ran as manually triggered one-off jobs while the schedule itself stayed suspended.</p></section><section class="glossary-term"><h3>Content-hash idempotency</h3><p>Marking each document's completion by a hash of its content, so retries reprocess only unmarked documents and leave successful ones alone.</p></section><p>Primary reference: <a href="https://github.com/getzep/graphiti">Graphiti by Zep</a>.</p></details>

<details class="source-note">
<summary>How this episode was reconstructed</summary>

No previous Season 5 map or pre-crafted opener was recovered in scoped searches; the title and numbering are new editorial proposals. Core July 1, June 30 setup and July 2 follow-up are explicitly declared. Raw 46KB response, original pod logs, complete corpus and raw probe outputs were not independently replayed. Larger graph/embedding/hackathon work is outside this chapter.

No original native conversation replay or complete period inventory is claimed. Sources are scoped by named historical handovers, ADRs, reports and Git commits. Relevance search is not exhaustive coverage. Raw credentials, account identifiers, and Habi content are absent from the public draft. Current external documentation is explanatory and not a historical deployment observation.

</details>

<script is:inline src="/posts/s5e01/review-v2/reader.js"></script>
<style is:global>
main{min-width:0}main>p:not(:has(img)){max-width:74ch}main>ul,main>ol{max-width:74ch}.eyebrow{text-transform:none;letter-spacing:.025em}.reading-progress{position:fixed;left:0;top:0;height:3px;width:0;background:var(--accent);z-index:20;pointer-events:none}.reading-tools{max-width:1160px;margin:0 auto;padding:14px 28px 0;display:flex;justify-content:flex-end;gap:8px}.reader-button,.copy-code,.expand-diagram{border:1px solid var(--border);background:var(--card);color:var(--text);padding:7px 11px;border-radius:6px;font-size:11px}.copy-code{float:right;margin-left:10px}.code-source{display:flow-root}.contents a[aria-current="location"]{color:var(--accent);font-weight:600}.reading-focus .contents{display:none}.reading-focus .page-grid{display:block;max-width:800px}.reading-focus .nav-links>a{display:none}.reading-focus .article-header{max-width:none}.diagram{position:relative}.expand-diagram{display:block;margin:12px auto 0;background:#192d46;color:#eef6ff;border-color:#5c86a6}dialog{width:min(96vw,1300px);height:92vh;max-height:92vh;padding:18px;border:1px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text)}dialog::backdrop{background:rgba(0,0,0,.8)}.dialog-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}.diagram-scroll{overflow:auto;height:calc(100% - 54px);background:#101c2d;border-radius:8px}.diagram-scroll img{width:1200px;max-width:none;border-radius:0;margin:0 auto}.sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:600px){.reading-tools{padding:12px 18px 0}.copy-code{padding:4px 7px}.dialog-head{font-size:12px}dialog{padding:10px}.diagram-scroll img{width:1000px}}
.article-header{border-left:3px solid var(--accent);padding-left:22px}.eyebrow{margin-top:25px}.page-grid{grid-template-columns:minmax(0,740px) 210px;gap:64px}.code-box{box-shadow:0 8px 22px #00000012}h2{border-bottom:0;padding-bottom:0}.caption{border-left:0;padding-left:0}@media(max-width:600px){.article-header{padding-left:15px}}
details.walkthrough{padding:0}details.walkthrough summary{padding:13px 18px;cursor:pointer;color:var(--accent);font-size:12px;font-weight:550;list-style-position:inside}details.walkthrough summary:hover{background:var(--chip)}details.walkthrough[open] summary{border-bottom:1px solid var(--border)}details.walkthrough .explanation-body{padding:14px 18px}details.walkthrough summary:focus-visible{outline-offset:-4px}@media(max-width:600px){details.walkthrough summary{padding:12px 14px}details.walkthrough .explanation-body{padding:12px 14px}}

main{min-width:0}.notebook-article table{display:block;max-width:100%;min-width:0;overflow-x:auto}.table-wrap{overflow:auto;max-width:100%}table{min-width:580px}summary{cursor:pointer}details.glossary,details.source-note{border:1px solid var(--border);border-radius:8px;padding:16px;margin:25px 0}.glossary-term{border-top:1px solid var(--border)}.glossary-tools input{font:inherit;max-width:100%}.glossary-search-row{display:flex;gap:12px}.glossary-search-row input{min-width:0}.glossary-tools button,.flow-tools button{font:inherit;padding:7px 12px}.code-source{font-size:12px}.contents{margin-top:160px}pre{overflow:auto}h3{font-size:17px}figcaption,.caption{font-size:12px}code{overflow-wrap:anywhere;white-space:normal}pre code{white-space:pre}.flow-tools{display:flex;gap:12px;margin:10px 0}.publish-flow{margin:28px 0}.publish-flow h3{margin:0 0 14px}.publish-flow figcaption{line-height:1.6;color:var(--muted,#aab0bc)}.flow-tools button,dialog button{background:#1c1e24;color:#e9eaee;border:1px solid #75608f;border-radius:6px;padding:9px 12px;cursor:pointer}.flow-mobile{display:none}.flow-desktop svg,.flow-mobile svg{display:block;width:100%;height:auto}dialog{color:var(--text);background:var(--bg);border:1px solid var(--border);max-width:min(1150px,95vw);max-height:90vh;width:95vw}dialog::backdrop{background:#000b}.asset-option{margin:38px 0}.review-links{display:flex;gap:18px;flex-wrap:wrap}@media(max-width:600px){input{font-size:16px!important}.flow-desktop{display:none}.flow-mobile{display:block}code{font-size:.88em}}
main{min-width:0}main img{width:100%;height:auto;display:block}.story-flow{margin:28px 0}.story-flow h3{margin:0 0 14px}.story-flow figcaption{font-size:12px;line-height:1.6;color:var(--muted)}.flow-mobile{display:none}.flow-desktop svg,.flow-mobile svg{display:block;width:100%;height:auto}.table-wrap{overflow-x:auto;max-width:100%}.notebook-article table{display:block;min-width:0;max-width:100%;overflow-x:auto}.notebook-article p{font-size:15px}pre{max-width:100%;overflow-x:auto}code{overflow-wrap:anywhere}pre code{white-space:pre}.asset-option{margin:35px 0}.review-links{display:flex;flex-wrap:wrap;gap:14px}summary{cursor:pointer}dialog{max-width:95vw;width:1000px;background:var(--bg);color:var(--text)}dialog::backdrop{background:#000b}@media(max-width:600px){main p,main li{font-size:14px}.flow-desktop{display:none}.flow-mobile{display:block}.glossary-search-row{display:flex;gap:8px}.glossary-search-row input{min-width:0;font-size:16px}}
</style>

<style is:global>@media(max-width:600px){.notebook-article p,.notebook-article li{font-size:14px!important}}</style>
