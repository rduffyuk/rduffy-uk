---
title: "The Work Was Done. The Last Step Was Missing."
description: "A two-week audit followed orphaned work through Git, the tracker and live observations. The recovery found several ways a change can outlive the session that made it."
pubDatetime: 2026-07-16T00:00:00Z
shippingDatetime: 2026-11-24T00:00:00Z
draft: false
author: Ryan Duffy
episode: 16
series: "Season 5: Rootweaver"
image: /images/blog/s5e16/hero.png
tags: [rootweaver, git, reliability]
---

I had just been separating the reasons a nightly ingestion job kept ending in failure. The work around the pipeline had its own version of the problem. A task could say In Progress after its fix was running. A change could be on my local main branch and still be missing from the remote. A handover could say an implementation was ready and leave the next session to discover what “ready” meant.

The question I needed answered was whether the work itself had stopped or whether the step that made it usable by the next person had been lost. That distinction changes the job. One case needs implementation. Another needs a push, a review, a tracker update or a decision from me. Guessing from the status field can send an agent back through work I already paid for, or lead it to close a task with a real gap still open.

![The engineer checks an open latch at a coastal weather station](/images/blog/s5e16/hero.png)

<p class="caption">The installation looks complete from a distance. One latch still needs attention. Conceptual illustration.</p>

## Look for the step that went missing

On 16 July I used an agent-assisted audit to look back across roughly two weeks, tracked as VW-1319 — Two Week Dropped Work Audit + Platform Health Verdict. It had three routes through the evidence. One compared tracker records with Git. One checked the platform itself. The third went through session and handover records, where work could be mentioned without a matching issue or branch. I wanted those views to check one another. The tracker represented intent and administrative state. A commit represented a version of the files. A running service could answer a specific runtime question. The handover was often the only place that explained which question the next session was meant to answer.

The walk through session history hit the very limit we were investigating. The audit records two attempts on that route being cut off, followed by a narrower pass over eight recent handovers. That produced concrete follow-ups from the text it covered. The proposed scan of first messages in session logs never ran, and roughly forty older handovers remained outside the narrow pass. The first lesson came before the findings. A wide investigation that cannot finish or leave a usable intermediate result can add its own lost work.

The retained report counted seven investigated drops. In all seven it identified a missing final action, such as a push, a merge, a tracker transition or an architecture decision write-up. That count describes the cases the audit called drops. It cannot tell me how many other jobs vanished without leaving enough evidence to make the sample. The audit also found work that looked old but was still active, and cases where a proposed cleanup or approval needed to remain with me.

![The engineer compares two dispatch sheets next to a parcel](/images/blog/s5e16/audit.png)

<p class="caption">A prepared item and a dispatch receipt answer different questions. Conceptual illustration.</p>

## A local main branch is still local

One of the cleanest cases came from the Codex fallback setup. Earlier changes were present on local main. The configuration repository also had a core profile in use locally that was still untracked, meaning Git had no snapshot of that file. Those are two different gaps. Pushing a branch can transfer its commits. It cannot transfer a file that never made it into a commit.

The July handover reports that the recovery pushed three commits to Forgejo. The retained Git history corroborates the identities and contents. Two commits dated 13 July covered the fallback runtime and model provenance. The 16 July commit added the core profile and amended the restore notes. The restored repository history and the report about what was already in use on the Mac are different observations. The commit by itself does not date the first use of the profile.

I find it useful to ask Git the comparison as a question about reachability. A commit is reachable from a branch when following parent links from the branch tip can get to it. The Git project documents [the symmetric difference and left/right counts in git rev-list](https://git-scm.com/docs/git-rev-list). With a freshly verified remote-tracking tip, this check asks how far each side has moved on its own. The remote-tracking reference is the local record of a remote branch, so its freshness matters.

**Read-only command recorded in the July audit handover**

```sh
git rev-list --left-right --count origin/main...HEAD
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

1. `git rev-list` walks commit history. `origin/main...HEAD` selects commits reachable from exactly one of those two tips. `--left-right` associates each selected commit with its side. `--count` reports two numbers in left-to-right order. Here, left is the locally recorded remote tip and right is the checked-out commit.

</details>

**Illustrative output.** For `2    3`, the left tip has two unique commits and the checkout has three. The appropriate next action is to inspect both sides before integrating. For `5    0`, the checkout contributes zero unique commits relative to that particular comparison tip. Neither output describes changes in the working directory. Git’s [worktree documentation](https://git-scm.com/docs/git-worktree) explains how one repository can have several checked-out directories. I still need to check the right directory for staged, unstaged and untracked work, as well as the ownership and currency of the candidate. The audit’s proposed worktree cleanup stayed with me, and some nominally ahead-zero directories were reported to contain untracked scratch documents.

## A ticket can lag a running system

The graph retrieval case ran the comparison in the other direction. The July report says the tracker description still portrayed the graph as empty and the scheduled job as suspended. The audit recorded 8,921 nodes, comprising 6,904 entity nodes and 2,017 episodic nodes, and reported that the Kubernetes CronJob was running. A [CronJob in Kubernetes](https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/) creates Jobs on a schedule. Its active configuration answers a scheduling question. The graph count answers a storage question.

Neither observation tells me how much the graph improves a retrieval answer. That requires checking whether the graph results contribute to the combined retrieval path, what the report called fusion. The immediate recovery was to correct the tracker description and retain that verification as follow-up. The numbers are reported July observations. I am not presenting the report as a live snapshot today.

Another case had a more specific finish line. A document could parse successfully and yield zero indexable chunks. A chunk is a piece of text the index can store and retrieve. Treating a valid empty result as a failure could hold up the consumer’s progress on its partition, an ordered slice of the event stream. The campaign’s evidence ledger distinguishes the historical report about a draining consumer from the retained source that explains this decision. Apache Kafka calls the saved position an [offset](https://kafka.apache.org/42/javadoc/org/apache/kafka/clients/consumer/KafkaConsumer.html#offsets-and-consumer-position-heading).

**Exact source excerpt. `neural-vault/vault_indexer.py` at `593c14e3`, lines 848–852**

```python
            logger.warning(
                f"No chunks generated for {file_path} — "
                f"skipping (committed as no-op)"
            )
            return {"success": True, "chunks": 0, "empty": True}
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

1. `logger.warning(` opens a diagnostic message in the successful-empty branch.
2. The first formatted string inserts the file path into the message.
3. The second string gives the reason the caller can skip indexing this file.
4. The closing parenthesis completes the warning call. Logging does not change the saved consumer position.
5. The return value describes a successful empty outcome to the external caller. The indexer returns data. It does not commit the offset here.

</details>

Immediately above that excerpt, the branch tries to delete older index entries for the path and logs a cleanup failure if it occurs. It returns the empty-success result even if that cleanup throws. That detail matters when reading “success.” This is a decision to let a valid empty event complete, with best-effort cleanup. It is not a guarantee that every older entry was deleted. The July audit attributes the fix to a June commit and reports seeing it in a deployed image with the consumer draining. The tracker remained In Progress for roughly a month in the audit’s account, so the work at pickup was to reconcile the ticket with evidence of the fix.

<figure id="checkpoint-flow" class="story-flow" data-policy-flow><h3>What the next session needs to know</h3><div class="flow-desktop"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 225" role="img" aria-label="Tracker intent, Git history and observed service effects can each inform the checkpoint. Record the evidence and the next action."><defs><pattern id="grid-wide" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arrow-wide" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="#a78bfa"/></marker></defs><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#grid-wide)"/><path class="flow-motion" data-flow-edge d="M311 47H420V98H532" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" marker-end="url(#arrow-wide)" fill="none"/><path class="flow-motion" data-flow-edge d="M311 112H532" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" marker-end="url(#arrow-wide)" fill="none"/><path class="flow-motion" data-flow-edge d="M311 177H420V126H532" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" marker-end="url(#arrow-wide)" fill="none"/><g transform="translate(110 47)"><circle r="22" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><rect x="-10" y="-13" width="20" height="26" rx="2"/><path d="M-5-5H5M-5 0H5M-5 5H2"/></g></g><g font-family="system-ui" text-anchor="start"><text x="142" y="34" fill="#e9eaee" font-size="14">Tracker</text><text x="142" y="50" fill="#aab0bc" font-size="11.5">Intent and status</text></g><g transform="translate(110 112)"><circle r="22" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><circle cy="-10" r="3"/><circle cy="10" r="3"/><circle cx="12" cy="-5" r="3"/><path d="M0-7V7M0 4Q12 4 12-2"/></g></g><g font-family="system-ui" text-anchor="start"><text x="142" y="99" fill="#e9eaee" font-size="14">Git</text><text x="142" y="115" fill="#aab0bc" font-size="11.5">Contents and reachability</text></g><g transform="translate(110 177)"><circle r="22" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><rect x="-13" y="-10" width="26" height="18" rx="2"/><path d="M-10 1H-6L-3-4L2 5L5 0H10M-5 13H5"/></g></g><g font-family="system-ui" text-anchor="start"><text x="142" y="164" fill="#e9eaee" font-size="14">Service</text><text x="142" y="180" fill="#aab0bc" font-size="11.5">Observed effect</text></g><g transform="translate(555 112)"><circle r="22" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-12-10H12V12H-12ZM-7 1L-1 7L8-4"/></g></g><g font-family="system-ui" text-anchor="start"><text x="587" y="99" fill="#e9eaee" font-size="14">Checkpoint</text><text x="587" y="115" fill="#aab0bc" font-size="11.5">Evidence and next action</text></g></svg></div><div class="flow-mobile"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 330" role="img" aria-label="Tracker intent, Git history and observed service effects can each inform the checkpoint. Record the evidence and the next action."><defs><pattern id="grid-mobile" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arrow-mobile" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="#a78bfa"/></marker></defs><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#grid-mobile)"/><path class="flow-motion" data-flow-edge d="M233 46H310V269H236" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" marker-end="url(#arrow-mobile)" fill="none"/><path class="flow-motion" data-flow-edge d="M233 122H290V282H236" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" marker-end="url(#arrow-mobile)" fill="none"/><path class="flow-motion" data-flow-edge d="M233 198H270V295H236" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" marker-end="url(#arrow-mobile)" fill="none"/><g transform="translate(38 46)"><circle r="22" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><rect x="-10" y="-13" width="20" height="26" rx="2"/><path d="M-5-5H5M-5 0H5M-5 5H2"/></g></g><g font-family="system-ui" text-anchor="start"><text x="70" y="35" fill="#e9eaee" font-size="14">Tracker</text><text x="70" y="51" fill="#aab0bc" font-size="11.5">Intent and status</text></g><g transform="translate(38 122)"><circle r="22" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><circle cy="-10" r="3"/><circle cy="10" r="3"/><circle cx="12" cy="-5" r="3"/><path d="M0-7V7M0 4Q12 4 12-2"/></g></g><g font-family="system-ui" text-anchor="start"><text x="70" y="111" fill="#e9eaee" font-size="14">Git</text><text x="70" y="127" fill="#aab0bc" font-size="11.5">Contents and reachability</text></g><g transform="translate(38 198)"><circle r="22" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><rect x="-13" y="-10" width="26" height="18" rx="2"/><path d="M-10 1H-6L-3-4L2 5L5 0H10M-5 13H5"/></g></g><g font-family="system-ui" text-anchor="start"><text x="70" y="187" fill="#e9eaee" font-size="14">Service</text><text x="70" y="203" fill="#aab0bc" font-size="11.5">Observed effect</text></g><g transform="translate(38 283)"><circle r="22" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-12-10H12V12H-12ZM-7 1L-1 7L8-4"/></g></g><g font-family="system-ui" text-anchor="start"><text x="70" y="272" fill="#e9eaee" font-size="14">Checkpoint</text><text x="70" y="288" fill="#aab0bc" font-size="11.5">Evidence and next action</text></g></svg></div><div class="flow-tools"><button type="button" data-flow-motion aria-pressed="false">Pause flow</button><button type="button" data-flow-expand>Expand diagram</button></div><figcaption>Conceptual evidence flow. Each source answers a different question. The dotted paths show the direction of evidence into the checkpoint.</figcaption></figure>
<dialog data-flow-dialog aria-label="Expanded checkpoint diagram"><button type="button" data-flow-close>Close expanded diagram</button><div data-flow-expanded-content></div></dialog>
<script is:inline src="/images/blog/s5e16/flow-ui.js"></script>
<script is:inline src="/images/blog/s5e16/flow-motion.js"></script>

## A careful merge can still send too much

The documentation automation case had more than one unfinished boundary. An earlier July comparison of headless Claude and Codex runs had found that a disposable architecture document changed before a runner reported a budget error. “Headless” means the runner is started by a wrapper without a person operating its interface. Once the tool can touch a file, its exit status and the bytes on disk can disagree. The comparison report asked for a regression test that deliberately edits a file and then returns non-zero, plus a temporary copy with validated promotion or an exact rollback.

By the audit, the original branch was partly superseded. The recovery brought over the useful credential probe and authentication-failure handling, while retaining the main branch’s dry-run and capture behaviour. This is why “merge the old work” was too blunt a description. The failure classification is visible in the retained merge. It distinguishes a rejected credential from a usage limit or timeout. For that HTTP status terminology I used the [IETF HTTP Semantics standard](https://www.rfc-editor.org/rfc/rfc9110.html#name-401-unauthorized).

**Exact source excerpt. `scripts/architecture/update_docs_orchestrator.py` at `5cb9536a`, lines 744–751**

```python
            rc, out = claude_runner(selection_prompt(p["manifest"]), per_call_timeout)
            if rc != 0:
                kind = classify_claude_failure(rc, out)
                detail = safe_claude_failure_detail(kind, rc)
                log(f"[orchestrator] Call-1 rc={rc} failure={kind} " f"detail={detail}")
                if is_fatal_claude_failure(kind):
                    return finish_failure(kind, {})
            modules = _parse_module_list(out, fallback)
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

1. The wrapper builds a prompt from its manifest, calls the runner with a per-call timeout and receives a return code and output.
2. A non-zero return code takes the failure path.
3. The classifier reduces the return code and output to a known failure category.
4. The next helper chooses an operator-safe detail.
5. The wrapper logs the return code and the classified detail, without printing the raw output in that log message.
6. The fatal-category check asks whether the current invocation should stop.
7. If it should, the wrapper returns a failure with an empty module-result mapping before attempting module calls.
8. Otherwise, it passes the output and the deterministic fallback to the module-list parser.

</details>

**Synthetic input and decision.** If the selection call returns code `1` with `API error: 401`, the classifier produces `authentication_failed`. That category is fatal in the retained version. The shown call returns through `finish_failure`, so it never asks the same invalid credentials to write the next module. This is a read of the selection path. A separate test that fails after a module edit is needed to establish what happens to the edited bytes.

The audit reports 33 passing tests for the port and carries the transactional edit test as unfinished. I can see the source at the merge and follow control flow through the archived code. That does not independently rerun the 33 tests, or prove how later unattended executions behaved.

![Extra parcels are already on the trolley beside the package the engineer meant to send](/images/blog/s5e16/carry.png)

<p class="caption">The outgoing trolley carries more than the one parcel under review. Conceptual illustration.</p>

The port was reviewed at the level of the files it was meant to change. The outbound branch had a wider scope. Its local main already contained seven commits for a parallel research effort. They were ancestors of the merge’s first parent, so they travelled with the push according to the handover. The exact first-parent range in retained Git history contains seven commits. It proves the ancestry. The historical handover supplies the observation that they were previously unpushed and went out together.

A useful read-only separation is to compare the merge against each parent, then compare the intended remote tip with the actual outgoing tip. The first comparison lets me inspect what the merge added to the receiving line. The outbound range lets me see other committed work the remote would receive. A parent is simply a commit’s immediate predecessor. In a normal two-parent merge, the first parent is the tip I merged into. The concepts are documented by the Git project in [git merge](https://git-scm.com/docs/git-merge) and [git rev-list](https://git-scm.com/docs/git-rev-list).

**Illustrative commit-range check.** Imagine the remote still points to commit `R`. My local main is two commits ahead of it, `A` and `B`, and the fix lives on a second branch at `F`. I merge the fix and get `M`. A comparison from `M^1`, its first parent, to `M` can show a small patch. The remote comparison from `R` to `M` can include all of `A`, `B`, `F` and `M`. A three-file diff for the intended fix says nothing about how many other commits are reachable from the ref being sent. With patch review and ref review as two separate checks, the operator can see where scope expanded before publishing anything.

This is where a handover needs two receipts. It can say “the intended port is present in the merge” and point to the exact revision. It should also say “the push carried parallel work” and leave an owner and a review action for that range. The historical handover did the latter after the push. It also left CI verification open. The retained material gives me no reason to turn that follow-up into a green build.

## What the evidence let me close

| Case | What I could establish | What still needed a different check |
| --- | --- | --- |
| Fallback configuration | The retained commits contain the runtime changes and new tracked profile. The report records the push. | Git history alone does not date first use on the Mac. |
| Graph retrieval | The audit recorded a populated graph and active CronJob configuration. | Actual contribution to a combined retrieval result. |
| Empty document indexing | Historical source returns success with zero chunks, and the audit reports its deployed image and a draining consumer. | The source alone cannot prove the deployment, offset movement, or successful cleanup for every document. |
| Documentation automation | The merge contains auth handling. Its first-parent ancestry includes the seven parallel commits. | Separate confirmation of later CI and the edit-after-failure regression remained outside this reconstruction. |
| Continuation process | The reduced handover sweep produced follow-up issues. The full session scan was aborted. | Coverage of older handovers and whether any later automatic recovery worked. |

I wanted a checkpoint that left the owner of the next action with something they could use. A useful checkpoint says what changed, where it is, which boundary was actually observed and what still needs an owner decision. Git can tell me whether a commit is in a history. The service can show whether a particular effect is visible. The ticket can record the decision. The checkpoint needs enough of each to stop the next session guessing.

The audit proposed an end-of-turn checklist for exactly that purpose. It asked whether there were unpushed commits, finished branches still waiting to merge, or In Progress tickets whose fixes had landed. That was a proposal at this point in the story. The narrower manual sweep is the recovery the records show.

## What I would carry forward

- Check the outgoing commit range independently of the intended diff. When several sessions share a checkout, the difference is part of the release decision.
- Read the worktree status before concluding there is nothing unique to preserve. Ahead counts cover committed history.
- Put the next observable action near the top of the handover. “Verify CI for this exact revision” leaves a smaller investigation than “check the work.”
- Keep tracker closure, source integration and runtime verification separate. A single word like “done” can conceal all three boundaries.

In the later July records I started looking at how to make those checkpoints deliberate. The next question was what a new session would need to pick up a task safely when it could no longer rely on the original conversation.

<details class="glossary" data-glossary><summary>Glossary and primary references</summary><div class="glossary-tools" hidden><label>Find a term <input type="search" aria-label="Search glossary"></label><button type="button">Clear</button><p role="status"></p></div><section class="glossary-term"><h3>Worktree</h3><p>A checked-out working directory linked to a Git repository.</p><a href="https://git-scm.com/docs/git-worktree">Primary reference</a></section><section class="glossary-term"><h3>Remote-tracking branch</h3><p>A local reference representing a branch as last observed on a remote.</p><a href="https://git-scm.com/book/en/v2/Git-Branching-Remote-Branches">Primary reference</a></section><section class="glossary-term"><h3>Reachability</h3><p>Whether Git can walk from a tip to a commit by following its parent links.</p><a href="https://git-scm.com/docs/git-rev-list">Primary reference</a></section><section class="glossary-term"><h3>First parent</h3><p>At a merge commit, the first parent points to the tip that received the merge.</p><a href="https://git-scm.com/docs/git-rev-list">Primary reference</a></section><section class="glossary-term"><h3>Offset</h3><p>The position of a record within an ordered Kafka partition.</p><a href="https://kafka.apache.org/42/javadoc/org/apache/kafka/clients/consumer/KafkaConsumer.html#offsets-and-consumer-position-heading">Primary reference</a></section><section class="glossary-term"><h3>CronJob</h3><p>A Kubernetes object that creates Jobs on a schedule.</p><a href="https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/">Primary reference</a></section><section class="glossary-term"><h3>401 Unauthorized</h3><p>An HTTP response indicating the request lacks valid authentication credentials.</p><a href="https://www.rfc-editor.org/rfc/rfc9110.html#name-401-unauthorized">Primary reference</a></section></details>

<style is:global>
main{min-width:0}main>p:not(:has(img)){max-width:74ch}main>ul,main>ol{max-width:74ch}.eyebrow{text-transform:none;letter-spacing:.025em}.reading-progress{position:fixed;left:0;top:0;height:3px;width:0;background:var(--accent);z-index:20;pointer-events:none}.reading-tools{max-width:1160px;margin:0 auto;padding:14px 28px 0;display:flex;justify-content:flex-end;gap:8px}.reader-button,.copy-code,.expand-diagram{border:1px solid var(--border);background:var(--card);color:var(--text);padding:7px 11px;border-radius:6px;font-size:11px}.copy-code{float:right;margin-left:10px}.code-source{display:flow-root}.contents a[aria-current="location"]{color:var(--accent);font-weight:600}.reading-focus .contents{display:none}.reading-focus .page-grid{display:block;max-width:800px}.reading-focus .nav-links>a{display:none}.reading-focus .article-header{max-width:none}.diagram{position:relative}.expand-diagram{display:block;margin:12px auto 0;background:#192d46;color:#eef6ff;border-color:#5c86a6}dialog{width:min(96vw,1300px);height:92vh;max-height:92vh;padding:18px;border:1px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text)}dialog::backdrop{background:rgba(0,0,0,.8)}.dialog-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}.diagram-scroll{overflow:auto;height:calc(100% - 54px);background:#101c2d;border-radius:8px}.diagram-scroll img{width:1200px;max-width:none;border-radius:0;margin:0 auto}.sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:600px){.reading-tools{padding:12px 18px 0}.copy-code{padding:4px 7px}.dialog-head{font-size:12px}dialog{padding:10px}.diagram-scroll img{width:1000px}}
.article-header{border-left:3px solid var(--accent);padding-left:22px}.eyebrow{margin-top:25px}.page-grid{grid-template-columns:minmax(0,740px) 210px;gap:64px}.code-box{box-shadow:0 8px 22px #00000012}h2{border-bottom:0;padding-bottom:0}.caption{border-left:0;padding-left:0}@media(max-width:600px){.article-header{padding-left:15px}}
details.walkthrough{padding:0}details.walkthrough summary{padding:13px 18px;cursor:pointer;color:var(--accent);font-size:12px;font-weight:550;list-style-position:inside}details.walkthrough summary:hover{background:var(--chip)}details.walkthrough[open] summary{border-bottom:1px solid var(--border)}details.walkthrough .explanation-body{padding:14px 18px}details.walkthrough summary:focus-visible{outline-offset:-4px}@media(max-width:600px){details.walkthrough summary{padding:12px 14px}details.walkthrough .explanation-body{padding:12px 14px}}

main{min-width:0}.notebook-article table{display:block;max-width:100%;min-width:0;overflow-x:auto}.table-wrap{overflow:auto;max-width:100%}table{min-width:580px}summary{cursor:pointer}details.glossary,details.source-note{border:1px solid var(--border);border-radius:8px;padding:16px;margin:25px 0}.glossary-term{border-top:1px solid var(--border)}.glossary-tools input{font:inherit;max-width:100%}.glossary-search-row{display:flex;gap:12px}.glossary-search-row input{min-width:0}.glossary-tools button,.flow-tools button{font:inherit;padding:7px 12px}.code-source{font-size:12px}.contents{margin-top:160px}pre{overflow:auto}h3{font-size:17px}figcaption,.caption{font-size:12px}code{overflow-wrap:anywhere;white-space:normal}pre code{white-space:pre}.flow-tools{display:flex;gap:12px;margin:10px 0}.publish-flow{margin:28px 0}.publish-flow h3{margin:0 0 14px}.publish-flow figcaption{line-height:1.6;color:var(--muted,#aab0bc)}.flow-tools button,dialog button{background:#1c1e24;color:#e9eaee;border:1px solid #75608f;border-radius:6px;padding:9px 12px;cursor:pointer}.flow-mobile{display:none}.flow-desktop svg,.flow-mobile svg{display:block;width:100%;height:auto}dialog{color:var(--text);background:var(--bg);border:1px solid var(--border);max-width:min(1150px,95vw);max-height:90vh;width:95vw}dialog::backdrop{background:#000b}.asset-option{margin:38px 0}.review-links{display:flex;gap:18px;flex-wrap:wrap}@media(max-width:600px){input{font-size:16px!important}.flow-desktop{display:none}.flow-mobile{display:block}code{font-size:.88em}}
main{min-width:0}main img{width:100%;height:auto;display:block}.story-flow{margin:28px 0}.story-flow h3{margin:0 0 14px}.story-flow figcaption{font-size:12px;line-height:1.6;color:var(--muted)}.flow-mobile{display:none}.flow-desktop svg,.flow-mobile svg{display:block;width:100%;height:auto}.table-wrap{overflow-x:auto;max-width:100%}.notebook-article table{display:block;min-width:0;max-width:100%;overflow-x:auto}main p{font-size:15px}pre{max-width:100%;overflow-x:auto}code{overflow-wrap:anywhere}pre code{white-space:pre}.asset-option{margin:35px 0}.review-links{display:flex;flex-wrap:wrap;gap:14px}summary{cursor:pointer}dialog{max-width:95vw;width:1000px;background:var(--bg);color:var(--text)}dialog::backdrop{background:#000b}@media(max-width:600px){main p,main li{font-size:14px}.flow-desktop{display:none}.flow-mobile{display:block}.glossary-search-row{display:flex;gap:8px}.glossary-search-row input{min-width:0;font-size:16px}}
.story-flow{background:#141414;border:1px solid #3b3f4a;border-radius:10px;padding:16px}.story-flow h3{color:#e9eaee}.story-flow figcaption{color:#aab0bc}.story-flow svg{border-radius:5px}.flow-tools{display:flex;gap:10px;margin-top:10px}.flow-tools button{background:#1c1e24;color:#e9eaee;border:1px solid #555867;border-radius:5px;padding:6px 10px}.flow-motion{animation:s5e03-dots 1.4s linear infinite;stroke-dasharray:3 7}.flow-paused .flow-motion{animation-play-state:paused}@keyframes s5e03-dots{to{stroke-dashoffset:-20}}@media(prefers-reduced-motion:reduce){.flow-motion{animation:none}}.article-meta{font-size:12px}.review-links{font-size:13px}.notebook-article li{font-size:15px}@media(max-width:600px){.notebook-article li{font-size:14px}}
img{max-width:100%;height:auto!important;object-fit:contain}.notebook-article p,.notebook-article li{font-size:15px;line-height:1.75}.story-flow text{font-family:system-ui,sans-serif}.story-flow{margin:26px 0}.source-label{font-size:12px;color:var(--muted,#888)}@media(max-width:600px){.notebook-article p,.notebook-article li{font-size:14px}}
.story-flow h3{color:#e9eaee!important}

.story-flow h3{color:#e9eaee!important}.notebook-article img{display:block;width:100%;height:auto}.review-links{display:flex;gap:.45rem 1rem;flex-wrap:wrap}
</style>
<script is:inline src="/images/blog/s5e16/reader.js"></script>
