# Source and environment disclosure

Published by Ryan Duffy, 9 November 2026. This is a benchmark of one configured deployment, not a stock-Strata result or a controlled comparison of every setting.

## Engine and local changes

The engine identifies as Strata 0.1.54-sessionmem, CUDA13.0, sm89, based on [Strata revision870aedd9e1ebe1c91f94da93b59af17729f6c5c0](https://github.com/Niko1221/Strata/tree/870aedd9e1ebe1c91f94da93b59af17729f6c5c0). The measured binary SHA256 is `e5761f48c6ee42ed2a747765219275e8823c10b2f187e23d412f3c2665f0f3af`. It is a local build, not a vendor-signed binary.

Two ordered patch files are supplied under `source/patches/`:

1. `01-no-mtp-save-restore.patch` adds the no-MTP SAVE/RESTORE path and regression cases.
2. `02-session-memory-advice.patch` adds bounded model-file-cache advice before SAVE/RESTORE admission, re-samples the existing admission floor, and adds two local headers. This is not a global OS cache flush or a safety-threshold reduction.

Apply with `patch --batch --fuzz=0 -p1 < PATH_TO_PATCH`, first01 then02, in the pinned source checkout. Both patches applied without fuzz in a fresh downloaded source extract during release preparation. All seven affected code/header/test-file hashes matched the retained deployed build inputs or the retained native build-source readback. `source/patch-verification.json` records the comparisons. The historical source-archive and patch receipt digests do not equal the newly downloaded archive/retained patch transport bytes; we do not claim those archives are byte-identical. The code comparisons, current patch digests and exact upstream revision are the disclosure anchors.

No fresh CUDA compilation, full dependency rebuild or bit-identical-binary reproduction was performed for this package. The original build used CMake/Ninja, CUDA13.0 with architecture89, enabled CUDA, disabled the broad build-tests target and enabled conversation tests; the later host-only object rebuild retained existing CUDA objects. A fresh build from the supplied source is a new build and must be qualified independently. Upstream dependencies and toolchain licences remain applicable; no compiler, driver, CUDA libraries, engine binary or dependency tree is bundled.

## Model and tokenizer

Weights came from [ISTA-DASLab/Qwen3.8-Flash-Next-GSQ-RCO-GGUF](https://huggingface.co/ISTA-DASLab/Qwen3.8-Flash-Next-GSQ-RCO-GGUF/tree/ed59f92082b1e93c0e96d60a8b11aab089b52f09), revision `ed59f92082b1e93c0e96d60a8b11aab089b52f09`, IQ2_XS, two shards. File names, sizes and retained SHA256 pins are in `environment.json`. These were not rehashed from all68GB of weights during publication preparation. No training or weight editing was performed by the benchmark.

The exact chat-template hash and vocab/merges/token-type hashes are included. The quantizer's card names its base model but does not pin the base-model revision. Its Apache-2.0 metadata conflicts with the body specifying inherited base terms; `licence-review.md` explains this. No weights, tokenizer files, model-pack tensors or expert-profile binary are redistributed. Links and fingerprints identify inputs; they do not grant new rights or prove generation replication by themselves.

## Fixed operating profile and safety

`environment.json` gives the native flags and environment overrides: int8KV;262144totalcontext;32768residentKV;1536MiBVRAMreserve;8GiBexpert-residentbudget;auto-prefill;6poolworkers;spec2;promptcacheon;conversationcachebudget0;session-save-reclaimon. Native advisory memory-limit0 is distinct from external containment: MemoryHigh34GiB, independentstop36GiB, MemoryMax38GiB, swap0 and hostreserve12GiB. The original CPU quota was1200%,Nice10;GPUcap200W. Temperature0,top-p1,thinkingoff and1024outputcap were fixed.

A local API/session wrapper, native timing tap and independent fail-closed observer were part of the deployment. The wrapper and site-specific admission/monitoring implementation are not distributed as a portable live service. Engine SAVE/RESTORE patches and sanitized method records are supplied; the generated model pack, selected expert profile and exact wrapper/instrumentation behavior still have to be matched for exact generation replication. An upstream-only engine with the same version label is not an exact substitute. This package intentionally contains no executable serving launcher, guard override or automatic GPU request loop.

For a generation comparison, obtain permitted inputs, verify the recorded hashes and native/API token counts, use the exact messages/schedule/settings, keep evaluator answer keys out of model requests, retain every failure and disclose differing binaries, wrappers or cache behavior. Do not silently retry, drop failures, strip Markdown before primary scoring or merge independent datasets. Keep your existing hard safety controls and limits intact. Offline scoring requires no inference service.

## Driver and unlock history

The measured system used an RTX4080 16GiB, i9-13900KF, approximately64GBhostRAM, NVIDIA open kernel driver615.71.09, Linux7.0.0-34-generic, VBIOS95.03.2B.00.65, CUDA13.0/sm89 build and200Wcap. A driver version, build target and quantization format describe different layers.

A separate30October experimental Ada unlock used the JustAResearcher/gpu-unlock-ada PR113 source revision `f19bcb5ac8981913d05264943406ffe8f99ce081` plus a local timeout-containment change. It recorded selector full=1 on a different boot. Its small matched comparison did not establish a practical Strata speed benefit and had storage/cache confounds. V7 and the stronger-prompt follow-up instead ran on a stock boot entry that blacklisted `gpu_unlock`, with no module loaded. These observations do not independently measure the silicon's current rate or exclude volatile warm-boot persistence. Current rate state is UNKNOWN. This is not an unlocked-versus-stock benchmark, unlock tutorial or firmware-distribution package.

## Evidence boundary

All data are synthetic task inputs and observed outputs, allowlisted from retained native/SSE records. Private infrastructure endpoints, pod/service identities, absolute host paths, credential material and raw operational logs are excluded. Raw-source hashes identify the retained evidence; the public release is a sanitized derivation, not the entire original operational archive. Hash manifests show consistency with the approved package bytes, not independent third-party validation or publisher-origin authentication.

The measured V7 six-hour-forty-one-minute batch and separate one-hour-three-minute formatting follow-up do not qualify multi-day continuous autonomous tool use, crash/reboot recovery, general long-context reasoning or coding quality. No model reload or loader-start comparison was part of these completed batches. No inference, runtime/driver/boot change, new production activation, safeguard change or public posting occurred during this preparation.
