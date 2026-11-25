---
title: "Who Gets to Make the Next Change?"
description: "A July control-plane build used leases, fencing epochs and shadow decisions to separate the agent that can advise from the agent that can change state."
pubDatetime: 2026-07-27T00:00:00Z
series: "Season 5: Rootweaver"
episode: 18
draft: false
tags: [rootweaver, postgres, reliability, agent-governance]
shippingDatetime: 2026-11-26T07:30:00Z
author: Ryan Duffy
image: /images/blog/s5e18/hero.png
---

[A Checkpoint Is an Intake Receipt](https://rduffy.uk/writing/season-5-episode-17-a-checkpoint-is-an-intake-receipt/) ended with evidence in quarantine. I could recover a piece of what a session had done. When another session took over a task, I had a different question. What gave it the right to make the next change, and how would I know the previous session had lost that right?

In late July I set out to make that decision explicit. A coding agent could be implementing a change, advising the implementer or starting from an old conversation that still described it as the owner. A parent conversation gives me the objective and the reasons for delegating. It cannot arbitrate two concurrent claims on a shared resource. I wanted one place to decide who could change that resource, a record of why, and a way to inspect the decision before it started blocking tools. I set those boundaries and reviewed the evidence. Coding agents helped implement the kernel, service, adapters and console.

![An engineer stands by the main control wheel of a coastal flood barrier](/images/blog/s5e18/hero.png)

<p class="caption">The shared wheel makes the ownership decision visible. Conceptual illustration.</p>

## Start with a decision the database can own

A task assignment can stay useful for hours. Permission to act needs a shorter lifetime and a scope. The first package modelled those separately. A scope says which work is covered, who owns it and which effects it permits. An effect describes a kind of action, such as a change to repository state. A resource selector identifies the resource the effect would touch. A lease binds temporary authority to a principal, the identity the control plane recognises, and a particular session acting as that principal.

Canonical selectors let the service compare resources consistently before deciding whether they overlap. The grant then runs in a database transaction. If two claimants both read “available” and only lock after choosing an outcome, they can reason correctly about the same stale state. Taking the authority lock before checking conflicting leases forces the second claimant to evaluate the decision after the first finishes. The source uses [SQLAlchemy](https://www.sqlalchemy.org/) to express transactions and row locks against [PostgreSQL](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS).

**Exact excerpt from the private implementation. `repository.py` at `05dca0c`, lines 473–478, inside `_acquire`**

```python
        now = self._now()
        with self._engine.begin() as connection:
            scope, orchestration = self._lock_scope_authority(
                connection, request.scope_id
            )
            self._expire_due_leases(connection, orchestration["id"], now)
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

1. Read the repository clock once for this acquisition attempt.
2. Start the database transaction. Operations on this connection share its commit boundary.
3. Call the internal method that obtains the relevant authority locks and returns the task scope and its containing orchestration.
4. Supply the transaction connection and the scope ID from the request.
5. Close the method call. The returned scope and orchestration remain available to the following statements.
6. Mark leases in that orchestration whose time has run out, using the same connection and clock reading.

</details>

The next part of the source examines previous results for the same principal, operation and idempotency key. Idempotency means an exact retry does not create a second grant. If the key arrives with a different request hash, the repository raises a conflict. A fresh claim must pass authority checks and the resource-conflict check. The check includes recently expired leases inside a bounded takeover grace period. When the claim succeeds, the epoch is one more than the highest prior epoch on that scope. The implementation report records a test with 64 concurrent acquisition requests, producing one grant and 63 denials. The retained test source makes the setup precise. One seeded principal and session sent distinct acquisition requests for the same resource. The test isolates concurrent claim handling on one scope. Multi-host lifecycle checks came later, and this test supplies no throughput or fairness measurement.

## A handover has to invalidate the previous generation

A lease expires unless it is renewed through heartbeats. Time handles absence. A fencing epoch handles succession. It is a generation number that identifies which version of authority a caller is using. A session can remember the previous generation after a pause or reconnect. A validator can check that number against the current lease instead of relying on the session to notice a handover.

The repository validates the lease, principal, session, scope, token hash, epoch, effect and requested resource. The token is a secret held by the claimant. The stored hash lets the service check it without storing the bearer token itself. The epoch still matters because holding a once-valid token is compatible with having lost ownership.

**Exact excerpt from the private implementation. `repository.py` at `05dca0c`, lines 1075–1080, inside transfer**

```python
            scope, orchestration = self._lock_scope_authority(
                connection, old["scope_id"]
            )
            old = self._locked_active_lease(connection, request.lease_id)
            if old["fencing_epoch"] != request.expected_epoch:
                raise LeaseConflict("stale transfer compare-and-swap epoch")
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

1. Take the authority locks for the transfer and load the relevant scope and orchestration.
2. Use the same transaction connection and the scope recorded on the outgoing lease.
3. Close the call after passing those two values.
4. Load the currently active lease under lock. This is the authoritative read after taking the scope lock.
5. Compare the stored fencing epoch to the generation the requester expected to transfer.
6. Stop with a conflict when they differ. A request prepared for an earlier generation cannot transfer the currently observed lease through this branch.

</details>

This is part of a compare-and-swap. The repository compares current state with an expected version before applying the change. The rest of the transfer checks the matching approved request and its revision, the outgoing lease and scope, and the proposed successor's session and identity. It changes the old lease to transferred, changes the owner of the scope, inserts the successor lease at the incremented epoch and appends an event inside the transaction. A consultant session can contribute advice without receiving mutation authority through this transfer.

![Gloved hands exchange blank metal tags at a weathered interlock housing](/images/blog/s5e18/one.png)

<p class="caption">A controlled handover retires the previous grant. Conceptual illustration.</p>

Use a synthetic example with a shared worktree, a checked-out working copy of a repository. Session A holds epoch 7. Session B asks for ownership. The numbers and identifiers below are invented to show what each decision changes.

| Input | Decision | Result |
| --- | --- | --- |
| B asks for overlapping authority while A's lease is live | The repository finds the conflict | A keeps epoch 7 |
| A human-approved transfer matches the expected epoch and approval revision | The transfer commits as one unit | A's lease becomes transferred. B receives epoch 8 on the same scope |
| A returns with its original lease and epoch 7 | The old lease fails validation | A has no valid authority at this boundary |
| B presents matching identity, lease, scope, effect and resource | The repository validates the request | B has valid authority at the repository boundary |

The final row says where the check took place. A tool or other component that actually performs a change still needs to honour that decision. A database row cannot stop a process from writing to a file by itself.

<figure id="lease-transfer-flow" class="story-flow" data-policy-flow><h3>What an approved transfer changes</h3><div class="flow-desktop"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 137" role="img" aria-label="Illustrative approved handover. Session A starts at epoch 7. A matched approval precedes the transaction. It transfers authority to session B at epoch 8 and invalidates the old lease."><defs><pattern id="grid-wide" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arrow-wide" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="#a78bfa"/></marker></defs><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#grid-wide)"/><path class="flow-motion" data-flow-edge d="M119 51H260" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" marker-end="url(#arrow-wide)" fill="none"/><path class="flow-motion" data-flow-edge d="M309 51H451" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" marker-end="url(#arrow-wide)" fill="none"/><path class="flow-motion" data-flow-edge d="M499 51H642" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" marker-end="url(#arrow-wide)" fill="none"/><g transform="translate(95 51)"><circle r="22" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><circle cy="-5" r="5"/><path d="M-10 12Q-10 1 0 1T10 12"/></g></g><g font-family="system-ui" text-anchor="middle"><text x="95" y="91" fill="#e9eaee" font-size="14">Session A</text><text x="95" y="107" fill="#aab0bc" font-size="11.5">Active lease · epoch 7</text></g><g transform="translate(285 51)"><circle r="22" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><rect x="-10" y="-13" width="20" height="26" rx="2"/><path d="M-6 1L-1 6L7-4"/></g></g><g font-family="system-ui" text-anchor="middle"><text x="285" y="91" fill="#e9eaee" font-size="14">Transfer request</text><text x="285" y="107" fill="#aab0bc" font-size="11.5">Approval and revision match</text></g><g transform="translate(475 51)"><circle r="22" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-11-9H11V10H-11Z M-5-3H5M-5 3H5M-5 7H3"/></g></g><g font-family="system-ui" text-anchor="middle"><text x="475" y="91" fill="#e9eaee" font-size="14">Lease transaction</text><text x="475" y="107" fill="#aab0bc" font-size="11.5">Epoch advances to 8</text></g><g transform="translate(665 51)"><circle r="22" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><circle cy="-5" r="5"/><path d="M-10 12Q-10 1 0 1T10 12M8-11H14M11-14V-8"/></g></g><g font-family="system-ui" text-anchor="middle"><text x="665" y="91" fill="#e9eaee" font-size="14">Session B</text><text x="665" y="107" fill="#aab0bc" font-size="11.5">A’s old lease is invalid</text></g></svg></div><div class="flow-mobile"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 330" role="img" aria-label="Illustrative approved handover. Session A starts at epoch 7. A matched approval precedes the transaction. It transfers authority to session B at epoch 8 and invalidates the old lease."><defs><pattern id="grid-mobile" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arrow-mobile" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="#a78bfa"/></marker></defs><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#grid-mobile)"/><path class="flow-motion" data-flow-edge d="M38 69V98" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" marker-end="url(#arrow-mobile)" fill="none"/><path class="flow-motion" data-flow-edge d="M38 145V174" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" marker-end="url(#arrow-mobile)" fill="none"/><path class="flow-motion" data-flow-edge d="M38 221V259" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" marker-end="url(#arrow-mobile)" fill="none"/><g transform="translate(38 46)"><circle r="22" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><circle cy="-5" r="5"/><path d="M-10 12Q-10 1 0 1T10 12"/></g></g><g font-family="system-ui" text-anchor="start"><text x="72" y="38" fill="#e9eaee" font-size="14">Session A</text><text x="72" y="54" fill="#aab0bc" font-size="11.5">Active lease · epoch 7</text></g><g transform="translate(38 122)"><circle r="22" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><rect x="-10" y="-13" width="20" height="26" rx="2"/><path d="M-6 1L-1 6L7-4"/></g></g><g font-family="system-ui" text-anchor="start"><text x="72" y="114" fill="#e9eaee" font-size="14">Transfer request</text><text x="72" y="130" fill="#aab0bc" font-size="11.5">Approval and revision match</text></g><g transform="translate(38 198)"><circle r="22" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-11-9H11V10H-11Z M-5-3H5M-5 3H5M-5 7H3"/></g></g><g font-family="system-ui" text-anchor="start"><text x="72" y="190" fill="#e9eaee" font-size="14">Lease transaction</text><text x="72" y="206" fill="#aab0bc" font-size="11.5">Epoch advances to 8</text></g><g transform="translate(38 283)"><circle r="22" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><circle cy="-5" r="5"/><path d="M-10 12Q-10 1 0 1T10 12M8-11H14M11-14V-8"/></g></g><g font-family="system-ui" text-anchor="start"><text x="72" y="275" fill="#e9eaee" font-size="14">Session B</text><text x="72" y="291" fill="#aab0bc" font-size="11.5">A’s old lease is invalid</text></g></svg></div><div class="flow-tools"><button type="button" data-flow-motion aria-pressed="false">Pause flow</button><button type="button" data-flow-expand>Expand diagram</button></div><figcaption>Illustrative epochs. Dotted paths show the order of decisions. The lease transaction updates the owner and retires the old lease together.</figcaption></figure>
<dialog data-flow-dialog aria-label="Expanded lease transfer diagram"><button type="button" data-flow-close>Close expanded diagram</button><div data-flow-expanded-content></div></dialog>
<script is:inline src="/images/blog/s5e18/flow-ui.js"></script>
<script is:inline src="/images/blog/s5e18/flow-motion.js"></script>

## The first service rollout put privilege in the wrong place

The kernel shipped as a package. It had transactions and tests. There was no service listening for agents, no installed host client and no hook enforcing its decisions. The next package added a private API and a local daemon on the Mac and desktop. A daemon is a background process that handles requests from local tools. Its owner-only Unix-domain socket gave those tools a local entry point while the daemon handled the remote service credential.

The first GitOps rollout made a deployment mistake. GitOps uses committed configuration to reconcile the running system to a desired state. The report records that administrative database material was copied into the application namespace during bootstrap. An application process needs to read and write its rows. The ability to initialise or administer the database belongs to a different operational boundary. Both capabilities landed in the same place.

The recorded repair suspended reconciliation, removed the bootstrap objects from the application namespace and moved bootstrap authority to the data plane. In the corrected arrangement, the database owner could not log in directly, the migrator was separate, and the runtime role could read and change data without schema creation authority. The [PostgreSQL role documentation](https://www.postgresql.org/docs/current/user-manag.html) explains how roles separate identities and privileges. The report says the database survived the containment and that reconciliation reached Ready after the correction.

The same report records a successful register, claim, heartbeat, validate and release sequence on each of two hosts. The runtime pod had zero restarts in that observation, and Prometheus reported a successful scrape. Those checks support the service and host-client path that was exercised. They do not measure what would happen if ordinary coding tools were blocked, because this package still left provider hook integration open.

## Observe the adapters before letting them decide for tools

The next implementation task was separating what a provider reports from what the platform can safely infer. A hook is a callback invoked by a coding harness when something happens. OpenAI's [Codex hooks](https://developers.openai.com/codex/hooks) and Anthropic's [Claude Code hooks](https://code.claude.com/docs/en/hooks) document separate event interfaces. A provider adapter had to interpret the payload it actually received, connect the event to the right parent or child session and map it to a bounded effect.

The first independent review found gaps in nested outcomes, mutation-effect coverage and provider wiring. A later review found that a child identifier in tool or failure events could lose its attribution. Another found that attaching a runtime updated state without appending an audit event. The implementation report also records an order-dependent test limited to 100 events, a denial path that needed an audit record and an unsafe downgrade with populated data. The branch stayed unmerged through those failed reviews. The report records a passing fifth review after targeted corrections, alongside 112 historical test passes on the exact branch.

I kept the operating mode in shadow. Shadow mode computes and records a decision while leaving the tool's original behaviour in place. It let me compare the effect and identity the adapter inferred against the provider action that actually ran. The Mac Codex canary produced four sanitized events and one attachment notice around a read and a small mutation, with zero blocks. The corrected Claude canary recorded activity across 36 hook exits, also with zero blocks. The replacement stream carried bounded categories and pseudonymous identifiers. The report records retiring legacy forwarding that carried raw command or error content. The provider flags were off at closeout.

![An engineer watches flood gates from a grassy bluff through binoculars](/images/blog/s5e18/two.png)

<p class="caption">Observation can take place outside the operating boundary. Conceptual illustration.</p>

## Give the operator a view of the evidence

The Control Centre originally presented synthetic data. The read-only replacement used the control-plane projection, a deliberately reduced view of durable state. It arranged work parent-first. I could start with the objective, follow the delegated session and then find the evidence or outcome. A named `snapshot_changed` server-sent event prompted a refresh. The [WHATWG server-sent events standard](https://html.spec.whatwg.org/multipage/server-sent-events.html) defines how a server sends named updates over HTTP and a browser listens for them. I inspected the historical API source and found that event name emitted with a refresh signal. The retained review report describes the browser consuming it.

The projection limited each scoped receipt read to the latest 100 records. It offered a bounded operator view and kept the raw runner inspector behind its own privilege gate. The report describes isolated browser checks at narrow width, high zoom and reduced motion, and a passing read-only source merge. Its feature remained default-off. That is separate evidence from the WP2 service deployment and from WP3 shadow observations.

| Evidence from July | What it established | Question it left open |
| --- | --- | --- |
| 64 concurrent claims in the reported kernel test | One grant and 63 denials in that case | Behaviour across identities, hosts or other contention patterns |
| Two-host lifecycle checks after the rollout correction | Both tested host clients exercised the private service | Which provider tools would consult it before acting |
| Bounded provider canaries and sanitized evidence | Adapter activity could be attributed and inspected | Whether a real mutation would be prevented |
| Read-only console merge and isolated browser review | The console could render the projected state and refresh on the named event | Where and when the feature would be enabled |

## What I would keep

- Give temporary authority an explicit owner, resource, effect and lifetime. Keep the objective and reasons for the work alongside it.
- Treat losing authority as a state transition. Validators should be able to recognise a stale generation even when a session resumes with old context.
- Separate bootstrap privilege from ordinary runtime access. Check that separation in the deployed configuration as well as in the role design.
- Use shadow mode to test attribution and data boundaries. A report that says “would deny” is evidence about a decision, and actual enforcement needs its own proof.
- Let the operator inspect the decision from the parent task down. Keep that view small enough to audit and document the limits of what it shows.

The next work followed the gap left open here. If the control plane says an action is allowed, there is still a question about where that authority should be checked and spent. The retained follow-up began testing the boundary where a real tool would make the change.

<details class="glossary" data-glossary><summary>Glossary and primary references</summary><div class="glossary-tools" hidden><label>Find a term <input type="search" aria-label="Search glossary"></label><button type="button">Clear</button><p role="status"></p></div><section class="glossary-term"><h3>Lease</h3><p>Time-limited authority held by one principal and session for a scoped resource and effect.</p><a href="#start-with-a-decision-the-database-can-own">Primary reference</a></section><section class="glossary-term"><h3>Principal</h3><p>An identity the service can authenticate and use to bind authority.</p><a href="https://www.postgresql.org/docs/current/user-manag.html">Primary reference</a></section><section class="glossary-term"><h3>Resource selector</h3><p>A canonical name for the part of the system a request would affect.</p><a href="#start-with-a-decision-the-database-can-own">Primary reference</a></section><section class="glossary-term"><h3>Fencing epoch</h3><p>A generation number used to distinguish current authority from an older grant.</p><a href="#a-handover-has-to-invalidate-the-previous-generation">Primary reference</a></section><section class="glossary-term"><h3>Compare-and-swap</h3><p>Apply a change only if the current value still matches the version you expected.</p><a href="#a-handover-has-to-invalidate-the-previous-generation">Primary reference</a></section><section class="glossary-term"><h3>Shadow mode</h3><p>Record the decision a policy would have made while allowing the original action to proceed normally.</p><a href="#observe-the-adapters-before-letting-them-decide-for-tools">Primary reference</a></section><section class="glossary-term"><h3>Server-sent events</h3><p>An HTTP stream that sends events from a server to a browser.</p><a href="https://html.spec.whatwg.org/multipage/server-sent-events.html">Primary reference</a></section></details>

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
<script is:inline src="/images/blog/s5e18/reader.js"></script>
