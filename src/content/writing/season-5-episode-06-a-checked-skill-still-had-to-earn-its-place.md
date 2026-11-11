---
title: "A Checked Skill Still Had to Earn Its Place"
description: "Porting a reusable agent skill meant testing three different claims: that it fit the platform, that its advice was grounded, and that invoking it helped."
pubDatetime: 2026-07-07T12:00:00Z
draft: false
shippingDatetime: 2026-11-11T08:00:00Z
imageAlt: "The Rootweaver engineer checks a loaf against a plain recipe notebook in a community bakery."
author: Ryan Duffy
episode: 6
image: /images/blog/s5e06/hero-A.png
series: "Season 5: Rootweaver"
tags: [Rootweaver, AgentEngineering, Evaluation, SoftwareEngineering]
---

[The previous episode](https://rduffy.uk/writing/season-5-episode-05-the-gate-was-measuring-the-wrong-question/) followed a memory-first gate that was measuring the wrong question. Once the input was wrong, a precise metric could still describe the wrong behaviour. The next July thread moved that problem into the instructions themselves. An agent skill could be valid Markdown, fit the repository and pass review while its advice remained dated or its practical value untested.

I wanted reusable engineering guidance for Rootweaver without importing another project's assumptions. The work began as a small port of two skills, expanded to five, then changed direction when I asked what actually grounded the advice. A later bounded trial asked whether invoking one of those skills changed the work.

![The Rootweaver engineer checks a loaf against a plain recipe notebook in a community bakery.](/images/blog/s5e06/hero-A.png)

<p class="caption">A coherent recipe is a starting point. The ingredients, source and result still need checking. Conceptual illustration.</p>

This chapter covers July 7, 2026, with the July 6 pilot specification as declared setup context. It is a curated reconstruction from the skills handovers, pilot and efficacy reports, and retained source. I owned the question, direction and review; agents assisted with authoring, research and checking. Reported verifier results and trial scores remain historical reports. New inspection does not rerun those agent trials or establish present-day task performance.

## A port needed more than renamed tools

The starting material came from [Addy Osmani's agent-skills project](https://github.com/addyosmani/agent-skills). The retained pilot report identifies it as MIT-licensed and credits that source. Rootweaver's adaptation replaced generic web-application defaults with the platform's actual boundaries: source code, CI, image registry, GitOps, cluster reconciliation and runtime evidence.

That was a substantive part of the work. Advice to inspect a GitHub Actions job would be misplaced in a GitLab-driven workflow. A deployment checklist that ended when an image existed would miss the later GitOps and runtime stages. A security checklist had to consider retrieved documents and tool inputs, not just a public website's request handlers.

The pilot deliberately covered two areas first: security and hardening, and CI/CD automation. Mechanical checks tested the document shape and looked for generic tool references that should not have survived the adaptation. A separate agent verifier checked platform consistency. The report records those checks as passing; it also says a client-specific skill-load smoke was approximated by frontmatter validation and direct inspection because the authoring client did not expose the other harness's native skill tool.

That limitation belongs beside the result. Finding a skill file and validating its frontmatter can show that the artifact is well formed. It cannot prove that another application's skill discovery loaded it, that an agent invoked it on a real task, or that the invocation improved the result.

There was a more personal provenance defect too. The first port contained the authoring agent's own identity in instructions intended for future agents. If copied forward, those instructions could attribute a later non-Codex contribution to Codex. The historical handover says the hardcoded labels were replaced with dynamic producer identification, and the follow-on specification added an explicit check against repeating that mistake.

This is an easy defect to overlook because the document can be perfectly readable. Its instructions are wrong about who will use it. A reusable workflow needs the actual future producer to identify itself; the identity of the agent that first wrote the template is historical metadata, not a universal default.

## Three different questions about quality

After the pilot, three more skills covered observability, performance and shipping. The July records describe five completed ports. My next question was whether their disciplines were grounded in research and established practice. The answer recorded at that point was that consistency had been checked, but external citations had not.

That is a meaningful distinction. A verifier can compare a document against a platform map and catch a wrong service name. It cannot establish that a claimed industry definition is current merely because every local document repeats it. Internal agreement is evidence of consistency, not external truth.

| Check | Concrete question | Evidence it can provide | Limit |
|---|---|---|---|
| Platform consistency | Does the guidance fit this system? | Paths, ownership, tools and workflow references agree | The advice can still be outdated |
| External grounding | Does a primary source support the advice? | A dated, attributable source and a traceable claim | A citation alone does not show practical benefit |
| Task efficacy | Does invoking the skill improve this task? | A bounded control/treatment comparison | One draw does not establish a general effect |

The later research pass added primary references and found one concrete problem in the shipping guidance's DORA framing. Other skills received references without a substantive correction. A null result can be useful when a real source check precedes it; it should not be assumed merely because the prose sounds familiar.

There is a further correction to preserve in this reconstruction. The historical edit discussed reliability as a fifth DORA key. I am not copying that shorthand as current guidance. [Nathen Harvey's DORA history](https://dora.dev/insights/dora-metrics-history/) explains that the framework changed over time. The [current delivery-metrics guide](https://dora.dev/guides/dora-metrics/) includes deployment rework rate in its five delivery measures. The old skill and its reported correction are historical evidence; neither replaces reading the primary definition for the claim being made now.

That does not invalidate the useful July decision to require grounding. It shows why grounding is a continuing traceability obligation rather than a permanent certificate attached to a document. A source needs a date, a claim and the right scope. An old summary can lag behind the source it cites.

<figure id="mechanism" class="story-flow" data-policy-flow><h3>Follow the mechanism</h3><div class="flow-desktop"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 210" role="img" aria-label="Episode 6 simplified mechanism"><defs><pattern id="grid-e6-d" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arr-e6-d" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="#a78bfa"/></marker></defs><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#grid-e6-d)"/><path data-flow-edge class="flow-motion" d="M95 62H190" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e6-d)"/><path data-flow-edge class="flow-motion" d="M240 62H335" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e6-d)"/><path data-flow-edge class="flow-motion" d="M385 62H480" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e6-d)"/><path data-flow-edge class="flow-motion" d="M530 62H625" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e6-d)"/><g transform="translate(70 62)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><rect x="-9" y="-12" width="18" height="24" rx="2"/><path d="M-5-5H5M-5 1H5M-5 7H3"/></g></g><text x="70" y="109" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Port</text><text x="70" y="129" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Fit platform reality</text><g transform="translate(215 62)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><path d="M-12 0L-3 9L14-10"/></g></g><text x="215" y="109" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Coherence</text><text x="215" y="129" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Check local contracts</text><g transform="translate(360 62)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><circle cx="-6" cy="-3" r="7"/><path d="M0 2L12 14M8 10L12 6"/></g></g><text x="360" y="109" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Grounding</text><text x="360" y="129" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Read primary sources</text><g transform="translate(505 62)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><path d="M-14-11H14L4 2V12H-4V2Z"/></g></g><text x="505" y="109" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Bounded trial</text><text x="505" y="129" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Same task, two arms</text><g transform="translate(650 62)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><circle cx="0" cy="-11" r="4"/><circle cx="-12" cy="9" r="4"/><circle cx="12" cy="9" r="4"/><path d="M-2-7L-10 5M2-7L10 5M-8 9H8"/></g></g><text x="650" y="109" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Judgment</text><text x="650" y="129" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Keep claims scoped</text></svg></div><div class="flow-mobile"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 550" role="img" aria-label="Episode 6 simplified mechanism"><defs><pattern id="grid-e6-m" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arr-e6-m" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="#a78bfa"/></marker></defs><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#grid-e6-m)"/><path data-flow-edge class="flow-motion" d="M48 67V119" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e6-m)"/><path data-flow-edge class="flow-motion" d="M48 169V221" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e6-m)"/><path data-flow-edge class="flow-motion" d="M48 271V323" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e6-m)"/><path data-flow-edge class="flow-motion" d="M48 373V425" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e6-m)"/><g transform="translate(48 42)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><rect x="-9" y="-12" width="18" height="24" rx="2"/><path d="M-5-5H5M-5 1H5M-5 7H3"/></g></g><text x="90" y="38" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Port</text><text x="90" y="58" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Fit platform reality</text><g transform="translate(48 144)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><path d="M-12 0L-3 9L14-10"/></g></g><text x="90" y="140" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Coherence</text><text x="90" y="160" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Check local contracts</text><g transform="translate(48 246)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><circle cx="-6" cy="-3" r="7"/><path d="M0 2L12 14M8 10L12 6"/></g></g><text x="90" y="242" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Grounding</text><text x="90" y="262" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Read primary sources</text><g transform="translate(48 348)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><path d="M-14-11H14L4 2V12H-4V2Z"/></g></g><text x="90" y="344" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Bounded trial</text><text x="90" y="364" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Same task, two arms</text><g transform="translate(48 450)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><circle cx="0" cy="-11" r="4"/><circle cx="-12" cy="9" r="4"/><circle cx="12" cy="9" r="4"/><path d="M-2-7L-10 5M2-7L10 5M-8 9H8"/></g></g><text x="90" y="446" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Judgment</text><text x="90" y="466" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Keep claims scoped</text></svg></div><div class="flow-tools"><button type="button" data-flow-motion aria-pressed="false">Pause flow</button><button type="button" data-flow-expand>Expand diagram</button></div><figcaption>Simplified editorial diagram of the inspected mechanism. Moving dots show direction, not observed traffic or a successful run.</figcaption></figure><dialog data-flow-dialog aria-label="Expanded mechanism"><button type="button" data-flow-close>Close expanded diagram</button><div data-flow-expanded-content></div></dialog><script is:inline src="/images/blog/s5e06/flow-ui.js"></script><script is:inline src="/images/blog/s5e06/flow-motion.js"></script>

The diagram is an editorial model of the three checks. They are separate routes to evidence, not three automated stages proved to run on every later task. A failure in one cannot be repaired simply by collecting more passes in another.

## A real task gave the skill a fairer test

The later trial used an actual engineering surface: Dockerfiles installing the `uv` tool through unpinned or insufficiently verified fetch paths. The question was not whether a skill could explain security in the abstract. It was whether invoking the security skill changed the completeness and discipline of a plan for those files.

The author of a skill already knows its contents. Asking that same context to act as an uninformed control would contaminate the comparison. The report instead describes two fresh agent contexts on the same task: a control without the skill, and a treatment told to invoke the skill first. Neither saw the grading rubric. Six expected differences were registered before the two outputs were examined.

![The engineer compares two small seedling trays on a covered experimental bench.](/images/blog/s5e06/inline-1.png)

<p class="caption">A small comparison can answer a bounded question. It cannot establish what happens in every environment. Conceptual illustration, not the trial dataset.</p>

The historical score was five of six rubric items for the control and six of six for the skill-assisted arm. Both proposed the same core repair. The useful difference was largely scope discipline: the treatment explicitly cleared clean files from the work and made trust-boundary reasoning more consistent. It did not discover a vulnerability that the control missed.

Even the supposed oracle needed correction. The report says an initial search missed a pip-based installation because a comment matched first. The corrected trial fixture counted ten affected Dockerfiles. A later implementation handover described eleven changed files across a broader surface. Those counts should not be silently reconciled into one number: they describe different inventories at different stages. The draft follows the retained trial's denominator when discussing the trial and the later source when discussing the actual change.

A grep result is therefore inspectable evidence, but only if the search pattern, scope and interpretation are correct. Calling it ground truth does not make the first query infallible. The trial was stronger because it corrected that mistake before treating the output as its scoring reference.

## What the Dockerfile change actually pinned

The retained July implementation source contains this instruction. It is an exact historical line from the gateway Dockerfile at revision `c3ec5d23`; the version and digest are evidence of that change, not a current recommendation to install an old release.

<p class="code-source">gateway-Dockerfile · builder stage · platform c3ec5d23</p>

```dockerfile
COPY --from=ghcr.io/astral-sh/uv:0.11.27@sha256:4d01caf3b22dfd11003455e2e68153da08c4ee1fa54fdbd166c6282d22693419 /uv /uvx /usr/local/bin/
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- `COPY --from` selects files from another container image during the build.
- The version tag names the intended historical release; the digest pins the selected manifest rather than trusting a mutable tag alone.
- `/uv` and `/uvx` are the two source binaries. `/usr/local/bin/` is their destination in this builder stage.
- This line does not establish publisher trust, vulnerability status or final runtime contents. Those claims need their own evidence.

</details>

The tag helps a person recognise the intended release. The digest identifies the selected image manifest. The `COPY` operation takes the two tool binaries from that image into the builder stage. This avoids fetching an installer script during the build merely because a URL still resolves.

Pinning the source does not answer every supply-chain question. A digest identifies selected content; it does not establish that the publisher was trusted, that the dependency was vulnerability-free, or that a later runtime image contains only the intended tools. Those are additional checks. [Docker's build guidance](https://docs.docker.com/build/building/best-practices/#pin-base-image-versions) explains the reproducibility role of digest pinning, while [Astral's container guidance](https://docs.astral.sh/uv/guides/integration/docker/) documents the supported integration pattern.

The source also distinguishes the builder from the runtime stage. Dependencies and package wheels are assembled before the final image is created. That separation is useful, but a review must inspect what the final stage copies. A label saying builder-stage-only cannot substitute for following the actual instructions into the runtime filesystem.

Here is a synthetic evidence record for that review, with no real digest or registry proof implied:

```json
{
  "check": "tool image pin",
  "source_instruction": "Dockerfile COPY --from",
  "selected_content": "digest present",
  "publisher_verification": "separate check",
  "runtime_placement": "inspect final stage"
}
```

The fields keep three claims apart: the build selected fixed content, the content came from an accepted origin, and the final runtime contains the expected files. The example is a review aid. It is not a retained attestation or evidence that all three checks were performed that day.

## A useful result with a small denominator

The report's modest verdict is better supported than a claim of universal improvement. One treatment output satisfied one more expected rubric item than one control output, on one skill and one task. That supports keeping and studying the guidance in that setting. It does not supply an effect size for all agents or a confidence interval over future work.

Some original commentary went further, suggesting that a checklist guarantees consistency on every invocation or must help weaker models more. Those are hypotheses here. The retained single comparison does not establish either claim. A skill can be skipped, misread, conflict with task instructions or guide an agent toward the wrong scope. Repeat trials and evidence of actual use would be needed to test consistency and model-dependent benefit.

It would also be a mistake to score only the treatment's wins. The control surfaced a registry-egress risk that the report says the skill arm underweighted. That is useful adverse evidence. A process intended to improve security should retain that observation instead of flattening the outcome into “skill wins.”

| Retained result | Supported conclusion | Still open |
|---|---|---|
| Five ports passed consistency review | The reported local checks found no remaining platform mismatch in that scope | Actual loading and use in every client |
| Primary references were added | The guidance became easier to inspect and challenge | Whether every claim remains current |
| Trial scored 5/6 versus 6/6 | The treatment was more complete under that rubric on that draw | Repeatability and broader task benefit |
| Both arms chose the same core repair | The skill's value was not new vulnerability discovery in this test | Whether another task would show a different effect |

The trial and the later implementation also needed separate inventories. A controlled comparison should keep its fixture stable. A real change should re-check the files that exist when it is applied, including clean files deliberately left outside scope. Otherwise a score about a small fixture can drift into an unsupported claim about an entire repository.

![The engineer inspects a small brick stack while a larger materials yard remains outside the work area.](/images/blog/s5e06/inline-2.png)

<p class="caption">Define the work that belongs in the change, and leave unrelated material outside it. Conceptual artwork bound to the scope discipline observed in the trial.</p>

## Lessons I would keep

I would credit an upstream project at the point its contribution enters the story. Adaptation is real work, but it does not erase the origin of the method. The local port should explain what changed because the environment was different.

I would keep producer identity out of reusable imperative text. The skill can require provenance, while the actual agent supplies its observed identity when it acts. That preserves authorship instead of copying an old author's label into a new contribution.

I would ask three separate questions before calling a skill good: does it fit, is it grounded, and did it help? Those questions need different evidence. Passing more formatting checks cannot answer the last two.

For a follow-up trial, I would keep the real fixture, bounded scope, concealed rubric and pre-registered expectations. I would add repeated draws and a second task before making stronger claims about reliability or model effects. I would also retain any useful finding from the control, because the purpose is to improve the work rather than defend the treatment.

## Next in the sequence

The next July record returns to the publishing machinery. A claim ledger could contain the right evidence while a small header mismatch stopped the parser from seeing it. The July 8 fix is a useful continuation: before judging the quality of evidence, the system has to recognise what the author actually supplied.

<details class="glossary" data-glossary=""><summary>Glossary — plain-English definitions</summary><div class="glossary-tools" hidden=""><label for="glossary-search">Find a term</label><div class="glossary-search-row"><input id="glossary-search" type="search"/><button type="button">Clear</button></div><p aria-live="polite" role="status"></p></div><section class="glossary-term" id="term-agent-skill"><h3>Agent skill</h3><p>Reusable instructions that a client may discover and invoke. <a href="https://github.com/addyosmani/agent-skills">Primary concept reference</a>.</p></section><section class="glossary-term" id="term-grounding"><h3>Grounding</h3><p>Linking a claim to an appropriate inspectable source. Episode evidence and limits (retained historical evidence).</p></section><section class="glossary-term" id="term-control-arm"><h3>Control arm</h3><p>The comparison condition without the selected intervention. Episode evidence and limits (retained historical evidence).</p></section><section class="glossary-term" id="term-treatment-arm"><h3>Treatment arm</h3><p>The condition with the selected intervention. Episode evidence and limits (retained historical evidence).</p></section><section class="glossary-term" id="term-pre-registration"><h3>Pre-registration</h3><p>Stating expected comparisons before examining the trial outcomes. Episode evidence and limits (retained historical evidence).</p></section><section class="glossary-term" id="term-image-digest"><h3>Image digest</h3><p>A content identifier for a selected image manifest, distinct from publisher trust. <a href="https://docs.docker.com/build/building/best-practices/#pin-base-image-versions">Primary concept reference</a>.</p></section><section class="glossary-term" id="term-rubric"><h3>Rubric</h3><p>The explicit criteria used to score an output. Episode evidence and limits (retained historical evidence).</p></section><section class="glossary-term" id="term-external-validity"><h3>External validity</h3><p>How far a result can reasonably be carried beyond the tested setting. Episode evidence and limits (retained historical evidence).</p></section></details>

## Sources and limits

The source and claim ledger (retained in review ledger) retains the pilot, grounding and trial reports, the historical shipping skill and Dockerfile source. It labels the primary-source clarification made during this reconstruction. Original agent trial transcripts, a repeated experimental sample and registry signature records are not included. The old reports are comparison evidence, not instructions to operate today's platform or proof that their broadest conclusions were correct.


<style is:global>
main{min-width:0}main>p:not(:has(img)){max-width:74ch}main>ul,main>ol{max-width:74ch}.eyebrow{text-transform:none;letter-spacing:.025em}.reading-progress{position:fixed;left:0;top:0;height:3px;width:0;background:var(--accent);z-index:20;pointer-events:none}.reading-tools{max-width:1160px;margin:0 auto;padding:14px 28px 0;display:flex;justify-content:flex-end;gap:8px}.reader-button,.copy-code,.expand-diagram{border:1px solid var(--border);background:var(--card);color:var(--text);padding:7px 11px;border-radius:6px;font-size:11px}.copy-code{float:right;margin-left:10px}.code-source{display:flow-root}.contents a[aria-current="location"]{color:var(--accent);font-weight:600}.reading-focus .contents{display:none}.reading-focus .page-grid{display:block;max-width:800px}.reading-focus .nav-links>a{display:none}.reading-focus .article-header{max-width:none}.diagram{position:relative}.expand-diagram{display:block;margin:12px auto 0;background:#192d46;color:#eef6ff;border-color:#5c86a6}dialog{width:min(96vw,1300px);height:92vh;max-height:92vh;padding:18px;border:1px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text)}dialog::backdrop{background:rgba(0,0,0,.8)}.dialog-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}.diagram-scroll{overflow:auto;height:calc(100% - 54px);background:#101c2d;border-radius:8px}.diagram-scroll img{width:1200px;max-width:none;border-radius:0;margin:0 auto}.sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:600px){.reading-tools{padding:12px 18px 0}.copy-code{padding:4px 7px}.dialog-head{font-size:12px}dialog{padding:10px}.diagram-scroll img{width:1000px}}
.article-header{border-left:3px solid var(--accent);padding-left:22px}.eyebrow{margin-top:25px}.page-grid{grid-template-columns:minmax(0,740px) 210px;gap:64px}.code-box{box-shadow:0 8px 22px #00000012}h2{border-bottom:0;padding-bottom:0}.caption{border-left:0;padding-left:0}@media(max-width:600px){.article-header{padding-left:15px}}
details.walkthrough{padding:0}details.walkthrough summary{padding:13px 18px;cursor:pointer;color:var(--accent);font-size:12px;font-weight:550;list-style-position:inside}details.walkthrough summary:hover{background:var(--chip)}details.walkthrough[open] summary{border-bottom:1px solid var(--border)}details.walkthrough .explanation-body{padding:14px 18px}details.walkthrough summary:focus-visible{outline-offset:-4px}@media(max-width:600px){details.walkthrough summary{padding:12px 14px}details.walkthrough .explanation-body{padding:12px 14px}}

main{min-width:0}.notebook-article table{display:block;max-width:100%;min-width:0;overflow-x:auto}.table-wrap{overflow:auto;max-width:100%}table{min-width:580px}summary{cursor:pointer}details.glossary,details.source-note{border:1px solid var(--border);border-radius:8px;padding:16px;margin:25px 0}.glossary-term{border-top:1px solid var(--border)}.glossary-tools input{font:inherit;max-width:100%}.glossary-search-row{display:flex;gap:12px}.glossary-search-row input{min-width:0}.glossary-tools button,.flow-tools button{font:inherit;padding:7px 12px}.code-source{font-size:12px}.contents{margin-top:160px}pre{overflow:auto}h3{font-size:17px}figcaption,.caption{font-size:12px}code{overflow-wrap:anywhere;white-space:normal}pre code{white-space:pre}.flow-tools{display:flex;gap:12px;margin:10px 0}.publish-flow{margin:28px 0}.publish-flow h3{margin:0 0 14px}.publish-flow figcaption{line-height:1.6;color:var(--muted,#aab0bc)}.flow-tools button,dialog button{background:#1c1e24;color:#e9eaee;border:1px solid #75608f;border-radius:6px;padding:9px 12px;cursor:pointer}.flow-mobile{display:none}.flow-desktop svg,.flow-mobile svg{display:block;width:100%;height:auto}dialog{color:var(--text);background:var(--bg);border:1px solid var(--border);max-width:min(1150px,95vw);max-height:90vh;width:95vw}dialog::backdrop{background:#000b}.asset-option{margin:38px 0}.review-links{display:flex;gap:18px;flex-wrap:wrap}@media(max-width:600px){input{font-size:16px!important}.flow-desktop{display:none}.flow-mobile{display:block}code{font-size:.88em}}
main{min-width:0}main img{width:100%;height:auto;display:block}.story-flow{margin:28px 0}.story-flow h3{margin:0 0 14px}.story-flow figcaption{font-size:12px;line-height:1.6;color:var(--muted)}.flow-mobile{display:none}.flow-desktop svg,.flow-mobile svg{display:block;width:100%;height:auto}.table-wrap{overflow-x:auto;max-width:100%}.notebook-article table{display:block;min-width:0;max-width:100%;overflow-x:auto}main p{font-size:15px}pre{max-width:100%;overflow-x:auto}code{overflow-wrap:anywhere}pre code{white-space:pre}.asset-option{margin:35px 0}.review-links{display:flex;flex-wrap:wrap;gap:14px}summary{cursor:pointer}dialog{max-width:95vw;width:1000px;background:var(--bg);color:var(--text)}dialog::backdrop{background:#000b}@media(max-width:600px){main p,main li{font-size:14px}.flow-desktop{display:none}.flow-mobile{display:block}.glossary-search-row{display:flex;gap:8px}.glossary-search-row input{min-width:0;font-size:16px}}
.story-flow{background:#141414;border:1px solid #3b3f4a;border-radius:10px;padding:16px}.story-flow h3{color:#e9eaee}.story-flow figcaption{color:#aab0bc}.story-flow svg{border-radius:5px}.flow-tools{display:flex;gap:10px;margin-top:10px}.flow-tools button{background:#1c1e24;color:#e9eaee;border:1px solid #555867;border-radius:5px;padding:6px 10px}.flow-motion{animation:s5e03-dots 1.4s linear infinite;stroke-dasharray:3 7}.flow-paused .flow-motion{animation-play-state:paused}@keyframes s5e03-dots{to{stroke-dashoffset:-20}}@media(prefers-reduced-motion:reduce){.flow-motion{animation:none}}.article-meta{font-size:12px}.review-links{font-size:13px}.notebook-article li{font-size:15px}@media(max-width:600px){.notebook-article li{font-size:14px}}
img{max-width:100%;height:auto!important;object-fit:contain}.notebook-article p,.notebook-article li{font-size:15px;line-height:1.75}.story-flow text{font-family:system-ui,sans-serif}.story-flow{margin:26px 0}.source-label{font-size:12px;color:var(--muted,#888)}@media(max-width:600px){.notebook-article p,.notebook-article li{font-size:14px}}
</style>
<script is:inline src="/images/blog/s5e06/reader.js"></script>
