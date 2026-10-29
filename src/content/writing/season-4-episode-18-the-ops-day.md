---
title: "The Ops Day"
author: Ryan Duffy
pubDatetime: 2026-10-29T08:50:48Z
shippingDatetime: 2026-10-29T08:50:48Z
draft: false
episode: 18
series: 'Season 4: Building in Public — The Agent Era'
description: "Attention, routing and the human action after an alert."
tags: [rootweaver, engineering, building-in-public, season-4]
---

The platform could tell me something was wrong. The harder question was what happened between that signal and my first useful action.

By Saturday 27 June, Rootweaver had accumulated alerts, dashboards, bots and several ways to reach them. Some of the operating surface still came from an earlier life: the Discord server had been a streaming server. Cost digests and operational messages competed for attention. A receiver still pointed at a namespace that no longer existed. Buttons promised useful actions, but each action needed its own authority, state and failure handling.

![The established Rootweaver engineer in a grounded story setting.](/posts/s4e18/review-v2/hero-A.png)

<p class="caption">Signals need distinct destinations before the next human action is clear. Conceptual artwork, not a historical photograph.</p>

I wanted a shorter path from seeing a problem to understanding what I could safely do. I set the direction, reviewed the choices and confirmed the device experience; coding agents assisted with implementation and investigation. The day's records show that improvement coming through several corrections, rather than one clean deployment.

This reconstruction follows the retained session handovers, implementation reports, ADR and historical source. The generated daily journal is a discovery aid, not a complete record of this work: its summary does not capture this operations arc adequately. Where an outcome survives as a historical report, I say so. Inspecting the code now establishes what that code does; it cannot recreate every observation from the day.

## First, make an alert's destination mean something

The initial problem was attention. A budget digest and a firing service alert both deserved to reach me, but they did not ask for the same response. Putting them together meant doing the classification myself every time I opened the channel.

The Discord cleanup separated critical alerts, warnings and the default alert stream. Cost reporting moved to its own channel; formatting tests acquired a test channel. The morning handover reports that work complete while still describing the interactive relay as a specification awaiting review. That ordering matters. The first improvement was making messages easier to recognise; the buttons came later.

| Signal | Destination | What I should understand immediately |
|---|---|---|
| Critical alert | Critical channel | A higher-priority operational signal |
| Warning | Warning channel | An issue to investigate without treating all messages alike |
| Unmatched severity | Default alert channel | A fallback destination rather than a discarded message |
| Cost digest | Cost channel | Information about budget and pace |
| Formatting test | Test channel | A controlled check of the message presentation |

ADR-087 records my request for colour and severity separation. The first implementation used the `masgustavos/alertmanager-discord` fork, built from source and hosted in the private registry. The channel configuration moved into a SealedSecret. This introduced a maintenance obligation: a self-built image needed its own rebuilds. Moving a webhook out of the manifest improved that configuration; it did not prove that every earlier copy of the secret had disappeared.

The [Prometheus project's Alertmanager documentation](https://prometheus.io/docs/alerting/latest/alertmanager/) describes the routing, grouping and silence mechanisms. My installation still needed to prove its own wiring. A sensible routing table was only useful if the receiver existed and the message arrived in the intended place.

The handover distinguishes two test paths. A direct Discord test checked the bot and formatting. Its pipeline mode sent a synthetic alert through Alertmanager and the forwarder. The distinction is practical: the first could render a perfect message while a receiver upstream remained broken.

That was exactly the sort of broken wire found in the SRE receiver. It still named the old `rootweaver` namespace after the services had moved into the `rw-*` namespaces. The retained records report correcting the destination and observing an HTTP 200 from the collector. That supports the receiver test. It does not demonstrate that a downstream model completed an investigation.

## The relay had to own the interaction

Once the alert had a sensible destination, I wanted to act from the phone where I saw it. Opening another tool, reconstructing the labels and building a silence request was friction at the wrong moment.

The design chose a small HTTP interaction service rather than reviving a persistent gateway bot. Discord would send a signed request when I pressed a button; the relay would verify it and dispatch the action. The plan tied this choice to avoiding the resource profile of the earlier gateway approach. It is a recorded design rationale, not a measured memory benchmark in this episode.

The review decisions were specific: both one-hour and twenty-four-hour Silence buttons, a graceful Triage fallback, and a dedicated interactions hostname. The new service replaced the earlier forwarder because it needed to post app-owned messages and handle their controls. Severity routing remained; the message now had a return path.

[Discord's interactions documentation](https://docs.discord.com/developers/interactions/overview) explains this model. A button click creates an interaction for the application. In Rootweaver, that request reached `/interactions` through the tunnel, then passed signature verification before the handler interpreted the action.

<figure id="story-path" class="story-flow" data-policy-flow><h3>One alert, three different action paths</h3><div class="flow-desktop"><svg xmlns="http://www.w3.org/2000/svg" class="publish-svg" viewBox="0 0 900 485" role="img" aria-labelledby="s4e18-v2-d-title s4e18-v2-d-desc"><title id="s4e18-v2-d-title">One alert, three different action paths</title><desc id="s4e18-v2-d-desc">Inspected historical relay mechanism, simplified. The three controls are alternatives. Ack and Silence require retained context; only Silence adds the owner check. Triage initially returned a fallback. Dots show direction, not live activity.</desc><defs><pattern id="s4e18-v2-d-grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".8" fill="#3b3f4a"/></pattern><marker id="s4e18-v2-d-arrow" viewBox="0 0 10 10" markerWidth="6" markerHeight="6" refX="9" refY="5" orient="auto"><path d="M0 0L10 5 0 10" fill="none" stroke="#a78bfa" stroke-width="1.5"/></marker></defs><style>.publish-svg{font-family:system-ui,sans-serif}.publish-svg .flow-motion{fill:none;stroke:#a78bfa;stroke-width:1.8;stroke-dasharray:3 7;animation:flowdash 1.4s linear infinite}@keyframes flowdash{to{stroke-dashoffset:-20}}.flow-paused .publish-svg .flow-motion{animation-play-state:paused}@media(prefers-reduced-motion:reduce){.publish-svg .flow-motion{animation:none}}</style><rect width="900" height="485" rx="12" fill="#141414"/><rect width="900" height="485" rx="12" fill="url(#s4e18-v2-d-grid)"/><path class="flow-motion" data-flow-edge="" d="M147 50H413" marker-end="url(#s4e18-v2-d-arrow)"/><path class="flow-motion" data-flow-edge="" d="M487 50H753" marker-end="url(#s4e18-v2-d-arrow)"/><path class="flow-motion" data-flow-edge="" d="M827 50H870V160H450V181" marker-end="url(#s4e18-v2-d-arrow)"/><path class="flow-motion" data-flow-edge="" d="M487 215H550V316H150V356" marker-end="url(#s4e18-v2-d-arrow)"/><path class="flow-motion" data-flow-edge="" d="M487 215H550V316H450V356" marker-end="url(#s4e18-v2-d-arrow)"/><path class="flow-motion" data-flow-edge="" d="M487 215H550V316H750V356" marker-end="url(#s4e18-v2-d-arrow)"/><g transform="translate(110,50)"><circle r="29" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M-14 10h28l-4-7V-4c0-17-20-17-20 0v7zM-4 15q4 8 8 0"/></g></g><text x="110" y="101" text-anchor="middle" font-size="17" font-weight="650" fill="#e9eaee">Alertmanager</text><text x="110" y="124" text-anchor="middle" font-size="13" fill="#aab0bc">Severity route</text><g transform="translate(450,50)"><circle r="29" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="-12" y="-16" width="24" height="32" rx="2"/><path d="M-6-7h12M-6 0h12M-6 7h9"/></g></g><text x="450" y="101" text-anchor="middle" font-size="17" font-weight="650" fill="#e9eaee">Relay</text><text x="450" y="124" text-anchor="middle" font-size="13" fill="#aab0bc">Post, then store</text><g transform="translate(790,50)"><circle r="29" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cy="-9" r="7"/><path d="M-16 17v-6c0-8 32-8 32 0v6"/></g></g><text x="790" y="101" text-anchor="middle" font-size="17" font-weight="650" fill="#e9eaee">Discord message</text><text x="790" y="124" text-anchor="middle" font-size="13" fill="#aab0bc">Human selects control</text><g transform="translate(450,215)"><circle r="29" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M0-17l15 6v12c-1 9-8 14-15 17-7-3-14-8-15-17v-12z"/><path d="M-6 0l4 5 9-11"/></g></g><text x="450" y="266" text-anchor="middle" font-size="17" font-weight="650" fill="#e9eaee">Verify request</text><text x="450" y="289" text-anchor="middle" font-size="13" fill="#aab0bc">Signed interaction</text><g transform="translate(150,390)"><circle r="29" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M-18-14h36v24H0l-11 8v-8h-7zM-10-5h20M-10 2h12"/></g></g><text x="150" y="441" text-anchor="middle" font-size="17" font-weight="650" fill="#e9eaee">Ack</text><text x="150" y="464" text-anchor="middle" font-size="13" fill="#aab0bc">Context → message update</text><g transform="translate(450,390)"><circle r="29" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="-7" cy="-6" r="9"/><path d="M0 1l15 15M7 8l4-4M11 12l4-4"/></g></g><text x="450" y="441" text-anchor="middle" font-size="17" font-weight="650" fill="#e9eaee">Silence</text><text x="450" y="464" text-anchor="middle" font-size="13" fill="#aab0bc">Context + owner → bounded API call</text><g transform="translate(750,390)"><circle r="29" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M-8 10v-5c-14-12-3-25 8-23 13 0 20 13 8 23v5zM-7 15H7M-5 19H5"/></g></g><text x="750" y="441" text-anchor="middle" font-size="17" font-weight="650" fill="#e9eaee">Triage</text><text x="750" y="464" text-anchor="middle" font-size="13" fill="#aab0bc">Defer → client or fallback</text></svg></div><div class="flow-mobile"><svg xmlns="http://www.w3.org/2000/svg" class="publish-svg" viewBox="0 0 360 905" role="img" aria-labelledby="s4e18-v2-m-title s4e18-v2-m-desc"><title id="s4e18-v2-m-title">One alert, three different action paths</title><desc id="s4e18-v2-m-desc">Inspected historical relay mechanism, simplified. The three controls are alternatives. Ack and Silence require retained context; only Silence adds the owner check. Triage initially returned a fallback. Dots show direction, not live activity.</desc><defs><pattern id="s4e18-v2-m-grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".8" fill="#3b3f4a"/></pattern><marker id="s4e18-v2-m-arrow" viewBox="0 0 10 10" markerWidth="6" markerHeight="6" refX="9" refY="5" orient="auto"><path d="M0 0L10 5 0 10" fill="none" stroke="#a78bfa" stroke-width="1.5"/></marker></defs><style>.publish-svg{font-family:system-ui,sans-serif}.publish-svg .flow-motion{fill:none;stroke:#a78bfa;stroke-width:1.8;stroke-dasharray:3 7;animation:flowdash 1.4s linear infinite}@keyframes flowdash{to{stroke-dashoffset:-20}}.flow-paused .publish-svg .flow-motion{animation-play-state:paused}@media(prefers-reduced-motion:reduce){.publish-svg .flow-motion{animation:none}}</style><rect width="360" height="905" rx="12" fill="#141414"/><rect width="360" height="905" rx="12" fill="url(#s4e18-v2-m-grid)"/><path class="flow-motion" data-flow-edge="" d="M52 82V119" marker-end="url(#s4e18-v2-m-arrow)"/><path class="flow-motion" data-flow-edge="" d="M52 187V224" marker-end="url(#s4e18-v2-m-arrow)"/><path class="flow-motion" data-flow-edge="" d="M52 292V351" marker-end="url(#s4e18-v2-m-arrow)"/><path class="flow-motion" data-flow-edge="" d="M52 419V525H104" marker-end="url(#s4e18-v2-m-arrow)"/><path class="flow-motion" data-flow-edge="" d="M52 419V665H104" marker-end="url(#s4e18-v2-m-arrow)"/><path class="flow-motion" data-flow-edge="" d="M52 419V805H104" marker-end="url(#s4e18-v2-m-arrow)"/><g transform="translate(52,48)"><circle r="29" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M-14 10h28l-4-7V-4c0-17-20-17-20 0v7zM-4 15q4 8 8 0"/></g></g><text x="103" y="43" text-anchor="start" font-size="17" font-weight="650" fill="#e9eaee">Alertmanager</text><text x="103" y="66" text-anchor="start" font-size="13" fill="#aab0bc">Severity route</text><g transform="translate(52,153)"><circle r="29" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="-12" y="-16" width="24" height="32" rx="2"/><path d="M-6-7h12M-6 0h12M-6 7h9"/></g></g><text x="103" y="148" text-anchor="start" font-size="17" font-weight="650" fill="#e9eaee">Relay</text><text x="103" y="171" text-anchor="start" font-size="13" fill="#aab0bc">Post, then store</text><g transform="translate(52,258)"><circle r="29" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cy="-9" r="7"/><path d="M-16 17v-6c0-8 32-8 32 0v6"/></g></g><text x="103" y="253" text-anchor="start" font-size="17" font-weight="650" fill="#e9eaee">Discord message</text><text x="103" y="276" text-anchor="start" font-size="13" fill="#aab0bc">Human selects control</text><g transform="translate(52,385)"><circle r="29" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M0-17l15 6v12c-1 9-8 14-15 17-7-3-14-8-15-17v-12z"/><path d="M-6 0l4 5 9-11"/></g></g><text x="103" y="380" text-anchor="start" font-size="17" font-weight="650" fill="#e9eaee">Verify request</text><text x="103" y="403" text-anchor="start" font-size="13" fill="#aab0bc">Signed interaction</text><g transform="translate(140,525)"><circle r="29" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M-18-14h36v24H0l-11 8v-8h-7zM-10-5h20M-10 2h12"/></g></g><text x="180" y="574" text-anchor="middle" font-size="17" font-weight="650" fill="#e9eaee">Ack</text><text x="180" y="597" text-anchor="middle" font-size="13" fill="#aab0bc">Context → message update</text><g transform="translate(140,665)"><circle r="29" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="-7" cy="-6" r="9"/><path d="M0 1l15 15M7 8l4-4M11 12l4-4"/></g></g><text x="180" y="714" text-anchor="middle" font-size="17" font-weight="650" fill="#e9eaee">Silence</text><text x="180" y="737" text-anchor="middle" font-size="13" fill="#aab0bc">Context + owner</text><text x="180" y="756" text-anchor="middle" font-size="13" fill="#aab0bc">→ bounded API call</text><g transform="translate(140,805)"><circle r="29" fill="#1c1e24" stroke="#4b435e"/><g fill="none" stroke="#c4b5fd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M-8 10v-5c-14-12-3-25 8-23 13 0 20 13 8 23v5zM-7 15H7M-5 19H5"/></g></g><text x="180" y="854" text-anchor="middle" font-size="17" font-weight="650" fill="#e9eaee">Triage</text><text x="180" y="877" text-anchor="middle" font-size="13" fill="#aab0bc">Defer → client or fallback</text></svg></div><div class="flow-tools"><button type="button" data-flow-motion aria-pressed="false">Pause flow</button><button type="button" data-flow-expand>Expand diagram</button></div><figcaption>Inspected historical relay mechanism, simplified. The three controls are alternatives. Ack and Silence require retained context; only Silence adds the owner check. Triage initially returned a fallback. Dots show direction, not live activity.</figcaption></figure>
<dialog data-flow-dialog aria-label="Expanded diagram"><button type="button" data-flow-close>Close expanded diagram</button><div data-flow-expanded-content></div></dialog>
<script is:inline src="/posts/s4e18/review-v2/flow-ui.js"></script>
<script is:inline src="/posts/s4e18/review-v2/flow-motion.js"></script>

Three different contracts sat behind those buttons. Ack updated the message. Silence requested a bounded suppression of matching notifications. Triage requested an assessment, or returned the configured fallback. Treating all three as “the bot handled it” would hide the important differences.

## Follow one warning through the state and authority checks

Consider a fictional warning about a worker. This is an explanatory input, not a recovered production alert or a full Discord payload.

<p class="code-source">Synthetic Alertmanager-style input. Only the fields needed for this explanation are shown.</p>

```json
{
  "status": "firing",
  "fingerprint": "example-warning-01",
  "labels": {
    "alertname": "WorkerQueueHigh",
    "severity": "warning",
    "service": "demo-worker"
  }
}
```

The severity-specific webhook path selects a channel. The handler skips resolved alerts and alerts without a fingerprint. After a successful Discord post, it stores the fingerprint with the labels and message context. That last ordering is visible in the historical source: the state entry is written after the message call succeeds.

The fingerprint connects a later click to those stored labels. A button identifier carries an action, a parameter and that fingerprint. For example, `silence:1h:example-warning-01` means “request a one-hour silence for the context associated with this alert.” It is not an arbitrary command to run against the cluster.

State lived in memory. The design specified an eight-hour lifetime, and the inspected `AlertStore` sweeps expired entries on reads and writes. Restarting the process loses the map. The interaction handler rejects Ack and Silence when their context has expired and points the user towards Grafana or Alertmanager. Triage is handled differently: its code can proceed with empty stored labels and annotations recovered from the message. The controls therefore do not all have identical context requirements.

For Silence, a valid Discord signature is only the first check. It identifies the request's authenticated delivery path; the handler still compares the acting user with the configured owner.

<p class="code-source">Exact fragment, dedented for reading: services/rw-alert-relay/app/main.py, interactions(), historical commit e81e21aa. Credentials and owner identifiers are omitted.</p>

```python
if action == "silence":
    if user_id != settings.ryan_discord_id:
        return _ephemeral("not authorized to silence alerts.")
    try:
        payload = build_silence(ctx.labels, param, created_by=f"discord:{user_id}")
        sid = await alertmanager.create_silence(payload)
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

1. The first condition selects Silence after the earlier signature, identifier and context checks.
2. The user comparison checks who clicked. Receiving a signed Discord request is not sufficient permission to silence an alert.
3. An unauthorised user receives a private response; the silence API is not called by this branch.
4. The try block begins the operation that can fail independently of Discord's request validation.
5. build_silence uses the stored alert labels and chosen duration. created_by records the acting Discord user.
6. create_silence calls Alertmanager and returns its silence identifier. This requests suppression of notifications; it does not repair the worker.

</details>

The inspected builder permits `1h` and `24h`, sorts the stored labels into equality matchers, excludes `__name__`, and rejects an empty usable matcher set. Each matcher says which alert label must equal which value. That limits the request to the alert context rather than silencing every warning.

Here is the shape produced for the fictional warning, using a fixed example time and a synthetic attribution identifier. This is not a recorded API response.

<p class="code-source">Synthetic expected output from build_silence() in services/rw-alert-relay/app/alertmanager.py, historical commit 40ce19e9. Example time and user are invented.</p>

```json
{
  "matchers": [
    {"name": "alertname", "value": "WorkerQueueHigh", "isRegex": false, "isEqual": true},
    {"name": "service", "value": "demo-worker", "isRegex": false, "isEqual": true},
    {"name": "severity", "value": "warning", "isRegex": false, "isEqual": true}
  ],
  "startsAt": "2026-06-27T12:00:00+00:00",
  "endsAt": "2026-06-27T13:00:00+00:00",
  "createdBy": "discord:example-owner",
  "comment": "silenced via Discord for 1h"
}
```

This makes the boundary concrete. The interface removes JSON assembly from the human action, but the code still needs identity, retained labels and a bounded duration. The deployment did not grant the relay permission to restart a workload.

## What the smoke test established, and what it did not

The later implementation report records thirty passing unit tests and a deployment of the relay's second image. The retained GitOps commit records the receiver migration. Those are useful stages, but the report's own smoke-test table is more precise than its “live end-to-end” headline.

| Path | Historical reported result | Evidence boundary |
|---|---|---|
| Webhook to Discord | Warning embed and five buttons rendered | One reported delivery smoke test |
| Signed registration PING | Endpoint validated and responded | Signature-verification path exercised |
| Ack | Footer changed and button became disabled in Discord's API | Message state changed; service recovery not tested |
| Triage | Deferred response followed by graceful fallback | No live model assessment established |
| Silence | Not tested live | Inspected implementation is not a successful live API call |

Ack also produced a misleading observation: the mobile client appeared not to grey out the button. The report says the Discord message API showed `disabled=true`. That is a useful debugging distinction. The client view and the retained message state were different observations, so an apparently unchanged button did not automatically mean the handler had failed.

Triage's initial deployment left the SRE-brain URL unset. The inspected client returns a fallback in that state. Although the wording says “queued,” the source shown here returns a message; that wording is not evidence of a durable queue or a later completed assessment. With a configured endpoint, the client has a separate HTTP path and marks the model's assessment as display-only content referring to untrusted alert input.

The first version also left operational questions open. Its readiness route examined minimum configuration, not the health of every upstream dependency. Its posting handler caught a Discord failure, continued, and returned the number posted. A comment about redelivery does not itself establish reliable retries: the source does not propagate every failed post as a failing webhook response. I would want the delivery contract checked explicitly before relying on that behaviour during an incident.

## A dashboard link could lose the whole alert

One of the most useful failures came from an optional convenience. The initial code used the alert's `generatorURL` for the Grafana button. That URL could actually be a long Prometheus expression link.

The historical fix records that a live smoke test hit Discord's 512-character button-URL limit. The message was rejected with HTTP 400. The failure affected the entire alert message, not just the link button. I inspected the code change; the original HTTP exchange survives here as a reported observation in the commit and implementation report.

The correction had two parts. The handler used the configured Grafana base URL instead of the alert's generated query URL. The component builder also checked length and omitted an invalid link. An optional dashboard shortcut could then disappear without taking the alert with it.

<p class="code-source">Exact condition from services/rw-alert-relay/app/discord.py, build_components(), historical commit 40ce19e9. The constant is 512 in that source.</p>

```python
if grafana_url and len(grafana_url) <= _BUTTON_URL_MAX:
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

1. grafana_url must contain a value before the builder considers adding the link button.
2. len(grafana_url) checks its character count against the source's configured maximum.
3. Only a passing value enters the following button-construction block. Other alert controls remain in the row.
4. This is one guard against the observed URL-length failure. It does not validate every possible message-format error or prove reliable delivery.

</details>

The design lesson is specific: keep optional presentation features from invalidating the essential signal. A useful control surface needs failure behaviour as carefully considered as its successful path.

## The dashboard's identity boundary needed another pass

The place an alert sends me also matters. The same day's Grafana report describes removing a second local login after Cloudflare Access had authenticated the user through Google. Grafana would consume the identity header injected by the access proxy.

[Grafana Labs documents its auth-proxy mechanism](https://grafana.com/docs/grafana/latest/setup-grafana/configure-access/configure-authentication/auth-proxy/), including the source-address whitelist intended to reduce header spoofing. The local report shows why configuring that option was not enough for this network path.

The legitimate tunnel-to-NodePort hop appeared to Grafana as the node's bridge gateway address. The first configuration trusted that address. A later security review found that a wired LAN request could be rewritten to the same source address by Kubernetes networking. A request carrying a forged identity header could therefore look as though it came through the trusted proxy. The source-address check could not distinguish the paths it was meant to distinguish.

The report records a node-level restriction on direct access to that Grafana NodePort, applied before destination translation, plus moving the local administrator password into a SealedSecret. It also records correcting the emergency login procedure because the database no longer contained the default admin user. These are reported repairs and HTTP checks, not a fresh audit of today's installation or an independently replayed historical exploit.

This belongs beside the relay work because it changes what “open the dashboard” means. An authenticated header is useful only when the route delivering it preserves the intended trust boundary. Successful sign-in alone would not have shown that the bypass path was closed.

## The communications failure looked like a client problem

Matrix then exposed a different misleading signal. One device or connection worked while another received Cloudflare 502 errors. That encouraged client-side explanations: cookies, browser transport, authentication, address family or the home router.

The incident report preserves the tests that narrowed those possibilities. Its wording is a historical diagnosis, not a universal rule about every Cloudflare 502.

| Suspected cause | Test recorded in the incident report | What it narrowed |
|---|---|---|
| Oversized access cookie | A private browsing session still failed | The existing cookie was not required to reproduce the failure |
| Client HTTP/3 behaviour | Forcing the phone to HTTP/2 still failed | Changing client transport did not remove the symptom |
| Authentication redirect | An unauthenticated Matrix API route worked from the unaffected Mac | That route was not uniformly blocked by the identity layer |
| IPv6 versus IPv4 | Both failed from an affected Mac | Selecting one address family did not fix that path |
| Home router | A desktop on the same router still reached the service | The router was not a sufficient explanation for every client outcome |

The more decisive comparison separated the origin from the tunnel. A direct request to Synapse returned HTTP 200 while affected requests through the public hostname failed. The report records repeated `EOF` errors associated with one connector connection and attributes the outage to a wedged HTTP/2 tunnel connection. That was stronger evidence than the symptom “the phone is broken.”

An edge-served trace page had also returned HTTP 200. That result did not exercise the application behind the tunnel. It could establish something about reaching Cloudflare's edge while saying little about reaching Synapse. Choosing the right probe changed the diagnosis.

The first connector cycle did not produce a clean recovery. The report says the failing path shifted between client networks during the restart and transport change. A second connector was then added, and the recorded home-broadband origin-path check changed from thirty failures to thirty HTTP 200 responses. The handover also records my confirmation that the phone and Mac reconnected. I have not recovered and replayed the original request logs.

Both connectors ran on the same desktop. That reduced reliance on one connector process and allowed one-at-a-time restarts. It did not remove the host, power or local network as shared dependencies. A second-node connector was explicitly deferred.

![Engineer looks at two footbridges meeting the same island landing.](/posts/s4e18/review-v2/inline.png)

<p class="caption">Two routes can still depend on one shared place; two connectors on one desktop do not remove host failure. Conceptual artwork, not a historical photograph.</p>

[Cloudflare's tunnel availability guidance](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-availability/) supplies upstream context for replica connections. It does not independently establish the cause or repair of this June outage. The lesson I carry from the retained evidence is to compare an affected client route, an unaffected route and the origin before declaring where the fault lives.

## The documentation loop was reading its own stale baseline

The day's other feedback loop lived in the architecture documentation. The handover reports that the index still said thirty-three namespaces when the observed cluster had forty-two. It also retained four StatefulSets under the old `rootweaver` namespace after that monolithic namespace had gone.

Updating the detailed modules had not corrected the numbers the drift checker actually read. The checker parsed the index's Quick Stats. The updater edited the modules. The next run compared the cluster with the same old index and rediscovered drift. The handover says that stale result could force another full model-assisted documentation run each night.

The historical `drift_check.py` change made the reader and writer share a table of field names, file patterns and numeric matches. The new writer updated just the matched number. It skipped unavailable measurements, missing matches and already-correct values. This was a narrow deterministic repair, not a model rewriting arbitrary architecture prose.

<p class="code-source">Exact fragment, dedented: scripts/drift_check.py, sync_doc_baseline(), historical commit 0ae5cd96. Earlier guards have already selected a file, match and non-null target.</p>

```python
current = int(m.group("n"))
if current == int(target):
    continue
s, e = m.span("n")
new_text = text[:s] + str(int(target)) + text[e:]
if not dry_run:
    path.write_text(new_text, encoding="utf-8")
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

1. Read the number captured by the named group n, rather than treating the whole paragraph as editable content.
2. Compare it with the measured target.
3. Skip the write when they already match. Repeating the operation should not keep changing the file.
4. Find the exact start and end of that numeric substring.
5. Keep the text before and after it and substitute only the new number.
6. Respect dry_run so a caller can inspect proposed changes without writing.
7. Write the bounded replacement only when a real update is requested. This does not validate the accuracy of unrelated architecture prose.

</details>

For the recorded namespace discrepancy, the intended transformation was simply thirty-three to forty-two in the parsed field. That fixes the feedback loop's reference point. It does not prove that every topology drawing, service description or stored source count is current.

There was another wrong turn in the same audit. The initial explanation for sync conflicts was two documentation runs racing. The handover says the differing timestamp formats and YAML ordering instead identified two different writers: the documentation updater and the NER enrichment service, operating on synchronised replicas.

The reported repair excluded the architecture directories from that enrichment path. The handover records forty-five tests and a merged baseline-repair change, plus a separately deployed enrichment exclusion. It still left a wider file-watcher debounce task and an empirical check of the next scheduled run outstanding. The richer Excalidraw topology also remained stale after the simpler topology was updated. Those open items prevent “the docs healed themselves” from becoming a claim that all documentation was now correct.

## What the ops day actually changed

These changes share a practical thread. They reduced ambiguity between a signal and the next decision: what channel it belongs in, which action is permitted, which route a probe exercises, and which baseline an automated check compares.

| Lesson | Check I would carry into the next build |
|---|---|
| Presentation can hide delivery failure | Exercise the complete alert route, including optional links |
| A signed interaction still needs authority | Check the actor, action and retained context separately |
| A button label can overstate the backend | Inspect what “queued,” “acknowledged” and “ready” actually mean |
| One successful route does not cover another | Compare direct origin, public path and affected clients |
| Two processes may share one failure domain | Identify the host and network dependencies beneath them |
| A feedback loop needs the right reference | Update the baseline the checker reads, not just nearby documentation |

The platform had clearer alert destinations and a smaller human action from the message. The relay had reported working delivery, signature and Ack checks, alongside a Triage fallback and an untested live Silence path. Grafana's access work needed a second hardening pass. Matrix's reported recovery improved connector resilience while leaving host redundancy for later. The documentation change repaired a specific recurring baseline mismatch and exposed a separate ownership conflict.

That is enough progress to explain without calling the system autonomous. The human still had to choose what to investigate and verify that the underlying service recovered. Making that boundary clearer was the useful part of the day.

Next: **The Self-Healing Turn** follows the next question: what context a model should receive, how its assessment leaves the system, and which authority should remain with me as triage gains capability.

## Terms and references

<details data-glossary class="glossary"><summary>Glossary — plain-English definitions</summary><div class="glossary-tools" hidden><label for="glossary-search">Find a term</label><div class="glossary-search-row"><input id="glossary-search" type="search"><button type="button">Clear</button></div><p role="status" aria-live="polite"></p></div>
<section class="glossary-term"><h3>Alertmanager</h3><p>The Prometheus component that groups, routes and silences notifications; it does not repair the affected service.</p></section><section class="glossary-term"><h3>Fingerprint</h3><p>An alert identifier used here to retrieve stored labels and message context.</p></section><section class="glossary-term"><h3>Silence</h3><p>A time-bounded rule suppressing matching alert notifications.</p></section><section class="glossary-term"><h3>TTL</h3><p>Time to live: how long retained context remains usable before it expires.</p></section><section class="glossary-term"><h3>Ed25519</h3><p>A digital signature scheme used to verify Discord interaction requests.</p></section><section class="glossary-term"><h3>Auth proxy</h3><p>A trusted intermediary that supplies an authenticated identity to the application.</p></section><section class="glossary-term"><h3>SNAT</h3><p>Source network address translation: rewriting the source address seen by the receiving service.</p></section><section class="glossary-term"><h3>Failure domain</h3><p>A shared dependency whose failure can affect apparently separate routes.</p></section><section class="glossary-term"><h3>Origin path</h3><p>A request reaching the application behind the tunnel, rather than only the edge.</p></section><section class="glossary-term"><h3>Drift baseline</h3><p>The documented reference values that a checker compares with observations.</p></section><section class="glossary-term"><h3>Idempotent update</h3><p>An operation that makes no additional change when repeated against the same desired state.</p></section><section class="glossary-term"><h3>NER</h3><p>Named entity recognition: enrichment that identifies terms in documents; a separate document writer in the recorded conflict.</p></section>
<p>Official references: <a href="https://prometheus.io/docs/alerting/latest/alertmanager/">Prometheus Alertmanager</a>, <a href="https://docs.discord.com/developers/interactions/overview">Discord interactions</a>, <a href="https://grafana.com/docs/grafana/latest/setup-grafana/configure-access/configure-authentication/auth-proxy/">Grafana auth proxy</a> and <a href="https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-availability/">Cloudflare tunnel availability</a>.</p></details>

<details class="source-note">
<summary>How this episode was reconstructed</summary>

This is a curated reconstruction of Rootweaver operations on 27 June 2026. The generated technical log and reflection were checked for coverage; they do not adequately cover this arc and were not used to substantiate its operational claims. Dated session handovers, the routing ADR, relay and Grafana implementation reports, the Matrix incident report and inspected historical commits provide the evidence. No complete native-session replay, exhaustive day inventory or fresh production audit is claimed. Historical reports of tests remain distinct from inspected source and new synthetic examples. Some records use broader completion language than their check tables support; this draft preserves the narrower results.

The original pre-crafted chapter is retained unchanged for comparison. Provider-usage accounting is not repeated as a second central story after the earlier season's usage chapter. Removal of an unused public ingress is not asserted as verified here because a separate supporting implementation record was not recovered in this scoped pass. The wider day also contains provenance, ingestion and quality work outside this operations narrative. Private personal-project material, financial details and credentials are excluded. Current primary documentation explains upstream mechanisms; it does not prove the June deployment. Private evidence snapshots and claim mappings remain outside public site assets.

</details>

<script is:inline src="/posts/s4e18/review-v2/reader.js"></script>
<style is:global>
main{min-width:0}main>p:not(:has(img)){max-width:74ch}main>ul,main>ol{max-width:74ch}.eyebrow{text-transform:none;letter-spacing:.025em}.reading-progress{position:fixed;left:0;top:0;height:3px;width:0;background:var(--accent);z-index:20;pointer-events:none}.reading-tools{max-width:1160px;margin:0 auto;padding:14px 28px 0;display:flex;justify-content:flex-end;gap:8px}.reader-button,.copy-code,.expand-diagram{border:1px solid var(--border);background:var(--card);color:var(--text);padding:7px 11px;border-radius:6px;font-size:11px}.copy-code{float:right;margin-left:10px}.code-source{display:flow-root}.contents a[aria-current="location"]{color:var(--accent);font-weight:600}.reading-focus .contents{display:none}.reading-focus .page-grid{display:block;max-width:800px}.reading-focus .nav-links>a{display:none}.reading-focus .article-header{max-width:none}.diagram{position:relative}.expand-diagram{display:block;margin:12px auto 0;background:#192d46;color:#eef6ff;border-color:#5c86a6}dialog{width:min(96vw,1300px);height:92vh;max-height:92vh;padding:18px;border:1px solid var(--border);border-radius:12px;background:var(--bg);color:var(--text)}dialog::backdrop{background:rgba(0,0,0,.8)}.dialog-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px}.diagram-scroll{overflow:auto;height:calc(100% - 54px);background:#101c2d;border-radius:8px}.diagram-scroll img{width:1200px;max-width:none;border-radius:0;margin:0 auto}.sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:600px){.reading-tools{padding:12px 18px 0}.copy-code{padding:4px 7px}.dialog-head{font-size:12px}dialog{padding:10px}.diagram-scroll img{width:1000px}}
.article-header{border-left:3px solid var(--accent);padding-left:22px}.eyebrow{margin-top:25px}.page-grid{grid-template-columns:minmax(0,740px) 210px;gap:64px}.code-box{box-shadow:0 8px 22px #00000012}h2{border-bottom:0;padding-bottom:0}.caption{border-left:0;padding-left:0}@media(max-width:600px){.article-header{padding-left:15px}}
details.walkthrough{padding:0}details.walkthrough summary{padding:13px 18px;cursor:pointer;color:var(--accent);font-size:12px;font-weight:550;list-style-position:inside}details.walkthrough summary:hover{background:var(--chip)}details.walkthrough[open] summary{border-bottom:1px solid var(--border)}details.walkthrough .explanation-body{padding:14px 18px}details.walkthrough summary:focus-visible{outline-offset:-4px}@media(max-width:600px){details.walkthrough summary{padding:12px 14px}details.walkthrough .explanation-body{padding:12px 14px}}

main{min-width:0}.notebook-article table{display:block;max-width:100%;min-width:0;overflow-x:auto}.table-wrap{overflow:auto;max-width:100%}table{min-width:580px}summary{cursor:pointer}details.glossary,details.source-note{border:1px solid var(--border);border-radius:8px;padding:16px;margin:25px 0}.glossary-term{border-top:1px solid var(--border)}.glossary-tools input{font:inherit;max-width:100%}.glossary-search-row{display:flex;gap:12px}.glossary-search-row input{min-width:0}.glossary-tools button,.flow-tools button{font:inherit;padding:7px 12px}.code-source{font-size:12px}.contents{margin-top:160px}pre{overflow:auto}h3{font-size:17px}figcaption,.caption{font-size:12px}code{overflow-wrap:anywhere;white-space:normal}pre code{white-space:pre}.flow-tools{display:flex;gap:12px;margin:10px 0}.publish-flow{margin:28px 0}.publish-flow h3{margin:0 0 14px}.publish-flow figcaption{line-height:1.6;color:var(--muted,#aab0bc)}.flow-tools button,dialog button{background:#1c1e24;color:#e9eaee;border:1px solid #75608f;border-radius:6px;padding:9px 12px;cursor:pointer}.flow-mobile{display:none}.flow-desktop svg,.flow-mobile svg{display:block;width:100%;height:auto}dialog{color:var(--text);background:var(--bg);border:1px solid var(--border);max-width:min(1150px,95vw);max-height:90vh;width:95vw}dialog::backdrop{background:#000b}.asset-option{margin:38px 0}.review-links{display:flex;gap:18px;flex-wrap:wrap}@media(max-width:600px){input{font-size:16px!important}.flow-desktop{display:none}.flow-mobile{display:block}code{font-size:.88em}}
main{min-width:0}main img{width:100%;height:auto;display:block}.story-flow{margin:28px 0}.story-flow h3{margin:0 0 14px}.story-flow figcaption{font-size:12px;line-height:1.6;color:var(--muted)}.flow-mobile{display:none}.flow-desktop svg,.flow-mobile svg{display:block;width:100%;height:auto}.table-wrap{overflow-x:auto;max-width:100%}.notebook-article table{display:block;min-width:0;max-width:100%;overflow-x:auto}.notebook-article p{font-size:15px}pre{max-width:100%;overflow-x:auto}code{overflow-wrap:anywhere}pre code{white-space:pre}.asset-option{margin:35px 0}.review-links{display:flex;flex-wrap:wrap;gap:14px}summary{cursor:pointer}dialog{max-width:95vw;width:1000px;background:var(--bg);color:var(--text)}dialog::backdrop{background:#000b}@media(max-width:600px){main p,main li{font-size:14px}.flow-desktop{display:none}.flow-mobile{display:block}.glossary-search-row{display:flex;gap:8px}.glossary-search-row input{min-width:0;font-size:16px}}
</style>
<style is:global>@media(max-width:600px){.notebook-article p,.notebook-article li{font-size:14px!important}}</style>
