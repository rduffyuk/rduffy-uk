---
title: "A Green Run Didn't Clear the Alert"
description: "A successful debug job did not establish recovery of the scheduled quality-scoring pipeline. The repair needed the right identity, a recovery window and controller-owned evidence."
pubDatetime: 2026-07-16T18:00:00Z
draft: false
author: Ryan Duffy
episode: 14
image: /images/blog/s5e14/hero-A.png
series: "Season 5: Rootweaver"
tags: [Rootweaver, Observability, Kubernetes, Reliability]
---

Episode 13 ended with a repaired implementation and an experiment that still did not justify its rollout. The next investigation put a similar distinction into an operational setting. A quality-scoring job could finish successfully without satisfying the condition behind the alert that had brought it to my attention.

I needed a dependable daily quality signal, and a recovery check that tested the system actually responsible for producing it. The July investigation found a failed upstream read, a small retry budget and a misleadingly reassuring manual result. Recovering the scorer meant following those states through the application, the Job and its CronJob controller.

![The engineer holds a working hand signal lamp inside a dark railway signal cabin while a separate mechanical dispatch register remains unattended.](/images/blog/s5e14/hero-A.png)

<p class="caption">A working hand signal does not establish that the scheduled dispatch system recorded a successful departure. Conceptual illustration.</p>

This chapter covers **16 July 2026**. It is a curated reconstruction from an investigation handover, a recovery report, and retained scorer, alert and GitOps source. I owned direction and review; agents assisted with investigation, implementation and verification. The live observations below remain attributed historical reports. The new examples inspect source and calculate illustrative states; they do not rerun the original jobs or reconstruct the complete native sessions.

## Start with what the warning actually measured

The work was recorded as **VW-1317 — QualityLens scorer retry and recovery**. The alert concerned a scheduled pipeline that had stopped recording success. It was not a verdict that the model's answers had suddenly become worse.

The historical rule compared two CronJob timestamps: its latest scheduling time and its latest recognised successful completion. The retained expression was:

<p class="code-source">alert-rules.yaml · DataPipelineCronJobNotSucceeding · GitOps de2cd074 · exact historical expression</p>

```promql
(kube_cronjob_status_last_schedule_time{namespace=~"rootweaver|rw-.*"}
 - kube_cronjob_status_last_successful_time{namespace=~"rootweaver|rw-.*"}) > 14400
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- The first metric supplies the CronJob's most recent scheduling timestamp.
- The second supplies its recorded successful-completion timestamp.
- Subtraction produces a difference measured in seconds.
- The namespace filters select the same platform namespace pattern on both sides.
- The threshold is 14,400 seconds, or four hours. This expression compares the two recorded times; it is not the same calculation as the current time minus the last success.

</details>

The rule also used `for: 1h`. That required its condition to persist before the alert fired. The [Prometheus authors' alerting-rule documentation](https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/) explains this pending period. It is a separate duration from the four-hour difference inside the expression.

This distinction gave the investigation a concrete acceptance question: had the CronJob's success state advanced? A healthy service endpoint, a fresh application log and a successful standalone Job could each be useful observations without answering that question.

## The scorer failed before it could assess an answer

Quality Lens read model generations from Langfuse, selected eligible outputs and sent them to a local judge. The intended output was a quality score attached to a generation. Fetching the generations was a dependency before any of that judging could happen.

The investigation handover attributes the morning failure to an unhandled `httpcore.ReadTimeout` while reading Langfuse observations. It also reports instability in `langfuse-web`, including repeated restarts. Those are the historical diagnosis and operational observations; this reconstruction has no original complete request trace with which to independently re-establish the upstream failure.

The retained Python makes the failure boundary visible. `score_recent` fetches pages through `langfuse.api.observations.get_many`. That read does not sit inside the per-generation judge-error handler. If it raises, execution can leave the scoring function before the normal completion log and subsequent metrics push.

A different failure path was deliberately softer: `judge_generation` caught a judge exception and returned no score, allowing the loop to count an error and continue. These behaviours belong to different stages. Handling a failed judge call did not automatically handle a failed attempt to fetch the work in the first place.

The historical Job had `backoffLimit: 1`, and the report says that budget was exhausted. I would not translate that field into a claim that exactly one container attempt occurred. The retained template used `restartPolicy: OnFailure`; Kubernetes counts retries in relation to both Job and container state. The [Kubernetes Job documentation](https://kubernetes.io/docs/concepts/workloads/controllers/job/#pod-backoff-failure-policy) explains why the field needs that context.

## The first debug copy changed the conditions

Before a successful debug run was obtained, the investigation encountered a second problem. Its copied workload needed the same pod label as the scorer: `app: quality-lens-scorer`.

That label selected the scorer's permitted network egress. The namespace also had a default-deny policy and a separate DNS allowance. A copy could therefore resolve a hostname while still lacking permission to contact the service behind it.

<p class="code-source">network-policies.yaml · quality-lens-scorer-policy selector · GitOps de2cd074 · exact historical excerpt</p>

```yaml
podSelector:
  matchLabels:
    app: quality-lens-scorer
policyTypes:
  - Egress
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- `podSelector` identifies the pods to which this policy applies.
- `matchLabels` requires the specified key and value to be present.
- `app: quality-lens-scorer` is the workload identity used by this selector.
- `Egress` makes this a policy about outgoing connections. The following rules in the retained file permit the relevant service destinations.
- This label determines policy selection. It does not declare which CronJob owns a Job.

</details>

The handover reports fast connection refusals from the incorrectly labelled probes, followed by a successful labelled debug job. It attributes the refusal to the network-policy path. There is no recovered packet capture here, and the symptom should not become a universal rule that policy denial always looks like connection refusal. [Kubernetes' NetworkPolicy reference](https://kubernetes.io/docs/concepts/services-networking/network-policies/) describes the policy model; the historical response remains the handover's observation.

The useful lesson was experimental: a copied workload must preserve the identity relevant to the boundary being tested. A failed probe with different access rules can diagnose the copy rather than the original failure.

![In a subterranean pump room, the engineer checks a pressure gauge fitted to the correct brass connection while a similar unattached gauge rests nearby.](/images/blog/s5e14/inline-1.png)

<p class="caption">The test needs the correct connection and identity before its result can explain the production path. Conceptual illustration.</p>

## A label and an owner reference answered different questions

The labelled debug job exited successfully. That established that this probe could reach its dependencies and finish at that checkpoint. It did not make the probe a child of the CronJob whose status the alert watched.

A pod label can select network policy. A Job's controller owner reference connects it to the parent controller. Similar names and matching labels are not a substitute for that relationship. The [Kubernetes ownership documentation](https://kubernetes.io/docs/concepts/overview/working-with-objects/owners-dependents/) distinguishes ownership from label selection.

For an independently inspectable example, the [upstream Kubernetes v1.34 CronJob controller](https://github.com/kubernetes/kubernetes/blob/v1.34.0/pkg/controller/cronjob/cronjob_controllerv2.go) selects Jobs through their controller reference and processes successful completion times for those children. This is a pinned explanatory source, not proof of the exact controller binary running in the July cluster.

Here is a synthetic summary of the manual-probe case, not an original Kubernetes response or a deployable manifest:

```json
{
  "pod_label_matches_policy": true,
  "job_has_cronjob_controller_reference": false,
  "job_succeeded": true,
  "cronjob_success_record_advanced": false
}
```

The first field explains why the repaired probe could make its outgoing calls. The second explains why that successful probe did not establish parent-controller recovery. The final two fields can both be true without a contradiction: the application completed, while the CronJob's recorded success remained unchanged.

<figure id="mechanism" class="story-flow" data-policy-flow><h3>Which success reaches the alert?</h3><div class="flow-desktop"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 740 270" role="img" aria-label="A successful Job updates CronJob success only through its controller ownership; an unowned manual probe leaves parent status unchanged."><defs><pattern id="grid-e14d" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arrow-e14d" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="#a78bfa"/></marker></defs><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#grid-e14d)"/><path data-flow-edge class="flow-motion" d="M85 46H225" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e14d)"/><path data-flow-edge class="flow-motion" d="M275 46H415" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e14d)"/><path data-flow-edge class="flow-motion" d="M465 46H625" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e14d)"/><path data-flow-edge class="flow-motion" d="M275 46H330V195H275" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e14d)"/><text x="345" y="28" text-anchor="middle" fill="#c4b5fd" font-size="11" font-family="system-ui">owned</text><text x="345" y="160" fill="#c4b5fd" font-size="11" font-family="system-ui">unowned</text><g transform="translate(60 46)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><rect x="-12" y="-13" width="24" height="26" rx="3"/><path d="M-7 0L-1 6L9-6"/></g></g><text x="60" y="94" text-anchor="middle" font-size="12.5" font-family="system-ui" fill="#e9eaee">Job completes</text><text x="60" y="114" text-anchor="middle" font-size="10.5" font-family="system-ui" fill="#aab0bc">Application result</text><g transform="translate(250 46)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-2-8L2-12A7 7 0 0 1 12-2L8 2M2 8L-2 12A7 7 0 0 1-12 2L-8-2M-6 6L6-6"/></g></g><text x="250" y="94" text-anchor="middle" font-size="12.5" font-family="system-ui" fill="#e9eaee">Owner check</text><text x="250" y="114" text-anchor="middle" font-size="10.5" font-family="system-ui" fill="#aab0bc">Controller reference?</text><g transform="translate(440 46)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><rect x="-13" y="-11" width="26" height="23" rx="2"/><path d="M-13-4H13M-7-15V-8M7-15V-8M-7 4L-2 9L8-1"/></g></g><text x="440" y="94" text-anchor="middle" font-size="12.5" font-family="system-ui" fill="#e9eaee">CronJob status</text><text x="440" y="114" text-anchor="middle" font-size="10.5" font-family="system-ui" fill="#aab0bc">Owned success recorded</text><g transform="translate(650 46)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-10 7H10L7 1V-5A7 7 0 0 0-7-5V1ZM-3 12H3"/></g></g><text x="650" y="94" text-anchor="middle" font-size="12.5" font-family="system-ui" fill="#e9eaee">Alert reads status</text><text x="650" y="114" text-anchor="middle" font-size="10.5" font-family="system-ui" fill="#aab0bc">Schedule minus success</text><g transform="translate(250 195)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><circle r="10" cx="-2" cy="-2"/><path d="M5 5L13 13M-7-2H3"/></g></g><text x="250" y="243" text-anchor="middle" font-size="12.5" font-family="system-ui" fill="#e9eaee">Manual probe</text><text x="250" y="263" text-anchor="middle" font-size="10.5" font-family="system-ui" fill="#aab0bc">Parent stays unchanged</text><text x="370" y="184" fill="#e9eaee" font-size="13" font-family="system-ui">Manual success can prove an application path.</text><text x="370" y="206" fill="#aab0bc" font-size="12" font-family="system-ui">It does not advance an unrelated parent record.</text></svg></div><div class="flow-mobile"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 520" role="img" aria-label="A successful Job updates CronJob success only through its controller ownership; an unowned manual probe leaves parent status unchanged."><defs><pattern id="grid-e14m" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arrow-e14m" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="#a78bfa"/></marker></defs><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#grid-e14m)"/><path data-flow-edge class="flow-motion" d="M48 69V129" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e14m)"/><path data-flow-edge class="flow-motion" d="M48 179V319" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e14m)"/><path data-flow-edge class="flow-motion" d="M48 369V429" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e14m)"/><path data-flow-edge class="flow-motion" d="M73 154H82V205H235V215" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" fill="none" marker-end="url(#arrow-e14m)"/><text x="76" y="267" fill="#c4b5fd" font-size="11" font-family="system-ui">owned</text><text x="151" y="193" fill="#c4b5fd" font-size="11" font-family="system-ui">unowned</text><g transform="translate(48 44)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><rect x="-12" y="-13" width="24" height="26" rx="3"/><path d="M-7 0L-1 6L9-6"/></g></g><text x="90" y="42" text-anchor="start" font-size="12.5" font-family="system-ui" fill="#e9eaee">Job completes</text><text x="90" y="62" text-anchor="start" font-size="10.5" font-family="system-ui" fill="#aab0bc">Application result</text><g transform="translate(48 154)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-2-8L2-12A7 7 0 0 1 12-2L8 2M2 8L-2 12A7 7 0 0 1-12 2L-8-2M-6 6L6-6"/></g></g><text x="90" y="152" text-anchor="start" font-size="12.5" font-family="system-ui" fill="#e9eaee">Owner check</text><text x="90" y="172" text-anchor="start" font-size="10.5" font-family="system-ui" fill="#aab0bc">Controller reference?</text><g transform="translate(48 344)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><rect x="-13" y="-11" width="26" height="23" rx="2"/><path d="M-13-4H13M-7-15V-8M7-15V-8M-7 4L-2 9L8-1"/></g></g><text x="90" y="342" text-anchor="start" font-size="12.5" font-family="system-ui" fill="#e9eaee">CronJob status</text><text x="90" y="362" text-anchor="start" font-size="10.5" font-family="system-ui" fill="#aab0bc">Owned success recorded</text><g transform="translate(48 454)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-10 7H10L7 1V-5A7 7 0 0 0-7-5V1ZM-3 12H3"/></g></g><text x="90" y="452" text-anchor="start" font-size="12.5" font-family="system-ui" fill="#e9eaee">Alert reads status</text><text x="90" y="472" text-anchor="start" font-size="10.5" font-family="system-ui" fill="#aab0bc">Schedule minus success</text><g transform="translate(235 240)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><circle r="10" cx="-2" cy="-2"/><path d="M5 5L13 13M-7-2H3"/></g></g><text x="235" y="288" text-anchor="middle" font-size="12.5" font-family="system-ui" fill="#e9eaee">Manual probe</text><text x="235" y="308" text-anchor="middle" font-size="10.5" font-family="system-ui" fill="#aab0bc">Parent stays unchanged</text></svg></div><div class="flow-tools"><button type="button" data-flow-motion aria-pressed="false">Pause flow</button><button type="button" data-flow-expand>Expand diagram</button></div><figcaption>Simplified explanation of the ownership boundary. Moving dots show direction, not measured traffic or a replay of the incident.</figcaption></figure><dialog data-flow-dialog aria-label="Expanded ownership diagram"><button type="button" data-flow-close>Close expanded diagram</button><div data-flow-expanded-content></div></dialog><script is:inline src="/images/blog/s5e14/flow-ui.js"></script><script is:inline src="/images/blog/s5e14/flow-motion.js"></script><script is:inline src="/images/blog/s5e14/flow-ui.js"></script><script is:inline src="/images/blog/s5e14/flow-motion.js"></script>

## Follow one failure through the alert calculation

Use relative hours to make the distinction concrete. Suppose the previous recognised success is at hour zero. The next scheduled run starts at hour 24 and fails. A manual debug job then succeeds at hour 27. Later, an owned verification job completes at hour 28.

| Illustrative checkpoint | Last schedule | CronJob's last success | Difference used by the expression |
|---|---:|---:|---:|
| New scheduled run fails | 24 h | 0 h | 24 h |
| Unowned manual debug job succeeds | 24 h | 0 h | 24 h |
| Owned completion is recognised | 24 h | 28 h | −4 h |

This is new explanatory arithmetic, not the original incident's timestamps. The manual success does not change the calculation because it does not change the parent field. Once the later owned success is recognised, the difference is no longer above four hours. The expression can become false even though that verification completion occurred after the most recent scheduling timestamp.

The example also limits the conclusion. Advancing the controller's success field is stronger recovery evidence than an unrelated green Job. It still does not prove that the next ordinary scheduled invocation will start and succeed. The required observation depends on which of those behaviours is being accepted.

## Short retries and another daily opportunity

The repair changed two operational settings. The Job's retry budget increased from `1` to `4`. The CronJob's single morning opportunity became a morning and evening schedule.

<p class="code-source">cronjob-after.yaml · CronJob timing · GitOps de2cd074 · exact historical excerpt</p>

```yaml
schedule: "0 7,19 * * *"
suspend: false
timeZone: "Europe/London"
concurrencyPolicy: Forbid
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- The schedule requests a run at 07:00 and 19:00 in the selected timezone.
- `suspend: false` leaves scheduling enabled.
- `Europe/London` gives those hours their local-time meaning rather than assuming a fixed UTC offset.
- `Forbid` prevents this CronJob from starting another concurrent Job while an earlier one remains active.
- These fields describe the requested controller behaviour. Their presence in Git does not, by itself, establish that the running cluster applied them.

</details>

Short retries and an evening opportunity addressed different interruption lengths. Several closely spaced attempts might outlast a brief read failure. They could all finish before an unstable upstream service recovered from a longer outage. The second scheduled opportunity spread recovery across the day.

The investigation estimated that the enlarged retry sequence still covered only a few minutes. That was operational reasoning in the report, not a guaranteed deadline derived solely from `backoffLimit`. Runtime, restart behaviour and controller timing remain relevant. The [Kubernetes CronJob documentation](https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/) also makes clear that scheduling has limitations; a cron expression is not an exactly-once execution guarantee.

![Inside a dark stone clock tower, the engineer adjusts two separate trigger pins on a mechanical timing drum beneath a narrow rain-streaked window.](/images/blog/s5e14/inline-2.png)

<p class="caption">A second opportunity later in the day covers a different interruption window from a few immediate retries. Conceptual illustration.</p>

## Re-running safely required a data contract

Adding another run would have been a poor recovery strategy if every overlap created duplicate scores or repeated all the expensive judging. The retained configuration kept a 26-hour lookback, so twelve-hourly runs intentionally examined overlapping work.

The Python used two protections. A pre-pass collected observation identifiers already carrying a quality score. The main loop then skipped those identifiers before considering an output for judging. Empty outputs were counted separately rather than assigned a fabricated zero-quality score.

<p class="code-source">quality_scorer.py · score_recent eligibility checks · platform d0347c3 · exact historical excerpt</p>

```python
gen_id = _attr(gen, "id")
if gen_id in already:
    stats.skipped_already += 1
    continue
output_text = _as_text(_attr(gen, "output"))
if not output_text.strip():
    stats.skipped_no_output += 1
    continue
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- `gen_id` identifies the generation currently being considered.
- Membership in `already` means the pre-pass found a quality score for that observation.
- The counter records why the generation was skipped, and `continue` moves to the next one.
- `_as_text` normalises the stored output into text.
- Stripping whitespace tests whether there is anything meaningful to judge.
- The final counter distinguishes missing output from an assessed answer. No score is written in this branch.

</details>

When an eligible output did receive a score, the write used a generation-derived identity:

<p class="code-source">quality_scorer.py · score_recent score write · platform d0347c3 · exact historical excerpt</p>

```python
langfuse.create_score(
    name="quality",
    value=score,
    trace_id=_attr(gen, "trace_id", "traceId"),
    observation_id=gen_id,
    score_id=f"quality-v1-{gen_id}",
    data_type="NUMERIC",
    comment=(reason or "")[:500],
)
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- The score is named `quality` and carries the judge's numeric value.
- The trace and observation identifiers link it to the work being assessed.
- The score identifier combines a fixed version prefix with the generation identifier. Reconsidering the same generation targets the same score identity.
- The data type declares the stored value numeric.
- The final field keeps a bounded explanation from the judge.
- This shows the application's repeat-write identity. It is not a recovered proof of every backend transaction or failure ordering.

</details>

In an ideal regular twelve-hour schedule, two 26-hour windows overlap by fourteen hours. That simple calculation explains why overlap was expected. It does not establish complete processing: the implementation also paginated its reads, and a record could become available outside the window. The repair improved recovery opportunities within the existing contract; it did not turn the scorer into an unbounded backlog processor.

## Zero new scores could be a healthy completion

Both reports contain a successful run with no newly created scores. The numbers describe different runs and should remain separate:

| Historical report | Fetched generations | No output | Already scored | Newly scored | Reported errors |
|---|---:|---:|---:|---:|---:|
| Labelled investigation probe | 148 | 116 | 32 | 0 | 0 |
| Owned verification in the recovery report | 82 | 50 | 32 | 0 | 0 |

The skip categories account for the fetched totals in each reported run. There was no remaining eligible output in those summaries. `scored=0` therefore did not mean the judge had rated the answers zero, nor did it establish that the scorer had failed to do its permitted work.

The converse also matters. The scorer could count a per-generation judging error and continue, and its metrics push was best-effort. A successful process exit was not a universal guarantee that every assessment and every metric delivery succeeded. The alert's controller-success condition, the scorer's completion counters and the meaning of a quality score were separate observations.

There were even two different success signals in the implementation. The application pushed its own run-success timestamp to the metrics gateway. The alert quoted above read the CronJob status exported by the cluster. A new application metric could be useful without changing the controller timestamp used by that particular alert.

## What the closeout actually established

The investigation handover preserved an interrupted checkpoint with the fix still listed as open. The recovery report and inspected GitOps commit establish the committed repair state. Their document clocks overlap, so they should not be treated as a complete, ordered session replay.

The closeout reports the changed schedule and retry budget applied to the cluster, a successful **CronJob-owned verification Job**, an advanced `lastSuccessfulTime`, and no firing series for the named alert. That is the reported recovery evidence. The retained Git diff independently confirms the requested settings changed; it cannot independently prove the historical live status.

I would keep the next acceptance boundary visible: the report does not supply a later ordinary scheduled run as a separate observation. Nor does the retry/schedule repair resolve the underlying `langfuse-web` instability or calibrate the judge's quality scores as correctness measurements. Those remain different pieces of engineering work.

## What I would carry into the next build

Follow an alert to the state it actually reads before changing its rule. Reproduce the relevant workload identity when building a debug copy, and distinguish network-policy labels from controller ownership.

Choose recovery evidence that matches the intended guarantee. A manual success can demonstrate a useful application path. An owned completion can exercise the parent status update. An ordinary later scheduled success would add another observation. Each earns its own conclusion.

Make overlapping recovery safe enough to be useful. Inspect eligibility, skip counters and stable write identities before increasing the frequency. Keep zero new work distinct from a zero-quality answer, and keep a green Job distinct from complete quality assurance.

The next records move to document ingestion, where a nightly deadline, an overloaded dependency and one troublesome document could hide behind the same warning. That is a separate chapter about clearing one failure boundary only to expose the next.

<details class="glossary" data-glossary><summary>Glossary and primary references</summary><div class="glossary-tools" hidden><label for="glossary-search">Find a term</label><div class="glossary-search-row"><input id="glossary-search" type="search"><button type="button">Clear</button></div><p role="status" aria-live="polite"></p></div><section class="glossary-term" id="term-cronjob"><h3>CronJob</h3><p>A Kubernetes controller that creates Jobs according to a schedule.</p><p><a href="https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/">Primary reference</a></p></section><section class="glossary-term" id="term-job"><h3>Job</h3><p>A workload object that tracks a task running toward completion. A separate manual Job need not belong to the CronJob it resembles.</p><p><a href="https://kubernetes.io/docs/concepts/workloads/controllers/job/">Primary reference</a></p></section><section class="glossary-term" id="term-controller-reference"><h3>Controller reference</h3><p>The controlling owner relationship on a child object. It is separate from the labels used to select network policy.</p><p><a href="https://kubernetes.io/docs/concepts/overview/working-with-objects/owners-dependents/">Primary reference</a></p></section><section class="glossary-term" id="term-network-policy"><h3>Network policy</h3><p>Rules selecting which pod connections are permitted. Different labels can put a copied probe on a different permitted path.</p><p><a href="https://kubernetes.io/docs/concepts/services-networking/network-policies/">Primary reference</a></p></section><section class="glossary-term" id="term-retry-budget"><h3>Retry budget</h3><p>A limit on permitted retries. Its execution timing also depends on restart and controller behaviour.</p><p><a href="https://kubernetes.io/docs/concepts/workloads/controllers/job/#pod-backoff-failure-policy">Primary reference</a></p></section><section class="glossary-term" id="term-idempotent-operation"><h3>Idempotent operation</h3><p>An operation designed so repeating the same logical write does not create another distinct result. Here a stable generation-derived score identifier supports that intent.</p><p><a href="https://www.rfc-editor.org/rfc/rfc9110.html#name-idempotent-methods">Primary reference</a></p></section><section class="glossary-term" id="term-pending-alert"><h3>Pending alert</h3><p>An active expression that has not yet remained active for its configured firing delay.</p><p><a href="https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/">Primary reference</a></p></section><section class="glossary-term" id="term-last-successful-time"><h3>Last successful time</h3><p>The successful child completion recognised in the parent CronJob status, rather than any arbitrary successful application run.</p><p><a href="https://github.com/kubernetes/kubernetes/blob/v1.34.0/pkg/controller/cronjob/cronjob_controllerv2.go">Primary reference</a></p></section></details>


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
<script is:inline src="/images/blog/s5e14/reader.js"></script>
