---
title: "The Smaller Model Had to Earn Its Place"
author: Ryan Duffy
pubDatetime: 2026-07-02T12:00:00Z
shippingDatetime: 2026-11-05T08:00:00Z
draft: false
episode: 2
series: "Season 5: Rootweaver"
description: "More context on the same GPU meant testing a smaller model, repairing its callers and recognising when the judge changed too."
tags: [rootweaver, engineering, building-in-public, season-5]
---

I wanted more room for the context my platform needed without replacing the graphics card. The candidate was a smaller model. The awkward part was proving that the smaller model still did the work, then finding all the places that had quietly memorised the old one's name.

The previous episode followed a graph-ingestion job that could finish successfully while individual documents failed. It exposed the distance between a healthy-looking process and a useful result. This chapter follows a related problem on the other side of that request: changing the model behind a service changes more than the weights loaded into memory.

On July 2, the retained comparison describes replacing Qwen3-8B-AWQ with Qwen3-4B-Instruct-2507-AWQ on an RTX 4080 with 16GB of memory. Half the parameter count was an opportunity to reclaim working room. It was not a reason to assume equal answers, longer useful conversations or working applications.

![The Rootweaver engineer checks the fit of a compact case in an instrument repair room.](/posts/s5e02/review-v3/hero-A.png)

<p class="caption">A smaller component has to fit the job as well as the available space. Conceptual illustration, not a historical photograph.</p>

I owned the requirements, review and acceptance decisions. Coding agents assisted with the research, reconstructed test harness, implementation and verification. The benchmark and promotion outcomes below are historical reports. I have separately inspected the retained serving configuration, discovery code, consumer call site and tests. Fresh checks for this draft use controlled substitutes; they do not rerun the July model benchmark or recreate the original production session.

## The constraint was working room on the same card

The model's stored weights were only part of the memory bill. During generation, the server also retained attention keys and values for the tokens being processed. That working memory is the KV cache. Runtime overhead and other uses of the card still had to fit around it.

A smaller set of weights could therefore make room for a larger cache. That is useful when the application needs more evidence in one request. It does not mean every saved byte becomes useful context, or that a larger configured limit makes the answers more accurate. The serving configuration and the workload decide how that capacity is used.

The comparison report records the following settings and observations. These are July figures from that installation, not fresh measurements of the platform today.

| Reported property | Previous 8B model | Candidate 4B model |
|---|---|---|
| Configured request ceiling | 40,960 tokens | 114,688 tokens |
| KV pool reported at the tested settings | 4.78 GiB | 9.72 GiB |
| Reported KV token capacity | 67,728 | 141,520 |
| Long-input needle probes | Passed at 30k | Passed at 30k, 60k and 90k |
| Wall time for the six short probes | 13.2 seconds with a speculative model | 13.1 seconds without a speculative model |

There are two different comparisons in that table. The configured request ceiling increased by exactly 2.8 times: 114,688 divided by 40,960. The reported KV pool increased by about 2.03 times: 9.72 divided by 4.78. Those ratios describe different quantities. Neither is a multiplier for reasoning ability, throughput or the number of simultaneous users.

The reported KV token capacity is also not the same as the maximum length permitted for one request. A server can divide its working memory across concurrent sequences. A long prompt still needs room for the response it is supposed to generate. Treating the full context number as an allowance for input alone would create a different limit problem at the application boundary.

A simple capacity example makes that distinction visible. A fictional request containing 90,000 input tokens with a 4,000-token response allowance needs a total budget of 94,000 tokens. That is below the reported 114,688 ceiling. A 112,000-token input with the same allowance needs 116,000 and would exceed it. This is arithmetic to explain a request budget, not a claim that either fictional request was executed or would produce a good answer.

The [vLLM project's optimization guidance](https://docs.vllm.ai/en/latest/configuration/optimization/) explains why request length, concurrency and memory settings interact. Its current documentation is useful context; the historical report and retained configuration establish which values this installation used. I keep those roles separate.

The practical question was becoming clearer. Could I spend less memory on the model itself, retain more of the evidence a task needed, and still get acceptable results? That required a comparison shaped like the platform's work.

## A smaller model needed a stated job to pass

The report describes a reconstruction of an earlier six-pipeline-shaped harness with twenty-five binary checks. It covered contracts such as a journal's required sections, strict JSON extraction and scoring, a scout's section structure, SRE grounding and an oracle task with a planted template-variable trap. Separate needle probes looked for a known detail inside longer input.

Those checks were a useful way to ask whether the replacement could satisfy the interfaces that downstream code expected. They were not a complete replay of six running production pipelines. A response can fit a schema and still contain a bad judgment. A needle can be found without the model understanding every relationship in the surrounding document.

| Question | What the retained result supports | What remains outside it |
|---|---|---|
| Does the response satisfy the checked contract? | A pass or failure on a named binary check | General factual correctness |
| Can it recover a planted detail at the tested length? | Success on that needle probe | Reliable reasoning across arbitrary long inputs |
| Is it faster for this short harness run? | The reported elapsed time for that run | A stable latency distribution or production throughput |
| Is the candidate suitable to investigate further? | A bounded comparison against the previous model | Universal superiority of 4B over 8B models |

The previous model scored 25/25. The candidate scored 24/25 under the strict checker. The report then interpreted the candidate as 25/25 effective after reviewing the one failure. Keeping both numbers is part of the story, because the failed check asks what the benchmark was really measuring.

The oracle check expected a citation in a filename-style form. The candidate supplied the correct document using its human-readable title. According to the report, both models identified the correct planted token and document; the mismatch was in the citation-format regular expression. That can justify a reviewed exception for that check. It does not justify erasing the raw failure, changing the checker silently or claiming that every kind of citation would be correct.

I have the benchmark report, not the original result JSONs or harness file in this retained package. I cannot independently re-score that answer here. The accurate statement is that the report records 24/25 strict and explains why its author accepted the remaining answer. That is enough to explain the decision without making the evidence look more complete than it is.

The timings need the same restraint. A single 13.1-second result against 13.2 seconds does not establish a useful speed advantage. There is no repeated timing distribution in this package from which to separate noise, warm-up, scheduling or workload variation. The useful reported outcome was similar short-harness time while testing more context, without the previous speculative-decoding arrangement.

Speculative decoding uses a smaller draft model to propose tokens that another model checks. The retained configuration removed the old 8B-specific speculator for the 4B deployment. A candidate 4B head existed for a later experiment, but its compatibility and acceptance rate against the 2507 instruction model were not established in this window. I would not turn an unrun follow-up into part of the successful result.

The [Qwen team's model card](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507) identifies the instruction model behind the candidate. The installation used an AWQ-quantized derivative, so the upstream card's advertised capabilities are not a substitute for measuring that particular model, server and hardware combination.

## Promotion meant a concrete configuration, with a route back

The retained record has a deployment trail rather than a single model-name edit. It describes a temporary benchmark configuration, a revert that also pinned the candidate's downloaded revision, and a later promotion with the new canonical served name plus the old compatibility alias.

The revision pin mattered because the service ran with remote model code trusted. A name alone would leave the downloaded revision dependent on what upstream served later. The historical configuration specifies a particular revision for the quantized repository. That makes the requested dependency more reproducible; it does not independently establish a complete audit of every dependency or prove which bytes were in a running process.

I inspected the historical GitOps source at the recorded promotion commit. The following are selected argument lines, shown in their original order with comments and unrelated arguments omitted. This is a description of the July deployment, not a command to apply to today's cluster.

<p class="code-source">Selected unchanged argument lines: infrastructure/vllm/vllm-statefulset.yaml, historical GitOps commit 9f479e2. Comments and unrelated arguments omitted.</p>

```yaml
- --model=/models/Qwen3-4B-Instruct-2507-AWQ
- --max-model-len=114688
- --gpu-memory-utilization=0.88
- --max-num-seqs=2
- --kv-cache-dtype=fp8
- --trust-remote-code
- --served-model-name
- qwen3-4b-2507
- qwen3-8b
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

1. `--model` chooses the local directory containing the candidate weights.
2. `--max-model-len` sets the configured ceiling for one sequence, including the tokens needed for its response.
3. `--gpu-memory-utilization` supplies the server's memory-utilization setting; it does not mean the card is reserved exclusively for this workload.
4. `--max-num-seqs` bounds the number of sequences the scheduler can handle concurrently at this setting.
5. `--kv-cache-dtype=fp8` chooses the cache representation. The reported pool depends on the full serving configuration.
6. `--trust-remote-code` permits model-supplied code, which makes an explicit dependency revision important.
7. `--served-model-name` introduces the names clients may send to this deployment.
8. `qwen3-4b-2507` is the new canonical name, placed first.
9. `qwen3-8b` remains an alias for compatibility. It does not cause the old 8B weights to load for requests using that name.

</details>

That last distinction is easy to miss. A request saying `qwen3-8b` could still succeed after the swap while being answered by the new 4B deployment. The alias preserved an interface during migration. It was not a second model, an automatic comparison or proof that every application had updated its configuration.

The handover retained a rollback route: the previous weights and speculator remained available, with the earlier argument configuration recorded. That is a documented way back, not evidence that a rollback was exercised during this draft review. The promotion also did not remove the separate availability problem described in Episode 1. More context and a useful answer do not guarantee that the service remains available throughout a full backfill.

## The server changed before every caller did

The discovery follow-up records three stale hardcoded defaults: the graph client, the gateway and the natural-language-to-query path in the code graph. They had accumulated names from earlier deployments. A healthy endpoint could therefore reject an application's request because the application was asking for a model that endpoint no longer served.

This is why I would not describe promotion as merely changing one image or argument. There was the model on the server, the names the server accepted, the defaults compiled into clients and explicit configuration held elsewhere. Those pieces could change on different build and rollout schedules.

| Layer | What the July record says changed | Why a successful request is still a limited check |
|---|---|---|
| Server | New weights and canonical served name | An old alias may conceal a stale caller |
| Consumer code | Discovery replaced three stale defaults | Existing images still need to pick up that code |
| Explicit configuration | Per-use-case model pins still take priority | A stale pin can continue bypassing discovery |
| Compatibility | Old served name retained temporarily | Alias retirement needs a separate consumer audit |

The chosen repair was to ask the generation endpoint which model names it currently served. This is service discovery for a name, not an evaluation that chooses the best model for each task. It needs to query the same endpoint to which the eventual generation request will go.

The graph client keeps an important escape route for deliberate configuration. If its environment supplies a model name, that pin wins. Only an unset or empty value takes the discovery path.

<p class="code-source">Exact fragment, dedented: packages/rootweaver-graph/src/rootweaver_graph/graphiti_client.py, client initialization, historical commit 2e2991b0.</p>

```python
llm_model = os.getenv(
    "GRAPHITI_LLM_MODEL"
) or discover_vllm_generation_model(vllm_url)
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

1. The assignment stores the model name that the client will use.
2. `os.getenv` reads the graph client's explicit environment setting.
3. Python's `or` evaluates discovery only when that setting is absent or empty. A non-empty pin bypasses the network lookup; the helper cannot correct it.

</details>

Preserving that override is useful when a workload must intentionally target a particular model. It also makes the remaining migration work visible. Discovery cannot fix a wrong explicit setting, a retired alias held in a ConfigMap or an old application image that never calls the helper.

<figure class="story-flow" data-policy-flow="" id="story-path"><h3>After a cache miss: resolving the served name</h3><div class="flow-desktop"><svg aria-labelledby="s5e02-d-title s5e02-d-desc" class="publish-svg" role="img" viewbox="0 0 720 340" xmlns="http://www.w3.org/2000/svg"><title id="s5e02-d-title">Discovery when there is no explicit override</title><desc id="s5e02-d-desc">Fallback discovery path from historical llm_discovery.py. An explicit caller override bypasses this flow. Empty/unreachable/no qualifying models raise an error; order and name filtering are deployment assumptions, not proof of model capability.</desc><defs><pattern height="24" id="s5e02-d-grid" patternunits="userSpaceOnUse" width="24"><circle cx="2" cy="2" fill="#3b3f4a" r=".8"></circle></pattern><marker id="s5e02-d-arrow" markerheight="6" markerwidth="6" orient="auto" refx="9" refy="5" viewbox="0 0 10 10"><path d="M0 0L10 5 0 10" fill="none" stroke="#a78bfa" stroke-width="1.5"></path></marker></defs><style>.publish-svg{font-family:system-ui,sans-serif}.publish-svg .flow-motion{fill:none;stroke:#a78bfa;stroke-width:1.8;stroke-dasharray:3 7;animation:flowdash 1.4s linear infinite}@keyframes flowdash{to{stroke-dashoffset:-20}}.flow-paused .publish-svg .flow-motion{animation-play-state:paused}@media(prefers-reduced-motion:reduce){.publish-svg .flow-motion{animation:none}}</style><rect fill="#141414" height="340" rx="12" width="720"></rect><rect fill="url(#s5e02-d-grid)" height="340" rx="12" width="720"></rect><path class="flow-motion" d="M159 57H321" data-flow-edge="" marker-end="url(#s5e02-d-arrow)"></path><path class="flow-motion" d="M399 57H561" data-flow-edge="" marker-end="url(#s5e02-d-arrow)"></path><path class="flow-motion" d="M639 57H692V156H120V166" data-flow-edge="" marker-end="url(#s5e02-d-arrow)"></path><path class="flow-motion" d="M159 205H321" data-flow-edge="" marker-end="url(#s5e02-d-arrow)"></path><path class="flow-motion" d="M399 205H561" data-flow-edge="" marker-end="url(#s5e02-d-arrow)"></path><g transform="translate(120,57)"><circle fill="#1c1e24" r="30" stroke="#4b435e"></circle><g fill="none" stroke="#c4b5fd" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"><circle cy="-9" r="7"></circle><path d="M-16 17v-6c0-8 32-8 32 0v6"></path></g></g><text fill="#e9eaee" font-size="18" font-weight="650" text-anchor="middle" x="120" y="110">Caller</text><text fill="#aab0bc" font-size="14" text-anchor="middle" x="120" y="133">No explicit pin</text><g transform="translate(360,57)"><circle fill="#1c1e24" r="30" stroke="#4b435e"></circle><g fill="none" stroke="#c4b5fd" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"><rect height="32" rx="2" width="24" x="-12" y="-16"></rect><path d="M-6-7h12M-6 0h12M-6 7h9"></path></g></g><text fill="#e9eaee" font-size="18" font-weight="650" text-anchor="middle" x="360" y="110">Endpoint</text><text fill="#aab0bc" font-size="14" text-anchor="middle" x="360" y="133">Generation models</text><g transform="translate(600,57)"><circle fill="#1c1e24" r="30" stroke="#4b435e"></circle><g fill="none" stroke="#c4b5fd" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"><path d="M-16-15v30h33M-9 8V0M0 8v-17M9 8v-12"></path></g></g><text fill="#e9eaee" font-size="18" font-weight="650" text-anchor="middle" x="600" y="110">Entries</text><text fill="#aab0bc" font-size="14" text-anchor="middle" x="600" y="133">Inspect IDs</text><g transform="translate(120,205)"><circle fill="#1c1e24" r="30" stroke="#4b435e"></circle><g fill="none" stroke="#c4b5fd" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"><path d="M0-17l15 6v12c-1 9-8 14-15 17-7-3-14-8-15-17v-12z"></path><path d="M-6 0l4 5 9-11"></path></g></g><text fill="#e9eaee" font-size="18" font-weight="650" text-anchor="middle" x="120" y="258">Filter</text><text fill="#aab0bc" font-size="14" text-anchor="middle" x="120" y="281">Skip embed names</text><g transform="translate(360,205)"><circle fill="#1c1e24" r="30" stroke="#4b435e"></circle><g fill="none" stroke="#c4b5fd" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"><circle cx="-7" cy="-6" r="9"></circle><path d="M0 1l15 15M7 8l4-4M11 12l4-4"></path></g></g><text fill="#e9eaee" font-size="18" font-weight="650" text-anchor="middle" x="360" y="258">Selection</text><text fill="#aab0bc" font-size="14" text-anchor="middle" x="360" y="281">Cache / return</text><g transform="translate(600,205)"><circle fill="#1c1e24" r="30" stroke="#4b435e"></circle><g fill="none" stroke="#c4b5fd" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"><path d="M-18-14h36v24H0l-11 8v-8h-7zM-10-5h20M-10 2h12"></path></g></g><text fill="#e9eaee" font-size="18" font-weight="650" text-anchor="middle" x="600" y="258">Request</text><text fill="#aab0bc" font-size="14" text-anchor="middle" x="600" y="281">Use served name</text><text fill="#aab0bc" font-size="13" text-anchor="middle" x="360.0" y="316">Conceptual path; dots are not live traffic.</text></svg></div><div class="flow-mobile"><svg aria-labelledby="s5e02-m-title s5e02-m-desc" class="publish-svg" role="img" viewbox="0 0 360 640" xmlns="http://www.w3.org/2000/svg"><title id="s5e02-m-title">Discovery when there is no explicit override</title><desc id="s5e02-m-desc">Fallback discovery path from historical llm_discovery.py. An explicit caller override bypasses this flow. Empty/unreachable/no qualifying models raise an error; order and name filtering are deployment assumptions, not proof of model capability.</desc><defs><pattern height="24" id="s5e02-m-grid" patternunits="userSpaceOnUse" width="24"><circle cx="2" cy="2" fill="#3b3f4a" r=".8"></circle></pattern><marker id="s5e02-m-arrow" markerheight="6" markerwidth="6" orient="auto" refx="9" refy="5" viewbox="0 0 10 10"><path d="M0 0L10 5 0 10" fill="none" stroke="#a78bfa" stroke-width="1.5"></path></marker></defs><style>.publish-svg{font-family:system-ui,sans-serif}.publish-svg .flow-motion{fill:none;stroke:#a78bfa;stroke-width:1.8;stroke-dasharray:3 7;animation:flowdash 1.4s linear infinite}@keyframes flowdash{to{stroke-dashoffset:-20}}.flow-paused .publish-svg .flow-motion{animation-play-state:paused}@media(prefers-reduced-motion:reduce){.publish-svg .flow-motion{animation:none}}</style><rect fill="#141414" height="640" rx="12" width="360"></rect><rect fill="url(#s5e02-m-grid)" height="640" rx="12" width="360"></rect><path class="flow-motion" d="M50 90V110" data-flow-edge="" marker-end="url(#s5e02-m-arrow)"></path><path class="flow-motion" d="M50 186V206" data-flow-edge="" marker-end="url(#s5e02-m-arrow)"></path><path class="flow-motion" d="M50 282V302" data-flow-edge="" marker-end="url(#s5e02-m-arrow)"></path><path class="flow-motion" d="M50 378V398" data-flow-edge="" marker-end="url(#s5e02-m-arrow)"></path><path class="flow-motion" d="M50 474V494" data-flow-edge="" marker-end="url(#s5e02-m-arrow)"></path><g transform="translate(50,52)"><circle fill="#1c1e24" r="30" stroke="#4b435e"></circle><g fill="none" stroke="#c4b5fd" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"><circle cy="-9" r="7"></circle><path d="M-16 17v-6c0-8 32-8 32 0v6"></path></g></g><text fill="#e9eaee" font-size="18" font-weight="650" text-anchor="start" x="103" y="47">Caller</text><text fill="#aab0bc" font-size="14" text-anchor="start" x="103" y="70">No explicit pin</text><g transform="translate(50,148)"><circle fill="#1c1e24" r="30" stroke="#4b435e"></circle><g fill="none" stroke="#c4b5fd" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"><rect height="32" rx="2" width="24" x="-12" y="-16"></rect><path d="M-6-7h12M-6 0h12M-6 7h9"></path></g></g><text fill="#e9eaee" font-size="18" font-weight="650" text-anchor="start" x="103" y="143">Endpoint</text><text fill="#aab0bc" font-size="14" text-anchor="start" x="103" y="166">Generation models</text><g transform="translate(50,244)"><circle fill="#1c1e24" r="30" stroke="#4b435e"></circle><g fill="none" stroke="#c4b5fd" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"><path d="M-16-15v30h33M-9 8V0M0 8v-17M9 8v-12"></path></g></g><text fill="#e9eaee" font-size="18" font-weight="650" text-anchor="start" x="103" y="239">Entries</text><text fill="#aab0bc" font-size="14" text-anchor="start" x="103" y="262">Inspect IDs</text><g transform="translate(50,340)"><circle fill="#1c1e24" r="30" stroke="#4b435e"></circle><g fill="none" stroke="#c4b5fd" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"><path d="M0-17l15 6v12c-1 9-8 14-15 17-7-3-14-8-15-17v-12z"></path><path d="M-6 0l4 5 9-11"></path></g></g><text fill="#e9eaee" font-size="18" font-weight="650" text-anchor="start" x="103" y="335">Filter</text><text fill="#aab0bc" font-size="14" text-anchor="start" x="103" y="358">Skip embed names</text><g transform="translate(50,436)"><circle fill="#1c1e24" r="30" stroke="#4b435e"></circle><g fill="none" stroke="#c4b5fd" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"><circle cx="-7" cy="-6" r="9"></circle><path d="M0 1l15 15M7 8l4-4M11 12l4-4"></path></g></g><text fill="#e9eaee" font-size="18" font-weight="650" text-anchor="start" x="103" y="431">Selection</text><text fill="#aab0bc" font-size="14" text-anchor="start" x="103" y="454">Cache / return</text><g transform="translate(50,532)"><circle fill="#1c1e24" r="30" stroke="#4b435e"></circle><g fill="none" stroke="#c4b5fd" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"><path d="M-18-14h36v24H0l-11 8v-8h-7zM-10-5h20M-10 2h12"></path></g></g><text fill="#e9eaee" font-size="18" font-weight="650" text-anchor="start" x="103" y="527">Request</text><text fill="#aab0bc" font-size="14" text-anchor="start" x="103" y="550">Use served name</text><text fill="#aab0bc" font-size="13" text-anchor="middle" x="180.0" y="620">Conceptual path; dots are not live traffic.</text></svg></div><div class="flow-tools"><button aria-pressed="false" data-flow-motion="" type="button">Pause flow</button><button data-flow-expand="" type="button">Expand diagram</button></div><figcaption>This diagram follows the lookup branch only: no explicit model pin and no fresh cached name. It reads the generation endpoint, filters names and returns the first qualifying ID. An explicit pin or cache hit bypasses this lookup. Endpoint failures or no qualifying ID raise an error. Dots show direction, not live traffic.</figcaption></figure>
<dialog data-flow-dialog aria-label="Expanded diagram"><button type="button" data-flow-close>Close expanded diagram</button><div data-flow-expanded-content></div></dialog>
<script is:inline src="/posts/s5e02/review-v3/flow-ui.js"></script>
<script is:inline src="/posts/s5e02/review-v3/flow-motion.js"></script>

## Follow one model name through the code

The following model-list response is synthetic. It is shaped to explain the code, with fictional IDs and no captured production data. In this example an embedding entry appears first, then a generation model and a compatibility alias.

<p class="code-source">Synthetic response for an offline demonstration of the retained discovery helper; not an observed endpoint response.</p>

```json
{
  "data": [
    {"id": "example-embedding"},
    {"id": "example-generation-current"},
    {"id": "example-generation-legacy-alias"}
  ]
}
```

Before reading that list, the helper checks its own cache. The cache belongs to the local Python process and is keyed by the endpoint URL. Its lifetime in the retained source is 300 seconds. These four statements explain why a long-running process can keep using a recently discovered name for a while after the deployment changes.

<p class="code-source">Exact fragment, dedented: packages/rootweaver-core/src/rootweaver_core/llm_discovery.py, discover_vllm_generation_model(), historical commit 2e2991b0. Cache lifetime is 300 seconds in the same source.</p>

```python
now = time.monotonic()
cached = _cache.get(base)
if cached and now - cached[0] < _CACHE_TTL_SECONDS:
    return cached[1]
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

1. `time.monotonic` provides an elapsed-time clock suitable for checking age within a process.
2. The dictionary lookup asks whether this endpoint has a cached timestamp and model ID.
3. The condition accepts a cached entry only while its recorded age is below the configured lifetime.
4. A fresh entry returns immediately. No new model-list request happens on this branch.

</details>

After a cache miss, the surrounding function requests `/v1/models` with a timeout. It then runs the selection loop below. For the synthetic response, the first name is skipped because it contains `embed`; the second is cached and returned; the third is never reached.

<p class="code-source">Exact fragment, dedented: packages/rootweaver-core/src/rootweaver_core/llm_discovery.py, discover_vllm_generation_model(), historical commit 2e2991b0.</p>

```python
for model in models:
    model_id = model.get("id", "")
    if model_id and "embed" not in model_id.lower():
        _cache[base] = (now, model_id)
        logger.debug("Discovered vLLM generation model %r at %s", model_id, base)
        return model_id
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

1. The loop examines entries in the returned list's order.
2. It reads each entry's ID, defaulting to an empty string if the field is missing.
3. It skips empty IDs and names containing `embed`. That is a naming heuristic, not capability inspection.
4. It stores the chosen ID and lookup timestamp under the endpoint's cache key.
5. The debug message records the selected ID and endpoint, without a prompt or model response.
6. It returns the first acceptable ID. The loop does not compare models, inspect their weights or rank their quality.

</details>

The implementation assumes the canonical name is declared before compatibility aliases. The historical serving configuration does put the canonical name first. That is a local contract between this deployment and these callers, not a universal promise about every model-list API. Changing order could change the selected name even if the same entries remained available.

The surrounding function raises a discovery error when the endpoint is unreachable or when no entry qualifies. It does not silently return another old hardcoded name. An error is useful information here: it says the application could not establish the interface it needed. It still needs sensible handling by the caller; raising an exception is not a complete availability strategy.

For a fresh check of this draft, I ran the retained helper with an in-memory response and a replaced network function. The synthetic list selected the expected generation ID. Other controlled cases checked cache reuse and expiry, a separate cache entry for another endpoint, an embedding-only list and an unreachable endpoint. Those are checks of source behaviour with controlled inputs. They establish nothing about today's GPU, the historical benchmark score or a live production request.

## The test environment was a caller too

One follow-up in the handover is more revealing than a tidy model score. A unit test began performing live discovery from the in-cluster CI runner. The runner could reach the production endpoint. Code that previously read a constant now made a network request, and the test inherited that side effect when its environment did not provide a pin.

That made the test depend on the model service's availability and current served names. A failure could reflect an operational change rather than the code under test. A pass could depend on a service nobody meant to include in the unit test. Neither is a good way to establish a repeatable test boundary.

The retained graph-client fixture replaces the discovery function after loading the module. The test can exercise client initialization while deciding exactly which model name discovery supplies.

<p class="code-source">Exact fragment, dedented: packages/rootweaver-graph/tests/test_rootweaver_graph_vw1102_generic_client.py, graphiti_client_module() fixture, historical commit 2e2991b0. Surrounding stub setup omitted.</p>

```python
monkeypatch.setattr(
    module, "discover_vllm_generation_model", lambda *a, **k: "discovered-model"
)
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

1. `monkeypatch.setattr` temporarily replaces an attribute used by the loaded module.
2. The replacement accepts the arguments the caller supplies and returns the fixed name `discovered-model`.
3. The call closes with the replacement installed for the test. Pytest restores patched attributes after the test's scope; this snippet does not prove every other network path is stubbed.

</details>

The [pytest project's monkeypatch documentation](https://docs.pytest.org/en/stable/how-to/monkeypatch.html) explains that substitution mechanism. The separate discovery tests in the same historical commit replace `urlopen` with an in-memory model-list response. That lets them test list selection, failures and cache behaviour without asking a real model server to participate.

The design lesson is precise: when a refactor replaces a constant with I/O, inspect the tests that load or initialize that code. Mocking the name at the consumer boundary and testing discovery separately serve different purposes. One keeps a client test controlled; the other checks how discovery behaves. Neither replaces a deliberately scoped live integration check.

The point of the rehearsal is to make the behaviour repeatable before involving the operating service. If the rehearsal can reach production unnoticed, the test boundary needs review as much as the application boundary does.

![The engineer uses an isolated rehearsal rig with the operating equipment behind a glass partition.](/posts/s5e02/review-v3/ci-isolation-v3.png)

<p class="caption">A controlled test decides what the dependency returns instead of quietly borrowing a live service. Conceptual illustration, not a historical photograph.</p>

## Changing the judge changed the ruler

The same model deployment also reached evaluation components. The handover warns that the replacement judged identical input more strictly. Its recorded examples changed a risk score from 7 to 8 and an alignment score from 5 to 3.

| Recorded comparison on identical input | Earlier judge | Replacement judge |
|---|---|---|
| Risk score | 7 | 8 |
| Alignment score | 5 | 3 |

These are the handover's observations, not an independent re-score in this draft. I do not have the raw inputs, rubric or full output set here. The table shows a discontinuity after the evaluator changed. It does not establish which judge was right, whether every score moved in the same direction, or whether a particular application answer became worse.

The input being unchanged is the important part of that example. If a dashboard draws one continuous trend line across a judge change, a reader may attribute the step to the application being measured. In this case the measuring instrument changed too. The historical comparison needs a visible version boundary before it can support a claim about improvement or regression.

A practical response is to retain the judge identity, rubric, prompt and input with the score, and to compare a shared set when introducing a new evaluator. That is a lesson I would carry into the next evaluation, not a claim that this package contains a completed calibration study. A model that passes a task harness is not automatically a calibrated replacement judge.

The better question was no longer just whether the 4B model could answer. It was which roles the platform had assigned to that model, what evidence each role needed, and which comparisons stopped being like-for-like when it changed.

![The engineer compares two mechanical scales using the same brass reference weight.](/posts/s5e02/review-v3/judge-v3.png)

<p class="caption">Changing the measuring instrument can change the reading even when the object being measured stays the same. Conceptual illustration, not a historical photograph.</p>

## More local capacity did not automatically change the routing policy

There was one more boundary around the new context capacity. The handover says the oracle's overflow router still sent inputs above roughly 32K tokens to the paid fallback, while the new local serving ceiling was about 114K. The capability of the server and the policy of its caller had diverged.

Raising the server limit therefore did not mean longer application requests immediately used it. The old threshold could keep routing around the new local capacity. Conversely, simply raising the threshold would not establish that the longer requests were useful, fitted their total input/output budget or met the application's latency requirements.

The right next test was a routing decision followed by an observed outcome: which lane did this request select, which model answered, how much context did it receive and did the result satisfy the task? The retained handover lists threshold retuning as follow-up work. It does not supply a successful new routing benchmark, so this episode ends with that decision still open.

Alias retirement has the same shape. Discovery fixed defaults in source, but explicit configuration, old images and compatibility names still required inspection. The historical report records gateway, SRE triage, structured-output and legacy-alias checks after promotion. Those are useful reported installation checks. They are not evidence that every consumer had migrated, that every historical score was comparable or that the graph's full backfill had completed.

## What the smaller model had actually earned

The July record supports a bounded decision: the candidate passed enough of the reconstructed task checks for its authors to accept the citation-format exception, it was tested at longer input lengths, and its promotion received reported integration checks. The inspected code explains how some callers were changed to find the served name. The new offline demonstrations make that mechanism inspectable without pretending to replay the model evaluation.

What I would carry forward is the order of work. State the workload before choosing the model. Keep strict failures visible when reviewing exceptions. Inspect the serving arguments and dependency revision. Follow the model name into each caller. Keep unit tests independent of a live endpoint. Mark any change to the model that judges the results. Then measure whether the routing policy actually uses the capacity that was gained.

| Lesson from the change | What I would check next time |
|---|---|
| Fitting weights is only the start | Account for cache, response budget and concurrency |
| A reviewed exception is still an exception | Retain the raw score and why the decision changed |
| A model name is an interface | Inspect pins, discovery, aliases and deployed consumer images |
| A new lookup adds I/O | Review test fixtures and failure handling with the change |
| A cache buys fewer lookups at a cost | Test expiry and make the possible staleness explicit |
| A new judge changes the comparison | Keep evaluator identity and a shared comparison set |
| A larger context limit is not a routing change | Follow one request through lane selection and outcome |

That is what made this a platform change rather than a smaller-model announcement. The useful gain was the possibility of doing the platform's work with more context on the same card. Earning that place also meant exposing the assumptions around the model, including ones that a successful benchmark alone could not find.

The next July thread is the gap between that larger local context and the router's existing threshold. The retained follow-up points there; the next chapter still needs its own source audit before I can say what changed or whether it worked. More room became available in the reported deployment. Putting it to useful work was the next question.

## Terms and references

<details data-glossary class="glossary"><summary>Glossary — plain-English definitions</summary><div class="glossary-tools" hidden><label for="glossary-search">Find a term</label><div class="glossary-search-row"><input id="glossary-search" type="search"><button type="button">Clear</button></div><p role="status" aria-live="polite"></p></div><section class="glossary-term"><h3>AWQ quantization</h3><p>Lower-precision weight storage; the exact quantized model still needs validation.</p></section><section class="glossary-term"><h3>KV cache</h3><p>Attention keys and values retained during generation, sharing the memory budget with other work.</p></section><section class="glossary-term"><h3>Context window</h3><p>The sequence token budget, including input and response; it is not a quality score.</p></section><section class="glossary-term"><h3>Needle probe</h3><p>Recovering a planted detail in longer input, rather than a full reasoning evaluation.</p></section><section class="glossary-term"><h3>Speculative decoding</h3><p>A draft model proposes tokens that the served model checks.</p></section><section class="glossary-term"><h3>Served model name</h3><p>The ID accepted by the endpoint; it need not equal the weight repository name.</p></section><section class="glossary-term"><h3>Compatibility alias</h3><p>Another accepted name for the same deployment, helping older callers keep working.</p></section><section class="glossary-term"><h3>Explicit pin</h3><p>A configured model name taking priority over discovery.</p></section><section class="glossary-term"><h3>Service discovery</h3><p>Looking up the interface currently offered by a service, not ranking model quality.</p></section><section class="glossary-term"><h3>Cache TTL</h3><p>The lifetime of a cached lookup; this helper uses 300 seconds.</p></section><section class="glossary-term"><h3>Monkeypatch</h3><p>A temporary replacement of an attribute or environment value for a controlled test.</p></section><section class="glossary-term"><h3>Judge drift</h3><p>A score change caused by changing the evaluator, affecting comparisons across versions.</p></section><section class="glossary-term"><h3>Overflow routing</h3><p>Sending a request to another inference lane above a configured threshold.</p></section><section class="glossary-term"><h3>Revision pin</h3><p>A specific dependency revision instead of a moving repository name.</p></section><p>Official references: <a href="https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507">Qwen model card</a>, <a href="https://docs.vllm.ai/en/latest/configuration/optimization/">vLLM optimization</a>, <a href="https://docs.pytest.org/en/stable/how-to/monkeypatch.html">pytest monkeypatch</a>.</p></details>

<details class="source-note">
<summary>How this episode was reconstructed</summary>

This is a curated account of the July 2 model comparison, promotion and caller-discovery follow-up. The earlier graph-ingestion chapter supplies the transition, not additional proof of this model's quality. The retained benchmark report and handover are historical reports; the serving configuration, consumer, discovery helper and test snapshots were independently inspected at their recorded Git commits. Fresh checks execute only controlled offline source behaviour and arithmetic. They do not rerun the model benchmark, probe a live model endpoint or reproduce the original native conversation.

The raw original benchmark harness, result JSONs, judge inputs and a complete native-session replay are not retained in this package. No exhaustive July 2 inventory is claimed. Later alias retirement, routing retuning and speculative-model experiments are outside the outcomes established here. Unrelated personal and excluded project material was not used. Current upstream references explain the mechanisms; they are not historical deployment observations.

</details>

<script is:inline src="/posts/s5e02/review-v3/reader.js"></script>
<style is:global>main{min-width:0}main>p:not(:has(img)){max-width:74ch}main>ul,main>ol{max-width:74ch}.eyebrow{text-transform:none;letter-spacing:.025em}.reading-progress{position:fixed;left:0;top:0;height:3px;width:0;background:var(--accent);z-index:20;pointer-events:none}.reading-tools{max-width:1160px;margin:0 auto;padding:14px 28px 0;display:flex;justify-content:flex-end;gap:8px}.reader-button,.copy-code,.expand-diagram{border:1px solid var(--border);background:var(--card);color:var(--text);padding:7px 11px;border-radius:6px;font-size:11px}.copy-code{float:right;margin-left:10px}.code-source{display:flow-root}.contents a[aria-current="location"]{color:var(--accent);font-weight:600}.reading-focus .contents{display:none}.reading-focus .page-grid{display:block;max-width:800px}.reading-focus .nav-links>a{display:none}.reading-focus .article-header{max-width:none}.diagram{position:relative}.expand-diagram{display:block;margin:12px auto 0;background:#192d46;color:#eef6ff;border-color:#5c86a6}dialog{width:min(96vw,1300px);height:92vh;max-height:92vh;padding:18px;border:1px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text)}dialog::backdrop{background:rgba(0,0,0,.8)}.dialog-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}.diagram-scroll{overflow:auto;height:calc(100% - 54px);background:#101c2d;border-radius:8px}.diagram-scroll img{width:1200px;max-width:none;border-radius:0;margin:0 auto}.sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:600px){.reading-tools{padding:12px 18px 0}.copy-code{padding:4px 7px}.dialog-head{font-size:12px}dialog{padding:10px}.diagram-scroll img{width:1000px}}
.article-header{border-left:3px solid var(--accent);padding-left:22px}.eyebrow{margin-top:25px}.page-grid{grid-template-columns:minmax(0,740px) 210px;gap:64px}.code-box{box-shadow:0 8px 22px #00000012}h2{border-bottom:0;padding-bottom:0}.caption{border-left:0;padding-left:0}@media(max-width:600px){.article-header{padding-left:15px}}
details.walkthrough{padding:0}details.walkthrough summary{padding:13px 18px;cursor:pointer;color:var(--accent);font-size:12px;font-weight:550;list-style-position:inside}details.walkthrough summary:hover{background:var(--chip)}details.walkthrough[open] summary{border-bottom:1px solid var(--border)}details.walkthrough .explanation-body{padding:14px 18px}details.walkthrough summary:focus-visible{outline-offset:-4px}@media(max-width:600px){details.walkthrough summary{padding:12px 14px}details.walkthrough .explanation-body{padding:12px 14px}}

main{min-width:0}.notebook-article table{display:block;max-width:100%;min-width:0;overflow-x:auto}.table-wrap{overflow:auto;max-width:100%}table{min-width:580px}summary{cursor:pointer}details.glossary,details.source-note{border:1px solid var(--border);border-radius:8px;padding:16px;margin:25px 0}.glossary-term{border-top:1px solid var(--border)}.glossary-tools input{font:inherit;max-width:100%}.glossary-search-row{display:flex;gap:12px}.glossary-search-row input{min-width:0}.glossary-tools button,.flow-tools button{font:inherit;padding:7px 12px}.code-source{font-size:12px}.contents{margin-top:160px}pre{overflow:auto}h3{font-size:17px}figcaption,.caption{font-size:12px}code{overflow-wrap:anywhere;white-space:normal}pre code{white-space:pre}.flow-tools{display:flex;gap:12px;margin:10px 0}.publish-flow{margin:28px 0}.publish-flow h3{margin:0 0 14px}.publish-flow figcaption{line-height:1.6;color:var(--muted,#aab0bc)}.flow-tools button,dialog button{background:#1c1e24;color:#e9eaee;border:1px solid #75608f;border-radius:6px;padding:9px 12px;cursor:pointer}.flow-mobile{display:none}.flow-desktop svg,.flow-mobile svg{display:block;width:100%;height:auto}dialog{color:var(--text);background:var(--bg);border:1px solid var(--border);max-width:min(1150px,95vw);max-height:90vh;width:95vw}dialog::backdrop{background:#000b}.asset-option{margin:38px 0}.review-links{display:flex;gap:18px;flex-wrap:wrap}@media(max-width:600px){input{font-size:16px!important}.flow-desktop{display:none}.flow-mobile{display:block}code{font-size:.88em}}
main{min-width:0}main img{width:100%;height:auto;display:block}.story-flow{margin:28px 0}.story-flow h3{margin:0 0 14px}.story-flow figcaption{font-size:12px;line-height:1.6;color:var(--muted)}.flow-mobile{display:none}.flow-desktop svg,.flow-mobile svg{display:block;width:100%;height:auto}.table-wrap{overflow-x:auto;max-width:100%}.notebook-article table{display:block;min-width:0;max-width:100%;overflow-x:auto}.notebook-article p{font-size:15px}pre{max-width:100%;overflow-x:auto}code{overflow-wrap:anywhere}pre code{white-space:pre}.asset-option{margin:35px 0}.review-links{display:flex;flex-wrap:wrap;gap:14px}summary{cursor:pointer}dialog{max-width:95vw;width:1000px;background:var(--bg);color:var(--text)}dialog::backdrop{background:#000b}@media(max-width:600px){main p,main li{font-size:14px}.flow-desktop{display:none}.flow-mobile{display:block}.glossary-search-row{display:flex;gap:8px}.glossary-search-row input{min-width:0;font-size:16px}}</style>
<style is:global>@media(max-width:600px){.notebook-article p,.notebook-article li{font-size:14px!important}}</style>
