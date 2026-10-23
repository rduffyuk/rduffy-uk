---
title: The Trust Engine — the Grounding Architecture
author: Ryan Duffy
description: A failed audit-store build, a support-versus-reliance rule and a classifier escape show what grounding an agent-assisted account actually required.
episode: 16
series: 'Season 4: Building in Public — The Agent Era'
draft: false
pubDatetime: 2026-10-23
shippingDatetime: 2026-10-23
tags: [rootweaver, grounding, provenance, agents, building-in-public, season-4]
---

The wrapper said the build had succeeded. The gate log said four tests had failed and three had passed.

That disagreement is recorded in the audit-store implementation report. It is a useful opening for a system intended to make agent-assisted work more trustworthy: the first thing it needed was a better account of its own build.

![The familiar dark-haired engineer compares a paper rubbing against the original mineral layers in a dim rock chamber.](/posts/s4e16/review-v1/hero-A.png)

<p class="caption">A convincing copy still needs a traceable original. Conceptual illustration.</p>

Episode 15 followed a policy gate protecting changes to code. This episode follows the neighbouring question: what evidence should let a generated claim pass? The design and first four audit packages belong to Sunday 21 June 2026. The remaining libraries and the classifier repair landed on Monday 22 June. That is the historical window here, even though the retained split plan describes the first half as Sunday's architecture story.

I owned the direction and review, with agents assisting with design, implementation and verification. The reports distinguish Codex-authored packages from Claude-assisted fix-forwards and separate verifier passes. I have inspected retained source and merge history for this reconstruction. The reports remain reports of their original tests and conversations; the new checks recorded in the source ledger have their own, later date.

## A citation answers only part of the question

The recorded design sets out the aim: the platform's writing should remain connected to the work it described. A plausible paragraph could still compress the wrong ticket, attach a date to the wrong stage or repeat a number whose source had disappeared. The design turns that problem into two questions: does the source support the claim, and what evidence records that the source was available when the claim was made?

The distinction has a research counterpart. Jonas Wallat, Maria Heuss, Maarten de Rijke and Avishek Anand’s [Correctness is not Faithfulness in RAG Attributions](https://arxiv.org/abs/2412.18004) separates a citation's support for a statement from the model's actual reliance on that source. Finding a supporting document afterwards does not establish that it produced the answer. That is the paper's distinction; it is not an evaluation result for Rootweaver.

The architecture used a recorded reliance marker to preserve the difference. That marker is useful evidence about the supplied context. It is not direct access to a model's internal reasoning, and a caller claiming that a source was in context does not, by itself, prove causal reliance. I would not turn the package's verdict name into a stronger scientific claim.

This made the work larger than a citation formatter. It needed source identities, claim records, a place to preserve decisions, a classifier, a grounding decision and a check of the text that would actually reach the reader.

## One authoritative record, several useful views

The first design review found a more basic problem. The master design's review log says the initial architecture left the relationship between Postgres and FalkorDB unspecified. If either could hold authoritative state, the system could disagree with itself about the very evidence it was meant to preserve.

The accepted change made Postgres the authoritative event log and the graph a projection rebuilt from verified replay. A graph remains useful for asking which claim used which source. The [W3C PROV-O recommendation](https://www.w3.org/TR/prov-o/) provides the provenance vocabulary for describing relationships between records, activities and responsible actors. It does not become a second place where a convenient answer can overwrite the record.

The foundation was **VW-950 — rootweaver-audit Child A: event-sourced audit store (Postgres hash-chain + FalkorDB projection)**. Its inspected source exposes append, chain verification and replay, with each event hash incorporating the preceding hash. Reusing an event identifier with a different body raises an error. An ordinary update or delete against the audit table is rejected by a database trigger: a database function invoked when a specified operation occurs. The [PostgreSQL trigger documentation](https://www.postgresql.org/docs/16/sql-createtrigger.html) explains that mechanism; the retained store source establishes this particular restriction.

That is a tamper-evident record within its operating assumptions. A hash chain does not prove the truth of the event payload, and it does not remove the need to protect database administration or retain an independent checkpoint. The useful property is that replay checks a defined record before rebuilding its derived view.

The implementation report gives the build its less tidy shape. A wrapper's successful exit concealed a failed gate. The first diagnosis tried to repair the read side, but the reported defect was on the write side: a frozen mapping had been silently converted to its Python string representation. The database could retain something without retaining the intended structured payload.

![The engineer examines a folded metal assembly flattened by an ill-fitting tray inside an instrument case on a rainy dock.](/posts/s4e16/review-v1/serialization.png)

<p class="caption">Keeping an object's appearance is different from preserving its structure. Conceptual illustration of the serialization failure.</p>

The final source converts the payload mapping to a dictionary and uses strict JSON serialization. The [Python JSON documentation](https://docs.python.org/3/library/json.html) explains serialization and its optional fallback handler. The visible line below is deliberately unremarkable. Its missing fallback is the point.

<p class="code-source">Exact historical line · rootweaver_audit/store.py · _canonical_json at 546d3cc6; the surrounding comment explains the removed fallback. The store belongs to **VW-950 — rootweaver-audit Child A: event-sourced audit store (Postgres hash-chain + FalkorDB projection)**.</p>

```python
    return json.dumps(value, sort_keys=True, separators=(",", ":"))
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

1. `return` gives the serialized JSON text back to the hashing or storage path.
2. `json.dumps(value, ...)` serializes the supplied value; this line has no `default=str` escape for unsupported objects.
3. `sort_keys=True` orders object keys consistently, so equivalent key order does not create a different serialized form.
4. `separators=(",", ":")` removes optional spacing from the representation.
5. A value that cannot be serialized raises an error. This is safer here than quietly recording a string that no longer represents the original structure.

</details>

The report records eight passing tests against Postgres and FalkorDB containers after hardening. The merge exists on 21 June. Those are separate pieces of evidence: the report describes the run, while the saved source shows the strict serializer and append-only mechanism I can inspect now.

## Preserve what the source could establish

**VW-951 — rootweaver-audit Child B: source registry + connector interface (tier x sensitivity)** added source identity, authority tiers and sensitivity. The historical registry chooses the highest-priority applicable tier from the candidate references passed to it. It does not search every system in the organisation and prove that no better source exists elsewhere.

That boundary matters. A source registry can make a supplied choice explicit and auditable. It cannot rescue a claim whose author never supplied the relevant measurement. The design's examples place measurements above curated records and narrative write-ups, but usefulness still depends on choosing sources that answer the same question and belong to the right period.

Sensitivity is another axis. A useful internal source is not automatically suitable for a public account. The registry defaults to private sensitivity, while the later projection layer decides which derived material can be exposed. Authority and permission to publish are different decisions.

**VW-952 — rootweaver-audit Child C: capture (authored ledger parser -> claims/sources)** supplied the first capture package. The master build journal records a concrete choice: canonical JSONL for the machine-readable ledger, plus a best-effort Markdown adapter for existing evidence tables. The first delivered slice was authored capture. Passive tracing and post-hoc decomposition remained deferred in that slice; the original episode's broader three-mode description is a design direction, not a claim that all three had shipped.

The adapter makes an important concession. A Markdown evidence table has no reliable column proving which source was present during generation. Adapted edges therefore receive the weaker `support_only` reliance marker. Importing an old ledger must not silently upgrade its evidence.

A later integration test exposed another boundary. Capture and grounding both registered the same versioned source, but the second event carried a new observation time. The event store rejected an identifier collision. The grounding report records the agreed repair in the registry: repeated registration of the same source identity becomes idempotent. A package can meet its own tests and still reveal a contract mismatch when the next package uses it.

## Support and reliance become a small decision table

The external-judge pattern was tracked as **VW-928 — Weekly-review: persist judge audit trail (drafts + verdicts) + add revise loop**. This episode inspects the grounding library using that pattern; it does not run a new judge evaluation.

The decision engine was **VW-953 — rootweaver-audit Child D: grounding engine (support+reliance, NLI -> VW-928 judge, off-GPU)**. It combines the source's assessed support with the recorded reliance state. Source retrieval and scoring sit around this pure rule; the rule itself is small enough to read.

<figure id="trust-engine-flow" class="trust-flow" data-policy-flow>
<h3>From a source record to the final text</h3>
<div class="flow-desktop"><svg xmlns="http://www.w3.org/2000/svg" class="trust-svg" viewBox="0 0 960 510" role="img" aria-labelledby="trust-desktop-title trust-desktop-desc"><title id="trust-desktop-title">Historical audit library flow: context, support, grounding and two gates</title><desc id="trust-desktop-desc">Capture records claims and context. The assessor supplies source support. The engine combines support with a recorded reliance marker. Gate one checks claim spans, a deterministic renderer records the final text map, then gate two checks the final artifact. Audit events are recorded in Postgres; the graph is a derived view. This is library architecture, not observed production execution.</desc><defs><pattern id="trust-desktop-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".8" fill="#3b3f4a"/></pattern><marker id="trust-desktop-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5 0 10" fill="none" stroke="#a78bfa" stroke-width="1.5"/></marker></defs><style>.trust-svg{font-family:system-ui,sans-serif}.flow-motion{animation:trust-dots 1.4s linear infinite}@keyframes trust-dots{to{stroke-dashoffset:-20}}.flow-paused .flow-motion{animation-play-state:paused}@media(prefers-reduced-motion:reduce){.flow-motion{animation:none}}</style><rect width="960" height="510" rx="12" fill="#141414"/><rect width="960" height="510" fill="url(#trust-desktop-dots)"/><g transform="translate(160 75)"><circle r="31" fill="#1c1e24" stroke="#4b435e"/><path d="M-13-18H7l8 8v28h-28zM7-18v9h8M-6-2h14M-6 6h14" fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></g><text x="160" y="136" fill="#e9eaee" font-size="17" font-weight="650" text-anchor="middle">Capture</text><text x="160" y="161" fill="#aab0bc" font-size="14" text-anchor="middle">Claim + context marker</text><path data-flow-edge="" class="flow-motion" d="M199 75H440" fill="none" stroke="#a78bfa" stroke-width="1.8" stroke-dasharray="3 7" marker-end="url(#trust-desktop-arrow)"/><g transform="translate(480 75)"><circle r="31" fill="#1c1e24" stroke="#4b435e"/><path d="M-18-14h36v24h-13l-8 9v-9h-15zM-10-5h20M-10 2h12" fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></g><text x="480" y="136" fill="#e9eaee" font-size="17" font-weight="650" text-anchor="middle">Assess support</text><text x="480" y="161" fill="#aab0bc" font-size="14" text-anchor="middle">Source text + NLI / judge</text><path data-flow-edge="" class="flow-motion" d="M519 75H760" fill="none" stroke="#a78bfa" stroke-width="1.8" stroke-dasharray="3 7" marker-end="url(#trust-desktop-arrow)"/><g transform="translate(800 75)"><circle r="31" fill="#1c1e24" stroke="#4b435e"/><path d="M-19-12h12l14 24h12M-19 12h12l14-24h12" fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></g><text x="800" y="136" fill="#e9eaee" font-size="17" font-weight="650" text-anchor="middle">Combine</text><text x="800" y="161" fill="#aab0bc" font-size="14" text-anchor="middle">Support × reliance</text><path data-flow-edge="" class="flow-motion" d="M840 75H920V215H160V231" fill="none" stroke="#a78bfa" stroke-width="1.8" stroke-dasharray="3 7" marker-end="url(#trust-desktop-arrow)"/><g transform="translate(160 270)"><circle r="31" fill="#1c1e24" stroke="#4b435e"/><path d="M0-22l18 8v12q0 14-18 24Q-18 12-18-2v-12zM-8 0l6 6L10-7" fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></g><text x="160" y="331" fill="#e9eaee" font-size="17" font-weight="650" text-anchor="middle">Gate 1</text><text x="160" y="356" fill="#aab0bc" font-size="14" text-anchor="middle">Classified claim spans</text><path data-flow-edge="" class="flow-motion" d="M199 270H440" fill="none" stroke="#a78bfa" stroke-width="1.8" stroke-dasharray="3 7" marker-end="url(#trust-desktop-arrow)"/><g transform="translate(480 270)"><circle r="31" fill="#1c1e24" stroke="#4b435e"/><path d="M-18-17h36v34h-36zM-10-8h20M-10 0h14M-10 8h18" fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></g><text x="480" y="331" fill="#e9eaee" font-size="17" font-weight="650" text-anchor="middle">Render</text><text x="480" y="356" fill="#aab0bc" font-size="14" text-anchor="middle">Text + exact span map</text><path data-flow-edge="" class="flow-motion" d="M519 270H760" fill="none" stroke="#a78bfa" stroke-width="1.8" stroke-dasharray="3 7" marker-end="url(#trust-desktop-arrow)"/><g transform="translate(800 270)"><circle r="31" fill="#1c1e24" stroke="#4b435e"/><path d="M0-22l18 8v12q0 14-18 24Q-18 12-18-2v-12zM-8 0l6 6L10-7" fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></g><text x="800" y="331" fill="#e9eaee" font-size="17" font-weight="650" text-anchor="middle">Gate 2</text><text x="800" y="356" fill="#aab0bc" font-size="14" text-anchor="middle">The final rendered text</text><text x="480.0" y="411" text-anchor="middle" fill="#c4b5fd" font-size="15">Audit events → Postgres log → verified replay → rebuilt graph</text><text x="480.0" y="446" text-anchor="middle" fill="#c4b5fd" font-size="15">Library architecture, not proof of production publishing</text><text x="480.0" y="477" text-anchor="middle" fill="#c4b5fd" font-size="15">Dotted lines show direction, not live traffic</text></svg></div><div class="flow-mobile"><svg xmlns="http://www.w3.org/2000/svg" class="trust-svg" viewBox="0 0 360 1010" role="img" aria-labelledby="trust-mobile-title trust-mobile-desc"><title id="trust-mobile-title">Historical audit library flow: context, support, grounding and two gates</title><desc id="trust-mobile-desc">Capture records claims and context. The assessor supplies source support. The engine combines support with a recorded reliance marker. Gate one checks claim spans, a deterministic renderer records the final text map, then gate two checks the final artifact. Audit events are recorded in Postgres; the graph is a derived view. This is library architecture, not observed production execution.</desc><defs><pattern id="trust-mobile-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".8" fill="#3b3f4a"/></pattern><marker id="trust-mobile-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5 0 10" fill="none" stroke="#a78bfa" stroke-width="1.5"/></marker></defs><style>.trust-svg{font-family:system-ui,sans-serif}.flow-motion{animation:trust-dots 1.4s linear infinite}@keyframes trust-dots{to{stroke-dashoffset:-20}}.flow-paused .flow-motion{animation-play-state:paused}@media(prefers-reduced-motion:reduce){.flow-motion{animation:none}}</style><rect width="360" height="1010" rx="12" fill="#141414"/><rect width="360" height="1010" fill="url(#trust-mobile-dots)"/><g transform="translate(50 65)"><circle r="31" fill="#1c1e24" stroke="#4b435e"/><path d="M-13-18H7l8 8v28h-28zM7-18v9h8M-6-2h14M-6 6h14" fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></g><text x="103" y="60" fill="#e9eaee" font-size="17" font-weight="650" text-anchor="start">Capture</text><text x="103" y="85" fill="#aab0bc" font-size="14" text-anchor="start">Claim + context marker</text><path data-flow-edge="" class="flow-motion" d="M50 103V169" fill="none" stroke="#a78bfa" stroke-width="1.8" stroke-dasharray="3 7" marker-end="url(#trust-mobile-arrow)"/><g transform="translate(50 207)"><circle r="31" fill="#1c1e24" stroke="#4b435e"/><path d="M-18-14h36v24h-13l-8 9v-9h-15zM-10-5h20M-10 2h12" fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></g><text x="103" y="202" fill="#e9eaee" font-size="17" font-weight="650" text-anchor="start">Assess support</text><text x="103" y="227" fill="#aab0bc" font-size="14" text-anchor="start">Source text + NLI / judge</text><path data-flow-edge="" class="flow-motion" d="M50 245V311" fill="none" stroke="#a78bfa" stroke-width="1.8" stroke-dasharray="3 7" marker-end="url(#trust-mobile-arrow)"/><g transform="translate(50 349)"><circle r="31" fill="#1c1e24" stroke="#4b435e"/><path d="M-19-12h12l14 24h12M-19 12h12l14-24h12" fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></g><text x="103" y="344" fill="#e9eaee" font-size="17" font-weight="650" text-anchor="start">Combine</text><text x="103" y="369" fill="#aab0bc" font-size="14" text-anchor="start">Support × reliance</text><path data-flow-edge="" class="flow-motion" d="M50 387V453" fill="none" stroke="#a78bfa" stroke-width="1.8" stroke-dasharray="3 7" marker-end="url(#trust-mobile-arrow)"/><g transform="translate(50 491)"><circle r="31" fill="#1c1e24" stroke="#4b435e"/><path d="M0-22l18 8v12q0 14-18 24Q-18 12-18-2v-12zM-8 0l6 6L10-7" fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></g><text x="103" y="486" fill="#e9eaee" font-size="17" font-weight="650" text-anchor="start">Gate 1</text><text x="103" y="511" fill="#aab0bc" font-size="14" text-anchor="start">Classified claim spans</text><path data-flow-edge="" class="flow-motion" d="M50 529V595" fill="none" stroke="#a78bfa" stroke-width="1.8" stroke-dasharray="3 7" marker-end="url(#trust-mobile-arrow)"/><g transform="translate(50 633)"><circle r="31" fill="#1c1e24" stroke="#4b435e"/><path d="M-18-17h36v34h-36zM-10-8h20M-10 0h14M-10 8h18" fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></g><text x="103" y="628" fill="#e9eaee" font-size="17" font-weight="650" text-anchor="start">Render</text><text x="103" y="653" fill="#aab0bc" font-size="14" text-anchor="start">Text + exact span map</text><path data-flow-edge="" class="flow-motion" d="M50 671V737" fill="none" stroke="#a78bfa" stroke-width="1.8" stroke-dasharray="3 7" marker-end="url(#trust-mobile-arrow)"/><g transform="translate(50 775)"><circle r="31" fill="#1c1e24" stroke="#4b435e"/><path d="M0-22l18 8v12q0 14-18 24Q-18 12-18-2v-12zM-8 0l6 6L10-7" fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></g><text x="103" y="770" fill="#e9eaee" font-size="17" font-weight="650" text-anchor="start">Gate 2</text><text x="103" y="795" fill="#aab0bc" font-size="14" text-anchor="start">The final rendered text</text><text x="180.0" y="902" text-anchor="middle" fill="#c4b5fd" font-size="13">Postgres log → rebuilt graph</text><text x="180.0" y="938" text-anchor="middle" fill="#c4b5fd" font-size="13">Library architecture, not deployment proof</text><text x="180.0" y="972" text-anchor="middle" fill="#c4b5fd" font-size="13">Dotted lines show direction, not live traffic</text></svg></div>
<div class="flow-tools"><button type="button" data-flow-motion aria-pressed="false">Pause flow</button><button type="button" data-flow-expand>Expand diagram</button></div>
<figcaption>Source: the capture, grounding, gate and voice libraries at 546d3cc6. Context availability is a recorded marker; the diagram does not prove causal model reliance or operational deployment.</figcaption>
</figure>
<dialog data-flow-dialog aria-label="Expanded audit flow"><button type="button" data-flow-close>Close diagram</button><button type="button" data-flow-motion aria-pressed="false">Pause flow</button><div data-flow-expanded-content></div></dialog>
<style>.trust-flow{margin:30px 0}.trust-flow svg{width:100%;height:auto}.trust-flow figcaption{font-size:12px;line-height:1.6;color:var(--muted,#aab0bc)}.flow-mobile{display:none}.flow-tools{display:flex;gap:12px;margin:12px 0}.flow-tools button,dialog button{background:#1c1e24;color:#e9eaee;border:1px solid #75608f;border-radius:6px;padding:9px 12px;cursor:pointer}dialog{background:#141414;color:#e9eaee;border:1px solid #75608f;width:min(1100px,94vw);max-height:90vh;overflow:auto}dialog::backdrop{background:#000b}dialog .flow-tools{display:none}@media(max-width:600px){.flow-desktop{display:none}.flow-mobile{display:block}}</style>
<script is:inline src="/posts/s4e16/review-v1/flow-ui.js"></script>
<script is:inline src="/posts/s4e16/review-v1/flow-motion.js"></script>

The inspected combination function checks unverifiable reliance first, then refutation, then neutral support. Only the remaining supported, pre-generation case becomes `GROUNDED`. A supported claim whose source was added afterwards becomes `WEAK`.

| Assessed source support | Pre-generation marker | Support added afterwards | Reliance unverifiable |
|---|---|---|---|
| Supported | Grounded | Weak | Unverifiable |
| Refuted | Refuted | Refuted | Unverifiable |
| Neutral | Ungrounded | Ungrounded | Unverifiable |

This table describes the implementation's vocabulary, not a guarantee that a model judgement is correct. The service retrieves source content, can score it with local natural-language inference and has a judge escalation seam. Its result depends on the source, the context record and the assessor. The engine also has a defined roll-up policy: one grounded source can win over a refuted source. That makes source-level disagreement worth inspecting rather than hiding behind a single green label.

<p class="code-source">Exact historical extract · rootweaver_audit_grounding/engine.py · GroundingEngine.combine at 546d3cc6. Enum conversion precedes this extract; source scoring is outside it. The engine belongs to **VW-953 — rootweaver-audit Child D: grounding engine (support+reliance, NLI -> VW-928 judge, off-GPU)**.</p>

```python
        if reliance_status is Reliance.UNVERIFIABLE:
            return GroundingStatus.UNVERIFIABLE
        if support_status is SupportStatus.REFUTED:
            return GroundingStatus.REFUTED
        if support_status is SupportStatus.NEUTRAL:
            return GroundingStatus.UNGROUNDED
        if reliance_status is Reliance.PRE_GENERATION:
            return GroundingStatus.GROUNDED
        return GroundingStatus.WEAK
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

1. The first `if` asks whether the reliance record is unverifiable.
2. Its `return` preserves that uncertainty, even if another field appears supportive.
3. The next `if` checks whether the source assessment refutes the claim.
4. That branch returns `REFUTED`, which stays distinct from merely lacking support.
5. The third `if` checks for a neutral assessment.
6. A neutral source produces `UNGROUNDED`.
7. The final `if` checks the recorded pre-generation marker. Earlier branches have already handled unavailable, refuted and neutral cases.
8. That supported, pre-generation combination returns `GROUNDED`.
9. The last return handles the remaining supported case as `WEAK`: support exists, but the stronger context marker does not.

</details>

The grounding report also records a failed attempt to improve the implementation. Three mutations survived in the integer precedence ladder. Replacing that ladder with an ordered tuple looked cleaner, but a dry run moved the bounded mutation sample onto less-tested device-selection code. The refactor was reverted; targeted tests pinned ordering and the constant mapping instead.

The reported clean mutation gate belongs to that bounded sample. It does not establish that no possible mutation or bug survived anywhere in the package. The useful lesson is to understand what a gate sampled before turning its result into a claim about the whole system.

## A small claim, followed through the record

Here is a deliberately small example: **“The sample run passed three checks.”** Its fictional source contains just `{"checks_passed":3}`. Every identifier, timestamp, number and score below is invented for this explanation. These are synthetic payloads shaped to the inspected June models, not recovered records or a new model evaluation. JSON is simply a structured way of writing named fields and their values.

<p class="code-source">Illustrative input · field names from rootweaver_audit_capture/models.py, LedgerEntry.from_mapping at 546d3cc6. Synthetic values; the date is a placeholder.</p>

```json
{
  "claim_id": "example-claim-1",
  "draft_id": "example-draft",
  "text": "The sample run passed three checks.",
  "span": [0, 35],
  "claim_type": "quantitative",
  "source_refs": ["jsonl://example/check-run"],
  "in_context_source_ids": ["jsonl://example/check-run"],
  "actor": "example-author",
  "ts": "2000-01-01T00:00:00Z"
}
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

1. The opening brace starts one claim record.
2. `claim_id` gives this statement an identity within the draft.
3. `draft_id` identifies the draft it belongs to.
4. `text` is the exact sentence being checked.
5. `span` selects characters zero through 34; the end offset, 35, is excluded. This connects the record to the actual text.
6. `claim_type` says this is a numerical assertion, so it needs factual support.
7. `source_refs` lists the cited source. This example URI is fictional; it does not resolve to a real run.
8. `in_context_source_ids` records the caller’s assertion that the same source was supplied before generation. The parser requires these IDs to be a subset of the cited sources; that validation does not prove the assertion is honest.
9. `actor` records the claimed author identity. This field alone does not authenticate that identity.
10. `ts` records an observation time; this example uses a conspicuous placeholder.
11. The closing brace ends the record.

</details>

Suppose the support assessor returns `supported` with a score of `0.99`. I have supplied that result for the example; no NLI model ran to produce it, and the score is not a calibrated 99% probability that the claim is true. The combination rule can now attach the following per-source assessment to the claim’s verdict.

<p class="code-source">Illustrative output · exact field shape from rootweaver_audit_grounding/models.py, GroundingSource.to_payload at 546d3cc6. Synthetic assessment and values; the digest is calculated from the example source bytes.</p>

```json
{
  "uri": "jsonl://example/check-run",
  "content_sha256": "5487f1c121c086468b45424491beec5dca5506174f50daa3435fc3b5821ed641",
  "support": "supported",
  "score": 0.99,
  "reliance": "pre_generation",
  "status": "grounded",
  "escalated": false
}
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

1. The opening brace starts the assessment for one source, rather than the complete claim verdict.
2. `uri` points back to the fictional source named in the input.
3. `content_sha256` identifies the exact bytes assessed. It detects a content mismatch; it cannot establish that those bytes describe reality correctly.
4. `support` records the supplied assessor decision that the source supports this sentence.
5. `score` is the invented assessor score used in this worked example.
6. `reliance` carries the recorded pre-generation context marker.
7. `status` is the combination rule’s result for these inputs: `grounded`.
8. `escalated` says this example did not invoke the separate judge path.
9. The closing brace ends the per-source assessment.

</details>

Now keep the sentence and supporting source the same, but change what we know about context:

| Example inputs | Package outcome | What the reader can conclude |
| --- | --- | --- |
| Supported source; recorded as supplied before generation | `grounded` | Support and the stronger context marker are both recorded. |
| Supported source; empty `in_context_source_ids` | `weak` | The citation supports the sentence, but this record does not place it in the earlier context. |
| No source reference | `ungrounded`; factual gate blocks | There is no supplied source for the factual claim. |
| Reliance cannot be verified | `unverifiable` | The decision preserves that uncertainty instead of upgrading it. |

The first two cases differ in one input list, not in how convincing the sentence sounds. That is what I mean here by grounding: preserving the relationship between a statement, its assessed support and the available context evidence. Whether the sample run really happened still depends on the quality and honesty of the underlying record. A later signature can protect a record’s integrity without fixing a false measurement.

## An opinion marker concealed a factual claim

**VW-954 — rootweaver-audit Child E: span classifier + tiered two-pass gate + golden/metamorphic set** added the classifier and gate service. The delivered classifier was deterministic regex and rules, rather than a general language-understanding service. It recognises quantities, dates, identifiers and causal wording, with a fail-closed sentence sweep for material that is otherwise untyped.

The gate uses those spans to build individual claim entries and obtain grounding verdicts. Classifier or grounder exceptions block the decision. A factual span with no resolvable source also blocks. Interpretation, opinion and style can pass as non-factual categories, which makes the boundary between opinion and a factual presupposition especially important.

That boundary produced **VW-979 — audit-gate classifier: opinion marker skips fail-closed sweep, leaks factual presupposition**. The historical repair shows why a phrase such as “I think” cannot exempt everything that follows it. An opinion can still contain an asserted deployment, named person or day. The fix retains the opinion marker but also emits a factual span when the rest of that sentence contains the recognised factual-looking tokens.

The final June source includes full weekday names, including lowercase and plural forms, while keeping short weekday abbreviations case-sensitive. That is a targeted heuristic, not proof that every unsupported presupposition can be recognised. The record contains both the first repair and a same-evening follow-up for weekday evasion.

The observability report describes another way this weakness surfaced: a whitespace variation of an opinion changed its classification. The probe's expansion was then scoped to the safety-critical direction, keeping fabrications blocked, while known-good cases were retained separately. This is a scope decision worth stating, because narrowing a probe is not the same thing as proving every paraphrase behaves identically.

## Check the object the reader will actually receive

**VW-956 — rootweaver-audit Child G: voice module + post-voice re-gate + blog as first consumer** supplied the two-pass publish orchestrator. The first pass checks the captured claims. A renderer then produces text and records which character ranges came from which claim. A second pass checks that rendered output.

![The engineer checks a finished glass vessel against its contour gauge, with an earlier clay form beside it.](/posts/s4e16/review-v1/final-text.png)

<p class="caption">The final object needs its own check. Conceptual illustration of the post-render verification boundary.</p>

In the first delivered package the renderer was deterministic. It joined scrubbed claim text with a non-factual space; it did not independently write a more persuasive story. An LLM voice renderer remained a later seam. The useful protection was around the output boundary: reject broken span maps, reject factual tokens outside mapped ranges, and re-ground the resulting text rather than trusting an intermediate approval.

The report says one failing lane was actually testing a stale installed build after environment and dependency-resolution trouble. A fresh editable install passed. That is distinct from a code repair. It reinforces the same requirement as the audit store: identify what executable and source the result belongs to before accepting the verdict.

The other two libraries made decisions inspectable and controlled exposure. **VW-955 — rootweaver-audit Child F: projections (trust / governance / C2PA-public, sensitivity-taint-gated)** produced trust, governance and public views. Its report records two leak fixes: narrowing rich internal span objects before public export, and validating attached clearance instead of treating its mere presence as permission. The historical source contains those explicit public-boundary checks.

This is where **C2PA (the Coalition for Content Provenance and Authenticity)** fits. Its [Content Credentials explainer](https://spec.c2pa.org/specifications/specifications/2.2/explainer/Explainer.html) describes signed provenance attached to a digital asset: information about its origins and editing history that a reader can inspect and validate. In this architecture, grounding assesses the claim against its source; a Content Credential would help carry provenance with the exported asset. They answer different questions.

For the sample above, a valid signature could help establish that the attached record has not been altered since signing and that its signing credential validates under the chosen trust rules. It would not establish that three checks really passed, or that a model actually used the source. The C2PA explainer explicitly separates verifiable provenance from factual accuracy.

The historical report is equally clear about what this build achieved: the C2PA library rejected the self-signed lab certificate and the pipeline withheld the manifest. A signing interface existed; a successful trusted public manifest was not established by that build. The example above is not a Content Credential or evidence of a successful signing run.

**VW-957 — rootweaver-audit Child H: observability + SLOs + metamorphic correctness probe + leak canary** delivered an observational library for metrics, probes and a leak canary. It did not itself install a dashboard, deploy a scheduled probe or make the publishing path blocking. Those operational steps belong to the following episode's wiring story. The reports and merge history establish eight libraries by the end of 22 June, not a completed production publishing integration.

Preparation of this draft reran 36 retained grounding-engine and classifier unit checks successfully. That fresh check used the June source snapshot; it did not load NLI weights, call an external judge, replay the database integration tests or exercise a live publisher.

## What I would carry forward

The useful result was a set of explicit contracts: what source identity means, how weaker capture stays weaker, how support combines with recorded context, and where a final artifact must be checked again. The implementation also exposed failures in serialization, registration, classification and public projection while those contracts were being built.

I would carry five practices into the next system:

- **Read the underlying result.** A wrapper exit, a test summary and a verifier verdict can disagree. Preserve the evidence that resolves the disagreement.
- **Keep derived views rebuildable.** Give the authoritative record a clear owner and make projections explain their lineage.
- **Preserve weak evidence honestly.** A retrospective citation can support a sentence without proving what was present during generation.
- **Test composition and output boundaries.** Two libraries can be individually plausible while disagreeing about identity, offsets or public fields.
- **State the sampled scope.** A bounded mutation result, a heuristic classifier and a library build each establish something narrower than universal safety or live enforcement.

This was a grounding architecture I could inspect and improve. Calling it a lie detector would conceal the parts still dependent on source selection, capture honesty, model judgement and operational wiring.

Next in the verified sequence is **Episode 17, “Wiring the Trust Engine into This Blog.”** The next question is what happened when those library contracts met the actual publishing path, including the difference between a recorded warning and a decision that could stop publication.

## References and further reading

- **Jonas Wallat, Maria Heuss, Maarten de Rijke and Avishek Anand:** [Correctness is not Faithfulness in RAG Attributions](https://arxiv.org/abs/2412.18004), 2024. The research distinction between a citation supporting an answer and the model actually relying on that source. The paper’s findings are not measurements of Rootweaver.
- **Coalition for Content Provenance and Authenticity:** [C2PA and Content Credentials Explainer, version 2.2](https://spec.c2pa.org/specifications/specifications/2.2/explainer/Explainer.html). A readable account of signed content provenance, trust and the limits of claims about factual accuracy. This is an explanatory reference, not a claim that version 2.2 was the deployed June configuration.
- **W3C; editors Timothy Lebo, Satya Sahoo and Deborah McGuinness:** [PROV-O: The PROV Ontology](https://www.w3.org/TR/prov-o/), W3C Recommendation, 2013. Vocabulary for describing provenance relationships.
- **PostgreSQL Global Development Group:** [CREATE TRIGGER, PostgreSQL 16 documentation](https://www.postgresql.org/docs/16/sql-createtrigger.html). Background on the database mechanism used by the historical store.
- **Python Software Foundation:** [JSON encoding and decoding](https://docs.python.org/3/library/json.html) and [hashlib](https://docs.python.org/3/library/hashlib.html). Background on serialization and content digests; the historical implementation is established separately by the retained source.

<details class="source-note">
<summary>Sources, scope and omissions</summary>

This is a curated reconstruction of 21–22 June 2026, based on the retained master design/build journal, six implementation reports, nine historical merge records, the late-June source snapshot and ten recovered tracker records. The split audit inventories a wider 21–24 June window and reports 73 created tickets; that is its historical count, not a fresh exhaustive query performed for this draft. Wiring, quality-lens and cost work are reserved for Episode 17; policy-gate work belongs to Episode 15. Unrelated housekeeping and personal material are omitted.

The recovered tracker records preserve titles and Done states from a dated recovery; their modern recovery labels do not establish original implementation attribution. Original native conversations, complete pipeline logs, historical model outputs and the original runtime environment have not been replayed. Original test totals are labelled as report evidence. New source checks are listed separately in the retained source ledger.

Primary conceptual references: the [RAG attribution paper](https://arxiv.org/abs/2412.18004), [PostgreSQL trigger documentation](https://www.postgresql.org/docs/16/triggers.html), and the [W3C provenance ontology](https://www.w3.org/TR/prov-o/). They explain concepts; they do not independently establish Rootweaver's implementation or deployment.

</details>

<details data-glossary class="glossary">
<summary>Glossary — grounding, capture and the final artifact</summary>
<div class="glossary-body">
<div class="glossary-tools"><label for="glossary-search">Find a term</label><div class="glossary-search-row"><input id="glossary-search" type="search" placeholder="Search terms or definitions"><button type="button" data-glossary-clear>Clear</button></div><p class="glossary-status" role="status" aria-live="polite"></p></div>
<section class="glossary-term" id="glossary-c2pa"><h3>C2PA / Content Credentials</h3><p>The Coalition for Content Provenance and Authenticity’s standard for signed provenance associated with digital assets. A credential can carry origin and editing information; it does not prove factual truth. See the <a href="https://spec.c2pa.org/specifications/specifications/2.2/explainer/Explainer.html">official explainer</a>. This episode’s historical manifest was withheld.</p></section>
<section class="glossary-term" id="glossary-grounding"><h3>Grounding</h3><p>The package's verdict from source support plus a recorded reliance state. It is conditional on those inputs, not direct proof of a model's internal reasoning. The distinction is informed by the <a href="https://arxiv.org/abs/2412.18004">RAG attribution paper</a>.</p></section>
<section class="glossary-term" id="glossary-event-sourcing"><h3>Event sourcing</h3><p>Retaining a sequence of events as the authoritative record and rebuilding useful views from that sequence. In this episode the Postgres log owns the record and FalkorDB is a projection; the relationships use the <a href="https://www.w3.org/TR/prov-o/">W3C provenance vocabulary</a>.</p></section>
<section class="glossary-term" id="glossary-hash-chain"><h3>Hash chain</h3><p>Each event's digest incorporates the preceding digest, so verification can detect inconsistencies against the expected chain. This does not prove event truth or protect every database administrator action. <a href="https://docs.python.org/3/library/hashlib.html">Python hashlib</a> provides the digest primitive used here.</p></section>
<section class="glossary-term" id="glossary-idempotency"><h3>Idempotency</h3><p>Repeating the same operation preserves the intended result instead of producing a second, conflicting effect. Here, repeated registration of the same source identity must coexist with the store's collision check. The exact behaviour comes from the retained registry source.</p></section>
<section class="glossary-term" id="glossary-nli"><h3>Natural-language inference</h3><p>A model assessment of whether source text supports, contradicts or is neutral towards a claim. The historical backend is one input to the grounding rule; its assessment can be wrong.</p></section>
<section class="glossary-term" id="glossary-span-map"><h3>Span map</h3><p>A mapping from character ranges in the final rendered text back to the claims that supplied them. The inspected voice package validates those ranges before running its second gate.</p></section>
<section class="glossary-term" id="glossary-metamorphic"><h3>Metamorphic probe</h3><p>A check that deliberately changes an input and tests a required relationship between the results. This build focused variants on keeping fabricated facts blocked, while checking known-good cases separately.</p></section>
</div>
</details>

<script is:inline src="/posts/s4e16/review-v1/reader.js"></script>
