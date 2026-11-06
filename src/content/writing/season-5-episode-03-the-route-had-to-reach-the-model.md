---
title: "The Route Had to Reach the Model"
description: "More local context meant little until requests reached a working path. Following the router, its override, an empty-result cache and the evidence used to tune them."
pubDatetime: 2026-07-03T12:00:00Z
shippingDatetime: 2026-11-06T20:52:53Z
author: Ryan Duffy
episode: 3
image: /posts/s5e03/review-v1/hero-A.png
imageAlt: "The Rootweaver engineer inspects railway points beside a junction at dusk."
draft: false
series: "Season 5: Rootweaver"
tags: [Rootweaver, RAG, engineering, observability]
---

[Episode 2](https://rduffy.uk/writing/season-5-episode-02-the-smaller-model-had-to-earn-its-place/) ended with a useful mismatch. The smaller local model had a larger configured context window, but the application still carried routing assumptions from the previous deployment. More room on the graphics card did not mean the requests that needed it would arrive there.

I wanted the platform to use the capacity I had already made available. That meant following a request beyond the model endpoint: which agent would receive it, whether another branch could override that choice, what happened when retrieval failed, and what the next identical request would see. Changing a threshold was only one part of that work.

![The Rootweaver engineer inspects railway points beside a junction at dusk.](/posts/s5e03/review-v1/hero-A.png)

<p class="caption">The route has to connect to the capacity it promises. Conceptual illustration.</p>

This chapter covers July 2–3, 2026. I owned the direction, requirements, review and acceptance decisions; coding agents assisted with diagnosis, implementation and checking. The dated handovers describe the original runtime observations. For this reconstruction I separately inspected the historical router, Oracle, cache, gateway metrics and deployment configuration. The new checks use isolated code and synthetic inputs. They do not recreate the original traffic or repeat the model benchmark.

## The model was one stop along the request

A request to my search gateway did not go straight to a language model. In automatic mode, a router first estimated the query's complexity. It selected an agent, and that agent performed its own retrieval and processing. Oracle was the synthesis lane: it gathered evidence and asked a model to produce an answer from it. Deep followed a different retrieval path. A fan-out branch could invoke parallel searches for medium-complexity requests.

These are application roles, not separate human team members. The same underlying model service could participate in more than one role. A working generation endpoint therefore proved much less than a working search request. The gateway still needed a valid model name, the agent needed its dependencies, and the router needed to send the right work to that agent.

The overnight handover reports that Oracle had been effectively unavailable behind an old gateway image, dead model defaults and an inactive Ollama path. It then records a newer image, a working local model route and an observed synthesis. That is a historical account of the repair. The retained source lets me inspect the contracts involved, but cannot independently reproduce the old deployment state.

There was a second visibility problem. A broken classifier had fallen back to keyword heuristics that rarely assigned the scores which selected Oracle. A lane could be present and useful in direct tests while receiving very little ordinary traffic. The handover's traffic reconstruction put fast search at roughly 69% of about 134 searches since mid-June, with Oracle's small share largely associated with testing that day. That small, historical sample is context for the investigation, not a general demand forecast.

I needed to distinguish three questions: could the model answer, could Oracle assemble a useful answer, and did automatic routing actually choose it? Each needs evidence from a different boundary.

## Two thresholds, doing different jobs

The previous episode's context problem concerned the overflow threshold inside Oracle. Once retrieval had assembled a prompt, the agent estimated its token count. Inputs above a configured limit could be sent to a hosted model, provided the required credential was available. This is separate from the complexity threshold which chooses Oracle in the first place.

The inspected July 3 deployment configured these settings. The table names their different jobs so that changing one does not imply the others changed with it.

| Setting | Historical value | What it controlled |
|---|---:|---|
| `ORACLE_OVERFLOW_THRESHOLD_TOKENS` | 100,000 | Estimated full-prompt input above which the hosted route could be selected |
| `ORACLE_COMPLEXITY_THRESHOLD` | 5 | Complexity score at which normal selection entered Oracle |
| `ENABLE_FAN_OUT` | `false` | Whether the async medium-band override could run |
| `EMBED_TIMEOUT` | 300 seconds | How long the embedding client could wait for the slower retrieval work |

The source for the first decision is `OracleAgent` in `oracle_agent.py` at historical platform revision `9dbd25a1`. This is an exact excerpt from its synthesis path:

```python
route_to_haiku = (
    self._overflow_enabled
    and estimated_input_tokens > self._overflow_threshold_tokens
)
selected_model = (
    self._haiku_model if route_to_haiku else self._resolve_local_model()
)
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- `route_to_haiku` is the decision the agent will use for this synthesis request.
- `_overflow_enabled` must be true. In this implementation that depends on a configured API key; a threshold alone does not enable the route.
- The input estimate must be strictly greater than the configured threshold. An estimate equal to 100,000 does not take this branch.
- `selected_model` records the hosted model when that condition holds. Otherwise it resolves the local model name.
- The code uses an estimate of the full assembled prompt, not simply the number of tokens in the user's question. Later code makes the selected call and records its outcome.

</details>

Oracle constructed that prompt from the query, retrieved context and its instructions before counting it. The local branch requested at most 1,024 output tokens in the inspected source. A 100,000-token estimated input threshold and the earlier 114,688-token serving ceiling therefore had different meanings. The gap left room for output and estimation error; it did not establish that every long prompt would be accurate or fit under every tokenizer.

The overnight record says the missing hosted-route credential was added to the gateway namespace, and its final configuration includes the 100,000-token threshold. That supports a reported configuration change and route availability. It does not supply a new, long-input quality benchmark. Nor does it demonstrate that a hosted request was made for every overflow case. The code and configuration explain when it could happen.

The distinction matters practically: increasing local capacity can reduce unnecessary fallback, but only after the application policy changes. Widening that policy still needs task tests. The previous episode's planted-detail probes were useful evidence about those probes, not permission to treat all large requests as solved.

## The selection rule had another rule after it

The complexity threshold lived in `UnifiedAgentRouter`. Its default remained seven, preserving the old selection behaviour unless deployment configuration overrode it. The helper parsed the environment value, fell back to the default for invalid text and clamped valid integers between four and eight.

That clamp protected the surrounding bands. Scores below four belonged to fast search; nine and ten had earlier specialist branches. Allowing an Oracle threshold outside that range would collide with those assumptions or leave Oracle unreachable through ordinary scoring. This was a bounded configuration mechanism, not a learned optimisation policy.

The important part of `_select_agent` is below. This is an exact excerpt at `9dbd25a1`; a preceding branch handles graph-specific sentinel queries separately.

```python
if complexity >= 10:
    return AgentType.WORK_UNTIL_COMPLETE, "Autonomous multi-step task"
elif complexity == 9:
    return AgentType.CODE, "Code generation/debugging task"
elif complexity >= _oracle_complexity_threshold():
    return AgentType.ORACLE, f"Deep research (complexity={complexity})"
elif complexity >= 4:
    return AgentType.DEEP, f"Semantic analysis (complexity={complexity})"
else:
    return AgentType.FAST, f"Simple lookup (complexity={complexity})"
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- The first branch reserves scores ten and above for the multi-step agent. Its name describes a route, not proof that a task completes.
- The next branch reserves score nine for the code agent.
- The helper supplies the current Oracle threshold. At five, scores five through eight reach this branch before the lower bands are considered.
- Score four still reaches Deep because it is below five but at least four.
- Lower ordinary scores select fast search.
- The returned pair contains the selected agent and a readable reason. The Oracle reason still says “Deep research”; the text alone is an unsafe way to identify the actual selected agent.

</details>

Reading this function alone would suggest that setting the threshold to five was enough. The async method did something else immediately after selection. When fan-out was enabled and the score was between four and six, it invoked the fan-out path and returned that result before the ordinary agent lookup.

This exact excerpt comes from `search_async` in the same historical file:

```python
fan_out_enabled = os.getenv("ENABLE_FAN_OUT", "true").lower() == "true"
if fan_out_enabled and 4 <= complexity <= 6:
    logger.info(
        f"Fan-out search for complexity={complexity}: {query[:80]}"
    )
    result = await self.fan_out_search_async(
        query, n_results=n_results, verbose=verbose, **kwargs
    )
    routing_time = time.time() - start_time
    self._update_stats(agent_type, complexity, routing_time)
    return result
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- The environment value enables fan-out only when its lowercased text is `true`; the default is enabled.
- The score must also be within the inclusive four-to-six band.
- The logger records entry into this branch. That is evidence of selection, not of a useful answer.
- `await` waits for the fan-out operation and captures its result.
- The method records elapsed time and updates statistics using the previously selected agent variable.
- `return result` exits here. The normal lookup of the selected agent below this block does not execute.

</details>

That early return explains why the repair needed both settings. The threshold selected Oracle for five and six; disabling fan-out allowed that selection to reach Oracle's ordinary call path. A configuration review limited to the threshold would have missed the competing control.

| Ordinary score | Default threshold 7, fan-out enabled | Threshold 5, fan-out disabled |
|---|---|---|
| 0–3 | Fast | Fast |
| 4 | Fan-out overrides Deep | Deep |
| 5–6 | Fan-out overrides Deep | Oracle |
| 7–8 | Oracle | Oracle |
| 9 | Code | Code |
| 10 | Multi-step selection | Multi-step selection |

This table deliberately corrects the early ADR's broader wording about moving the whole four-to-six band to Oracle. The actual threshold of five leaves four on Deep, and the retained threshold tests explicitly assert that. A historical design explanation can be useful while still containing an error. Preserving it as a source does not require repeating its mistake.

## Follow one request through the decision

Here is a synthetic decision fixture. It describes the inputs to the relevant branches, not an actual API payload and not a captured July request. I supply the complexity score to isolate routing; this example does not test whether the classifier assigns that score correctly.

```json
{
  "query": "Compare two designs using the retrieved engineering notes",
  "classifier_score": 5,
  "oracle_complexity_threshold": 5,
  "fan_out_enabled": false,
  "estimated_full_prompt_tokens": 60000,
  "overflow_threshold_tokens": 100000,
  "hosted_route_enabled": true
}
```

A score of five passes the configured Oracle threshold. Fan-out is disabled, so the async override does not intercept it. Oracle retrieves its evidence and assembles a prompt. With an estimated 60,000 input tokens, the hosted-route condition is false and synthesis stays local. This explains how the extra capacity from Episode 2 could become reachable through the application.

Change only `fan_out_enabled` to true and the earlier override takes the request, even though `_select_agent` chose Oracle. Change only the score to four, keeping fan-out disabled, and the request selects Deep. Change only the estimated prompt to 100,001 tokens, with the hosted route enabled, and Oracle selects the hosted model. If the credential is absent, that condition stays false; the caller does not acquire an unlimited local window instead.

<figure id="request-path" class="story-flow" data-policy-flow><h3>A score-five request, followed through</h3><div class="flow-desktop"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 350" role="img" aria-label="Synthetic score-five request: override disabled, Oracle, token decision, local model and result"><defs><pattern id="dots-desktop" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arrow-desktop" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10" fill="none" stroke="#a78bfa"/></marker></defs><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#dots-desktop)"/><path data-flow-edge class="flow-motion" d="M137 65H333" stroke="#a78bfa" fill="none" stroke-width="1.7" marker-end="url(#arrow-desktop)"/><path data-flow-edge class="flow-motion" d="M387 65H583" stroke="#a78bfa" fill="none" stroke-width="1.7" marker-end="url(#arrow-desktop)"/><path data-flow-edge class="flow-motion" d="M655 65H700V235H637" stroke="#a78bfa" fill="none" stroke-width="1.7" marker-end="url(#arrow-desktop)"/><path data-flow-edge class="flow-motion" d="M583 235H387" stroke="#a78bfa" fill="none" stroke-width="1.7" marker-end="url(#arrow-desktop)"/><path data-flow-edge class="flow-motion" d="M333 235H137" stroke="#a78bfa" fill="none" stroke-width="1.7" marker-end="url(#arrow-desktop)"/><g transform="translate(110 65)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.6" fill="none"><rect x="-11" y="-14" width="22" height="28" rx="2"/><path d="M-6-6H6M-6 0H6M-6 6H3"/></g></g><text x="110" y="114" text-anchor="middle" fill="#e9eaee" font-family="sans-serif" font-size="14">Request</text><text x="110" y="135" text-anchor="middle" fill="#aab0bc" font-family="sans-serif" font-size="12">Supplied score: 5</text><g transform="translate(360 65)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.6" fill="none"><path d="M-15-8H-2L13 8M-15 8H-2L13-8"/><circle cx="-15" cy="-8" r="2"/><circle cx="13" cy="8" r="2"/></g></g><text x="360" y="114" text-anchor="middle" fill="#e9eaee" font-family="sans-serif" font-size="14">Async override</text><text x="360" y="135" text-anchor="middle" fill="#aab0bc" font-family="sans-serif" font-size="12">Fan-out disabled</text><g transform="translate(610 65)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.6" fill="none"><path d="M-7 10V4C-20-9-7-20 0-17 14-17 19-4 7 4v6zM-6 15H6"/></g></g><text x="610" y="114" text-anchor="middle" fill="#e9eaee" font-family="sans-serif" font-size="14">Oracle</text><text x="610" y="135" text-anchor="middle" fill="#aab0bc" font-family="sans-serif" font-size="12">Retrieve + assemble</text><g transform="translate(610 235)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.6" fill="none"><path d="M-14-13V14H15M-7 8V0M1 8V-8M9 8V-3"/></g></g><text x="610" y="284" text-anchor="middle" fill="#e9eaee" font-family="sans-serif" font-size="14">Token decision</text><text x="610" y="305" text-anchor="middle" fill="#aab0bc" font-family="sans-serif" font-size="12">60k &lt; 100k estimate</text><g transform="translate(360 235)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.6" fill="none"><rect x="-11" y="-11" width="22" height="22" rx="2"/><path d="M-6-17V-11M6-17V-11M-6 11V17M6 11V17M-17-6H-11M-17 6H-11M11-6H17M11 6H17"/></g></g><text x="360" y="284" text-anchor="middle" fill="#e9eaee" font-family="sans-serif" font-size="14">Local model</text><text x="360" y="305" text-anchor="middle" fill="#aab0bc" font-family="sans-serif" font-size="12">Generate synthesis</text><g transform="translate(110 235)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.6" fill="none"><rect x="-11" y="-14" width="22" height="28" rx="2"/><path d="M-6-6H6M-6 0H6M-6 6H3"/></g></g><text x="110" y="284" text-anchor="middle" fill="#e9eaee" font-family="sans-serif" font-size="14">Result</text><text x="110" y="305" text-anchor="middle" fill="#aab0bc" font-family="sans-serif" font-size="12">Inspect useful content</text></svg></div><div class="flow-mobile"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 650" role="img" aria-label="Synthetic score-five request: override disabled, Oracle, token decision, local model and result"><defs><pattern id="dots-mobile" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arrow-mobile" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10" fill="none" stroke="#a78bfa"/></marker></defs><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#dots-mobile)"/><path data-flow-edge class="flow-motion" d="M48 75V126" stroke="#a78bfa" fill="none" stroke-width="1.7" marker-end="url(#arrow-mobile)"/><path data-flow-edge class="flow-motion" d="M48 180V231" stroke="#a78bfa" fill="none" stroke-width="1.7" marker-end="url(#arrow-mobile)"/><path data-flow-edge class="flow-motion" d="M48 285V336" stroke="#a78bfa" fill="none" stroke-width="1.7" marker-end="url(#arrow-mobile)"/><path data-flow-edge class="flow-motion" d="M48 390V441" stroke="#a78bfa" fill="none" stroke-width="1.7" marker-end="url(#arrow-mobile)"/><path data-flow-edge class="flow-motion" d="M48 495V546" stroke="#a78bfa" fill="none" stroke-width="1.7" marker-end="url(#arrow-mobile)"/><g transform="translate(48 48)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.6" fill="none"><rect x="-11" y="-14" width="22" height="28" rx="2"/><path d="M-6-6H6M-6 0H6M-6 6H3"/></g></g><text x="92" y="44" text-anchor="start" fill="#e9eaee" font-family="sans-serif" font-size="14">Request</text><text x="92" y="65" text-anchor="start" fill="#aab0bc" font-family="sans-serif" font-size="12">Supplied score: 5</text><g transform="translate(48 153)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.6" fill="none"><path d="M-15-8H-2L13 8M-15 8H-2L13-8"/><circle cx="-15" cy="-8" r="2"/><circle cx="13" cy="8" r="2"/></g></g><text x="92" y="149" text-anchor="start" fill="#e9eaee" font-family="sans-serif" font-size="14">Async override</text><text x="92" y="170" text-anchor="start" fill="#aab0bc" font-family="sans-serif" font-size="12">Fan-out disabled</text><g transform="translate(48 258)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.6" fill="none"><path d="M-7 10V4C-20-9-7-20 0-17 14-17 19-4 7 4v6zM-6 15H6"/></g></g><text x="92" y="254" text-anchor="start" fill="#e9eaee" font-family="sans-serif" font-size="14">Oracle</text><text x="92" y="275" text-anchor="start" fill="#aab0bc" font-family="sans-serif" font-size="12">Retrieve + assemble</text><g transform="translate(48 363)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.6" fill="none"><path d="M-14-13V14H15M-7 8V0M1 8V-8M9 8V-3"/></g></g><text x="92" y="359" text-anchor="start" fill="#e9eaee" font-family="sans-serif" font-size="14">Token decision</text><text x="92" y="380" text-anchor="start" fill="#aab0bc" font-family="sans-serif" font-size="12">60k &lt; 100k estimate</text><g transform="translate(48 468)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.6" fill="none"><rect x="-11" y="-11" width="22" height="22" rx="2"/><path d="M-6-17V-11M6-17V-11M-6 11V17M6 11V17M-17-6H-11M-17 6H-11M11-6H17M11 6H17"/></g></g><text x="92" y="464" text-anchor="start" fill="#e9eaee" font-family="sans-serif" font-size="14">Local model</text><text x="92" y="485" text-anchor="start" fill="#aab0bc" font-family="sans-serif" font-size="12">Generate synthesis</text><g transform="translate(48 573)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.6" fill="none"><rect x="-11" y="-14" width="22" height="28" rx="2"/><path d="M-6-6H6M-6 0H6M-6 6H3"/></g></g><text x="92" y="569" text-anchor="start" fill="#e9eaee" font-family="sans-serif" font-size="14">Result</text><text x="92" y="590" text-anchor="start" fill="#aab0bc" font-family="sans-serif" font-size="12">Inspect useful content</text></svg></div><div class="flow-tools"><button type="button" data-flow-motion aria-pressed="false">Pause flow</button><button type="button" data-flow-expand>Expand diagram</button></div><figcaption>Worked example from the inspected branches. Score supplied as 5, threshold 5, fan-out off, estimated prompt 60k, overflow threshold 100k. Dots show direction, not live activity or successful execution.</figcaption></figure><dialog data-flow-dialog aria-label="Expanded diagram"><button type="button" data-flow-close>Close expanded diagram</button><div data-flow-expanded-content></div></dialog><script is:inline src="/posts/s5e03/review-v1/flow-ui.js"></script><script is:inline src="/posts/s5e03/review-v1/flow-motion.js"></script>

This is a simplified route through the inspected branches. It omits graph-specialist selection, explicit search modes, retrieval details and later escalation. Those omissions are deliberate: the diagram answers why two configuration switches were needed and where the separate token decision occurs. It is not a complete architecture map or a claim that a real request completed.

## A failed first attempt could become tomorrow's answer

Routing to a working lane addressed the immediate experience, but the deep path had another failure mechanism. The overnight record describes multi-variant query embedding taking roughly thirty seconds when idle and exceeding the old 120-second client timeout under concurrent load. The request could return zero documents after around 121 seconds.

A timeout is already a failed user experience. The cache made it persist. The historical report says the per-pod cache retained empty results for its default 24-hour lifetime. An identical retry on the affected replica could then return “No results” in roughly a tenth of a second. The shorter response was not recovery. It was reuse of the earlier empty outcome without attempting the underlying work again.

![The engineer removes an empty tray from a mail sorting belt for separate inspection.](/posts/s5e03/review-v1/cache-tray.png)

<p class="caption">An empty failed attempt should not circulate as a reusable answer. Conceptual illustration.</p>

The source confirms a narrower mechanism than “never cache failures.” `QueryCache.set` inspects dictionaries containing a `documents` key. It skips the write if none of the outer list's entries are truthy. Other dictionary shapes pass through, and the check does not establish that nonempty text is correct, relevant or successfully generated.

The guard below is an exact excerpt from `query_cache.py` at `9dbd25a1`. It occurs before either the optional Redis write or the in-memory write:

```python
if isinstance(result, dict) and "documents" in result:
    if not any(result["documents"]):
        logger.debug(
            "Skipping cache write for empty result set (query=%r)", query
        )
        return
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- The outer condition limits this check to dictionaries with a `documents` field. Other cached shapes retain their existing behaviour.
- `any` tests whether at least one outer entry is truthy. Both `[]` and `[[]]` fail this test, matching the retained empty-result cases.
- The debug message explains the skipped write without changing the returned search response.
- `return` exits before creating a cache entry. A later request can try the search again.
- This does not retry the current request, clear old entries or validate the meaning of a populated document. Those are separate responsibilities.

</details>

The retained test follows the important recovery sequence: attempt to cache `{"documents": [[]]}`, confirm the lookup misses, then cache `{"documents": [["recovered"]]}` and confirm the next lookup returns that content. The distinction is between avoiding a bad reusable state and fixing retrieval itself. A rejected cache write still leaves the current caller with the original empty result.

There is a useful edge to the implementation. A nested list containing an empty string, such as `[[""]]`, has a nonempty inner list and therefore passes this outer truthiness check. That is a property of the inspected Python expression, not a claim that this payload occurred in July. It shows why the guard should be described as rejecting the known empty-container shapes rather than validating every possible failure representation.

Python's own [documentation for `any`](https://docs.python.org/3/library/functions.html#any) and [truth-value testing](https://docs.python.org/3/library/stdtypes.html#truth-value-testing) makes the behaviour inspectable without asking the reader to take the comment on trust. For a future cache contract, I would want an explicit outcome classification alongside result shape. That is a lesson from this reconstruction, not a change claimed as shipped in this episode.

## More waiting time was a separate repair

The configuration also raised the embedding timeout to 300 seconds. That made the client more tolerant of a slow CPU retrieval path. It did not make embeddings faster, remove load contention or guarantee the whole gateway request had a compatible deadline. The cache guard and the timeout addressed different parts of the failure.

There was also a logging correction. The handover reports replacing ordinary exception stringification with `repr(e)` for the async embedding failure because the timeout's ordinary message was blank in the observed case. An empty message had hidden the kind of failure. That is a report about those exceptions in that environment, not a rule that every HTTPX timeout always has an empty string. The [HTTPX exception hierarchy](https://www.python-httpx.org/exceptions/) distinguishes read, connect, write and pool timeouts; that distinction is useful diagnostic context.

The historical measurements explain why the wider Oracle band was kept even after the deep-path fixes. The overnight record reports Oracle around 26–39 seconds for the tested medium-band queries, with roughly seven seconds inside vLLM on average. Deep after the fix was reported at 48–103 seconds for raw chunks. These were different outputs and a limited set of requests, not a controlled benchmark proving one strategy superior for every workload.

They did change the next engineering question. If the model spent about seven seconds generating while the request took tens of seconds end to end, optimising decoding alone could not remove the whole wait. Retrieval, query embedding and other request work remained in the critical path. The records attribute substantial delay to CPU embedding; they do not contain a complete per-request trace in this review package from which I can independently apportion every second.

| Observation in the historical records | What it supports | What it does not establish |
|---|---|---|
| Oracle returned a real synthesis in a 27.3-second smoke request | That recorded request exercised a working path | A latency percentile or all-request reliability |
| About seven seconds inside vLLM on average in the recorded checks | Generation was only part of the observed wait | Exact overhead for every request |
| Deep returned chunks after the timeout repair | The tested path could complete after waiting longer | Equivalent synthesis quality or a universal speed comparison |
| Empty results were rejected by the cache guard | Those shapes stopped becoming new cache entries | Removal of already cached entries or correctness of nonempty results |

I would keep request latency and result usefulness beside each other. A fast empty response can be worse than a slower answer; a slow response can still be unacceptable even when it contains evidence. Neither the model's token rate nor the gateway's status code is enough on its own.

## The missing metric already existed

The next day's observability work began with a mistake in the handover. It said there was no routing counter by agent type and proposed adding one. On inspection, the counter already existed as `rag_search_requests_total{agent_type,status}`, along with dashboard panels for agent distribution. The earlier search had looked for a different name.

I want that reversal in the story because it changed the scope of the implementation. The real gap was the complexity dimension: which scores were reaching which agent after the threshold change? Adding another total by agent would have duplicated an existing view while leaving that question unanswered.

The resulting metric was `rag_agent_routing_total{agent_type,complexity}`. Its emit site used the resolved result's agent type. That matters because the router's readable reason could still say “Deep research” when Oracle had actually run. A display label is not a trustworthy substitute for a typed execution result.

![The engineer traces a pipe to its actual dial on a dim pumping-station wall.](/posts/s5e03/review-v1/metric-path.png)

<p class="caption">Find the measurement attached to the actual path before adding another instrument. Conceptual illustration.</p>

This exact excerpt comes from the gateway's `rag_endpoints.py` at `9dbd25a1`, after request processing:

```python
_complexity_label = (
    "unknown"
    if _query_complexity == 99
    else str(min(max(_query_complexity, 0), 10))
)
rag_agent_routing.labels(
    agent_type=agent_result.agent_type, complexity=_complexity_label
).inc()
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- The gateway uses `99` internally when a complexity score was not available. That sentinel becomes the explicit label `unknown`.
- Other parsed values are clamped to the inclusive zero-to-ten range and converted to text for the metric label.
- The label therefore has a small bounded set of score values rather than an unlimited range of arbitrary integers.
- `agent_result.agent_type` describes the resolved result rather than guessing from the reason's wording.
- `inc()` adds one to that labelled counter. Its position after processing means it is not a complete record of every request that started or failed before reaching this point.

</details>

The score was still extracted from routing-reason text earlier in the gateway. The added clamp made the label set bounded; it did not make the classifier calibrated or turn free text into a fully typed routing contract. The separate sentinel also means a genuine parsed value of 99 would be treated as unknown. Those are implementation boundaries worth keeping visible.

The dashboard grouped increases over the selected time range by agent and complexity. Prometheus's [counter guidance](https://prometheus.io/docs/practices/instrumentation/#counter) and [`increase` documentation](https://prometheus.io/docs/prometheus/latest/querying/functions/#increase) explain why a counter's rise over time is more useful here than comparing raw per-process totals. Counters reset when the process restarts; labelled series may only appear on the replica that served that combination.

The historical report records requests producing Oracle series at scores five, six and eight, fast search at zero, and later checks with no out-of-range complexity labels after the clamp. That is evidence of the recorded emit path and its labels. It does not give me a week's routing distribution, a quality improvement percentage or proof that all attempted requests were counted.

The same investigation corrected another overstatement. An empty secondary log index initially looked like a missing Elasticsearch sink, but pod logs were reaching a different primary index. A separate Grafana datasource failure remained real. I am not reconstructing that adjacent repair here; the relevant lesson is that a search in the wrong metric or index can produce a convincing absence that says little about the actual write path.

## What changed, and what remained open

At the end of the overnight record, the gateway had a reported working Oracle route, the wider threshold, fan-out disabled, the larger overflow threshold and the longer embedding timeout. The cache write guard and better exception representation were reported deployed. The next day's record adds the complexity metric, its bounded labels and dashboard view.

The plan also changed over time. The early ADR proposed removing the temporary routing settings once Deep was repaired. The later handover explicitly kept them based on that evening's results and asked for another review after ordinary traffic accumulated. Treating the early revert plan as the final operational decision would miss that change of direction.

| Practical lesson | What I would carry into the next change |
|---|---|
| Capacity and reachability are different | Follow a request from entry point to the actual model and back to useful content |
| A selector can be bypassed | Inspect early returns and overrides after the first decision |
| A cache preserves semantics as well as bytes | Test failed-then-successful recovery, not just repeated successful hits |
| A mitigation can remain useful after a defect is fixed | Retain the reason and re-evaluation condition rather than removing it automatically |
| Names are weak evidence of absence | Find the defined metric, scraped series and write index before declaring them missing |
| A new counter has an observation boundary | State where it increments and which failed requests may never reach it |

For this draft, isolated checks exercise the retained selection helper, cache tests and the worked decision cases. The original GPU workload, hosted fallback and July traffic were not replayed. The inventory and claim ledger preserve that distinction, along with the missing raw traces and the deliberately excluded adjacent work.

The next July thread moves back toward the data entering the graph. A retained July 5 handover describes extraction output failing its expected schema and a diagnosis-first handoff. That is a grounded direction for the next chapter, not yet its final scope or a promise that the whole ingestion problem was solved. Here, the progress was more specific: the route could reach the capacity, failures became less reusable, and the measurement question became narrow enough to answer.

## Terms and references

<details data-glossary class="glossary"><summary>Glossary — plain-English definitions</summary><div class="glossary-tools" hidden><label for="glossary-search">Find a term</label><div class="glossary-search-row"><input id="glossary-search" type="search"><button type="button">Clear</button></div><p role="status" aria-live="polite"></p></div><section class="glossary-term" id="term-agent-lane"><h3>Agent lane</h3><p>An application path for a kind of search or synthesis; it is not a human team. <a href="https://www.anthropic.com/engineering/building-effective-agents">Official reference</a>.</p></section><section class="glossary-term" id="term-complexity-score"><h3>Complexity score</h3><p>The router’s estimated classification used for selection, not a proven measure of difficulty. <a href="https://docs.python.org/3/tutorial/controlflow.html#if-statements">Official reference</a>.</p></section><section class="glossary-term" id="term-fan-out"><h3>Fan-out</h3><p>Invoking several search branches and collecting their results; its presence does not guarantee better results. <a href="https://docs.python.org/3/library/asyncio-task.html">Official reference</a>.</p></section><section class="glossary-term" id="term-early-return"><h3>Early return</h3><p>Exiting a function before later code runs; here the override bypasses normal agent lookup. <a href="https://docs.python.org/3/reference/simple_stmts.html#the-return-statement">Official reference</a>.</p></section><section class="glossary-term" id="term-synthesis"><h3>Synthesis</h3><p>Producing an answer from retrieved evidence; its usefulness still needs review. <a href="https://www.anthropic.com/engineering/building-effective-agents">Official reference</a>.</p></section><section class="glossary-term" id="term-token-estimate"><h3>Token estimate</h3><p>An approximation used to choose a model route; it is not a quality measurement. <a href="https://huggingface.co/docs/transformers/main_classes/tokenizer">Official reference</a>.</p></section><section class="glossary-term" id="term-overflow-route"><h3>Overflow route</h3><p>A configured alternate model path for estimated prompts above the threshold, when enabled. <a href="https://huggingface.co/docs/transformers/main_classes/tokenizer">Official reference</a>.</p></section><section class="glossary-term" id="term-kv-cache"><h3>KV cache</h3><p>Generation working memory whose budget competes with model weights and overhead. <a href="https://huggingface.co/docs/transformers/kv_cache">Official reference</a>.</p></section><section class="glossary-term" id="term-query-cache"><h3>Query cache</h3><p>A store of prior search results keyed for reuse; a hit can repeat a bad result. <a href="https://docs.python.org/3/library/functools.html#functools.lru_cache">Official reference</a>.</p></section><section class="glossary-term" id="term-ttl"><h3>TTL</h3><p>Time to live: how long an entry is retained as eligible for reuse. <a href="https://redis.io/docs/latest/commands/expire/">Official reference</a>.</p></section><section class="glossary-term" id="term-truthiness"><h3>Truthiness</h3><p>Python’s rule for treating a value as true or false; a nonempty list is true even if it contains an empty string. <a href="https://docs.python.org/3/library/stdtypes.html#truth-value-testing">Official reference</a>.</p></section><section class="glossary-term" id="term-timeout"><h3>Timeout</h3><p>A limit on waiting for one operation; raising it does not make the operation faster. <a href="https://www.python-httpx.org/advanced/timeouts/">Official reference</a>.</p></section><section class="glossary-term" id="term-counter"><h3>Counter</h3><p>A cumulative measurement that increases and can reset when its process restarts. <a href="https://prometheus.io/docs/practices/instrumentation/#counter">Official reference</a>.</p></section><section class="glossary-term" id="term-label-cardinality"><h3>Label cardinality</h3><p>The number of metric series created by label combinations; bounding values helps limit it. <a href="https://prometheus.io/docs/practices/instrumentation/#do-not-overuse-labels">Official reference</a>.</p></section><section class="glossary-term" id="term-sentinel"><h3>Sentinel</h3><p>A special value used to represent an unavailable or exceptional state; this gateway used 99 for missing complexity. <a href="https://docs.python.org/3/library/enum.html">Official reference</a>.</p></section><section class="glossary-term" id="term-replica"><h3>Replica</h3><p>One running copy of a service; per-process state may differ between copies. <a href="https://kubernetes.io/docs/concepts/workloads/controllers/deployment/">Official reference</a>.</p></section></details>

<details class="source-note">
<summary>How this episode was reconstructed</summary>

This is a curated reconstruction of the July 2–3 routing arc. Its private review ledger links dated handovers, the routing decision record, the July 3 implementation report, historical platform source at `9dbd25a1` and historical GitOps revisions. Original operational reports remain distinct from newly inspected source and isolated tests. There is no claim of exhaustive period coverage or complete native-session replay. No pre-crafted Episode 3 or authoritative Season 5 continuation map was recovered in the scoped canonical searches; the title is an editorial proposal following the published Episode 2 preview. Habi, employer material, private finance, unrelated music and hackathon work are excluded. Original traffic traces, raw latency samples and a fresh long-input evaluation are unavailable in this package. Upstream references explain mechanisms; they do not verify Rootweaver's historical deployment.

</details>

<script is:inline src="/posts/s5e03/review-v1/reader.js"></script>
<style is:global>main{min-width:0}main>p:not(:has(img)){max-width:74ch}main>ul,main>ol{max-width:74ch}.eyebrow{text-transform:none;letter-spacing:.025em}.reading-progress{position:fixed;left:0;top:0;height:3px;width:0;background:var(--accent);z-index:20;pointer-events:none}.reading-tools{max-width:1160px;margin:0 auto;padding:14px 28px 0;display:flex;justify-content:flex-end;gap:8px}.reader-button,.copy-code,.expand-diagram{border:1px solid var(--border);background:var(--card);color:var(--text);padding:7px 11px;border-radius:6px;font-size:11px}.copy-code{float:right;margin-left:10px}.code-source{display:flow-root}.contents a[aria-current="location"]{color:var(--accent);font-weight:600}.reading-focus .contents{display:none}.reading-focus .page-grid{display:block;max-width:800px}.reading-focus .nav-links>a{display:none}.reading-focus .article-header{max-width:none}.diagram{position:relative}.expand-diagram{display:block;margin:12px auto 0;background:#192d46;color:#eef6ff;border-color:#5c86a6}dialog{width:min(96vw,1300px);height:92vh;max-height:92vh;padding:18px;border:1px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text)}dialog::backdrop{background:rgba(0,0,0,.8)}.dialog-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}.diagram-scroll{overflow:auto;height:calc(100% - 54px);background:#101c2d;border-radius:8px}.diagram-scroll img{width:1200px;max-width:none;border-radius:0;margin:0 auto}.sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:600px){.reading-tools{padding:12px 18px 0}.copy-code{padding:4px 7px}.dialog-head{font-size:12px}dialog{padding:10px}.diagram-scroll img{width:1000px}}
.article-header{border-left:3px solid var(--accent);padding-left:22px}.eyebrow{margin-top:25px}.page-grid{grid-template-columns:minmax(0,740px) 210px;gap:64px}.code-box{box-shadow:0 8px 22px #00000012}h2{border-bottom:0;padding-bottom:0}.caption{border-left:0;padding-left:0}@media(max-width:600px){.article-header{padding-left:15px}}
details.walkthrough{padding:0}details.walkthrough summary{padding:13px 18px;cursor:pointer;color:var(--accent);font-size:12px;font-weight:550;list-style-position:inside}details.walkthrough summary:hover{background:var(--chip)}details.walkthrough[open] summary{border-bottom:1px solid var(--border)}details.walkthrough .explanation-body{padding:14px 18px}details.walkthrough summary:focus-visible{outline-offset:-4px}@media(max-width:600px){details.walkthrough summary{padding:12px 14px}details.walkthrough .explanation-body{padding:12px 14px}}

main{min-width:0}.notebook-article table{display:block;max-width:100%;min-width:0;overflow-x:auto}.table-wrap{overflow:auto;max-width:100%}table{min-width:580px}summary{cursor:pointer}details.glossary,details.source-note{border:1px solid var(--border);border-radius:8px;padding:16px;margin:25px 0}.glossary-term{border-top:1px solid var(--border)}.glossary-tools input{font:inherit;max-width:100%}.glossary-search-row{display:flex;gap:12px}.glossary-search-row input{min-width:0}.glossary-tools button,.flow-tools button{font:inherit;padding:7px 12px}.code-source{font-size:12px}.contents{margin-top:160px}pre{overflow:auto}h3{font-size:17px}figcaption,.caption{font-size:12px}code{overflow-wrap:anywhere;white-space:normal}pre code{white-space:pre}.flow-tools{display:flex;gap:12px;margin:10px 0}.publish-flow{margin:28px 0}.publish-flow h3{margin:0 0 14px}.publish-flow figcaption{line-height:1.6;color:var(--muted,#aab0bc)}.flow-tools button,dialog button{background:#1c1e24;color:#e9eaee;border:1px solid #75608f;border-radius:6px;padding:9px 12px;cursor:pointer}.flow-mobile{display:none}.flow-desktop svg,.flow-mobile svg{display:block;width:100%;height:auto}dialog{color:var(--text);background:var(--bg);border:1px solid var(--border);max-width:min(1150px,95vw);max-height:90vh;width:95vw}dialog::backdrop{background:#000b}.asset-option{margin:38px 0}.review-links{display:flex;gap:18px;flex-wrap:wrap}@media(max-width:600px){input{font-size:16px!important}.flow-desktop{display:none}.flow-mobile{display:block}code{font-size:.88em}}
main{min-width:0}main img{width:100%;height:auto;display:block}.story-flow{margin:28px 0}.story-flow h3{margin:0 0 14px}.story-flow figcaption{font-size:12px;line-height:1.6;color:var(--muted)}.flow-mobile{display:none}.flow-desktop svg,.flow-mobile svg{display:block;width:100%;height:auto}.table-wrap{overflow-x:auto;max-width:100%}.notebook-article table{display:block;min-width:0;max-width:100%;overflow-x:auto}.notebook-article p{font-size:15px}pre{max-width:100%;overflow-x:auto}code{overflow-wrap:anywhere}pre code{white-space:pre}.asset-option{margin:35px 0}.review-links{display:flex;flex-wrap:wrap;gap:14px}summary{cursor:pointer}dialog{max-width:95vw;width:1000px;background:var(--bg);color:var(--text)}dialog::backdrop{background:#000b}@media(max-width:600px){main p,main li{font-size:14px}.flow-desktop{display:none}.flow-mobile{display:block}.glossary-search-row{display:flex;gap:8px}.glossary-search-row input{min-width:0;font-size:16px}}
.story-flow{background:#141414;border:1px solid #3b3f4a;border-radius:10px;padding:16px}.story-flow h3{color:#e9eaee}.story-flow figcaption{color:#aab0bc}.story-flow svg{border-radius:5px}.flow-tools{display:flex;gap:10px;margin-top:10px}.flow-tools button{background:#1c1e24;color:#e9eaee;border:1px solid #555867;border-radius:5px;padding:6px 10px}.flow-motion{animation:s5e03-dots 1.4s linear infinite;stroke-dasharray:3 7}.flow-paused .flow-motion{animation-play-state:paused}@keyframes s5e03-dots{to{stroke-dashoffset:-20}}@media(prefers-reduced-motion:reduce){.flow-motion{animation:none}}.article-meta{font-size:12px}.review-links{font-size:13px}.notebook-article li{font-size:15px}@media(max-width:600px){.notebook-article li{font-size:14px}}</style>
<style is:global>.notebook-article p,.notebook-article li{font-size:15px}@media(max-width:600px){.notebook-article p,.notebook-article li{font-size:14px!important}}</style>
