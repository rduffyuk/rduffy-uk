---
title: "Not a RAG App: Rootweaver Finally Has a Thesis"
author: Ryan Duffy
categories:
- Architecture
- AI Agents
- Building in Public
description: "For three seasons I described my platform as a parts list — multi-agent RAG, graphs, GPU, Kafka, 29 tools. This is the week it got a one-line thesis instead, opened its decision log to the public, and got a front door to match. Plus the Cloudflare bug that silently emptied every page."
draft: false
featured: true
pubDatetime: 2026-06-28 18:30:00+00:00
reading_time: 11 minutes
series: 'Building in Public'
slug: not-a-rag-app
tags:
- rootweaver
- architecture
- adr
- positioning
- redesign
- claude-code
---

For three seasons I have been describing Rootweaver the same way: as a list.

> Multi-agent RAG, knowledge graphs, GPU inference, Kafka event streaming, SRE automation, and 29 MCP tools — running on K3s across a single GPU node and a MacBook.

It is all true. It is also the description of a parts bin. If you handed that sentence to someone who had never seen the platform, they would learn what is *in* it and nothing about what it is *for*. Every line is a noun. None of them is a claim.

This week I finally fixed that — not by building anything new, but by being willing to say, in one sentence, what the thing actually is. And then doing two things to back the sentence up: opening the decision log that justifies it, and rebuilding the site that presents it. This is the meta-episode about all three.

## The problem with a parts list

A parts list is the safe way to describe a system you built solo. It is unfalsifiable. Nobody can argue that you *don't* have a knowledge graph — there it is. The trouble is that a parts list doesn't commit to anything. It doesn't tell you what you optimised for, what you traded away, or what you'd defend in a design review.

Worse, "multi-agent RAG platform" is now a category with a thousand entrants. Every weekend project that wires an embedding model to a vector store and a chat model gets to use the same three words. Leading with them puts you in a crowd and then asks the reader to do the work of figuring out whether you're at the front of it.

I'd been hiding behind the list because committing to a thesis means committing to a claim that could be wrong. So I went and got the claim pressure-tested — a competitive-positioning review against the current landscape of self-hosted AI systems — and then wrote the sentence I'd been avoiding.

## The thesis: different stores for different kinds of truth

Here is the new opening line on the Rootweaver page:

> Not a RAG app — an operator-owned agent platform: different stores for different kinds of truth (vector recall, relational authority, graph reasoning), with self-curating memory and signed provenance.

Every clause in that sentence is load-bearing, so let me defend each one.

**Different stores for different kinds of truth.** This is the spine. A RAG app has one move: embed everything, retrieve by similarity, stuff it in a prompt. But similarity is the wrong tool for most of what an operator actually asks. "What's *similar* to this incident?" is a vector question. "Which ticket is *authoritative* for this change?" is a relational question — it has a correct answer, not a nearest neighbour. "What *breaks* if I change this module?" is a graph question — it's about edges, not content. Rootweaver routes each kind of question to the store that can actually answer it: Qdrant for recall, Postgres for authority, FalkorDB for structure. Collapsing all three into "RAG" is how you get a system that's confidently approximate about things that have exact answers.

**Operator-owned.** It runs on my hardware, under my keys, with my data never leaving the cluster. That's not a privacy slogan; it's an architectural constraint that shapes every decision — GitOps over click-ops, signed commits over trust, K3s over a managed control plane I don't own. (That last one is [ADR-019](/adrs/019-k3s-over-managed/), and it's one of the eight I just published — more on that below.)

**Self-curating memory.** The typed memory layer doesn't just accumulate; a dreaming loop prunes and promotes it, so the platform's recall gets *more* useful over time instead of noisier. Memory that only grows is a landfill. Memory that curates itself is an asset.

**Structural code intelligence.** A Program Dependency Graph means "what depends on this?" is answered from the actual call graph, not from a text search that happens to match a function name. The agents that work on the platform query structure before they edit it.

**Signed provenance.** Every change an agent makes is signed with a non-exportable key in the Mac's Secure Enclave, hook-enforced, with a verifier that flags forgery. I wrote a whole article about why `co-authored-by` is a lie — [this](/writing/co-authored-by-is-a-lie/) is the part of the thesis I'm proudest of, because almost nobody else in the self-hosted space is doing it.

**Multi-agent verification.** Work gets done by one agent and checked by another with fresh context — the creator and the verifier are deliberately separated so they don't share a blind spot.

What I'm *not* claiming is hyperscaler parity. I don't have a thousand-GPU fleet or a global control plane, and the thesis doesn't pretend otherwise. The honest framing the review landed on is "frontier-tier among self-hosted systems" — which is a real position, defensible, and far more useful than "AI platform."

## Making the thesis legible: the decision log goes public

A thesis you can't audit is marketing. So the same week I wrote the sentence, I opened the decision log behind it.

There's now an [ADRs page](/adrs) on the site. **Twenty of seventy-seven** Architecture Decision Records are published — the operational ones, and anything that would expose a secret or an attack surface, stay in the platform repo; the rest are public, each in the classic shape: context, the call that was made, and what it cost.

I chose the public set to do exactly one job: put a decision behind every clause of the thesis, so the sentence is auditable rather than asserted.

- **Different stores for different kinds of truth** — a [relational-authority index in Postgres](/adrs/036-vault-structured-index-postgres/) sitting beside vector recall, [lane-aware retrieval](/adrs/082-lane-aware-retrieval/) over typed ingest lanes, and a [self-hosted code-knowledge graph](/adrs/020-codegraph-platform/) for the structural questions.
- **Self-curating memory** — the [dreaming loop](/adrs/063-dreaming-loop/) that prunes and enriches typed memory off the hot path.
- **Signed provenance** — [cryptographic attribution](/adrs/061-developer-agent-provenance/) for AI-authored commits.
- **Multi-agent autonomy** — [Claude handing heavy coding to Codex](/adrs/079-claude-drives-codex/), and a [six-rung autonomy ladder](/adrs/088-self-healing-sre-autonomy-ladder/) for self-healing SRE.
- **Quality over confidence** — the [refusal gate](/adrs/044-refusal-gate/), the [benchmark suite](/adrs/045-benchmark-suite/) that made search quality measurable, and [why entity tagging deliberately isn't an LLM](/adrs/040-ner-not-llm/).

That sits alongside the infrastructure decisions that make it operator-owned — [K3s over managed Kubernetes](/adrs/019-k3s-over-managed/), a [GPU swap controller](/adrs/029-keda-gpu-swap-controller/), and a [Kafka durability contract](/adrs/065-kafka-consumer-durability/) among them.

The set is curated, not dumped: each public ADR is a deliberately written public version of a decision whose full operational record stays in the platform repo. The website is a view onto the decisions, not the decisions themselves — and where a decision played out in this series, the entry links back to the episode, so the narrative and the record point at each other.

Publishing decisions is a different kind of exposure than publishing code. Code can be admired in isolation; a decision invites the reader to ask "would I have made the same call?" That's exactly why it's worth doing. A thesis backed by an auditable trail of trade-offs is a claim. A thesis backed by nothing is a tagline.

## The redesign: a front door that matches

You can't put a serious positioning claim on a site that looks like a weekend template. So the third piece was a ground-up redesign — a single unified design system across every page, replacing the patchwork that had accreted over three seasons of bolting pages on.

The new look is deliberately editorial rather than "tech demo": a warm, paper-toned light mode, a restrained purple accent, monospace labels, status pills, and chips that read like a well-kept engineering doc rather than a SaaS landing page. The platform describes itself as decisions and consequences, so the site should feel like decisions and consequences — not gradients and hero animations.

There's a quiet argument in that choice. If the thesis is "operator-owned, auditable, frontier-tier among self-hosted systems," the presentation has to carry the same restraint. Overclaiming in the visual design would undercut the *not*-overclaiming I'd just done in the copy.

## The bug that emptied every page

No building-in-public post is honest without the part that went wrong, and this one had a good one.

The site builds on Cloudflare Pages from source on every push to `main`. My ADR and writing pages render Mermaid diagrams, and I'd been rendering them to inline SVG *at build time* — which works beautifully on my machine, where there's a headless Chromium to do the rendering.

There is no headless Chromium in the Cloudflare build container. It's non-root and missing the libraries Chromium needs to launch. And here's the cruel part: the failure wasn't loud. The build didn't error. Instead, the diagram renderer failed silently and took the *entire page body* down with it — every ADR and every writing page deployed with its content gone. The site built green and shipped empty.

I lost real time to this because the symptom pointed everywhere except the cause. My first instinct was a Node version mismatch, so I pinned Node 22 — Cloudflare was *already* on Node 22. Red herring. What actually nailed it was refusing to keep guessing: I shipped a `/build-info.json` diagnostic that reported the build node, platform, commit SHA, and — critically — the result of an explicit Chromium launch test. The launch test failed in the cloud and passed locally. There was the answer, in one JSON file.

The fix was to stop pretending the build environment is my laptop: render Mermaid **client-side** instead of at build time. The diagram code ships to the browser and renders there, where there's always a real one. Pages have bodies again.

The lesson is older than this bug: *a build that succeeds is not a build that's correct.* "Green" only means the steps you wrote didn't throw. It says nothing about whether the output is what you wanted. The only thing that caught this was a probe that asserted on the actual environment instead of trusting it.

## What actually changed

Nothing in the platform. The graphs, the GPU node, the 29 tools, the memory loop — all of it was already running before this week. What changed is that I can now say what it is in one sentence, point at eight decisions that prove the sentence, and present all of it on a site that doesn't undercut the claim.

For three seasons I led with the parts because the parts were unarguable. This week I led with the thesis, because a thesis is the only thing a parts list can't give you: a position someone could disagree with — and that you'd be willing to defend.

It's not a RAG app. It never was. It just took me three seasons to write the sentence that says so.

---

*Rootweaver is a self-hosted agent platform I design and operate solo, built with Claude Code, alongside my day job as an SRE on BT's Global Fabric. The decision log is [here](/adrs); the rest of this series is [here](/writing).*
