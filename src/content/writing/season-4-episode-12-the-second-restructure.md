---
title: The Second Restructure — Cutover Waves + the Hero Bug
author: Ryan Duffy
description: Moving workloads into functional namespaces exposed the dependencies held at the other end of each connection.
episode: 12
series: 'Season 4: Building in Public — The Agent Era'
draft: false
featured: false
pubDatetime: 2026-10-19T06:38:12.085104+00:00
shippingDatetime: 2026-10-19T06:38:12.085104+00:00
reading_time: 16 minutes
tags: [rootweaver, kubernetes, gitops, networkpolicy, building-in-public, season-4]
---
By the middle of June, Rootweaver's application namespace had become a poor description of the system inside it. Retrieval, memory, indexing, journals, frontends and operations jobs all lived in the same bucket. I wanted boundaries that made the platform easier to reason about and gave each function its own resource and access controls. Moving the workloads meant finding the dependencies hidden outside them.

![The navy-hooded engineer surveys separate turbine halls connected by conduits along a rocky coast.](/posts/s4e12/review-v1/character-v2/hero.png)

<p class="caption">Functional boundaries still need working connections. Conceptual illustration.</p>

The previous episode followed the agent's memory-maintenance loop. This episode returns to June 16–18 and the infrastructure underneath those workflows. The earlier restructure had changed the codebase. This one changed where its services ran, which names they resolved and which connections the cluster would admit.

I directed and reviewed the work, with coding agents assisting with implementation and investigation. This account draws on the decisions, reports and GitOps history retained from that week. The source note at the end explains the reconstruction's limits.

## Choose boundaries before moving workloads

ADR-080, **Cluster-Wide Namespace Taxonomy and rootweaver Decomposition**, recorded roughly 100 pods in the old namespace: about 29 Deployments, four StatefulSets, 20 CronJobs and 28 Services. The problem was more than the length of the pod list. Unrelated functions shared an operational boundary that had grown by default.

A namespace gives Kubernetes a scope for names, permissions and resource accounting. It does not provide network isolation merely by existing. For that, the selected pods need appropriate NetworkPolicies and a network implementation that enforces them. I wanted the resulting boundaries to carry operational meaning, rather than just make a long pod list look tidier.

The recorded decision rejected a coarse four-namespace split in favour of per-function boundaries. Stable infrastructure namespaces would retain their names and receive classification labels; recreating them solely to impose a naming scheme would add risk. The application plane would move into eleven new namespaces.

| Boundary | Function |
|---|---|
| `rw-rag`, `rw-embed` | Retrieval serving and embeddings |
| `rw-memory`, `rw-mcp` | Agent memory and tool gateways |
| `rw-ingest`, `rw-codeintel` | Corpus indexing and code intelligence |
| `rw-journal`, `rw-sre` | Journal processing and operations |
| `rw-frontend`, `rw-platform` | User interfaces and shared application utilities |
| `rw-data` | The five stateful stores, moved in a later wave |

The first uncertainty was whether that design required a larger network migration. The June 16 technical journal still repeated the earlier assumption that kube-router could not enforce the required cross-namespace selectors and that a broad pod-network address rule was the interim answer. The updated ADR records a different result: combined namespace and pod selectors worked on the then-running k3s version, including a test with client and server deliberately placed on different nodes.

Those agent-reported tests changed the plan. Namespace decomposition could proceed on the existing CNI, while Cilium became optional later work. That kept the migration focused on the application's boundaries instead of making it depend on replacing the cluster's network layer.

## Prepare the route, then pilot the move

The migration was staged to keep rollback manageable. Groundwork came first, a frontend pilot followed, the application services moved next, and the stores came last. An application could move while continuing to reach a database in the old namespace. Moving a database introduced backup, restore and caller-cutover work that deserved its own stage.

Three pieces of preparation made that sequence practical. A reusable namespace template supplied quota, resource defaults, RBAC and base network policy. Explicit service names removed the assumption that every dependency lived beside its caller. A reflector arrangement made the registry pull secret available in the new namespaces without treating a Secret in one namespace as a cluster-wide credential.

Consider an address such as `tei-embedding:8090`. The short name is resolved relative to the caller's namespace. After an indexing pod moves to `rw-ingest`, that address no longer identifies a service remaining elsewhere. `tei-embedding.rw-embed.svc.cluster.local:8090` makes the intended receiver explicit. Correct DNS gets the request to the right destination; it does not grant permission to connect.

The frontend pilot also changed assumptions before the larger move. Its June 17 implementation report says the console's upstream addresses were already explicit enough to avoid rebuilding the image for that step. But the expected secrets were plain runtime Secrets rather than existing sealed manifests ready to copy. The report also records desktop-local mounts that required deliberate placement, and a suspended source Flux Kustomization that made the cutover a coordinated resume window.

The report captured preparation, before cutover. Once the manifests passed Kustomize checks, the next step was the coordinated move into `rw-frontend`: bring up the target, prune the old copies during the source's resume window, then check the moved services.

| Stage | What changed | What stayed behind |
|---|---|---|
| Groundwork | Labels, templates, explicit service addresses and pull-secret reflection | Workloads remained in their original namespaces |
| Frontend pilot | Four interfaces prepared for `rw-frontend`, with a coordinated source-prune window | The rest of the application plane |
| Application plane | Services moved into nine functional destinations | The five stores remained in `rootweaver` for this wave |
| Stateful wave | Backup, restore and caller cutovers for `rw-data` | Detailed in the next episode |

## The receiver remembered the old namespace

Wednesday's application-plane moves followed the template, but the dependencies were not identical. The indexers moved into `rw-ingest`; the embedding service had already moved into `rw-embed`. The callers' outbound policy had been updated. The receiver's inbound allow-list still selected those callers in `rootweaver`.

![The navy-hooded engineer checks the access reader beside a closed steel mesh gate in an industrial courtyard, with an equipment trolley waiting outside.](/posts/s4e12/review-v1/receiver-grounded-v1/option-3.png)

<p class="caption">The caller moved; the receiving gate still expected the old identity. Conceptual illustration.</p>

This is the central defect in commit `96fd7669`. A combined peer with a `namespaceSelector` and a `podSelector` means that both conditions must hold for that peer. The application label survived the move. Its namespace did not. A rule that previously admitted the indexer therefore stopped matching it.

<div class="code-source">Exact historical excerpt · rootweaver-gitops/infrastructure/rw-embed/tei-embedding-networkpolicy.yaml · 96fd7669^ · lines 38–43</div>

```yaml
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: rootweaver
          podSelector:
            matchLabels:
              app: vault-delta-indexer
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

1. Line 1 begins one allowed peer in the receiver’s inbound list.
2. Line 2 introduces the namespace label conditions.
3. Line 3 selects the rootweaver namespace; this is the value changed by the repair.
4. Line 4 adds a pod selector within the same peer, making the namespace and pod conditions apply together.
5. Line 5 introduces the pod label conditions.
6. Line 6 selects pods carrying app: vault-delta-indexer. The excerpt is a peer fragment, not a complete standalone policy.

</details>

The indentation carries the mechanism. These selectors are part of one peer entry, so the rule admits the selected application within the selected namespace. Separating them into different list entries would describe a different, broader set of peers. Changing a value while preserving that structure is a small edit with a large effect on who can connect.

The repair changed the consumer's namespace in the receiver's allow-list. The corresponding excerpt after the change is:

<div class="code-source">Exact historical excerpt · rootweaver-gitops/infrastructure/rw-embed/tei-embedding-networkpolicy.yaml · 96fd7669 · lines 40–45</div>

```yaml
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: rw-ingest
          podSelector:
            matchLabels:
              app: vault-delta-indexer
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

1. Line 1 begins one allowed peer in the receiver’s inbound list.
2. Line 2 introduces the namespace label conditions.
3. Line 3 selects the rw-ingest namespace; this is the value changed by the repair.
4. Line 4 adds a pod selector within the same peer, making the namespace and pod conditions apply together.
5. Line 5 introduces the pod label conditions.
6. Line 6 selects pods carrying app: vault-delta-indexer. The excerpt is a peer fragment, not a complete standalone policy.

</details>

The repair updated three moved consumers and added `dlq-replay-connector-docs`, a fourth consumer that already had outbound access configured but had never appeared in the receiver's list. Checking the inbound rule exposed a pre-existing gap alongside the migration regression.

<figure class="diagram"><button type="button" data-flow-motion aria-pressed="false">Pause flow</button><div class="flow-desktop"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 190" role="img" aria-label="A request from rw-ingest must pass outbound and receiver inbound rules before reaching rw-embed"><defs><pattern id="grid-d" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arrow-d" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0 0L6 3L0 6" fill="none" stroke="#a78bfa"/></marker></defs><style>text{font-family:system-ui,sans-serif;fill:#e9eaee}.sub{fill:#aab0bc;font-size:13px}.motion{stroke-dasharray:3 7;animation:travel 1.4s linear infinite}@keyframes travel{to{stroke-dashoffset:-20}}@media(prefers-reduced-motion:reduce){.motion{animation:none}}</style><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#grid-d)"/><path d="M141 56h190" data-flow-edge="edge-d-0" stroke="#a78bfa" stroke-width="1.5" fill="none" marker-end="url(#arrow-d)" class="motion"/><circle cx="110" cy="56" r="28" fill="#1c1e24"/><path d="M-10 -9h20v18h-20zM-6 -4h12M-6 1h8M-6 6h10" transform="translate(110 56)" stroke="#e9eaee" stroke-width="1.6" fill="none" stroke-linejoin="round" stroke-linecap="round"/><text x="110" y="106" text-anchor="middle" font-size="15">Indexer</text><text class="sub" x="110" y="127" text-anchor="middle">rw-ingest</text><path d="M396 56h190" data-flow-edge="edge-d-1" stroke="#a78bfa" stroke-width="1.5" fill="none" marker-end="url(#arrow-d)" class="motion"/><circle cx="365" cy="56" r="28" fill="#1c1e24"/><path d="M-11 -10v20M-8 0h20M5 -7l7 7-7 7" transform="translate(365 56)" stroke="#e9eaee" stroke-width="1.6" fill="none" stroke-linejoin="round" stroke-linecap="round"/><text x="365" y="106" text-anchor="middle" font-size="15">Egress</text><text class="sub" x="365" y="127" text-anchor="middle">Outbound rule</text><path d="M651 56h190" data-flow-edge="edge-d-2" stroke="#a78bfa" stroke-width="1.5" fill="none" marker-end="url(#arrow-d)" class="motion"/><circle cx="620" cy="56" r="28" fill="#1c1e24"/><path d="M11 -10v20M-12 0h20M1 -7l7 7-7 7" transform="translate(620 56)" stroke="#e9eaee" stroke-width="1.6" fill="none" stroke-linejoin="round" stroke-linecap="round"/><text x="620" y="106" text-anchor="middle" font-size="15">Ingress</text><text class="sub" x="620" y="127" text-anchor="middle">Receiver rule</text><circle cx="875" cy="56" r="28" fill="#1c1e24"/><path d="M-10 -8l10-6 10 6v16l-10 6-10-6zM-10 -8L0 -2l10-6M0 -2v16" transform="translate(875 56)" stroke="#e9eaee" stroke-width="1.6" fill="none" stroke-linejoin="round" stroke-linecap="round"/><text x="875" y="106" text-anchor="middle" font-size="15">Embeddings</text><text class="sub" x="875" y="127" text-anchor="middle">rw-embed</text></svg></div><div class="flow-mobile"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 340 570" role="img" aria-label="A request from rw-ingest must pass outbound and receiver inbound rules before reaching rw-embed"><defs><pattern id="grid-m" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arrow-m" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0 0L6 3L0 6" fill="none" stroke="#a78bfa"/></marker></defs><style>text{font-family:system-ui,sans-serif;fill:#e9eaee}.sub{fill:#aab0bc;font-size:13px}.motion{stroke-dasharray:3 7;animation:travel 1.4s linear infinite}@keyframes travel{to{stroke-dashoffset:-20}}@media(prefers-reduced-motion:reduce){.motion{animation:none}}</style><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#grid-m)"/><path d="M170 124v47" data-flow-edge="edge-m-0" stroke="#a78bfa" stroke-width="1.5" fill="none" marker-end="url(#arrow-m)" class="motion"/><circle cx="170" cy="45" r="28" fill="#1c1e24"/><path d="M-10 -9h20v18h-20zM-6 -4h12M-6 1h8M-6 6h10" transform="translate(170 45)" stroke="#e9eaee" stroke-width="1.6" fill="none" stroke-linejoin="round" stroke-linecap="round"/><text x="170" y="95" text-anchor="middle" font-size="15">Indexer</text><text class="sub" x="170" y="116" text-anchor="middle">rw-ingest</text><path d="M170 264v47" data-flow-edge="edge-m-1" stroke="#a78bfa" stroke-width="1.5" fill="none" marker-end="url(#arrow-m)" class="motion"/><circle cx="170" cy="185" r="28" fill="#1c1e24"/><path d="M-11 -10v20M-8 0h20M5 -7l7 7-7 7" transform="translate(170 185)" stroke="#e9eaee" stroke-width="1.6" fill="none" stroke-linejoin="round" stroke-linecap="round"/><text x="170" y="235" text-anchor="middle" font-size="15">Egress</text><text class="sub" x="170" y="256" text-anchor="middle">Outbound rule</text><path d="M170 404v47" data-flow-edge="edge-m-2" stroke="#a78bfa" stroke-width="1.5" fill="none" marker-end="url(#arrow-m)" class="motion"/><circle cx="170" cy="325" r="28" fill="#1c1e24"/><path d="M11 -10v20M-12 0h20M1 -7l7 7-7 7" transform="translate(170 325)" stroke="#e9eaee" stroke-width="1.6" fill="none" stroke-linejoin="round" stroke-linecap="round"/><text x="170" y="375" text-anchor="middle" font-size="15">Ingress</text><text class="sub" x="170" y="396" text-anchor="middle">Receiver rule</text><circle cx="170" cy="465" r="28" fill="#1c1e24"/><path d="M-10 -8l10-6 10 6v16l-10 6-10-6zM-10 -8L0 -2l10-6M0 -2v16" transform="translate(170 465)" stroke="#e9eaee" stroke-width="1.6" fill="none" stroke-linejoin="round" stroke-linecap="round"/><text x="170" y="515" text-anchor="middle" font-size="15">Embeddings</text><text class="sub" x="170" y="536" text-anchor="middle">rw-embed</text></svg></div><figcaption>Conceptual request path: both policy directions must admit the connection. Moving dots show direction, not live traffic or proof of successful execution.</figcaption></figure>

The commit message reports an unreachable embedding URL, a connection error, zero processed items and a failed item. It also reports that the Kafka offset did not advance, so the next KEDA-spawned job received the same work again. Four firing lag or unconsumed-topic alerts are recorded in that message. Those observations explain how an indexing failure could continue behind an otherwise plausible deployment view: restarting the consumer did not remove the condition that prevented it from finishing.

The ingest cutover and policy-repair commits are about two hours and 47 minutes apart. That brackets the changes in the source history; the exact runtime recovery time is not retained. The important failure mechanism is clear in the recorded diagnosis: new jobs kept encountering the same closed path to the embedding service.

The practical rule is to treat a moved workload as a change to both ends of every connection. Search for the caller in receiver policies, including receivers moved in earlier waves. A dependency matrix helps identify the edges; reading the complete receiver policy tells you what those edges actually allow.

## The first diagnosis was still too narrow

The same day supplied a stronger lesson than a single missed edit. When MLflow moved to `rw-platform`, it could not reach research-postgres. An initial attempt widened its outbound rule to a pod-network address range. The later correction's commit message explicitly says that attempt did not help.

The receiver was the problem again. Research-postgres's allow-list was bundled in the SRE agent's policy file. It admitted MLflow through a same-namespace pod selector. Once MLflow moved, that selector no longer described the caller. The historical correction at `9f9e3182` changes the receiver to an explicit namespace-and-pod peer and removes the broad outbound workaround.

The connection error had led the investigation toward the caller's egress. The fix required reading the receiver's whole policy, including its default-deny context and an allow-list stored somewhere less obvious. The correction's commit message records that an earlier, truncated search had missed both. The investigation had to follow the dependency further than the first search result.

Other corrections made the cutover pattern more specific. Moved pods needed the labels their policies selected. MLflow needed more quota. A dormant PVC changed what Flux should wait for. Each move still required checking identity, capacity and readiness against the actual workload.

The nine application destinations did not move in nine identical steps. Platform utilities needed more than one change, and the SRE plane moved after the other services. A successful earlier move supplied a pattern to reuse, but the next workload could still have a different dependency.

## Review ownership as well as connectivity

Network policy was only one kind of dependency. A ClusterRole is not namespaced, and neither is a ClusterRoleBinding. Moving a workload does not give a cluster-scoped object a new identity. If source and target Flux Kustomizations both refer to the same name, pruning the source can remove an object the target expects to own.

The SRE-plane migration commit records renaming cluster-scoped RBAC objects with the destination namespace in their names and checking for shared names between the rendered builds. The frontend pilot used the same precaution. That gave the source and target distinct object names, so pruning the old configuration would not target the new configuration's role or binding.

![The navy-hooded engineer traces a conduit between separate test modules at a daylight review table.](/posts/s4e12/review-v1/character-v2/review.png)

<p class="caption">Follow the connection beyond the moving workload. Conceptual illustration.</p>

Fresh review mattered because the moving workload was only one place to look. The SRE migration touched receiver policies, monitoring routes, probe targets and console upstreams. A service could have its new address in application configuration while an allow-list or monitoring target still described the old boundary.

A further review catch came early on Thursday, after the store cutovers. Radar's outbound rule still bundled two destinations under the old namespace. Commit `d6696784` split the database connection into a rule targeting `rw-data`. The retained ledger attributes that catch to three read-only Codex review passes with different lenses.

That correction belongs after the database moves in the chronology, even though it reinforces this episode's lesson. The caller's configuration and its network rule could disagree about where the database lived. Moving another layer changed the connection again, and review had to follow it.

## What the restructure established

The application-plane cutover turned the namespace plan into a set of concrete dependencies. The embedding receiver and research-postgres exposed the same weakness from different callers: updating the moving workload was only half the connection. The RBAC work added a separate ownership problem, because some resources did not have a namespace to move with them.

I would still choose functional boundaries and a staged migration. The changes made the dependencies easier to describe, but also made assumptions visible that the shared namespace had concealed. The runbook needed to capture those assumptions before the next move repeated them.

The lessons I would carry into another migration are practical:

- **Describe each connection at both ends.** Record the caller's namespace, receiver, port, outbound rule and inbound rule. Update the receiver in the same reviewed change when a caller moves.
- **Read the whole receiver policy.** A broad outbound workaround can add permissions without fixing an inbound rejection. Follow a search hit into its full context before changing the rule.
- **Keep source checks and runtime checks separate.** Composition, reconciliation, startup and a successful dependency request answer different questions. Scheduled and dormant workloads need deliberate coverage.
- **Give cluster-scoped resources explicit ownership.** Namespace changes do not distinguish identically named ClusterRoles for two reconcilers.
- **Use metrics that show completed work.** In this case, a running consumer was less informative than advancing offsets and successful indexing. The historical alerts reported stalled progress, not a complete diagnosis.

I would keep the staged order. It separated application moves from state restoration and exposed assumptions while rollback was still comparatively manageable. I would strengthen the receiver discovery and end-to-end checks around it. The aim is a set of boundaries whose dependencies are visible enough to test, rather than a collection of new namespace names.

The stores followed the app plane later that Wednesday. Episode 13, **“Fix One Layer, Expose the Next,”** follows the stateful cutovers and the indexing failures that remained once connectivity was repaired.

<details data-glossary id="glossary"><summary>Glossary · six terms and official references</summary><div class="glossary-tools" hidden><label for="glossary-search">Find a term</label> <input id="glossary-search" type="search"/><button type="button" data-glossary-clear>Clear</button><p class="glossary-status" role="status"></p></div><section class="glossary-term"><h3>Namespace</h3><p>A scope for resource names and controls. Namespace creation alone does not isolate traffic. <a href="https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/">Official reference</a></p></section><section class="glossary-term"><h3>NetworkPolicy</h3><p>Rules selecting pods and allowed network peers. Inbound and outbound isolation are evaluated for their respective selected pods. <a href="https://kubernetes.io/docs/concepts/services-networking/network-policies/">Official reference</a></p></section><section class="glossary-term"><h3>Combined selectors</h3><p>A namespace selector and pod selector inside one peer select pods satisfying both conditions. Separate peer entries admit their alternatives. <a href="https://kubernetes.io/docs/concepts/services-networking/network-policies/#behavior-of-to-and-from-selectors">Official reference</a></p></section><section class="glossary-term"><h3>FQDN</h3><p>A fully qualified domain name makes the service namespace explicit; a short service name is resolved in the caller’s namespace. <a href="https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/">Official reference</a></p></section><section class="glossary-term"><h3>Flux Kustomization</h3><p>A Flux resource that composes and reconciles declared objects. Pruning removes previously managed objects absent from the desired configuration. <a href="https://fluxcd.io/flux/components/kustomize/kustomizations/">Official reference</a></p></section><section class="glossary-term"><h3>ScaledJob</h3><p>KEDA’s mechanism for creating Jobs in response to event-source demand. Creating another Job does not itself repair a dependency that makes processing fail. <a href="https://keda.sh/docs/2.18/concepts/scaling-jobs/">Official reference</a></p></section></details>

<details class="source-note"><summary>About this reconstruction</summary>
<p>The core period is June 16–18, 2026, centred on Wednesday's application-plane migration. The Thursday radar review is marked as a retrospective. Sources are ADR-080, the frontend authoring report, bounded technical-journal entries, the retained June evidence ledger and selected historical GitOps manifests and messages. The source/claim ledger beside this draft records the inventory and omissions.</p>
<p>The five store migrations, namespace teardown and later indexing aftermath are reserved for Episode 13. Parallel budget and agent-harness work, personal reflections, employer material, credentials and native conversation bodies are outside this reconstruction. The pre-crafted Episode 12 remains unchanged for comparison. Conceptual artwork illustrates mechanisms; it is not a historical screenshot. This review did not independently rerun the historical tests or replay the complete migration.</p>
</details>


<script src="/posts/s4e12/review-v1/flow-motion.js" defer></script>
<script src="/posts/s4e12/review-v1/reader.js" defer></script>
<style>.flow-mobile{display:none}.diagram{background:#141414;color:#e9eaee;padding:16px;border-radius:8px}.diagram svg{width:100%;height:auto}.diagram figcaption{color:#aab0bc;font-size:12px}.diagram button{background:#1c1e24;color:#e9eaee;padding:6px 10px}.flow-paused .motion{animation-play-state:paused!important}@media(max-width:600px){.flow-mobile{display:block}.flow-desktop{display:none}}</style>
