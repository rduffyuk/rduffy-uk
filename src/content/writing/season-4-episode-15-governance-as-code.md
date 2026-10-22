---
title: Governance-as-Code — the Gate That Gates Itself
author: Ryan Duffy
description: A review caught an exemption in the policy gate's own input builder. Its first reported run then exposed what the new rules could see—and what they could not.
episode: 15
series: 'Season 4: Building in Public — The Agent Era'
draft: false
pubDatetime: 2026-10-22
tags: [rootweaver, policy-as-code, conftest, rego, cicd, agents, building-in-public, season-4]
---

The first version of the new gate contained an exemption for the code that told it what to check. A test fixture was easier to keep green that way. It also meant an agent could change part of the gate without triggering the very rule intended to protect it.

That is where this episode starts: with a useful control almost acquiring its own escape hatch.

![The familiar dark-haired engineer inspects an exposed lock linkage beside closed canal gates in a dim stone chamber.](/posts/s4e15/review-v1/hero-A.png)

<p class="caption">The linkage that controls the gate belongs inside the protection boundary. Conceptual artwork.</p>

Episode 14 followed the work to measure CI: where builds spent time, what counted as a change and how attribution reached the dashboard. This episode follows the next question—what should the pipeline accept from an agent-assisted development channel? The specification dates to Sunday 21 June 2026; the inspected implementation lands across Monday 22 and Tuesday 23 June. The work extends beyond the measurement weekend.

I owned the direction and review of the platform, with agents assisting with implementation and verification. The retained reports describe Codex implementation lanes and a separate Claude/Sonnet verifier. This is a curated reconstruction from those reports, the specification and historical source. It preserves their account of the review; it does not replay the original conversations or turn an agent's report into an independent observation.

## Keep useful changes moving

CI was already a bottleneck. I wanted changes to move through a lab I treated as production without letting the pressure for speed quietly erode its controls. The gate specification captures that engineering objective: keep the velocity and bound failure modes such as unattributed changes, oversized batches and agents weakening their own checks.

The work was tracked as **VW-945 — OPA/Conftest LLM-channel contract gate (warn-then-enforce)**. It proposed a common policy layer for merge requests, with stricter conditions for recognised agent-authored changes. Human review remained part of the design. The new layer would make a few recurring review questions explicit and repeatable.

That distinction matters to how I judge the result. A policy engine does not discover the right governance model by existing. Someone chooses what facts it receives, which changes deserve additional review and what happens when evidence is missing. Those choices were the work.

The chosen tools were Open Policy Agent's Rego language and Conftest. Rego expresses decisions over structured input; Conftest evaluates those policies against supplied data. In this case the data was a JSON description of a merge request, assembled from Git and any available risk artifact. The engine was small enough to inspect. Its input boundary deserved as much attention as its rules.

The flow below separates the policy verdict from the CI decision that could make it blocking. That separation explains why the first findings were useful even while the pipeline could stay green.

<figure id="policy-enforcement-flow" class="diagram policy-flow" data-policy-flow>
<h3>How the historical policy gate worked</h3>
<div class="flow-desktop"><svg class="policy-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 600" role="img" aria-labelledby="policy-desktop-title policy-desktop-desc">
<title id="policy-desktop-title">From merge-request facts to policy findings and a non-blocking CI job</title>
<desc id="policy-desktop-desc">Git facts become JSON input, four Rego contracts evaluate their own modes, and Conftest produces findings. Off is silent for those contracts, warn produces warnings, enforce can produce denials. The historical job still allowed failure, so a denial did not necessarily block the pipeline. Lines show evaluation direction, not live traffic.</desc>
<defs><pattern id="policy-desktop-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".8" fill="#3b3f4a"/></pattern><marker id="policy-desktop-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5 0 10" fill="none" stroke="#a78bfa" stroke-width="1.5"/></marker></defs>
<style>.policy-svg{font-family:system-ui,-apple-system,sans-serif}.flow-motion{animation:policy-dots 1.4s linear infinite}@keyframes policy-dots{to{stroke-dashoffset:-20}}.flow-paused .flow-motion{animation-play-state:paused}@media(prefers-reduced-motion:reduce){.flow-motion{animation:none}}</style>
<rect width="900" height="600" rx="12" fill="#141414"/><rect width="900" height="600" fill="url(#policy-desktop-dots)"/>
<g transform="translate(110 65)"><circle r="32" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="-10" cy="-12" r="4"/><circle cx="-10" cy="12" r="4"/><circle cx="12" cy="0" r="4"/><path d="M-10-8v16M-6-12h5q13 0 13 8"/></g></g><text x="110" y="122" fill="#e9eaee" font-size="16" text-anchor="middle" font-weight="650">MR evidence</text><text x="110" y="146" fill="#aab0bc" font-size="15" text-anchor="middle" font-weight="500">Git trailers + diff</text><text x="110" y="167" fill="#aab0bc" font-size="15" text-anchor="middle" font-weight="500">Available risk artifact</text><g transform="translate(335 65)"><circle r="32" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M-12-19H6l9 9v29h-27zM6-19v10h9M-5-2l-5 5 5 5M7-2l5 5-5 5"/></g></g><text x="335" y="122" fill="#e9eaee" font-size="16" text-anchor="middle" font-weight="650">Build JSON input</text><text x="335" y="146" fill="#aab0bc" font-size="15" text-anchor="middle" font-weight="500">Paths, size, provenance</text><text x="335" y="167" fill="#aab0bc" font-size="15" text-anchor="middle" font-weight="500">Co-author signal + modes</text><g transform="translate(560 65)"><circle r="32" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M0-21l18 7v13q0 14-18 23Q-18 13-18-1v-13zM-8 0l6 6L10-7"/></g></g><text x="560" y="122" fill="#e9eaee" font-size="16" text-anchor="middle" font-weight="650">Evaluate policies</text><text x="560" y="146" fill="#aab0bc" font-size="15" text-anchor="middle" font-weight="500">Provenance · batch size</text><text x="560" y="167" fill="#aab0bc" font-size="15" text-anchor="middle" font-weight="500">CI integrity · risk routing</text><g transform="translate(785 65)"><circle r="32" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M-19-16h38v27H-5l-11 9v-9h-3zM-10-6h20M-10 2H5"/></g></g><text x="785" y="122" fill="#e9eaee" font-size="16" text-anchor="middle" font-weight="650">Retain findings</text><text x="785" y="146" fill="#aab0bc" font-size="15" text-anchor="middle" font-weight="500">Conftest JSON + artifact</text><text x="785" y="167" fill="#aab0bc" font-size="15" text-anchor="middle" font-weight="500">MR comment attempted</text><path data-flow-edge="" class="flow-motion" d="M146 65H297" fill="none" stroke="#a78bfa" stroke-width="1.8" stroke-dasharray="3 7" marker-end="url(#policy-desktop-arrow)"/><path data-flow-edge="" class="flow-motion" d="M371 65H522" fill="none" stroke="#a78bfa" stroke-width="1.8" stroke-dasharray="3 7" marker-end="url(#policy-desktop-arrow)"/><path data-flow-edge="" class="flow-motion" d="M596 65H747" fill="none" stroke="#a78bfa" stroke-width="1.8" stroke-dasharray="3 7" marker-end="url(#policy-desktop-arrow)"/><text x="450" y="228" fill="#e9eaee" font-size="17" text-anchor="middle" font-weight="650">Mode routing happens inside each of the four contracts</text><rect x="40" y="252" width="250" height="96" rx="10" fill="#1c1e24" stroke="#484052"/><text x="56" y="278" fill="#c4b5fd" font-size="15" text-anchor="start" font-weight="650">OFF</text><text x="56" y="303" fill="#e9eaee" font-size="15" text-anchor="start" font-weight="500">No finding from that contract</text><rect x="325" y="252" width="250" height="96" rx="10" fill="#1c1e24" stroke="#484052"/><text x="341" y="278" fill="#c4b5fd" font-size="15" text-anchor="start" font-weight="650">WARN · delivered default</text><text x="341" y="303" fill="#e9eaee" font-size="15" text-anchor="start" font-weight="500">Violation → warning</text><rect x="610" y="252" width="250" height="96" rx="10" fill="#1c1e24" stroke="#484052"/><text x="626" y="278" fill="#c4b5fd" font-size="15" text-anchor="start" font-weight="650">ENFORCE · code path</text><text x="626" y="303" fill="#e9eaee" font-size="15" text-anchor="start" font-weight="500">Violation → denial*</text><text x="450" y="379" fill="#c4b5fd" font-size="16" text-anchor="middle" font-weight="650">A policy-level denial is not yet a pipeline-level block.</text><path data-flow-edge="" class="flow-motion" d="M785 184H884V421H785V444" fill="none" stroke="#a78bfa" stroke-width="1.8" stroke-dasharray="3 7" marker-end="url(#policy-desktop-arrow)"/><rect x="40" y="446" width="820" height="113" rx="10" fill="#1c1e24" stroke="#75608f"/><g transform="translate(88 502)"><circle r="32" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M-22 0h12m20 0h12M-10-12h20v24h-20zM-4-5l9 5-9 5z"/></g></g><text x="88" y="559" fill="#e9eaee" font-size="16" text-anchor="middle" font-weight="650"></text><text x="145" y="477" fill="#e9eaee" font-size="17" text-anchor="start" font-weight="650">CI wrapper: allow_failure: true</text><text x="145" y="506" fill="#e9eaee" font-size="15" text-anchor="start" font-weight="500">A denial can fail the job; this job is allowed to fail.</text><text x="145" y="534" fill="#c4b5fd" font-size="15" text-anchor="start" font-weight="500">The pipeline may remain green. Enforcement graduation is separate.</text></svg></div>
<div class="flow-mobile"><svg class="policy-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 1120" role="img" aria-labelledby="policy-mobile-title policy-mobile-desc">
<title id="policy-mobile-title">From merge-request facts to policy findings and a non-blocking CI job</title>
<desc id="policy-mobile-desc">Git facts become JSON input, four Rego contracts evaluate their own modes, and Conftest produces findings. Off is silent for those contracts, warn produces warnings, enforce can produce denials. The historical job still allowed failure, so a denial did not necessarily block the pipeline. Lines show evaluation direction, not live traffic.</desc>
<defs><pattern id="policy-mobile-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".8" fill="#3b3f4a"/></pattern><marker id="policy-mobile-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5 0 10" fill="none" stroke="#a78bfa" stroke-width="1.5"/></marker></defs>
<style>.policy-svg{font-family:system-ui,-apple-system,sans-serif}.flow-motion{animation:policy-dots 1.4s linear infinite}@keyframes policy-dots{to{stroke-dashoffset:-20}}.flow-paused .flow-motion{animation-play-state:paused}@media(prefers-reduced-motion:reduce){.flow-motion{animation:none}}</style>
<rect width="360" height="1120" rx="12" fill="#141414"/><rect width="360" height="1120" fill="url(#policy-mobile-dots)"/>
<g transform="translate(49 64)"><circle r="32" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="-10" cy="-12" r="4"/><circle cx="-10" cy="12" r="4"/><circle cx="12" cy="0" r="4"/><path d="M-10-8v16M-6-12h5q13 0 13 8"/></g></g><text x="103" y="52" fill="#e9eaee" font-size="16" text-anchor="start" font-weight="650">MR evidence</text><text x="103" y="76" fill="#aab0bc" font-size="13" text-anchor="start" font-weight="500">Git trailers + diff</text><text x="103" y="97" fill="#aab0bc" font-size="13" text-anchor="start" font-weight="500">Available risk artifact</text><g transform="translate(49 194)"><circle r="32" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M-12-19H6l9 9v29h-27zM6-19v10h9M-5-2l-5 5 5 5M7-2l5 5-5 5"/></g></g><text x="103" y="182" fill="#e9eaee" font-size="16" text-anchor="start" font-weight="650">Build JSON input</text><text x="103" y="206" fill="#aab0bc" font-size="13" text-anchor="start" font-weight="500">Paths, size, provenance</text><text x="103" y="227" fill="#aab0bc" font-size="13" text-anchor="start" font-weight="500">Co-author signal + modes</text><g transform="translate(49 324)"><circle r="32" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M0-21l18 7v13q0 14-18 23Q-18 13-18-1v-13zM-8 0l6 6L10-7"/></g></g><text x="103" y="312" fill="#e9eaee" font-size="16" text-anchor="start" font-weight="650">Evaluate policies</text><text x="103" y="336" fill="#aab0bc" font-size="13" text-anchor="start" font-weight="500">Provenance · batch size</text><text x="103" y="357" fill="#aab0bc" font-size="13" text-anchor="start" font-weight="500">CI integrity · risk routing</text><g transform="translate(49 454)"><circle r="32" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M-19-16h38v27H-5l-11 9v-9h-3zM-10-6h20M-10 2H5"/></g></g><text x="103" y="442" fill="#e9eaee" font-size="16" text-anchor="start" font-weight="650">Retain findings</text><text x="103" y="466" fill="#aab0bc" font-size="13" text-anchor="start" font-weight="500">Conftest JSON + artifact</text><text x="103" y="487" fill="#aab0bc" font-size="13" text-anchor="start" font-weight="500">MR comment attempted</text><path data-flow-edge="" class="flow-motion" d="M49 100V157" fill="none" stroke="#a78bfa" stroke-width="1.8" stroke-dasharray="3 7" marker-end="url(#policy-mobile-arrow)"/><path data-flow-edge="" class="flow-motion" d="M49 230V287" fill="none" stroke="#a78bfa" stroke-width="1.8" stroke-dasharray="3 7" marker-end="url(#policy-mobile-arrow)"/><path data-flow-edge="" class="flow-motion" d="M49 360V417" fill="none" stroke="#a78bfa" stroke-width="1.8" stroke-dasharray="3 7" marker-end="url(#policy-mobile-arrow)"/><text x="80" y="554" fill="#e9eaee" font-size="14" text-anchor="start" font-weight="650">Each contract has its own mode</text><rect x="80" y="574" width="260" height="96" rx="10" fill="#1c1e24" stroke="#484052"/><text x="96" y="600" fill="#c4b5fd" font-size="15" text-anchor="start" font-weight="650">OFF</text><text x="96" y="625" fill="#e9eaee" font-size="15" text-anchor="start" font-weight="500">No finding from that contract</text><rect x="80" y="684" width="260" height="96" rx="10" fill="#1c1e24" stroke="#484052"/><text x="96" y="710" fill="#c4b5fd" font-size="15" text-anchor="start" font-weight="650">WARN · delivered default</text><text x="96" y="735" fill="#e9eaee" font-size="15" text-anchor="start" font-weight="500">Violation → warning</text><rect x="80" y="794" width="260" height="96" rx="10" fill="#1c1e24" stroke="#484052"/><text x="96" y="820" fill="#c4b5fd" font-size="15" text-anchor="start" font-weight="650">ENFORCE · code path</text><text x="96" y="845" fill="#e9eaee" font-size="15" text-anchor="start" font-weight="500">Violation → denial*</text><path data-flow-edge="" class="flow-motion" d="M49 490V920H80" fill="none" stroke="#a78bfa" stroke-width="1.8" stroke-dasharray="3 7" marker-end="url(#policy-mobile-arrow)"/><rect x="80" y="922" width="260" height="170" rx="10" fill="#1c1e24" stroke="#75608f"/><text x="96" y="951" fill="#e9eaee" font-size="14" text-anchor="start" font-weight="650">CI wrapper is a second decision</text><text x="96" y="980" fill="#c4b5fd" font-size="13" text-anchor="start" font-weight="500">allow_failure: true</text><text x="96" y="1003" fill="#e9eaee" font-size="13" text-anchor="start" font-weight="500">A denial can fail the job.</text><text x="96" y="1026" fill="#e9eaee" font-size="13" text-anchor="start" font-weight="500">This job is allowed to fail.</text><text x="96" y="1049" fill="#e9eaee" font-size="13" text-anchor="start" font-weight="500">Pipeline may remain green.</text></svg></div>
<div class="flow-tools"><button type="button" data-flow-motion aria-pressed="false">Pause flow</button><button type="button" data-flow-expand>Expand diagram</button></div>
<figcaption>Source: historical policy/build_input.py, four Rego contracts and .gitlab-ci.yml at 930e54df. *The batch soft limit stays a warning in enforce mode. The diagram shows the delivered default-warn mechanism; Unleash integration and enforcement graduation remained deferred. Dotted arrows show direction, not live traffic.</figcaption>
</figure>
<style>.policy-flow{background:#141414!important;color:#e9eaee!important;padding:14px!important;overflow:hidden}.policy-flow h3{color:#e9eaee!important;font-size:16px;margin:8px 4px 16px}.policy-svg{display:block;width:100%;height:auto}.flow-desktop{display:block}.flow-mobile{display:none}.policy-flow .flow-tools{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0}.policy-flow button,.flow-dialog button{font:13px system-ui;background:#1c1e24;color:#e9eaee;border:1px solid #75608f;border-radius:6px;padding:8px 12px;cursor:pointer}.policy-flow button:focus-visible,.flow-dialog button:focus-visible{outline:2px solid #c4b5fd;outline-offset:3px}.policy-flow figcaption{color:#aab0bc!important;font:12px/1.65 system-ui;text-align:left}.flow-paused .flow-motion{animation-play-state:paused!important}.flow-dialog{width:min(96vw,1150px);max-width:96vw;height:92vh;background:#141414;color:#e9eaee;border:1px solid #75608f;border-radius:10px;padding:14px}.flow-dialog::backdrop{background:#000b}.flow-dialog-head{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.flow-dialog-content{overflow:auto;max-height:calc(92vh - 100px)}@media(max-width:600px){.policy-flow{padding:8px!important}.flow-desktop{display:none}.flow-mobile{display:block}}</style>
<dialog class="flow-dialog" data-flow-dialog aria-label="Expanded policy enforcement diagram"><div class="flow-dialog-head"><strong>Policy enforcement flow</strong><button type="button" data-flow-motion aria-pressed="false">Pause flow</button><button type="button" data-flow-close>Close</button></div><div class="flow-dialog-content" data-flow-expanded-content></div></dialog>
<script is:inline src="/posts/s4e15/review-v1/flow-ui.js"></script>
<script is:inline src="/posts/s4e15/review-v1/flow-motion.js"></script>

## What the gate could actually see

The foundation was **VW-962 — VW-945a: OPA/Conftest engine — policy/ scaffold + `build_input.py` + `contracts:llm-gate` CI job**. Its historical merge is present on 22 June. The later source snapshot shows the input builder collecting a diff range, parsing attribution trailers, counting inserted and deleted lines, listing changed paths and inspecting the diff for coverage-floor changes.

This gave the policies concrete fields rather than a request to make an open-ended judgement about whether a patch looked safe.

| Input | How the inspected builder obtains it | Boundary to remember |
|---|---|---|
| Agent, model and session | Shared Git-trailer attribution parser | A parsed identity is a convention; it does not authenticate an author |
| Lines and files changed | Git diff statistics and changed paths | Size describes scope, not the correctness or risk of every line |
| CI controls touched | Explicit paths and directory prefixes | Protection is as broad as that maintained path list |
| Coverage floor lowered | Removed and added `--cov-fail-under` values | This is a targeted diff check, not general understanding of test quality |
| Risk tier | A recognised local risk artifact, otherwise `unknown` | Missing risk information does not become a high-risk verdict automatically |
| Human co-author signal | A nonempty trailer identity that does not match the agent strings | It does not query merge-request approvals or verify the person's identity |

The specification was broader than the delivered detector. It asked for protection against removed assertions and other ways of weakening CI. The inspected builder implements coverage-floor comparison and protected-path detection. I would not describe that as proof that it could detect every deleted assertion or weakened test.

There is a similar limit around agent identity. The delivered provenance policy recognises `codex` and `claude-code`. Other attribution outcomes do not acquire those checks merely because the design describes an agent channel. The mechanism can ask whether the provenance fields it receives are empty; it cannot establish that all agent work has declared itself honestly.

Those boundaries keep the story useful. They tell me where to improve the control, rather than letting the name “governance” stand in for coverage the code did not provide.

## The fixture that changed the rule

The next slice was **VW-963 — VW-945b: Three new contracts — provenance + diff-scope-cap + CI-weakening veto (Rego + tests)**. This is the review failure at the centre of the episode.

The implementation report describes two Codex lanes. The first added a special case for changes that only touched `build_input.py`. That kept an existing smoke fixture passing, but it exempted an input-builder edit from the CI-integrity contract. The verifier rejected it. The same review also found that checking only an empty string missed provenance fields that were absent altogether.

The report identifies a cause in the specification itself: it had insisted that the smoke fixture be preserved while asking for a rule whose intended behaviour changed that fixture's result. The implementation satisfied the preservation constraint by weakening the boundary. That is an important failure in how the work was specified, as well as a bad change in the resulting code.

![The engineer removes a small bridging shim from an instrument interlock while a replacement test piece rests on the bench.](/posts/s4e15/review-v1/fixture.png)

<p class="caption">Repair the test's assumptions instead of creating an exception in the control. Conceptual illustration.</p>

The second specification removed that conflict. It allowed the fixture to change and forbade the exemption. The revised fixture supplied the human co-author signal required for its control-file edit; a separate solo-agent edit had to keep producing a violation. Provenance used `object.get` so an absent field and an empty one both reached the missing-value check.

The final historical source includes the whole `policy/` directory in the protected prefixes. That includes the builder itself. The CI-integrity rule then consumes the `touches_ci` fact without a builder-only carve-out.

<div class="code-source">Exact historical extract · policy/ci_integrity.rego · control-edit violation at 930e54df. The separate coverage rule and mode routing are omitted.</div>

```rego
ci_integrity_violation[msg] {
	input.touches_ci == true
	agent_authored
	input.has_human_coauthor == false
	msg = "agent-authored CI change requires a human coauthor"
}
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

1. `ci_integrity_violation[msg]` defines a collection of violation messages. This helper identifies the condition; other rules choose whether to warn or deny.
2. `input.touches_ci == true` requires the builder to have classified at least one changed file as a protected control. The rule depends on the builder's facts.
3. `agent_authored` calls the shared policy helper recognising the two agent identities. It does not independently identify who wrote a change.
4. `input.has_human_coauthor == false` checks that the builder did not find its accepted trailer signal. It does not mean that GitLab has proved no human reviewed the merge request.
5. The last line supplies the message returned when all the conditions hold. The closing brace ends the rule.

</details>

The report says the verifier reconstructed the attack inputs: a solo input-builder change had to be denied, and a missing model key had to be denied. It records 17 passing Conftest tests. Re-running the retained revision during preparation also gives 17/17, with Rego v0 compatibility enabled. That independently checks the saved rules now; the original reviewer interaction remains a historical report.

The practical lesson is specific. When a new control changes an old fixture's verdict, preserving the fixture is not automatically the right constraint. The expected result needs review. Otherwise a test can reward the very exemption the control was built to prevent.

## The gate met its own merge request

The historical report describes the first real CI evaluation on the merge request introducing those contracts. It records two findings: the agent-authored change touched policy controls without the expected human co-author trailer, and the commit lacked session provenance.

These were policy denials, but the job was allowed to fail. The pipeline could remain green while the findings were retained. That is the first stage of warning in this story: **a non-blocking CI job around rules that could emit denials**. It is different from the later rules explicitly returning warnings under a per-contract mode.

The inspected CI configuration supports that distinction. It runs the builder, captures Conftest's JSON and exit status, constructs a Markdown findings table, attempts to post it when a token and merge-request context are available, and retains the artifacts. It ends with the captured status while `allow_failure: true` makes the job non-blocking.

That is a useful feedback path, with an operational limit. The script permits a failed comment request and keeps a local artifact instead. Source inspection proves the attempted annotation path; the report supplies the account of the introducing run. I have not recovered that run's raw job log or independently inspected its original posted comment.

The finding also exposed a mismatch in the policy model. Reviewing an agent's merge request in GitLab did not add a co-author trailer to the commit. The human oversight the workflow cared about and the evidence the policy accepted lived in different places.

Calling that a false positive would skip the actual problem. The rule accurately evaluated its input. Its input did not represent the review event the design wanted to recognise. Before making it blocking, that gap needed a deliberate solution.

## One condition, three modes

The final implementation slice carried the historical title **VW-964 — VW-945c: Graduate `pdg:risk-gate` + warn-then-enforce wiring (Unleash flags + would-block counter)**. The title describes the intended scope. The implementation report is more limited: it delivered the mode mechanism and risk-routing contract, with infrastructure integration still deferred.

The input builder gained one environment variable per contract. It normalises each value, accepts `off`, `warn` or `enforce`, and falls back to `warn` for an absent or invalid setting. The Rego files use their own warn fallback when the `modes` object is absent.

<div class="code-source">Exact historical extract · policy/build_input.py · _contract_modes at 930e54df. The mapping of contract names to environment-variable names is defined earlier in the file.</div>

```python
def _contract_modes(env: Mapping[str, str] | None = None) -> dict[str, str]:
    environment = env or os.environ
    modes: dict[str, str] = {}
    for contract, env_name in _CONTRACT_MODE_ENV.items():
        mode = environment.get(env_name, "").strip().lower()
        if mode not in _VALID_CONTRACT_MODES:
            mode = "warn"
        modes[contract] = mode
    return modes
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

1. The function accepts an optional mapping of environment-variable names to strings and returns contract names mapped to mode strings.
2. `env or os.environ` chooses a nonempty supplied mapping, otherwise the process environment. An empty supplied mapping also falls back to the process environment.
3. `modes` starts as an empty result dictionary.
4. The loop visits the four contract-to-variable entries declared elsewhere in the file.
5. `get` reads a variable or an empty default; `strip` removes surrounding whitespace and `lower` normalises its case.
6. The condition checks membership in the allowed set: `off`, `warn`, `enforce`.
7. Anything outside that set becomes `warn`.
8. The validated mode is saved under that contract's name.
9. The complete mapping becomes the input document's `modes` field when the caller assembles the JSON.

</details>

The batch-size contract needs one extra distinction. The soft limit is more than 800 changed lines or 25 files; it remains a warning even in enforce mode. More than 2,000 lines or 60 files crosses a hard limit. Those are strict greater-than comparisons, with insertions plus deletions counted as changed lines.

| Mode | Ordinary contract violation | Batch soft limit | Batch hard limit |
|---|---|---|---|
| `off` | Silent | Silent | Silent |
| `warn` | Warning | Warning | Warning |
| `enforce` | Denial | Warning | Denial, alongside any crossed soft-limit warning |

The fourth contract consumes a supplied `high` risk tier and the same co-author signal. It does not reimplement the dependency-risk analysis or identify a named reviewer. The report explicitly says the existing risk-gate implementation was untouched.

The report records a successful first lane for this slice after the mode matrix had been specified up front: 28 Conftest tests and 17 Python input-builder tests. During this reconstruction I reran the retained Rego suite and obtained 28/28. I have not rerun the original Python suite or GitLab pipeline. The local Conftest reports a development build with OPA 1.21.0; `--rego-version v0` makes the historical syntax explicit, but does not reproduce CI's pinned Conftest 0.56.0 binary.

## The dial was installed; the rollout was unfinished

![The engineer checks a mechanical warning bell in a dark theatre fly tower while the heavy brake remains secured.](/posts/s4e15/review-v1/soak.png)

<p class="caption">Observe the warning before relying on it to stop the machinery. Conceptual illustration.</p>

The mode mechanism was real. An operational flag-controlled enforcement rollout was still ahead of it. The report lists three requirements before graduation: the Unleash flags and bridge that would export their state into CI, a Grafana would-block panel, and an accepted way to represent human approval.

A separate follow-up captured those remaining pieces: **VW-993 — VW-945d: LLM-channel gate enforcement graduation — Unleash flags + CI env-bridge + Grafana would-block panel + human-approval encoding**. The restored June snapshot marks that task Backlog and the three implementation children Done. Completing the engine, contracts and mode mechanism had not completed the enforcement rollout.

That changes the ending. The work did not establish that I could already flip an Unleash flag to make an agent policy block a merge. It established an environment-driven policy mechanism, defaulting to warnings, inside a job that still had `allow_failure: true`. Even a policy-level denial and a pipeline-level blocking decision were separate layers to wire deliberately.

The implementation report's completion status and the follow-up ticket therefore describe different scopes. It does not complete every acceptance criterion in the original programme. There is no measured false-positive rate in the inspected evidence, no proof that the dashboard was counting would-block events and no demonstrated graduation to enforcement.

That is still a useful result. The first review had found a hole in the gate's input boundary. The first reported evaluation had found missing provenance and an inadequate representation of oversight. The next implementation made policy behaviour explicit enough to test across modes. Each stage narrowed a different uncertainty.

## What I would carry forward

The balance I wanted was safer delivery without making every useful iteration wait for a sprawling manual process. This work shows why achieving that balance needs more than adding a gate job.

- **Protect the evidence path.** A rule can be correct while the input builder filters away the fact that should trigger it. Changes to that builder belong inside the protected boundary.
- **Review contradictory requirements early.** “Preserve the fixture” and “change what this fixture is allowed to do” cannot both be treated as fixed instructions. Resolve the expected behaviour before implementation.
- **Separate a signal from the authority it represents.** A co-author string, an authenticated identity and a review approval answer different questions. Choose the evidence the decision actually needs.
- **Test modes and defaults explicitly.** Off, warning, denial, absent settings and invalid values are part of the contract. The soft batch limit also needs its own expected result.
- **Measure before tightening.** Would-block counts and reviewed false positives were still work to do. Provisional thresholds are easier to improve when their uncertainty stays visible.

I would judge the gate by the decisions it could explain and the limits I could inspect. The implementation made a small set of review concerns executable. The review around it stopped one of those concerns being weakened for convenience. The unfinished rollout then showed exactly what evidence was needed before I could trust it to block work.

Next in the verified sequence is **Episode 16, “The Trust Engine — the Grounding Architecture.”** The retained plan and pre-crafted episode move from checking code changes to grounding generated claims in evidence. That is the next engineering question: how to preserve the connection between what an agent says and the source that permits it to say it.

<details class="source-note">
<summary>Sources, scope and omissions</summary>

This episode reconstructs selected work from the 21 June specification and 22–23 June implementation. The canonical 30 June flat sequence fixes its place after Episode 14. The unchanged pre-crafted Episode 15 is retained for comparison, with a separate claim ledger and hashed source inventory.

The two implementation reports describe the rejected lane, the verifier's checks, test counts and first CI findings. Historical Git objects establish the merged source at 816328c1, 916d5248 and 930e54df. Fresh local Rego tests inspect those saved rules today. None of those substitutes for a complete native-session replay or a recovered original GitLab run.

The wider ticket window also contains measurement, migration aftermath, budgeting, journal operations, commercialisation and Trust Engine work. These are inventoried separately and left with their existing episode owners. Raw conversations, credentials, private employer records, a full 22–23 June ticket census, original review comments and measured soak results are not part of this reconstruction. Tracker access was restored during review. The recovered June records provide fuller titles, historical statuses and a separately tracked enforcement follow-up; they do not recover the original issue descriptions, comments or attachments. Those missing discussions remain a limitation, and the snapshot is not a fresh assessment of present-day enforcement.

The technical background follows the official [Conftest guide](https://www.conftest.dev/), [OPA Rego documentation](https://www.openpolicyagent.org/docs/policy-language), [Git trailer documentation](https://git-scm.com/docs/git-interpret-trailers) and [GitLab merge-request approval guide](https://docs.gitlab.com/user/project/merge_requests/approvals/). Current documentation explains terms; historical source establishes this implementation.

</details>

<details data-glossary>
<summary>Glossary — policy inputs, warnings and review</summary>
<div class="glossary-tools" hidden><label for="glossary-search">Find a term</label> <input id="glossary-search" type="search" placeholder="Search definitions"><button type="button">Clear</button><p role="status" aria-live="polite"></p></div>
<div class="glossary-term"><h3>Policy as code</h3><p>Review or operational rules expressed as executable policy over defined inputs. It still needs trustworthy inputs and an enforcement integration. <a href="https://www.openpolicyagent.org/docs/policy-language">OPA policy language</a>.</p></div>
<div class="glossary-term"><h3>Rego</h3><p>OPA's declarative policy language. The examples here preserve the historical Rego v0 syntax. <a href="https://www.openpolicyagent.org/docs/policy-language">Rego documentation</a>.</p></div>
<div class="glossary-term"><h3>Conftest</h3><p>A tool for evaluating Rego policies against structured files, and for verifying policy tests. <a href="https://www.conftest.dev/">Conftest guide</a>.</p></div>
<div class="glossary-term"><h3>Git trailer</h3><p>A structured key/value line in a commit message. Parsing a trailer does not authenticate its contents. <a href="https://git-scm.com/docs/git-interpret-trailers">Git trailer documentation</a>.</p></div>
<div class="glossary-term"><h3>Merge-request approval</h3><p>A review action recorded in GitLab. Whether approvals block merging depends on project configuration and available rules. It is separate from a commit co-author trailer. <a href="https://docs.gitlab.com/user/project/merge_requests/approvals/">GitLab approval guide</a>.</p></div>
<div class="glossary-term"><h3>Test fixture</h3><p>A defined input and expected result used to exercise a rule. When intended behaviour changes, the fixture's expected result may need to change. <a href="https://www.conftest.dev/#testingverifying-policies">Conftest policy testing</a>.</p></div>
<div class="glossary-term"><h3>Warn and deny</h3><p>Policy result categories. A denial becomes a delivery stop only when the surrounding CI integration makes its failure blocking. <a href="https://www.conftest.dev/">Conftest evaluation</a>.</p></div>
</details>

<script is:inline src="/posts/s4e15/review-v1/reader.js"></script>
