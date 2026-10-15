---
title: The Dreaming Loop
description: A YouTube video sparked an idea for Claude memory maintenance, followed by the work of making it useful and checking what it proved.
author: Ryan Duffy
episode: 11
series: 'Season 4: Building in Public — The Agent Era'
draft: false
pubDatetime: 2026-07-01T12:11:00Z
shippingDatetime: 2026-10-16T06:45:00Z
featured: true
reading_time: 17 minutes
tags: [rootweaver, memory, agents, building-in-public, season-4]
---

I was using Claude Code at the time, with its `MEMORY.md` file carrying context between sessions. I remember watching an Anthropic video about a “dreaming loop”; the one I believe prompted this work is [Memory and dreaming for self learning agents](https://www.youtube.com/watch?v=IGo225tfF2I), on Claude’s YouTube channel. It gave me an idea to try in Rootweaver: could the system do something useful with the memories it had accumulated, rather than just keep adding to the file?

![An engineer checks paper index strips in a vast night archive, with the full records still on the shelves.](/posts/s4e11/final/hero.png)

<p class="caption">The index is only the entrance to the archive. Conceptual illustration.</p>

The talk describes a separate process that reviews sessions and refines memories outside the active agent loop. Its [dreaming section starts at 10:57](https://www.youtube.com/watch?v=IGo225tfF2I&t=657s). It is about Claude Managed Agents. I was adapting the idea to the local AUTO-memory setup I was using, with its own files, maintenance scripts and review step.

There was earlier research behind this. A comparison note dated 7 June already examined Anthropic’s memory and dreaming ideas alongside Rootweaver’s memory systems. Some of that analysis concerned the typed facts store, a different surface from the Claude Code files. This episode follows the local AUTO-memory implementation on 13–14 June, with that earlier research as context.

The previous episode followed outside material coming into Rootweaver. This was another example of that process: something I watched gave me an idea to try in the system. The work became a practical memory-maintenance routine over the same weekend. I was directing and reviewing agent-assisted implementation, working out which parts could run automatically and which changes still needed review.

By the weekend of 13–14 June, I had a memory problem that was easy to miss. The notes were still there. The index that helped the agent find them had grown beyond the limit the maintenance tooling expected, and the handover recorded that its tail was being truncated when loaded. I could keep adding useful context and still make less of it available to the next session.

The starting point above is my recollection of what prompted the work. The implementation that follows is reconstructed from the June handover, retained evidence ledger and the code committed that weekend. The measurements below are historical reports, with their limits preserved. They do not describe the current installed memory system.

## The file existed. The whole index did not fit.

Rootweaver had several things called memory. The loop here targeted Claude Code's AUTO-memory: a `MEMORY.md` index pointing to topic files in its project memory directory. It was separate from the typed facts in Postgres and their enrichment or consolidation paths. Sharing a name did not make those systems interchangeable.

The period handover recorded an index of 25,953 bytes against a 24,400-byte limit used by this tooling. That put it 1,553 bytes over. I am keeping those as the historical figures; they are not a statement of a universal limit across current agent versions. The failure was especially awkward because the files remained available on disk. Nothing about a successful file write guaranteed that the next session received the full index.

The maintenance effort began under **VW-723 — Memory consolidation routine (`"dreaming"`) — scheduled curation of auto-memory index + files**. The objective was to recover useful context under a fixed loading budget. Shorter pointers could help. Throwing away the detail behind them would be a different change, with a different risk.

That distinction shaped the approach. The retained June ledger records an earlier candidate and a recall delta of +0.037, described as within noise. It also records the subsequent live index-size fix separately. The raw recall result is not retained in this review package, so I can report the historical assessment without treating it as a freshly verified improvement.

The engineering objective was to keep enough description for the agent to choose the right topic, preserve the topic files, and check retrieval after editing. Optimising only the byte count can produce a beautifully small index that no longer helps anyone find anything.

## Freeze the before-state before trying to improve it

On 13 June, the first job was to preserve something we could compare against. **VW-787 — Dreaming loop Phase 0 — baseline measurement harness (auto-memory) [VW-723]** recorded an immutable snapshot of the existing topic files and index, with per-file hashes. It also froze a 40-prompt golden replay set: the same questions could be asked against the original memory and a proposed replacement.

That made the maintenance question testable. Once the live index changed, an unrecorded “before” would be gone. A snapshot kept the original available; fixed prompts gave the comparison a stable set of tasks. The baseline report planned repeated, order-swapped judging rather than treating a single model score as precise. It also acknowledged that the prompts skewed towards recent sessions, which limited how broadly the result could be interpreted.

| June 13 baseline item | Historical report | Why it mattered |
| --- | --- | --- |
| Frozen memory snapshot | 151 topic files plus the index; per-file hashes | Preserve the starting material |
| Golden replay set | 40 prompts | Compare revisions on the same questions |
| Near-duplicate pairs | 0 at the configured 0.45 Jaccard threshold | Duplication was not the main repair lever |
| Files referencing moved or deleted paths | 37 of 150 scanned files | Some pointers needed hygiene, not just shorter wording |

The size measurement at this snapshot was 25,921 bytes. The later pre-apply figure was 25,953 bytes. Those are separate captures, not an unexplained before-and-after result. Both exceeded the recorded 24,400-byte limit.

The hygiene findings changed what a useful repair looked like. Deduplicating entries would not solve an index with no detected duplicate pairs at that threshold. Shortening a broken path would not repair its destination. The work needed to preserve useful pointers, make them fit and flag stale references, then use replay to check what the proposed changes did to recall.

## Fix the index, then explain what the fix proves

The early-Sunday handover records the live index moving from 25,953 to 22,664 bytes. Seventy-six pointer lines were shortened, with zero memories dropped and zero content drift reported by that session. Those last two statements are the historical report's assessment; this draft has not independently replayed its entire comparison.

![Gloved hands shorten an index strip while the bound source records remain untouched beside the drawer.](/posts/s4e11/final/pointers.png)

<p class="caption">Shorten the route to a record while keeping the record. A separate close-up composition for the consolidation beat.</p>

| Historical measure | Recorded value | What it establishes |
| --- | ---: | --- |
| Index before the live fix | 25,953 B | Over the tooling's recorded limit |
| Tooling limit | 24,400 B | The size constraint used for this work |
| Index after the live fix | 22,664 B | Below that constraint |
| Bytes removed | 3,289 B | Derived from the two recorded sizes |
| Remaining headroom | 1,736 B | Derived from the recorded limit and final size |
| Pointer lines shortened | 76 | Scope reported in the handover |
| Memories dropped | 0, reported | Preservation claim from the historical session |

The ledger also retains an earlier candidate at 23,718 bytes, with 682 bytes of headroom. That is a separate revision. Mixing its recall result, the later 22,664-byte index and an assumed improvement in task efficiency would manufacture a single successful experiment out of different observations.

Getting under the limit fixed a concrete maintenance problem. It did not prove that future sessions would use fewer tokens, make fewer tool calls or need fewer corrections. Those needed their own before-and-after measurement. The handover explicitly left that work open.

I find that separation useful. There was a result worth keeping: the reported live index fitted again. There was also a much larger question still waiting for data: did the maintenance make subsequent work better?

## Recovering what earlier sessions had missed

There was another part to the loop: **VW-793 — Dreaming loop Phase 2 — enrich auto-memory from JSONL archive (Claude/batched) [VW-723]**. Compression worked on the index already present. Enrichment asked whether older sessions contained durable information that had never reached the topic files.

The historical `scripts/dream_consolidate/mine_archive.py` describes four stages. First, it formed bounded digests from typed user prompts and assistant prose, leaving tool-call and tool-result envelopes out of that digest. A small-model filter then shortlisted potentially useful material. A deterministic pooling pass collapsed near-duplicates and weighted candidates by recency and cross-session frequency. A separate batched review compared the shortlist with existing memory, rejected stale or superseded facts and prepared proposals. The script itself did not write those proposals into live memory.

The stale-fact check mattered because an archive is a record of what was said at the time. An old path, configuration choice or operating rule could have been correct then and wrong by the time it was reconsidered. Recovering more information was only useful if the review distinguished a durable lesson from an obsolete instruction.

The code also kept the evaluation window out of the enrichment input. It excluded 2–13 June, the dates used to form the golden replay set. Otherwise a later recall score could look better because the enrichment had harvested material from the very sessions supplying the test questions. Keeping those inputs apart made the intended comparison more meaningful; it did not by itself prove that the recovered facts improved later work.

That added a second question to memory maintenance. Had the existing index become too large, and had useful context been missed in the first place? The retained code establishes the proposed enrichment mechanism. I am not treating it as proof that every archived session was processed or that every recovered candidate was worth keeping.

## A use count has to measure something selective

By early Sunday, the routine had acquired three more pieces under **VW-806 — Dreaming loop Phase 3 — reinforce-on-recall + launchd schedule + advisory gate [VW-723]**. The handover records four merged changes, including the earlier tooling, at commits `d663e633`, `77510150`, `f22fc756` and `4e6297be`. The excerpts here are read from the last of those commits, rather than inferred from today's working tree.

The first piece was reinforcement. Counting a memory every time the index loaded would tell me very little: every entry in the loaded index would receive credit whether it helped the task or not. The implementation instead looked for selective citation of a topic slug in the agent's session output.

It also recomputed counts from the available corpus. That is more precise than describing the routine as incrementing counters. Re-running the same corpus should not keep adding credit for the same sessions. The count meant sessions in the current corpus that cited the slug, rather than an endlessly accumulating number of maintenance runs.

<div class="code-box"><div class="code-source">Exact historical excerpt · scripts/dream_consolidate/reinforce.py · commit 4e6297be · lines 53–60</div><pre><code class="language-python">    for path in iter_session_files(source):
        n_sessions += 1
        cited, date = session_cited_slugs(path, slug_re)
        for slug in cited:
            use_count[slug] += 1
            if date and (slug not in last_used or date &gt; last_used[slug]):
                last_used[slug] = date
    return use_count, last_used, n_sessions</code></pre></div>
<details class="walkthrough"><summary>Explain this code line by line</summary><div class="explanation-body"><ol><li>The loop visits each session file returned for the selected corpus.</li><li>The session total increases for each visited file.</li><li>The parser returns the set of cited slugs and a session date.</li><li>Each cited slug contributes one count for this session.</li><li>The counter for that slug increases by one.</li><li>A date replaces the saved date only when it is present and newer, or no prior date exists.</li><li>The latest date is stored for that slug.</li><li>The function returns counts, latest dates and the number of visited files.</li></ol></div></details>

The returned citation set matters. A session that mentions a slug repeatedly still contributes one session of use. `last_used` takes the latest matching date. The resulting metadata can help identify which proposed pointer edits deserve attention, but it only describes what this parser can see.

That limitation surfaced immediately. The handover gives the example of a critical rule that received a use count of one because the agent could follow its meaning without mentioning the filename. Slug matching was evidence of explicit reference. It was an incomplete measurement of practical importance.

Low counts therefore could not safely justify demotion. A quiet memory might be irrelevant, or it might be a foundational rule that rarely needed naming. Those cases look similar to a string matcher and have very different consequences if removed.

## The advisory gate drew attention to the risky edits

The advisory gate used the positive evidence. If a proposed shortening affected a frequently cited memory, it appeared in a review list. The implementation removed the `.md` suffix to align the proposal's filename with the counter's key, compared the count with a threshold, and sorted the flagged items by use.

<div class="code-box"><div class="code-source">Exact historical excerpt · scripts/dream_consolidate/consolidate.py · commit 4e6297be · lines 122–129</div><pre><code class="language-python">    flagged = []
    for p in proposals:
        stem = p[&quot;slug&quot;][:-3] if p[&quot;slug&quot;].endswith(&quot;.md&quot;) else p[&quot;slug&quot;]
        uc = use_counts.get(stem, 0)
        if uc &gt;= threshold:
            flagged.append({**p, &quot;use_count&quot;: uc})
    flagged.sort(key=lambda p: -p[&quot;use_count&quot;])
    return flagged</code></pre></div>
<details class="walkthrough"><summary>Explain this code line by line</summary><div class="explanation-body"><ol><li>Start an empty list of proposals that deserve extra attention.</li><li>Visit every proposed pointer edit.</li><li>Remove the filename suffix when present so the lookup matches the counter keys.</li><li>Read its count, treating a missing count as zero.</li><li>Compare the count with the configured threshold.</li><li>Copy the proposal into the flagged list with its use count attached.</li><li>Sort higher counts first so frequently cited memories are prominent.</li><li>Return the review list; this function does not apply or veto any edits.</li></ol></div></details>

This function does not reject a proposal. It returns annotations for the report. It does not infer that everything below the threshold is safe to compress or delete. The code and its comments support that narrower description; calling it an automatic safety barrier would give it too much credit.

That was enough to make review more useful. A human could see where a small-looking pointer edit affected something cited often, while retaining responsibility for the meaning of the change. The automation gathered evidence and prepared the work. Approval remained a separate step.

## Making it run outside the terminal

The next piece was a weekly Mac schedule. The handover records a Sunday launchd job, but getting the command to work interactively was only part of the job. The wrapper had to find a usable interpreter in the environment that would exist later, without an interactive shell session.

The recorded failure was mundane: the obvious environment interpreter resolved to a system Python path that errored in the non-interactive setup. The repair was more precise than simply hardcoding a new path. The historical wrapper tried candidates in order and accepted the first one that actually ran a small Python command.

<div class="code-box"><div class="code-source">Exact historical excerpt · scripts/dream_consolidate/run_weekly.sh · commit 4e6297be · lines 37–45</div><pre><code class="language-bash">PY=&quot;&quot;
for _cand in /opt/homebrew/bin/python3 &quot;$REPO/python-enhancement-env/bin/python&quot; python3; do
    if &quot;$_cand&quot; -c &#x27;import sys&#x27; &gt;/dev/null 2&gt;&amp;1; then PY=&quot;$_cand&quot;; break; fi
done
if [ -z &quot;$PY&quot; ]; then
    log &quot;FATAL: no working python3 found — aborting&quot;
    exit 1
fi
log &quot;interpreter: $PY&quot;</code></pre></div>
<details class="walkthrough"><summary>Explain this code line by line</summary><div class="explanation-body"><ol><li>Start with no selected interpreter.</li><li>Try the explicit candidates in order.</li><li>Run a small import with each candidate; select the first successful one and stop searching.</li><li>End the candidate loop.</li><li>Check whether no candidate was selected.</li><li>Record a fatal diagnostic when none worked.</li><li>Exit with failure in that case.</li><li>End the failure check.</li><li>Log the interpreter that will run the remaining steps.</li></ol></div></details>

The first candidate was Homebrew Python, followed by an environment interpreter and then `python3` on the path. If none worked, the wrapper logged a fatal error and stopped. The maintenance scripts did not require activating the platform's full package environment, which kept this check small.

This is the sort of failure I want a scheduling test to catch before I rely on next week's run. A file can exist and be executable without being the interpreter this job needs. The probe tested the relevant behaviour: could this candidate start Python and import its standard system module?

## Five passes, with different consequences

The weekly wrapper ran a budget check, reinforcement, hygiene, proposal generation and notification. Reinforcement wrote citation metadata. Hygiene checked matters such as broken paths and index size. Consolidation wrote a proposal file. Applying that proposal was a separate manual action.

<figure class="diagram"><button type="button" data-flow-motion aria-pressed="false">Pause flow</button><div class="flow-desktop"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 180" role="img" aria-label="Budget check, reinforce citation metadata, hygiene checks, propose changes, then notify for human review"><defs><pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arrow" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0 0L6 3L0 6" fill="none" stroke="#a78bfa"/></marker></defs><style>text{font-family:system-ui,sans-serif;fill:#e9eaee}.sub{fill:#aab0bc;font-size:12px}.motion{stroke-dasharray:3 7;animation:travel 1.4s linear infinite}@keyframes travel{to{stroke-dashoffset:-20}}@media(prefers-reduced-motion:reduce){.motion{animation:none}}</style><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#grid)"/><path d="M129 57h140" stroke="#a78bfa" fill="none" stroke-width="2" marker-end="url(#arrow)" class="motion" data-flow-edge="true"/><circle cx="100" cy="57" r="27" fill="#1c1e24"/><path d="M-10 -2h20M-7 -8h14M-6 5h12M-2 -12v24" transform="translate(100 57)" stroke="#e9eaee" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/><text x="100" y="105" text-anchor="middle" font-size="15">Budget</text><text x="100" y="125" text-anchor="middle" class="sub">Review capacity</text><path d="M329 57h140" stroke="#a78bfa" fill="none" stroke-width="2" marker-end="url(#arrow)" class="motion" data-flow-edge="true"/><circle cx="300" cy="57" r="27" fill="#1c1e24"/><path d="M-10 8v-4h5v-6h5v-6h5v-4h5v20z" transform="translate(300 57)" stroke="#e9eaee" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/><text x="300" y="105" text-anchor="middle" font-size="15">Reinforce</text><text x="300" y="125" text-anchor="middle" class="sub">Citation metadata</text><path d="M529 57h140" stroke="#a78bfa" fill="none" stroke-width="2" marker-end="url(#arrow)" class="motion" data-flow-edge="true"/><circle cx="500" cy="57" r="27" fill="#1c1e24"/><path d="M-10 -10h14v20h-14zM-5 -4l3 3 6-6M-5 6h8" transform="translate(500 57)" stroke="#e9eaee" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/><text x="500" y="105" text-anchor="middle" font-size="15">Hygiene</text><text x="500" y="125" text-anchor="middle" class="sub">Paths and size</text><path d="M729 57h140" stroke="#a78bfa" fill="none" stroke-width="2" marker-end="url(#arrow)" class="motion" data-flow-edge="true"/><circle cx="700" cy="57" r="27" fill="#1c1e24"/><path d="M-8 -11h11l5 5v17h-16zM3 -11v6h5M-4 0h8M-4 5h8" transform="translate(700 57)" stroke="#e9eaee" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/><text x="700" y="105" text-anchor="middle" font-size="15">Propose</text><text x="700" y="125" text-anchor="middle" class="sub">No index apply</text><circle cx="900" cy="57" r="27" fill="#1c1e24"/><path d="M-9 6h18l-3-5v-5a6 6 0 0 0-12 0v5zM-2 10h4" transform="translate(900 57)" stroke="#e9eaee" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/><text x="900" y="105" text-anchor="middle" font-size="15">Notify</text><text x="900" y="125" text-anchor="middle" class="sub">Ready for review</text></svg></div><div class="flow-mobile"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 700" role="img" aria-label="Budget check, reinforce citation metadata, hygiene checks, propose changes, then notify for human review"><defs><pattern id="grid-mobile" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arrow-mobile" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0 0L6 3L0 6" fill="none" stroke="#a78bfa"/></marker></defs><style>text{font-family:system-ui,sans-serif;fill:#e9eaee}.sub{fill:#aab0bc;font-size:12px}.motion{stroke-dasharray:3 7;animation:travel 1.4s linear infinite}@keyframes travel{to{stroke-dashoffset:-20}}@media(prefers-reduced-motion:reduce){.motion{animation:none}}</style><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#grid-mobile)"/><path d="M170 125v48" stroke="#a78bfa" fill="none" stroke-width="2" marker-end="url(#arrow-mobile)" class="motion" data-flow-edge="true"/><circle cx="170" cy="50" r="27" fill="#1c1e24"/><path d="M-10 -2h20M-7 -8h14M-6 5h12M-2 -12v24" transform="translate(170 50)" stroke="#e9eaee" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/><text x="170" y="98" text-anchor="middle" font-size="15">Budget</text><text x="170" y="118" text-anchor="middle" class="sub">Review capacity</text><path d="M170 262v48" stroke="#a78bfa" fill="none" stroke-width="2" marker-end="url(#arrow-mobile)" class="motion" data-flow-edge="true"/><circle cx="170" cy="187" r="27" fill="#1c1e24"/><path d="M-10 8v-4h5v-6h5v-6h5v-4h5v20z" transform="translate(170 187)" stroke="#e9eaee" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/><text x="170" y="235" text-anchor="middle" font-size="15">Reinforce</text><text x="170" y="255" text-anchor="middle" class="sub">Citation metadata</text><path d="M170 399v48" stroke="#a78bfa" fill="none" stroke-width="2" marker-end="url(#arrow-mobile)" class="motion" data-flow-edge="true"/><circle cx="170" cy="324" r="27" fill="#1c1e24"/><path d="M-10 -10h14v20h-14zM-5 -4l3 3 6-6M-5 6h8" transform="translate(170 324)" stroke="#e9eaee" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/><text x="170" y="372" text-anchor="middle" font-size="15">Hygiene</text><text x="170" y="392" text-anchor="middle" class="sub">Paths and size</text><path d="M170 536v48" stroke="#a78bfa" fill="none" stroke-width="2" marker-end="url(#arrow-mobile)" class="motion" data-flow-edge="true"/><circle cx="170" cy="461" r="27" fill="#1c1e24"/><path d="M-8 -11h11l5 5v17h-16zM3 -11v6h5M-4 0h8M-4 5h8" transform="translate(170 461)" stroke="#e9eaee" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/><text x="170" y="509" text-anchor="middle" font-size="15">Propose</text><text x="170" y="529" text-anchor="middle" class="sub">No index apply</text><circle cx="170" cy="598" r="27" fill="#1c1e24"/><path d="M-9 6h18l-3-5v-5a6 6 0 0 0-12 0v5zM-2 10h4" transform="translate(170 598)" stroke="#e9eaee" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/><text x="170" y="646" text-anchor="middle" font-size="15">Notify</text><text x="170" y="666" text-anchor="middle" class="sub">Ready for review</text></svg></div></figure>

<p class="caption">Direction shows the historical wrapper's intended sequence, not live activity. The separate apply step requires review; the advisory gate adds warnings to the proposal.</p>

Two details in the code stop this from becoming an overly neat success story.

First, the budget check guarded the cost of generating review work when the weekly allowance was nearly exhausted. The wrapper's comments explicitly distinguish that from its own computation: reinforcement and hygiene were Python work, while the consolidation pass could use a separate OpenAI call. This was not one meter accounting for every resource used by the job.

Second, missing or unreadable budget state became zero in the historical wrapper. That let processing continue. A missing measurement therefore did not mean the budget had actually been verified. This is a limit visible in the retained source, not a claim that it caused a particular incident that weekend.

The wrapper also continued after reinforcement or hygiene failed, and logged the failure. Even proposal-generation failure led to a final end-of-run message. The sequence provided useful logs and outputs, but successful process completion alone could not establish that every pass succeeded. A useful operational check had to inspect those pass results and the proposal itself.

![An engineer reviews a delivered proposal folder in a quiet archive room before changing the records.](/posts/s4e11/final/review.png)

<p class="caption">A prepared proposal still needs someone to read it. Conceptual illustration of the review step.</p>

These are small distinctions, but they change what I can honestly say shipped. The historical handover describes the routine as operational and records the index repair. The inspected wrapper supports the sequence and manual apply separation. Neither establishes indefinite weekly reliability, complete citation tracking or improved task efficiency.

## A later baseline was still a starting point

The June 14 handover captured a later before-baseline over twenty trailing sessions. This was a separate capture from the June 13 snapshot and replay setup; the two changing session samples are not an improvement measurement. It recorded 984,406 fresh input tokens, 156.4 tool calls and 6.5 redundant retrieval calls in its session aggregates; a 14.5% redundant retrieval rate; a correction rate of 0.191; and memory utilisation of 0.314, or 50 of 159 slugs cited.

Those are the source's historical measures. Without the retained raw baseline and an independently checked matched after-sample in this package, they cannot substantiate a savings percentage. The handover explicitly said the efficiency claim was instrumented and waiting for later data. That is the useful part to preserve.

It also recorded a trap in the measurement pipeline: the log sink appended rows without deduplicating them. There were 463 rows for 307 sessions. Counting rows as sessions would distort the comparison. A later analysis needed session identity for deduplication or the saved JSON snapshot aggregates, and it needed the correct time window because the rows carried session timestamps.

A weekly job can look healthy because it runs on schedule and writes something. This baseline was an attempt to ask a better question: after changing the index, did comparable work need less repeated searching or fewer corrections? The episode-period evidence leaves that answer open.

## What I would keep from this approach

I would keep the separation between the index and the underlying notes. It gave the maintenance job a narrow repair to propose and gave review a concrete preservation question to answer. I would also keep the replay step, while being stricter about recording which revision each result belonged to. A candidate's recall result and a later live index size should remain individually attributable.

I would improve the use signal before using it for anything more consequential. Explicit citation is useful positive evidence. It misses rules followed implicitly and concepts recalled without filenames. That uncertainty belongs in the decision, particularly when a proposed action would remove context.

I would make pass-level outcomes part of the routine's visible result. The historical wrapper's continuation behaviour was understandable for maintenance, but it put more responsibility on log inspection. A schedule, a final message and a proposal path each establish different things. They should not collapse into one green status.

The remaining problem was truth over time. Shortening a pointer cannot decide whether a belief is stale or contradicted by newer evidence. It can make an obsolete claim easier to load. Conflict detection and supersession need their own evidence and handling; this maintenance loop did not supply them.

By early Sunday, the recorded result was a working maintenance sequence, a smaller live index and a measurement baseline. That was useful progress. The stronger claim—that Rootweaver could improve its memory autonomously and measurably—still needed more than a successful tidy-up.

The next episode moves from memory maintenance to a different kind of restructure: how the platform's services were organised in Kubernetes. The same question follows it there: after changing the structure, what evidence shows the system still does what I need?

<details data-glossary id="glossary"><summary>Glossary · six terms and references</summary><div class="glossary-tools" hidden><label for="glossary-search">Find a term</label> <input id="glossary-search" type="search"/><button type="button" data-glossary-clear>Clear</button><p class="glossary-status" role="status"></p></div><section class="glossary-term"><h3>AUTO-memory</h3><p>A project memory index and topic notes maintained for the coding agent. This episode concerns the historical Claude Code implementation, separate from Rootweaver’s typed facts. <a href="https://code.claude.com/docs/en/memory">Reference</a></p></section><section class="glossary-term"><h3>launchd</h3><p>The macOS service manager used here to invoke a scheduled user job. <a href="https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html">Reference</a></p></section><section class="glossary-term"><h3>JSONL</h3><p>A sequence of JSON values separated by newlines. The historical scripts treated session files as their measurement input. <a href="https://jsonlines.org/">Reference</a></p></section><section class="glossary-term"><h3>Idempotence</h3><p>Repeating an operation with the same inputs has the same intended effect. Here, recomputing citation counts avoids repeatedly adding credit for the same corpus. <a href="https://www.rfc-editor.org/rfc/rfc9110.html#name-idempotent-methods">Reference</a></p></section><section class="glossary-term"><h3>False negative</h3><p>A useful thing missed by a detection rule. A rule can be followed without its memory filename appearing in the session output. <a href="https://developers.google.com/machine-learning/crash-course/classification/accuracy-precision-recall">Reference</a></p></section><section class="glossary-term"><h3>Replay</h3><p>Testing retained inputs again to compare behaviour after a change. A recall replay and an index-size measurement are different checks. <a href="https://docs.python.org/3/library/unittest.html">Reference</a></p></section></details>

<style>main table{display:block;max-width:100%;min-width:0;overflow-x:auto}.flow-mobile{display:none}.diagram{background:#141414;padding:14px;border-radius:10px}.diagram svg{width:100%;height:auto}.flow-paused .motion{animation-play-state:paused!important}.diagram button{color:#e9eaee;background:#1c1e24;border:1px solid #a78bfa;padding:6px 10px;margin-bottom:12px}.walkthrough{margin-bottom:24px}.code-source{font-size:12px;overflow-wrap:anywhere}.code-box pre{overflow-x:auto}.table-wrap{overflow-x:auto}@media(max-width:600px){.flow-mobile{display:block}.flow-desktop{display:none}}</style>
<script src="/posts/s4e11/final/flow-motion.js"></script>
<script src="/posts/s4e11/final/glossary.js"></script>
