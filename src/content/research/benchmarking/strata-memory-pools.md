---
title: "How Strata uses GPU, RAM and SSD"
description: "A visual explanation of expert routing, memory placement and KV cache, alongside a configured 256K benchmark."
category: benchmarking
pubDate: 2026-11-09
---

<figure class="research-hero">
<img src="/benchmarks/strata/strata-workstation-hero-v2.png" width="1671" height="941" alt="Anime illustration of an engineer examining an open workstation with a GPU, RAM and SSD, in a quiet home lab." fetchpriority="high" />
<figcaption>A small GPU within a larger memory system. Conceptual artwork; the measured allocations appear below.</figcaption>
</figure>

A model can occupy far more storage than a graphics card has memory. The interesting question is whether the work needed for each token can still fit a useful latency and memory budget.

Our configured Strata deployment used a 16 GiB RTX 4080 to run a quantized MoE model stored in two files totalling about 68 GB. We measured prefill, prefix reuse, decode and exact retrieval through a 262,144-token window. This article explains the mechanism behind that configuration. The [benchmark report](/benchmarks/strata/) contains the measurements, prompts, limitations and [offline reproduction package](/benchmarks/strata/reproduction.zip).

This is a characterisation of one configured system. It includes local engine patches, a constrained memory profile and a narrow retrieval workload. It does not establish continuous autonomous-agent reliability or a performance advantage over another engine.

## Three pools, different jobs

Strata spreads model storage and execution across GPU memory, host RAM and SSD-backed files. These pools have different bandwidth, latency and capacity. They cannot be added together as interchangeable memory.

<figure class="memory-story" id="memory-story">
<iframe src="/benchmarks/strata/memory-explainer/" title="Strata: experts, shared memory and GPU-only limits" loading="eager"></iframe>
<figcaption>Three views: which weights work for a token, where our memory goes, and how offloading gets beyond VRAM. In the memory view, each matrix cell represents 1 GiB, not one expert. Pool totals and their accounting definitions are labelled; activity glow is illustrative.</figcaption>
</figure>


The GPU keeps a cache of expert weights. For a decode step, cached experts can run on the GPU while the CPU computes other selected experts using host-accessible weights. Their partial results are combined using the router's coefficients. The pinned implementation applies those coefficients once, in the combine step. An expert missing the GPU cache does not necessarily have to be copied to the GPU before it can execute. [Strata expert execution contract](https://github.com/Niko1221/Strata/blob/870aedd9e1ebe1c91f94da93b59af17729f6c5c0/include/strata/core/expert_source.hpp).

Our host expert-residency budget was **8 GiB**. This is important: the upstream overview's all-experts-in-RAM description does not fully describe this bounded profile. With a resident budget, selected expert data outside the retained RAM set can fall back to model files. The operating system may serve those reads from page cache or fetch pages from SSD; a logical file read does not prove a physical SSD read. Page cache occupies the same host RAM, not a fourth independent pool. SSD stores and supplies data; it does not compute expert outputs. [Pinned Strata memory modes](https://github.com/Niko1221/Strata/blob/870aedd9e1ebe1c91f94da93b59af17729f6c5c0/docs/DETAILS.md).

The expert-selection view uses illustrative selections, not a measured routing trace. Its recurring hot outlines explain locality. The recorded profile used a selected expert profile with `--adapt-swaps 0`; the visual does not imply measured automatic promotion or learning during the study.

This is a capacity tradeoff. Cache misses, CPU work and data movement can add latency. Avoiding an out-of-memory failure is useful, but it is not equivalent to having the whole working set resident in fast GPU memory.

## Where the chosen model's memory actually goes

We used **ISTA-DASLab Qwen3.8-Flash-Next-GSQ-RCO-IQ2_XS**. Its two pinned GGUF files total **68.03 GB (63.35 GiB)**. That is their size on disk, not an amount divided into independent chunks across GPU and RAM. Cached copies can coexist with their backing files.

| Pool | Capacity or extent | Observed footprint |
|---|---|---|
| RTX 4080 | 15.99 GiB reported device capacity | About **14.48 GiB occupied** at the loaded startup checkpoint, with 1.51 GiB physically free. This includes buffers and other device occupancy, not just cached experts. |
| System RAM | 62.56 GiB OS-reported usable memory | The completed V7 run's retained readings reached **34.0048 GiB (36.5124 GB)** charged to the engine's cgroup, including file cache. The sample median was 33.9976 GiB. |
| SSD | 63.35 GiB of GGUF backing files | The files remain on SSD while some data is also cached in faster pools. Generated packs and saved sessions add storage not quantified here. This is not drive capacity. |

### Why the 8 GiB figure was only part of the answer

The startup log reports **8.00 GiB of pinned expert copies** and **3.09 GiB of full pinned KV capacity** in RAM. Those are functional allocations, not the entire host footprint. File-backed pages, shared memory, runtime buffers and kernel accounting also contribute to the cgroup's charge. They must not be added again on top of that total. In particular, Linux's `memory.stat` file counter includes shared memory; `shmem` is a subset, not another additive bucket. This measure is not process RSS or free host memory. [Linux cgroup memory accounting](https://docs.kernel.org/admin-guide/cgroup-v2.html#memory-interface-files).

The RAM reanalysis covers **48,107 in-call sample rows and 2,750 before/after observations** across the same 1,375 completed V7 calls. The retained range was 30.4600–34.0048 GiB. This is the maximum of sampled readings, not a continuously observed kernel peak, and the readings are not independent prompt repetitions. **38 GiB was the configured memory ceiling**, while memory-high was 34 GiB and the independent stop was 36 GiB; none of those limits changed for this explanation. [Retained RAM summary](/benchmarks/strata/ram-summary.json) and the reproduction package include the numeric export and its offline replay.

The GPU's 9.33 GiB expert cache was likewise only one component of its approximately 14.48 GiB occupied footprint. Its nominal resident K/V payload is estimated as `3.09 × 32768 / 262144 ≈ 0.39 GiB`, using the rounded host allocation and the same-format pool layout. Maps, page tables, recurrent state and other buffers are separate. About 4.76 GiB is an arithmetic residual, not a measured attribution to individual allocations. The free checkpoint includes the configured 1.50 GiB reserve. GPU startup and in-run RAM observations are different checkpoints, not one simultaneous snapshot. [Pinned KV allocation source](https://github.com/Niko1221/Strata/blob/870aedd9e1ebe1c91f94da93b59af17729f6c5c0/src/core/layer.cpp), [startup excerpt](/benchmarks/strata/startup-memory-excerpt.json), [numeric facts](/benchmarks/strata/memory-facts.json).

KV holds attention state **for** the context; it is not literal input text or the context limit. This hybrid model has other sequence state too. Our run preallocated KV capacity for 262,144 cells, with a 32,768-cell GPU working set per QSA layer. The context control fills logical cells within that fixed reservation rather than allocating the full 3.09 GiB anew. Active KV streaming is **RAM ↔ VRAM** here. Saved sessions on SSD are separate. [Strata memory modes](https://github.com/Niko1221/Strata/blob/870aedd9e1ebe1c91f94da93b59af17729f6c5c0/docs/DETAILS.md#memory-modes).

## Why MoE changes the placement problem

<figure class="moe-art">
<img src="/benchmarks/strata/strata-following-token-v2.png" width="1672" height="941" alt="Anime illustration of an engineer examining a layered lattice with a few illuminated expert blocks in each band." loading="lazy" />
<figcaption>Following a token through selected experts within successive layers. Conceptual illustration; block counts and the glowing path are not a recorded routing trace.</figcaption>
</figure>

A transformer processes a token through successive layers. In a conventional dense feed-forward block, the token uses that block's dense parameter matrices. A mixture-of-experts block instead routes the token to a subset of feed-forward parameter blocks called experts. They are numerical functions, not separate chatbots or agents. Attention, routing and other dense components still do work. [Switch Transformers](https://arxiv.org/abs/2101.03961).



The large grid shows one illustrative layer. Both dense and MoE models still traverse their transformer layers; sparsity here concerns the routed feed-forward experts within a layer. In the measured model, ten of 512 routed experts are selected **per layer, per token**, across 48 layers. That is about 1.95% of the routed expert count in one layer. It is not 1.95% of the model's total memory, parameter use or compute. A token traversing all 48 layers involves 480 routed expert-layer evaluations, alongside the rest of the architecture. See the [pinned quantization card](https://huggingface.co/ISTA-DASLab/Qwen3.8-Flash-Next-GSQ-RCO-GGUF/blob/ed59f92082b1e93c0e96d60a8b11aab089b52f09/README.md) and the reproduction package's model metadata.

Sparse selection creates an opportunity to keep frequently used experts close to compute while retaining the rest in slower storage. It does not remove the need to store the other experts. Across many tokens, the union of selected experts may be large. Cache behaviour depends on the workload and placement policy. Inference routing chooses computation; it does not train the model's weights. Cache-placement mechanisms also change where weights live rather than training them; automatic expert-cache swaps were disabled in our recorded profile.

Consider a toy step selecting E2 and E6 with coefficients 0.7 and 0.3. E2 is cached on the GPU; E6 runs on the CPU. If one component of their outputs is 4 and 10 respectively, the combined component is `0.7 × 4 + 0.3 × 10 = 5.8`.

<p class="source-label">Illustrative pseudocode for the toy step; not Strata's scheduler or API.</p>

```python
chosen, scores = route(hidden, k=2)
gpu_jobs, cpu_jobs = split_by_cache(chosen)
partials = compute_in_parallel(gpu_jobs, cpu_jobs)
expert_result = weighted_sum(partials, scores)
```

<details class="walkthrough"><summary>Explain this code line by line</summary>
<ol>
<li>The router chooses two toy experts and their combination coefficients. The measured model chooses ten per layer.</li>
<li>The placement lookup separates experts already cached on the GPU from work assigned to the CPU.</li>
<li>The branches produce expert outputs. A host-side file fallback may first need to supply weight bytes; this sketch omits scheduling and I/O details.</li>
<li>The outputs are weighted and summed once. The router coefficients here are distinct from the learned parameter matrices inside each expert.</li>
</ol>
</details>

A small dense model fitting entirely in VRAM may avoid these CPU and storage costs. Whether a larger offloaded MoE is a better choice depends on task quality, latency, throughput and memory constraints. We did not run a matched dense-model comparison.

## Weight placement and KV cache are different problems

Model weights are learned parameters reused across requests. KV cache is attention state derived from a particular token sequence. Reusing a shared prefix can avoid computing that prefix again; keeping expert weights near compute addresses a different bottleneck.

Prefill processes input tokens and establishes request state. Decode generates subsequent tokens using the accumulated state. Strata can schedule these phases differently: a many-token prefill can stream layer experts to the GPU rather than simply repeating the illustrated one-token decode schedule. The model is hybrid; applying an all-layers full-attention KV formula would misdescribe its actual memory requirements. [Pinned Strata implementation overview](https://github.com/Niko1221/Strata/blob/870aedd9e1ebe1c91f94da93b59af17729f6c5c0/docs/HOW_IT_WORKS.md).



vLLM's PagedAttention organises KV state in blocks and uses block tables to address it. Its automatic prefix caching reuses shared-prefix KV and avoids repeated prefill; it does not make newly generated tokens free. The PagedAttention design page explicitly marks its kernel walkthrough as historical, so its old kernel details should not be read as a current implementation listing. [vLLM KV design](https://docs.vllm.ai/en/latest/design/paged_attention/), [automatic prefix caching](https://docs.vllm.ai/en/latest/features/automatic_prefix_caching/), [PagedAttention paper](https://arxiv.org/abs/2309.06180).

| Question | Our configured Strata path | Documented vLLM capability |
|---|---|---|
| Where are model weights? | GPU expert cache, bounded host residency and file fallback | GPU execution with optional CPU weight offload, including documented UVA and prefetch backends |
| What happens to request state? | Recorded KV configuration and prefix reuse; distinct from expert placement | Block-based KV management, automatic prefix caching and optional KV offloading |
| Does it support MoE? | This study used a routed-expert model | Yes, including expert-parallel deployment |
| What did we measure? | One local request slot, finite context/retrieval and sustained-output workloads | No local comparison run in this study |

See [vLLM engine arguments](https://docs.vllm.ai/en/latest/configuration/engine_args/), [KV offloading](https://docs.vllm.ai/en/latest/features/kv_offloading_usage/) and [expert-parallel deployment](https://docs.vllm.ai/en/latest/serving/expert_parallel_deployment/). Weight offload and KV offload move different data. Fast host-device interconnects matter. These capabilities do not establish support or equivalent performance for our exact IQ2_XS model pack and configuration.

## What our measurements establish

The main V7 study repeated ten prompts across five consecutive sessions. Each of eight context lengths had 50 observations in each cold/cached condition. This is repeated measurement of ten prompts, not 50 independent prompts or replication across days.

| Observation | Result | Scope |
|---|---|---|
| Full campaign | 1,375 calls over 6 h 41 min 22 s | 850 measurements, 85 warmups, 440 resets; no unresolved calls or inference retry |
| Frontier cold prefill | 131.039 s median | 261,112 input tokens; zero KV reuse, not a global OS cache flush |
| Frontier cached prefill | 96 ms median | Same length, with all but seven input tokens reused |
| Separate sustained decode | 41.614 tokens/s median | 50 samples; 50 input and 1,024 actual output tokens per sample |
| Stronger JSON directive | 160/160 exact raw JSON and complete stops | A separate single pass, ten prompts per context/cache condition; not a new n=50 study |

The 256K frontier means **261,112 input + 1,024 output reserve + 8 internal tokens = 262,144**. The short context-test answers were not 1,024-token outputs at every context. Cached prefill at 96 ms is evidence of reuse, not a fresh 256K read in 96 ms.

The original V7 raw JSON-only score was 0/800 because responses included Markdown fences. A separately labelled fence-removal analysis recovered 800/800 exact values. Stronger instructions subsequently produced exact bare JSON across the grid using the same weights. This establishes instruction sensitivity on these fixtures, not a proven quantization defect. The original scores remain unchanged. Full prompts, raw outputs, evaluator keys and checks are in the [report and reproduction archive](/benchmarks/strata/).


### Prefill: new input versus a reused prefix

<figure class="benchmark-result">
<img src="/benchmarks/strata/v7-prefill.svg" alt="V7 prefill timing across eight input lengths, showing cold seconds and cached milliseconds separately." loading="lazy" />
<figcaption>V7 native prefill: 50 observations per context/cache condition. Points are medians; ranges are observed minimum–maximum, not confidence intervals. Cold and cached panels use different time units. Cold means zero KV reuse, not a global OS cache flush.</figcaption>
</figure>

### Decode: short answers across the context grid

<figure class="benchmark-result">
<img src="/benchmarks/strata/v7-decode.svg" alt="Cold and cached V7 decode rates across eight input lengths." loading="lazy" />
<figcaption>V7 decode for short answers of 72–83 tokens, with 50 observations per context/cache condition. Ranges are observed minimum–maximum. The separate 1,024-output-token test reported above is a different workload.</figcaption>
</figure>

### Stronger instructions: the JSON follow-up

<figure class="benchmark-result">
<img src="/benchmarks/strata/strong-json-context.svg" alt="Stronger-prompt follow-up showing exact raw JSON outcomes across eight context lengths." loading="lazy" />
<figcaption>A separate single-pass follow-up: ten cold and ten cached measurements per context length, 160/160 exact raw JSON and complete stops. This is not another n=50 campaign and does not change the original V7 score.</figcaption>
</figure>

These observations support using this configuration for the measured workloads. They do not qualify arbitrary schemas, difficult long-context reasoning, multi-user throughput, tool use or a continuously running background agent. Those require their own acceptance tests.

## What we configured and changed

We tested a local **Strata 0.1.54-sessionmem** CUDA 13.0/sm89 build based on revision `870aedd9e1ebe1c91f94da93b59af17729f6c5c0`. The two disclosed patches concern no-MTP save/restore and bounded model-file-cache advice before admission. This was a configured deployment, not a stock-engine baseline. [Exact source, patches and build limits](/benchmarks/strata/source-disclosure.md).

The hardware was an RTX 4080 with 16 GiB VRAM, i9-13900KF and approximately 64 GB RAM, with a 200 W GPU cap. The observed driver was NVIDIA **615.71.09**, on Linux **7.0.0-34-generic**. The profile used int8 KV, a 32,768-token resident KV setting, 8 GiB host expert residency and a 1,536 MiB native VRAM reserve. [Recorded environment](/benchmarks/strata/environment.json).

The safety envelope included a 34 GiB memory-high setting, an independent 36 GiB stop, a 38 GiB maximum, zero swap and a 12 GiB host reserve. These are limits for this machine, not suggested defaults for every deployment. No safety checks or thresholds were changed to prepare this article.

An experimental GPU unlock succeeded on a different historical boot. During this study the stock boot blacklisted `gpu_unlock`, and the module was absent. The actual silicon rate was unknown. We cannot attribute benchmark performance to an unlock, and no unlock code or firmware is bundled. [Historical disclosure and source reference](/benchmarks/strata/source-disclosure.md).

## What changes when the model exceeds VRAM?

VRAM is the fast working space. It need not be the only place model data can live. Our selected model has roughly 33 GiB of expert weights alone, so a strict all-weights-on-GPU setup cannot fit it on this 16 GiB card even before KV. Strata's tested configuration combines GPU caching, host execution and file-backed data to run beyond that capacity. This exchanges some fast residency for CPU work, interconnect traffic and possible storage reads; it does not make those costs disappear.

Other engines address related constraints with different mechanisms. [Ollama documents CPU/GPU splits](https://docs.ollama.com/faq#how-can-i-tell-if-my-model-was-loaded-onto-the-gpu) and [the context/offload performance tradeoff](https://docs.ollama.com/context-length). [SGLang documents CPU offloading](https://docs.sglang.io/docs/advanced_features/server_arguments#offloading) and hierarchical caching. vLLM's options are described above. These are model- and backend-dependent capabilities, not a claim that every engine supports our exact GGUF pack or a measured speed comparison. The useful question is whether the resulting latency, throughput and quality meet the intended workload.

## Practical lessons

- Specify the memory mode as carefully as the model name. Bounded expert residency with file fallback differs from holding every expert in RAM.
- Separate model capacity, expert placement and request-state reuse. Each can change a different part of latency.
- Report cold and cached work separately, with actual input/output and reuse counters.
- Treat output formatting as an experimental variable. Preserve the original raw score when introducing a stronger instruction or a posthoc parser.
- Use the benchmark as a starting point for a bounded agent-workload study, with tool correctness, failures and recovery measured explicitly.

## References, credits and reuse

The linked primary sources explain mechanisms and software provenance; they do not imply upstream endorsement. The reproduction package includes pinned Strata/model references, the GSQ and RCO papers, CUDA and Matplotlib credits, and retained third-party notices. vLLM documentation describes current features and is not a version-matched comparison deployment.

The two anime illustrations were generated with OpenAI’s image tool for this article and selected by Ryan. They provide conceptual context; the SVG charts show retained measurements.

Ryan Duffy led research design, configuration, acceptance criteria and operational verification. Codex agents assisted implementation, testing, experiment operation, analysis, packaging and this explanation.

Ryan approved **MIT for original code** and **CC BY 4.0 for the authored report, original fixtures, measurements and figures**. Third-party software, model terms and generated-output rights remain separate. Strata's MIT notice is retained. The quantization card's Apache metadata conflicts with its stated inheritance of the base Qwen Community Licence 1.0; no weights are distributed and no blanket Apache or commercial-service clearance is asserted. [Licence review](/benchmarks/strata/licence-review.md).


<details class="glossary"><summary>Glossary — terms used in this article</summary>
<label>Find a term <input type="search" data-glossary-search placeholder="e.g. expert or prefill" /></label>
<dl data-glossary-terms>
<div><dt>Expert</dt><dd>A routed feed-forward parameter block, not an autonomous agent. <a href="https://arxiv.org/abs/2101.03961">Switch Transformers</a>.</dd></div>
<div><dt>Router</dt><dd>The model component selecting experts and combination coefficients for the current token representation.</dd></div>
<div><dt>Weights</dt><dd>Learned parameter matrices and other model parameters, reused during inference.</dd></div>
<div><dt>KV cache</dt><dd>Keys and values retained for a token sequence's attention computation. <a href="https://docs.vllm.ai/en/latest/design/paged_attention/">KV design</a>.</dd></div>
<div><dt>Prefill</dt><dd>Input processing that establishes request state before generation.</dd></div>
<div><dt>Decode</dt><dd>Generating subsequent tokens using accumulated request state.</dd></div>
<div><dt>Prefix reuse</dt><dd>Reusing request state for a shared input prefix. <a href="https://docs.vllm.ai/en/latest/features/automatic_prefix_caching/">Prefix caching</a>.</dd></div>
<div><dt>Resident budget</dt><dd>The configured amount of host RAM used to retain selected expert data; other bytes can fall back to mapped files. <a href="https://github.com/Niko1221/Strata/blob/870aedd9e1ebe1c91f94da93b59af17729f6c5c0/docs/DETAILS.md">Strata memory modes</a>.</dd></div>
<div><dt>Quantization</dt><dd>A lower-precision representation of model parameters. It changes storage and can affect quality; this study does not isolate its causal effect.</dd></div>
</dl>
</details>
