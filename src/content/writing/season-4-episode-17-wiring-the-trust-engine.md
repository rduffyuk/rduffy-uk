---
title: Wiring the Trust Engine into This Blog
author: Ryan Duffy
description: Following the trust engine from library code into a working demonstrator, then checking what the cost and quality signals actually established.
pubDatetime: 2026-10-26T08:00:00Z
shippingDatetime: 2026-10-26T08:00:00Z
draft: false
episode: 17
series: 'Season 4: Building in Public — The Agent Era'
tags: [rootweaver, building-in-public, season-4, grounding, observability, ai-engineering]
---

The trust engine needed to do more than explain how a claim could be checked. I wanted to see what happened when the pieces ran together, what the resulting signals meant, and where a failed check would actually stop something.

[Episode 16](https://rduffy.uk/writing/season-4-episode-16-the-trust-engine/) covered the libraries behind that idea: the source registry, grounding, the audit store and the two checks around the final wording. This chapter follows the wiring work in the same June window. I set the direction and reviewed the work; coding agents assisted with implementation, investigation and the reports used to reconstruct it.

The less tidy part is that a working gate, a working dashboard and a publisher that obeys the gate are three different things. Following the actual entry point made that distinction much clearer than the ticket title did.

![The established engineer examines a proof at a small letterpress, beside a separate idle production press.](/posts/s4e17/review-v1/hero-A.png)

<p class="caption">A proof press can work without controlling the production run. Conceptual artwork, not a historical photograph.</p>

## Follow the entry point

The work item made the intention explicit: VW-995 — `rootweaver-audit: wire TwoPassPublishGate into production blog_publish_flow + emit gate/publish metrics (Child G deferred wiring)`. That is the recorded target. The implementation gives us a more precise account of what this slice delivered.

In the retained June source, `build_publish_pipeline()` constructs real components: a vault connector, a source registry, the grounding service, the gate service and the deterministic voice renderer. This is useful integration work. It is a path through the libraries rather than a picture of how they might fit together.

The command that calls it, however, is an observability emitter. Its `main()` builds that pipeline, sends it `demo_claims()`, pushes the resulting metrics and returns zero if those calls finish without raising an exception. The two claims are a curated corpus referring to earlier blog episodes. They are not the text of whichever new article is about to be released.

<p class="code-source">Exact historical excerpt: <code>rootweaver_audit_observability/emitter.py · main()</code>, snapshot <code>51667774</code>.</p>

```python
def main() -> int:
    """CronJob entrypoint: ground + gate the demo corpus, push the resulting
    gate/publish series to the pushgateway under the blog-publish-gate job."""
    from rootweaver_audit.config import Settings

    vault_root = os.environ.get("AUDIT_VAULT_ROOT", ".")
    gateway_url = os.environ.get("PUSHGATEWAY_URL", DEFAULT_PUSHGATEWAY_URL)
    pipeline = build_publish_pipeline(Settings(), vault_root=vault_root)
    emit_publish_metrics(pipeline, demo_claims(), gateway_url=gateway_url)
    return 0
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- `main() -> int` is the command entry point and returns a process exit code.
- `Settings` supplies the audit service configuration. The next two lines choose the vault root and metrics destination from the environment or defaults.
- `build_publish_pipeline(...)` assembles the real library path. Constructing it does not show that a website publisher calls it.
- `demo_claims()` supplies the fixed demonstration corpus. The emitter runs those claims and sends the resulting measurements to the metrics destination.
- `return 0` reports successful command completion. There is no branch here that turns a blocked `PublishDecision` into a nonzero exit, and no website release operation in this function.

</details>

That last point changes the story. A blocked claim can be recorded correctly while the command still completes successfully. That is reasonable for a demonstrator whose job is to report gate activity. It would be insufficient as the only release control if a publisher treated exit zero as permission to publish.

The later manifest reinforces this reading. Its header calls the job a “demonstrator emitter”, runs it hourly, and puts its writes in a dedicated `audit_demo` schema. Keeping demonstration events apart from the production audit chain is a sensible precaution. It also means those events should not be presented as evidence that each newly published article has passed a mandatory check.

The manifest entered retained history just after midnight on 25 June UK time, following the 24 June work. I use that narrow boundary receipt to confirm the job's intended role, rather than moving the whole episode into a later period.

## What a two-pass decision actually tells me

Inside the library, the sequence still matters. Gate one checks the claims before voice rendering. If that stage and the intermediate validations pass, the renderer produces the final wording and gate two checks that output. A failed earlier stage can mean gate two never runs.

A publishing system needs to preserve that distinction. “No second gate result” cannot quietly become “second gate passed”. Equally, a counter recording a decision is not the same operation as a caller obeying it.

<figure id="publish-path" class="publish-flow" data-policy-flow>
<h3>From curated claims to a recorded decision</h3>
<div class="flow-desktop"><svg xmlns="http://www.w3.org/2000/svg" class="publish-svg" viewBox="0 0 720 340" role="img" aria-labelledby="pub-d-title pub-d-desc"><title id="pub-d-title">Historical gate demonstrator: claims to recorded metrics</title><desc id="pub-d-desc">Claims pass through gate one, deterministic voice and, when eligible, gate two. The resulting decision is recorded in metrics. This inspected emitter does not establish a website release hold. Dotted connectors show direction, not live activity.</desc><defs><pattern id="pub-d-grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".8" fill="#3b3f4a"/></pattern><marker id="pub-d-arrow" viewBox="0 0 10 10" markerWidth="6" markerHeight="6" refX="9" refY="5" orient="auto"><path d="M0 0L10 5 0 10" fill="none" stroke="#a78bfa" stroke-width="1.5"/></marker></defs><style>.publish-svg{font-family:system-ui,sans-serif}.publish-svg .flow-motion{fill:none;stroke:#a78bfa;stroke-width:1.8;stroke-dasharray:3 7;animation:publish-dash 1.4s linear infinite}@keyframes publish-dash{to{stroke-dashoffset:-20}}.flow-paused .publish-svg .flow-motion{animation-play-state:paused}@media(prefers-reduced-motion:reduce){.publish-svg .flow-motion{animation:none}}</style><rect width="720" height="340" rx="12" fill="#141414"/><rect width="720" height="340" rx="12" fill="url(#pub-d-grid)"/><path data-flow-edge="" class="flow-motion" d="M159 57H321" marker-end="url(#pub-d-arrow)"/><path data-flow-edge="" class="flow-motion" d="M399 57H561" marker-end="url(#pub-d-arrow)"/><path data-flow-edge="" class="flow-motion" d="M639 57H692V156H120V166" marker-end="url(#pub-d-arrow)"/><path data-flow-edge="" class="flow-motion" d="M159 205H321" marker-end="url(#pub-d-arrow)"/><path data-flow-edge="" class="flow-motion" d="M399 205H561" marker-end="url(#pub-d-arrow)"/><g transform="translate(120,57)"><circle r="30" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="-12" y="-16" width="24" height="32" rx="2"/><path d="M-6-7h12M-6 0h12M-6 7h9"/></g></g><text x="120" y="110" text-anchor="middle" font-size="18" font-weight="650" fill="#e9eaee">Claims</text><text x="120" y="133" text-anchor="middle" font-size="14" fill="#aab0bc">Curated corpus</text><g transform="translate(360,57)"><circle r="30" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M0-17l15 6v12c-1 9-8 14-15 17-7-3-14-8-15-17v-12z"/><path d="M-6 0l4 5 9-11"/></g></g><text x="360" y="110" text-anchor="middle" font-size="18" font-weight="650" fill="#e9eaee">Gate one</text><text x="360" y="133" text-anchor="middle" font-size="14" fill="#aab0bc">Before wording</text><g transform="translate(600,57)"><circle r="30" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M-12 13l4-12L7-14l7 7L-1 8zM-8 1l7 7M4-11l7 7"/></g></g><text x="600" y="110" text-anchor="middle" font-size="18" font-weight="650" fill="#e9eaee">Voice</text><text x="600" y="133" text-anchor="middle" font-size="14" fill="#aab0bc">Deterministic</text><g transform="translate(120,205)"><circle r="30" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M0-17l15 6v12c-1 9-8 14-15 17-7-3-14-8-15-17v-12z"/><path d="M-6 0l4 5 9-11"/></g></g><text x="120" y="258" text-anchor="middle" font-size="18" font-weight="650" fill="#e9eaee">Gate two</text><text x="120" y="281" text-anchor="middle" font-size="14" fill="#aab0bc">When eligible</text><g transform="translate(360,205)"><circle r="30" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M-12-16h24v34l-6-4-6 4-6-4-6 4zM-6-7h12M-6 0h12M-6 7h7"/></g></g><text x="360" y="258" text-anchor="middle" font-size="18" font-weight="650" fill="#e9eaee">Decision</text><text x="360" y="281" text-anchor="middle" font-size="14" fill="#aab0bc">Clear or blocked</text><g transform="translate(600,205)"><circle r="30" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M-16-15v30h33M-9 8V0M0 8v-17M9 8v-12"/></g></g><text x="600" y="258" text-anchor="middle" font-size="18" font-weight="650" fill="#e9eaee">Metrics</text><text x="600" y="281" text-anchor="middle" font-size="14" fill="#aab0bc">Record result</text><text x="360.0" y="316" text-anchor="middle" font-size="14" fill="#aab0bc">Records a decision; website release enforcement is not established.</text></svg></div><div class="flow-mobile"><svg xmlns="http://www.w3.org/2000/svg" class="publish-svg" viewBox="0 0 360 640" role="img" aria-labelledby="pub-m-title pub-m-desc"><title id="pub-m-title">Historical gate demonstrator: claims to recorded metrics</title><desc id="pub-m-desc">Claims pass through gate one, deterministic voice and, when eligible, gate two. The resulting decision is recorded in metrics. This inspected emitter does not establish a website release hold. Dotted connectors show direction, not live activity.</desc><defs><pattern id="pub-m-grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".8" fill="#3b3f4a"/></pattern><marker id="pub-m-arrow" viewBox="0 0 10 10" markerWidth="6" markerHeight="6" refX="9" refY="5" orient="auto"><path d="M0 0L10 5 0 10" fill="none" stroke="#a78bfa" stroke-width="1.5"/></marker></defs><style>.publish-svg{font-family:system-ui,sans-serif}.publish-svg .flow-motion{fill:none;stroke:#a78bfa;stroke-width:1.8;stroke-dasharray:3 7;animation:publish-dash 1.4s linear infinite}@keyframes publish-dash{to{stroke-dashoffset:-20}}.flow-paused .publish-svg .flow-motion{animation-play-state:paused}@media(prefers-reduced-motion:reduce){.publish-svg .flow-motion{animation:none}}</style><rect width="360" height="640" rx="12" fill="#141414"/><rect width="360" height="640" rx="12" fill="url(#pub-m-grid)"/><path data-flow-edge="" class="flow-motion" d="M50 90V110" marker-end="url(#pub-m-arrow)"/><path data-flow-edge="" class="flow-motion" d="M50 186V206" marker-end="url(#pub-m-arrow)"/><path data-flow-edge="" class="flow-motion" d="M50 282V302" marker-end="url(#pub-m-arrow)"/><path data-flow-edge="" class="flow-motion" d="M50 378V398" marker-end="url(#pub-m-arrow)"/><path data-flow-edge="" class="flow-motion" d="M50 474V494" marker-end="url(#pub-m-arrow)"/><g transform="translate(50,52)"><circle r="30" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="-12" y="-16" width="24" height="32" rx="2"/><path d="M-6-7h12M-6 0h12M-6 7h9"/></g></g><text x="103" y="47" text-anchor="start" font-size="18" font-weight="650" fill="#e9eaee">Claims</text><text x="103" y="70" text-anchor="start" font-size="14" fill="#aab0bc">Curated corpus</text><g transform="translate(50,148)"><circle r="30" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M0-17l15 6v12c-1 9-8 14-15 17-7-3-14-8-15-17v-12z"/><path d="M-6 0l4 5 9-11"/></g></g><text x="103" y="143" text-anchor="start" font-size="18" font-weight="650" fill="#e9eaee">Gate one</text><text x="103" y="166" text-anchor="start" font-size="14" fill="#aab0bc">Before wording</text><g transform="translate(50,244)"><circle r="30" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M-12 13l4-12L7-14l7 7L-1 8zM-8 1l7 7M4-11l7 7"/></g></g><text x="103" y="239" text-anchor="start" font-size="18" font-weight="650" fill="#e9eaee">Voice</text><text x="103" y="262" text-anchor="start" font-size="14" fill="#aab0bc">Deterministic</text><g transform="translate(50,340)"><circle r="30" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M0-17l15 6v12c-1 9-8 14-15 17-7-3-14-8-15-17v-12z"/><path d="M-6 0l4 5 9-11"/></g></g><text x="103" y="335" text-anchor="start" font-size="18" font-weight="650" fill="#e9eaee">Gate two</text><text x="103" y="358" text-anchor="start" font-size="14" fill="#aab0bc">When eligible</text><g transform="translate(50,436)"><circle r="30" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M-12-16h24v34l-6-4-6 4-6-4-6 4zM-6-7h12M-6 0h12M-6 7h7"/></g></g><text x="103" y="431" text-anchor="start" font-size="18" font-weight="650" fill="#e9eaee">Decision</text><text x="103" y="454" text-anchor="start" font-size="14" fill="#aab0bc">Clear or blocked</text><g transform="translate(50,532)"><circle r="30" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M-16-15v30h33M-9 8V0M0 8v-17M9 8v-12"/></g></g><text x="103" y="527" text-anchor="start" font-size="18" font-weight="650" fill="#e9eaee">Metrics</text><text x="103" y="550" text-anchor="start" font-size="14" fill="#aab0bc">Record result</text><text x="180.0" y="603" text-anchor="middle" font-size="13" fill="#aab0bc">Records a decision; does not prove</text><text x="180.0" y="623" text-anchor="middle" font-size="13" fill="#aab0bc">a website release hold.</text></svg></div>
<div class="flow-tools"><button type="button" data-flow-motion aria-pressed="false">Pause flow</button><button type="button" data-flow-expand>Expand diagram</button></div>
<figcaption>Inspected historical path. Moving dots show direction, not live activity. Gate two is conditional. The inspected emitter ends at recording and metrics; the website enforcement connection is not established by this source.</figcaption>
</figure>
<dialog data-flow-dialog><button type="button" data-flow-close>Close expanded diagram</button><div data-flow-expanded-content></div></dialog>
<script is:inline src="/posts/s4e17/review-v1/flow-ui.js"></script>
<script is:inline src="/posts/s4e17/review-v1/flow-motion.js"></script>

For example, imagine a claim whose sources are acceptable before editing, but whose final wording adds an unsupported number. The useful result is a failed final check with the affected text identified. The release caller would then need to hold that exact artifact. Recording “blocked” on a dashboard while publishing the changed text would leave the central problem untouched.

That is an explanatory example, not a recovered production incident from this window. The retained integration test does exercise real connector, registry, store and gate components against a fixture vault and test databases. Its NLI classifier is injected and always returns a strong entailment result. It therefore tests composition and recording without measuring the real model's accuracy or proving website enforcement.

The June 23 handover was explicit about the unfinished operational steps: build and smoke-test the image, provision the database schema and role, then commit and reconcile the job. Its green CI report was progress against the code. It was not a substitute for those remaining steps.

## The image needed the model, not just the package

The next obstacle was less philosophical. The image could omit the dependencies needed to do its advertised work.

VW-1003 — `v2 audit-probe/blog-publish-gate image: bake DeBERTa NLI weights, grounding dev→runtime dep` addressed that packaging gap. The grounding package kept its NLI stack in an optional extra. That lets callers use the lighter parts of the package without installing the model runtime. The observability image's ordinary dependency export did not automatically include that extra.

The fix in the retained Dockerfile exports both requirement sets before installation:

<p class="code-source">Exact historical Dockerfile commands, shown without surrounding shell continuations: <code>rootweaver-audit-observability/Dockerfile</code>, snapshot <code>51667774</code>.</p>

```sh
uv export --package rootweaver-audit-observability --no-dev --frozen --no-hashes
uv export --package rootweaver-audit-grounding --extra nli --no-dev --frozen --no-hashes
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- The first export resolves the ordinary observability package closure from the lockfile.
- The second explicitly selects the grounding package's `nli` extra, bringing the model runtime into the requirements set.
- `--no-dev` excludes development groups, `--frozen` uses the existing lockfile, and `--no-hashes` controls the requirements-file output. The Dockerfile then combines these exports, removes editable workspace references and installs the third-party dependencies before the workspace source.
- These are the original commands with their redirections and shell chaining omitted for readability. They are not a standalone reproduction of the entire build.

</details>

[Astral's uv documentation](https://docs.astral.sh/uv/concepts/projects/dependencies/#optional-dependencies) explains the optional-dependency mechanism. Here the important distinction was between a package being available and the runtime closure being able to load the model.

The Dockerfile also loads [Moritz Laurer's DeBERTa NLI model](https://huggingface.co/MoritzLaurer/DeBERTa-v3-base-mnli-fever-anli) during the build, using a fixed model revision, and copies its cache into the runtime image. Offline environment settings then tell the runtime to use the retained files. That makes the tokenizer and weights part of the build concern instead of a surprise download when the job starts.

![The engineer fits the missing optical assembly into an unlit inspection lantern in a railway luggage van.](/posts/s4e17/review-v1/packaging.png)

<p class="caption">A casing is not a usable instrument until its working parts are present. This illustration accompanies the missing runtime dependencies and baked model assets.</p>

There was also a test limitation worth keeping. The handover says the existing NLI-marked test constructed the wrapper and checked its device, but did not exercise the real model call. The proposed smoke test therefore had to load and run the classifier with networking disabled. A constructor test cannot establish that the deployment contains every file needed for inference.

The source shows the packaging change and a fixed revision. I have not rebuilt that historical image or recovered an independent offline-smoke transcript for this reconstruction. I can explain the fix without claiming that writing the Dockerfile proved its runtime behavior.

## The bill pointed at a different workload

The same week, a cost investigation changed what deserved attention first.

The recorded direction was to attribute paid model usage to individual use cases and put a ceiling around it. VW-946 — `Paid-API cost + quality governance: route Anthropic/OpenAI/Perplexity calls through Bifrost virtual keys (per-use-case budgets) + Langfuse quality lens` captures the original plan, including Bifrost in the title. The implementation report says the gateway used for the delivered spine was [LiteLLM](https://docs.litellm.ai/docs/proxy/virtual_keys). The original ticket name and the chosen implementation should not be silently treated as the same product.

Then the billing investigation pointed elsewhere. According to the retained report, the paid Anthropic usage being examined came from the nightly journal consolidator, rather than the five call sites at the centre of the gateway work. The consolidator already had several backends, but the paid one was first.

| Figure retained in the report | Meaning |
|---|---|
| May: $12.51 | Reported Anthropic total for the month |
| June through 20 days: $20.04 | Reported partial-month total |
| About $30 for June | A run-rate estimate, not a completed-month invoice |

The arithmetic behind that estimate is straightforward: `$20.04 / 20 × 30 = $30.06`. It is about 2.4 times the reported May total. I have the engineering report's account of the billing exports, not the original CSVs, so these remain reported historical figures. They do not establish the cost of every provider or the running cost of the local hardware.

The immediate change became VW-972 — `Make daily-consolidator LLM order env-driven (LLM_PRIORITY), default local-first — cut ~$30/mo Haiku + survive $0 Anthropic balance`. Its practical purpose was to try the local backend first and reserve the paid path for later in the chain.

<p class="code-source">Exact historical assignment: <code>daily_consolidator_claude.py · DailyConsolidatorClaude</code>, snapshot <code>51667774</code>.</p>

```python
    _DEFAULT_LLM_PRIORITY = ("vllm", "groq", "claude")
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- The tuple lists backend names in their default attempt order.
- The resolver can override the order using the `LLM_PRIORITY` environment variable.
- The call loop returns the first nonempty result. It does not compare several answers and select the best one.
- Consequently, a poor but nonempty local answer can still win. This is failure fallback, not an automatic quality competition.

</details>

The report records four out of four calls using the local model and no paid API cost for that run. It also reports a qualitative review of the output. That was a useful initial result. It was not a blinded model comparison, a long-run quality benchmark or proof that the fallback providers would never be used again.

## Local-first needed an honest failure path

Changing the order exposed another small dependency: the local model name had to match what the server actually served. The initial report records a stale default requesting a different model. A request to a nonexistent model could fail and move the work to another backend, leaving “local-first” as an intention rather than the observed route.

The follow-up source adds discovery from the server's model list and caches the selected name for the run. An explicit operator override still takes precedence. That qualification matters: discovery reduces one kind of drift; it does not make every possible configuration valid.

The stricter boundary was VW-978 — `daily-consolidator vLLM model discovery: hard-fail on discovery failure instead of stale qwen3-14b default (silent Groq demotion in a cost path)`. In the retained implementation, model resolution sits before the completion call's `try` block. A discovery failure therefore propagates instead of being converted into an ordinary empty result that advances the fallback chain. A later completion failure can still return `None` and allow fallback. Those are deliberately different failure classes.

This is the sort of detail I want the public record to retain. “We made it fail loudly” would be too broad. The change made a particular configuration/discovery failure loud while preserving ordinary fallback for the completion request.

Output attribution needed attention too. The report identifies an agent-name voice leak, a stale model footer and a mismatch in the session count. The follow-up source records which backend actually returned the text and uses that information in the footer. A report can contain a useful summary and still misstate who or what produced it; moving generation locally made that existing assumption visible.

## Quality monitoring arrived before useful samples

Spend attribution could tell me which path was being used. It could not tell me whether the resulting answer was good enough. That became VW-980 — `Per-use-case LLM output-quality lens via Langfuse + quality circuit-breaker (carved out of VW-946)`.

The work was split into three concrete stages:

| Work item | Mechanism |
|---|---|
| VW-983 — `VW-980 Phase 1 fan-out: shared Langfuse quality-lens helper + instrument the 4 remaining paid call sites` | Shared instrumentation records generations and a `use_case` label. |
| VW-985 — `VW-980 Phase 2: async LLM-judge quality scoring (free local vLLM) into Langfuse scores` | An asynchronous local judge reads eligible outputs and attaches a numeric score. |
| VW-986 — `VW-980 Phase 3: quality circuit-breaker (alert-only) — per-use_case quality gauge → Prometheus alert` | Per-use-case gauges feed an alert; there is no automatic shutdown. |

[Langfuse's documentation on model-based evaluation](https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge) provides the upstream context for that scoring pattern. The particular rubric, local judge adapter, skip rules and alert wiring described here are Rootweaver implementation choices.

The scorer uses a rubric appropriate to the use case and asks the judge for a score and a reason. Here is a deliberately small illustrative exchange, not a recovered production payload:

<p class="code-source">Synthetic example following <code>quality_scorer.py · judge_generation()</code> and <code>_parse_judge()</code>. Values are invented for explanation.</p>

```json
{
  "use_case": "websearch",
  "input": "Explain why the job can finish without scoring any output.",
  "output": "Empty generations are skipped before the judge is called.",
  "judge_response": {"score": 0.8, "reason": "Direct and relevant."}
}
```

The score is an assessment against a rubric. It is not a probability that every fact is true. An out-of-range or unparseable response is skipped rather than written as a valid score. Empty outputs are also skipped, and existing quality scores are checked to avoid judging the same generation again unnecessarily.

That makes the actual handover unusually revealing. It reports `fetched=28 scored=0 errors=0`. The fetched records were described as having no usable output while the upstream cap was in effect. The integration could be deployed and the job could finish cleanly without having measured the quality of one real answer in that run.

![The engineer waits beside a row of empty tasting cups on a quiet garden veranda.](/posts/s4e17/review-v1/sampling.png)

<p class="caption">Ready to assess is different from having samples to assess. Empty cups illustrate the reported zero eligible outputs, not a failed or successful quality result.</p>

The alert guard was also specific: the reported rule required an average below 0.5 and at least five scored samples, held for 24 hours. [Prometheus's alerting documentation](https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/) explains that `for` is a duration for which the condition must remain active. It does not mean “the last two completed runs were bad”. With nightly gauges, missing pushes, stale values and sample volume still deserve attention.

The metrics push is best-effort. If it fails, the scorer can log a warning and still exit successfully. The handover records exactly that operational trap: sender egress was allowed, but the receiver's ingress policy also needed to admit the scorer. Fixing both ends made the path usable. A successful job alone had hidden the missing delivery step.

This is why I keep quality monitoring separate from the grounding gate. Grounding asks whether the claim has appropriate support. The rubric asks how useful the output is for its task. Alerting makes a measured problem visible. None of those roles, by itself, proves that a website release will stop.

## What I would carry into the next build

The important improvement was learning to name the boundary each result actually covered.

| Question | What this window gives me |
|---|---|
| Can the audit components be assembled? | Inspected factory and integration-test source, with an injected NLI classifier in the test. |
| Can the image include the inference stack? | Inspected dependency export and model-cache build steps; no fresh historical image run here. |
| Did local-first do anything useful? | A historical report of four local calls, followed by source-level discovery and attribution hardening. |
| Was the quality lens only a future idea? | No. Its code and deployment records exist, but the cited live run scored zero eligible outputs. |
| Did every blog release have to obey a failed decision? | That enforcement connection is not established by the inspected demonstrator and reports. |

I would inspect the caller and its input first next time. Before adding another dashboard panel, I would want to know whether the job receives the current article, whether it checks the final bytes, and what happens to the release when the result is blocked or unavailable.

I would also pull the workload-level cost evidence earlier. The gateway work still had a purpose, but it was not the quickest answer to the usage the report had actually found. And I would keep measuring quality separately from whether a backend returned text at all.

The engine had become more concrete: real components, an executable integration path, metrics, a model-bearing image design and a quality-scoring loop. The records also exposed the limits of each result. That is a more useful account of progress than treating a successful job as proof of everything downstream.

Next: Episode 18, **The Ops Day**. The story returns to Rootweaver's operational foundations: getting alerts to the right place, making the first human actions easier, and checking the access and delivery paths those signals depend on. Those foundations set up the season's closing question: how much autonomy should the platform earn?

## Terms and references

<details data-glossary class="glossary">
<summary>Glossary — plain-English definitions and primary references</summary>
<div class="glossary-tools" hidden><label for="glossary-search">Find a term</label><div class="glossary-search-row"><input id="glossary-search" type="search" placeholder="Search definitions"><button type="button">Clear</button></div><p role="status" aria-live="polite"></p></div>
<section class="glossary-term"><h3>Demonstrator</h3><p>A bounded example that exercises a mechanism. Here the emitter uses a curated corpus, so its activity is not a record of every new website release.</p></section>
<section class="glossary-term"><h3>NLI and DeBERTa</h3><p>Natural language inference assesses whether one text supports or contradicts another. Moritz Laurer's <a href="https://huggingface.co/MoritzLaurer/DeBERTa-v3-base-mnli-fever-anli">model card</a> describes the particular upstream model; its result is not a guarantee of truth.</p></section>
<section class="glossary-term"><h3>Optional extra</h3><p>A named group of package dependencies that must be selected explicitly. See <a href="https://docs.astral.sh/uv/concepts/projects/dependencies/#optional-dependencies">Astral's uv documentation</a>.</p></section>
<section class="glossary-term"><h3>Virtual key</h3><p>A gateway-issued credential used to attribute and constrain a client's model usage without giving it the provider's underlying key. See <a href="https://docs.litellm.ai/docs/proxy/virtual_keys">LiteLLM's virtual-key documentation</a>.</p></section>
<section class="glossary-term"><h3>LLM judge</h3><p>A model asked to score an output against a rubric. It supplies an assessment that needs calibration and review. See <a href="https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge">Langfuse's evaluation guide</a>.</p></section>
<section class="glossary-term"><h3>Pushgateway</h3><p>A service that retains metrics pushed by short-lived jobs so Prometheus can scrape them. See <a href="https://prometheus.io/docs/practices/pushing/">the Prometheus project's guidance</a>, including its warnings about stale series.</p></section>
<section class="glossary-term"><h3>Alert-only</h3><p>A condition can produce a warning without disabling the workload. A Prometheus <code>for</code> duration requires the condition to remain active over time; it does not count job runs. See <a href="https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/">alerting rules</a>.</p></section>
</details>

<details class="source-note">
<summary>How this episode was reconstructed</summary>

This is a curated reconstruction of June 21–24, with a narrowly identified early-June-25 UK manifest receipt. It is not an exhaustive account of every ticket or a replay of complete native sessions. Historical reports, recovered ticket titles and independently inspected Git source are distinguished in the linked review ledger. Original bills, live model-scoring transcripts and an independently observed release rejection from that week were not recovered. The current reading draft is not claiming that today's website uses the historical emitter as a release control.

The unchanged pre-crafted episode is retained as a comparison reference. Its stronger descriptions of direct publisher wiring and already-demonstrated live quality are narrowed here to what the inspected records establish.

</details>

<script is:inline src="/posts/s4e17/review-v1/reader.js"></script>
<style is:global>
main{min-width:0}main>p:not(:has(img)){max-width:74ch}main>ul,main>ol{max-width:74ch}.eyebrow{text-transform:none;letter-spacing:.025em}.reading-progress{position:fixed;left:0;top:0;height:3px;width:0;background:var(--accent);z-index:20;pointer-events:none}.reading-tools{max-width:1160px;margin:0 auto;padding:14px 28px 0;display:flex;justify-content:flex-end;gap:8px}.reader-button,.copy-code,.expand-diagram{border:1px solid var(--border);background:var(--card);color:var(--text);padding:7px 11px;border-radius:6px;font-size:11px}.copy-code{float:right;margin-left:10px}.code-source{display:flow-root}.contents a[aria-current="location"]{color:var(--accent);font-weight:600}.reading-focus .contents{display:none}.reading-focus .page-grid{display:block;max-width:800px}.reading-focus .nav-links>a{display:none}.reading-focus .article-header{max-width:none}.diagram{position:relative}.expand-diagram{display:block;margin:12px auto 0;background:#192d46;color:#eef6ff;border-color:#5c86a6}dialog{width:min(96vw,1300px);height:92vh;max-height:92vh;padding:18px;border:1px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text)}dialog::backdrop{background:rgba(0,0,0,.8)}.dialog-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}.diagram-scroll{overflow:auto;height:calc(100% - 54px);background:#101c2d;border-radius:8px}.diagram-scroll img{width:1200px;max-width:none;border-radius:0;margin:0 auto}.sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:600px){.reading-tools{padding:12px 18px 0}.copy-code{padding:4px 7px}.dialog-head{font-size:12px}dialog{padding:10px}.diagram-scroll img{width:1000px}}
.article-header{border-left:3px solid var(--accent);padding-left:22px}.eyebrow{margin-top:25px}.page-grid{grid-template-columns:minmax(0,740px) 210px;gap:64px}.code-box{box-shadow:0 8px 22px #00000012}h2{border-bottom:0;padding-bottom:0}.caption{border-left:0;padding-left:0}@media(max-width:600px){.article-header{padding-left:15px}}
details.walkthrough{padding:0}details.walkthrough summary{padding:13px 18px;cursor:pointer;color:var(--accent);font-size:12px;font-weight:550;list-style-position:inside}details.walkthrough summary:hover{background:var(--chip)}details.walkthrough[open] summary{border-bottom:1px solid var(--border)}details.walkthrough .explanation-body{padding:14px 18px}details.walkthrough summary:focus-visible{outline-offset:-4px}@media(max-width:600px){details.walkthrough summary{padding:12px 14px}details.walkthrough .explanation-body{padding:12px 14px}}

main{min-width:0}.notebook-article table{display:block;max-width:100%;min-width:0;overflow-x:auto}.table-wrap{overflow:auto;max-width:100%}table{min-width:580px}summary{cursor:pointer}details.glossary,details.source-note{border:1px solid var(--border);border-radius:8px;padding:16px;margin:25px 0}.glossary-term{border-top:1px solid var(--border)}.glossary-tools input{font:inherit;max-width:100%}.glossary-search-row{display:flex;gap:12px}.glossary-search-row input{min-width:0}.glossary-tools button,.flow-tools button{font:inherit;padding:7px 12px}.code-source{font-size:12px}.contents{margin-top:160px}pre{overflow:auto}h3{font-size:17px}figcaption,.caption{font-size:12px}code{overflow-wrap:anywhere;white-space:normal}pre code{white-space:pre}.flow-tools{display:flex;gap:12px;margin:10px 0}.publish-flow{margin:28px 0}.publish-flow h3{margin:0 0 14px}.publish-flow figcaption{line-height:1.6;color:var(--muted,#aab0bc)}.flow-tools button,dialog button{background:#1c1e24;color:#e9eaee;border:1px solid #75608f;border-radius:6px;padding:9px 12px;cursor:pointer}.flow-mobile{display:none}.flow-desktop svg,.flow-mobile svg{display:block;width:100%;height:auto}dialog{color:var(--text);background:var(--bg);border:1px solid var(--border);max-width:min(1150px,95vw);max-height:90vh;width:95vw}dialog::backdrop{background:#000b}.asset-option{margin:38px 0}.review-links{display:flex;gap:18px;flex-wrap:wrap}@media(max-width:600px){input{font-size:16px!important}.flow-desktop{display:none}.flow-mobile{display:block}code{font-size:.88em}}

</style>
