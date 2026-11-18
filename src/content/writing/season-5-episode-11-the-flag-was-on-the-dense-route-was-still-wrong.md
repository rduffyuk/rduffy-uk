---
title: "The Flag Was On. The Dense Route Was Still Wrong."
description: "A retrieval cutover needed the effective flag environment, the retriever's control path and the named-vector choice to agree."
pubDatetime: 2026-07-14T13:00:00Z
draft: false
author: Ryan Duffy
episode: 11
image: /images/blog/s5e11/hero-A.png
imageAlt: "The engineer inspects an open control wheel above two aqueduct channels, with the intended channel still dry."
shippingDatetime: 2026-11-18T08:00:00Z
series: "Season 5: Rootweaver"
tags: [Rootweaver, Retrieval, Observability, Reliability]
---

A second thread was running alongside the graph backfill. On July 13, Rootweaver was switching retrieval from the earlier vault collection to a new collection with named vectors. The new data could exist, the flag could be enabled and a search could still return plausible text while the intended retrieval path remained incomplete.

I needed to know which collection the process doing the search had selected, and whether dense retrieval contributed to its answers. That required following the request beyond the component where the flag had first been wired. The gateway delegated its actual search to a retriever with its own configuration, network rules and vector-store call.

![The engineer inspects an open control wheel above two aqueduct channels, with the intended channel still dry.](/images/blog/s5e11/hero-A.png)

<p class="caption">A control setting needs a working path to the component carrying the request. Conceptual illustration.</p>

This chapter returns to the parallel July 13–14, 2026 cutover. It is a curated reconstruction from historical handovers, GitOps revisions and retriever source at `f8c34be9`. I owned direction and review, with agents assisting implementation and verification. One legacy cutover handover fails its signature check. Its runtime account remains attributed and is identified in the source ledger. Historical code and GitOps files independently establish the inspected implementation changes, while the later signed closeout supplies the subsequent serving and rollback account.

## The flag belonged to an effective environment

The first correction concerned where the flag lived. The initial ticket premise treated registration as a GitOps change. The cutover account says the actual flags were managed through Unleash's administrative API and stored as service state. A configuration repository could document integration without becoming the authoritative flag registry.

The next detail was easy to misread. The live gateway's client used the environment named `development`. Enabling a flag under an environment named `production` would therefore leave this particular client reading its existing value. The environment's label described the feature-flag namespace selected by the credential, independently of how seriously I operated the lab service.

Here is a synthetic configuration summary explaining that relationship. It contains no real credential or operational instruction.

```json
{
  "service_role": "live retrieval gateway",
  "flag": "rootweaver.serving.v2.enabled",
  "environment_selected_by_client": "development",
  "selected_environment_enabled": true,
  "other_environment_state": "does not identify this client's value"
}
```

The useful question was which value that client could obtain. The flag's name and its appearance in an administration screen did not answer that alone. Registration, selected environment and the component reading the setting were distinct pieces of the request path.

The account also records that I explicitly chose a direct cutover while deferring the proposed shadow-validation step. That is a historical decision about this change. It should not be rewritten as a fully completed shadow rollout merely because that would make the story more orderly.

## The gateway was not the entire serving path

The gateway delegated retrieval. The retriever executed the vector-store request. Wiring the gateway's flag client left another process to inspect.

The July handover describes a retriever with neither the required Unleash configuration nor the network-policy egress needed to reach the flag service. Its resolver took a fail-safe path to the old collection. That behaviour kept a search surface available while concealing the intended cutover from a check that only asked whether results existed.

Two historical GitOps snapshots corroborate the repair's implementation boundaries. One revision added the retriever's Unleash environment integration. Another added its egress path to the control service. Those changes are separately inspectable in the retained source files. They establish what the manifests expressed. Deployment observations remain in the dated accounts.

| Boundary | Question that mattered | Evidence required |
|---|---|---|
| Flag service | Which environment did the client read? | Effective client scope and selected value |
| Gateway | Did it delegate the request? | Actual retrieval route |
| Retriever configuration | Could this process resolve the profile? | Its own environment and startup selection |
| Retriever network path | Could it reach the flag service? | Relevant egress rule and an observed control request |
| Vector-store call | Which collection and vector space were selected? | The arguments reaching the adapter |

This is a common distributed-system trap because each component can look reasonable in isolation. A gateway can know the desired collection while the delegated reader remains configured differently. A default can preserve availability while making a configuration failure resemble a successful decision to retain the earlier behaviour.

## Initialization made timing part of the change

The historical retriever selected its profile during construction.

<p class="code-source">retriever.py · constructor profile selection · platform f8c34be9 · exact historical statements</p>

```python
_profile = resolve_serving_collection()
self.collection_name = _profile.collection_name
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- The first statement asks the resolver for the active serving profile.
- The second stores the profile's collection name on this retriever instance.
- A later flag change must be considered alongside the lifetime of that instance.
- The excerpt establishes assignment at construction. It does not demonstrate a live configuration refresh.

</details>

The implementation therefore made process lifetime relevant. The cutover notes describe waiting for flag propagation and then restarting until the process pinned the intended collection. Restarting immediately after changing the flag could read a cached older value and construct another instance with the old selection.

The handover contains shorthand about a roughly fifteen-second poll and rollback. The constructor gives that shorthand a necessary boundary. A control-client poll and an already constructed retriever's stored collection are different states. A rollback check needed the process's actual serving selection, rather than a timing assumption based only on the flag service.

![The engineer checks a cable entering a coastal relay station through its permitted wall opening.](/images/blog/s5e11/inline-1.png)

<p class="caption">The service doing the work needs its own configuration and permitted control path. The cable is a conceptual representation.</p>

## A named collection still needed a named vector

Resolving the new collection exposed another boundary. The new collection stored its dense representation under the name `dense`. The earlier collection used an unnamed default vector. The retriever initially discarded the profile's vector-space name when constructing the query.

Qdrant supports multiple named vector spaces within a collection. A query has to select the intended space. That current reference explains why a collection name alone is an incomplete description of a request. It does not establish which request the July service made. [Qdrant vector reference](https://qdrant.tech/documentation/manage-data/vectors/)

The historical fix stored the name from the profile on the retriever.

<p class="code-source">retriever.py · constructor vector-space assignment · platform f8c34be9 · exact historical statement</p>

```python
self.dense_vector_name = _profile.dense_vector_name
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- The right-hand value comes from the selected serving profile.
- The left-hand attribute keeps that value on the retriever instance.
- The inspected search call later passes this attribute through its `using` argument.
- The attribute can preserve the earlier unnamed behaviour when the profile supplies no vector name.

</details>

The last point mattered for compatibility. A migration could need a named query for the new collection and an unnamed query for its retained rollback collection. Hardcoding the new name into every call would have changed the older path's contract. Carrying the profile's choice preserved the distinction.

The following is a simplified explanatory request, based on the inspected adapter call. It is not an exact historical wire payload.

```json
{
  "collection": "rootweaver_vault_v2",
  "using": "dense",
  "query_vector": "illustrative embedding omitted",
  "limit": 10
}
```

The collection chooses the body of stored points. The `using` field selects a vector space inside that body. The query representation must also be compatible with the selected space. Choosing a collection successfully says little about the other two requirements.

## The empty-result boundary hid useful evidence

An unnamed query against the new collection could fail at the vector-store boundary. The old account says the resulting bad request was converted into an empty dense result by a broad exception path. Keyword retrieval could still supply plausible results to a hybrid response.

The retained implementation shows that general exception handling returned an empty list, while the specific embedding-backend error propagated.

<p class="code-source">retriever.py · vector-search exception boundary · platform f8c34be9 · exact historical excerpt</p>

```python
except EmbeddingBackendError:
    raise
except Exception as e:
    logger.error(f"Vector search failed: {e}", exc_info=True)
    return []
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- A recognized embedding-backend error is raised to the caller.
- Other exceptions enter the general handler.
- The handler records the error and traceback in logs.
- The method then supplies an empty list to its caller.
- The caller can therefore receive an apparently ordinary empty leg even though logs contain a failure.

</details>

The failure was not completely invisible. It crossed a boundary where its meaning changed. An operator reading the logs could find it, while a check that counted returned documents could miss the loss of dense retrieval.

The structural signal in the cutover account was the number of returned results with dense contribution. It reports that contribution moving from zero to an average of 7.40 in the described ten-result checks, close to the older path's reported 7.20. Those counts helped establish that the dense leg had become active in that observation window. They were not an answer-quality score.

![The engineer matches a shaped key to a specific destination slot in a sorting hall.](/images/blog/s5e11/inline-2.png)

<p class="caption">Selecting the correct destination requires carrying its identity through the final hand-off. Conceptual illustration of a named vector space.</p>

<figure id="mechanism" class="story-flow" data-policy-flow><h3>Follow the mechanism</h3><div class="flow-desktop"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 160" role="img" aria-label="Episode 11 simplified mechanism"><defs><pattern id="grid-e11-d" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arrow-e11-d" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="#a78bfa"/></marker></defs><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#grid-e11-d)"/><path data-flow-edge class="flow-motion" d="M95 46H185" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e11-d)"/><path data-flow-edge class="flow-motion" d="M235 46H325" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e11-d)"/><path data-flow-edge class="flow-motion" d="M375 46H465" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e11-d)"/><path data-flow-edge class="flow-motion" d="M515 46H605" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e11-d)"/><g transform="translate(70 46)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><rect x="-10" y="-13" width="20" height="26" rx="2"/><path d="M-6-6H6M-6 0H6M-6 6H3"/></g></g><text x="70" y="97" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Flag</text><text x="70" y="118" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Effective environment</text><g transform="translate(210 46)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-13 0H13M5-8L13 0L5 8"/><circle cx="-10" cy="0" r="3"/></g></g><text x="210" y="97" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Retriever</text><text x="210" y="118" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Serving process</text><g transform="translate(350 46)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><circle cx="-3" cy="-3" r="9"/><path d="M4 4L13 13"/></g></g><text x="350" y="97" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Control path</text><text x="350" y="118" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Config and egress</text><g transform="translate(490 46)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-13-10H13L4 2V12H-4V2Z"/></g></g><text x="490" y="97" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Vector name</text><text x="490" y="118" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Selected space</text><g transform="translate(630 46)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-12 0L-3 9L13-10"/></g></g><text x="630" y="97" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Evidence</text><text x="630" y="118" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Inspect contributions</text></svg></div><div class="flow-mobile"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 510" role="img" aria-label="Episode 11 simplified mechanism"><defs><pattern id="grid-e11-m" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arrow-e11-m" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="#a78bfa"/></marker></defs><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#grid-e11-m)"/><path data-flow-edge class="flow-motion" d="M48 69V111" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e11-m)"/><path data-flow-edge class="flow-motion" d="M48 169V211" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e11-m)"/><path data-flow-edge class="flow-motion" d="M48 269V311" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e11-m)"/><path data-flow-edge class="flow-motion" d="M48 369V411" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e11-m)"/><g transform="translate(48 44)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><rect x="-10" y="-13" width="20" height="26" rx="2"/><path d="M-6-6H6M-6 0H6M-6 6H3"/></g></g><text x="90" y="42" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Flag</text><text x="90" y="63" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Effective environment</text><g transform="translate(48 144)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-13 0H13M5-8L13 0L5 8"/><circle cx="-10" cy="0" r="3"/></g></g><text x="90" y="142" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Retriever</text><text x="90" y="163" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Serving process</text><g transform="translate(48 244)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><circle cx="-3" cy="-3" r="9"/><path d="M4 4L13 13"/></g></g><text x="90" y="242" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Control path</text><text x="90" y="263" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Config and egress</text><g transform="translate(48 344)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-13-10H13L4 2V12H-4V2Z"/></g></g><text x="90" y="342" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Vector name</text><text x="90" y="363" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Selected space</text><g transform="translate(48 444)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-12 0L-3 9L13-10"/></g></g><text x="90" y="442" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Evidence</text><text x="90" y="463" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Inspect contributions</text></svg></div><div class="flow-tools"><button type="button" data-flow-motion aria-pressed="false">Pause flow</button><button type="button" data-flow-expand>Expand diagram</button></div><figcaption>Simplified editorial model of the inspected mechanism. Dots show direction.</figcaption></figure><dialog data-flow-dialog aria-label="Expanded mechanism"><button type="button" data-flow-close>Close expanded diagram</button><div data-flow-expanded-content></div></dialog><script is:inline src="/images/blog/s5e11/flow-ui.js"></script><script is:inline src="/images/blog/s5e11/flow-motion.js"></script>

## A fast response could test a different path

The same records contain very different latency observations. Cached gateway responses were fast. Uncached direct full-hybrid retrieval took much longer, and a reranking path could time out before returning results. Those observations belong to different request paths and cache states.

A cache hit can avoid the retriever operation under investigation. That is useful for service responsiveness, but it makes a poor standalone test of a changed vector-store call. The cutover needed a request that exercised the actual dense leg and exposed its contribution.

| Reported path | Approximate historical observation | Scope of the observation |
|---|---|---|
| Gateway fast path, cached | 15 milliseconds | Response from the cache-oriented path |
| Gateway fast path, cache miss | 90 milliseconds | The stated fast-mode probe |
| Direct uncached full-hybrid retrieval | 11.4 seconds median | The expensive retrieval path described in the handover |
| Reranking path | Around 40 seconds followed by no results | A separately recorded problem, disabled on the serving path |

These figures cannot be composed into a single migration speed-up. Their useful role is to show why request shape, cache state and component boundary belong beside a latency number.

The cutover report also identifies a whole-corpus keyword-index construction path as a separate performance opportunity. That remained distinct from getting the dense-vector name through the adapter. A request could be correctly routed and still have an inefficient keyword leg.

## Keep the rollback and inspect the comparison

The later signed closeout describes the new collection serving, with the old collection retained as a warm rollback and a snapshot kept for recovery. Physical deletion was scheduled for a later date. It was not part of this chapter's observed cutover checkpoint.

The earlier quality comparison still needed repair. The legacy handover reports that only five of thirty-two queries were scoreable in both arms because embedding failures could collapse the complete hybrid response. That made the apparent average a poor basis for deleting the rollback collection.

The implementation had reached a useful state without answering every quality question. The retriever could read the intended flag environment, reach its control service, select the intended collection and carry the vector name into the search. Dense contribution supplied one structural observation. A fair paired quality comparison required another set of checks.

## What I would carry into the next build

Trace the component that executes the request. A flag in the gateway does not automatically configure its delegated reader. Configuration, network access and selected data representation each have a concrete receiving boundary.

Test the intended route with an observation that can distinguish its internal legs. A successful response and a nonempty result list can coexist with a missing dense component. Keep logs and returned metadata aligned enough to expose that situation.

Observe configuration changes through process lifetime. A polling client can update while a constructed instance retains an older assignment. The serving process's effective selection is the acceptance observation.

Preserve a rollback while evaluating the new path. The next chapter follows the work needed to make that comparison usable, including a scoped keyword fallback, matched query pairs and a later result that changed the interpretation of the first promising probe.

<details class="glossary" data-glossary><summary>Glossary and primary references</summary><div class="glossary-tools" hidden><label for="glossary-search">Find a term</label><div class="glossary-search-row"><input id="glossary-search" type="search"><button type="button">Clear</button></div><p role="status" aria-live="polite"></p></div><section class="glossary-term" id="term-named-vector"><h3>Named vector</h3><p>A vector space selected by name within a Qdrant point or query.</p><p><a href="https://qdrant.tech/documentation/manage-data/vectors/">Primary reference</a></p></section><section class="glossary-term" id="term-serving-profile"><h3>Serving profile</h3><p>The selected collection and vector-space settings used by a reader.</p><p><a href="https://qdrant.tech/documentation/manage-data/vectors/">Primary reference</a></p></section><section class="glossary-term" id="term-control-plane"><h3>Control plane</h3><p>The configuration and coordination path that directs a service.</p><p><a href="https://kubernetes.io/docs/concepts/overview/components/">Primary reference</a></p></section><section class="glossary-term" id="term-data-path"><h3>Data path</h3><p>The component sequence that processes the actual search request.</p><p><a href="https://kubernetes.io/docs/concepts/overview/components/">Primary reference</a></p></section><section class="glossary-term" id="term-feature-flag"><h3>Feature flag</h3><p>A runtime setting used to choose between behaviours.</p><p><a href="https://docs.getunleash.io/">Primary reference</a></p></section><section class="glossary-term" id="term-rollback"><h3>Rollback</h3><p>Returning to a retained serving configuration when the change is unacceptable.</p><p><a href="https://qdrant.tech/documentation/tutorials-operations/embedding-model-migration/">Primary reference</a></p></section></details>


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
<script is:inline src="/images/blog/s5e11/reader.js"></script>
