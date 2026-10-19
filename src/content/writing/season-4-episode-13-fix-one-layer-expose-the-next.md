---
title: Fix One Layer, Expose the Next
author: Ryan Duffy
description: Moving the stores exposed incomplete inventories, different retry decisions and a final event that could not wake its consumer.
episode: 13
series: 'Season 4: Building in Public — The Agent Era'
draft: false
pubDatetime: 2026-10-19T12:00:00+01:00
tags: [rootweaver, kubernetes, gitops, indexing, building-in-public, season-4]
---

The application services had moved, but their data had not. Rootweaver's new functional namespaces still reached back into the old `rootweaver` namespace for the stores that kept retrieval, memory and research useful. That was a deliberate staging choice. It kept a database migration out of the first cutover, but it left the harder question waiting: could I move the state without losing part of the system that depended on it?

![The familiar engineer inspects data conduits under an opened floor hatch while another closed section awaits farther down a dark service tunnel.](/posts/s4e13/review-v1/hero-F-v3.png)

<p class="caption">Opening one layer exposes the next dependency. Conceptual illustration.</p>

Episode 12 followed the caller and receiver rules exposed by the application-plane move. This episode follows the five stores on Wednesday 17 June, the cleanup and indexing failures on Thursday, and the recovery closeout on Friday morning. I directed and reviewed the work, with coding agents assisting with implementation and investigation. The reconstruction uses the retained runbook, historical source and incident report; it is not a complete replay of the original sessions.

## A running database was only the beginning

The destination was `rw-data`. The sequence in the runbook was to bring up a target, restore its state, verify it, flip the callers, then remove the old instance. Keeping the old store until verification preserved a recovery option while the callers still pointed at it. Once writes moved, switching back would also require deciding which copy held the newest data.

Local-path storage did not give this migration a volume-snapshot shortcut. The plan used application-level export and restore into fresh storage. That made each store's idea of completeness part of the procedure. A Kubernetes object could move cleanly while a database, collection, role or caller was still missing.

| Store | How it moved | What made it different |
|---|---|---|
| Benchmark Postgres | Recreate empty; keep the rig dormant | Disposable data did not mean an unwanted workload |
| Research Postgres | Dump and restore, then caller flip | One server contained more than one application database |
| FalkorDB | Server-to-server `MIGRATE COPY` | Append-only persistence changed the restore choice |
| Qdrant | Recover collection snapshots into the target | The collection inventory exceeded the backup job's scope |
| Vault Postgres | Restore database state and required role information | Rows, schemas, roles, grants and connection secrets all mattered |

These were five separate moves, rather than one large replacement. That gave each verification step a smaller question to answer. It also exposed where the verification question itself was incomplete.

## The first restore checked the database it remembered

The dormant benchmark store went first. Its purpose was to validate the landing zone without copying valuable data. The manifests preserved the deliberate zero-replica state; this was keeping a benchmark rig available, not turning it into an always-running service.

Research Postgres came next. The bring-up commit describes an empty target and a cross-namespace restore job reading the existing dump. The subsequent cutover message reports a matching count of 15,279 for the restored data before callers changed.

That check answered a narrower question than the migration needed. The server also held MLflow's backend database. The first restore covered `sre_research`; it had not restored `mlflow`.

![The engineer looks back from a relocated archive trolley towards a separate alcove of records still left in the old room.](/posts/s4e13/review-v1/inline-v1/inventory.png)

<p class="caption">Restoring the expected database did not establish that every database had moved. Conceptual illustration.</p>

The correction is visible in the next policy change. A temporary restore peer had already been removed during the caller flip. It was added back so the missing MLflow database could be restored, then removed again after that work. The correction message identifies 44 MLflow tables. A successful count comparison in one database had not established that the server's full application state had moved.

This was the first important reversal: the restore mechanism was usable, but the inventory driving it was incomplete. The practical check needed to begin with every database the server hosted, not just the application database named in the first dump.

## The storage engine decided the restore method

FalkorDB introduced a different constraint. The runbook proposed a save-and-restore path, but the bring-up commit records server-to-server `MIGRATE COPY`. Its explanation was specific: with append-only persistence enabled, placing an RDB file into the new instance was not the intended boot recovery path.

The cutover message reports matching graph counts, including 282 for the memory graph and 8,715 for the code graph. Those are historical author-reported checks, not counts I have independently repeated. What the inspected source establishes is the staged deployment and the caller changes around that transfer.

The old instance also held the external NodePort. The new service began with an internal ClusterIP, allowing in-cluster callers to move without having both instances compete for the same external port. The cutover message left reintroducing the NodePort conditional on whether external access was still needed.

Qdrant made the inventory problem visible again. Its bring-up message names four collections: `claude_agent_memory`, `rootweaver_quick_facts`, `rootweaver_vault` and `rootweaver_vault_v2`. The backup job's snapshot request named `rootweaver_vault`. That job was useful tooling, but its scope was not a complete inventory of the source service.

The source records server-side recovery from snapshot URLs. Before the caller flip, the cutover message reports matching counts across all four collections: 31,022 vault points, 16,657 in the second vault collection, 60 quick facts and four agent-memory points. Matching counts were a useful migration check; they were not a comprehensive semantic test of every stored item.

A follow-up changed the backup job's startup behaviour too. It added retries around a read-only health request before making the snapshot-creation request. The historical comment attributes early connection failures to network-policy programming delay. That timing explanation is retained as the author's diagnosis. The directly inspected change is narrower: wait for a successful health check, then issue the state-changing request once. Retrying a read and repeatedly creating a large snapshot have different consequences.

## Database state included the people allowed to use it

Vault Postgres was the final store. Restoring its tables was only part of restoring the application. PostgreSQL database dumps do not include cluster-global roles; those require separate handling. The [PostgreSQL documentation distinguishes database dumps from global objects](https://www.postgresql.org/docs/current/app-pg-dumpall.html).

The final cutover message reports 6,725 memory facts, the relevant schemas, the `memory_writer` role and 49 grants on memory objects. It also records connection-secret updates in the caller namespaces. Changing the database host in a Deployment would not fix a connection string that still carried the old hostname inside a Secret.

The original draft describes a credential-handling exposure during this work. The selected source independently establishes a subsequent credential-rotation commit and three re-sealed connection-secret copies. I am keeping the precise exposure mechanism at historical-report level rather than reconstructing it from absent command output. No credential values are needed to explain the lesson: migration completeness includes authentication and permissions, and a credential incident needs its own corrective action.

## The old namespace could go while the indexing tail remained

Thursday's cleanup found another dependency on the old address. The console's review-tracker upstream had been baked into its nginx configuration. A compatibility alias kept that old name usable after the receiver moved, which also kept the old namespace useful.

The inspected application and GitOps changes made the upstream configurable and set `REVIEW_TRACKER_URL` to the service in `rw-sre`. The alias could then be removed. This was a useful kind of migration blocker to identify: something can keep working through a compatibility layer while preventing that layer's retirement.

The teardown commits remove the two Flux Kustomizations and later the old infrastructure directory. Their messages record the namespace deletion as an out-of-band operation and the corpus volumes as retained. The earlier ledger attributes the destructive command to me after the agent was blocked. That attribution comes from the historical account; Git records the management changes, not a new observation of my terminal.

The deletion did not finish the ingestion recovery. The afternoon deployment of the malformed-input fix, and the evening embedding work, came later. Ending the story at an empty namespace would hide the failures still visible through the new layout.

## One stuck partition needed two different failure decisions

A file event passes through more than a network connection. The consumer needs to read the document, split it into chunks, obtain embeddings and write them before acknowledging the event. A failure anywhere along that route can leave the same event at the head of its Kafka partition.

The first newly exposed problem was a chunking exception. Treating every indexing failure as temporary meant retrying the same bad input could prevent later events from advancing. The historical deployment message identifies this as the poison-input repair. I have inspected the consumer and indexer source at its merge revision, rather than relying only on that message.

![The engineer lifts a torn sheet from a document scanner while intact papers wait in the queue.](/posts/s4e13/review-v1/inline-v1/classification.png)

<p class="caption">A classified bad input and a temporary dependency failure need different retry decisions. Conceptual illustration.</p>

<div class="code-source">Exact historical excerpt · rootweaver-platform/neural-vault/vault_indexer.py · ObsidianVaultIndexer.index_file · commit 414ab031 · lines 839–841</div>

```python
        except Exception as e:
            logger.error(f"Failed to chunk {file_path}: {e}")
            return {"success": False, "permanent": True, "error": str(e)}
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>
<ol>
<li><code>except Exception as e</code> catches an exception from the preceding file-reading and chunking block and gives it the local name <code>e</code>.</li>
<li>The logger records that chunking failed, including the file path and exception message.</li>
<li>The returned result says indexing did not succeed and classifies this failure as permanent. The consumer can use that distinction when deciding whether to acknowledge the event. It is this implementation's classification boundary, not proof that every possible exception caught here is irreparable.</li>
</ol>
</details>

The consumer's permanent-failure branch commits that specific message and continues. Its transient-failure branch stops without committing, allowing a later job to retry. Embedding-request failures are returned as non-permanent. Advancing past a classified bad input and preserving an event during a service outage are different decisions, both needed to keep the queue useful.

| Failure | Decision in the inspected implementation | Consequence |
|---|---|---|
| Classified permanent chunking failure | Commit that message; continue | The rejected input no longer holds later events behind it |
| Embedding failure classified transient | Stop without committing | The event remains available for retry |
| Successful indexing | Commit that message | The consumer acknowledges completed work |

This is also a trade-off worth keeping visible. A broad catch around chunking can classify more than a neatly defined malformed document. The fix changes progress and retry behaviour; it does not make the rejected document successfully indexed.

## Ready was not the same as useful

Thursday's later embedding failures were not another occurrence of the same bad-file problem. The retained incident report describes valid, non-empty documents whose embedding requests timed out or took minutes. The consumer was preserving those events for retry, as designed. Now the dependency needed attention.

The report says the Mini embedding service remained Kubernetes-ready through TCP checks while struggling with the actual workload. A listening socket did not establish that the model could return a useful embedding promptly.

The recovery moved the service temporarily to a GPU-backed lane. But changing a Service selector did not make every existing job immediately show the new performance. The incident account compares a slow active job with a fast fresh request from the same pod after the route changed. That supported restarting the job; it did not independently identify every detail of the connection's internal path.

The sequence also included a return to Mini, a reduction from multi-chunk requests to one chunk per client request, and another temporary GPU recovery when Mini remained too slow. Batch size here described request shape, not embedding-vector dimension. Those were attempts in an evolving recovery, not one clean switch that permanently solved the workload.

## The last event needed a smaller threshold

Friday morning supplied one more layer. The report says the three vault consumer groups each reached a single pending event with no active jobs. The ScaledJobs used an activation threshold of one. KEDA's activation threshold is a boundary the lag must exceed, so one waiting event could remain below activation. The [KEDA Kafka scaler documentation describes this activation setting](https://keda.sh/docs/2.18/scalers/apache-kafka/).

The historical diff changes `activationLagThreshold` from `"1"` to `"0"` for the vault delta, Postgres delta and NER consumers, retaining `lagThreshold: "1"`. The small remaining queue was a different failure from malformed input or slow embeddings. It needed a trigger correction rather than another database restore.

![One envelope waits on an otherwise empty conveyor beneath an inactive sorting arm while the engineer checks its switch.](/posts/s4e13/review-v1/inline-v1/activation.png)

<p class="caption">One final event can wait indefinitely when it cannot cross the activation boundary. Conceptual illustration.</p>

The final incident entry reports all three consumer groups at zero lag, the primary embedding Service back on Mini, and the temporary GPU deployment scaled down. The Friday commits support the threshold and routing changes. The zero-lag result remains a dated operational report; this reconstruction has not re-run that historical workload.

## What I would carry into the next migration

I would make the inventory broader than the backup job: every database, collection, role, grant, connection string and caller that gives the stored data meaning. The missing MLflow database is particularly useful evidence because an earlier count check had passed. The problem was what the check omitted.

I would keep the store-by-store sequence, but make the verification questions explicit. Does the target contain the expected state? Can the application authenticate and use it? Are writers pointing at the intended copy? Can the old service and compatibility aliases actually be retired? Each question needs evidence at its own layer.

For indexing, I would separately check bad-input handling, a real embedding request, message acknowledgement and activation with just one pending event. The namespace migration, poison-input fix, dependency recovery and scaler change solved different parts of the same path. None of those successes made the next one unnecessary.

Next in the verified sequence is Episode 14, **Measuring the Pipeline — CI Fires + DORA**. The focus shifts from moving the platform's workloads to examining the delivery system that changes them.

<details data-glossary id="glossary"><summary>Glossary</summary><div class="glossary-tools" hidden><label>Find a term <input type="search" aria-label="Search glossary"></label><button type="button">Clear</button><span role="status"></span></div><section class="glossary-term"><h3>Database dump</h3><p>An export of one database’s objects and data; global roles need separate handling. <a href="https://www.postgresql.org/docs/current/app-pg-dumpall.html">Official reference</a></p></section><section class="glossary-term"><h3>Collection snapshot</h3><p>A recoverable snapshot of a Qdrant collection, with scope limited to that collection. <a href="https://qdrant.tech/documentation/tutorials-operations/create-snapshot/">Official reference</a></p></section><section class="glossary-term"><h3>Kafka offset</h3><p>A consumer’s recorded position within a partition; committing acknowledges progress. <a href="https://kafka.apache.org/41/design/design/">Official reference</a></p></section><section class="glossary-term"><h3>Transient failure</h3><p>A retryable failure classification used here for dependency failures such as embedding timeouts. <a href="https://kafka.apache.org/41/design/design/">Official reference</a></p></section><section class="glossary-term"><h3>Service selector</h3><p>Labels used by a Kubernetes Service to identify its backing pods. <a href="https://kubernetes.io/docs/concepts/services-networking/service/">Official reference</a></p></section><section class="glossary-term"><h3>Activation threshold</h3><p>The boundary that pending work must exceed before KEDA activates a scaler. <a href="https://keda.sh/docs/2.18/scalers/apache-kafka/">Official reference</a></p></section></details>

<details class="source-note"><summary>Sources and reconstruction limits</summary><p>This is a curated reconstruction of June 17–18, 2026, explicitly extended through the June 19 recovery closeout. It uses the canonical season plan, original pre-crafted episode, Wave 3 runbook, selected GitOps/source history and the retained embedding incident report. Historical commit messages and incident checks remain author-reported runtime evidence. No native conversation bodies or complete session replay were recovered. Later June 21 permission work and unrelated parallel arcs are excluded; the source/claim ledger records material omissions and corrections.</p></details>

<script src="/posts/s4e13/review-v1/reader.js" defer></script>
