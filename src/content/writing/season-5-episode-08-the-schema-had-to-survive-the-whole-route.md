---
title: "The Schema Had to Survive the Whole Route"
description: "The graph backfill needed enforced output structure across its provider route. Once it progressed, bounded concurrency exposed a different limit in the database."
pubDatetime: 2026-07-10T12:00:00Z
draft: false
shippingDatetime: 2026-11-13T08:00:00Z
imageAlt: "The Rootweaver engineer follows a parcel through handling frames at a freight loading dock."
author: Ryan Duffy
episode: 8
image: /images/blog/s5e08/hero-A.png
series: "Season 5: Rootweaver"
tags: [Rootweaver, KnowledgeGraphs, LLM, Reliability]
---

Episode 4 paused the graph backfill after a defensive parser repair left too much extraction output in doubt. The intervening work improved how agents found history, assessed their instructions and represented evidence for publishing. The graph backlog remained. Returning to it required a better generation contract, not another claim that readable JSON was enough.

I wanted documents to enter the graph with a response structure the ingestion code could rely on. The later records describe a decision to keep the remote extraction route and repair enforcement across it. The application then gained an opt-in concurrency limit. That made progress possible, but also exposed how easily a faster stage can move the pressure into the next one.

![The Rootweaver engineer follows a parcel through handling frames at a freight loading dock.](/images/blog/s5e08/hero-A.png)

<p class="caption">A requirement has to survive every hand-off before the receiving stage can rely on it. Conceptual illustration.</p>

This chapter covers July 9–10, 2026, with the detailed implementation and runtime account centred on July 10. It is a curated reconstruction from the backfill handover, later edge-coercion handover and historical client/ingestion source at `0dff3571`. I owned direction and review; agents assisted with implementation and checking. Reported provider probes, deployment checks and job progress have not been independently replayed. New examples and checks use isolated synthetic inputs without model calls, credentials or cluster changes.

## A schema request was only one boundary

The output contract travelled through more than one component. Rootweaver's client called a gateway route, that route reached OpenRouter, and OpenRouter selected a provider endpoint serving the requested model. The final response returned through the same chain before Graphiti attempted to validate it.

Every link mattered. A client could ask for a JSON schema while an intermediate configuration dropped an unsupported parameter. A provider could return valid JSON without enforcing the requested response structure. A compatible endpoint name therefore did not establish compatibility with every optional feature the caller intended to use.

The July account identifies two route-level settings: `drop_params: false` and `provider.require_parameters: true`. The reported purpose was to preserve requested parameters and require a compatible provider route rather than silently accept a different capability set. The platform also pinned the generic client's structured-output mode explicitly.

[OpenRouter's structured-output documentation](https://openrouter.ai/docs/guides/features/structured-outputs) describes the schema feature and its support requirements. That primary reference explains the contract; it is not a new test of the July route. The runtime evidence in this episode remains the dated report that a schema-shaped probe succeeded through the deployed gateway configuration.

| Boundary | Required agreement | Failure that an earlier pass would miss |
|---|---|---|
| Application client | Request the intended structured mode | A default changes or the wrong setting is read |
| Gateway route | Preserve the relevant parameters | Unsupported fields disappear before the provider sees them |
| Provider selection | Choose an endpoint supporting those parameters | The chosen model route lacks the intended enforcement |
| Response validation | Check the returned value against the contract | Syntactically valid JSON has the wrong shape |
| Task review | Inspect the extracted content and graph result | Correctly shaped output contains poor or irrelevant entities |

This is why the defensive coercion from Episode 4 was still useful without being the whole solution. It could recover a wrapper or an encoded entity when the information was present. It could not create the facts that an unconstrained response omitted. Enforcement tried to improve what arrived at that boundary; it did not make semantic review unnecessary.

## The generic client got its own explicit mode

The historical implementation added a configuration reader for the generic client. The default was `json_schema`; the accepted alternative was `json_object`. Invalid input produced a warning and fell back to the schema default. This was separate from the guided-decoding setting used on a different client path.

<p class="code-source">client.py · _generic_structured_output_mode · platform 0dff3571</p>

```python
def _generic_structured_output_mode() -> str:
    raw_value = os.getenv(GRAPHITI_GENERIC_STRUCTURED_MODE_ENV, "json_schema")
    mode = raw_value.strip().lower()
    if mode in _GENERIC_STRUCTURED_OUTPUT_MODES:
        return mode

    logger.warning(
        "Invalid %s=%r; using default json_schema",
        GRAPHITI_GENERIC_STRUCTURED_MODE_ENV,
        raw_value,
    )
    return "json_schema"
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- The environment value defaults to json_schema, then whitespace and case are normalised.
- An accepted mode returns directly; the retained vocabulary contains json_schema and json_object.
- Other text is reported through a warning, preserving an observable configuration mistake.
- The fallback returns the schema mode. That is application intent, not proof a remote endpoint enforced it.

</details>

That separation prevents a familiar configuration mistake. A variable can exist, be set correctly and still be irrelevant if the active client does not read it. The new code made the active generic-client choice inspectable rather than relying on a nearby vLLM-specific option to imply behaviour elsewhere.

The two modes also have different meanings. Asking for a JSON object constrains the broad response form. Asking for a JSON schema requests a more specific structure. Neither name should be treated as evidence that every provider actually enforced it in every call. The route must support the option, and the result still has to be checked.

The retained constructor passes this mode into the generic client. The surrounding tests cover the configured choice and its default behaviour. Those tests are useful evidence about application intent. They do not replace the route-level probe, because a fake client cannot demonstrate what an external gateway or endpoint forwards.

Here is a synthetic teaching payload showing the two layers of intent. It is deliberately shortened and is not an executable reproduction of the original request:

```json
{
  "response_format": {
    "type": "json_schema",
    "json_schema": {"name": "ExtractedEntities", "strict": true}
  },
  "provider": {"require_parameters": true}
}
```

The schema name identifies the expected response contract. `strict` expresses the requested constraint. `require_parameters` concerns provider compatibility. A real request also needs the complete schema, model, messages, route configuration and any required authentication. Omitting those here keeps the example focused; it must not be copied as a complete provider call.

<figure id="mechanism" class="story-flow" data-policy-flow><h3>Follow the mechanism</h3><div class="flow-desktop"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 210" role="img" aria-label="Episode 8 simplified mechanism"><defs><pattern id="grid-e8-d" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arr-e8-d" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="#a78bfa"/></marker></defs><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#grid-e8-d)"/><path data-flow-edge class="flow-motion" d="M95 62H190" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e8-d)"/><path data-flow-edge class="flow-motion" d="M240 62H335" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e8-d)"/><path data-flow-edge class="flow-motion" d="M385 62H480" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e8-d)"/><path data-flow-edge class="flow-motion" d="M530 62H625" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e8-d)"/><g transform="translate(70 62)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><rect x="-9" y="-12" width="18" height="24" rx="2"/><path d="M-5-5H5M-5 1H5M-5 7H3"/></g></g><text x="70" y="109" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Client</text><text x="70" y="129" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Request schema mode</text><g transform="translate(215 62)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><path d="M-14-11H14L4 2V12H-4V2Z"/></g></g><text x="215" y="109" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Gateway</text><text x="215" y="129" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Preserve parameters</text><g transform="translate(360 62)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><path d="M-12 0L-3 9L14-10"/></g></g><text x="360" y="109" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Provider</text><text x="360" y="129" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Compatible endpoint</text><g transform="translate(505 62)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><circle cx="-6" cy="-3" r="7"/><path d="M0 2L12 14M8 10L12 6"/></g></g><text x="505" y="109" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Ingestion</text><text x="505" y="129" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Bound active writes</text><g transform="translate(650 62)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><circle cx="0" cy="-11" r="4"/><circle cx="-12" cy="9" r="4"/><circle cx="12" cy="9" r="4"/><path d="M-2-7L-10 5M2-7L10 5M-8 9H8"/></g></g><text x="650" y="109" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Graph</text><text x="650" y="129" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Inspect progress + errors</text></svg></div><div class="flow-mobile"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 550" role="img" aria-label="Episode 8 simplified mechanism"><defs><pattern id="grid-e8-m" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arr-e8-m" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="#a78bfa"/></marker></defs><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#grid-e8-m)"/><path data-flow-edge class="flow-motion" d="M48 67V119" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e8-m)"/><path data-flow-edge class="flow-motion" d="M48 169V221" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e8-m)"/><path data-flow-edge class="flow-motion" d="M48 271V323" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e8-m)"/><path data-flow-edge class="flow-motion" d="M48 373V425" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e8-m)"/><g transform="translate(48 42)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><rect x="-9" y="-12" width="18" height="24" rx="2"/><path d="M-5-5H5M-5 1H5M-5 7H3"/></g></g><text x="90" y="38" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Client</text><text x="90" y="58" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Request schema mode</text><g transform="translate(48 144)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><path d="M-14-11H14L4 2V12H-4V2Z"/></g></g><text x="90" y="140" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Gateway</text><text x="90" y="160" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Preserve parameters</text><g transform="translate(48 246)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><path d="M-12 0L-3 9L14-10"/></g></g><text x="90" y="242" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Provider</text><text x="90" y="262" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Compatible endpoint</text><g transform="translate(48 348)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><circle cx="-6" cy="-3" r="7"/><path d="M0 2L12 14M8 10L12 6"/></g></g><text x="90" y="344" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Ingestion</text><text x="90" y="364" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Bound active writes</text><g transform="translate(48 450)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><circle cx="0" cy="-11" r="4"/><circle cx="-12" cy="9" r="4"/><circle cx="12" cy="9" r="4"/><path d="M-2-7L-10 5M2-7L10 5M-8 9H8"/></g></g><text x="90" y="446" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Graph</text><text x="90" y="466" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Inspect progress + errors</text></svg></div><div class="flow-tools"><button type="button" data-flow-motion aria-pressed="false">Pause flow</button><button type="button" data-flow-expand>Expand diagram</button></div><figcaption>Simplified editorial diagram of the inspected mechanism. Moving dots show direction, not observed traffic or a successful run.</figcaption></figure><dialog data-flow-dialog aria-label="Expanded mechanism"><button type="button" data-flow-close>Close expanded diagram</button><div data-flow-expanded-content></div></dialog><script is:inline src="/images/blog/s5e08/flow-ui.js"></script><script is:inline src="/images/blog/s5e08/flow-motion.js"></script>

The diagram follows the requirement across boundaries. Dots show direction, not a successful historical request. The final content-review step stays visible because conformance establishes shape, not whether the graph learned the right things.

## More work in flight needed a bound

Once extraction could progress, the application also gained `GRAPHITI_INGEST_CONCURRENCY`. The historical source keeps a special sequential path when the configured value is one. Values above one opt into within-batch parallel episode writes. That opt-in matters because entity resolution and deduplication share graph state.

Concurrency is the number of operations allowed to overlap. It is not a promise of proportional throughput. Eight writers can spend their time waiting on the same database resources, repeating slow searches or contending over related entities. A setting that improves one stage can make a later boundary worse.

![The engineer allocates a limited set of tools among several work stands in a bicycle repair cooperative.](/images/blog/s5e08/inline-1.png)

<p class="caption">Several jobs can be ready while only a bounded number may hold the shared tools. Conceptual illustration of a semaphore limit.</p>

The parallel branch constructs an [asyncio semaphore](https://docs.python.org/3/library/asyncio-sync.html#asyncio.Semaphore), wraps each eligible record's ingestion with it, and gathers the results. This is an exact excerpt from the retained ingestion method:

<p class="code-source">ingest.py · DocumentKnowledgeIngester.ingest_records, parallel branch · platform 0dff3571</p>

```python
semaphore = asyncio.Semaphore(self._ingest_concurrency)

async def ingest_one(record: DocumentKnowledgeRecord) -> bool:
    async with semaphore:
        return await self._add_episode_with_retry(record)

results = await asyncio.gather(
    *(ingest_one(record) for record in records_to_ingest)
)
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- The semaphore creates the configured number of permits for this batch.
- Each task acquires a permit before entering the existing add-and-retry operation.
- The async context releases its permit when the operation leaves that block.
- gather waits for the submitted eligible tasks. It does not create extra database capacity.
- The returned results are later associated with their records. The default-one sequential path is separate.

</details>

For a synthetic batch of ten eligible documents with concurrency eight, at most eight calls can hold the semaphore at once. If only three documents remain after processed markers are filtered out, effective parallelism cannot exceed three. The configured limit does not create more work than the batch contains.

A useful upper bound is therefore the smaller of configured concurrency and eligible records in that batch. It still does not predict duration. Per-document work can vary, retries can consume time, and the database can become the shared bottleneck. The July job used concurrency eight and batch size ten; those are reported settings, not a recommended default for today's system.

The historical source defaulted to one for compatibility with the established sequential behaviour. That made the new concurrency path an explicit operational choice. A faster-looking setting was not silently promoted into the baseline merely because it passed unit tests.

## Successful markers were the resumability boundary

The batch loop checks whether each document is already marked processed. In the parallel branch it builds a list of eligible records before creating the tasks. After the calls finish, it pairs each result with its record. Only successful results write processed markers; failures increment the failure count and remain candidates for a later run.

<p class="code-source">ingest.py · successful-result marker update · platform 0dff3571</p>

```python
for record, ok in zip(records_to_ingest, results):
    if ok:
        self._marker_store.mark_processed(record)
        stats["processed"] += 1
        batch_processed += 1
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- Each result is paired with its input record.
- Only a true success result enters this branch.
- The marker store records success so a later run can skip the processed record.
- The aggregate processed count and this batch count each increase once.
- This is not a demonstrated atomic transaction spanning remote generation, graph effects and marker persistence.

</details>

This design supports resumability, but it deserves a precise description. A later run can skip documents whose success marker was saved and retry those not marked successful. That does not establish a transaction across the model call, graph write and marker file. If a process stops after a graph effect but before a marker is persisted, some work may be attempted again. Deduplication and content-based identities need their own correctness evidence.

It would therefore be too strong to call the whole job exactly-once simply because a marker store exists. The narrower supported claim is that successful markers reduce repeat work across ordinary retries and restarts. The retained source shows where those markers are written; the historical report says the job relied on them to make later runs converge.

The result collection also matters. The inspected code gathers tasks and processes their results in the order associated with the input list. A returned false result is different from an unexpected exception escaping the surrounding logic. This draft does not claim that every possible provider, cancellation or persistence error is made harmless by the semaphore itself.

## Progress exposed the next failure

The July 10 handover reports both enforcement legs shipped, then describes a running second backfill attempt. Its recorded graph count rose from 276 to 805 nodes by the checkpoint. The job was at batch 17 of 82, with timeouts returning under load despite a larger database timeout setting. The report expected the eight-hour deadline to be exceeded before the whole backlog completed.

Those figures are observations from a dated checkpoint, not the final job outcome. The difference of 529 nodes is a net count change in that window. It is not 529 independently verified new facts, a count of completed documents or proof that answers improved.

![The engineer watches several grain chutes feed a single hopper inside a flour mill.](/images/blog/s5e08/inline-2.png)

<p class="caption">Increasing flow into the system can move contention into a shared downstream stage. Conceptual artwork; not a measured throughput chart.</p>

The report's apparent contradiction is useful: enforcement could be repaired while ingestion still failed. Earlier schema drift was no longer the only meaningful problem. Database search and deduplication queries now consumed the waiting time. More documents reaching the graph made an existing downstream limit easier to observe.

There were also two reported residual edge-model validation errors. The earlier adaptation handled entity and node-resolution shapes; edge extraction had another response contract. The adjacent July 10 handover records a later coercion repair for that gap. That is a separate scope, not evidence that the first schema change had already covered every Graphiti response model.

## Tests, live probes and unfinished work

The implementation handover reports 117 tests and a fresh verifier pass, followed by merged platform and gateway changes. It also records a first attempt whose fixture used plain dictionaries where Graphiti expected message objects. That is a useful example of a test failing before it exercises the intended provider contract.

The new checks for this reconstruction inspect the selected mode, exercise synthetic bounded tasks and verify marker behaviour against the retained source. They do not call OpenRouter, repeat the original provider probe or test the July graph under contention. Those boundaries prevent a convenient local pass from becoming a false claim of end-to-end recovery.

The historical job was still running when the handover was written. Its prediction of a deadline failure is not the same as a retained final `DeadlineExceeded` result. The next chapter follows the later timeout investigation, where a proposed short-circuit initially missed the real runtime callable and a corrected patch produced a split outcome.

## Lessons I would keep

I would make the requested capability explicit at the active client and check that every intermediary preserves it. A model name, a schema-shaped request and an HTTP success each describe a different boundary. The acceptance test should show where the requirement was actually enforced.

I would introduce parallelism as an opt-in experiment with a clear bound. The semaphore limits overlap; it does not certify the safety of shared state or guarantee speed. Effective concurrency and completed-document count should sit beside latency and error rates.

I would describe resumability without promising exactly-once processing. A marker is valuable evidence about what the job will skip, but it is only one part of the write path. The graph effect and marker persistence can fail at different times.

Finally, I would keep progress and usefulness separate. Node growth showed that more work reached the graph in the reported window. It did not settle correctness, total coverage or task benefit. A pipeline becomes easier to reason about when each improvement is allowed to have its own limited result.

## Next in the sequence

The next record follows the returning graph-search timeouts. It explains an empty-candidate fast path, why the first patch was attached to a callable the runtime did not use, and why eliminating the timeout storm still did not complete document ingestion. That is the next episode's mechanism and evidence boundary.

<details class="glossary" data-glossary=""><summary>Glossary — plain-English definitions</summary><div class="glossary-tools" hidden=""><label for="glossary-search">Find a term</label><div class="glossary-search-row"><input id="glossary-search" type="search"/><button type="button">Clear</button></div><p aria-live="polite" role="status"></p></div><section class="glossary-term" id="term-json-schema"><h3>JSON schema</h3><p>A declared data structure and constraints for a response. <a href="https://json-schema.org/understanding-json-schema/">Primary concept reference</a>.</p></section><section class="glossary-term" id="term-provider-route"><h3>Provider route</h3><p>The endpoint path selected to fulfil a model request. Episode evidence and limits (retained historical evidence).</p></section><section class="glossary-term" id="term-parameter-passthrough"><h3>Parameter passthrough</h3><p>Preserving a requested option across an intermediary. Episode evidence and limits (retained historical evidence).</p></section><section class="glossary-term" id="term-semaphore"><h3>Semaphore</h3><p>A limit on how many tasks can hold permits at the same time. <a href="https://docs.python.org/3/library/asyncio-sync.html#asyncio.Semaphore">Primary concept reference</a>.</p></section><section class="glossary-term" id="term-concurrency"><h3>Concurrency</h3><p>Work in flight at the same time, distinct from completed work per second. Episode evidence and limits (retained historical evidence).</p></section><section class="glossary-term" id="term-processed-marker"><h3>Processed marker</h3><p>A retained success record used to skip work on a later run. Episode evidence and limits (retained historical evidence).</p></section><section class="glossary-term" id="term-exactly-once"><h3>Exactly-once</h3><p>A stronger processing guarantee than ordinary retries plus a marker file. Episode evidence and limits (retained historical evidence).</p></section><section class="glossary-term" id="term-contention"><h3>Contention</h3><p>Tasks waiting or interfering at a shared resource. Episode evidence and limits (retained historical evidence).</p></section></details>

## Sources and limits

The source and claim ledger (retained in review ledger) retains the July backfill and edge-coercion handovers, historical client/ingestion code and tests. The shortened payload is synthetic. Original provider request/response bundles, final logs for every backfill attempt and a ground-truth entity set are not available in this package. Current official documentation supplies concept context, not a new observation of the July deployment.


<style is:global>
main{min-width:0}main>p:not(:has(img)){max-width:74ch}main>ul,main>ol{max-width:74ch}.eyebrow{text-transform:none;letter-spacing:.025em}.reading-progress{position:fixed;left:0;top:0;height:3px;width:0;background:var(--accent);z-index:20;pointer-events:none}.reading-tools{max-width:1160px;margin:0 auto;padding:14px 28px 0;display:flex;justify-content:flex-end;gap:8px}.reader-button,.copy-code,.expand-diagram{border:1px solid var(--border);background:var(--card);color:var(--text);padding:7px 11px;border-radius:6px;font-size:11px}.copy-code{float:right;margin-left:10px}.code-source{display:flow-root}.contents a[aria-current="location"]{color:var(--accent);font-weight:600}.reading-focus .contents{display:none}.reading-focus .page-grid{display:block;max-width:800px}.reading-focus .nav-links>a{display:none}.reading-focus .article-header{max-width:none}.diagram{position:relative}.expand-diagram{display:block;margin:12px auto 0;background:#192d46;color:#eef6ff;border-color:#5c86a6}dialog{width:min(96vw,1300px);height:92vh;max-height:92vh;padding:18px;border:1px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text)}dialog::backdrop{background:rgba(0,0,0,.8)}.dialog-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}.diagram-scroll{overflow:auto;height:calc(100% - 54px);background:#101c2d;border-radius:8px}.diagram-scroll img{width:1200px;max-width:none;border-radius:0;margin:0 auto}.sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:600px){.reading-tools{padding:12px 18px 0}.copy-code{padding:4px 7px}.dialog-head{font-size:12px}dialog{padding:10px}.diagram-scroll img{width:1000px}}
.article-header{border-left:3px solid var(--accent);padding-left:22px}.eyebrow{margin-top:25px}.page-grid{grid-template-columns:minmax(0,740px) 210px;gap:64px}.code-box{box-shadow:0 8px 22px #00000012}h2{border-bottom:0;padding-bottom:0}.caption{border-left:0;padding-left:0}@media(max-width:600px){.article-header{padding-left:15px}}
details.walkthrough{padding:0}details.walkthrough summary{padding:13px 18px;cursor:pointer;color:var(--accent);font-size:12px;font-weight:550;list-style-position:inside}details.walkthrough summary:hover{background:var(--chip)}details.walkthrough[open] summary{border-bottom:1px solid var(--border)}details.walkthrough .explanation-body{padding:14px 18px}details.walkthrough summary:focus-visible{outline-offset:-4px}@media(max-width:600px){details.walkthrough summary{padding:12px 14px}details.walkthrough .explanation-body{padding:12px 14px}}

main{min-width:0}.notebook-article table{display:block;max-width:100%;min-width:0;overflow-x:auto}.table-wrap{overflow:auto;max-width:100%}table{min-width:580px}summary{cursor:pointer}details.glossary,details.source-note{border:1px solid var(--border);border-radius:8px;padding:16px;margin:25px 0}.glossary-term{border-top:1px solid var(--border)}.glossary-tools input{font:inherit;max-width:100%}.glossary-search-row{display:flex;gap:12px}.glossary-search-row input{min-width:0}.glossary-tools button,.flow-tools button{font:inherit;padding:7px 12px}.code-source{font-size:12px}.contents{margin-top:160px}pre{overflow:auto}h3{font-size:17px}figcaption,.caption{font-size:12px}code{overflow-wrap:anywhere;white-space:normal}pre code{white-space:pre}.flow-tools{display:flex;gap:12px;margin:10px 0}.publish-flow{margin:28px 0}.publish-flow h3{margin:0 0 14px}.publish-flow figcaption{line-height:1.6;color:var(--muted,#aab0bc)}.flow-tools button,dialog button{background:#1c1e24;color:#e9eaee;border:1px solid #75608f;border-radius:6px;padding:9px 12px;cursor:pointer}.flow-mobile{display:none}.flow-desktop svg,.flow-mobile svg{display:block;width:100%;height:auto}dialog{color:var(--text);background:var(--bg);border:1px solid var(--border);max-width:min(1150px,95vw);max-height:90vh;width:95vw}dialog::backdrop{background:#000b}.asset-option{margin:38px 0}.review-links{display:flex;gap:18px;flex-wrap:wrap}@media(max-width:600px){input{font-size:16px!important}.flow-desktop{display:none}.flow-mobile{display:block}code{font-size:.88em}}
main{min-width:0}main img{width:100%;height:auto;display:block}.story-flow{margin:28px 0}.story-flow h3{margin:0 0 14px}.story-flow figcaption{font-size:12px;line-height:1.6;color:var(--muted)}.flow-mobile{display:none}.flow-desktop svg,.flow-mobile svg{display:block;width:100%;height:auto}.table-wrap{overflow-x:auto;max-width:100%}.notebook-article table{display:block;min-width:0;max-width:100%;overflow-x:auto}main p{font-size:15px}pre{max-width:100%;overflow-x:auto}code{overflow-wrap:anywhere}pre code{white-space:pre}.asset-option{margin:35px 0}.review-links{display:flex;flex-wrap:wrap;gap:14px}summary{cursor:pointer}dialog{max-width:95vw;width:1000px;background:var(--bg);color:var(--text)}dialog::backdrop{background:#000b}@media(max-width:600px){main p,main li{font-size:14px}.flow-desktop{display:none}.flow-mobile{display:block}.glossary-search-row{display:flex;gap:8px}.glossary-search-row input{min-width:0;font-size:16px}}
.story-flow{background:#141414;border:1px solid #3b3f4a;border-radius:10px;padding:16px}.story-flow h3{color:#e9eaee}.story-flow figcaption{color:#aab0bc}.story-flow svg{border-radius:5px}.flow-tools{display:flex;gap:10px;margin-top:10px}.flow-tools button{background:#1c1e24;color:#e9eaee;border:1px solid #555867;border-radius:5px;padding:6px 10px}.flow-motion{animation:s5e03-dots 1.4s linear infinite;stroke-dasharray:3 7}.flow-paused .flow-motion{animation-play-state:paused}@keyframes s5e03-dots{to{stroke-dashoffset:-20}}@media(prefers-reduced-motion:reduce){.flow-motion{animation:none}}.article-meta{font-size:12px}.review-links{font-size:13px}.notebook-article li{font-size:15px}@media(max-width:600px){.notebook-article li{font-size:14px}}
img{max-width:100%;height:auto!important;object-fit:contain}.notebook-article p,.notebook-article li{font-size:15px;line-height:1.75}.story-flow text{font-family:system-ui,sans-serif}.story-flow{margin:26px 0}.source-label{font-size:12px;color:var(--muted,#888)}@media(max-width:600px){.notebook-article p,.notebook-article li{font-size:14px}}
</style>
<script is:inline src="/images/blog/s5e08/reader.js"></script>
