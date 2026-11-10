---
title: "The Gate Was Measuring the Wrong Question"
description: "A memory-first guard needed to distinguish my questions from text the harness injected. Its own telemetry exposed the mistake."
pubDatetime: 2026-07-06T12:00:00Z
draft: false
shippingDatetime: 2026-11-10T08:00:00Z
imageAlt: "The Rootweaver engineer removes a net from a harbour scale before measuring the catch."
author: Ryan Duffy
episode: 5
image: /images/blog/s5e05/hero-A.png
series: "Season 5: Rootweaver"
tags: [Rootweaver, AgentEngineering, Observability, EngineeringMemory]
---

[Episode 4](https://rduffy.uk/writing/season-5-episode-04-the-parser-was-fixed-the-extractor-was-not/) ended with a deliberate pause. A graph repair could stand on its own without justifying another full backfill. Finding the earlier decision that helped explain that pause raised a different question: why was the platform not consistently consulting the engineering history it already had?

I wanted agents working on Rootweaver to look for relevant decisions before repeating an investigation. A memory tool could be available, indexed and useful in a direct test while an agent still reached first for a text search. Making the tool available had not established that it was being used at the right time.

![The Rootweaver engineer removes an empty fishing net from a harbour scale before measuring the catch.](/images/blog/s5e05/hero-A.png)

<p class="caption">The scale can work perfectly while counting the wrong thing. Conceptual illustration.</p>

This episode covers July 6, 2026, continuing the memory-tool thread recorded alongside the graph work. It is a curated reconstruction from dated handovers, an implementation report and retained hook/report source. I owned direction and review; agents assisted with implementation and checking. Historical live checks remain historical reports. The new examples use synthetic messages, and the isolated checks do not read personal transcripts, emit telemetry or reproduce the original session.

## A reminder needed a measurable contract

The proposed behaviour was narrow: when an engineering question asked about history or an earlier decision, consult memory before a broad search. A guard could notice the first search action, determine whether the current question was historical, and check whether a memory call had already happened. A once-per-turn block could prompt the agent to change its approach.

This was a workflow intervention, not a new retrieval algorithm. It did not establish that memory contained the answer, or that searching source was unnecessary. After retrieving a prior decision, the agent still needed to inspect the relevant source and consider whether circumstances had changed. The practical objective was to stop paying for avoidable rediscovery while preserving verification.

The records also contained a correction to the baseline. A figure quoted during the earlier session had described a narrow session-only share. The carried-forward three-month reconstruction put memory-tool use at roughly 4.8% of information-finding activity. That is a historical usage estimate with its own classification rules, not a quality score or a claim about current behaviour.

The guard recorded three outcomes: `blocked`, when it caught a history question starting with search; `complied`, when memory had been used first; and `bypass`, when search was repeated after a block. Each sounds simple until the unit is specified. A tool event is not a whole user turn, and several events can belong to one question. Counting them interchangeably can produce convincing but misleading percentages.

| Unit | Useful question | What it cannot answer alone |
|---|---|---|
| Tool event | What action did the harness observe? | How many distinct human questions were involved |
| First decision in a turn | Which behaviour defined the comparison arm? | Whether the answer was useful |
| Whole turn | What search work happened around the question? | What would have happened under the alternative workflow |
| Reviewed task result | Did the work meet its acceptance criteria? | Whether the same effect repeats across tasks |

The important next step was to instrument the intervention rather than assume it helped. That instrumentation exposed a more basic problem: the guard was not reliably identifying the question it was supposed to govern.

## The last user-role message was not always mine

The first targeting rule looked for the latest transcript entry marked as a user message. In an interactive agent system, that label can carry more than a person typing. The harness may inject skill instructions, dispatch work to another agent context, or add a metadata caveat using the same broad message role.

Those injected bodies can contain the very words a history detector recognises. A skill might discuss earlier decisions as an example. A dispatch prompt might name an architecture decision record. If the guard treated that content as my current request, an ordinary task could suddenly look like an instruction to reconstruct history.

The July report says five of seven initial blocks belonged to injected or delegated text rather than my questions. That is a tiny and contaminated sample, but it was enough to invalidate an optimistic reading of the first dashboard. A low compliance figure might describe a targeting bug rather than an agent refusing to use memory.

![The engineer turns a microphone away from a loudspeaker in a quiet museum listening booth.](/images/blog/s5e05/inline-1.png)

<p class="caption">Listening to the system's own echo does not establish who asked the question. Conceptual illustration bound to the prompt-identity problem.</p>

The repair used structural fields instead of maintaining a list of skill-title prefixes. The retained hook skips entries marked `isSidechain`, entries with `sourceToolUseID`, and entries marked `isMeta`. In that historical transcript format, these fields identified the machine-injected cases the investigation had found.

<p class="code-source">guard.py · _last_user_prompt_and_offset · claude-config 0b12448</p>

```python
if obj.get("isSidechain") or obj.get("sourceToolUseID") or obj.get("isMeta"):
    continue
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- `obj` is one decoded transcript record, not an independently authenticated person.
- The condition checks three fields that identified injected content in the observed harness format.
- If any field is truthy, `continue` skips this record and the backward scan keeps looking for an earlier prompt.
- Other checks in the full function still require a user-role message with nonempty text. The two lines do not classify the question as historical by themselves.

</details>

The complete function still checks message role, extracts text from a string or text blocks, and returns the position of the chosen entry. That position matters: the later memory-use check looks only after the selected prompt. Selecting the wrong boundary can change both the classification of the question and the evidence considered to have happened within its turn.

This is an implementation contract for that harness format, not a universal identity test. Different clients can encode messages differently. Even within one client, the absence of an injection flag is evidence about the record, not cryptographic proof that a human wrote it. The useful correction is to identify the observed structural distinction and test it, rather than infer authorship from the word `user` alone.

## Follow one harmless request through the guard

Consider two synthetic transcript entries. The first is an ordinary request. The second represents a skill body injected after it. The example uses compact JSON because the inspected hook has a fast substring check that depends on that representation.

```json
{"type":"user","message":{"role":"user","content":"Please inspect the image configuration."}}
{"type":"user","sourceToolUseID":"example-skill-call","isMeta":true,"message":{"role":"user","content":"Example: why did we choose this database?"}}
```

The second line is newer and contains a history-shaped question. A latest-user-entry rule would choose it. The repaired selector sees the injection fields, skips that line, and returns the earlier request. The guard can then evaluate the actual request instead of the skill's example.

Now change the earlier request to “Why did we choose this database?” and leave the injected entry unchanged. The selector should still return the earlier line, but the history condition should now be meaningful. Avoiding a false block must not disable the legitimate memory-first reminder.

<figure id="mechanism" class="story-flow" data-policy-flow><h3>Follow the mechanism</h3><div class="flow-desktop"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 210" role="img" aria-label="Episode 5 simplified mechanism"><defs><pattern id="grid-e5-d" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arr-e5-d" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="#a78bfa"/></marker></defs><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#grid-e5-d)"/><path data-flow-edge class="flow-motion" d="M95 62H190" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e5-d)"/><path data-flow-edge class="flow-motion" d="M240 62H335" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e5-d)"/><path data-flow-edge class="flow-motion" d="M385 62H480" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e5-d)"/><path data-flow-edge class="flow-motion" d="M530 62H625" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e5-d)"/><g transform="translate(70 62)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><rect x="-9" y="-12" width="18" height="24" rx="2"/><path d="M-5-5H5M-5 1H5M-5 7H3"/></g></g><text x="70" y="109" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Input</text><text x="70" y="129" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Supplied transcript</text><g transform="translate(215 62)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><path d="M-14-11H14L4 2V12H-4V2Z"/></g></g><text x="215" y="109" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Select prompt</text><text x="215" y="129" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Skip injection flags</text><g transform="translate(360 62)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><circle cx="-6" cy="-3" r="7"/><path d="M0 2L12 14M8 10L12 6"/></g></g><text x="360" y="109" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Inspect question</text><text x="360" y="129" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Is history relevant?</text><g transform="translate(505 62)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><circle cx="0" cy="-11" r="4"/><circle cx="-12" cy="9" r="4"/><circle cx="12" cy="9" r="4"/><path d="M-2-7L-10 5M2-7L10 5M-8 9H8"/></g></g><text x="505" y="109" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Memory check</text><text x="505" y="129" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Prior call in turn?</text><g transform="translate(650 62)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><path d="M-12 0L-3 9L14-10"/></g></g><text x="650" y="109" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Decision</text><text x="650" y="129" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Then record outcome</text></svg></div><div class="flow-mobile"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 550" role="img" aria-label="Episode 5 simplified mechanism"><defs><pattern id="grid-e5-m" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arr-e5-m" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="#a78bfa"/></marker></defs><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#grid-e5-m)"/><path data-flow-edge class="flow-motion" d="M48 67V119" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e5-m)"/><path data-flow-edge class="flow-motion" d="M48 169V221" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e5-m)"/><path data-flow-edge class="flow-motion" d="M48 271V323" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e5-m)"/><path data-flow-edge class="flow-motion" d="M48 373V425" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e5-m)"/><g transform="translate(48 42)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><rect x="-9" y="-12" width="18" height="24" rx="2"/><path d="M-5-5H5M-5 1H5M-5 7H3"/></g></g><text x="90" y="38" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Input</text><text x="90" y="58" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Supplied transcript</text><g transform="translate(48 144)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><path d="M-14-11H14L4 2V12H-4V2Z"/></g></g><text x="90" y="140" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Select prompt</text><text x="90" y="160" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Skip injection flags</text><g transform="translate(48 246)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><circle cx="-6" cy="-3" r="7"/><path d="M0 2L12 14M8 10L12 6"/></g></g><text x="90" y="242" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Inspect question</text><text x="90" y="262" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Is history relevant?</text><g transform="translate(48 348)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><circle cx="0" cy="-11" r="4"/><circle cx="-12" cy="9" r="4"/><circle cx="12" cy="9" r="4"/><path d="M-2-7L-10 5M2-7L10 5M-8 9H8"/></g></g><text x="90" y="344" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Memory check</text><text x="90" y="364" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Prior call in turn?</text><g transform="translate(48 450)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><path d="M-12 0L-3 9L14-10"/></g></g><text x="90" y="446" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Decision</text><text x="90" y="466" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Then record outcome</text></svg></div><div class="flow-tools"><button type="button" data-flow-motion aria-pressed="false">Pause flow</button><button type="button" data-flow-expand>Expand diagram</button></div><figcaption>Simplified editorial diagram of the inspected mechanism. Moving dots show direction, not observed traffic or a successful run.</figcaption></figure><dialog data-flow-dialog aria-label="Expanded mechanism"><button type="button" data-flow-close>Close expanded diagram</button><div data-flow-expanded-content></div></dialog><script is:inline src="/images/blog/s5e05/flow-ui.js"></script><script is:inline src="/images/blog/s5e05/flow-motion.js"></script>

The diagram separates prompt selection from the later behaviour decision. It does not show a running security boundary or live telemetry. Its central point is that the classification cannot be better than the record selected as its input.

The retained tests reflect both sides. They check that skill bodies, sidechain dispatches and metadata caveats are skipped, while a genuine historical question still reaches the blocking path. The historical handover reports six new tests and 34 passing hook tests overall, plus a before/after live check of the same harmless search. The fresh checks for this draft isolate the selector and use supplied records; they do not repeat the original harness run.

A small test-fixture detail mattered. Python's normal JSON encoder inserts spaces after separators. The hook's quick check searched for the compact token `"type":"user"`. A fixture written as `"type": "user"` could be skipped before the meaningful branch was exercised. A test that only expected “no prompt selected” might then pass for the wrong reason. Matching the actual wire shape was part of testing the mechanism, not cosmetic formatting.

## The metric was late, not necessarily broken

Prompt targeting was not the only misleading signal. The telemetry-hardening report began by investigating why VictoriaLogs contained decisions while VictoriaMetrics appeared to have no corresponding counter. Its reconstruction says the metrics-push code had only been added shortly before the query. The query and code-change window overlapped before the first real sample.

That distinction changes the investigation. An event recorded before a sink existed cannot acquire a historical twin simply because a dashboard later expects one. The report identifies five early log events without metrics counterparts and says later correspondence was checked separately. I have not recovered the complete raw sink bundle here, so those timings and counts remain reported observations.

![The engineer compares two clock mechanisms inside a stone clock tower.](/images/blog/s5e05/inline-2.png)

<p class="caption">Two streams need a common observation window before their counts can be compared. Conceptual artwork; the clocks are not measurements of the historical run.</p>

The hook deliberately swallowed telemetry exceptions so a monitoring failure would not stop ordinary tool use. That protected one failure boundary but reduced observability at another. Silence could mean no event, a failed push, or a sink that had not started receiving data. The historical diagnosis used a controlled push with captured HTTP status and a query-back check to separate those cases.

The alerting plan also changed after checking the installed stack. The earlier suggestion named `vmalert`; the retained report says that component was absent. The implemented path used Prometheus rules and existing hook metrics through a node-exporter textfile collector. That is a dated topology finding. It does not authorise installing or repairing anything in today's cluster.

The informational compliance rule used a seven-day ratio below 25%, with a floor of at least ten decisions. The volume floor avoided treating one or two events as a stable pattern. It did not repair misclassified inputs. A perfectly evaluated rule over polluted events would still produce the wrong operational interpretation.

## Fair windows before a cost comparison

The reporting change measured search activity over the whole user turn rather than starting at the guard's decision timestamp. That choice was necessary because a compliant memory call could happen before the decision was logged. Starting the accounting clock at the decision would omit part of the memory-first arm and make it look artificially cheap.

<p class="code-source">retrieval-report.py · _episode_cost · claude-config 0b12448</p>

```python
start = max((t for t in stamps if t <= dec_ts), default=None)
if start is None:
    return None
end = min((t for t in stamps if t > dec_ts), default=start + EPISODE_CAP_S)
end = min(end, start + EPISODE_CAP_S)
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- The first expression finds the latest collected prompt timestamp at or before the guard decision.
- If no start exists, the function reports no usable cost measurement. It does not invent a zero.
- The next expression chooses the next prompt timestamp, or a capped end if none follows.
- The final line ensures that the window never extends beyond the 900-second cap from its start.
- The source collects these timestamps with its own transcript filter. That limitation is separate from the repaired guard selector.

</details>

The inspected report caps the turn window at 900 seconds. It counts search calls and approximates result context using raw result-line lengths. That is useful instrumentation, but it is not a tokenizer, billing meter or causal experiment. JSON wrappers and encoding can affect line length, and a byte estimate does not establish how much useful information reached the final answer.

There is another limitation in the historical source. The report's turn-boundary pass uses its own fast checks for user-shaped entries; it is not simply the repaired prompt selector reused everywhere. Fixing the guard therefore does not independently prove that every downstream cost window was immune to injected records. That would need its own targeted test and review. The chapter keeps that boundary visible rather than promoting the whole telemetry chain because one helper improved.

The day-one report gave roughly 134 KB and six search calls per grep-first turn, with no complied turns available for comparison. Those figures were also flagged as polluted by the targeting bug. There is no defensible percentage saving to compute from a treatment arm with no observations. Nor does a later increase in memory use, by itself, establish better engineering outcomes.

## What I would carry forward

I would define the unit before choosing a metric. “The agent used memory” can refer to an event, a turn or a completed task. Each is useful for a different question. A dashboard should not quietly move between them.

I would test the origin of the input as carefully as the final decision. The same text can be an instruction, a quoted example or an injected skill body. Matching words without inspecting their structural role can produce precise enforcement of the wrong request.

I would give comparisons symmetric boundaries. If one approach spends effort before the event that labels it, that work still belongs in the accounting window. Raw tool-result size can help locate waste, but cannot stand in for tokens, cost or quality without further measurement.

I would also keep the follow-up question open. The historical record booked later clean-data and task-quality reviews. It did not establish a sustained improvement that evening. The repair made subsequent measurement more credible; it was not the measurement's final answer.

## Next in the sequence

The next July thread asks a related question about the instructions themselves. A reusable skill can be internally consistent and still contain dated advice, or be well sourced without improving a real task. The July 7 records follow a small skills pilot through those separate checks. That is the next episode's scope, not a promise that a universal productivity effect was proved.

<details class="glossary" data-glossary=""><summary>Glossary — plain-English definitions</summary><div class="glossary-tools" hidden=""><label for="glossary-search">Find a term</label><div class="glossary-search-row"><input id="glossary-search" type="search"/><button type="button">Clear</button></div><p aria-live="polite" role="status"></p></div><section class="glossary-term" id="term-user-role"><h3>User role</h3><p>A message category; it does not alone prove a human typed the content. Episode evidence and limits (retained historical evidence).</p></section><section class="glossary-term" id="term-injection-metadata"><h3>Injection metadata</h3><p>Structural fields indicating harness-supplied content in the historical format. Episode evidence and limits (retained historical evidence).</p></section><section class="glossary-term" id="term-first-touch-decision"><h3>First-touch decision</h3><p>One initial behaviour label for a turn rather than every tool event. Episode evidence and limits (retained historical evidence).</p></section><section class="glossary-term" id="term-observation-window"><h3>Observation window</h3><p>The interval over which related events are compared. Episode evidence and limits (retained historical evidence).</p></section><section class="glossary-term" id="term-counter"><h3>Counter</h3><p>A cumulative measurement whose start and reset behaviour matter. Episode evidence and limits (retained historical evidence).</p></section><section class="glossary-term" id="term-conversion"><h3>Conversion</h3><p>Here, a later memory call after a block within the stated window. Episode evidence and limits (retained historical evidence).</p></section><section class="glossary-term" id="term-causal-effect"><h3>Causal effect</h3><p>A difference attributable to the intervention; an observational count alone does not establish it. Episode evidence and limits (retained historical evidence).</p></section></details>

## Sources and limits

The source and claim ledger (retained in review ledger) retains the original handovers and telemetry report unchanged, together with the historical hook, tests and reporting script. Private prompt ledgers and native conversation bodies are excluded. Historical sink correspondence, live gate behaviour and the original usage baseline have not been independently replayed. This selection covers the memory-first intervention, not every activity on July 6.


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
<script is:inline src="/images/blog/s5e05/reader.js"></script>
