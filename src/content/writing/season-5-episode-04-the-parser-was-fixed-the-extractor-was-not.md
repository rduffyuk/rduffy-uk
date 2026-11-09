---
title: "The Parser Was Fixed. The Extractor Was Not."
description: "A graph backfill exposed the difference between valid JSON, the active code path and useful knowledge. Following the repair that first landed in the wrong client."
pubDatetime: 2026-07-06T12:00:00Z
shippingDatetime: 2026-11-09T08:00:00Z
author: Ryan Duffy
episode: 4
image: /images/blog/s5e04/hero-A.png
imageAlt: "The Rootweaver engineer compares a bookbinding template with actual pages in a dark conservation room."
draft: false
series: "Season 5: Rootweaver"
tags: [Rootweaver, knowledge-graphs, engineering, evaluation]
---

[Episode 3](https://rduffy.uk/writing/season-5-episode-03-the-route-had-to-reach-the-model/) followed a request until it reached a working model route. The next problem was on the other side of generation: could the output become useful knowledge? A model could answer, and its response could be valid JSON, while the graph still received nothing it could use.

I wanted to finish a backlog of documents waiting to enter Rootweaver's knowledge graph. The work initially looked like a throughput problem. The records then changed the diagnosis, exposed a repair on an unused client, and ended with a more useful decision than simply running the backlog again: keep the defensive code, but pause the backfill until its value justified another run.

![The Rootweaver engineer compares a bookbinding template with actual pages in a dark conservation room.](/images/blog/s5e04/hero-A.png)

<p class="caption">A pattern can describe the shape of a book without supplying its pages. Conceptual illustration.</p>

This chapter covers July 5–6, 2026. I owned direction, requirements, review and acceptance; agents assisted with diagnosis, implementation and checking. This is a curated reconstruction from three retained handovers and two historical source revisions, not a replay of every session. Runtime numbers below are attributed to those reports. The separately inspected code explains the mechanism. New synthetic checks help test that explanation without recreating the original deployment or calling the historical model.

## What the graph needed from the model

A document graph is built from more than an embedding. The system first needs to identify entities in a piece of text, resolve whether they refer to things already known, and prepare the resulting information for storage and search. If extraction fails before those later stages, a faster embedding service cannot repair the missing input.

Rootweaver used [Graphiti, maintained by Zep](https://github.com/getzep/graphiti), for this work. The July diagnosis identifies `graphiti-core` 0.29.2 as the installed dependency. Rootweaver supplied its own client integration; this repair did not edit Graphiti's upstream schemas. That distinction matters because the adaptation had to happen at the boundary between the model response and the values Graphiti expected.

There were two relevant response types. `ExtractedEntities` held a list of extracted things. Each item needed fields including `name`, `entity_type_id` and `episode_indices`. `NodeResolutions` held decisions about whether a proposed entity matched a candidate already in the graph. Its outer object needed an `entity_resolutions` list, with records containing `id`, `name` and `duplicate_candidate_id`.

The names are quite literal once separated. An entity is a thing the text mentions. Resolution is the attempt to recognise an existing thing rather than create another copy. The response model is the software contract for carrying those results. It is not the language model itself.

[Pydantic's model documentation](https://docs.pydantic.dev/latest/concepts/models/) explains validation against declared types and constraints. In this case, passing that validation was a necessary step toward ingestion. It was never an independent check that an entity was actually supported by the document, that two names referred to the same thing, or that adding the graph would improve an answer.

| Boundary | Question it answers | What a pass still leaves open |
|---|---|---|
| JSON decoding | Can the text be read as JSON? | Whether it has the required fields |
| Response validation | Does the value fit the expected model? | Whether the content is grounded in the document |
| Graph ingestion | Can the accepted information be processed and stored? | Whether the stored information is useful |
| Task evaluation | Does the graph improve a relevant task? | Whether that result generalises beyond the tested cases |

The original investigation crossed these boundaries in the wrong order. It saw slow embedding and initially treated throughput as the obstacle to completing the backlog. The later records show why that explanation was incomplete.

## The faster component was downstream of the failure

The earlier July 5 handover proposed using GPU embedding to speed the run. It described a remote 235B extraction route through LiteLLM and OpenRouter, with CPU embedding as the apparent bottleneck. That document is retained unchanged in the source pack because its later supersession is part of the story, rather than an inconvenient draft to discard.

Its warning and the subsequent diagnosis say that the GPU burst was executed and reverted, with the ordinary model service restored. The graph's node count nevertheless stayed at 230. Dense documents were failing extraction validation before embedding could help. One observed shape lacked the `entity_resolutions` wrapper. Another contained strings or schema-like objects where actual extracted entity records were expected.

Those are historical reports of the run. I have not recovered the complete original provider response and cluster log bundle for independent replay. The reports support the change in diagnosis; they do not establish that every document failed for one identical reason, or that embedding could never become a bottleneck after extraction was repaired.

The point was narrower and actionable: this run could not be rescued by accelerating a stage it had not successfully reached. CPU embedding could still be slow. It was simply the wrong first fix for the failing documents.

The original note also called the remote lane proven because it returned clean JSON without earlier truncation or authentication failures. Those observations can coexist with the later failure. A syntactically readable response can still violate the extraction contract. Calling the endpoint successfully and completing a graph backfill are different acceptance tests.

I needed the next change to inspect what could actually be recovered. Re-wrapping a complete result was defensible. Making up missing entities to satisfy a schema was not. The diagnosis-first handoff explicitly allowed the answer to be that the output was unrecoverable and needed a different extraction route.

## Repairing a wrapper without inventing a fact

The first recoverable case was a missing envelope. If the model had already supplied a complete node-resolution record, a client could put it inside the list that Graphiti expected. It did not need to infer a new name or choose a new duplicate candidate.

Source: `graphiti_client.py`, `_coerce_node_resolutions_output`, retained revision `99f4f215`. This exact excerpt handles a single complete record and a bare list:

```python
if _is_node_duplicate(value):
    return {"entity_resolutions": [value]}, True

if isinstance(value, list):
    coerced, _dropped, _changed = _coerce_node_duplicate_items(
        value,
        response_model_name,
    )
    return {"entity_resolutions": coerced}, True
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- The first condition asks whether the value is a dictionary containing the three required field names for a node-resolution record. It does not prove that their values are semantically correct.
- The first return adds the missing outer dictionary and makes a one-item list. The original record is retained rather than regenerated.
- `True` tells the caller that the shape changed.
- The next condition handles a list returned without its outer dictionary.
- `_coerce_node_duplicate_items` keeps dictionary items with the expected keys and counts rejected items. The underscores indicate that this caller does not use the returned count and change flag directly.
- The final return adds the expected wrapper around that filtered list. Later validation still has a job to do.

</details>

Here is a synthetic example, chosen to expose the envelope change. It is not an original model response or a real duplicate decision:

```json
{"id": 0, "name": "Rootweaver", "duplicate_candidate_id": 13}
```

After the wrapper repair, the same fields sit inside the expected list:

```json
{
  "entity_resolutions": [
    {"id": 0, "name": "Rootweaver", "duplicate_candidate_id": 13}
  ]
}
```

`id` identifies the proposed item within this example. `name` carries its supplied label. `duplicate_candidate_id` carries the supplied candidate decision. The normaliser preserves all three values. This example says nothing about whether candidate 13 exists or is the correct match. It demonstrates a recoverable structural mismatch rather than a new fact being inferred.

The helper is deliberately limited. It checks for dictionary keys before re-wrapping; it does not thoroughly validate the type and meaning of every value. A record with all required keys and a nonsensical value can survive this filter and still fail later. That is a reason to keep downstream validation, rather than describe the patch as accepting arbitrary output safely.

## A string containing an entity is different from a schema

Entity extraction needed a different adaptation. Sometimes the list contained a JSON object encoded as a string. The information was present, but packaged one level deeper than expected. [Python's `json.loads`](https://docs.python.org/3/library/json.html#json.loads) can turn that string back into a value. It cannot recover an entity that the model never supplied.

Source: `graphiti_client.py`, `_coerce_extracted_entity_items`, revision `99f4f215`. This exact loop separates those cases:

```python
for value in values:
    candidate = value
    if isinstance(value, str):
        candidate, parsed = _parse_stringified_json(value)
        changed = changed or parsed

    if _is_extracted_entity(candidate):
        coerced.append(candidate)
    else:
        dropped += 1
        changed = True
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- The loop examines each supplied list item independently.
- `candidate` initially refers to the original item. Dictionary items can therefore proceed without being encoded and decoded again.
- String items get one JSON decoding attempt. The helper catches a JSON decoding error and leaves an undecodable string as it was.
- `parsed` records whether decoding succeeded. `changed` stays true once any earlier item needed a transformation.
- `_is_extracted_entity` checks that the candidate is a dictionary with `name`, `entity_type_id` and `episode_indices` keys.
- A candidate with those keys is retained. This is a structural filter; it does not check the document for factual support.
- Anything else increments `dropped` and marks the result changed. No replacement name or entity type is invented.

</details>

Consider this synthetic extraction response. The first item contains a recoverable entity as encoded JSON. The second resembles an instruction describing a type rather than an extracted instance:

```json
{
  "extracted_entities": [
    "{\"name\":\"Graphiti\",\"entity_type_id\":1,\"episode_indices\":[0]}",
    {"type": "Object", "properties": {"name": {"type": "string"}}}
  ]
}
```

The first item decodes to an object. It has all three keys, so the filter retains it. `name` is the extracted label, `entity_type_id` is a supplied type identifier, and `episode_indices` points to the supplied episode positions associated with it. The example's `0` is just an illustrative index. The second item supplies no actual entity name or type identifier. It is dropped. The resulting response contains one candidate entity:

```json
{
  "extracted_entities": [
    {"name": "Graphiti", "entity_type_id": 1, "episode_indices": [0]}
  ]
}
```

That final object is eligible for the next validation step. It does not become true because a parser accepted it. In a real run, I would still need to inspect its relationship to the source document and the resulting graph.

<figure id="extraction-path" class="story-flow" data-policy-flow><h3>One response, two possible outcomes</h3><div class="flow-desktop"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 315" role="img" aria-label="Illustrative repaired extraction path: model response, decode, shape filter, validation, graph processing, with rejected items warned about"><defs><pattern id="grid-desktop" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arr-desktop" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="#a78bfa"/></marker></defs><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#grid-desktop)"/><path data-flow-edge class="flow-motion" d="M95 65H190" fill="none" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" marker-end="url(#arr-desktop)"/><path data-flow-edge class="flow-motion" d="M240 65H335" fill="none" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" marker-end="url(#arr-desktop)"/><path data-flow-edge class="flow-motion" d="M385 65H480" fill="none" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" marker-end="url(#arr-desktop)"/><path data-flow-edge class="flow-motion" d="M530 65H625" fill="none" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" marker-end="url(#arr-desktop)"/><path data-flow-edge class="flow-motion" d="M360 91V208" fill="none" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" marker-end="url(#arr-desktop)"/><g transform="translate(70 65)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><rect x="-9" y="-13" width="18" height="26" rx="2"/><path d="M-5-5H5M-5 1H5M-5 7H3"/></g></g><text x="70" y="111" text-anchor="middle" fill="#e9eaee" font-size="13">Model response</text><text x="70" y="131" text-anchor="middle" fill="#aab0bc" font-size="11">Supplied JSON</text><g transform="translate(215 65)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><circle cx="-6" cy="-3" r="7"/><path d="M0 2L12 14M8 10L12 6"/></g></g><text x="215" y="111" text-anchor="middle" fill="#e9eaee" font-size="13">Decode strings</text><text x="215" y="131" text-anchor="middle" fill="#aab0bc" font-size="11">Recover supplied data</text><g transform="translate(360 65)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><path d="M-14-11H14L4 2V12H-4V2Z"/></g></g><text x="360" y="111" text-anchor="middle" fill="#e9eaee" font-size="13">Filter shape</text><text x="360" y="131" text-anchor="middle" fill="#aab0bc" font-size="11">Keep required keys</text><g transform="translate(505 65)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><path d="M-12 0L-3 9L14-10"/><circle r="18"/></g></g><text x="505" y="111" text-anchor="middle" fill="#e9eaee" font-size="13">Validate</text><text x="505" y="131" text-anchor="middle" fill="#aab0bc" font-size="11">Types and constraints</text><g transform="translate(650 65)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><circle cx="0" cy="-11" r="4"/><circle cx="-12" cy="9" r="4"/><circle cx="12" cy="9" r="4"/><path d="M-2-7L-10 5M2-7L10 5M-8 9H8"/></g></g><text x="650" y="111" text-anchor="middle" fill="#e9eaee" font-size="13">Graph processing</text><text x="650" y="131" text-anchor="middle" fill="#aab0bc" font-size="11">Then inspect usefulness</text><g transform="translate(360 235)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><path d="M-7-16H7L16-7V7L7 16H-7L-16 7V-7Z M-6-6L6 6M6-6L-6 6"/></g></g><text x="360" y="281" text-anchor="middle" fill="#e9eaee" font-size="13">Reject + warn</text><text x="360" y="301" text-anchor="middle" fill="#aab0bc" font-size="11">No invented entities</text></svg></div><div class="flow-mobile"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 650" role="img" aria-label="Illustrative repaired extraction path: model response, decode, shape filter, validation, graph processing, with rejected items warned about"><defs><pattern id="grid-mobile" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arr-mobile" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="#a78bfa"/></marker></defs><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#grid-mobile)"/><path data-flow-edge class="flow-motion" d="M48 67V122" fill="none" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" marker-end="url(#arr-mobile)"/><path data-flow-edge class="flow-motion" d="M48 172V227" fill="none" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" marker-end="url(#arr-mobile)"/><path data-flow-edge class="flow-motion" d="M48 277V332" fill="none" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" marker-end="url(#arr-mobile)"/><path data-flow-edge class="flow-motion" d="M48 382V437" fill="none" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" marker-end="url(#arr-mobile)"/><path data-flow-edge class="flow-motion" d="M73 252H332V565H287" fill="none" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" marker-end="url(#arr-mobile)"/><g transform="translate(48 42)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><rect x="-9" y="-13" width="18" height="26" rx="2"/><path d="M-5-5H5M-5 1H5M-5 7H3"/></g></g><text x="90" y="38" text-anchor="start" fill="#e9eaee" font-size="13">Model response</text><text x="90" y="58" text-anchor="start" fill="#aab0bc" font-size="11">Supplied JSON</text><g transform="translate(48 147)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><circle cx="-6" cy="-3" r="7"/><path d="M0 2L12 14M8 10L12 6"/></g></g><text x="90" y="143" text-anchor="start" fill="#e9eaee" font-size="13">Decode strings</text><text x="90" y="163" text-anchor="start" fill="#aab0bc" font-size="11">Recover supplied data</text><g transform="translate(48 252)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><path d="M-14-11H14L4 2V12H-4V2Z"/></g></g><text x="90" y="248" text-anchor="start" fill="#e9eaee" font-size="13">Filter shape</text><text x="90" y="268" text-anchor="start" fill="#aab0bc" font-size="11">Keep required keys</text><g transform="translate(48 357)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><path d="M-12 0L-3 9L14-10"/><circle r="18"/></g></g><text x="90" y="353" text-anchor="start" fill="#e9eaee" font-size="13">Validate</text><text x="90" y="373" text-anchor="start" fill="#aab0bc" font-size="11">Types and constraints</text><g transform="translate(48 462)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><circle cx="0" cy="-11" r="4"/><circle cx="-12" cy="9" r="4"/><circle cx="12" cy="9" r="4"/><path d="M-2-7L-10 5M2-7L10 5M-8 9H8"/></g></g><text x="90" y="458" text-anchor="start" fill="#e9eaee" font-size="13">Graph processing</text><text x="90" y="478" text-anchor="start" fill="#aab0bc" font-size="11">Then inspect usefulness</text><g transform="translate(260 565)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><path d="M-7-16H7L16-7V7L7 16H-7L-16 7V-7Z M-6-6L6 6M6-6L-6 6"/></g></g><text x="260" y="611" text-anchor="middle" fill="#e9eaee" font-size="13">Reject + warn</text><text x="260" y="631" text-anchor="middle" fill="#aab0bc" font-size="11">No invented entities</text></svg></div><div class="flow-tools"><button type="button" data-flow-motion aria-pressed="false">Pause flow</button><button type="button" data-flow-expand>Expand diagram</button></div><figcaption>Illustrative path after the client repair. Kept items still face validation and usefulness review. Rejected items produce warnings. An empty accepted list can remain. Dots show direction, not live traffic.</figcaption></figure><dialog data-flow-dialog aria-label="Expanded extraction diagram"><button type="button" data-flow-close>Close expanded diagram</button><div data-flow-expanded-content></div></dialog><script is:inline src="/images/blog/s5e04/flow-ui.js"></script><script is:inline src="/images/blog/s5e04/flow-motion.js"></script>

The diagram follows one illustrative response through the intended repaired boundary. It omits network retries, relation extraction, database transactions and retrieval. Its dots show direction, not observed traffic. The branch to rejection is essential: an empty list after filtering can be a correctly handled failure to extract anything useful.

When all items are dropped, the retained code emits a second warning explaining that the model returned schema-like or non-entity output and suggesting enforced structured output or a conformant model. That warning is evidence of the client's diagnosis, not a universal certification of a named alternative. Current [OpenRouter structured-output documentation](https://openrouter.ai/docs/guides/features/structured-outputs) explains the provider and model support involved. It is useful background, not proof of what a particular provider enforced in July.

## The first fix passed while the application used another client

The first implementation landed at revision `1340daf8`. It added the normalisation helpers and invoked them inside `GuidedJSONOpenAIClient`. The July 6 handover reports a passing verifier and then records the discovery that this class was a retired path. The retained source makes the wiring problem inspectable: the constructor still instantiated `OpenAIGenericClient`.

A helper can be correct for the input it receives and still have no effect on the application if the application never calls it. Testing the guided client demonstrated behaviour on that client. It did not demonstrate that `GraphitiClient.initialize` selected it for the running integration.

![The engineer traces a taut theatre cable beside a disconnected drum beneath a stage.](/images/blog/s5e04/active-path.png)

<p class="caption">The repair needed to follow the connected mechanism. The unused drum represents the retired client, not a second production system. Conceptual illustration.</p>

This is where the second change matters. Revision `99f4f215` introduced `CoercingOpenAIGenericClient`, a subclass of the generic client already used by the application. The constructor changed to instantiate that subclass. The response adaptation then happened after the parent returned its result and before Graphiti's later validation consumed it.

The historical source keeps the normalisation narrow. It checks the requested response model name and handles `NodeResolutions` and `ExtractedEntities`. Other models pass through. Turning `GRAPHITI_COERCE_STRUCTURED_OUTPUT` off also returns the original result. This switch controls the compatibility adaptation; it does not switch off Graphiti's need for valid data.

Source: `graphiti_client.py`, `CoercingOpenAIGenericClient.generate_response`, revision `99f4f215`. This exact excerpt is the response-selection part, after the parent call:

```python
if not _structured_output_coercion_enabled() or response_model is None:
    return result

model_name = _response_model_name(response_model)
if model_name == "NodeResolutions":
    coerced, changed = _coerce_node_resolutions_output(result)
elif model_name == "ExtractedEntities":
    coerced, changed = _coerce_extracted_entities_output(result)
else:
    return result

return coerced if changed else result
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- The first condition preserves the parent result when adaptation is disabled or no response model was requested.
- `_response_model_name` extracts the requested contract's name. It does not inspect or classify the document.
- Node-resolution responses go to the wrapper and item filter described earlier.
- Entity-extraction responses go to the string-decoding and entity filter.
- An unrelated response model returns unchanged, keeping this patch from rewriting other kinds of output.
- The final return uses the adapted value only when a helper reports a change. An already conforming response keeps the original object.

</details>

The constructor is the crucial connection. Source: `GraphitiClient.initialize`, same revision, exact excerpt:

```python
llm_client = CoercingOpenAIGenericClient(
    config=llm_config, max_tokens=graphiti_max_tokens
)
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- `llm_client` is the object passed onward into the Graphiti integration.
- Instantiating the new subclass puts the compatibility behaviour on the client's real construction path.
- `config` carries the language-model client configuration. `max_tokens` is forwarded explicitly; this change does not create a new model or improve its extraction quality.
- This constructor evidence distinguishes the second repair from merely adding another tested helper.

</details>

The rehome test file reflected that boundary. It included wrapper recovery, encoded entity recovery, the off switch, conforming-value identity, unrelated-model pass-through and forwarding of call arguments. It also initialised `GraphitiClient` with substituted dependencies and inspected which client it built. That last check was especially useful because it addressed the mistake the first implementation had missed.

These are controlled unit tests with fake responses and recording dependencies. They can establish the chosen client type and the transformation of supplied values. They cannot prove provider compliance, original cluster rollout, graph quality or the usefulness of a full backfill. The dated handover reports the historical verifier passes; the source pack separates that report from the new isolated checks used for this draft.

## A crash-free probe still gave a reason to stop

The July 6 handover records a small live probe after the rehome. It says the adaptation was firing on the active path, there were no Pydantic crashes in that probe, and `document_knowledge` grew from 230 to 242 nodes. It also reports 163 dropped entities described as schema-echo output. The backfill was then parked.

| Reported observation | Supported reading | Tempting conclusion it does not support |
|---|---|---|
| Coercion warning appeared | The adaptation was being exercised in the reported probe | Every graph call used the repaired client |
| Zero Pydantic crashes | No such crash was reported during that probe | All possible malformed responses are handled |
| 230 → 242 nodes | Net graph-node count rose by 12 | Twelve independently verified correct facts |
| 163 dropped items | The filter rejected a substantial amount of reported output | An extraction accuracy percentage |
| Backfill parked | The full run was paused as a deliberate decision | Graph ingestion was abandoned permanently |

There is no valid accuracy calculation from those two counts. Dropped output items and net new graph nodes are different units. Resolution can merge candidates, multiple documents can mention the same thing, and the retained handover does not provide a complete denominator of attempted documents, extracted entities or adjudicated ground truth.

![The engineer pauses an orchard packing table to inspect sound fruit and a separate reject bin.](/images/blog/s5e04/quality-stop.png)

<p class="caption">Keeping the line moving is useful only when the accepted output deserves to move forward. The scene represents the decision to inspect yield before resuming the backlog. Conceptual illustration.</p>

The probe therefore supported a limited engineering improvement: the system could handle some structural failures without crashing, and some graph growth was reported. It also exposed the cost of calling that a completed extraction repair. Dropping invalid entries can turn a hard error into an apparently successful empty result. A quiet process needs a measure of what it preserved and what it rejected.

The handover brought a previous graph-enrichment comparison back into the decision. Its summary argued that the benefit had not justified the cost at the graph's then-small size. I have not independently recovered the original comparison's full dataset and method for this chapter, so I am not turning its quoted size threshold or speed ratio into a general rule. What is supported here is that the prior result informed the decision to stop spending on an automatic rerun.

That was a change from the July 5 carry-forward instruction to rerun once the coercion fix landed. The later evidence changed what “unblocked” meant. The code path could be repaired while the operational choice remained unresolved. Another model or stricter generation route might produce better candidates, but that was a proposal to evaluate, not an outcome this chapter can claim.

## What I would keep from the work

First, I would follow one failing document through the actual sequence before accelerating a component. A backlog is a symptom. Knowing that embedding is slow is useful, but the first failed boundary decides whether that speed is relevant to the current failure.

Second, I would test where an adaptation is attached. The first change's helpers were not the whole feature. The factory or constructor that selected the live client was part of its correctness contract. A small construction-path assertion could catch a mistake that many detailed transformation tests would leave intact.

Third, I would keep structural recovery conservative. Adding a missing wrapper or decoding a supplied JSON string preserves information. Inventing entity names to make a response pass validation changes the evidence. When the response contains a description of a schema rather than an instance, rejection with an inspectable warning is more useful than a fabricated success.

Fourth, I would report output quality separately from exception handling. For a future controlled run, I would retain the document set, model and provider route, raw responses under the appropriate privacy boundary, input counts, rejection reasons, accepted candidates and reviewed examples. Then I could ask whether the resulting graph improved a task, rather than treat node growth alone as the objective.

Finally, I would make stopping a legitimate result. The defensive client change remained useful. The larger backfill still needed a reason to proceed. Keeping those decisions separate let the repair stand without committing more resources to output that the available probe did not justify trusting.

## What comes next

The same July 6 handover describes another problem: previous decisions existed in memory, but the working process did not consistently consult them before searching again. That is the next thread I would follow: making existing evidence easier to find before repeating an expensive investigation. The retained record establishes the motivation and a proposed enforcement mechanism. It does not yet establish sustained adoption or a measured improvement in later work.

<details data-glossary class="glossary"><summary>Glossary — plain-English definitions</summary><div class="glossary-tools" hidden><label for="glossary-search">Find a term</label><div class="glossary-search-row"><input id="glossary-search" type="search"><button type="button">Clear</button></div><p role="status" aria-live="polite"></p></div><section class="glossary-term" id="term-backfill"><h3>Backfill</h3><p>Processing an existing backlog so older documents enter a newer or repaired pipeline. <a href="https://github.com/getzep/graphiti">Official reference</a>.</p></section><section class="glossary-term" id="term-entity"><h3>Entity</h3><p>A named thing extracted from text; being extracted does not prove it is correct. <a href="https://github.com/getzep/graphiti">Official reference</a>.</p></section><section class="glossary-term" id="term-entity-resolution"><h3>Entity resolution</h3><p>Deciding whether a new mention matches something already known. <a href="https://github.com/getzep/graphiti">Official reference</a>.</p></section><section class="glossary-term" id="term-json"><h3>JSON</h3><p>A text format for values such as objects, lists, strings and numbers. <a href="https://docs.python.org/3/library/json.html">Official reference</a>.</p></section><section class="glossary-term" id="term-schema"><h3>Schema</h3><p>A description of the structure and constraints expected of data. <a href="https://json-schema.org/understanding-json-schema">Official reference</a>.</p></section><section class="glossary-term" id="term-schema-echo"><h3>Schema echo</h3><p>Here, output describing a data type instead of supplying an instance from the document. <a href="https://json-schema.org/understanding-json-schema">Official reference</a>.</p></section><section class="glossary-term" id="term-coercion"><h3>Coercion</h3><p>Here, conservative normalisation such as adding a wrapper or decoding supplied JSON; it does not invent missing facts. <a href="https://docs.python.org/3/library/json.html">Official reference</a>.</p></section><section class="glossary-term" id="term-pydantic"><h3>Pydantic</h3><p>A Python library for validating values against declared models, types and constraints. <a href="https://docs.pydantic.dev/latest/concepts/models/">Official reference</a>.</p></section><section class="glossary-term" id="term-response-model"><h3>Response model</h3><p>The software contract for a response; distinct from the language model that generates it. <a href="https://docs.pydantic.dev/latest/concepts/models/">Official reference</a>.</p></section><section class="glossary-term" id="term-subclass"><h3>Subclass</h3><p>A class extending another class; the repaired client keeps the parent call and adapts selected results. <a href="https://docs.python.org/3/tutorial/classes.html#inheritance">Official reference</a>.</p></section><section class="glossary-term" id="term-active-path"><h3>Active path</h3><p>The code the application actually constructs and calls, rather than another available implementation. <a href="https://docs.python.org/3/tutorial/classes.html">Official reference</a>.</p></section><section class="glossary-term" id="term-synthetic-probe"><h3>Synthetic probe</h3><p>A deliberately supplied test input, useful for checking a mechanism but not a replay of historical traffic. <a href="https://docs.pytest.org/en/stable/how-to/monkeypatch.html">Official reference</a>.</p></section><section class="glossary-term" id="term-structured-output"><h3>Structured output</h3><p>Generation constrained to a requested structure when supported and enforced by the chosen route. <a href="https://openrouter.ai/docs/guides/features/structured-outputs">Official reference</a>.</p></section><section class="glossary-term" id="term-embedding"><h3>Embedding</h3><p>A numerical representation used for similarity search; accelerating it does not repair an earlier extraction failure. <a href="https://huggingface.co/blog/getting-started-with-embeddings">Official reference</a>.</p></section></details>

## Sources and reconstruction limits

The source inventory and claim ledger retained with this draft link the retained July 5 burst handover, its later diagnosis and the July 6 outcome report, along with the two historical implementations and their tests. The superseded handover remains unchanged as a comparison reference. Historical private source is inspectable in this review package; upstream project links above credit the public maintainers and explain the concepts without suggesting Rootweaver's private code is public.

This selection covers the graph-extraction thread, not every activity on those days. Unrelated operational work, the separate memory-tool implementation and private projects are omitted. Complete original provider output, a reproducible historical probe bundle and the original graph-benefit benchmark are not available here. Those gaps limit the claims; they are not filled by current documentation, a reconstructed payload or a passing local check.

<script is:inline src="/images/blog/s5e04/reader.js"></script>
<style is:global>main{min-width:0}main>p:not(:has(img)){max-width:74ch}main>ul,main>ol{max-width:74ch}.eyebrow{text-transform:none;letter-spacing:.025em}.reading-progress{position:fixed;left:0;top:0;height:3px;width:0;background:var(--accent);z-index:20;pointer-events:none}.reading-tools{max-width:1160px;margin:0 auto;padding:14px 28px 0;display:flex;justify-content:flex-end;gap:8px}.reader-button,.copy-code,.expand-diagram{border:1px solid var(--border);background:var(--card);color:var(--text);padding:7px 11px;border-radius:6px;font-size:11px}.copy-code{float:right;margin-left:10px}.code-source{display:flow-root}.contents a[aria-current="location"]{color:var(--accent);font-weight:600}.reading-focus .contents{display:none}.reading-focus .page-grid{display:block;max-width:800px}.reading-focus .nav-links>a{display:none}.reading-focus .article-header{max-width:none}.diagram{position:relative}.expand-diagram{display:block;margin:12px auto 0;background:#192d46;color:#eef6ff;border-color:#5c86a6}dialog{width:min(96vw,1300px);height:92vh;max-height:92vh;padding:18px;border:1px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text)}dialog::backdrop{background:rgba(0,0,0,.8)}.dialog-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}.diagram-scroll{overflow:auto;height:calc(100% - 54px);background:#101c2d;border-radius:8px}.diagram-scroll img{width:1200px;max-width:none;border-radius:0;margin:0 auto}.sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:600px){.reading-tools{padding:12px 18px 0}.copy-code{padding:4px 7px}.dialog-head{font-size:12px}dialog{padding:10px}.diagram-scroll img{width:1000px}}
.article-header{border-left:3px solid var(--accent);padding-left:22px}.eyebrow{margin-top:25px}.page-grid{grid-template-columns:minmax(0,740px) 210px;gap:64px}.code-box{box-shadow:0 8px 22px #00000012}h2{border-bottom:0;padding-bottom:0}.caption{border-left:0;padding-left:0}@media(max-width:600px){.article-header{padding-left:15px}}
details.walkthrough{padding:0}details.walkthrough summary{padding:13px 18px;cursor:pointer;color:var(--accent);font-size:12px;font-weight:550;list-style-position:inside}details.walkthrough summary:hover{background:var(--chip)}details.walkthrough[open] summary{border-bottom:1px solid var(--border)}details.walkthrough .explanation-body{padding:14px 18px}details.walkthrough summary:focus-visible{outline-offset:-4px}@media(max-width:600px){details.walkthrough summary{padding:12px 14px}details.walkthrough .explanation-body{padding:12px 14px}}

main{min-width:0}.notebook-article table{display:block;max-width:100%;min-width:0;overflow-x:auto}.table-wrap{overflow:auto;max-width:100%}table{min-width:580px}summary{cursor:pointer}details.glossary,details.source-note{border:1px solid var(--border);border-radius:8px;padding:16px;margin:25px 0}.glossary-term{border-top:1px solid var(--border)}.glossary-tools input{font:inherit;max-width:100%}.glossary-search-row{display:flex;gap:12px}.glossary-search-row input{min-width:0}.glossary-tools button,.flow-tools button{font:inherit;padding:7px 12px}.code-source{font-size:12px}.contents{margin-top:160px}pre{overflow:auto}h3{font-size:17px}figcaption,.caption{font-size:12px}code{overflow-wrap:anywhere;white-space:normal}pre code{white-space:pre}.flow-tools{display:flex;gap:12px;margin:10px 0}.publish-flow{margin:28px 0}.publish-flow h3{margin:0 0 14px}.publish-flow figcaption{line-height:1.6;color:var(--muted,#aab0bc)}.flow-tools button,dialog button{background:#1c1e24;color:#e9eaee;border:1px solid #75608f;border-radius:6px;padding:9px 12px;cursor:pointer}.flow-mobile{display:none}.flow-desktop svg,.flow-mobile svg{display:block;width:100%;height:auto}dialog{color:var(--text);background:var(--bg);border:1px solid var(--border);max-width:min(1150px,95vw);max-height:90vh;width:95vw}dialog::backdrop{background:#000b}.asset-option{margin:38px 0}.review-links{display:flex;gap:18px;flex-wrap:wrap}@media(max-width:600px){input{font-size:16px!important}.flow-desktop{display:none}.flow-mobile{display:block}code{font-size:.88em}}
main{min-width:0}main img{width:100%;height:auto;display:block}.story-flow{margin:28px 0}.story-flow h3{margin:0 0 14px}.story-flow figcaption{font-size:12px;line-height:1.6;color:var(--muted)}.flow-mobile{display:none}.flow-desktop svg,.flow-mobile svg{display:block;width:100%;height:auto}.table-wrap{overflow-x:auto;max-width:100%}.notebook-article table{display:block;min-width:0;max-width:100%;overflow-x:auto}main p{font-size:15px}pre{max-width:100%;overflow-x:auto}code{overflow-wrap:anywhere}pre code{white-space:pre}.asset-option{margin:35px 0}.review-links{display:flex;flex-wrap:wrap;gap:14px}summary{cursor:pointer}dialog{max-width:95vw;width:1000px;background:var(--bg);color:var(--text)}dialog::backdrop{background:#000b}@media(max-width:600px){main p,main li{font-size:14px}.flow-desktop{display:none}.flow-mobile{display:block}.glossary-search-row{display:flex;gap:8px}.glossary-search-row input{min-width:0;font-size:16px}}
.story-flow{background:#141414;border:1px solid #3b3f4a;border-radius:10px;padding:16px}.story-flow h3{color:#e9eaee}.story-flow figcaption{color:#aab0bc}.story-flow svg{border-radius:5px}.flow-tools{display:flex;gap:10px;margin-top:10px}.flow-tools button{background:#1c1e24;color:#e9eaee;border:1px solid #555867;border-radius:5px;padding:6px 10px}.flow-motion{animation:s5e03-dots 1.4s linear infinite;stroke-dasharray:3 7}.flow-paused .flow-motion{animation-play-state:paused}@keyframes s5e03-dots{to{stroke-dashoffset:-20}}@media(prefers-reduced-motion:reduce){.flow-motion{animation:none}}.article-meta{font-size:12px}.review-links{font-size:13px}.notebook-article li{font-size:15px}@media(max-width:600px){.notebook-article li{font-size:14px}}
img{max-width:100%;height:auto!important;object-fit:contain}.notebook-article p,.notebook-article li{font-size:15px;line-height:1.75}.story-flow text{font-family:system-ui,sans-serif}.story-flow{margin:26px 0}.source-label{font-size:12px;color:var(--muted,#888)}@media(max-width:600px){.notebook-article p,.notebook-article li{font-size:14px}}</style>
<style is:global>.notebook-article p,.notebook-article li{font-size:15px}@media(max-width:600px){.notebook-article p,.notebook-article li{font-size:14px!important}}</style>
