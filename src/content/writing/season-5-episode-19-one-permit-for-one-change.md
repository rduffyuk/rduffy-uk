---
title: "One Permit for One Change"
description: "The first permit design checked too early. Moving the decision next to the tool clarified what a permit could prove and what still needed a live test."
pubDatetime: 2026-07-29T00:00:00Z
series: "Season 5: Rootweaver"
episode: 19
draft: false
tags: [rootweaver, postgres, reliability, agent-governance]
shippingDatetime: 2026-11-26T22:40:10Z
author: Ryan Duffy
image: /images/blog/s5e19/hero.png
---

[Who Gets to Make the Next Change?](https://rduffy.uk/writing/season-5-episode-18-who-gets-to-make-the-next-change/) left me with a control plane that could identify the current lease holder. A lease gives one session temporary authority over a scoped piece of work. The next question was what happened when that session tried to change something. The control plane could validate a claim, but a file write, Git operation or deployment happens somewhere else. I wanted the component making the change to take responsibility for that last check.

I set the goal for the next slice around a single attempted change. The action should have a concrete target, use current authority, and leave enough evidence to tell a successful authorization from a completed action. Coding agents helped implement and test the boundary. I kept the operational decision separate. The late-July source could advance while the production controls stayed off.

![An engineer meters water directly over a seed tray in a glasshouse](/images/blog/s5e19/hero.png)

<p class="caption">The handle and the controlled effect meet at one station. Conceptual illustration.</p>

## The hook was a tempting place to spend the permit

A pre-tool hook gives a harness a point to check a request before running a tool. It seemed like a reasonable place to ask the control plane whether a change was allowed. The first implementation went further and used that point to consume the authorization. A permit is one-use authority for a particular operation. Consuming it is the durable decision that marks that authority as spent.

The independent review rejected that arrangement. The hook and the actual tool ran at different boundaries. By spending the permit in the hook, the system could record that authority was consumed before the component doing the work reached the action. That left an unresolved interval between the check and the effect, and a consumed permit alone supplied no evidence that a tool ran. This is a time-of-check versus time-of-use problem. The clocks matter, but so does which component owns the operation.

The review also found a possible 1.022-second combined path against a one-second host deadline. The 22 milliseconds were a reported timing case, not a production latency percentile. The model had an 0.8-second authorization allowance inside the overall one-second deadline. An inner budget does not make the remaining stages instantaneous. There is still validation, a final consume step and the tool invocation. The Python project documents [how asyncio deadlines and cancellation work](https://docs.python.org/3/library/asyncio-task.html#timeouts). A cancellation or timeout tells a caller its wait ended. It cannot reverse a change an external system already accepted.

I kept the hook path deny-only for protected operations without a qualified execution wrapper. That made the gap explicit. A hook could describe an attempted operation and identify which provider sent it. The component that executed the operation had to own the final authorization step. A synthetic executor provided a way to exercise that boundary using test callbacks before routing real provider tools into it. A later source change gave the daemon’s test-only route an explicitly synthetic name, so that a protocol test could no longer be mistaken for live enforcement.

## Match the permit to one operation and one resource

The lease still answered who had standing authority. The permit carried a narrower question. Can this session perform this effect on this resource, under this generation of the lease, for this operation ID? The operation ID identifies the attempt. The resource selector is the normalized name of its target. The fencing epoch is the lease's generation number. A changed generation makes a previous grant stale.

The database operation locks the permit row before checking its state. PostgreSQL's [row-lock documentation](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS) explains how a competing transaction waits on that row instead of making an independent decision from the same value. Rootweaver checks the permit's active state and expiry, then verifies the linked lease and session, operation fingerprint, resource and epoch. Successful consumption updates the permit to consumed in that transaction. Two calls sharing a permit cannot both take the active-to-consumed transition. The implementation also scoped the database operation by workspace. The recovery report records a matching [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) policy for the permit table.

The exact order below is from the later provider-adapter merge. The function already has a permit inside the host deadline by the time this excerpt begins.

**Exact excerpt from the private implementation. `protected_mutations.py` at `f9b044d0`, lines 173–182**

```python
                # Consumption is deliberately adjacent to the side effect. The permit
                # is bound to this operation ID, selector, live lease and epoch.
                await self._invoke(
                    self._authority.consume_operation_permit,
                    permit.id,
                    request.permit_request.operation_id,
                    request.permit_request.resource,
                )
                await self._sink(sink)
            return MutationResult(executed=True)
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

1. The first comment explains the placement of the consume operation. It appears immediately before the callback that changes state.
2. The second comment lists what the permit ties together. The authority service checks the request against the permit and current lease.
3. Start the awaited authority call. The next statement outside the call waits until this one finishes.
4. Select the operation that checks and consumes the permit.
5. Supply the identifier of the issued permit.
6. Supply the current request's operation identifier so it can be compared with the bound operation.
7. Supply the resource named by the current request.
8. Close the call. If the authority rejects it, control leaves this path before the callback.
9. Invoke the supplied sink, the component that actually performs the change.
10. Return the successful execution result once the callback returns. The later exception handler takes a separate denial path.

</details>

The source places consumption next to execution in the same wrapper. The database transaction and a filesystem or remote operation are still separate. A crash after consumption can leave a spent permit with no confirmed downstream effect. A crash after an external side effect can leave a changed system without a local success receipt. This was a narrower claim than exactly-once execution. The permit prevents a second spend. A durable outcome record or reconciliation has to answer whether the effect happened.

![Gloved hands hold a notched tab beside a wet metering fixture](/images/blog/s5e19/one.png)

<p class="caption">Spending one tab records a use. The tray still has an outcome of its own. Conceptual illustration.</p>

Here is a synthetic example using a scratch repository and invented identifiers. It illustrates the decision boundaries, not a recorded July run.

| Attempt | What authority sees | What the operator can conclude |
| --- | --- | --- |
| Write the scratch report under operation `write-42`, using the current lease generation | The permit is active and matches the operation and target. The wrapper consumes it and calls the writer. | A successful tool result supports that the writer returned successfully. |
| Repeat `write-42` with the already-spent permit | The stored status is consumed. | The same permit cannot authorize a second callback. |
| Try the same permit after a change of lease generation, before it has been spent | The live lease no longer validates the permit. | The wrapper has no valid permission to run the callback. |
| Stop after consume, before the caller sees a tool outcome | The row can show consumed while the tool outcome is unknown. | Read back the target or consult the effect's receipt before deciding what to do next. |

<figure id="permit-use-flow" class="story-flow" data-policy-flow><h3>Where the permit is spent</h3><div class="flow-desktop"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 137" role="img" aria-label="A typed request is checked against current authority. One successful consume precedes the concrete tool callback. Observe the tool result separately."><defs><pattern id="grid-wide" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arrow-wide" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="#a78bfa"/></marker></defs><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#grid-wide)"/><path class="flow-motion" data-flow-edge d="M119 51H260" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" marker-end="url(#arrow-wide)" fill="none"/><path class="flow-motion" data-flow-edge d="M309 51H451" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" marker-end="url(#arrow-wide)" fill="none"/><path class="flow-motion" data-flow-edge d="M499 51H642" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" marker-end="url(#arrow-wide)" fill="none"/><g transform="translate(95 51)"><circle r="22" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><rect x="-10" y="-13" width="20" height="26" rx="2"/><path d="M-4-4H4M-4 2H4"/></g></g><g font-family="system-ui" text-anchor="middle"><text x="95" y="91" fill="#e9eaee" font-size="14">Typed request</text><text x="95" y="107" fill="#aab0bc" font-size="11.5">One effect and target</text></g><g transform="translate(285 51)"><circle r="22" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-11-9H11V10H-11Z M-5 0L-1 5L6-3"/></g></g><g font-family="system-ui" text-anchor="middle"><text x="285" y="91" fill="#e9eaee" font-size="14">Permit check</text><text x="285" y="107" fill="#aab0bc" font-size="11.5">Current lease and scope</text></g><g transform="translate(475 51)"><circle r="22" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><circle r="9"/><path d="M-5 0H5"/></g></g><g font-family="system-ui" text-anchor="middle"><text x="475" y="91" fill="#e9eaee" font-size="14">Consume permit</text><text x="475" y="107" fill="#aab0bc" font-size="11.5">Record one use</text></g><g transform="translate(665 51)"><circle r="22" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-9-8H9V9H-9Z M-4 0L0 4L5-3"/></g></g><g font-family="system-ui" text-anchor="middle"><text x="665" y="91" fill="#e9eaee" font-size="14">Tool callback</text><text x="665" y="107" fill="#aab0bc" font-size="11.5">Observe the outcome</text></g></svg></div><div class="flow-mobile"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 330" role="img" aria-label="A typed request is checked against current authority. One successful consume precedes the concrete tool callback. Observe the tool result separately."><defs><pattern id="grid-mobile" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arrow-mobile" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="#a78bfa"/></marker></defs><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#grid-mobile)"/><path class="flow-motion" data-flow-edge d="M38 69V98" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" marker-end="url(#arrow-mobile)" fill="none"/><path class="flow-motion" data-flow-edge d="M38 145V174" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" marker-end="url(#arrow-mobile)" fill="none"/><path class="flow-motion" data-flow-edge d="M38 221V259" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" marker-end="url(#arrow-mobile)" fill="none"/><g transform="translate(38 46)"><circle r="22" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><rect x="-10" y="-13" width="20" height="26" rx="2"/><path d="M-4-4H4M-4 2H4"/></g></g><g font-family="system-ui" text-anchor="start"><text x="72" y="38" fill="#e9eaee" font-size="14">Typed request</text><text x="72" y="54" fill="#aab0bc" font-size="11.5">One effect and target</text></g><g transform="translate(38 122)"><circle r="22" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-11-9H11V10H-11Z M-5 0L-1 5L6-3"/></g></g><g font-family="system-ui" text-anchor="start"><text x="72" y="114" fill="#e9eaee" font-size="14">Permit check</text><text x="72" y="130" fill="#aab0bc" font-size="11.5">Current lease and scope</text></g><g transform="translate(38 198)"><circle r="22" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><circle r="9"/><path d="M-5 0H5"/></g></g><g font-family="system-ui" text-anchor="start"><text x="72" y="190" fill="#e9eaee" font-size="14">Consume permit</text><text x="72" y="206" fill="#aab0bc" font-size="11.5">Record one use</text></g><g transform="translate(38 283)"><circle r="22" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-9-8H9V9H-9Z M-4 0L0 4L5-3"/></g></g><g font-family="system-ui" text-anchor="start"><text x="72" y="275" fill="#e9eaee" font-size="14">Tool callback</text><text x="72" y="291" fill="#aab0bc" font-size="11.5">Observe the outcome</text></g></svg></div><div class="flow-tools"><button type="button" data-flow-motion aria-pressed="false">Pause flow</button><button type="button" data-flow-expand>Expand diagram</button></div><figcaption>Dotted arrows show the successful path. The wrapper stops before the tool callback when authority rejects the consume. A consumed row does not confirm the outcome.</figcaption></figure>
<dialog data-flow-dialog aria-label="Expanded permit flow"><button type="button" data-flow-close>Close expanded diagram</button><div data-flow-expanded-content></div></dialog>
<script is:inline src="/images/blog/s5e19/flow-ui.js"></script>
<script is:inline src="/images/blog/s5e19/flow-motion.js"></script>

## Give the wrapper a typed job

Moving the check next to a callback still leaves a question about what the callback is allowed to do. A typed request describes a specific kind of operation with defined fields. The provider adapters checked that the normalized event came from the expected provider, represented the right stage and named the same effect as the protected request. The adapters handed the request to concrete sinks for a file write, a patch or a bounded Git operation. Other effects took distinct callbacks. The operation's shape belonged to the wrapper instead of being inferred from a general string of commands.

This is the file adapter's branch that stops when the controlled execution boundary is disabled. Its caller already resolved a target inside the sink's owned root and checked the effect and resource domain.

**Exact excerpt from the private implementation. `mutation_sinks.py` at `f9b044d0`, lines 88–92**

```python
        if not self._boundary.enabled:
            return ProtectedMutationBoundary._denial(request)
        return await self._boundary.execute(
            request, lambda: _atomic_write(target, content)
        )
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

1. Read the execution boundary's feature flag. This is the actual governed file sink's gate.
2. Return a denial if the boundary is disabled. No file-writing callback is invoked.
3. Otherwise call the protected execution wrapper and await the result.
4. Pass the typed request and a callable for the already-resolved target and content. Constructing the callable does not write the file.
5. Close the call. The returned result belongs to the wrapper that performs the final authorization check and invokes the callback.

</details>

A separate lifecycle change made a human pause revoke active leases and active permits in one transaction. It used a scope revision, a number that changes on each update, to reject a request prepared against old state. Resuming reopened admission and required new authority. I wanted that distinction because a pause is an operational decision. Reopening an intake route should leave the next grant visible as its own decision.

![An engineer walks outside a glasshouse past idle watering stations](/images/blog/s5e19/two.png)

<p class="caption">The operator can inspect the system before admitting a real operation. Conceptual illustration.</p>

## What passed and what remained switched off

The recovery report records a stale branch being rebuilt on current main. One correction aligned service readiness with the migration that created the operation-permit table. Earlier CI had exercised an integration suite and found a remaining assertion that expected the previous migration head. The change made the readiness decision depend on the schema the new path actually required. CI evidence and an admitted runtime remained separate.

| Evidence in the July records | What it supported | What remained outside the result |
| --- | --- | --- |
| Earlier verifier rejection, including the 1.022-second case | Exposed the host budget overrun and moved permit consumption next to the callback | Production latency and failure recovery |
| Recovery merge and required integration gates | The source and migration contract passed its reported candidate checks | Active enforcement on either provider host |
| 12 focused provider-adapter tests and 82 combined selected tests reported passing | Typed routing and denial behavior in the tested source slice | Two database-backed permit cases could not run on the workstation |
| Provider-adapter source merge `f9b044d0` | The wrappers were present in source main | Installation on Codex and Claude hosts, live permits and full recovery behavior |
| Pause/resume source and targeted checks | Revocation and read-model intent, with some local boundary coverage | A live migration or rollout of the new pause flow |

The reports were careful about the runtime. A source merge passed, flags stayed disabled, and the provider execution wrappers had yet to be installed on either host. One handover reports a healthy replacement service from a separate operational repair. That observation concerned the service the hosts could reach. It did not demonstrate that the new source was running or that a real agent write had passed through it.

## What I would keep

- Put the final authority check in the component that owns the concrete effect. Keep earlier hooks useful for description and admission without treating their decision as execution.
- Bind short-lived authority to a specific scope, operation, resource and generation. Record the consumed state and the outcome separately.
- Name synthetic capabilities so a protocol test cannot be read as a deployment receipt.
- Make pause revoke old authorization. Treat resume as fresh admission.
- Test crash and retry behavior at the boundary where results can be ambiguous. A green adapter suite supports the cases it exercised.

The retained follow-up moved the typed request toward the host daemon. That introduced another boundary to review. The local client needed a way to ask for a specific effect while the daemon retained the lease authority and recognized the correct working environment. The subsequent work began to make that handoff explicit.

<details class="glossary" data-glossary><summary>Glossary and primary references</summary><div class="glossary-tools" hidden><label>Find a term <input type="search" aria-label="Search glossary"></label><button type="button">Clear</button><p role="status"></p></div><section class="glossary-term"><h3>Lease</h3><p>Time-limited authority for a scoped piece of work.</p><a href="#match-the-permit-to-one-operation-and-one-resource">Primary reference</a></section><section class="glossary-term"><h3>Permit</h3><p>One-use authority for one named operation.</p><a href="#the-hook-was-a-tempting-place-to-spend-the-permit">Primary reference</a></section><section class="glossary-term"><h3>Fencing epoch</h3><p>Lease generation used to distinguish current authority from a prior grant.</p><a href="#match-the-permit-to-one-operation-and-one-resource">Primary reference</a></section><section class="glossary-term"><h3>Consume</h3><p>Record the authorization as spent before invoking the tool.</p><a href="#match-the-permit-to-one-operation-and-one-resource">Primary reference</a></section><section class="glossary-term"><h3>Sink</h3><p>The concrete component that performs the state change.</p><a href="#give-the-wrapper-a-typed-job">Primary reference</a></section><section class="glossary-term"><h3>Row lock</h3><p>A database lock that serializes conflicting operations on a row.</p><a href="https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS">Primary reference</a></section><section class="glossary-term"><h3>Row security</h3><p>Database policy that limits which rows a role can access.</p><a href="https://www.postgresql.org/docs/current/ddl-rowsecurity.html">Primary reference</a></section></details>

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
<script is:inline src="/images/blog/s5e19/reader.js"></script>
