---
title: "A Checkpoint Is an Intake Receipt"
description: "A July shadow pilot put agent handovers through a bounded intake path. One candidate reached quarantine, while retries and a scrape alert exposed what that success could prove."
pubDatetime: 2026-07-26T00:00:00Z
shippingDatetime: 2026-11-25T00:00:00Z
draft: false
author: Ryan Duffy
episode: 17
series: "Season 5: Rootweaver"
image: /images/blog/s5e17/hero.png
tags: [rootweaver, codex, reliability, memory]
---

The dropped-work audit showed how much could depend on one closing action. A push, a ticket update or a review might be all that separated the code on disk from work the next session could pick up. The obvious answer was to capture more of each session. The harder question was what I would trust the next session to read back.

In late July I designed a small trial around that question. I wanted Codex sessions to leave evidence that could survive a change of context. A long conversation contains useful decisions alongside guesses, retries and instructions copied from other places. Importing it wholesale would move all those things into another system and hand the next session the same sorting job. The pilot was meant to produce bounded, attributable candidate facts and give me a way to judge whether they were worth keeping.

![The engineer places one parcel at an intake counter with an archive behind glass](/images/blog/s5e17/hero.png)

<p class="caption">One intake slot opens for the new checkpoint. Older material stays separate. Conceptual illustration.</p>

## Keep the closing turn out of the upload path

The first decision was when to capture. A session-end hook looks like an obvious place to write a handover. It is close to the event, and the runner can point it toward the conversation file. The July evidence review found a weak fit for synchronous upload. A hook could stop early, its inputs could change with the harness, and a slow network would make the closing turn wait for a second system to acknowledge the handover.

I used a local scanner on a ten-minute interval as the authority for capture. A hook could signal something interesting, such as an approaching context compaction, while the background process owned finding eligible files, deciding whether they changed and dealing with failures. OpenAI's [Codex hooks documentation](https://developers.openai.com/codex/hooks) explains how hooks are triggered. The July record describes the design decision and the scanner in use. It does not establish that every proposed marker hook was installed or fired.

There was also an assumption hiding in the scheduler. Having a script that runs in an interactive shell does not establish that it will run under macOS's background job manager, `launchd`. The operational baseline records that we changed the job to point explicitly at the Homebrew Python interpreter. The retained change is one line in the property list, the configuration file the scheduler reads. After the change the historical report observed a loaded job and a successful first run. That was evidence that the launcher worked in that environment. Scheduled-job exit status and per-checkpoint outcomes remained different signals.

## Installing the scanner should leave the archive alone

A fresh scanner has no record of which sessions it has seen. If an absent cursor entry means “new,” the first scan could make the whole archive look eligible. I wanted the default installation to start with today’s work while explicitly accounting for the files that were already there.

The baseline operation therefore made a record of existing content without uploading it. The local state pairs each known session path with a hash, a fingerprint of the content, and a status. The initial baseline report recorded 630 entries. Those were deliberately held out of the pilot sample. The later handover recorded a different moving-state count. These are two observations of a changing cursor, and the records do not supply a row-by-row reconciliation.

**Exact source excerpt. `scripts/codex_memory_capture.py` at `3ca2fe39`, lines 226–232**

```python
        state["sessions"][str(path)] = {
            "checkpoint_hash": checkpoint.transcript_sha256,
            "retry_count": 0,
            "status": "baselined_not_uploaded",
        }
        seeded += 1
    _write_state(config.state_path, state)
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

1. Use the path as the local lookup key for this session record.
2. Store the fingerprint of the version already on the machine.
3. Start with zero failed upload attempts because this is a baseline operation.
4. Give the entry a status that explicitly records that no upload took place.
5. Close the state entry.
6. Count one newly baselined record.
7. Save the resulting local state after processing the inputs.

</details>

The normal scan compared the content it found with that stored hash. If it matched and there was no retry in progress, that pass recorded an unchanged result. For a changed version, the path still had to satisfy the scanner’s eligibility checks. The retained source checks whether a retry is due and, in the ordinary path, whether the session is idle or carries a pre-compaction signal. A dry run exits before the upload call.

**Illustrative scanner input and outcome.** Suppose session A is in the cursor with fingerprint `a1`. A scan sees `a1` again and can skip it. The next time it sees `a2`, it knows this is a different version. If the conversation is still active and there is no pre-compaction signal, the scan records the active outcome. Once eligible, the upload can be attempted. If the request fails, a retry record retains the fingerprint, attempt count and earliest retry time. An unchanged fingerprint on that next pass cannot by itself suppress a pending retry.

This matters for both privacy and budgeting. Installing a capture feature should not be the same decision as importing historical sessions. The cursor gave the installer a way to separate those decisions and let us examine future checkpoints as a small, observable cohort.

![The engineer sends an envelope through a designated records hatch](/images/blog/s5e17/one.png)

<p class="caption">The intake hatch and the downstream review area have different jobs. Conceptual illustration.</p>

## The write boundary should have one job

The next choice was where to send an eligible checkpoint. Reusing the existing retrieval gateway would have avoided adding another service. That gateway was already a broad query surface with service credentials and routes that the capture feature did not need. I chose a dedicated capture gateway. Its job was to authenticate and bound the intake, extract against a restricted contract and submit the resulting envelope to the broker.

The raw conversation was present on the Mac and crossed into the capture gateway for processing. The narrower downstream promise was about what we wrote to the memory pipeline. At the point of extraction the gateway scrubbed the input, passed the redacted version to the extractor and validated the returned facts. A repository inspection shows how the durable envelope was built from the session and time identifiers, transcript fingerprint and byte count, structured facts and server metadata. The journal payload deliberately omitted the transcript body. That is a property of this path and contract. It does not prove the extracted facts were automatically correct, complete, safe to promote, or free of all sensitive content.

The engineering tradeoff was where to put authority after intake. The capture gateway was allowed to submit only to an ingress topic. A topic is a named stream of events in [Apache Kafka](https://kafka.apache.org/42/getting-started/introduction/). The downstream scope stamper assigned trusted ownership from server-side rules. The writer persisted the result under the quarantine policy. Quarantine meant the result was isolated from ordinary retrieval pending a review decision. The client supplied evidence about the session. It did not get to decide who could retrieve the result or apply it as memory.

<figure id="checkpoint-flow" class="story-flow" data-policy-flow><h3>From checkpoint to quarantine</h3><div class="flow-desktop"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 137" role="img" aria-label="The local scanner sends eligible input to the gateway. The gateway produces a structured event to Kafka. Trusted scope is applied downstream before persistence in quarantine."><defs><pattern id="grid-wide" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arrow-wide" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="#a78bfa"/></marker></defs><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#grid-wide)"/><path class="flow-motion" data-flow-edge d="M119 51H260" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" marker-end="url(#arrow-wide)" fill="none"/><path class="flow-motion" data-flow-edge d="M309 51H451" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" marker-end="url(#arrow-wide)" fill="none"/><path class="flow-motion" data-flow-edge d="M499 51H642" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" marker-end="url(#arrow-wide)" fill="none"/><g transform="translate(95 51)"><circle r="22" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><rect x="-10" y="-13" width="20" height="26" rx="2"/><path d="M-5-5H5M-5 0H5M-5 5H2"/></g></g><g font-family="system-ui" text-anchor="middle"><text x="95" y="91" fill="#e9eaee" font-size="14">Local scanner</text><text x="95" y="107" fill="#aab0bc" font-size="11.5">Eligible checkpoint</text></g><g transform="translate(285 51)"><circle r="22" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><circle cy="-10" r="3"/><circle cy="10" r="3"/><circle cx="12" cy="-5" r="3"/><path d="M0-7V7M0 4Q12 4 12-2"/></g></g><g font-family="system-ui" text-anchor="middle"><text x="285" y="91" fill="#e9eaee" font-size="14">Capture gateway</text><text x="285" y="107" fill="#aab0bc" font-size="11.5">Redact and extract</text></g><g transform="translate(475 51)"><circle r="22" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><rect x="-13" y="-10" width="26" height="18" rx="2"/><path d="M-10 1H-6L-3-4L2 5L5 0H10M-5 13H5"/></g></g><g font-family="system-ui" text-anchor="middle"><text x="475" y="91" fill="#e9eaee" font-size="14">Kafka broker</text><text x="475" y="107" fill="#aab0bc" font-size="11.5">Acknowledge ingress</text></g><g transform="translate(665 51)"><circle r="22" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-12-10H12V12H-12ZM-7 1L-1 7L8-4"/></g></g><g font-family="system-ui" text-anchor="middle"><text x="665" y="91" fill="#e9eaee" font-size="14">Scoped writer</text><text x="665" y="107" fill="#aab0bc" font-size="11.5">Persist in quarantine</text></g></svg></div><div class="flow-mobile"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 330" role="img" aria-label="The local scanner sends eligible input to the gateway. The gateway produces a structured event to Kafka. Trusted scope is applied downstream before persistence in quarantine."><defs><pattern id="grid-mobile" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arrow-mobile" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="#a78bfa"/></marker></defs><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#grid-mobile)"/><path class="flow-motion" data-flow-edge d="M38 69V98" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" marker-end="url(#arrow-mobile)" fill="none"/><path class="flow-motion" data-flow-edge d="M38 145V174" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" marker-end="url(#arrow-mobile)" fill="none"/><path class="flow-motion" data-flow-edge d="M38 221V259" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" marker-end="url(#arrow-mobile)" fill="none"/><g transform="translate(38 46)"><circle r="22" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><rect x="-10" y="-13" width="20" height="26" rx="2"/><path d="M-5-5H5M-5 0H5M-5 5H2"/></g></g><g font-family="system-ui" text-anchor="start"><text x="72" y="38" fill="#e9eaee" font-size="14">Local scanner</text><text x="72" y="54" fill="#aab0bc" font-size="11.5">Eligible checkpoint</text></g><g transform="translate(38 122)"><circle r="22" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><circle cy="-10" r="3"/><circle cy="10" r="3"/><circle cx="12" cy="-5" r="3"/><path d="M0-7V7M0 4Q12 4 12-2"/></g></g><g font-family="system-ui" text-anchor="start"><text x="72" y="114" fill="#e9eaee" font-size="14">Capture gateway</text><text x="72" y="130" fill="#aab0bc" font-size="11.5">Redact and extract</text></g><g transform="translate(38 198)"><circle r="22" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><rect x="-13" y="-10" width="26" height="18" rx="2"/><path d="M-10 1H-6L-3-4L2 5L5 0H10M-5 13H5"/></g></g><g font-family="system-ui" text-anchor="start"><text x="72" y="190" fill="#e9eaee" font-size="14">Kafka broker</text><text x="72" y="206" fill="#aab0bc" font-size="11.5">Acknowledge ingress</text></g><g transform="translate(38 283)"><circle r="22" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-12-10H12V12H-12ZM-7 1L-1 7L8-4"/></g></g><g font-family="system-ui" text-anchor="start"><text x="72" y="275" fill="#e9eaee" font-size="14">Scoped writer</text><text x="72" y="291" fill="#aab0bc" font-size="11.5">Persist in quarantine</text></g></svg></div><div class="flow-tools"><button type="button" data-flow-motion aria-pressed="false">Pause flow</button><button type="button" data-flow-expand>Expand diagram</button></div><figcaption>Dotted paths show direction. The broker receipt confirms ingress. Trusted scope stamping occurs after ingress and before the writer persists the quarantined fact.</figcaption></figure>
<dialog data-flow-dialog aria-label="Expanded checkpoint diagram"><button type="button" data-flow-close>Close expanded diagram</button><div data-flow-expanded-content></div></dialog>
<script is:inline src="/images/blog/s5e17/flow-ui.js"></script>
<script is:inline src="/images/blog/s5e17/flow-motion.js"></script>

## The receipt only reaches the broker

The upload client could hear back from the gateway before the downstream writer finished. That should be visible in the receipt. Otherwise an “uploaded” flag becomes easy to read as “stored” or even “ready to recall,” though the client observed none of those events.

**Exact source excerpt. `packages/memory-capture-gateway/src/memory_capture_gateway/main.py` at `3ca2fe39`, lines 240–250**

```python
        delivered = safe_produce(
            kafka_producer,
            INGRESS_TOPIC,
            json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8"),
            key=checkpoint_id.encode("utf-8"),
        )
        if not delivered:
            metrics.rejected_total.labels(reason="broker_unavailable").inc()
            raise HTTPException(status_code=503, detail="broker unavailable")

        broker_accepted_at = clock()
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

1. Ask the broker helper to produce one event and return a delivery result.
2. Pass the configured Kafka producer.
3. Target the designated ingress topic.
4. Serialise the structured payload into UTF-8 JSON.
5. Use the checkpoint ID as the Kafka message key.
6. Finish the produce call and receive its result.
7. Check whether the helper reported successful delivery.
8. Count a failure under the broker-unavailable reason when it did not.
9. Return an HTTP failure to the uploader instead of promising acceptance.
10. The blank line separates the failure exit from the success path.
11. Record the time at which the successful broker delivery is acknowledged to the caller.

</details>

The next lines return the checkpoint ID and broker-acceptance time. A broker receipt says the ingress event was accepted. I still need writer evidence to say it reached quarantine and a later policy decision to say it may be recalled. In the opposite direction, the client’s “retry scheduled” state does not identify which layer rejected or lost the request. The scanner collected multiple network and HTTP exceptions into one retry branch. It kept enough information to try later, but the July version lost the distinction needed for diagnosis.

An example of what the source did **not** allow me to conclude was that a negative receipt meant no downstream event could exist in every possible failure. A client can lose the response after the server has accepted a request. Stable identity and downstream reconciliation matter precisely because transport success and durable state can diverge. The draft’s source inspection establishes where the receipt is returned. The historical records do not establish that every ambiguous retry case was tested or resolved.

![A sealed paper packet sits beside open spaces on a train table](/images/blog/s5e17/two.png)

<p class="caption">An accepted item and an unresolved handover leave different evidence. Conceptual illustration.</p>

## One canary answered a narrow question

The late-July operational baseline reported one bounded canary, a small test event passed through the real path. The report counted one captured session, one provenance-only round and one quarantined fact. The provenance round anchored the checkpoint evidence. The fact remained in quarantine, and the report observed zero consumer lag at reconciliation. That was enough to establish an important first delivery path for that sample.

| July evidence | What it supported | What still needed evidence |
| --- | --- | --- |
| One session and one provenance-only round | The captured sample acquired durable provenance | Every candidate takes the same path under load |
| One quarantined fact, zero outside quarantine | Containment for the observed sample | Factual precision, recall and a promotion decision |
| 630 baseline records in the initial inspection | The archive was accounted for without turning it into a historical upload batch | A natural cohort of eligible new or changed sessions |
| Six retries in the later local snapshot | Some candidate attempts remained unresolved | Which boundary failed, whether a receipt existed, and how those attempts ended |
| Healthy workload and health endpoint, plus a firing scrape alert | Different observation paths gave different answers | Whether the monitoring collector could reach the scrape target |

That last row is familiar from the earlier ingestion story. A process can be ready and a request can succeed over one route while a monitor fails over another. The later handover records a successful health endpoint and a failing Prometheus scrape target. [Prometheus’s jobs and instances documentation](https://prometheus.io/docs/concepts/jobs_instances/) explains how a monitored endpoint gets its own scrape status. The handover treated the discrepancy as a separate networking and discovery question. It did not give me a reason to reclassify it as a confirmed failure of the capture path or to say the alert was fixed.

## Deployment came before the quality decision

I directed the trial toward a small natural sample of new or changed sessions. Agents helped implement the scanner, gateway and evaluation tools. My decision was that a working transport would earn a quality review, with any move into ordinary memory requiring a separate decision. The report planned a cohort of 10 to 20 sessions. It did not claim it collected and labelled that cohort.

Precision asks what share of extracted facts a human considers correct. Recall asks what share of the reference facts the extractor found. Duplicate rate and review time matter because a system can retrieve useful facts while still costing more human work than the handovers it replaces. The retained evaluator also computes uncertainty for observed proportions. As an illustration, four correct candidates out of five would be 80 percent precision for that tiny labelled example. The evaluator’s Wilson interval is about 38 to 96 percent. That width is a useful reminder of how easy it is to overread a small sample. The four-out-of-five example is explanatory arithmetic and was never an observed pilot result.

The July record kept the proposal stage blocked as well. The existing review credential could apply decisions. Putting a “proposal-only” label on a process that used it would leave the process with the power to do more. A separate identity and authority boundary had to be designed before automatic proposals could be considered. That is an architectural lesson I could carry forward even while extraction quality was still an open question.

## What I would keep

- Start the scanner from a deliberate baseline. Treat a historical import as its own decision, with its own scope and evidence.
- Give acknowledgements names that match the boundary they prove. Broker acceptance, writer persistence, quarantine and approval describe different events.
- Preserve retry context in a form that supports diagnosis without exposing the conversation. A retry timestamp can be enough for scheduling and still be insufficient for investigation.
- Make the first quality decision from a reviewed sample. Keep uncertain evidence visible enough that a small canary cannot silently become a permission to promote.

The next engineering records ask a closely related question. If a later agent can recover evidence of what happened, how should the system decide which agent is allowed to act on the work? The following work began to put ownership and the right to make changes behind a separate control-plane boundary.

<details class="glossary" data-glossary><summary>Glossary and primary references</summary><div class="glossary-tools" hidden><label>Find a term <input type="search" aria-label="Search glossary"></label><button type="button">Clear</button><p role="status"></p></div><section class="glossary-term"><h3>Hook</h3><p>A command triggered by a harness event.</p><a href="https://developers.openai.com/codex/hooks">Primary reference</a></section><section class="glossary-term"><h3>Checkpoint</h3><p>A versioned capture of eligible session evidence.</p><a href="https://developers.openai.com/codex/hooks">Primary reference</a></section><section class="glossary-term"><h3>Content hash</h3><p>A fingerprint of specific bytes.</p><a href="https://docs.python.org/3/library/hashlib.html">Primary reference</a></section><section class="glossary-term"><h3>Kafka topic</h3><p>A named broker stream used to move events between components.</p><a href="https://kafka.apache.org/42/getting-started/introduction/">Primary reference</a></section><section class="glossary-term"><h3>Broker acceptance</h3><p>An observed publish acknowledgement, separate from consumption and downstream storage.</p><a href="https://kafka.apache.org/42/javadoc/org/apache/kafka/clients/producer/KafkaProducer.html">Primary reference</a></section><section class="glossary-term"><h3>Quarantine</h3><p>Pilot isolation from ordinary retrieval while a candidate awaits a separate policy decision.</p><a href="#the-write-boundary-should-have-one-job">Primary reference</a></section><section class="glossary-term"><h3>Scrape target</h3><p>An endpoint a Prometheus instance attempts to collect metrics from.</p><a href="https://prometheus.io/docs/concepts/jobs_instances/">Primary reference</a></section></details>

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
<script is:inline src="/images/blog/s5e17/reader.js"></script>
