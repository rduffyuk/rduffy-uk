---
title: "More Workers Were the Wrong Fix"
description: "The graph backfill needed a query-plan repair, a concurrency rollback and enough time to finish useful work."
pubDatetime: 2026-07-14T12:00:00Z
draft: false
author: Ryan Duffy
episode: 10
image: /images/blog/s5e10/hero-A.png
imageAlt: "The Rootweaver engineer follows a rope through a crowded canal-lock mechanism."
shippingDatetime: 2026-11-17T08:00:00Z
series: "Season 5: Rootweaver"
tags: [Rootweaver, KnowledgeGraphs, Reliability, Performance]
---

Episode 9 ended with the graph backfill paused after another search timeout appeared under load. The empty-candidate repair had removed one unnecessary operation. Non-empty searches still reached the database, where some operations remained expensive enough to stop documents completing.

I wanted the backlog to drain reliably. The next investigation tried several plausible capacity changes, including more model-serving slots and overlapping document ingestion. The later evidence changed the direction. Parallel episodes competed for shared graph state, while the database query took a much broader route through that state than its supplied relationship identifier required.

![The Rootweaver engineer traces a working rope through a crowded canal-lock mechanism.](/images/blog/s5e10/hero-A.png)

<p class="caption">Additional pulling capacity still depends on the mechanism carrying the effort to the required place. Conceptual illustration.</p>

This chapter covers July 13–14, 2026. It is a curated reconstruction from the concurrency decision, throughput and query-fix handovers, the following deployment checkpoint and historical source at `3a0ff03e`. I owned direction and review, with agent-assisted investigation and implementation. The measurements remain attributed historical reports. Retained code and new arithmetic checks make the mechanism inspectable, while the original database profiles and full runtime bundles remain unrecovered.

## The plausible capacity changes

The work moved through generation, embedding and graph operations. Increasing capacity at one stage could help only while that stage constrained the job. A model server with spare capacity could still wait for a document whose graph search was scanning too much data.

The earlier July 13 handover describes a model-serving concurrency sweep and an increase in available sequence slots. It also records ingestion concurrency set to four. At that checkpoint, a short smoke had found no duplicate entities. The handover described the change as safe while leaving its throughput benefit unproved.

The observation window was incomplete. A later thirty-document verification run produced a different picture. The durable concurrency decision reports eighty-four search timeouts across six batches, roughly 43% document failure and newly duplicated entities. It also reports no throughput advantage from overlapping whole episodes.

The sequence matters. The first smoke supplied a limited checkpoint. The later run provided enough evidence to withdraw its reassuring safety interpretation. Preserving that correction explains why the decision changed, instead of presenting the final answer as something that had been obvious throughout.

| Historical observation | Unit | What it helped establish |
|---|---|---|
| 84 timeouts across six batches | Search-call failures | Repeated database operations failed under the verification load |
| About 43% failed | Documents in the reported run | A substantial part of the work failed to complete |
| Duplicate query changed from 0/0 to 12/14 | Duplicated names and extra entity nodes | Overlapping episodes introduced a consistency problem |
| No reported throughput benefit | Whole ingestion path | More concurrent episodes had not delivered the intended improvement |

Those denominators describe different properties. One document can perform several searches. The duplicate query counts names with multiple nodes and the extra nodes beyond one per name. A count of failed calls cannot be substituted for a document failure count or a consistency measure.

## Two defects shared one noisy symptom

Overlapping episodes increased pressure on the database. They also raced entity resolution. Two documents could independently decide that an entity needed creation before either observed the other's completed write. The decision record associates new duplicate timestamps with the concurrency window.

A query-plan repair could reduce the cost of finding existing relationships. It would still leave the safety of concurrent entity creation to establish. Reducing concurrency could stop the observed race while leaving an individual query inefficient. Each defect needed its own acceptance question.

The operational decision returned whole-episode ingestion concurrency from four to one. The record identifies the GitOps change and running image separately. The rollback addressed the reported consistency problem before the later query repair was deployed.

It also left a design question open. Graphiti coordinated work inside an episode. Increasing concurrency within an implementation that understands its deduplication boundaries differs from wrapping several complete `add_episode` calls in an outer semaphore. The records proposed studying that distinction later. They do not establish that a safe concurrent replacement was completed during this chapter.

## The plan exposed unnecessary work

Profiling the relationship search supplied the next useful observation. FalkorDB's `GRAPH.PROFILE` executes a query and returns its operator tree with execution measurements. The current reference also explains that profiling retains the modifying behaviour of a modifying query. Here it explains the inspection method. The July result remains in the historical report. [FalkorDB profiling reference](https://docs.falkordb.com/commands/graph.profile)

The old source already had a relationship UUID from its full-text candidate result. Its expansion included node-label predicates on both ends of that relationship.

<p class="code-source">client-before.py · relationship expansion · parent of platform 3a0ff03e · exact historical line</p>

```cypher
MATCH (n:Entity)-[e:RELATES_TO {uuid: rel.uuid}]->(m:Entity)
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- `n` and `m` name the endpoint nodes.
- `:Entity` asks for a label on each endpoint.
- `e:RELATES_TO` names and types the relationship between them.
- `{uuid: rel.uuid}` selects the relationship identified by the current candidate.
- The line describes the requested match. The planner chooses how to find it.

</details>

The report says the planner began with a node-label scan, expanding substantial intermediate work before reaching the relationship selection. The query contained a selective identifier, but its physical access path still had to be inspected.

The corrected source removed the endpoint-label predicates from this expansion.

<p class="code-source">client.py · relationship expansion · platform 3a0ff03e · exact historical line</p>

```cypher
MATCH (n)-[e:RELATES_TO {uuid: rel.uuid}]->(m)
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- The endpoint variables remain available for constructing results.
- The relationship type and UUID constraint remain present.
- The endpoint-label requirements are absent from this match.
- The reported profile then selected a relationship-index path.
- Applicability depends on the data and query contract. Removing predicates elsewhere requires its own correctness review.

</details>

That boundary prevents the example becoming a universal tuning recipe. Removing predicates changes the logical condition. The July account reports result parity for the inspected workload and an improved access path. A different graph, different endpoint types or another relationship model would need another review.

![The engineer follows a short chain directly to a selected gear in a canal maintenance pit.](/images/blog/s5e10/inline-1.png)

<p class="caption">A selective route to the required relationship can avoid examining unrelated starting points. The gears illustrate an access path rather than a measured database trace.</p>

## The candidate budget had a correctness job

The repair retained a bound before graph expansion. Its size also accounted for a caller that had already supplied a longer candidate list.

<p class="code-source">client.py · candidate budget · platform 3a0ff03e · exact historical excerpt</p>

```python
candidate_limit = max(
    limit,
    search_utils.RELEVANT_SCHEMA_LIMIT,
    len(search_filter.edge_uuids or []),
)
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- `candidate_limit` is an intermediate search budget.
- `limit` is the requested final result count.
- The library's schema limit supplies another lower bound.
- A supplied UUID list can require a larger budget so its candidates survive this stage.
- `max` selects the largest requirement. The later result limit still controls the returned count.

</details>

Consider a synthetic request for ten results, with a library floor of twenty and thirty-one supplied candidate identifiers. The intermediate budget becomes thirty-one. Selecting the final ten results remains a separate step. Reducing the intermediate budget to ten would discard some of the caller's already bounded search opportunity.

```json
{
  "requested_results": 10,
  "illustrative_schema_floor": 20,
  "supplied_candidate_count": 31,
  "intermediate_candidate_limit": 31,
  "final_result_limit": 10
}
```

This newly constructed example explains the fields. It is not an original request or a recovered profile. Its fresh check evaluates the arithmetic and verifies the retained source shapes. It does not execute the database planner.

<figure id="mechanism" class="story-flow" data-policy-flow><h3>Follow the mechanism</h3><div class="flow-desktop"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 160" role="img" aria-label="Episode 10 simplified mechanism"><defs><pattern id="grid-e10-d" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arrow-e10-d" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="#a78bfa"/></marker></defs><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#grid-e10-d)"/><path data-flow-edge class="flow-motion" d="M95 46H185" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e10-d)"/><path data-flow-edge class="flow-motion" d="M235 46H325" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e10-d)"/><path data-flow-edge class="flow-motion" d="M375 46H465" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e10-d)"/><path data-flow-edge class="flow-motion" d="M515 46H605" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e10-d)"/><g transform="translate(70 46)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><rect x="-10" y="-13" width="20" height="26" rx="2"/><path d="M-6-6H6M-6 0H6M-6 6H3"/></g></g><text x="70" y="97" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Failures</text><text x="70" y="118" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Count failed records</text><g transform="translate(210 46)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-13 0H13M5-8L13 0L5 8"/><circle cx="-10" cy="0" r="3"/></g></g><text x="210" y="97" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Trace work</text><text x="210" y="118" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Find the constraint</text><g transform="translate(350 46)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><circle cx="-3" cy="-3" r="9"/><path d="M4 4L13 13"/></g></g><text x="350" y="97" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Profile</text><text x="350" y="118" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Inspect access path</text><g transform="translate(490 46)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-13-10H13L4 2V12H-4V2Z"/></g></g><text x="490" y="97" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Bound writes</text><text x="490" y="118" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Protect graph state</text><g transform="translate(630 46)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-12 0L-3 9L13-10"/></g></g><text x="630" y="97" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Complete</text><text x="630" y="118" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Check marked records</text></svg></div><div class="flow-mobile"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 510" role="img" aria-label="Episode 10 simplified mechanism"><defs><pattern id="grid-e10-m" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arrow-e10-m" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="#a78bfa"/></marker></defs><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#grid-e10-m)"/><path data-flow-edge class="flow-motion" d="M48 69V111" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e10-m)"/><path data-flow-edge class="flow-motion" d="M48 169V211" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e10-m)"/><path data-flow-edge class="flow-motion" d="M48 269V311" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e10-m)"/><path data-flow-edge class="flow-motion" d="M48 369V411" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e10-m)"/><g transform="translate(48 44)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><rect x="-10" y="-13" width="20" height="26" rx="2"/><path d="M-6-6H6M-6 0H6M-6 6H3"/></g></g><text x="90" y="42" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Failures</text><text x="90" y="63" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Count failed records</text><g transform="translate(48 144)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-13 0H13M5-8L13 0L5 8"/><circle cx="-10" cy="0" r="3"/></g></g><text x="90" y="142" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Trace work</text><text x="90" y="163" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Find the constraint</text><g transform="translate(48 244)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><circle cx="-3" cy="-3" r="9"/><path d="M4 4L13 13"/></g></g><text x="90" y="242" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Profile</text><text x="90" y="263" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Inspect access path</text><g transform="translate(48 344)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-13-10H13L4 2V12H-4V2Z"/></g></g><text x="90" y="342" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Bound writes</text><text x="90" y="363" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Protect graph state</text><g transform="translate(48 444)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-12 0L-3 9L13-10"/></g></g><text x="90" y="442" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Complete</text><text x="90" y="463" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Check marked records</text></svg></div><div class="flow-tools"><button type="button" data-flow-motion aria-pressed="false">Pause flow</button><button type="button" data-flow-expand>Expand diagram</button></div><figcaption>Simplified editorial model of the inspected mechanism. Dots show direction.</figcaption></figure><dialog data-flow-dialog aria-label="Expanded mechanism"><button type="button" data-flow-close>Close expanded diagram</button><div data-flow-expanded-content></div></dialog><script is:inline src="/images/blog/s5e10/flow-ui.js"></script><script is:inline src="/images/blog/s5e10/flow-motion.js"></script>

The diagram follows the investigation from an operational failure count to a physical query path and back to completion. Its connectors describe reasoning and data flow. They are not a trace of the historical job.

## The deadline was another boundary

The concurrency decision exposed a completion problem that an efficient query would not automatically solve. The scheduled job had a two-hour active deadline. The reported steady rate implied a substantially longer backlog drain.

Using the decision record's illustrative rate of about three and a half minutes per batch, 223 batches require roughly 780 minutes, or thirteen hours, before allowing for failed work and other overhead. A two-hour limit permits only about thirty-four such batches. These are derived planning figures, with the rate held constant to explain the mismatch.

Successful records were marked for future runs to skip. Failed records remained eligible. Repeatedly reaching a deadline before enough successful marks accumulated could keep the backlog substantial even while graph-node counts increased. The useful operational observation was completed eligible documents across runs.

A marker records one stage's success. It is not automatically a transaction spanning model generation, graph writes and the marker store. A crash between effects can make retries relevant, and a graph count can rise through partial work. That is another reason to inspect the actual processed and failed counters alongside graph growth.

The following day's handover records a dedicated drain with a twenty-four-hour deadline. It reports the query-fix image deployed, ingestion reconciliation resumed and a checkpoint around batches fifteen to sixteen of 202. At that point it recorded five processed and zero failed per completed batch, with no database timeouts over 109 minutes.

That was useful progress evidence. The handover still described the drain as running. Its estimated seventeen to nineteen hours for the job was an estimate. The checkpoint does not establish that the entire backlog completed.

![The engineer moves a single handcart across a narrow lock bridge, with completed carts visible on the far bank.](/images/blog/s5e10/inline-2.png)

<p class="caption">Reliable completion marks let later work advance through a backlog. The waiting carts keep unfinished work visible.</p>

## Compare the observation windows carefully

The records contain several tempting numbers, including isolated profile timings and timings under load. They describe different measurement contexts. I have kept a headline speed multiplier out of this reconstruction because the retained summary does not supply one matched end-to-end comparison behind every quoted ratio.

The old and new observations also span different images and settings. Whole-episode concurrency changed, the query changed, and the drain deadline changed. Together they support the recorded operational direction. They do not isolate a universal effect attributable to one knob.

The distinction leaves the engineering result concrete. The inspected source shows a changed relationship match and a preserved candidate budget. The decision records a deliberate concurrency rollback. The deployment handover reports the intended image running and successful batches at a stated checkpoint. The end of the complete drain and cleanup of existing duplicates remain separate acceptance items.

## What I would carry into the next build

Profile the operation doing the work before increasing its callers. A short smoke can identify an immediate defect, while a longer run can reveal a race the smoke did not encounter. Preserve that change in evidence when the decision changes.

Treat consistency and latency as separate properties. The query fix addressed an inefficient access path. Sequential episode ingestion addressed the observed duplicate-creation window. Existing duplicate nodes still needed their own cleanup.

Give long work a realistic execution budget and an inspectable resume contract. A healthy service can spend many hours on legitimate extraction. A deadline must be understood alongside the batch rate and the way success is recorded.

Finally, follow the deployed image and completed records. A merged source change is an authoring event. A running image and a successful batch are observations from later boundaries. Keeping them connected makes the account useful to the next operator.

Another thread was unfolding alongside the backfill. The retrieval cutover had a serving flag, a new collection and responses that looked successful. The next chapter returns to that parallel July 13–14 sequence to ask which component was actually serving the query and whether its dense-retrieval path had survived the switch.

<details class="glossary" data-glossary><summary>Glossary and primary references</summary><div class="glossary-tools" hidden><label for="glossary-search">Find a term</label><div class="glossary-search-row"><input id="glossary-search" type="search"><button type="button">Clear</button></div><p role="status" aria-live="polite"></p></div><section class="glossary-term" id="term-query-plan"><h3>Query plan</h3><p>The operations the database chooses to execute a query.</p><p><a href="https://docs.falkordb.com/commands/graph.profile">Primary reference</a></p></section><section class="glossary-term" id="term-relationship-index"><h3>Relationship index</h3><p>A structure that can locate a graph relationship by an indexed property.</p><p><a href="https://falkordb.github.io/docs-staging/cypher/indexing/range-index/">Primary reference</a></p></section><section class="glossary-term" id="term-concurrency"><h3>Concurrency</h3><p>Operations allowed to overlap. Here the setting wrapped whole ingestion episodes.</p><p><a href="https://docs.python.org/3/library/asyncio-sync.html#asyncio.Semaphore">Primary reference</a></p></section><section class="glossary-term" id="term-entity-resolution"><h3>Entity resolution</h3><p>Deciding whether extracted references represent an existing graph entity.</p><p><a href="https://github.com/getzep/graphiti">Primary reference</a></p></section><section class="glossary-term" id="term-active-deadline"><h3>Active deadline</h3><p>An execution-time limit for a Kubernetes Job.</p><p><a href="https://kubernetes.io/docs/concepts/workloads/controllers/job/">Primary reference</a></p></section><section class="glossary-term" id="term-checkpoint"><h3>Checkpoint</h3><p>A bounded observation of progress, with unfinished work still visible.</p><p><a href="https://kubernetes.io/docs/concepts/workloads/controllers/job/">Primary reference</a></p></section></details>


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
<script is:inline src="/images/blog/s5e10/reader.js"></script>
