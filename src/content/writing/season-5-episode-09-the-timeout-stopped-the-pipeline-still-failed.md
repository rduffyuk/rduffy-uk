---
title: "The Timeout Stopped. The Pipeline Still Failed."
description: "An empty-candidate search needed a real-path fast return. The corrected patch removed a timeout storm while exposing a separate extraction failure."
pubDatetime: 2026-07-12T12:00:00Z
draft: false
author: Ryan Duffy
episode: 9
image: /images/blog/s5e09/hero-A.png
imageAlt: "The Rootweaver engineer inspects an empty component tray in a maintenance hut."
shippingDatetime: 2026-11-16T08:00:00Z
series: "Season 5: Rootweaver"
tags: [Rootweaver, KnowledgeGraphs, Testing, Reliability]
---

The previous episode made the graph backlog move further through the system. Schema enforcement and bounded concurrency let more work reach the database, where search timeouts became the next visible limit. Increasing a timeout changed how long the job could wait. It did not remove the unnecessary query that was consuming that time.

I wanted the ingestion path to avoid database work when it already knew there were no candidate edges to search. The first repair passed a test and a verifier but missed the callable the runtime used. The corrected repair then produced a result that needed two sentences: the timeout storm stopped in the reported smoke, and document ingestion still failed.

![The Rootweaver engineer holds an empty component tray in an unfinished maintenance hut.](/images/blog/s5e09/hero-A.png)

<p class="caption">A repaired component can be a useful result while the larger job remains unfinished. Conceptual illustration.</p>

This chapter covers the July 11–12, 2026 timeout investigation, centred on the July 12 v2 implementation and reported smoke. It is a curated reconstruction from the retained handover, implementation report, historical client and tests at `3d412cf0`. I owned direction and review; agents assisted with implementation and verification. Historical test, deployment and smoke results remain attributed reports. Fresh isolated checks exercise the wrapper with fake callables and no database, model calls or live cluster changes.

## An empty candidate set should change the plan

Graphiti's edge search received a filter that could contain candidate edge identifiers. An explicitly empty list meant there were no candidate edges for that constrained search. The useful result could therefore be returned immediately, without asking the database to scan a broader relationship pattern and filter it down to nothing.

The July implementation report describes the expensive path as a full-text edge search that still performed a broad entity/relationship match before narrowing to the supplied candidates. It attributes substantial scan work to calls whose candidate list was empty. The original query profile and full call distribution are not retained here, so I am not turning its quoted scan sizes or prevalence estimate into an independently measured benchmark.

The source-level question is narrower and inspectable: when the caller explicitly supplies `edge_uuids == []`, can the wrapper return an empty result without calling the original search function? That is a useful fast path because the answer follows from the input contract rather than a heuristic prediction about query cost.

There are three different inputs to keep apart:

| Candidate filter | Meaning used by the repair | Wrapper behaviour |
|---|---|---|
| `[]` | Explicitly empty candidate set | Return an empty list immediately |
| A non-empty identifier list | There are candidates to evaluate | Delegate to the original search |
| `None` or an absent attribute | No explicit empty-set instruction | Delegate; do not silently treat unknown as empty |

The last row is especially important. A convenient truthiness check could collapse `None` and `[]` into one branch. That would change the behaviour of unconstrained or unspecified searches. The repair instead checks equality with an empty list, preserving the original path for other values.

![The engineer inspects an empty parts tray beside an unused hand crank.](/images/blog/s5e09/inline-1.png)

<p class="caption">An explicitly empty input can justify doing no work. An unspecified input cannot automatically justify the same decision. Conceptual illustration.</p>

That is an engineering contract worth testing directly. It is much stronger than “the query usually returns nothing,” because it states which input permits the fast return and which inputs still require the original implementation.

## The first patch repaired a disconnected path

The v1 approach introduced a candidate-bound search class and assigned it to a private driver attribute. The historical report says its test monkeypatched a class method. Both test and verifier passed. The live backfill nevertheless continued producing timeout errors.

The later diagnosis identified a call-path mismatch. Graphiti's search used a module-level function and an imported alias, rather than the class method the v1 test exercised. Adding a helpful implementation to a driver attribute did not establish that the active caller would ever use it.

This resembles Episode 4's retired-client problem, but the mechanism differs. There, the constructor selected a different client. Here, a module imported a function by name, creating another reference that the repair also had to account for. The common lesson is to follow the actual call boundary instead of inferring reachability from the presence of a tested class.

The implementation report records a 98-minute r5 run with 638 timeouts and substantial document failure. That is a reported observation for that attempt, not a fresh experiment or a universal timeout rate. Its importance is that the operational symptom remained after the supposed repair. A test pass and an unchanged failure signal required revisiting the test's premise.

The report also distinguishes an earlier plan from what actually shipped. One proposed deployment sequence would have run a smoke before unsuspending the cron job. The final account says a parallel lane unsuspended it directly, based on the verifier and image checks, and the smoke happened afterward. This draft follows the amended report. It does not turn the safer-looking plan into an event that never occurred.

## The corrected wrapper stayed deliberately small

The v2 implementation wraps the module function. When the supplied filter has an empty candidate list, it returns `[]`. Otherwise it awaits the original callable with the same arguments. This exact excerpt is retained from the installer in `graphiti_client.py`:

<p class="code-source">client.py · empty-candidate wrapper · platform 3d412cf0</p>

```python
async def patched(driver, query, search_filter, group_ids=None, limit=10):
    if getattr(search_filter, "edge_uuids", None) == []:
        return []
    return await original(driver, query, search_filter, group_ids, limit)
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- The wrapper preserves the caller-facing arguments and defaults.
- It reads edge_uuids with None as the default for an absent attribute.
- Only equality with an empty list triggers the immediate empty result.
- All other values, including None and a nonempty list, delegate to the saved original callable with the same arguments.

</details>

The code is small enough to look obvious after the investigation. What makes it useful is the boundary around it: which callable was saved as the original, which names were assigned the wrapper, and how repeated installation behaves. Those details determine whether the simple condition has any effect on the real path.

The wrapper does not catch arbitrary database failures or change the search algorithm for non-empty candidates. It preserves the original behaviour there. That narrowness makes the acceptance case precise, while keeping the remaining failure modes visible rather than hiding them behind a general empty-result fallback.

Here is a synthetic filter example, not an original request payload:

```json
{
  "query": "an illustrative relationship search",
  "search_filter": {"edge_uuids": []},
  "expected_wrapper_result": []
}
```

The expected result is justified by the explicitly empty candidate list, not by knowledge about the words in the query. Change the list to `["example-edge"]` and the original search must receive the call. Change it to `null` and delegation must also remain possible. The fresh isolated checks exercise all three cases with a recording fake callable.

<figure id="mechanism" class="story-flow" data-policy-flow><h3>Follow the mechanism</h3><div class="flow-desktop"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 290" role="img" aria-label="Episode 9 simplified mechanism"><defs><pattern id="grid-e9-d" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arr-e9-d" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="#a78bfa"/></marker></defs><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#grid-e9-d)"/><path data-flow-edge class="flow-motion" d="M95 100H215" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e9-d)"/><path data-flow-edge class="flow-motion" d="M265 100H330V48H405" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e9-d)"/><path data-flow-edge class="flow-motion" d="M265 100H330V192H405" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e9-d)"/><path data-flow-edge class="flow-motion" d="M455 48H560V100H625" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e9-d)"/><path data-flow-edge class="flow-motion" d="M455 192H560V100H625" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e9-d)"/><g transform="translate(70 100)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><rect x="-9" y="-12" width="18" height="24" rx="2"/><path d="M-5-5H5M-5 1H5M-5 7H3"/></g></g><text x="70" y="147" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Call</text><text x="70" y="167" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Either patched alias</text><g transform="translate(240 100)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><path d="M-14-11H14L4 2V12H-4V2Z"/></g></g><text x="240" y="147" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Filter</text><text x="240" y="167" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Read edge_uuids</text><g transform="translate(430 48)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><path d="M-12 0L-3 9L14-10"/></g></g><text x="430" y="95" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Empty []</text><text x="430" y="115" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Return []</text><g transform="translate(430 192)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><circle cx="-6" cy="-3" r="7"/><path d="M0 2L12 14M8 10L12 6"/></g></g><text x="430" y="239" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Other value</text><text x="430" y="259" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Original search</text><g transform="translate(650 100)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><circle cx="0" cy="-11" r="4"/><circle cx="-12" cy="9" r="4"/><circle cx="12" cy="9" r="4"/><path d="M-2-7L-10 5M2-7L10 5M-8 9H8"/></g></g><text x="650" y="147" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Result</text><text x="650" y="167" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Check pipeline separately</text></svg></div><div class="flow-mobile"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 590" role="img" aria-label="Episode 9 simplified mechanism"><defs><pattern id="grid-e9-m" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arr-e9-m" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="#a78bfa"/></marker></defs><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#grid-e9-m)"/><path data-flow-edge class="flow-motion" d="M145 42H25V182H145" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e9-m)"/><path data-flow-edge class="flow-motion" d="M145 182H70V310" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e9-m)"/><path data-flow-edge class="flow-motion" d="M195 182H260V310" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e9-m)"/><path data-flow-edge class="flow-motion" d="M95 335H170V465" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e9-m)"/><path data-flow-edge class="flow-motion" d="M235 335H170V465" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e9-m)"/><g transform="translate(170 42)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><rect x="-9" y="-12" width="18" height="24" rx="2"/><path d="M-5-5H5M-5 1H5M-5 7H3"/></g></g><text x="170" y="89" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Call</text><text x="170" y="109" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Either patched alias</text><g transform="translate(170 182)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><path d="M-14-11H14L4 2V12H-4V2Z"/></g></g><text x="170" y="229" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Filter</text><text x="170" y="249" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Read edge_uuids</text><g transform="translate(70 335)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><path d="M-12 0L-3 9L14-10"/></g></g><text x="70" y="382" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Empty []</text><text x="70" y="402" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Return []</text><g transform="translate(260 335)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><circle cx="-6" cy="-3" r="7"/><path d="M0 2L12 14M8 10L12 6"/></g></g><text x="260" y="382" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Other value</text><text x="260" y="402" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Original search</text><g transform="translate(170 490)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><circle cx="0" cy="-11" r="4"/><circle cx="-12" cy="9" r="4"/><circle cx="12" cy="9" r="4"/><path d="M-2-7L-10 5M2-7L10 5M-8 9H8"/></g></g><text x="170" y="537" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Result</text><text x="170" y="557" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Check pipeline separately</text></svg></div><div class="flow-tools"><button type="button" data-flow-motion aria-pressed="false">Pause flow</button><button type="button" data-flow-expand>Expand diagram</button></div><figcaption>Simplified editorial diagram of the inspected mechanism. Moving dots show direction, not observed traffic or a successful run.</figcaption></figure><dialog data-flow-dialog aria-label="Expanded mechanism"><button type="button" data-flow-close>Close expanded diagram</button><div data-flow-expanded-content></div></dialog><script is:inline src="/images/blog/s5e09/flow-ui.js"></script><script is:inline src="/images/blog/s5e09/flow-motion.js"></script>

The diagram shows the wrapper's decision and the two reference sites. It is not a live trace or a complete Graphiti architecture map. The point is that an optimisation is only effective when the names the caller resolves reach the implementation being tested.

## One function could have two relevant references

The inspected installer assigns the wrapper to both the search-utils module and Graphiti's search module alias. Python's [import statement semantics](https://docs.python.org/3/reference/simple_stmts.html#the-import-statement) explain why this can matter: importing a name binds a reference in the importing namespace. Later replacing the source module's attribute does not automatically rewrite every already-bound alias.

<p class="code-source">client.py · _install_vw1235_edge_fulltext_search_patch, bindings · platform 3d412cf0</p>

```python
search_utils.edge_fulltext_search = patched
graphiti_search.edge_fulltext_search = patched
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- The first assignment changes the attribute on the source search-utils module.
- The second changes the already-bound alias used by the other search module.
- Both must be checked by the test; updating only the original namespace can leave an old reference reachable.

</details>

That does not mean every application should patch dependencies at import time. It describes the bounded compatibility repair retained in this episode. Such a patch needs version awareness, a clear ownership boundary and tests that check the actual references it intends to affect. A future upstream release can change those references or fix the behaviour itself.

The installer also marks the wrapper and stores the original callable on it. If invoked again on an already-patched function, it reuses that wrapper rather than nesting another wrapper around it. This idempotence matters in tests and repeated imports: repeated installation should not multiply layers or lose the original delegation target.

A test should therefore ask more than whether one direct call returns an empty list. It should confirm both aliases point to the expected wrapper, the empty case produces zero original calls, non-empty and unspecified filters delegate, and another installation preserves the intended identity. Those are separate assertions about reachability, behaviour and lifecycle.

## A test repair created another kind of shared state

The first v2 test attempt used `importlib.reload` to get a spy onto the saved original function. Reloading a module re-executes its definitions. Objects created before and after that reload can therefore refer to different class objects even when their names look identical.

The historical report says two unrelated tests then failed because class identity had changed. A monkeypatch fixture could restore the attributes it had changed, but it could not undo all the new definitions created by the reload. The attempt solved one observation problem by mutating wider module state.

The corrected tests drove the already-installed wrapper directly. For the delegation case, they temporarily substituted a spy at both reference sites and reran the idempotent installer. The fixture then owned the specific substitutions and could restore them at teardown. This made the test's effects closer to its stated scope.

<p class="code-source">patch-tests.py · empty-candidate acceptance assertions · platform 3d412cf0</p>

```python
assert result == []
# Zero DB work — the exact guarantee v1 could not prove.
driver.query.assert_not_awaited()
driver.execute_query.assert_not_awaited()
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- The result must be an empty list for the explicitly empty filter.
- The comment explains that the test is concerned with zero database awaits on this path.
- Both recording database methods must remain unawaited.
- This isolates the acceptance boundary; it is not a live database or complete ingestion test.

</details>

The zero-await assertions are the useful acceptance condition for the empty case. They do not prove that every real query avoids all database work. They show that this tested wrapper path did not await either recording database method for the supplied empty filter. The historical suite is reported as 128 passing tests; the new isolated checks validate the selected mechanism without claiming to rerun that whole environment.

This is where test count can be misleading. The first implementation could pass a test of a disconnected method. The second attempt could test the right function while damaging test isolation. The repair needed both path fidelity and controlled state, not simply a larger number printed at the end of a run.

## A split smoke result was the honest outcome

The retained implementation report gives a longer smoke result: roughly an hour, zero edge-fulltext timeouts and zero of nine documents ingested. The shorter handover also describes a narrower r6 smoke window with zero timeouts. Those are different observation windows. This chapter does not merge their durations or treat one as an independently reproduced run.

The timeout deliverable and the ingestion objective therefore had different outcomes. The empty-candidate patch could be effective while the document pipeline remained blocked. The later failing stage was entity extraction from large documents, where local-model output exceeded its useful response boundary and arrived truncated or invalid as JSON.

![The engineer inspects wet laundry after repairing a small fan in a drying room.](/images/blog/s5e09/inline-2.png)

<p class="caption">Removing one failure does not establish that the final work is complete. Conceptual illustration of the split result, not a historical throughput measurement.</p>

That is not a reason to discard the timeout fix. It is a reason to state what it fixed. Earlier failures can prevent execution from reaching later ones. Once the timeout storm stopped, the job could expose a different boundary that had been masked by earlier exits.

| Evidence | Component conclusion | End-to-end conclusion |
|---|---|---|
| Empty-list wrapper avoids original calls in isolated checks | The selected fast-return mechanism behaves as intended | No live ingestion result follows from that test |
| Historical smoke reports zero edge-fulltext timeouts | The targeted timeout signal disappeared in that window | Other stages may still fail |
| Historical longer smoke reports 0/9 documents ingested | The batch did not achieve its document goal | The pipeline was not recovered as a whole |
| Large-response JSON errors remained | Extraction required separate investigation | Raising a database timeout would not repair those responses |

The source also records database timeout persistence as a defensive backstop. Persisting a setting can prevent a restart from silently reverting it. It does not demonstrate that an inefficient query has become efficient, and it should not be credited as the empty-candidate fix itself.

## The later record changed the outcome again

The zero-of-nine result belongs to the earlier smoke window, not the end of July 12. A later same-day handover reports that the extraction repair was deployed: truncated JSON was salvaged, entity and edge arrays received a sixty-item cap, and document chunks were reduced from six thousand to three thousand characters. Those were separate extraction changes; the empty-candidate wrapper had not supplied them.

That handover reports no JSON-decoding or unterminated-string errors in its smoke, with batches recording five processed documents and none failed. It also reports the graph reaching 284 nodes and 1,050 edges in that check. I have not independently replayed that deployment or inspected the raw smoke bundle, so these remain reported results. They do establish that the historical account moved beyond the earlier zero-document checkpoint.

Continuing the backfill then exposed another boundary. The same later handover reports full-text search timeouts on the **non-empty candidate path** as the graph grew. That is outside the explicit-empty fast return explained above: a real candidate set still delegates to the original search. The account ends with the backfill suspended pending a query-plan repair, rather than claiming a clean run to completion.

This is the more useful ending. One source revision repaired the empty path. A later extraction change allowed useful work through. Running at greater scale then revealed a different search problem. Keeping those stages separate avoids crediting one patch with every later improvement, or treating an earlier failed smoke as the final result of the day.

## Lessons I would keep

I would specify the semantic difference between empty and unspecified inputs before writing a fast path. An optimisation that skips work needs a contract strong enough to justify the skipped work. A generic falsey check can weaken that contract without looking complicated.

I would make the acceptance test drive the name the runtime actually resolves. When aliases exist, that means inspecting the importing namespace as well as the original definition. A green test of a convenient class method is not useful proof if the caller never uses it.

I would isolate test state without reloading a module merely to create a spy seam. The test should own and restore the attributes it changes. If a broad reload is unavoidable, its effects on other captured references need explicit consideration rather than assuming ordinary monkeypatch cleanup can reverse it.

Finally, I would put the task-completion count beside the repaired error metric. “Zero timeouts” is a meaningful component result. “Zero documents ingested” is a meaningful operational result. Keeping both visible prevents a successful fix from being sold as a recovered pipeline, while still giving the fix the credit it earned.

## Next in the sequence

The retained July 12 records start separating data preparation, enrichment and serving behind an explicit cutover plan. That is the next thread to reconstruct: what had to be ready before a new path could be selected, and how to distinguish code merged behind a flag from data actually prepared and served. This episode does not claim that the cutover had completed yet.

<details class="glossary" data-glossary=""><summary>Glossary — plain-English definitions</summary><div class="glossary-tools" hidden=""><label for="glossary-search">Find a term</label><div class="glossary-search-row"><input id="glossary-search" type="search"/><button type="button">Clear</button></div><p aria-live="polite" role="status"></p></div><section class="glossary-term" id="term-candidate-set"><h3>Candidate set</h3><p>The explicit records eligible for a constrained search. Episode evidence and limits (retained historical evidence).</p></section><section class="glossary-term" id="term-alias"><h3>Alias</h3><p>Another namespace reference to an object such as a function. <a href="https://docs.python.org/3/reference/simple_stmts.html#the-import-statement">Primary concept reference</a>.</p></section><section class="glossary-term" id="term-wrapper"><h3>Wrapper</h3><p>A callable adding a narrow behaviour around another callable. Episode evidence and limits (retained historical evidence).</p></section><section class="glossary-term" id="term-delegation"><h3>Delegation</h3><p>Passing the request onward to the saved original implementation. Episode evidence and limits (retained historical evidence).</p></section><section class="glossary-term" id="term-idempotent-installer"><h3>Idempotent installer</h3><p>Repeated setup preserves the intended installed state without multiplying wrappers. Episode evidence and limits (retained historical evidence).</p></section><section class="glossary-term" id="term-module-reload"><h3>Module reload</h3><p>Re-executing definitions, which can change class identity and shared state. Episode evidence and limits (retained historical evidence).</p></section><section class="glossary-term" id="term-smoke-test"><h3>Smoke test</h3><p>A bounded runtime check that establishes only what it actually exercised. Episode evidence and limits (retained historical evidence).</p></section><section class="glossary-term" id="term-end-to-end-result"><h3>End-to-end result</h3><p>The completed user objective across all required stages. Episode evidence and limits (retained historical evidence).</p></section></details>

## Sources and limits

The source and claim ledger (retained in review ledger) retains the amended implementation report, shorter handover, later cutover context, historical installer and tests. Raw database profiles, original smoke logs and a reproduced full Graphiti runtime are not included. Conflicting observation-window detail is labelled instead of flattened. This chapter is a July checkpoint, not the season finale or proof that the remaining extraction and serving work was finished.


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
<script is:inline src="/images/blog/s5e09/reader.js"></script>
