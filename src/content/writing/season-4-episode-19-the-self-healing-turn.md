---
title: "The Self-Healing Turn"
author: Ryan Duffy
pubDatetime: 2026-06-28T12:00:00Z
shippingDatetime: 2026-10-31T10:10:00Z
draft: false
episode: 19
series: 'Season 4: Building in Public — The Agent Era'
description: "The June finale: diagnosis can grow without inheriting authority to act."
tags: [rootweaver, engineering, building-in-public, season-4]
---

The June autonomy decision described an SRE service that collected alerts, gathered diagnostic context and produced a suggested explanation. The harder question was what that explanation was allowed to become.

I wanted help investigating incidents in a lab I treated as production. That did not mean giving a model permission to turn a plausible sentence into a production change. The previous chapter made alerts easier to route and act on. The season closes by making the boundary around that action more explicit.

![The established Rootweaver engineer in a grounded story setting.](/posts/s4e19/review-v2/hero-A.png)

<p class="caption">The route can open incrementally while the human retains the lever that permits action. Conceptual artwork, not a historical photograph.</p>

I owned the direction, acceptance and operational decisions. Agents assisted with implementation and review. This reconstruction follows the June 28 autonomy decision and the June 29 hardening review, distinguishing the design from the code paths I can inspect and the deployment outcomes reported at the time.

## A ladder is a plan, not a capability badge

ADR-088 describes an incremental autonomy ladder. Its prose calls it six-rung, but its table labels R0 through R6. There are seven labelled levels, including the safety foundation. More importantly, those levels do not all describe shipped capability.

| Level | Intended capability | Historical boundary |
|---|---|---|
| R0 | Redaction, input limits, rate limiting and liveness | Safety work with separate tasks and checks; avoid treating every item as one completed block |
| R1 | Typed action catalogue | A schema and action vocabulary, not an executor |
| R2 | Model-assisted triage | Described as the current operating level; hypothesis and recommendation |
| R3 | Read-only hypothesis verification | Planned safe next step with restricted reads |
| R4 | Human-approved remediation | Future execution boundary |
| R5 | Scoped supervised remediation | Future blast-radius, verification and rollback requirements |
| R6 | Learning from outcomes | Future labelled evidence and calibration work |

A free-text recommendation is useful for a person. It is a weak interface for an executor. If the model says to restart something, a separate component still needs to know which action is permitted, what object it targets, what evidence justifies it and who approved it. The action catalogue was intended to make that question typed before any execution path existed.

This was informed by other people's research, not invented in isolation. [Yinfang Chen and colleagues' STRATUS paper](https://arxiv.org/abs/2506.02009) formalises Transactional No-Regression as a safety specification for agentic reliability work. That is a useful design reference for checking whether mitigation makes a previously healthy condition worse; it is not a certification that Rootweaver implements that property. [Saurabh Jha and colleagues' ITBench](https://arxiv.org/abs/2502.05352) also makes the need for measured incident tasks concrete. Neither paper's results are Rootweaver's benchmark score.

## The safety work existed before the status caught up

The June 28 handover is a useful starting point because it does not claim a deployment. It records the autonomy decision, a security specification and work still waiting to run. An unrelated dirty checkout stood in the way of a clean implementation base. At that point, a written plan was the output.

By the June 29 reconciliation, the retained report says the first boundary-hardening work had already merged the previous day. Its tickets still appeared in Backlog and its implementation record was missing. Those observations describe different systems: code history said something had changed; the work tracker had not caught up. Neither alone described the operating result.

That mismatch led to a fresh review. The merged work's description mentioned a third security finding, but its detailed verifier transcript had been lost from temporary storage. The useful response was to inspect the paths again, rather than reconstruct a reassuring story from a missing transcript.

The review also initially inspected the wrong checkout. The handover reports that the local main tree was more than five hundred commits behind the relevant remote history. Searching it appeared to show no redaction calls. That was evidence about an old source tree, not evidence that the merged fix did nothing. Selecting the correct historical source was part of the investigation.

| Record or observation | What it could establish | What it could not establish |
|---|---|---|
| A gate specification | Intended checks and scope | That the code had run or merged |
| A merged change | Accepted source at a particular revision | Every live caller used the changed path |
| A Backlog ticket | The tracker's recorded state | That no implementation existed |
| A missing verifier transcript | An evidence-retention gap | The contents or completeness of the lost review |
| A source search | What was present in the selected tree | The state of a different revision |

I owned the acceptance and operational decisions. The historical records attribute implementation and review work to coding agents, including Codex work on the initial boundary and later collector/prompt changes. The corrective value came from checking the actual paths and reconciling the records, not treating an agent's completion sentence as the final observation.

## The useful boundary is an actual path

The design placed redaction at the end of context collection, before evidence reached the model. It also called for protected output before results were dispatched. That sounds complete when drawn as one arrow in and one arrow out.

The review found more than one route out.

The June 29 report describes an HTTP triage endpoint that could publish reasoning and result fields to Kafka without the same protection as the normal consumer path. An earlier review had not exhausted those routes. The follow-up then caught a further distinction: the engine redacted the successful model result, while the rule-based fallback did not arrive in the same protected state.

The fallback matters because it is precisely the route that runs when the preferred path is unavailable. A guard attached only to model success cannot protect output produced somewhere else. The correct question becomes which boundary every producer must cross before publishing.

<figure id="story-path" class="story-flow" data-policy-flow><h3>One engine, two publication paths</h3><div class="flow-desktop"><svg xmlns="http://www.w3.org/2000/svg" class="publish-svg" viewBox="0 0 920 390" role="img" aria-labelledby="s4e19-v2-d-title s4e19-v2-d-desc"><title id="s4e19-v2-d-title">One engine, two publication paths</title><desc id="s4e19-v2-d-desc">Two callers reach the same engine code, then cross separate Kafka publication boundaries. Model success and rule-based fallback require the same output policy. This diagram covers named Kafka fields, not every HTTP response or persistence path. Dots show direction, not live activity; no remediation executor is shown.</desc><defs><pattern id="s4e19-v2-d-grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".8" fill="#3b3f4a"/></pattern><marker id="s4e19-v2-d-arrow" viewBox="0 0 10 10" markerWidth="6" markerHeight="6" refX="9" refY="5" orient="auto"><path d="M0 0L10 5 0 10" fill="none" stroke="#a78bfa" stroke-width="1.5"/></marker></defs><style>.publish-svg{font-family:system-ui,sans-serif}.publish-svg .flow-motion{fill:none;stroke:#a78bfa;stroke-width:1.8;stroke-dasharray:3 7;animation:flowdash 1.4s linear infinite}@keyframes flowdash{to{stroke-dashoffset:-20}}.flow-paused .publish-svg .flow-motion{animation-play-state:paused}@media(prefers-reduced-motion:reduce){.publish-svg .flow-motion{animation:none}}</style><rect width="920" height="390" rx="12" fill="#141414"/><rect width="920" height="390" rx="12" fill="url(#s4e19-v2-d-grid)"/><path class="flow-motion" data-flow-edge="" d="M142 55H298" marker-end="url(#s4e19-v2-d-arrow)"/><path class="flow-motion" data-flow-edge="" d="M372 55H528" marker-end="url(#s4e19-v2-d-arrow)"/><path class="flow-motion" data-flow-edge="" d="M142 250H298" marker-end="url(#s4e19-v2-d-arrow)"/><path class="flow-motion" data-flow-edge="" d="M372 250H528" marker-end="url(#s4e19-v2-d-arrow)"/><path class="flow-motion" data-flow-edge="" d="M602 55H688V150H768" marker-end="url(#s4e19-v2-d-arrow)"/><path class="flow-motion" data-flow-edge="" d="M602 250H688V150H768" marker-end="url(#s4e19-v2-d-arrow)"/><g transform="translate(105,55)"><circle r="29" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M-14 10h28l-4-7V-4c0-17-20-17-20 0v7zM-4 15q4 8 8 0"/></g></g><text x="105" y="106" text-anchor="middle" font-size="17" font-weight="650" fill="#e9eaee">Kafka alert</text><text x="105" y="129" text-anchor="middle" font-size="13" fill="#aab0bc">Consumer caller</text><g transform="translate(335,55)"><circle r="29" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M-8 10v-5c-14-12-3-25 8-23 13 0 20 13 8 23v5zM-7 15H7M-5 19H5"/></g></g><text x="335" y="106" text-anchor="middle" font-size="17" font-weight="650" fill="#e9eaee">Triage engine</text><text x="335" y="129" text-anchor="middle" font-size="13" fill="#aab0bc">Model or fallback</text><g transform="translate(565,55)"><circle r="29" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M0-17l15 6v12c-1 9-8 14-15 17-7-3-14-8-15-17v-12z"/><path d="M-6 0l4 5 9-11"/></g></g><text x="565" y="106" text-anchor="middle" font-size="17" font-weight="650" fill="#e9eaee">Consumer guard</text><text x="565" y="129" text-anchor="middle" font-size="13" fill="#aab0bc">Protect outgoing fields</text><g transform="translate(105,250)"><circle r="29" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="-12" y="-16" width="24" height="32" rx="2"/><path d="M-6-7h12M-6 0h12M-6 7h9"/></g></g><text x="105" y="301" text-anchor="middle" font-size="17" font-weight="650" fill="#e9eaee">HTTP request</text><text x="105" y="324" text-anchor="middle" font-size="13" fill="#aab0bc">Alternate caller</text><g transform="translate(335,250)"><circle r="29" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M-8 10v-5c-14-12-3-25 8-23 13 0 20 13 8 23v5zM-7 15H7M-5 19H5"/></g></g><text x="335" y="301" text-anchor="middle" font-size="17" font-weight="650" fill="#e9eaee">Triage engine</text><text x="335" y="324" text-anchor="middle" font-size="13" fill="#aab0bc">Model or fallback</text><g transform="translate(565,250)"><circle r="29" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M0-17l15 6v12c-1 9-8 14-15 17-7-3-14-8-15-17v-12z"/><path d="M-6 0l4 5 9-11"/></g></g><text x="565" y="301" text-anchor="middle" font-size="17" font-weight="650" fill="#e9eaee">HTTP guard</text><text x="565" y="324" text-anchor="middle" font-size="13" fill="#aab0bc">Redacted result copy</text><g transform="translate(805,150)"><circle r="29" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M-18-14h36v24H0l-11 8v-8h-7zM-10-5h20M-10 2h12"/></g></g><text x="805" y="201" text-anchor="middle" font-size="17" font-weight="650" fill="#e9eaee">Kafka publisher</text><text x="805" y="224" text-anchor="middle" font-size="13" fill="#aab0bc">Delivery still needs a check</text></svg></div><div class="flow-mobile"><svg xmlns="http://www.w3.org/2000/svg" class="publish-svg" viewBox="0 0 360 935" role="img" aria-labelledby="s4e19-v2-m-title s4e19-v2-m-desc"><title id="s4e19-v2-m-title">One engine, two publication paths</title><desc id="s4e19-v2-m-desc">Two callers reach the same engine code, then cross separate Kafka publication boundaries. Model success and rule-based fallback require the same output policy. This diagram covers named Kafka fields, not every HTTP response or persistence path. Dots show direction, not live activity; no remediation executor is shown.</desc><defs><pattern id="s4e19-v2-m-grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".8" fill="#3b3f4a"/></pattern><marker id="s4e19-v2-m-arrow" viewBox="0 0 10 10" markerWidth="6" markerHeight="6" refX="9" refY="5" orient="auto"><path d="M0 0L10 5 0 10" fill="none" stroke="#a78bfa" stroke-width="1.5"/></marker></defs><style>.publish-svg{font-family:system-ui,sans-serif}.publish-svg .flow-motion{fill:none;stroke:#a78bfa;stroke-width:1.8;stroke-dasharray:3 7;animation:flowdash 1.4s linear infinite}@keyframes flowdash{to{stroke-dashoffset:-20}}.flow-paused .publish-svg .flow-motion{animation-play-state:paused}@media(prefers-reduced-motion:reduce){.publish-svg .flow-motion{animation:none}}</style><rect width="360" height="935" rx="12" fill="#141414"/><rect width="360" height="935" rx="12" fill="url(#s4e19-v2-m-grid)"/><path class="flow-motion" data-flow-edge="" d="M52 86V126" marker-end="url(#s4e19-v2-m-arrow)"/><path class="flow-motion" data-flow-edge="" d="M52 194V234" marker-end="url(#s4e19-v2-m-arrow)"/><path class="flow-motion" data-flow-edge="" d="M52 464V504" marker-end="url(#s4e19-v2-m-arrow)"/><path class="flow-motion" data-flow-edge="" d="M52 572V612" marker-end="url(#s4e19-v2-m-arrow)"/><path class="flow-motion" data-flow-edge="" d="M52 302V338H16V830H165" marker-end="url(#s4e19-v2-m-arrow)"/><path class="flow-motion" data-flow-edge="" d="M52 680V730H92V830H165" marker-end="url(#s4e19-v2-m-arrow)"/><g transform="translate(52,52)"><circle r="29" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M-14 10h28l-4-7V-4c0-17-20-17-20 0v7zM-4 15q4 8 8 0"/></g></g><text x="103" y="47" text-anchor="start" font-size="17" font-weight="650" fill="#e9eaee">Kafka alert</text><text x="103" y="70" text-anchor="start" font-size="13" fill="#aab0bc">Consumer caller</text><g transform="translate(52,160)"><circle r="29" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M-8 10v-5c-14-12-3-25 8-23 13 0 20 13 8 23v5zM-7 15H7M-5 19H5"/></g></g><text x="103" y="155" text-anchor="start" font-size="17" font-weight="650" fill="#e9eaee">Triage engine</text><text x="103" y="178" text-anchor="start" font-size="13" fill="#aab0bc">Model or fallback</text><g transform="translate(52,268)"><circle r="29" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M0-17l15 6v12c-1 9-8 14-15 17-7-3-14-8-15-17v-12z"/><path d="M-6 0l4 5 9-11"/></g></g><text x="103" y="263" text-anchor="start" font-size="17" font-weight="650" fill="#e9eaee">Consumer guard</text><text x="103" y="286" text-anchor="start" font-size="13" fill="#aab0bc">Protect outgoing fields</text><g transform="translate(52,430)"><circle r="29" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="-12" y="-16" width="24" height="32" rx="2"/><path d="M-6-7h12M-6 0h12M-6 7h9"/></g></g><text x="103" y="425" text-anchor="start" font-size="17" font-weight="650" fill="#e9eaee">HTTP request</text><text x="103" y="448" text-anchor="start" font-size="13" fill="#aab0bc">Alternate caller</text><g transform="translate(52,538)"><circle r="29" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M-8 10v-5c-14-12-3-25 8-23 13 0 20 13 8 23v5zM-7 15H7M-5 19H5"/></g></g><text x="103" y="533" text-anchor="start" font-size="17" font-weight="650" fill="#e9eaee">Triage engine</text><text x="103" y="556" text-anchor="start" font-size="13" fill="#aab0bc">Model or fallback</text><g transform="translate(52,646)"><circle r="29" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M0-17l15 6v12c-1 9-8 14-15 17-7-3-14-8-15-17v-12z"/><path d="M-6 0l4 5 9-11"/></g></g><text x="103" y="641" text-anchor="start" font-size="17" font-weight="650" fill="#e9eaee">HTTP guard</text><text x="103" y="664" text-anchor="start" font-size="13" fill="#aab0bc">Redacted result copy</text><g transform="translate(200,830)"><circle r="29" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M-18-14h36v24H0l-11 8v-8h-7zM-10-5h20M-10 2h12"/></g></g><text x="200" y="881" text-anchor="middle" font-size="17" font-weight="650" fill="#e9eaee">Kafka publisher</text><text x="200" y="904" text-anchor="middle" font-size="13" fill="#aab0bc">Delivery still needs a check</text></svg></div><div class="flow-tools"><button type="button" data-flow-motion aria-pressed="false">Pause flow</button><button type="button" data-flow-expand>Expand diagram</button></div><figcaption>Two callers reach the same engine code, then cross separate Kafka publication boundaries. Model success and rule-based fallback require the same output policy. This diagram covers named Kafka fields, not every HTTP response or persistence path. Dots show direction, not live activity; no remediation executor is shown.</figcaption></figure>
<dialog data-flow-dialog aria-label="Expanded diagram"><button type="button" data-flow-close>Close expanded diagram</button><div data-flow-expanded-content></div></dialog>
<script is:inline src="/posts/s4e19/review-v2/flow-ui.js"></script>
<script is:inline src="/posts/s4e19/review-v2/flow-motion.js"></script>

Consider a fictional incident in which a model call fails and a rule-based fallback produces a result. The strings below are invented test data with no credential value. This is a partial result shape for explanation, not a captured incident, complete API response or authorisation message.

<p class="code-source">Synthetic result before the HTTP handler's Kafka-publication boundary. Keys match the text fields copied by that handler.</p>

```json
{
  "root_cause_hypothesis": "Demo worker rejected password=EXAMPLE_ONLY",
  "recommended_action": "Inspect demo-worker logs",
  "reasoning": "Request contained password=EXAMPLE_ONLY",
  "affected_services": ["demo-worker"]
}
```

The engine's normal model-success branch called its result redactor. In the retained engine source, the fallback branch instead called rule_based_triage, recorded metrics and returned the result. Protecting the successful model branch therefore did not establish that the fallback result was protected too.

That is why the caller mattered. The ordinary consumer and the HTTP endpoint could reach the same engine, then leave through different code. The first HTTP correction covered the retained reasoning trace. The follow-up review caught the result fields as another object requiring protection, especially when generated by the fallback.

The inspected historical HTTP handler copies the result with redacted text fields before handing it to the publisher. It also separately redacts the retained reasoning trace in that publish call. This is useful evidence of the fix's structure. It does not prove that every possible secret format is recognised.

<p class="code-source">Exact fragment, dedented: sre-brain/sre_brain/health.py, triage HTTP handler, historical commit 0dd9e73b. The following publisher call also redacts the retained reasoning trace.</p>

```python
redacted_result = result.model_copy(
    update={
        "root_cause_hypothesis": redact(result.root_cause_hypothesis),
        "recommended_action": redact(result.recommended_action),
        "reasoning": redact(result.reasoning),
        "affected_services": [
            redact(service) for service in result.affected_services
        ],
    }
)
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

1. model_copy makes a modified result rather than editing the original object in place.
2. update names the fields replaced in the outgoing copy.
3. The hypothesis passes through the redactor even if it came from a fallback.
4. The recommended action receives the same treatment; it is still a recommendation.
5. The explanation is protected as another output field, rather than assuming the recommendation contains all sensitive material.
6. Every affected-service string is also passed through the redactor.
7. The copy closes here. The surrounding publisher receives this copy and a separately redacted reasoning trace.

</details>

For the synthetic input, the corresponding outgoing text fields should look like this. I checked these substitutions against the retained pure redactor with no network or model call.

<p class="code-source">Synthetic expected Kafka-result copy after the historical regex redactor. This demonstrates one recognised password pattern, not all possible sensitive content.</p>

```json
{
  "root_cause_hypothesis": "Demo worker rejected password=[REDACTED]",
  "recommended_action": "Inspect demo-worker logs",
  "reasoning": "Request contained password=[REDACTED]",
  "affected_services": ["demo-worker"]
}
```

The source also preserves a narrower boundary than “the HTTP endpoint is safe.” The corrected publisher receives redacted_result and a separately redacted retained reasoning string. The handler later returns result.model_dump(), using the original result object. The new copy does not replace that original. This inspected change establishes protection for the named Kafka publication fields; it does not establish the same policy for every HTTP response or persistence path. I have not reproduced a live disclosure, and I would not infer that one occurred from this source distinction alone.

The publisher call is also conditional on a configured producer, and its failure is caught as non-blocking. A successful HTTP response therefore cannot, by itself, prove that the Kafka event was published. The mechanism has at least three outcomes to keep separate: an assessment was returned, a protected event was assembled, and a downstream delivery succeeded.

## Context included more than the visible log lines

The collector was the input boundary: it assembled diagnostic information before the model prompt was constructed. The retained source applies redaction to ordinary logs, previous-container logs, extended logs and selected event fields. Those categories do not all have the same destination. Crash logs can also reach evidence storage even when they do not become part of the model prompt.

The follow-up found that recent changes and code-impact context needed attention too. A change author or a nested string may look harmless because the application calls it metadata. Once it is serialized into a prompt or retained evidence, it becomes another content path.

The historical collector change handles recent-change metadata selectively. It leaves commit identifiers and file lists visible and redacts the other direct string values. It uses a recursive helper for code-impact values. Those are different policies; the code does not demonstrate a universal walk over every field in every stored object.

<p class="code-source">Exact function: sre-brain/sre_brain/context/collector.py, historical commit 195b9c42. Any is a typing annotation; the function walks values, not dictionary keys.</p>

```python
def _redact_string_leaves(value: Any) -> Any:
    if isinstance(value, str):
        return redact(value)
    if isinstance(value, list):
        return [_redact_string_leaves(item) for item in value]
    if isinstance(value, dict):
        return {key: _redact_string_leaves(item) for key, item in value.items()}
    return value
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

1. The helper accepts a value whose shape may be text, a list, a dictionary or something else.
2. The first condition identifies text at the current position.
3. That string passes through the existing redactor.
4. A list needs each item examined because its contents may contain more structures.
5. Calling the helper again preserves the list while processing those nested values.
6. A dictionary needs the same treatment for its values.
7. The keys remain unchanged; each value is processed recursively.
8. Numbers, booleans and other unsupported shapes pass through unchanged. A nested email-shaped string also remains unless the called redactor is configured to remove it.

</details>

For example, a fictional code-impact value can contain a nested note with password=EXAMPLE_ONLY and a numeric count of two. The helper replaces the recognised password value while retaining the count. That is useful because the diagnostic structure survives. It is also bounded: dictionary keys are not scrubbed, and the caller must actually apply the helper to that field.

The underlying regex redactor recognises several token/password patterns. Email redaction is explicitly opt-in. The collector's default redact call does not enable that option. It would therefore be inaccurate to describe the implementation as removing all personal information or every possible secret. The tests and examples need to state which pattern they exercise.

## A delimiter in metadata could cross the prompt boundary

Input size limits and evidence tags served a different purpose from secret redaction. The engine wrapped the collected context in an evidence block and told the model to treat evidence as data. The historical source includes limits on formatted context and individual log lines. Those limits constrain input volume; they are not proof that the remaining text cannot influence the model.

The review found that sanitising only the context blob left separate template fields exposed. Event type, severity, pod and namespace were supplied independently to the skill prompt. An unexpected value in one of those strings could contain the same closing evidence marker that the context protection was meant to neutralise.

The fix applied the same delimiter replacement to those metadata fields before prompt assembly. A synthetic label containing a closing evidence marker and an instruction-shaped sentence makes the issue easier to see: the marker is untrusted input too, even if it arrives under a field called pod.

<p class="code-source">Exact function: sre-brain/sre_brain/triage/engine.py, historical commit 195b9c42. Literal replacements protect the chosen delimiter syntax.</p>

```python
def _neutralize_evidence_delimiters(value: str) -> str:
    return value.replace("[/evidence]", "[ /evidence ]").replace(
        "[evidence]", "[ evidence ]"
    )
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

1. The function takes one string before it is inserted into the prompt template.
2. A closing evidence tag is changed into spaced text, so it no longer matches that literal delimiter.
3. The opening tag receives the corresponding replacement.
4. The result is returned to the caller. The instruction-shaped words remain text; this is not a general detector or proof against all prompt injection.

</details>

A schema that rejects unexpected output fields is another useful constraint, but it does not independently verify the truth or safety of an allowed string. Input caps, delimiter handling, output shape and publication redaction address different failure mechanisms. Passing one check does not make the others redundant.

## The review changed what complete meant

The sequence of reviews changed the meaning of complete. The first protected path was useful, but an alternate caller, a fallback producer and separate prompt fields each needed their own examination.

The June 28 handover initially recorded a specification waiting for implementation. The June 29 record then reconciled the merged security work and describes the additional findings and fixes. Historical Git source supports the particular output-copy and collector changes inspected here. The report's merged and shipped statements remain historical reports; this review does not establish today's cluster state or reconstruct every original adversarial test.

The earlier report records fifty-two affected tests passing for the HTTP-publication fix. The later handover describes two adversarial review passes and the additional fixes as merged. These are historical reported checks; the fresh examples in this review run only the retained pure text helpers. They do not rerun the original integration suite or reproduce its deployment.

There were residuals too. The handover left an embed-version assertion mismatch and optional follow-ups around raw pod-detail persistence and telemetry. The earlier report was written while changes were still open; the later handover records their merged state. I keep that progression rather than silently reading the earlier report as a final deployment receipt. A broad sentence that all safety work was finished would hide that record. I would rather describe the actual inspected paths and leave the remaining questions visible.

The system was gaining a better place to form a hypothesis, not a general licence to act on it. Protecting what leaves the investigation is part of that boundary.

![Engineer secures protective covers on two cable junctions.](/posts/s4e19/review-v2/inline.png)

<p class="caption">Protect alternate output routes at the boundary rather than assuming one successful path covers them all. Conceptual artwork, not a historical photograph.</p>

## A season can close with work still open

This episode follows the work from June 28–29, then closes with June 30 to explain what was still unfinished and would carry into July. Reaching the end of the month did not mean every task was complete.

This is the right stopping point for June because the direction has changed. Earlier episodes were often about making a component run or discovering why a signal was misleading. Here the platform is beginning to say which kinds of help an agent can offer and which decisions remain separate.

The June 30 graph-ingestion handover describes fixes merged into source while the intended live backfill evidence was still pending. The first attempted backfill had failed against the deployed image, and the follow-up source fix had not yet reached that image. A successful merge and a graph populated by the corrected job were still different observations. That is a useful boundary into July, rather than a reason to describe June as a fully completed autonomy project. The next season can pick up that unfinished result without disguising it as a new problem that appeared overnight.

| What I learned | What I would do next time |
|---|---|
| A safety diagram can hide alternate callers | Enumerate HTTP, consumer, fallback and publication paths |
| A typed recommendation is not execution | Keep catalogue, verifier and executor permissions separate |
| More review can find a different class of fault | Revisit the sink, not just the previously named finding |
| A signed or merged record is bounded evidence | Check the mechanism and the operational observation separately |

Across this season, the repeated problem was reading a success signal too broadly. A build could pass before a route worked. An alert could arrive before its receiver or first action was useful. A trust check could run without stopping a release. Here, one redacted result could coexist with another output path still needing attention.

The season closes with a more practical test for agent assistance: name the evidence, follow the actual caller, state which boundary was checked and keep the decision to change production explicit. The historical autonomy ladder supplies a direction for later work. It does not let the finale claim that diagnosis has become verified cause, or that a recommendation has earned execution authority.

The human still holds the decision to change production. More useful assistance, more explicit boundaries, and work left to earn the next level is a concrete ending for June.

Next season's proposed opener, **The Job Was Green. The Graph Was Not.**, follows that ingestion thread into July, where a successful process exit was much less informative than it first looked. The July title and ordering remain editorial proposals, supported by the retained follow-up rather than a recovered Season 5 master map.


## Terms and references

<details data-glossary class="glossary"><summary>Glossary — plain-English definitions</summary><div class="glossary-tools" hidden><label for="glossary-search">Find a term</label><div class="glossary-search-row"><input id="glossary-search" type="search"><button type="button">Clear</button></div><p role="status" aria-live="polite"></p></div><section class="glossary-term"><h3>Triage</h3><p>An initial assessment of a problem, distinct from confirmed cause or repair.</p></section><section class="glossary-term"><h3>Redaction</h3><p>Removing or replacing recognised sensitive text; coverage depends on the patterns and paths inspected.</p></section><section class="glossary-term"><h3>Fallback</h3><p>An alternate response path used when the preferred method is unavailable.</p></section><section class="glossary-term"><h3>Typed action</h3><p>A recommendation expressed in a constrained vocabulary, not arbitrary shell text.</p></section><section class="glossary-term"><h3>Transactional No-Regression</h3><p>STRATUS safety specification for ensuring agentic reliability work does not regress previously healthy conditions.</p></section><section class="glossary-term"><h3>Kafka publication boundary</h3><p>The point where an event is handed to the Kafka publisher; a returned assessment does not prove downstream delivery.</p></section><section class="glossary-term"><h3>String leaf</h3><p>A text value at the end of a nested structure, such as a note inside a dictionary inside a list.</p></section><section class="glossary-term"><h3>Prompt injection</h3><p>Untrusted content attempting to influence an assistant beyond its intended role; delimiter replacement addresses one particular syntax.</p></section><section class="glossary-term"><h3>Schema</h3><p>Rules for an output shape and field types; they do not establish that the values are true.</p></section><section class="glossary-term"><h3>No-regression check</h3><p>A check that a proposed change has not broken an explicitly observed previously healthy condition.</p></section><section class="glossary-term"><h3>Execution authority</h3><p>Permission for a component to change a target system, separate from the ability to describe a possible action.</p></section><p>Primary reference: <a href="https://arxiv.org/abs/2506.02009">STRATUS by Yinfang Chen and colleagues</a>.</p></details>

<details class="source-note">
<summary>How this episode was reconstructed</summary>

This episode focuses on the safety work from June 28–29 and closes with June 30 to show what carries into July. Generated daily journal summaries were checked for coverage but do not substantiate a complete account of this arc; the relevant dated session handovers, reports and inspected historical source provide the detail. Broader native-hook, roadmap and commercial comparisons in the old draft are omitted without their own source audit. Remaining rate/liveness tasks are not all asserted complete. No full June29–30 session replay or exhaustive month inventory; research references are design context, not Rootweaver benchmark scores. The linked primary sources beside the relevant passages provide upstream attribution. The private review ledger and retained evidence distinguish historical reports, inspected code and new examples; they are not public site assets.

</details>

<script is:inline src="/posts/s4e19/review-v2/reader.js"></script>
<style is:global>
main{min-width:0}main>p:not(:has(img)){max-width:74ch}main>ul,main>ol{max-width:74ch}.eyebrow{text-transform:none;letter-spacing:.025em}.reading-progress{position:fixed;left:0;top:0;height:3px;width:0;background:var(--accent);z-index:20;pointer-events:none}.reading-tools{max-width:1160px;margin:0 auto;padding:14px 28px 0;display:flex;justify-content:flex-end;gap:8px}.reader-button,.copy-code,.expand-diagram{border:1px solid var(--border);background:var(--card);color:var(--text);padding:7px 11px;border-radius:6px;font-size:11px}.copy-code{float:right;margin-left:10px}.code-source{display:flow-root}.contents a[aria-current="location"]{color:var(--accent);font-weight:600}.reading-focus .contents{display:none}.reading-focus .page-grid{display:block;max-width:800px}.reading-focus .nav-links>a{display:none}.reading-focus .article-header{max-width:none}.diagram{position:relative}.expand-diagram{display:block;margin:12px auto 0;background:#192d46;color:#eef6ff;border-color:#5c86a6}dialog{width:min(96vw,1300px);height:92vh;max-height:92vh;padding:18px;border:1px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text)}dialog::backdrop{background:rgba(0,0,0,.8)}.dialog-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}.diagram-scroll{overflow:auto;height:calc(100% - 54px);background:#101c2d;border-radius:8px}.diagram-scroll img{width:1200px;max-width:none;border-radius:0;margin:0 auto}.sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:600px){.reading-tools{padding:12px 18px 0}.copy-code{padding:4px 7px}.dialog-head{font-size:12px}dialog{padding:10px}.diagram-scroll img{width:1000px}}
.article-header{border-left:3px solid var(--accent);padding-left:22px}.eyebrow{margin-top:25px}.page-grid{grid-template-columns:minmax(0,740px) 210px;gap:64px}.code-box{box-shadow:0 8px 22px #00000012}h2{border-bottom:0;padding-bottom:0}.caption{border-left:0;padding-left:0}@media(max-width:600px){.article-header{padding-left:15px}}
details.walkthrough{padding:0}details.walkthrough summary{padding:13px 18px;cursor:pointer;color:var(--accent);font-size:12px;font-weight:550;list-style-position:inside}details.walkthrough summary:hover{background:var(--chip)}details.walkthrough[open] summary{border-bottom:1px solid var(--border)}details.walkthrough .explanation-body{padding:14px 18px}details.walkthrough summary:focus-visible{outline-offset:-4px}@media(max-width:600px){details.walkthrough summary{padding:12px 14px}details.walkthrough .explanation-body{padding:12px 14px}}

main{min-width:0}.notebook-article table{display:block;max-width:100%;min-width:0;overflow-x:auto}.table-wrap{overflow:auto;max-width:100%}table{min-width:580px}summary{cursor:pointer}details.glossary,details.source-note{border:1px solid var(--border);border-radius:8px;padding:16px;margin:25px 0}.glossary-term{border-top:1px solid var(--border)}.glossary-tools input{font:inherit;max-width:100%}.glossary-search-row{display:flex;gap:12px}.glossary-search-row input{min-width:0}.glossary-tools button,.flow-tools button{font:inherit;padding:7px 12px}.code-source{font-size:12px}.contents{margin-top:160px}pre{overflow:auto}h3{font-size:17px}figcaption,.caption{font-size:12px}code{overflow-wrap:anywhere;white-space:normal}pre code{white-space:pre}.flow-tools{display:flex;gap:12px;margin:10px 0}.publish-flow{margin:28px 0}.publish-flow h3{margin:0 0 14px}.publish-flow figcaption{line-height:1.6;color:var(--muted,#aab0bc)}.flow-tools button,dialog button{background:#1c1e24;color:#e9eaee;border:1px solid #75608f;border-radius:6px;padding:9px 12px;cursor:pointer}.flow-mobile{display:none}.flow-desktop svg,.flow-mobile svg{display:block;width:100%;height:auto}dialog{color:var(--text);background:var(--bg);border:1px solid var(--border);max-width:min(1150px,95vw);max-height:90vh;width:95vw}dialog::backdrop{background:#000b}.asset-option{margin:38px 0}.review-links{display:flex;gap:18px;flex-wrap:wrap}@media(max-width:600px){input{font-size:16px!important}.flow-desktop{display:none}.flow-mobile{display:block}code{font-size:.88em}}
main{min-width:0}main img{width:100%;height:auto;display:block}.story-flow{margin:28px 0}.story-flow h3{margin:0 0 14px}.story-flow figcaption{font-size:12px;line-height:1.6;color:var(--muted)}.flow-mobile{display:none}.flow-desktop svg,.flow-mobile svg{display:block;width:100%;height:auto}.table-wrap{overflow-x:auto;max-width:100%}.notebook-article table{display:block;min-width:0;max-width:100%;overflow-x:auto}.notebook-article p{font-size:15px}pre{max-width:100%;overflow-x:auto}code{overflow-wrap:anywhere}pre code{white-space:pre}.asset-option{margin:35px 0}.review-links{display:flex;flex-wrap:wrap;gap:14px}summary{cursor:pointer}dialog{max-width:95vw;width:1000px;background:var(--bg);color:var(--text)}dialog::backdrop{background:#000b}@media(max-width:600px){main p,main li{font-size:14px}.flow-desktop{display:none}.flow-mobile{display:block}.glossary-search-row{display:flex;gap:8px}.glossary-search-row input{min-width:0;font-size:16px}}
</style>
<style is:global>@media(max-width:600px){.notebook-article p,.notebook-article li{font-size:14px!important}}</style>
