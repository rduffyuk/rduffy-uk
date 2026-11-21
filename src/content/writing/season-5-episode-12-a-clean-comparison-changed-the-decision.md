---
title: "A Clean Comparison Changed the Decision"
description: "A scoped retrieval fallback made a comparison usable, and a fuller paired run overturned the attractive first interpretation."
pubDatetime: 2026-07-14T18:00:00Z
draft: false
author: Ryan Duffy
episode: 12
image: /images/blog/s5e12/hero-A.png
imageAlt: "The engineer compares a small selection of cards against the full paired set on a workshop table."
shippingDatetime: 2026-11-21T19:05:14Z
series: "Season 5: Rootweaver"
tags: [Rootweaver, Retrieval, Evaluation, Reliability]
---

The serving cutover had reached the intended collection and restored dense retrieval. The next question was whether its results justified retiring the older path. A response could contain useful documents while the comparison used to judge it remained compromised by dependency failures or an unrepresentative probe.

I needed a usable comparison before choosing another retrieval change. The work first repaired how hybrid search handled an embedding failure, then examined paired queries and fusion methods. A later check changed both the preferred operational decision and the explanation of an apparent unstable result.

![The engineer inspects a full sequence of paired proof sheets in a print-proofing room.](/images/blog/s5e12/hero-A.png)

<p class="caption">A few attractive examples need to be checked against the rest of the paired set. Conceptual illustration.</p>

This chapter covers the July 14, 2026 retrieval comparison and closeout. It is reconstructed from the dated handover, signed ranking decision and historical retriever source at `f8b3f97c`. I owned direction and review, with agent-assisted implementation and analysis. The numerical results remain historical reports. The original complete query artifacts and scoring environment are not recovered here, so the new checks are limited to source structure and explanatory arithmetic.

## A failed dependency could erase the whole response

Hybrid retrieval combined a dense leg with a keyword leg. The dense leg depended on a query embedding. The historical notes describe an upstream overload error encoded inside a provider response whose HTTP status could still be 200. A transport-success counter therefore did not identify every failed embedding operation.

The earlier implementation propagated the recognized embedding-backend exception. That could cause the complete hybrid request to fail even while keyword retrieval had useful results. In the earlier cutover account, only five of thirty-two queries were scoreable in both comparison phases.

The repair preserved a narrower fallback. An embedding-backend failure could leave the dense list empty and retain keyword results, with a degradation reason carried in the retriever's response metadata. Other vector exceptions and keyword failures still had explicit failure paths.

<p class="code-source">retriever.py · hybrid_search result handling · platform f8b3f97c · exact historical excerpt</p>

```python
if isinstance(vector_results, EmbeddingBackendError):
    logger.warning(
        "hybrid dense leg unavailable; degrading to BM25-only",
        exc_info=vector_results,
    )
    vector_results = []
    degraded = "embedding_backend_unavailable"
elif isinstance(vector_results, BaseException):
    raise vector_results

if isinstance(bm25_results, BaseException):
    raise bm25_results
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- The first condition recognizes the specific embedding dependency failure.
- The warning preserves evidence of the reduced-capability path.
- The dense result becomes an empty list and a degradation reason is recorded.
- Other vector exceptions are raised instead of being silently converted into this fallback.
- A keyword-leg exception also propagates, since that leg is needed for the remaining search.
- The surrounding method later includes the degradation reason in its metadata.

</details>

That scope mattered. Catching every exception and returning whatever remained would have hidden programming errors and keyword failures behind the same reassuring response. The retained code makes the accepted dependency failure distinguishable from those other cases.

The handover reports the retriever image deployed and an actual overload absorbed by the fallback. It also records a later test gap on the keyword-leg propagation path. That test was added in the closeout. The code inspection and the reported live failure observation are separate sources of support.

![The engineer redirects a parcel along a visible walking route around a blocked courier chute.](/images/blog/s5e12/inline-1.png)

<p class="caption">A scoped fallback can preserve useful work while keeping its reduced capability visible.</p>

## Quality and availability needed separate records

A quality comparison needs corresponding observations for the same question. If one arm produces an answer and the other fails at a dependency, silently dropping the question changes the population being scored. Treating the failure as an ordinary low-quality answer changes the meaning in another way.

The useful record preserves both the request outcome and the conditional quality score. Here is a synthetic example explaining that separation.

```json
{
  "question_id": "illustrative-pair-2",
  "first_arm": {"status": "ok", "quality_score": 0.7},
  "second_arm": {"status": "dependency_failure", "quality_score": null},
  "paired_quality_delta": null,
  "availability_failure_recorded": true
}
```

The missing quality difference does not erase the availability failure. It keeps two questions available for inspection. One concerns whether a service completed the request. The other concerns the relative quality of two completed answers.

NIST's paired-comparison reference describes matching each observation under one condition with its counterpart under the other. It provides the statistical vocabulary used here. The July numbers come from the retained reports. [NIST paired-comparison reference](https://www.itl.nist.gov/div898/handbook/prc/section3/prc311.htm)

The later handover reports a clean run with twenty-two scoreable query pairs, no empty responses and no degraded responses. I keep that roster separate from the earlier thirty-two-query account because the complete underlying bundles are not retained here. A clean twenty-two-pair comparison does not prove that every earlier question was recovered unchanged.

## Two comparisons answered different questions

The first comparison asked about the old and new serving collections. It involved changing the effective serving selection and checking which collection the retriever had pinned. The second comparison kept the new collection and changed a per-request fusion method.

| Comparison | Deliberate change | Other requirement |
|---|---|---|
| Earlier collection versus new collection | Serving selection | Flag propagation, correct process initialization and paired requests |
| RRF versus weighted fusion on the new collection | Per-request fusion method | Same query set and relevant request settings |

Mixing those comparisons would make a method result look like a corpus result. Their request boundaries and rollback implications were different.

The collection comparison's reported mean scores were 0.5779 and 0.5654, with a difference of −0.0125 and an interval spanning −0.0643 to +0.0262. The interval crossed zero and extended beyond a narrow ±0.02 tolerance discussed by the handover.

That did not establish formal equivalence or non-inferiority within that tolerance. It did explain why a simple pass/fail display was a poor substitute for reading the uncertainty and the individual cases. The later operational acceptance was a decision made with those limits visible.

<figure id="mechanism" class="story-flow" data-policy-flow><h3>Follow the mechanism</h3><div class="flow-desktop"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 160" role="img" aria-label="Episode 12 simplified mechanism"><defs><pattern id="grid-e12-d" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arrow-e12-d" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="#a78bfa"/></marker></defs><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#grid-e12-d)"/><path data-flow-edge class="flow-motion" d="M95 46H185" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e12-d)"/><path data-flow-edge class="flow-motion" d="M235 46H325" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e12-d)"/><path data-flow-edge class="flow-motion" d="M375 46H465" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e12-d)"/><path data-flow-edge class="flow-motion" d="M515 46H605" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e12-d)"/><g transform="translate(70 46)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><rect x="-10" y="-13" width="20" height="26" rx="2"/><path d="M-6-6H6M-6 0H6M-6 6H3"/></g></g><text x="70" y="97" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Dependency</text><text x="70" y="118" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Observe failures</text><g transform="translate(210 46)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-13 0H13M5-8L13 0L5 8"/><circle cx="-10" cy="0" r="3"/></g></g><text x="210" y="97" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Fallback</text><text x="210" y="118" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Keep useful results</text><g transform="translate(350 46)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><circle cx="-3" cy="-3" r="9"/><path d="M4 4L13 13"/></g></g><text x="350" y="97" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Pair queries</text><text x="350" y="118" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Comparable inputs</text><g transform="translate(490 46)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-13-10H13L4 2V12H-4V2Z"/></g></g><text x="490" y="97" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Full set</text><text x="490" y="118" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Inspect trade-offs</text><g transform="translate(630 46)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-12 0L-3 9L13-10"/></g></g><text x="630" y="97" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Decision</text><text x="630" y="118" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Keep scoped claims</text></svg></div><div class="flow-mobile"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 510" role="img" aria-label="Episode 12 simplified mechanism"><defs><pattern id="grid-e12-m" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arrow-e12-m" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="#a78bfa"/></marker></defs><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#grid-e12-m)"/><path data-flow-edge class="flow-motion" d="M48 69V111" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e12-m)"/><path data-flow-edge class="flow-motion" d="M48 169V211" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e12-m)"/><path data-flow-edge class="flow-motion" d="M48 269V311" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e12-m)"/><path data-flow-edge class="flow-motion" d="M48 369V411" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e12-m)"/><g transform="translate(48 44)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><rect x="-10" y="-13" width="20" height="26" rx="2"/><path d="M-6-6H6M-6 0H6M-6 6H3"/></g></g><text x="90" y="42" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Dependency</text><text x="90" y="63" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Observe failures</text><g transform="translate(48 144)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-13 0H13M5-8L13 0L5 8"/><circle cx="-10" cy="0" r="3"/></g></g><text x="90" y="142" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Fallback</text><text x="90" y="163" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Keep useful results</text><g transform="translate(48 244)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><circle cx="-3" cy="-3" r="9"/><path d="M4 4L13 13"/></g></g><text x="90" y="242" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Pair queries</text><text x="90" y="263" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Comparable inputs</text><g transform="translate(48 344)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-13-10H13L4 2V12H-4V2Z"/></g></g><text x="90" y="342" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Full set</text><text x="90" y="363" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Inspect trade-offs</text><g transform="translate(48 444)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-12 0L-3 9L13-10"/></g></g><text x="90" y="442" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Decision</text><text x="90" y="463" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Keep scoped claims</text></svg></div><div class="flow-tools"><button type="button" data-flow-motion aria-pressed="false">Pause flow</button><button type="button" data-flow-expand>Expand diagram</button></div><figcaption>Simplified editorial model of the inspected mechanism. Dots show direction.</figcaption></figure><dialog data-flow-dialog aria-label="Expanded mechanism"><button type="button" data-flow-close>Close expanded diagram</button><div data-flow-expanded-content></div></dialog><script is:inline src="/images/blog/s5e12/flow-ui.js"></script><script is:inline src="/images/blog/s5e12/flow-motion.js"></script>

## The small fusion probe missed expensive losses

The first probe suggested that weighted fusion improved some exact-fact cases while harming an analytical case. It was useful for forming a question. The full twenty-two-query comparison was needed before changing the serving default.

The final decision report records mean RRF score 0.5705 and weighted score 0.5514. The weighted-minus-RRF point estimate was −0.0191, with a reported 95% bootstrap interval from −0.0851 to +0.0379. That interval left substantial uncertainty about the average effect.

The per-query account explained why the promising probe had been incomplete. Weighted fusion improved one factual case by 0.25, while a code-intelligence case fell from 0.422 to zero and a cross-domain case fell from 0.679 to 0.329. The earlier probe had not sampled those losses.

| Historical fusion result | Reported value | Reading for the decision |
|---|---|---|
| RRF mean | 0.5705 | Reference point in this paired run |
| Weighted mean | 0.5514 | Lower point estimate in this run |
| Weighted minus RRF | −0.0191 | Estimated average difference |
| Reported bootstrap interval | −0.0851 to +0.0379 | Direction and size remained uncertain |
| Query outcomes | Weighted better 7, RRF better 6, tied 9 | Aggregate means hid different local trade-offs |

A count of wins is not a sum of effect sizes. Seven small gains can coexist with six larger losses. That is why the complete per-query set mattered alongside the mean and interval.

Qdrant's current hybrid-search reference describes reciprocal rank fusion as combining positions within ranked lists. The July application also had its own weighted-fusion implementation. The historical source, rather than today's server feature set, defines what that application comparison tested. [Qdrant hybrid-search reference](https://qdrant.tech/documentation/hybrid-queries/)

## The weight knob needed its effective state

The handover says three tested weight values produced the same observed rankings. It described the fusion method as the important lever in that probe. The retained implementation supports a narrower interpretation than saying the weight parameter was universally irrelevant.

The weighted-fusion code multiplies normalized leg scores by their weights. Earlier in the same path, an enabled dynamic-alpha branch can replace the supplied values.

<p class="code-source">retriever.py · conditional dynamic-alpha assignment · platform f8b3f97c · exact historical excerpt</p>

```python
dat_alpha = compute_alpha(v_eff, b_eff)
vector_weight = dat_alpha
keyword_weight = 1.0 - dat_alpha
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- The first statement derives a weight from the evaluated leg-effectiveness values.
- The dense leg receives that derived value.
- The keyword leg receives its complement.
- The surrounding conditional requires dynamic tuning to be enabled and both result lists to be present.
- The excerpt does not establish that this branch ran in the historical probe.

</details>

The raw effective request and configuration record is incomplete here. I therefore treat identical rankings at those three tested weights as a local observation. The source shows why a future investigation should retain the effective weights and dynamic-tuning state before deciding a knob is disconnected.

This is the same practical discipline as following the named vector into the final adapter call. A supplied setting and the value used by the active implementation can differ. The evidence record needs the receiving boundary.

## Repetition changed the jitter diagnosis

Another early explanation concerned a factual query whose score had drifted between runs. The handover attributed that to embedding non-determinism. The later signed decision explicitly overturned the explanation.

It reports ten back-to-back identical queries with identical scores, membership and ordering. Three rephrasings used distinct cache keys and all retrieved the answer chunk, while their scores differed. Across the thirteen calls, the answer chunk appeared every time.

Those observations supported a more specific account. The check was sensitive to wording and the earlier runs differed in their probe or process context. The controlled repetition did not reproduce the proposed instability. It also did not prove that every embedding request would always be deterministic.

![The engineer repeats a land survey with a fixed tripod and unmarked observation cards.](/images/blog/s5e12/inline-2.png)

<p class="caption">Repeated observations need stable conditions before a changing result can be attributed to the component under investigation.</p>

The distinction affected the next action. A claim of model jitter suggests a different repair from a deterministic system whose scoring rule reacts to wording. Repeating the relevant observation under controlled conditions was cheaper and more informative than changing the model route on the basis of the first explanation.

## The decision was to keep the existing default

The closeout kept RRF. The fuller comparison supplied no persuasive operational reason to switch to the weighted method, and the localized gains came with losses elsewhere. This was an acceptance decision with uncertainty retained, rather than a claim that RRF had been proved superior for every future request.

The same closeout described the new collection serving and the older collection retained for rollback. A snapshot and a later deletion date separated the serving decision from irreversible cleanup. A deadline in a runbook was not evidence that deletion had happened.

There was another concrete recovery detail. The runbook needed a snapshot copied off the collection's storage before deleting that collection, because an in-tree snapshot could disappear with it. The comparison decision and the recovery artifact had separate acceptance checks.

## What I would carry into the next build

Record dependency failures separately from conditional quality. A successful fallback should be visible enough that a comparison can distinguish a full hybrid response from a keyword-only one.

Pair the same questions under clearly stated conditions. Preserve the roster, request parameters, effective configuration, returned metadata and per-query outcomes. A headline average cannot reconstruct those boundaries later.

Read the complete trade-off before changing a default. A small probe can reveal an interesting case and still miss the queries that determine the net result. Preserve both the point estimate and its uncertainty.

Finally, correct a causal story when a controlled check contradicts it. The later evidence changed the jitter diagnosis. The next chapter follows another experiment where repairing the implementation was necessary, but the remaining comparison still changed several factors at once.

<details class="glossary" data-glossary><summary>Glossary and primary references</summary><div class="glossary-tools" hidden><label for="glossary-search">Find a term</label><div class="glossary-search-row"><input id="glossary-search" type="search"><button type="button">Clear</button></div><p role="status" aria-live="polite"></p></div><section class="glossary-term" id="term-paired-comparison"><h3>Paired comparison</h3><p>A comparison in which each question has a corresponding observation under each condition.</p><p><a href="https://www.itl.nist.gov/div898/handbook/prc/section3/prc311.htm">Primary reference</a></p></section><section class="glossary-term" id="term-rrf"><h3>RRF</h3><p>Reciprocal rank fusion combines ranked lists using candidate positions.</p><p><a href="https://qdrant.tech/documentation/hybrid-queries/">Primary reference</a></p></section><section class="glossary-term" id="term-confidence-interval"><h3>Confidence interval</h3><p>An uncertainty interval constructed by a stated statistical procedure.</p><p><a href="https://www.itl.nist.gov/div898/handbook/prc/section3/prc311.htm">Primary reference</a></p></section><section class="glossary-term" id="term-point-estimate"><h3>Point estimate</h3><p>A single estimated value, such as the observed mean difference.</p><p><a href="https://www.itl.nist.gov/div898/handbook/prc/section3/prc311.htm">Primary reference</a></p></section><section class="glossary-term" id="term-degraded-retrieval"><h3>Degraded retrieval</h3><p>A disclosed reduced-capability search path after a dependency fails.</p><p><a href="https://qdrant.tech/documentation/hybrid-queries/">Primary reference</a></p></section><section class="glossary-term" id="term-embedding"><h3>Embedding</h3><p>A numerical representation used for similarity search.</p><p><a href="https://qdrant.tech/documentation/manage-data/vectors/">Primary reference</a></p></section></details>


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
<script is:inline src="/images/blog/s5e12/reader.js"></script>
