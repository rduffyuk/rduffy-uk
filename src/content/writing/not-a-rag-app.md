---
title: "Not a RAG App: a Site Rebuild and a Public Decision Log"
author: Ryan Duffy
categories:
- Architecture
- AI Agents
- Building in Public
description: "I rebuilt rduffy.uk into one design system and published 20 of my 77 architecture decision records — a sortable, filterable decision log with the context, the call, and what each cost. Here's what's actually new, plus the one idea that ties it together."
draft: false
featured: true
pubDatetime: 2026-06-28 18:30:00+00:00
reading_time: 9 minutes
series: 'Building in Public'
slug: not-a-rag-app
tags:
- rootweaver
- architecture
- adr
- redesign
- decision-log
- claude-code
---

This week I shipped two things to rduffy.uk: a full rebuild of the site, and something I'd been sitting on for months — a public decision log. **Twenty of the seventy-seven architecture decisions** behind my platform are now readable, with the alternatives I rejected and what each call cost.

This post is about both — what actually changed, what's now there to click on, and the one idea that made publishing it make sense. The narrative is at the bottom; the concrete stuff is first.

## What changed on the site

For three seasons the site had grown the way side-project sites do: a page bolted on whenever I needed one, each with its own spacing, its own colours, its own idea of what a heading looked like. The rebuild collapses all of that into **one design system** across every page — the home page, the Rootweaver overview, the CV, the writing archive, the journey graph, projects, and the new ADRs page.

Concretely, here's what's new or rebuilt:

- **One visual language, light and dark.** An editorial, paper-toned palette — warm off-white in light mode, a restrained purple accent, monospace labels, status pills and chips — with a real dark mode rather than an inverted afterthought. It's meant to read like a well-kept engineering doc, not a SaaS landing page.
- **A `/adrs` decision log** (the big one — its own section below).
- **A `/journey` graph** that now builds *itself* from the ADRs: every published decision becomes a node, so the timeline of how the platform was built is generated from the same source as the decision log, not hand-maintained.
- **An interactive architecture diagram** on the [Rootweaver page](/rootweaver), and technical diagrams throughout the ADRs and writing — all rendered in the browser (which, it turns out, is load-bearing; see the last section).
- **A rewritten Rootweaver overview and CV** that describe the platform by what it *does*, not just what it's made of.

If you've seen the old site, the fastest way to feel the difference is the [ADRs page](/adrs) — it didn't exist before.

## The decision log is public now

This is the part I'm actually pleased about. There's now an [**ADRs page**](/adrs): a browsable index of Architecture Decision Records — the short documents engineers write to capture *why* a choice was made, in a fixed shape: the context, the decision, the alternatives considered, and the consequences.

**Twenty of my seventy-seven ADRs are published.** The operational ones — and anything that would leak a secret or an attack surface — stay private in the platform repo; the rest are now public, each one a real write-up with a diagram, not a one-line summary.

The index itself is a small tool, not a static list:

- **Sort any column** — id, decision, status, or date — ascending or descending. Want the newest decisions first? Click *date*. Want them alphabetical? Click *decision*.
- **Filter by status** — accepted, superseded, proposed. Two of the twenty are published as `proposed` because that's their honest state; I didn't promote them to make the page look tidier.
- Each row links to the full record. Where a decision played out in this blog series, the entry links back to the episode.

What's in the twenty? They span the whole platform, deliberately:

- **How data is stored and retrieved** — [a relational-authority index in Postgres](/adrs/036-vault-structured-index-postgres/) beside the vector store, [lane-aware retrieval](/adrs/082-lane-aware-retrieval/) over typed ingest lanes, and a [self-hosted code-knowledge graph](/adrs/020-codegraph-platform/).
- **Provenance** — [cryptographic attribution](/adrs/061-developer-agent-provenance/) so every AI-authored commit is signed by the specific model that wrote it.
- **Agent autonomy** — [Claude handing heavy coding off to Codex](/adrs/079-claude-drives-codex/), and a [six-rung autonomy ladder](/adrs/088-self-healing-sre-autonomy-ladder/) for self-healing SRE.
- **Quality** — a [refusal gate](/adrs/044-refusal-gate/) that answers "I don't know" below a confidence threshold, a [benchmark suite](/adrs/045-benchmark-suite/) that made search quality measurable, and [why my entity tagging deliberately isn't an LLM](/adrs/040-ner-not-llm/).
- **Infrastructure** — [K3s over managed Kubernetes](/adrs/019-k3s-over-managed/), a [GPU swap controller](/adrs/029-keda-gpu-swap-controller/), [multi-node with separated backup](/adrs/060-heterogeneous-multi-node-cluster/), and a [Kafka durability contract](/adrs/065-kafka-consumer-durability/).

They're curated, not dumped: each public ADR is a deliberately written public version of a decision whose full operational record lives in the platform repo. The site is a view onto the decisions, not the decisions themselves.

Publishing them is a different kind of exposure than publishing code. Code can be admired in isolation; a decision invites you to ask "would I have made the same call?" That's the point.

## The one idea that ties it together

I could have published the ADRs without changing a word of how I describe the platform. But the reason I bothered is that the platform finally has a one-line thesis worth backing up — and the public ADRs are what make it auditable instead of just a claim.

For three seasons I introduced Rootweaver with a parts list: multi-agent RAG, knowledge graphs, GPU inference, 29 tools. Every word true, and none of it said what the thing was *for*. The new one-liner is:

> An operator-owned agent platform — **different stores for different kinds of truth**.

A plain RAG app has one move: embed everything, retrieve by similarity. But most of what an operator asks isn't a similarity question. "What's *similar* to this incident?" is a vector question. "Which ticket is *authoritative* for this change?" is relational — it has a correct answer, not a nearest neighbour. "What *breaks* if I change this module?" is a graph question. Rootweaver routes each to the store that can actually answer it — Qdrant for recall, Postgres for authority, FalkorDB for structure — rather than flattening all three into one similarity search that's confidently approximate about things with exact answers.

That's the thread running through the ADRs above: provenance, lane-aware retrieval, the relational index, the autonomy ladder — each is one clause of that sentence made real. The decision log is how you check that the sentence is true, not marketing.

## The bug that shipped every page empty

No honest build post skips the part that broke, and this rebuild had a good one.

The site builds on Cloudflare Pages on every push. My ADR and writing pages carry diagrams, and I was rendering them to inline SVG *at build time* — which works perfectly on my machine, where there's a headless Chromium to do the rendering.

There is no headless Chromium in the Cloudflare build container. And the failure wasn't loud: the diagram renderer failed silently and took the **entire page body** down with it. Every ADR and every writing page deployed with its content gone. The build went green and shipped empty.

I lost real time because the symptom pointed everywhere except the cause — my first guess was a Node version mismatch (it wasn't). What nailed it was shipping a tiny diagnostic endpoint that reported the build environment and ran an explicit Chromium launch test: it failed in the cloud, passed locally, and there was the answer. The fix was to stop pretending the build box is my laptop and render diagrams **client-side** instead.

The lesson is older than the bug: *a build that succeeds is not a build that's correct.* "Green" only means the steps you wrote didn't throw — it says nothing about whether the output is what you wanted. The only thing that caught this was a probe that asserted on the real environment instead of trusting it.

---

*Rootweaver is the self-hosted agent platform I design and operate solo, built with Claude Code, alongside my day job as an SRE. The decision log is [here](/adrs); the rest of this series is [here](/writing).*
