---
title: "The Routing Fix Did Not Rescue the Experiment"
description: "Repairing the routed search path improved implementation integrity while the remaining experiment still changed several factors together."
pubDatetime: 2026-07-15T18:00:00Z
draft: false
author: Ryan Duffy
episode: 13
image: /images/blog/s5e13/hero-A.png
imageAlt: "The engineer compares a narrow fenced route with the whole orchard, noticing needed trees outside the fence."
shippingDatetime: 2026-11-21T20:15:11Z
series: "Season 5: Rootweaver"
tags: [Rootweaver, Experimentation, Retrieval, SoftwareEngineering]
---

The previous comparison changed the interpretation of an attractive retrieval probe. Another experiment then needed a more basic inspection. Its routed and default requests were supposed to support a decision about domain-aware retrieval, but the routed endpoint was using a different implementation path.

I needed the experiment to exercise the behaviour its labels described. The July work repaired that path, checked how filters reached the agents and reran the reported comparison. The implementation improved. The remaining evidence still supported retiring the current hard-slice rollout, with a much narrower conclusion than declaring all domain-aware retrieval ineffective.

![The engineer compares a narrow fenced route with the whole orchard, noticing needed trees outside the fence.](/images/blog/s5e13/hero-A.png)

<p class="caption">A selected part of a corpus can exclude evidence needed by the task. Conceptual illustration.</p>

This chapter covers July 15, 2026. It is a curated reconstruction from the signed retirement handover and historical endpoint, agent and evaluation source at `f4ef4410`. I owned direction and review, with agent-assisted implementation and analysis. Scores, confidence intervals and deployment checks remain attributed historical results. New inspection follows the retained code. It does not rerun the held-out evaluation, invoke a model or independently re-score the answers.

## The endpoint had bypassed the common pipeline

The domain endpoint was intended to select a route and corpus filter. The handover says the earlier implementation called the retriever directly, bypassing the shared agent path used by ordinary search. A comparison could therefore mix the routing idea with unrelated differences in how the two paths assembled results.

The repair dispatched routed requests through the common agent-search function. It carried both the selected filter and the domain persona into that call.

<p class="code-source">domain_endpoints.py · routed single-filter dispatch · platform f4ef4410 · exact historical excerpt</p>

```python
agent_response = await agent_search(
    request,
    trace_id,
    start_time,
    filters=plan.filters[0],
    domain_persona=plan.persona,
)
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- The endpoint awaits the shared agent-search path.
- The request, trace identifier and start time remain available to that path.
- `plan.filters[0]` supplies the selected corpus constraint for this branch.
- `plan.persona` supplies a separate answer-generation instruction.
- The call establishes what this boundary sends. Each receiving agent still has to implement the relevant argument.

</details>

A union branch handled several selected filters, collected their result lists and merged them. The source shows that this branch also passed filter and persona arguments. It combined particular planned slices. It did not automatically unite a domain slice with the complete unfiltered corpus.

That difference affected the proposed successor experiment. A fallback formed from two narrow slices still excludes documents outside both. A future whole-corpus-union ablation would require a genuinely different eligible set and another explicit acceptance plan.

## A keyword can arrive and still lose its meaning

The historical account records a defect in the Oracle agent. It could accept extra keywords while failing to apply the supplied filter. A routed response could therefore report routing activity without establishing that the intended corpus restriction had reached retrieval.

The inspected repair merges the explicit request filter with the agent's ordinary source constraints, then passes the merged value onward.

<p class="code-source">oracle_agent.py · search_async filter merge · platform f4ef4410 · exact historical excerpt</p>

```python
source_filters = _merge_payload_filters(
    build_source_filter(
        source=source, sources=sources, meta_status=meta_status
    ),
    filters,
)
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- The agent constructs its usual source and status constraints.
- The separately supplied `filters` argument enters the merge.
- The resulting value is stored as `source_filters`.
- The subsequent inspected `_async_search` call receives `filters=source_filters`.
- The merge preserves both sets of intended constraints according to the helper's contract.

</details>

Following the receiving code mattered more than finding the word `filters` in an endpoint signature. A permissive `**kwargs` can make a call syntactically acceptable while discarding its intended semantics.

![The engineer follows two hoses through a shared greenhouse filter box to their receiving beds.](/images/blog/s5e13/inline-1.png)

<p class="caption">A request constraint needs to reach and affect the implementation that uses it.</p>

## The Code agent still had a different contract

The retained Code agent source adds an important qualification to the handover's broad repair summary. Its entry point accepts a filter argument, but the shown branch warns that it cannot apply that constraint.

<p class="code-source">code_agent.py · search_async filter warning · platform f4ef4410 · exact historical excerpt</p>

```python
if filters:
    logger.warning(
        "CodeAgent received payload filters but cannot apply them "
        "(no-op for code generation): filters=%s",
        filters,
    )
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- A supplied filter enters the warning branch.
- The message explicitly describes a no-op for this agent's code-generation path.
- Logging the value makes the unsupported request visible to an operator.
- This excerpt supplies no filtering implementation.
- A uniform parameter name across agents therefore does not establish a uniform corpus-selection guarantee.

</details>

The agent's shown vault-search call also omits a filter argument. That is a source-level limit on claiming every routed branch was hard-sliced. The observed route flag identifies control flow. It cannot, by itself, certify the eligible document set used by every receiving implementation.

This qualification does not remove the useful endpoint and Oracle repairs. It keeps their scope inspectable. The next experiment would need a per-agent contract that either demonstrates the intended filter semantics or clearly identifies an unsupported branch.

## The two arms still changed several things

The evaluation source makes another boundary explicit. The default answer used the base persona. The routed answer used the persona returned by the routed response, with the base persona as fallback.

<p class="code-source">eval_live_ab.py · routed answer instruction selection · platform f4ef4410 · exact historical excerpt</p>

```python
routed_system = (
    routed_resp.get("persona_system_prompt") or BASE_PERSONA.system_prompt
)
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- The harness first asks the routed response for its persona instruction.
- If that value is absent or empty, it uses the base persona.
- The inspected default-answer call always uses the base persona.
- Retrieval inputs and answer-generation instructions can therefore differ between the arms.

</details>

The comparison still measured a bundle of routing, corpus selection and persona behaviour. Repairing the pipeline removed an implementation difference, but it did not turn the experiment into a single-factor test of slicing.

| Factor | Default arm | Routed arm |
|---|---|---|
| Route | Default search endpoint | Domain endpoint and selected agent |
| Corpus constraint | Default eligible corpus | Planned filter, subject to receiving-agent support |
| Answer instruction | Base persona | Returned domain persona or base fallback |
| Judge context | The question's source truth | The same question's source truth |

The shared judge context helped make the comparison meaningful. It did not isolate which of the changed treatment factors caused a difference. A factorial or otherwise controlled follow-up would be needed for that attribution. [NIST experimental-design reference](https://www.itl.nist.gov/div898/handbook/pri/section3/pri3.htm)

<figure id="mechanism" class="story-flow" data-policy-flow><h3>Follow the mechanism</h3><div class="flow-desktop"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 160" role="img" aria-label="Episode 13 simplified mechanism"><defs><pattern id="grid-e13-d" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arrow-e13-d" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="#a78bfa"/></marker></defs><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#grid-e13-d)"/><path data-flow-edge class="flow-motion" d="M95 46H185" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e13-d)"/><path data-flow-edge class="flow-motion" d="M235 46H325" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e13-d)"/><path data-flow-edge class="flow-motion" d="M375 46H465" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e13-d)"/><path data-flow-edge class="flow-motion" d="M515 46H605" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e13-d)"/><g transform="translate(70 46)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><rect x="-10" y="-13" width="20" height="26" rx="2"/><path d="M-6-6H6M-6 0H6M-6 6H3"/></g></g><text x="70" y="97" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Request</text><text x="70" y="118" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Choose routed path</text><g transform="translate(210 46)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-13 0H13M5-8L13 0L5 8"/><circle cx="-10" cy="0" r="3"/></g></g><text x="210" y="97" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Pipeline</text><text x="210" y="118" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Shared agent flow</text><g transform="translate(350 46)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><circle cx="-3" cy="-3" r="9"/><path d="M4 4L13 13"/></g></g><text x="350" y="97" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Filters</text><text x="350" y="118" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Reach each caller</text><g transform="translate(490 46)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-13-10H13L4 2V12H-4V2Z"/></g></g><text x="490" y="97" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Experiment</text><text x="490" y="118" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Identify changed factors</text><g transform="translate(630 46)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-12 0L-3 9L13-10"/></g></g><text x="630" y="97" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Decision</text><text x="630" y="118" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Apply rollout criterion</text></svg></div><div class="flow-mobile"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 510" role="img" aria-label="Episode 13 simplified mechanism"><defs><pattern id="grid-e13-m" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arrow-e13-m" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="#a78bfa"/></marker></defs><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#grid-e13-m)"/><path data-flow-edge class="flow-motion" d="M48 69V111" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e13-m)"/><path data-flow-edge class="flow-motion" d="M48 169V211" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e13-m)"/><path data-flow-edge class="flow-motion" d="M48 269V311" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e13-m)"/><path data-flow-edge class="flow-motion" d="M48 369V411" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e13-m)"/><g transform="translate(48 44)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><rect x="-10" y="-13" width="20" height="26" rx="2"/><path d="M-6-6H6M-6 0H6M-6 6H3"/></g></g><text x="90" y="42" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Request</text><text x="90" y="63" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Choose routed path</text><g transform="translate(48 144)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-13 0H13M5-8L13 0L5 8"/><circle cx="-10" cy="0" r="3"/></g></g><text x="90" y="142" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Pipeline</text><text x="90" y="163" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Shared agent flow</text><g transform="translate(48 244)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><circle cx="-3" cy="-3" r="9"/><path d="M4 4L13 13"/></g></g><text x="90" y="242" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Filters</text><text x="90" y="263" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Reach each caller</text><g transform="translate(48 344)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-13-10H13L4 2V12H-4V2Z"/></g></g><text x="90" y="342" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Experiment</text><text x="90" y="363" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Identify changed factors</text><g transform="translate(48 444)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-12 0L-3 9L13-10"/></g></g><text x="90" y="442" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Decision</text><text x="90" y="463" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Apply rollout criterion</text></svg></div><div class="flow-tools"><button type="button" data-flow-motion aria-pressed="false">Pause flow</button><button type="button" data-flow-expand>Expand diagram</button></div><figcaption>Simplified editorial model of the inspected mechanism. Dots show direction.</figcaption></figure><dialog data-flow-dialog aria-label="Expanded mechanism"><button type="button" data-flow-close>Close expanded diagram</button><div data-flow-expanded-content></div></dialog><script is:inline src="/images/blog/s5e13/flow-ui.js"></script><script is:inline src="/images/blog/s5e13/flow-motion.js"></script>

## Repeated judging did not create more questions

The historical handover reports forty held-out questions, ten per domain, with three judge passes over the same generated answer pairs. Repeated judgments helped inspect judge variation. They did not create 120 independent retrieval questions.

The saved harness also made its acceptance calculation inspectable.

<p class="code-source">eval_live_ab.py · verdict calculation · platform f4ef4410 · exact historical excerpt</p>

```python
verdict = (
    all(v["routed_ge_default"] for v in aggregate.values()) and max_std <= 0.05
)
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- Each domain aggregate contains a point-estimate comparison between routed and default means.
- `all` requires every stored comparison to satisfy that condition.
- `max_std` is the largest recorded run-to-run standard deviation across judge passes.
- The final Boolean also requires that value to be at most 0.05.
- The expression does not calculate a confidence interval for the treatment effect.

</details>

The source and the handover therefore support different observations about uncertainty. A stable judge can repeatedly score an unrepresentative set of questions. A failed rollout condition can justify withholding a feature even when the sample is too small to prove a general performance difference.

The report's statistical correction makes that limit concrete.

| Domain example | Reported routed-minus-default difference | Reported 95% interval |
|---|---|---|
| Architecture | +0.042 | −0.272 to +0.356 |
| SRE | −0.163 | −0.583 to +0.257 |

Both intervals span zero and a broad range of plausible effects under the stated analysis. The source record supplied these values. I have not reconstructed the original answer pairs or rerun its statistical procedure.

The useful decision was about readiness of this rollout. The stronger conclusion that all domain-aware retrieval had been disproved would require evidence the experiment did not supply.

## The slice boundary excluded relevant evidence

The handover records another finding that changed the interpretation. Five of the ten SRE questions had ground-truth documents outside the configured SRE paths. A hard filter based on those paths could remove material the question actually needed.

That is an inspectable design mismatch, even though the complete raw benchmark is not retained in this reading package. It belongs to this particular slice definition. A different definition, a soft ranking feature or a full-corpus union would be another treatment.

There is also a subtle top-k point worth preserving. Filtering can remove a high-ranked out-of-slice document and promote an in-slice document that previously fell below the cutoff. It therefore changes both eligibility and the visible ranking. A general claim that filtering can only reduce recall would skip that selection effect.

Consider a synthetic top-three list. An outside-slice document ranks first, two inside-slice documents rank second and third, and another inside-slice document ranks fourth. Applying the slice before taking three results can promote that fourth document. Whether this helps depends on which documents the question needs.

```json
{
  "unfiltered_top_three": ["outside-A", "inside-B", "inside-C"],
  "next_unfiltered_candidate": "inside-D",
  "filtered_top_three": ["inside-B", "inside-C", "inside-D"],
  "quality_outcome": "requires the question's evidence needs"
}
```

The example explains a ranking property. It does not reproduce a held-out question or establish that this happened in every historical run.

![The engineer separates three unmarked treatment cards while comparing two baskets in an orchard packing shelter.](/images/blog/s5e13/inline-2-v2.png)

<p class="caption">A comparison needs an account of each factor that changed before a result can be attributed to one of them.</p>

## A transient field did not become a durable report

The source also clarifies the handover's concern about missing routed-domain detail. The harness temporarily stored `routed_domain` in its in-memory answered rows. That looked promising at first inspection.

The later loop passed the expected domain, question, answer pair and truth context to the judge. Its output was appended to a comparisons list. The final returned report contained those comparisons and aggregate routing counters, while omitting the original answered rows.

The transient field therefore did not establish a saved per-question actual-route record. The aggregate count of matching domains could not reconstruct which judged question had been routed correctly. That prevented a reliable correctly-routed subgroup analysis from being recovered from the saved summary alone.

This is a data-lineage failure at a small boundary. Collecting a value in memory and persisting the value needed by the next analysis are different operations. A useful experiment record has to carry the treatment actually applied to the same unit whose outcome is being judged.

## Retire the treatment, retain the useful repair

The closeout records the live comparison failing and the routing flag rolled back. It also records a recommendation to retire the current hard-sliced experiment. Removing the duplicate bypass path and making filter handling inspectable remained useful implementation work.

A follow-up proposal retained the full-corpus baseline, optionally added a high-confidence domain branch, deduplicated the union and applied one shared reranker. It also proposed testing persona effects separately. Those were conditions for reopening the investigation, rather than a deployed successor demonstrated by this episode.

The report's statistical and implementation corrections narrow the conclusion further. The experiment changed several factors. A receiving agent still had an explicit filter no-op. The sample was small, some slice boundaries excluded required evidence, and per-question route persistence was incomplete. Those limits belong beside the operational decision.

## What I would carry into the next build

Follow the real endpoint and every receiving argument before interpreting an experiment label. An accepted keyword, a route flag and a warning message establish different things. The implementation contract needs to state what each agent can actually enforce.

Record the treatment at the same granularity as the judged outcome. Per-question actual route, effective filter, selected persona and retrieval identifiers are more useful for later attribution than aggregate route counts alone.

Separate implementation repair from experimental success. A better shared pipeline can be worth keeping even when the feature it was built to evaluate does not satisfy its rollout gate.

Preserve uncertainty in the decision record. A conservative rollout decision can be justified without turning a small comparison into a broad scientific verdict. The next records move to a scoring job whose manual debug run and scheduled-controller state answered different operational questions. That returns the same discipline to an alert and its actual source of truth.

<details class="glossary" data-glossary><summary>Glossary and primary references</summary><div class="glossary-tools" hidden><label for="glossary-search">Find a term</label><div class="glossary-search-row"><input id="glossary-search" type="search"><button type="button">Clear</button></div><p role="status" aria-live="polite"></p></div><section class="glossary-term" id="term-corpus"><h3>Corpus</h3><p>The body of documents eligible for retrieval.</p><p><a href="https://qdrant.tech/documentation/concepts/search/">Primary reference</a></p></section><section class="glossary-term" id="term-top-k"><h3>Top-k</h3><p>The first k ranked candidates returned from an eligible set.</p><p><a href="https://qdrant.tech/documentation/concepts/search/">Primary reference</a></p></section><section class="glossary-term" id="term-ablation"><h3>Ablation</h3><p>A controlled comparison that changes a defined part of a system.</p><p><a href="https://www.itl.nist.gov/div898/handbook/pri/section3/pri3.htm">Primary reference</a></p></section><section class="glossary-term" id="term-confounding"><h3>Confounding</h3><p>A comparison in which multiple changes make attribution ambiguous.</p><p><a href="https://www.itl.nist.gov/div898/handbook/pri/section3/pri3.htm">Primary reference</a></p></section><section class="glossary-term" id="term-persona"><h3>Persona</h3><p>An answer-generation instruction associated with a role or domain.</p><p><a href="#the-two-arms-still-changed-several-things">Historical source excerpt in this episode</a></p></section><section class="glossary-term" id="term-rollout-gate"><h3>Rollout gate</h3><p>A prespecified acceptance rule for deciding whether to deploy a change.</p><p><a href="https://www.itl.nist.gov/div898/handbook/pri/section3/pri3.htm">Primary reference</a></p></section></details>


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
<script is:inline src="/images/blog/s5e13/reader.js"></script>
