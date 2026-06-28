---
title: "The Speedometer I Made Up: Building a Token Budget Governor for AI Coding Agents"
author: Ryan Duffy
categories:
- AI Agents
- Cost Engineering
- Tooling
description: "A weighted token-budget governor for Claude Code + Codex — and how I found it was metering a number Anthropic never confirmed. Plus: the loop is a token trap."
draft: false
featured: false
pubDatetime: 2026-06-23 06:30:00+00:00
reading_time: 16 minutes
series: 'Building in Public'
slug: the-speedometer-i-made-up
tags:
- claude-code
- codex
- ai-budget
- hooks
- token-cost
- loop-engineering
- building-in-public
---

I run [Claude Code](https://www.anthropic.com/claude-code) and [Codex](https://github.com/openai/codex) hard — multiple sessions, long hauls. On the Max 20× plan that's comfortable. But I wanted to know if I could drop to 5×, and that meant trusting the guardrails I'd spent eleven days building. So I audited them.

The audit found something I didn't expect: my budget governor had been faithfully protecting me against a speed limit measured by a speedometer I'd built myself. This is how the guards evolved — and how each one had already mutated away from its naive first version.

![A lone hooded engineer stands amid a wall of glowing cyberpunk monitors and readouts — the telemetry a long, hard agent session throws off, and the spend it quietly adds up to.](/posts/the-speedometer-i-made-up/hero.png)

## The ramp that forced this

I didn't build a budget governor because I enjoy writing hooks. I built it because the curve got scary. Here's five and a half months of local usage (from Jan 9, via ccusage), by month:

| Month | raw tok | generated (in+out) | notional cost\* |
|---|---|---|---|
| January (from the 9th) | 93 M | 0.6 M | $61 |
| February | 1.6 B | 2.3 M | $1,375 |
| March | 3.1 B | 7.2 M | $2,472 |
| April | 2.1 B | 7.2 M | $1,895 |
| May | 7.4 B | 36 M | $5,896 |
| **June (to the 23rd)** | **11.5 B** | **161 M** | **$11,223** |

\* Notional — ccusage's pricing-table estimate, not a bill; on a subscription the marginal cost is ~$0. Raw tokens are ~98% cache reads, so the *generated* column (input+output) is the honest "real work" signal.

The shape is the whole reason this post exists. Usage didn't drift upward — it **ramped ~5× from spring into June**: with the month only two-thirds gone, June's *generated* work alone (**161 M**) already outran all five prior months combined (~53 M). Real generated work went from ~7 M/month in spring to **161 M in June**. Everything below — the weighted proxy, the warn-only pacing, the Codex routing, the deterministic guards — was built on the *steepest* part of that curve, not in calm water. The governor was a response, not a premonition. (Same caveats as everywhere here: single machine, notional dollars, and the data only starts Jan 9 — there's no local transcript before that.)

## The core method: don't count tokens, weight them

Every version rests on one decision. The weekly cap isn't about raw token volume — different token types cost wildly different amounts. So the guard scores spend with a price-weighted proxy, not a counter:

```python
WEIGHTS = {
    "input_tokens": 1.0,
    "cache_creation_input_tokens": 1.25,
    "cache_read_input_tokens": 0.1,   # cache reads are cheap…
    "output_tokens": 5.0,             # …output is 5x input
}
# then scaled per-model: opus 1.0 (baseline), sonnet 0.6, haiku 0.2, fable 2.0
```

That `0.1` on cache reads looks innocent. Hold onto it — it's the whole reason loops are dangerous, and we'll come back to it.

Here's the honest caveat, lifted straight from my own code comment:

> *Anthropic does not document how `/usage` computes the weekly %, so the price ratio is a defensible proxy for subscription-cap consumption, not a first-party-confirmed weighting.*

I built a governor on a number I reverse-engineered. Keep that in mind too.

## v0 → v1: the guard that punished me for being early

The first version watched the weighted spend and, when I was burning too fast, **force-compacted my context** mid-session to save tokens. It worked and it was awful — because *ahead of pace* isn't *over budget*. Front-load a heavy Monday and the naive projection screams "you'll blow the cap!" and compacts you, even though you'll coast all week.

The fix was to make the guard forward-looking and **warn-only** (condensed):

```python
# projected end-of-cycle spend at the RECENT burn rate, not cumulative.
# An idle/frugal day lowers `rate` -> projection drops -> the nag relaxes itself.
projected = spent + recent_rate * time_left
PROJ_BANDS = [        # (projected fraction of cap, compaction ceiling)
    (1.3, 250_000),   # on track to bust cap by >30%
    (1.1, 350_000),
    (1.0, 450_000),
]
# Only a genuine near-lockout (>=95% ACTUAL spend) ever hard-clamps.
# Being on-trajectory-to-bust is WARN-ONLY.
```

The thinking: a guard that *blocks* you costs more in broken flow than the overspend it prevents. The mature version advises, and lets the projection relax on its own when you behave. **First law of guard evolution: block → advise.**

## The first time the meter lied (overcounting)

While building this I found the proxy running **~2.4× hot**. Claude Code's transcript logs repeat usage entries on session resume, compaction, and sidechain replay — I measured **~58% duplicates**. The guard was counting the same tokens two or three times and panicking accordingly. The fix was a dedup key per assistant message:

```python
key = f"{msg['id']}|{entry.get('requestId')}"
if key in seen:        # duplicate replay — already counted this cycle
    continue
```

Lesson banked: *before you trust a guardrail, verify the number it reads.* I'd need that lesson again.

## v2 → v3: stop guarding, start routing

Codex joined the workflow, so "my budget" became two budgets with different reset windows. The guard grew into cross-vendor governance — an architecture decision record, a Codex-side rate-limit mirror, and a tier lever that flips every calculation between Max 20× and 5×.

Then the real conceptual jump: **don't just warn about spend — move the work.** A [`UserPromptSubmit` hook](https://docs.anthropic.com/en/docs/claude-code/hooks) classifies intent and routes it. The method is deliberately crude — an implementation verb *and* a breadth signal, narrow on purpose to avoid alarm fatigue (condensed):

```python
IMPL_VERB = re.compile(r"\b(implement|refactor|migrate|rewrite|build (a|the)|"
                       r"write (the )?tests?|fix the bug)\b", re.I)
BREADTH   = re.compile(r"\b(across|all call sites|multiple files|end-to-end|"
                       r"integration tests?|migrate|module|refactor)\b", re.I)

if IMPL_VERB.search(prompt) and BREADTH.search(prompt):
    route_to_codex()      # bounded implementation lane
elif ARCHITECTURE.search(prompt):
    keep_on_claude()      # expensive-thinking lane
```

Claude becomes the architecture/review lane; Codex the bounded-implementation lane. In week one the router fired ~80 hand-offs to Codex against ~142 "keep on Claude" holds — the asymmetry is the point. It discriminates; it doesn't blanket-shove. **Second law: a guard that routes beats a guard that blocks.**

## The loop is a token trap

![A single glowing loop of track carrying the same data-block round and round past a meter — the most expensive shape of work there is.](/posts/the-speedometer-i-made-up/loop-trap.png)

There's an autonomous loop pattern being heavily promoted right now, and it gets sold as a productivity feature. I've come to see it as the single most expensive *shape* of work you can run — and once you understand the weighting, it's not subtle why.

Go back to that `cache_read_input_tokens: 0.1`. Cheap *per token* — which makes it feel free. But a loop keeps a large context **alive** and **re-reads all of it every single iteration**, for hundreds of iterations, with no human in the path to say "good enough, stop." Cheap-per-token × a 150K-token context × hundreds of turns × hours of wall-clock = the biggest line on the bill. You're not billed for the *idea*; you're billed for dragging the entire context across the meter, over and over.

The per-session data made it undeniable. When I broke the week down with [ccusage](https://github.com/ryoppippi/ccusage) — a tool that reconstructs token usage from local transcript files — **five marathon sessions accounted for 72% of the week's spend on this machine**, and the official usage breakdown attributed ~80% of consumption to sessions running 8+ hours. Not five times the *work*. Five times the *sitting there with a huge context spinning*.

## The people writing the loops are the ones who never see the bill

This isn't a fringe pattern — it's actively evangelised. There's a whole [Anthropic engineering series](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) on ["long-running agents" and "harness design"](https://www.anthropic.com/engineering/harness-design-long-running-apps), the marketing leads with *30+ hours of autonomous coding* and an [11,000-line app from a single run](https://www.anthropic.com/engineering/building-c-compiler), and [the creator of Claude Code has publicly reframed his own job around it](https://thenewstack.io/loop-engineering/) — he no longer prompts the model, he writes loops that prompt it. "Loop engineering" is now a named trend.

To their credit, there are guardrails: [scheduled routines reportedly run on a budget *separate* from your interactive session limit](https://www.mindstudio.ai/blog/run-claude-code-automations-without-burning-session-limits), the advice is to kill a stalled loop early, and the 5-hour limits were doubled. So the official line is "loops are fine — we've isolated their cost."

Here's where it breaks for the rest of us. That isolation only applies to the specific *scheduled-routine* mode. The moment you do what most people actually do — run a long autonomous loop inside a normal interactive session — you're back on the metered cap, and my own usage breakdown put **80% of a week's consumption in sessions running 8+ hours**. The protection exists; the default behaviour routes around it.

![An endless neon highway running to the horizon with no toll gate in sight — what unlimited, unmetered token access looks like to the people who set the defaults.](/posts/the-speedometer-i-made-up/free-road.png)

And notice *who* is selling the pattern. The engineer who says "just write loops" is running on effectively unlimited internal tokens. The loop is free to them. It demos like magic. It is also, for a paying user, the most expensive shape of work there is.

I don't think it's malice, and I don't think it's laziness. It's a **missing feedback loop** — the oldest blind spot in software wearing a new coat. Build on the gigabit internal network and you ship something that crawls on real broadband. Develop on the 128-core box and your "fast" is everyone else's "unusable." Tokens are the same axis: when your access is free and infinite, the gradient quietly tilts toward *more* — longer runs, fuller context, loops that keep going — because none of it shows up as a number you have to answer for. The headline benefit and the worst-case cost end up being the *same feature*, and the people setting the default never feel the second half.

The fix isn't to take engineers' tokens away — unlimited access is necessary for research. It's to make sure *someone in the room is on the meter* when the defaults get decided, so "is this the cheapest way to get the same result?" is a question the defaults are forced to answer. Which is, more or less, exactly what I'm doing from the outside: re-introducing the cost signal the defaults assume I don't have.

## v4: the most evolved guard uses no AI at all

My agent keeps a plain-text memory index loaded into every session. It bloated to 31 KB — one entry had grown into a **975-character paragraph** — and started silently truncating at load, meaning memories were quietly going missing.

The fix is a `PostToolUse` hook, and the point is that it's *dumb on purpose*: a deterministic, zero-LLM, zero-token Python script that caps any over-long line and never invokes the model (condensed):

```python
CAP = 350  # above the dense-entry norm; only nukes pathological bloat
def safe_truncate(line, cap):
    if len(line) <= cap: return line
    s = line[: line.rfind(" ", 0, cap - 1)].rstrip()
    # back off if the cut landed inside a [markdown](link)
    while s and (s.count("[") != s.count("]") or s.count("(") != s.count(")")):
        s = s[: s.rfind(" ")].rstrip()
    return s + " …"
```

When the entire goal is to *protect the expensive model's budget*, the smartest guard is the one that never calls the model. **Third law: prefer a deterministic guard to a clever one for anything you can write as a rule.** Save the model for judgment.

## v5: the meter lied again — the other direction

Then I went to answer the question that started all this — *is 5× feasible?* — and the governor said I was using **18.7%** of my weekly cap. The official `/usage` screen said **60%**.

Not a bug. My proxy reads transcripts *on this one machine*. I run across a desktop, a laptop, and the web app — so it was undercounting real usage by roughly **3×**. Combine that with the earlier 2.4×-overcount-from-dupes and the picture is clear: a reverse-engineered proxy was wrong in *both* directions at different times, because it was never the real meter.

That detonated the feasibility math. "5× is comfortable" (18.7% × 4 ≈ 75%) became "5× would blow the cap" (60% × 4 ≈ 240%). The governor was faithfully protecting me against a limit measured by a speedometer I'd built myself.

The fix isn't more cleverness — it's calibration. Point the governor at the one number that's ground truth (`/usage`), and treat the weighted proxy as a *pacing hint within the day*, not the cap itself.

## Three meters, two of them blind

By the end I realised I'd been reading three different meters and trusting the wrong ones:

- **[ccusage](https://github.com/ryoppippi/ccusage)** reconstructs token usage and a *notional* cost (token counts × a built-in pricing table, offline) from **local** transcript files. It's how I got the per-session breakdown.
- **My own weighted proxy** reads those *same* local transcripts and applies the price weighting from the top of this post.
- **The official `/usage`** is the only one that sees every surface — desktop, laptop, web app.

![A wall of glowing dial meters — three readings of the same week's spend, only one of which sees every machine.](/posts/the-speedometer-i-made-up/three-meters.png)

Two of the three read the same partial data, so they share the same blind spot: anything I do on another machine is invisible to them. That's the entire reason the proxy read 18.7% while `/usage` read 60%. And it's why the per-session feasibility math carries an honest asterisk — the *distribution* (five sessions, 72%) is real for this machine, but to turn it into a "5× fits" verdict I had to cross-calibrate that local distribution against the one global number.

Here's the actual arithmetic, because the *method* matters more than the result. ccusage reported **~3.23 B tokens across 364 sessions** that week on this machine — a notional **$2,865** by its built-in pricing table, but on a subscription the marginal cost is ~$0, so the number that matters is the *cap fraction*, not dollars. The official `/usage` pinned the same week at **60% of my weekly cap**. Anchor one to the other and ~1% of the cap ≈ **54 M local tokens** that week.

Now "is 5× feasible?" becomes arithmetic instead of a guess. Max 5× is a quarter of the 20× quota, so a 60%-of-20× week re-bases to **~240% of a 5× cap** — over by more than double. To land at a safe 80% of 5×, I'd need to cut to ~20% of the 20×-equivalent: about **1.08 B tokens/week**. ccusage's per-session split shows the top five sessions ran **337–665 M tokens each** — at that intensity only ~2 fit in the budget. Drop the marathon habit and a scoped session lands nearer 100–200 M, and 5–7 fit. Same cap, same tool: the answer is almost entirely a function of session *shape*, not session count.

The feasibility answer moved twice along the way: once when I found the proxy was lying, and again when I stopped trusting the headline and actually ran the per-session breakdown. The lesson isn't "use ccusage" or "use `/usage`." It's: know which meter sees what, and never let the convenient local one outrank the one that sees the whole road.

## The evolution, version by version

Each guard mutated when it hit reality. The scorecard, with the numbers that actually moved:

| Version | The change | Before → after |
|---|---|---|
| **v0** | force-compact on pace | interrupted me mid-session whenever I was *ahead of pace* — even with no real overspend |
| **v1** (VW-779) | warn-only + forward projection | hard-clamp on pace → **warn-only**; only ≥95% *actual* spend ever clamps |
| **dedup** (VW-840) | de-duplicate replayed usage entries | proxy ran **~2.4× hot** (~58% duplicate entries counted) → deduped to true count |
| **v3** (VW-841/842) | route work, don't block it | "warn about spend" → **~80 hand-offs to Codex vs ~142 Claude holds** in week one |
| **v4** (VW-994) | deterministic, zero-LLM memory guard | index **31 KB with a 975-char line, truncating at load** → capped at 350, no tokens |
| **v5** (calibration) | read `/usage`, not the home-made proxy | proxy **18.7%** of cap (3× under) → official **60%**; *"5× ≈ 76%, comfortable"* → *"**240%, blows the cap**"* |

That last row is the whole post in miniature: the same week, two meters, opposite verdicts.

## Did the guards actually help? What the meter recorded, per version bump

Here's the honest answer up front, because the table buries it otherwise: **the guards never cut Claude's raw token volume. They relocated work onto a separate meter and killed the false-alarm compactions.** That's what "helping" turned out to mean — and it's the opposite of the volume-reduction story I assumed I'd be telling. Raw tokens can't show a guard working anyway: they're ~98% cache reads (Jun 12 was 784 M raw but only ~11 M *generated* input+output), so the volume column is mostly workload noise. The column that *does* track help is **`% on Codex`** — how much of the day's work ran on Codex's separate budget instead of Claude's metered cap:

| Date | Shipped | Claude raw tok | Codex raw tok | % on Codex\* | est. wk-cap %\*\* | Δ vs prev |
|---|---|---|---|---|---|---|
| Jun 12 | v0 guard + Codex governance (VW-755/761/762) | 784 M | 213 M | 21% | ~17% | — |
| Jun 13 | model-aware + warn-only (VW-774/779) | 598 M | 26 M | 4% | ~30% | +13 pts |
| Jun 15 | tier lever + handoff/router (VW-829/841/842) | 397 M | 5 M | 1% | ~46% | +16 pts |
| Jun 16 | auto-handoff + digest (VW-870/871) | 356 M | 2 M | 1% | ~54% | +8 pts |
| Jun 18 | budget-context hooks (VW-887) | 284 M | **129 M** | **31%** | ~70% | +16 pts |
| Jun 21 | — (heavy build day) | 942 M | 61 M | 6% | ~36% | *cap reset Jun 19* |
| Jun 22 | — | 874 M | 63 M | 7% | ~55% | +19 pts |
| Jun 23 | memory guard (VW-994) | 226 M | 3 M | 1% | **60%** (measured) | +5 pts |

\* Share of that day's combined raw tokens that ran on Codex's *separate* budget rather than Claude's weekly cap. This is the only column that tracks "did a guard move load off the metered lane" — i.e. did it help.
\*\* **Derived estimate, not a logged reading.** Only Jun 23's **60%** is the real `/usage` figure. The rest is back-calculated from ccusage's daily tokens against that single anchor (≈45 M raw ≈ 1% of cap), assuming the cap is linear and identical week to week. The weekly cap **resets ~Jun 19**, so the count restarts mid-table. I'm showing it precisely *because* it's shaky — reverse-engineering a percentage from one anchor is the exact move this whole post is a warning about.

![A rail junction diverting a loaded cart onto a second track — the guard that helped didn't cut the work, it moved it onto a separate meter.](/posts/the-speedometer-i-made-up/routed-load.png)

Three honest reads of that table:

**Did the guards help? Yes — but by moving work, not cutting it.** Claude's raw volume bounced between 226 M and 942 M a day no matter which guard shipped; no version pushed it down. What moved was *where* the work ran. The day the auto-handoff tooling matured (Jun 18), Codex's share jumped to **31%** — 129 M tokens billed to a separate budget instead of Claude's weekly cap. The guard that helped wasn't the one that watched spend; it was the one that *moved* it. The governor never made me spend less — it made me spend on the cheaper meter.

**The help is lumpy, not a clean trend.** `% on Codex` reads 21% → 4% → 1% → 1% → **31%** → 6% → 7% → 1%. That tracks *when I had bounded implementation work to hand off*, not a steadily-improving guard. The honest signal is the single Jun 18 step-change when auto-handoff landed — not a smooth curve I can claim credit for.

**The wk-cap % column is the shaky one.** The ~17% → ~70% climb isn't the guards spending *more* — it's a weekly cap filling up as the week runs; the guards shipped *into* that fill, they didn't drive it. And it exists at all only by leaning on one measured anchor and pretending the token-to-percent map is clean. Direction, not gospel.

## What I actually learned

- **Guards evolve block → advise → route → deterministic.** The first instinct — interrupt the user "for their own good" — is almost always the worst version.
- **Weight, don't count.** Output is 5× input; cache reads are 0.1×. Meter raw tokens and you'll guard the wrong thing.
- **The loop is the most expensive shape of work there is** — large context × every iteration × no human gate. Treat "leave it running" as a cost decision, not a convenience.
- **Verify the number before you trust the guard.** Mine was 2.4× hot, then 3× cold. A perfect governor on a fake meter is worse than none, because it sells you false confidence.
- **Know which meter sees what.** Two of my three meters read the same local data and shared its blind spot; only one saw all my machines. Don't let the convenient meter outrank the complete one.
- **The cost driver is session *length*, not session count.** Short and scoped wins. `/clear` between tasks is the highest-leverage habit I have.

So — has it evolved from the initial one? The first guard was a bouncer that threw me out for going 65 in a zone it thought was 40. The current one routes my traffic, fixes my own memory file for free, refuses to run the meter just to read a string length — and, once I point it at the real dial, will finally be governing the actual road.

*Next: re-pointing the whole governor at the official figure, and a symmetric "send it back to Claude" nudge for when Codex is the one running hot.*

## Run it yourself

All four guards in this post — the weighted proxy, its compaction-enforcement half, the Claude/Codex router, and the zero-LLM memory compactor — are on GitHub, MIT-licensed and sanitized, with an example `budget.json` and the wiring for `settings.json`:

- **[token-budget-governor (gist)](https://gist.github.com/rduffyuk/834520d16902daa3e67d686d11da5aab)**

The calibration caveat from this post is baked into the README as the first thing you read: the proxy is single-machine and the weighting is reverse-engineered, so **point it at `/usage`** and treat the weighted number as a within-day pacing hint, not the cap. Every guard fails open and has a kill switch. If you only run one agent, the router degrades to local-only — delete the second-lane branch and keep the rest.

---

### References & links

- [Claude Code](https://www.anthropic.com/claude-code) — Anthropic's agentic coding CLI
- [OpenAI Codex](https://github.com/openai/codex) — the second implementation lane
- [ccusage](https://github.com/ryoppippi/ccusage) — reconstructs token usage + notional cost from local transcripts (the per-session breakdown tool)
- [token-budget-governor](https://gist.github.com/rduffyuk/834520d16902daa3e67d686d11da5aab) — the four guards from this post, MIT-licensed (Gist)
- [Claude Code hooks](https://docs.anthropic.com/en/docs/claude-code/hooks) — the `UserPromptSubmit` / `PostToolUse` mechanism the guards hang off
- [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) — Anthropic Engineering
- [Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps) — Anthropic Engineering
- [Building a C compiler with a team of parallel Claudes](https://www.anthropic.com/engineering/building-c-compiler) — Anthropic Engineering
- [The Anthropic leader who built Claude Code now just writes loops](https://thenewstack.io/loop-engineering/) — The New Stack
- [Running Claude Code automations without burning session limits](https://www.mindstudio.ai/blog/run-claude-code-automations-without-burning-session-limits) — MindStudio
