---
title: Measuring the Pipeline — CI Fires + DORA
author: Ryan Duffy
description: Build timeouts, scheduling delays and a reverted cache change led to a measurement system that needed its own debugging.
episode: 14
series: 'Season 4: Building in Public — The Agent Era'
draft: false
pubDatetime: 2026-10-20T12:00:00+01:00
shippingDatetime: 2026-10-21T08:34:26+01:00
tags: [rootweaver, kubernetes, gitops, cicd, dora, building-in-public, season-4]
---

The build was still moving when the pipeline killed it. Layers were being pushed, but the job had reached its one-hour limit. The next deployment never started. Rootweaver kept serving the last good image; the failure was in getting the next version out. Before I could make the delivery system faster, I needed to know where its time was going.

![The familiar navy-hooded engineer connects a weather sensor to a field recorder at a rainy hilltop station after dark.](/posts/s4e14/review-v1/hero-A.png)

<p class="caption">Different instruments answer different questions. Conceptual illustration.</p>

Episode 13 followed the state migration and its indexing aftermath. This episode moves to Saturday 20 and Sunday 21 June, with the build failure late on Friday as its immediate precursor. I directed and reviewed the work, with coding agents assisting with investigation and implementation. The account reconstructs selected historical reports, plans and source; the original sessions and pipeline experiments have not been replayed.

I wanted useful changes to keep moving through the platform without making delivery less dependable. The weekend began with individual failures. It ended with a more demanding question: could I trust the measurements I would use to choose the next fix?

## The timeout stopped a deployment, not the running service

The overnight report describes service builds ranging from 334 to 3,152 seconds. Those are whole-job durations, not measurements of a single upload step. Its trace of the slowest example showed cached Docker layers alongside substantial image pushing and registry-cache export. A build could reuse work and still spend a long time transferring the result.

The failed main job was particularly clear. It was actively pushing layers when the one-hour limit terminated it. Its deployment job depended on that build succeeding, so the update stalled. The report attributes the contention to three merge-request pipelines sharing the cluster runner with main. That was a different incident from an application outage, and it needed a different response.

The immediate patch set `timeout: 2h` on the main Docker-build template. I have inspected that historical change. The report says the following main pipeline built and deployed successfully. That establishes the reported recovery of the blocked update; it does not make a longer timeout the explanation for the wasted work.

There was a structural change that the pre-crafted episode left too far in the future. Saturday's CI diff changes BuildKit to push directly to both registries and removes the later pull-from-GitLab, retag and push-to-Harbor sequence. It also moves the primary registry-cache export onto Harbor on the local network, retaining the GitLab locations as import fallbacks.

The timeout bought room for a slow run. Removing a redundant WAN download changed the work the run had to do. Both belong in the story, with different claims attached: the report records the timeout recovery, while the inspected diff establishes the transfer-path change. I have not recovered a matched before-and-after experiment isolating its total pipeline benefit.

## Faster jobs were spending longer waiting

The next investigation separated time in the queue from time executing. That distinction mattered after the namespace migration. Saying that CI was slower would have hidden the fact that the jobs were reportedly executing faster once they started.

The retained evidence ledger quotes a comparison of five successful pipelines before the migration with five afterward. It records the sum of the per-job queue means rising from 236 seconds to 903 seconds, while execution time improved by 19%. The queue increase is about 283%, or 667 additional seconds in that particular sum. It is not a directly measured 667-second increase in the pipeline's critical path: jobs can overlap.

| Historical signal | What the record says | What it helps distinguish |
|---|---|---|
| Per-job queue examples | Roughly 6–10 seconds before; 110–120 seconds after | Waiting to start versus doing the job |
| Sum of job queue means | 236 seconds to 903 seconds | The reported comparison's queue component |
| Execution time | Improved by 19% | A queue regression can hide faster execution |
| Runner request | 1 GiB per job, changed to 512 MiB | What the scheduler must reserve |
| Concurrent slots | Eight | 8 GiB requested at once becomes 4 GiB |

The historical runner change explains the chosen lever. Jobs asked for 1 GiB each on a node the report described as heavily committed on memory requests. A note about low observed usage had not changed what the scheduler saw. Eight new job pods still needed eight reservations to fit.

![The navy-hooded engineer checks a freight wagon in a rain-dark railway yard while other wagons wait beside an open loading gantry.](/posts/s4e14/review-v1/inline-queue-v2.png)

<p class="caption">Waiting for capacity and doing the work are different costs. Conceptual illustration.</p>

The fix halved the per-job memory request to 512 MiB. It retained the 4 GiB memory limit, so the scheduling reservation and the permitted burst ceiling remained separate controls. Reducing the request was a capacity decision grounded in the reported usage, not a claim that every job could never need more memory.

This was the measurement I wanted to keep after the incident. If the queue was the problem, optimising a test's execution would answer the wrong question. The pipeline needed to retain both numbers rather than leave that distinction inside one investigation.

## A cache that worked was still the wrong cache

The cache warnings offered another plausible diagnosis. Jobs were saying that no shared-cache URL was available. Wiring the GitLab runner's distributed cache to MinIO could make that mechanism work, and the implementation report describes credentials, connectivity and bucket operations being checked.

Then the change was reverted that same evening.

The missing step was auditing what the existing `cache:` directives actually targeted. They included the multi-gigabyte `uv` cache, which already had a node-local `hostPath` on the pinned runner. With the usual pull-push policy, the distributed backend added packaging and uploading of data that was already available locally. A successful bucket transfer proved a mechanism; it did not prove that the transfer improved this workload.

The retained report explicitly records the reversal, and the historical revert removes the S3 configuration from the runner. A more selective distributed cache for small caches without a local mount was left as follow-up. I am including this because excluding it as an operational detail would remove one of the weekend's most useful wrong turns.

| Cache mechanism | What it reuses | The mistake to avoid |
|---|---|---|
| Node-local package cache | Downloaded package content on the pinned runner | Transferring the same large directory elsewhere without measuring the cost |
| Docker build-layer cache | The result of an unchanged instruction and its inputs | Letting source edits invalidate dependency installation |
| Registry-backed build cache | Build layers shared across builds | Paying WAN transfer costs for work better kept on the local network |

These were separate mechanisms. Fixing the shared-cache warning could not repair a Dockerfile whose input order forced the dependency layer to run again.

## A source edit was reinstalling the dependency stack

Sunday's Dockerfile investigation made that second problem visible. The report follows a broad merge request whose gateway image build ran near 590 seconds, then describes the dependency installation and image export costs inside it. Those timings remained historical observations; I have inspected the Dockerfile change that explains why source edits could trigger the expensive path.

The previous arrangement copied workspace source before a combined installation step. That step installed both third-party dependencies and local workspace packages. Change a source file and the instruction's inputs changed, even when the external dependency set had not.

The repair split those inputs by how often they changed. The expensive layer first copied manifests and the lockfile. The source-dependent layer came later and installed workspace packages with `--no-deps`. This follows [Docker's documented layer-ordering principle](https://docs.docker.com/build/cache/optimize/): put expensive work with stable inputs before frequently changing source.

![The engineer slides a small removable type tray into a large intact mechanical printing press in a dark printing house.](/posts/s4e14/review-v1/inline-layers-v2.png)

<p class="caption">Changing one small component should not require rebuilding the expensive whole. Conceptual illustration.</p>

<div class="code-source">Exact historical extract · services/rag-gateway/Dockerfile · dependency layer at a061958e. The preceding manifest COPY instructions and later source-install layer are omitted.</div>

```dockerfile
RUN --mount=type=cache,target=/root/.cache/uv \
    uv export --package rag-gateway --no-dev --frozen --no-hashes > requirements.txt && \
    grep -vE '^-e ' requirements.txt > requirements.third-party.txt && \
    uv pip install --system -r requirements.third-party.txt
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

1. `RUN` starts a build instruction. The cache mount makes the `uv` package cache reusable without making it part of the resulting image layer.
2. `uv export` reads the locked dependency graph for the gateway, omits development dependencies and writes requirements. `--frozen` uses the existing lockfile rather than updating it.
3. `grep -vE '^-e '` removes editable workspace references from that exported list. Otherwise this supposedly source-independent stage would still need local package source.
4. `uv pip install` installs the remaining third-party requirements into the builder's system Python. Each `&&` makes the next command conditional on the previous one succeeding.

</details>

The same pattern needed care in the retriever image. Its CPU-only PyTorch installation and filters for GPU-related packages had to survive the split. “Use a cache” was not enough; the dependency boundary had to preserve the service's actual installation rules.

The report says source-only local rebuilds kept the third-party layer cached and ran the workspace install in about 0.6 seconds. That is the workspace installation step, not a 590-second CI build reduced to 0.6 seconds. It also reports green gateway/retriever CI builds, with different local verification for the bridge and dead-letter processor. Four Dockerfiles changed; that does not mean four identical production pipelines were exercised.

There was another boundary: merge-request builds imported registry cache but did not export it. The new stable dependency layer first needed a main build to populate the shared cache. The code change and the point at which later builds could benefit were separate stages.

## The delivery dashboard had no dependable feed

By Sunday the work was broader than reducing one build's duration. The design recorded in ADR-084 linked three concerns: measuring delivery, improving the pipeline, and defining contracts for agent-assisted changes. This episode follows the measurement work. The later enforcement work has its own place in the sequence.

I wanted to compare what the delivery system was doing with the size and origin of changes moving through it. The [2024 DORA research](https://dora.dev/research/2024/dora-report/) gave that question useful context: its findings associated AI adoption with delivery tradeoffs and reinforced small batches and testing. That did not establish that an agent had caused Rootweaver's queue regression or that one channel produced riskier changes. Those were questions for local data, not conclusions to import from a report.

There was already a DORA exporter and a dashboard. The historical design described an empty JSON/PVC feed, a stale ticket-key pattern and no dependable deployment writer. An exporter that could return metrics was not the same as a collector receiving the events those metrics required.

The implementation introduced a store interface with JSON retained for tests and Postgres for production. The inspected collector regex also retained the older prefixes while adding `VW`; it did not simply replace every historical prefix. The durable schema then brought deployments, incidents, pipelines, pipeline jobs and changes into the same measurement system.

| Record | Producer or source | Question it can support |
|---|---|---|
| Deployment | Deployment records and historical backfill | How often changes are released, using the recorded event definition |
| Incident | Creation and resolution ingestion | How long recorded incidents remain unresolved |
| Pipeline and job | GitLab API poller | How much time is queued versus executing |
| Change | Merge history, diff statistics and provenance trailers | How large a merged change is and which channel its metadata identifies |

The infrastructure needed its own repair. A backfill job initially called schema provisioning through a writer role that lacked permission to create the schema. The fix removed that call: administration provisioned the tables; the writer inserted records. The associated commit reports an initial backfill of 219 platform-main merges. I have inspected the job correction, but that count remains a historical report.

Those backfilled rows also carried an important definition: a merge was being used as a deployment proxy. The backfill could seed a graph, but a merge timestamp alone could not prove the corresponding workload had become healthy. The first change-failure calculation likewise used recorded failed or rolled-back deployments. It was not a complete independently reconciled history of user-visible failures.

## The first poller was missing the fields it needed

The pipeline poller then hit a more ordinary integration failure. Its list request found pipelines, but the retained evidence says duration and start/finish fields were missing from those responses. The repair fetched each pipeline's detail record before storing it.

![The engineer connects a river sensor to a mechanical recorder under a stone arch beside a dark flowing river.](/posts/s4e14/review-v1/inline-feeds-v2.png)

<p class="caption">A visible instrument still needs the right records behind its reading. Conceptual illustration.</p>

<div class="code-source">Exact historical extract · packages/pdg-generator/src/pdg_generator/metrics/pipeline_poller.py · poll_pipelines at merge 6ae98588. The surrounding loop already has pipeline_id.</div>

```python
pipeline_detail = fetch(f"/pipelines/{pipeline_id}", {})
if not pipeline_detail:
    raise ValueError(f"GitLab pipeline detail missing for {pipeline_id}")
pipeline = _pipeline_record_from_gitlab(pipeline_detail[0])
store.upsert_pipeline(pipeline)
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

1. The fetch requests one pipeline by its ID. The injected fetcher wraps a single returned object in a list, which explains the indexing below.
2. The condition checks whether that detail response is empty.
3. An empty response raises an error instead of silently constructing a record from missing detail.
4. The first returned object is converted into the pipeline model, including the available timing fields.
5. The store inserts or updates the pipeline record. Keeping the same pipeline ID lets a later poll update it rather than create a separate identity.

</details>

This is a description of the June integration and its inspected repair. [GitLab's current pipeline documentation](https://docs.gitlab.com/api/pipelines/) has evolved since then; the historical failure does not establish that every present-day list response has the same shape.

The guard also has a precise limit. It rejects an absent detail object. It does not prove that every optional timestamp inside a returned object is populated. A running pipeline may legitimately lack a finish time. The measurement layer still needed to distinguish incomplete work from incomplete ingestion rather than turn either into a plausible zero.

## Provenance was another measurement input

The change collector addressed a different ambiguity. The period's design says the normal Git author identity did not distinguish human work from the coding-agent channels. The useful input was the `AI-Agent` trailer carried in commit metadata.

The historical collector walks first-parent merges, measures each merge's diff against its first parent and reads trailers from the commits in that merge. In the inspected implementation, the first non-empty agent trailer within a commit is used. Conflicting agent identities across the collected commits produce `ambiguous`. No agent trailer produces `human`.

That last label is a parser convention, not proof that a person wrote every line unaided. The distinction matters when reading a batch-size panel: provenance coverage and attribution rules affect the grouping before any statistics are computed. Recording both channels and uncertainty was more useful than inferring authorship from a familiar Git name.

The visualisation needed a correction too. A late-Sunday dashboard diff aggregates the new queries by agent to collapse exporter-instance series that otherwise appeared as duplicates after restarts. A cleaner legend could not establish a causal link between large changes and failures; it could make the intended grouping readable. The instrument had to be debugged at ingestion, attribution and presentation layers.

## What I would carry forward

The useful result was not a claim that CI was now fast, or that a dashboard had proved which agent was best. The work had made several different costs explicit: waiting for a pod, installing unchanged dependencies, moving cached data, exporting image layers and retrying an integration with missing detail.

I would keep four habits from that weekend:

- **Measure the part before changing the total.** Queue time and execution time call for different interventions; a sum across jobs needs its own definition.
- **Audit the cache's inputs and transfers.** A cache can function correctly while adding more work than it saves. The same-evening revert was useful evidence.
- **Keep proxy events visibly labelled.** A backfilled merge is not an independently observed healthy deployment, and a failed deploy record is not the whole history of production incidents.
- **Treat measurement code as part of the system.** Missing API fields, writer permissions, ambiguous provenance and duplicated series can all change what the dashboard appears to say.

The selected history establishes the implementation changes and preserves reports of checks performed at the time. It does not provide a complete raw replay of that weekend or a controlled estimate of every change's effect. That leaves a useful system to improve rather than a finished scorecard to defend.

The next episode is **“Governance-as-Code — the Gate That Gates Itself.”** The canonical sequence and dated completeness audit place the contract-enforcement work after this measurement story, including work completed on the following Monday and Tuesday. Its question is what the pipeline should permit when a proposed change touches the controls that judge it.

<details data-glossary id="glossary"><summary>Glossary</summary><div class="glossary-tools" hidden><label>Find a term <input type="search" aria-label="Search glossary"></label><button type="button">Clear</button><span role="status"></span></div><section class="glossary-term"><h3>Queue time</h3><p>Time a job spends waiting before execution, recorded separately from its run duration. <a href="https://docs.gitlab.com/api/jobs/">GitLab reference</a></p></section><section class="glossary-term"><h3>Memory request</h3><p>The memory reservation Kubernetes considers when scheduling a container; it differs from the memory limit. <a href="https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/">Kubernetes reference</a></p></section><section class="glossary-term"><h3>Build layer cache</h3><p>Reusable results of build instructions whose relevant inputs have not changed. <a href="https://docs.docker.com/build/cache/optimize/">Docker reference</a></p></section><section class="glossary-term"><h3>Watermark</h3><p>The stored position or timestamp used to decide where the next incremental collection begins; here the poller uses stored pipeline completion time. <a href="https://docs.gitlab.com/api/pipelines/">API reference</a></p></section><section class="glossary-term"><h3>Upsert</h3><p>Insert a record or update the existing record with the same identifying key. <a href="https://www.postgresql.org/docs/current/sql-insert.html">PostgreSQL reference</a></p></section><section class="glossary-term"><h3>Provenance trailer</h3><p>Structured commit-message metadata used here to identify the producing agent channel; its coverage and parsing rules matter. <a href="https://git-scm.com/docs/git-interpret-trailers">Git reference</a></p></section><section class="glossary-term"><h3>DORA</h3><p>Research on software delivery performance. This historical implementation used deployment frequency, lead time, change failure rate and incident recovery time, with locally defined event inputs. <a href="https://dora.dev/research/2024/dora-report/">Period research reference</a></p></section></details>

<details class="source-note"><summary>Sources and reconstruction limits</summary><p>This is a curated reconstruction of June 20–21, 2026, with the late June 19 build failure as explicit precursor context. It uses the canonical flat sequence, preserved pre-crafted episode, dated completeness audit, selected implementation reports, ADR-084, ingestion/metrics specifications and historical Git source. Earlier ledger labels such as VERIFIED are historical curator assertions, not independently repeated runtime checks. Pipeline timing cohorts, local rebuild timings and reported row counts remain historical reports. No raw native-session bodies, secret values, private records or BT-Work material were read. Parallel research, budgeting, audit and journal work is inventoried in the companion ledger and omitted from this narrative. Governance implementation on June 22–23 belongs to Episode 15. The current API documentation is reference context, not proof of a June API response.</p></details>

<script is:inline src="/posts/s4e14/review-v1/reader.js"></script>
