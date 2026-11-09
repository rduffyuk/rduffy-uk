# References and software credits

The website cites these directly at the relevant setup statements and in a visible References section. These are upstream credits, not endorsements or matched benchmark baselines.

1. Niko1221 and the Strata contributors. Strata, revision870aedd9e1ebe1c91f94da93b59af17729f6c5c0. https://github.com/Niko1221/Strata/tree/870aedd9e1ebe1c91f94da93b59af17729f6c5c0 . Local0.1.54-sessionmem build plus the two disclosed patches; MIT notice retained.
2. ISTA-DASLab. Qwen3.8-Flash-Next-GSQ-RCO-GGUF, revisioned59f92082b1e93c0e96d60a8b11aab089b52f09, IQ2_XS two shards. https://huggingface.co/ISTA-DASLab/Qwen3.8-Flash-Next-GSQ-RCO-GGUF/tree/ed59f92082b1e93c0e96d60a8b11aab089b52f09 . Base:Qwen/Qwen3.8-Flash-Next; historical base revision not pinned by quantizer.
3. Dadgarnia et al. (2026). GSQ: Highly-Accurate Low-Precision Scalar Quantization for LLMs via Gumbel-Softmax Sampling. arXiv2604.18556v2. https://arxiv.org/abs/2604.18556v2 . Preprint.
4. Helcig and Alistarh (2026). Model Compression with Exact Budget Constraints via Riemannian Manifolds. arXiv2605.00649v3. https://arxiv.org/abs/2605.00649v3 . Preprint.
5. NVIDIA. CUDA Toolkit13.0 release notes. https://docs.nvidia.com/cuda/archive/13.0.0/cuda-toolkit-release-notes/index.html . Toolchain documentation, not an inference-performance result.
6. Hunter (2007). Matplotlib: A2D Graphics Environment. Computing in Science & Engineering9(3),90–95. https://doi.org/10.1109/MCSE.2007.55 . Plotting version3.11.2 and font notices are disclosed.
7. Zagitta/gpu-unlock, background project. https://github.com/Zagitta/gpu-unlock . Historical fork/revision is recorded separately; no present benchmark speedup is attributed to it.

A citation acknowledges work; a licence sets reuse conditions. The MIT and Qwen notices, metadata/body mismatch, owner-approved own-code/content licences and redistribution exclusions remain separate from the bibliography. Our CITATION.cff describes how to credit this benchmark; it does not substitute for these upstream citations.

## Mechanism explanation — additional primary sources

Checked 9 November 2026. Current vLLM documentation is capability evidence, not a tested head-to-head baseline or exact-model support qualification.

8. Fedus, Zoph and Shazeer. Switch Transformers. https://arxiv.org/abs/2101.03961 . Conditional expert computation; not a source of performance numbers for this deployment.
9. Kwon et al. Efficient Memory Management for Large Language Model Serving with PagedAttention. https://arxiv.org/abs/2309.06180 . The paper's measured comparisons do not compare Strata.
10. Pinned Strata memory modes: https://github.com/Niko1221/Strata/blob/870aedd9e1ebe1c91f94da93b59af17729f6c5c0/docs/DETAILS.md . Bounded host residency, file fallback, KV controls.
11. Pinned Strata expert execution contract: https://github.com/Niko1221/Strata/blob/870aedd9e1ebe1c91f94da93b59af17729f6c5c0/include/strata/core/expert_source.hpp . CPU expert parts and GPU combination, router coefficients applied once.
12. vLLM KV design: https://docs.vllm.ai/en/latest/design/paged_attention/ . Block-based KV; its kernel walkthrough is explicitly historical.
13. vLLM automatic prefix caching: https://docs.vllm.ai/en/latest/features/automatic_prefix_caching/ . Repeated prefill avoidance, not faster generation by itself.
14. vLLM weight offload: https://docs.vllm.ai/en/latest/configuration/engine_args/ . Documented UVA/prefetch controls.
15. vLLM KV offloading: https://docs.vllm.ai/en/latest/features/kv_offloading_usage/ . Request-state offloading is separate from weights.
16. vLLM expert parallelism: https://docs.vllm.ai/en/latest/serving/expert_parallel_deployment/ . MoE support; no claim of exact IQ2_XS pack support.

17. Linux kernel cgroup v2 memory accounting: https://docs.kernel.org/admin-guide/cgroup-v2.html#memory-interface-files . Charge includes file cache; shmem is a subset of file.
18. Ollama CPU/GPU split: https://docs.ollama.com/faq#how-can-i-tell-if-my-model-was-loaded-onto-the-gpu ; context memory: https://docs.ollama.com/context-length .
19. SGLang CPU offloading: https://docs.sglang.io/docs/advanced_features/server_arguments#offloading . Capability reference, not an exact-model compatibility or matched speed result.
