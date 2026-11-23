---
title: "One Alert Was Hiding Three Failures"
description: "A nightly knowledge-ingestion alert led through an undersized deadline, fragile embedding retries and a document that repeatedly broke a search query. Each repair exposed the next boundary."
pubDatetime: 2026-07-17T18:00:00Z
shippingDatetime: 2026-11-23T08:00:00Z
draft: false
author: Ryan Duffy
episode: 15
image: /images/blog/s5e15/hero-A.png
series: "Season 5: Rootweaver"
tags: [Rootweaver, Kubernetes, Observability, KnowledgeGraphs, Reliability]
---

A scheduled pipeline can keep making useful progress and still never record a successful run. That was the next problem behind the operational alerts: the nightly job that turned my architecture documents into searchable graph knowledge kept ending in failure.

I needed the job to finish the work it accepted, preserve completed work when something failed, and produce a completion signal I could trust. The investigation uncovered three different obstacles. Its deadline was shorter than the expected work. Its embedding dependency could stay overloaded beyond its retry window. One code-bearing document then broke a full-text query every time it reached the same path.

![The engineer inspects a freed winch in a dark slate-mine gallery, with another jammed mechanism visible beyond the open first barrier.](/images/blog/s5e15/hero-A.png)

<p class="caption">Removing the first obstruction can reveal the next one. A conceptual illustration of the investigation, not a reconstruction of the infrastructure.</p>

This episode covers **16–17 July 2026**. It follows the scorer recovery in Episode 14, using the ingestion handover and retained application, test and GitOps source. I owned direction and review, with agent-assisted investigation and implementation. Runtime observations remain attributed to the historical handover. The worked examples below are new explanations; they do not replay the original cluster or establish a later scheduled recovery that the retained evidence does not show.

## The alert was about a missing success record

The job read permitted architecture documents, sent their contents through Graphiti for extraction, and added the resulting knowledge to FalkorDB. An embedding call was one dependency in that process. An embedding is a numerical representation used to compare meaning; it was not the final graph write or a guarantee that the document had been ingested.

The warning was `DataPipelineCronJobNeverSucceeded`. This was a different condition from the timestamp-gap alert in the previous episode. Its retained expression selected scheduled CronJobs for which the corresponding successful-completion series was absent:

<p class="code-source">alert-rules.yaml · DataPipelineCronJobNeverSucceeded · GitOps cc5531af · exact historical expression</p>

```promql
kube_cronjob_status_last_schedule_time{namespace=~"rootweaver|rw-.*"}
  unless kube_cronjob_status_last_successful_time{namespace=~"rootweaver|rw-.*"}
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- The first metric identifies CronJobs with a recorded scheduling time.
- `unless` keeps the left-hand entries that have no matching entry on the right.
- The second metric supplies recognised successful-completion records.
- This checks for a missing series. It does not subtract two times or measure the number of failed documents.

</details>

The [Prometheus authors describe `unless` as a set operation](https://prometheus.io/docs/prometheus/latest/querying/operators/#logical-set-binary-operators). The rule also required the condition to persist for two hours before firing. That pending period was separate from the Job's two-hour execution deadline, even though the two durations happened to match.

This gave the alert a clear meaning and a limited diagnostic role. It said that recognised scheduled success was missing. It did not say whether the cause was insufficient time, a remote dependency, an input-specific defect or a broken ownership relationship. The investigation had to supply that explanation.

## A two-hour deadline could not contain the queue

The handover reports nightly `DeadlineExceeded` failures and identifies `activeDeadlineSeconds: 7200`. The GitOps history independently shows that field being raised to `21600`, from two hours to six. This is the Job's running-time budget, not the setting that decides how late a missed schedule may start.

The manifest's explanation recorded a typical pending queue of about 124 records and roughly 148 seconds per episode. At that rate, the simple estimate is:

**124 × 148 seconds = 18,352 seconds, or about 5.10 hours.**

That arithmetic is a new check of the recorded assumptions. The historical comment rounded the workload to about 5.2 hours. Either estimate was far beyond a two-hour budget. Increasing retries on the same Job would not make a single permitted execution window large enough to contain that work.

<p class="code-source">cronjob-deadline.yaml · spec.jobTemplate.spec · GitOps a3c242b8 · exact historical field</p>

```yaml
activeDeadlineSeconds: 21600
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- `activeDeadlineSeconds` limits how long the Job may remain active.
- `21600` is measured in seconds: six hours.
- This field belongs to the Job template. It is distinct from a single HTTP request timeout and from the CronJob's scheduling grace period.
- Raising it gives the work more time. It does not make extraction faster or prove that the pending queue will always fit.

</details>

The [Kubernetes Job documentation](https://kubernetes.io/docs/concepts/workloads/controllers/job/#job-termination-and-cleanup) explains the deadline and its relationship to retries. The surrounding manifest contained several controls with different jobs:

| Setting | Retained value after the deadline change | What it controlled |
|---|---:|---|
| Job `activeDeadlineSeconds` | 21,600 seconds | How long the Job could remain active |
| CronJob `startingDeadlineSeconds` | 600 seconds | How late a missed scheduled start could be considered |
| Job `backoffLimit` | 1 | A retry limit, not an execution-time allowance |
| CronJob `concurrencyPolicy` | `Forbid` | Overlap between Jobs created by this CronJob |

The handover reports that the deadline change was reconciled and describes a run reaching all 25 batches in roughly 2.3 hours. That was useful progress evidence, but it was not a matched throughput benchmark against the earlier estimate. Queue size, skips and input difficulty can change. The sound conclusion was that the old time budget had been inadequate; a longer budget allowed the investigation to reach failures it had previously obscured.

## Progress and Job success were separate states

A failed Job did not mean every record it touched had been lost. The ingestion loop kept a marker for each successfully processed document. The marker included its identifier and content hash, a fingerprint of the exact text.

That mattered for recovery. If a document had already been processed and its content had not changed, the next run could skip it. If its content changed, a matching identifier alone was insufficient. The stored hash also had to match.

<p class="code-source">ingest_documents.py · DocumentKnowledgeMarkerStore.is_processed · platform c111f0b3 · exact historical excerpt</p>

```python
def is_processed(self, record: DocumentKnowledgeRecord) -> bool:
    entry = self._state.get(record.document_id)
    return bool(entry) and entry.get("content_hash") == record.content_hash
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- The function receives the document record being considered.
- It looks for a stored entry under that record's document identifier.
- A record is considered processed only when an entry exists and its stored content hash matches the current hash.
- The check is about this version of the document. It is not a claim that every document in the corpus is complete.

</details>

The serial ingestion branch wrote a marker only after `_add_episode_with_retry` returned success. Failed records increased a failure counter. At the command boundary, the process used that counter to decide its exit status:

<p class="code-source">ingest_documents.py · main · platform c111f0b3 · exact historical exit policy</p>

```python
return 0 if stats["failed"] == 0 else 1
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- `stats["failed"]` is the count of records that failed during this invocation.
- Zero failures produces exit code zero, the normal successful process outcome.
- Any failed record produces exit code one, even if other records completed.
- Previously written per-record markers are not removed by this return statement.

</details>

A small synthetic run makes the distinction easier to see:

| Record in this illustrative run | Document result | Marker after the run | Next run with unchanged content |
|---|---|---|---|
| A: architecture note | Succeeded | Saved | Skip A |
| B: code-bearing note | Failed | Not saved | Try B again |
| C: design note | Succeeded | Saved | Skip C |
| Whole invocation | One failed record | A and C retained | Exit code 1 for this run |

This is an explanatory example, not the original run's document list. It shows why useful partial progress and an unsuccessful Job can coexist. It also shows why the same bad record can remain in every future pending set while completed records disappear from that set.

![The engineer checks secure anchor bolts on a stone maintenance ledge while an unfinished section of the footway remains ahead.](/images/blog/s5e15/inline-1.png)

<p class="caption">Completed sections remain useful even when the whole route is unfinished. The illustration represents per-record progress, not a claim of transactional graph writes.</p>

The marker file lived on persistent host storage in the historical manifest. That made progress available across ordinary Job runs. The retained implementation wrote JSON directly; it did not establish an atomic transaction spanning the graph write and marker file. A missing or unreadable marker file could cause work to be reconsidered. I would keep those durability limits separate from the narrower benefit the code provided.

## An overloaded dependency needed a different retry policy

With enough execution time available, an embedding dependency became the next boundary. The handover reports OpenRouter `429` overload windows outlasting the earlier retry policy. The hardening requirement describes three attempts with short linear waits. Repeating quickly was a poor fit for an upstream service that could remain busy beyond that brief window.

The retained repair used environment-backed defaults: five attempts, a two-second base delay and a thirty-second computed-delay cap. Explicit constructor arguments took precedence over the environment. That made the policy configurable without requiring a separate source change for every operational adjustment.

The implementation also inspected the response body. For example, this **synthetic error payload**, returned with an HTTP status of 200, would still enter the error path:

```json
{
  "error": {
    "code": 429,
    "message": "engine_overloaded"
  }
}
```

A successful HTTP envelope did not supply an embedding vector. In the retained client, a body containing `error` was recorded as a provider error; a normal body was parsed and checked for the expected vector count and dimensions. Ordinary non-429 client-error statuses failed immediately. Those were separate branches, not one blanket rule to retry every failure forever.

The sleep calculation was the important mechanism:

<p class="code-source">openrouter_client.py · generate_embeddings · platform c111f0b3 · exact historical retry calculation</p>

```python
base_delay = min(
    self._retry_delay_s * 2 ** (attempt - 1),
    self._retry_delay_cap_s,
)
computed_delay = min(
    base_delay * random.uniform(0.9, 1.1),
    self._retry_delay_cap_s,
)
await asyncio.sleep(max(retry_after_s, computed_delay))
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- The first calculation doubles the base delay as the attempt number grows.
- `min` applies the configured cap to that exponential delay.
- A random factor between 0.9 and 1.1 spreads retry timing slightly. This is jitter.
- The second `min` prevents that computed jittered delay from exceeding the cap.
- The final `max` honours a longer parsed `Retry-After` value from the response.
- The cap therefore bounds the computed delay, not every possible sleep after the header is considered.

</details>

For the default five attempts, there are four intervening sleeps. Ignoring jitter and a server-supplied delay, they are **2, 4, 8 and 16 seconds**, totalling 30 seconds. The thirty-second cap is not reached by that default ladder.

The client parsed a numeric `Retry-After` header. The [HTTP specification edited by Fielding, Nottingham and Reschke](https://www.rfc-editor.org/rfc/rfc9110.html#name-retry-after) also permits a date form; this implementation did not parse that form. If a numeric header requested forty seconds, the final `max` could choose forty even though the computed-delay cap was thirty. That is a concrete reason not to describe the cap as a universal upper bound.

## A budget calculation was not a guaranteed deadline

The historical verification material included an 80-second calculation: five configured ten-second request timeouts plus thirty seconds of nominal waits. Allowing the full positive jitter on those waits changes that illustration to 83 seconds before considering a longer server header.

The retained test asserted the nominal 80-second value, even though its function name still referred to a lower limit. Reading its assertion and the implementation establishes more than trusting its name. It does not establish a hard end-to-end stopwatch bound.

There was also a 120-second embedding timeout at the caller in `embedder.py`. Both layers used HTTPX. The [HTTPX maintainers explain its connect, read, write and pool timeout phases](https://www.python-httpx.org/advanced/timeouts/); a configured timeout is not automatically a total wall-clock deadline for every activity in a retry sequence.

That qualification mattered operationally. More patience inside a dependency can help only while the caller is still prepared to wait. A longer provider-requested delay, repeated network activity or additional work can invalidate a simple comparison of default numbers. The six-hour Kubernetes Job limit, the caller's HTTP settings and the provider client's retry ladder controlled different parts of the path.

The lesson was to inspect how budgets compose, then observe the actual failure being recovered. A test of a nominal retry schedule does not prove that a remote overload of arbitrary length will be survived.

## One document was a repeatable parser failure

Retries addressed temporary overload. They could not make an unsafe query become valid. The handover describes a code-bearing architecture-review document that repeatedly produced a RediSearch syntax error near `startswith`.

The document included a Python expression containing backticks. Those characters survived the existing sanitisation path and reached the full-text query builder. Re-running the same input therefore returned to the same deterministic parser failure. In ingestion terminology, a **poison document** is an input that repeatedly fails that processing path; it is not necessarily malicious or worthless content.

The repair added a narrow helper before Graphiti built the FalkorDB full-text query:

<p class="code-source">graphiti_client.py · _redisearch_safe_query_text · platform c111f0b3 · exact historical helper</p>

```python
_REDISEARCH_UNSAFE_QUERY_CHAR_RE = re.compile(r"[^A-Za-z0-9_ \t\n]")


def _redisearch_safe_query_text(query: str) -> str:
    """Replace characters that RediSearch fulltext syntax can interpret."""
    return _REDISEARCH_UNSAFE_QUERY_CHAR_RE.sub(" ", query)
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- The regular expression identifies characters outside the allowed ASCII letters, digits, underscore and selected whitespace.
- The helper accepts the query text to be passed into full-text search.
- `sub(" ", query)` replaces each disallowed character with a space.
- The change is applied to the search representation. This helper does not rewrite the stored source document.
- This is a deliberately restrictive representation, with information loss. It is not a complete general-purpose query parser or Unicode search solution.

</details>

For the reported shape of input, a token view illustrates the effect:

| Illustrative input | Tokens after this helper and whitespace splitting |
|---|---|
| <code>line.startswith(&#39;&#96;&#96;&#96;&#39;)</code> | `line`, `startswith` |
| `alpha_beta 123` | `alpha_beta`, `123` |
| A string made only of stripped punctuation | No tokens |

These are new explanatory examples. Python's [regular-expression documentation](https://docs.python.org/3/library/re.html#re.sub) describes the substitution operation. The important integration point was its placement: the FalkorDB branch called this helper **before** `fulltext_query`. The existing empty-query guard could then return an empty result rather than sending meaningless syntax onward. Other graph-provider branches still delegated to their existing implementation.

![In a dark rural seed shed, the engineer prepares a sorted working sample while a sealed jar of the original material remains intact.](/images/blog/s5e15/inline-2.png)

<p class="caption">A constrained working representation can leave the original source intact. It can also discard useful detail; that trade-off needs to remain visible.</p>

The cost of the broad character filter was real. Accented letters and non-Latin text could lose characters too. The patch addressed a bounded historical failure in a specific full-text path. It did not establish equal retrieval quality for every language or prove that every possible query shape was now safe. Nor would another retry budget have fixed the original parser error.

## Follow the work through the right boundaries

The mechanism can be read as a sequence of boundaries rather than one generic healthy/unhealthy box. Completed documents advance the marker store; failed documents keep the invocation unsuccessful; a recognised successful scheduled child is what can advance the CronJob's completion record.

<figure id="record-outcome" class="story-flow" data-policy-flow><h3>Why a failed Job can retain useful progress</h3><div class="flow-desktop"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 340" role="img" aria-label="A pending document is processed. Success saves its content marker; failure leaves it pending. The Job exits unsuccessfully if any record failed."><defs><pattern id="grid-e15d" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arrow-e15d" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="#a78bfa"/></marker></defs><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#grid-e15d)"/><path class="flow-motion" data-flow-edge d="M85 155H225" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" marker-end="url(#arrow-e15d)" fill="none"/><path class="flow-motion" data-flow-edge d="M275 155H350V65H445" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" marker-end="url(#arrow-e15d)" fill="none"/><path class="flow-motion" data-flow-edge d="M275 155H350V250H445" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" marker-end="url(#arrow-e15d)" fill="none"/><path class="flow-motion" data-flow-edge d="M495 65H590V155H655" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" marker-end="url(#arrow-e15d)" fill="none"/><path class="flow-motion" data-flow-edge d="M495 250H590V155H655" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" marker-end="url(#arrow-e15d)" fill="none"/><g transform="translate(60 155)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><rect x="-10" y="-13" width="20" height="26" rx="2"/><path d="M-5-5H5M-5 0H5M-5 5H2"/></g></g><text x="60" y="202" text-anchor="middle" fill="#e9eaee" font-family="system-ui" font-size="12.5">Pending record</text><text x="60" y="222" text-anchor="middle" fill="#aab0bc" font-family="system-ui" font-size="10.5">Current version</text><g transform="translate(250 155)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><circle r="11"/><path d="M0-16V-10M0 10V16M-16 0H-10M10 0H16M-7-7L7 7M-7 7L7-7"/></g></g><text x="250" y="202" text-anchor="middle" fill="#e9eaee" font-family="system-ui" font-size="12.5">Process record</text><text x="250" y="222" text-anchor="middle" fill="#aab0bc" font-family="system-ui" font-size="10.5">Extraction and search</text><g transform="translate(470 65)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-12-10H12V12H-12ZM-7 1L-1 7L8-4"/></g></g><text x="470" y="112" text-anchor="middle" fill="#e9eaee" font-family="system-ui" font-size="12.5">Success</text><text x="470" y="132" text-anchor="middle" fill="#aab0bc" font-family="system-ui" font-size="10.5">Save content marker</text><g transform="translate(470 250)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><circle r="12"/><path d="M-5-5L5 5M-5 5L5-5"/></g></g><text x="470" y="297" text-anchor="middle" fill="#e9eaee" font-family="system-ui" font-size="12.5">Failure</text><text x="470" y="317" text-anchor="middle" fill="#aab0bc" font-family="system-ui" font-size="10.5">Keep record pending</text><g transform="translate(680 155)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-4-12H10V12H-4M-15 0H3M-3-6L3 0L-3 6"/></g></g><text x="680" y="202" text-anchor="middle" fill="#e9eaee" font-family="system-ui" font-size="12.5">Job exit</text><text x="680" y="222" text-anchor="middle" fill="#aab0bc" font-family="system-ui" font-size="10.5">Any failed record: exit 1</text></svg></div><div class="flow-mobile"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 560" role="img" aria-label="A pending document is processed. Success saves its content marker; failure leaves it pending. The Job exits unsuccessfully if any record failed."><defs><pattern id="grid-e15m" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arrow-e15m" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="#a78bfa"/></marker></defs><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#grid-e15m)"/><path class="flow-motion" data-flow-edge d="M44 65V135" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" marker-end="url(#arrow-e15m)" fill="none"/><path class="flow-motion" data-flow-edge d="M44 185V275" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" marker-end="url(#arrow-e15m)" fill="none"/><path class="flow-motion" data-flow-edge d="M69 160H80V225H230V275" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" marker-end="url(#arrow-e15m)" fill="none"/><path class="flow-motion" data-flow-edge d="M44 325V475" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" marker-end="url(#arrow-e15m)" fill="none"/><path class="flow-motion" data-flow-edge d="M255 300H310V420H44V475" stroke="#a78bfa" stroke-width="1.5" stroke-dasharray="3 7" marker-end="url(#arrow-e15m)" fill="none"/><g transform="translate(44 40)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><rect x="-10" y="-13" width="20" height="26" rx="2"/><path d="M-5-5H5M-5 0H5M-5 5H2"/></g></g><text x="90" y="37" text-anchor="start" fill="#e9eaee" font-family="system-ui" font-size="12.5">Pending record</text><text x="90" y="57" text-anchor="start" fill="#aab0bc" font-family="system-ui" font-size="10.5">Current version</text><g transform="translate(44 160)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><circle r="11"/><path d="M0-16V-10M0 10V16M-16 0H-10M10 0H16M-7-7L7 7M-7 7L7-7"/></g></g><text x="90" y="157" text-anchor="start" fill="#e9eaee" font-family="system-ui" font-size="12.5">Process record</text><text x="90" y="177" text-anchor="start" fill="#aab0bc" font-family="system-ui" font-size="10.5">Extraction and search</text><g transform="translate(44 300)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-12-10H12V12H-12ZM-7 1L-1 7L8-4"/></g></g><text x="90" y="297" text-anchor="start" fill="#e9eaee" font-family="system-ui" font-size="12.5">Success</text><text x="90" y="317" text-anchor="start" fill="#aab0bc" font-family="system-ui" font-size="10.5">Save content marker</text><g transform="translate(230 300)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><circle r="12"/><path d="M-5-5L5 5M-5 5L5-5"/></g></g><text x="230" y="347" text-anchor="middle" fill="#e9eaee" font-family="system-ui" font-size="12.5">Failure</text><text x="230" y="367" text-anchor="middle" fill="#aab0bc" font-family="system-ui" font-size="10.5">Keep record pending</text><g transform="translate(44 500)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g fill="none" stroke="#e9eaee" stroke-width="1.5"><path d="M-4-12H10V12H-4M-15 0H3M-3-6L3 0L-3 6"/></g></g><text x="90" y="497" text-anchor="start" fill="#e9eaee" font-family="system-ui" font-size="12.5">Job exit</text><text x="90" y="517" text-anchor="start" fill="#aab0bc" font-family="system-ui" font-size="10.5">Any failed record: exit 1</text></svg></div><div class="flow-tools"><button type="button" data-flow-motion aria-pressed="false">Pause flow</button><button type="button" data-flow-expand>Expand diagram</button></div><figcaption>Focused view of pending records; unchanged completed versions are skipped before this path. Moving dots show direction, not recorded traffic. Controller recognition is an additional observation after process completion.</figcaption></figure><dialog data-flow-dialog aria-label="Expanded ingestion outcome diagram"><button type="button" data-flow-close>Close expanded diagram</button><div data-flow-expanded-content></div></dialog><script is:inline src="/images/blog/s5e15/flow-ui.js"></script><script is:inline src="/images/blog/s5e15/flow-motion.js"></script>

That distinction also prevents a misleading diagnosis of the alert itself. A missing controller success record could accurately describe the Job outcome while hiding the fact that many individual documents had already been processed. It was not necessary to call the alert false to explain that partial progress.

The useful operational questions became specific: did the deadline kill the run? Did an upstream response enter a retryable path? Did the same record fail with the same parser signature? Did its marker advance only after successful processing? Did the controller recognise a completion belonging to this schedule?

## What the retained evidence actually closes

The July handover reports the deadline change applied and a verifier passing nine checks for the two application fixes. Those are historical reports. The retained source lets me independently inspect the retry arithmetic, query-helper placement, marker rules and exit policy today. New offline examples exercise those source mechanisms without calling the provider or running ingestion.

The midnight handover still left image publication and pin promotion open. A later GitOps commit on 17 July updated both the ingestion image and the retriever image to `4e22ceb8`. That target included the earlier `c111f0b3` hardening merge; the three relevant implementation files are unchanged between those revisions. This explains why the deployed-image request need not use the same short revision named in the first handover.

| Retained evidence | What it establishes | What it does not establish |
|---|---|---|
| Deadline GitOps diff | Requested Job budget changed from two to six hours | Independent replay of the reported cluster state |
| Application source and tests | Concrete retry, filtering, marker and exit mechanisms | A live provider or database run succeeding |
| Handover's verifier result | A reported historical verification checkpoint | Recovered complete verifier logs or end-to-end acceptance |
| Later image-pin commit | Both relevant workloads were configured for the later image revision | Independent observation of rollout health or the next scheduled completion |

I have not recovered the later ordinary scheduled success as a separate observation in this episode's evidence set. The narrative therefore ends at a documented repair and deployment configuration, with that operational acceptance still distinct. It does not turn a pin change, a source test or a green manual process into proof of the whole nightly path.

## What I would carry into the next build

Start with the first boundary the evidence can identify, then repeat the diagnosis after changing it. A longer deadline can reveal a dependency problem. Better retries can reveal a deterministic input problem. The symptom staying similar does not mean the earlier repair had no value.

Keep partial progress and overall success visible at the same time. Per-document markers reduce repeated work, while a nonzero process exit can still honestly report an incomplete invocation. Inspect the persistence and crash assumptions rather than assuming the word checkpoint guarantees them.

Treat retry arithmetic as a model to check. Count attempts and intervening sleeps, include jitter, read server hints and compare caller settings. Test the exact source path you are relying on. For deterministic malformed queries, change the representation or failure policy instead of repeatedly waiting for the same input to improve.

The next records return to the broader problem of work that appeared active without a reliable continuation. After repairing one pipeline, the next question was how to leave enough evidence and a concrete next action for the work around it.

<details class="glossary" data-glossary><summary>Glossary and primary references</summary><div class="glossary-tools" hidden><label>Find a term <input type="search" aria-label="Search glossary"></label><button type="button">Clear</button><p role="status"></p></div><section class="glossary-term" id="term-cronjob"><h3>CronJob</h3><p>The Kubernetes controller that creates Jobs according to a schedule.</p><a href="https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/">Primary reference</a></section><section class="glossary-term" id="term-job-deadline"><h3>Job deadline</h3><p>The active-time limit for the Job, separate from request timeouts and scheduling grace.</p><a href="https://kubernetes.io/docs/concepts/workloads/controllers/job/">Primary reference</a></section><section class="glossary-term" id="term-backoff"><h3>Backoff</h3><p>Waiting between repeated attempts, often with increasing delays.</p><a href="https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/">Primary reference</a></section><section class="glossary-term" id="term-jitter"><h3>Jitter</h3><p>A variation in retry timing that reduces synchronised repeat requests.</p><a href="https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/">Primary reference</a></section><section class="glossary-term" id="term-retry-after"><h3>Retry-After</h3><p>An HTTP response hint for when a later request should be attempted; the standard permits seconds or a date.</p><a href="https://www.rfc-editor.org/rfc/rfc9110.html#name-retry-after">Primary reference</a></section><section class="glossary-term" id="term-content-hash"><h3>Content hash</h3><p>A fingerprint calculated from the content; this implementation uses it to distinguish document versions.</p><a href="https://docs.python.org/3/library/hashlib.html">Primary reference</a></section><section class="glossary-term" id="term-request-timeout"><h3>Request timeout</h3><p>A time setting applied to network operations; HTTPX distinguishes several phases.</p><a href="https://www.python-httpx.org/advanced/timeouts/">Primary reference</a></section><section class="glossary-term" id="term-search-representation"><h3>Search representation</h3><p>The text formed for the search operation. The shown helper changes this representation using substitution, leaving the source document intact.</p><a href="https://docs.python.org/3/library/re.html#re.sub">Primary reference</a></section></details>

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

</style>
<script is:inline src="/images/blog/s5e15/reader.js"></script>
