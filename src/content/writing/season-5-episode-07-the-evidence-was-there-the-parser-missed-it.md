---
title: "The Evidence Was There. The Parser Missed It."
description: "A claim ledger used a different source-column heading. The repair had to accept real equivalents and reject misleading tables without weakening the evidence gate."
pubDatetime: 2026-07-08T12:00:00Z
draft: false
shippingDatetime: 2026-11-13T08:00:00Z
imageAlt: "The Rootweaver engineer compares paper evidence forms beside an old print-shop sorter."
author: Ryan Duffy
episode: 7
image: /images/blog/s5e07/hero-A.png
series: "Season 5: Rootweaver"
tags: [Rootweaver, Provenance, Testing, SoftwareEngineering]
---

The previous episode separated a skill's internal consistency from its grounding and practical effect. The next problem was smaller in code but just as important to the publishing workflow: evidence could be present in a claim ledger while the parser failed to recognise the table carrying it.

I wanted factual claims in the blog to lead back to inspectable sources. That requires more than writing a references section. The publishing check has to recognise the author's ledger, extract the concrete claim tokens the linter expects, and preserve the association between each claim and its source. A mismatch at the first step can make the later system judge a different input from the one I reviewed.

![The Rootweaver engineer compares differently headed paper forms in a municipal print shop.](/images/blog/s5e07/hero-A.png)

<p class="caption">The record can be present while the sorting mechanism expects another heading. Conceptual candidate hero and placement.</p>

This chapter covers July 8, 2026. It reconstructs the ledger-parser repair from the dated handover and the historical parser, linter and tests at revision `a9918f56`. I owned the publishing requirement and review; agents assisted with implementation and checking. Reported CI and verifier outcomes remain historical. The new examples and checks are isolated parser probes, not a replay of the original publishing run or a fresh assessment of every article's truth.

## The gate needed an adapter, not a second truth engine

The ledger was a small bridge between prose and a concrete-claim linter. An author could write a sentence containing several numbers, identifiers or other checkable tokens in one claim cell, then attach a source in the next cell. The adapter expanded the prose into the units the linter actually compared.

That separation is useful. The author can explain a claim in ordinary language; the checker can operate on a more precise representation. It also creates a failure boundary. If the table is not recognised, the linter cannot evaluate the supplied source associations as intended. A correct downstream comparison does not repair an empty or misread adapter result.

The repair did not add a model to decide whether evidence sounded plausible. It changed a deterministic Markdown parser. That narrow scope matters because accepting a table heading is not the same as accepting the source's authority. A file path might exist and still contain an outdated design, a proposal or an irrelevant observation.

| Stage | Input | Output | Separate question still open |
|---|---|---|---|
| Table recognition | Markdown lines | Recognised claim/source rows | Is this a supported ledger shape? |
| Claim expansion | A claim prose cell | Concrete tokens | Did extraction capture the intended claim? |
| Source association | A token and source cell | Linter evidence input | Does that source actually support the token? |
| Editorial review | Claim, evidence and scope | A bounded publication decision | Are important omissions and qualifications visible? |

The table also explains why an apparently minor spelling variation could matter. The adapter was the boundary connecting an author-friendly format with the checker's stricter input. Improving that boundary should make the author's meaning easier to represent without silently changing the evidence standard.

## A small vocabulary of real equivalents

The retained implementation recognises `Claim` as the first column and a bounded vocabulary for the second: `Source`, `Sources`, `Verification source`, `Verification` or `Evidence`. Comparisons use lower-case text after the surrounding whitespace has been stripped.

The key word is bounded. The code does not accept any second column just because the first one says `Claim`. In particular, a status field such as `Verified?` is not an evidence location. It may say that someone considers a claim checked, but it does not tell the reader what they could inspect.

<p class="code-source">ledger.py · header predicates · platform a9918f56</p>

```python
def _is_claim_header(cells: list[str]) -> bool:
    return len(cells) >= 2 and cells[0].lower() == "claim"


def _is_claim_source_header(cells: list[str]) -> bool:
    return _is_claim_header(cells) and cells[1].lower() in _SOURCE_SYNONYMS
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- The first helper requires at least two cells before reading either column.
- It compares the first cell, in lower case, with the expected claim role.
- The second helper keeps that requirement and checks the source-role vocabulary for the second cell.
- A supported synonym is therefore accepted only inside a claim-header shape. A status label is not added to the vocabulary.

</details>

The short predicate contains a useful design decision. The first-column role must agree as well as the source-column label. An unrelated numerical table can contain a column called `Evidence` without becoming a claim ledger. Conversely, a claim ledger with an unsupported second heading should not disappear quietly into the same outcome as no ledger at all.

![The engineer checks several drawer labels against one adjustable slot in a cabinetmaker's shed.](/images/blog/s5e07/inline-1.png)

<p class="caption">A bounded set of equivalents is different from accepting every shape. Conceptual illustration of the supported-header vocabulary.</p>

The handover says the synonyms came from the real ledger shapes under investigation. That is a more defensible rule than adding an open-ended list of plausible English words. A future new heading can be considered deliberately, with a source example and a test, instead of broadening the parser until unrelated content starts to match.

It is also important not to confuse a tolerant header rule with a complete Markdown implementation. The inspected parser works line by line on pipe-delimited rows. It does not claim to implement every table feature a full Markdown renderer can display. Escaped pipes and richer syntax need explicit support and tests if the workflow begins to rely on them.

## Follow one source through a synthetic ledger

Here is a deliberately small Markdown table. The path is an illustrative label, not a claim that a benchmark file with that name existed in the original run:

```markdown
| Claim | Verification source |
|---|---|
| The controlled probe returned 12 records. | retained-probe.json |
```

The parser first sees the header and waits for a valid separator. The next line confirms the table shape. The data row then yields a claim cell and a source cell. The later linter adapter can extract a concrete token such as `12` from the prose and associate it with `retained-probe.json`.

Replace `Verification source` with `Evidence` and the supported intent is the same. Replace it with `Verified?`, and the table now supplies a status-shaped column instead of the source role the adapter needs. The parser should raise a clear error rather than pretend that this is a valid source mapping.

The distinction remains even if the status cell contains `yes`. A yes is a review assertion. It is not the underlying observation. The source may be a report, test result or other artifact, but it has to be named and then assessed for relevance. The parser's job is to preserve that opportunity, not declare the claim true.

<figure id="mechanism" class="story-flow" data-policy-flow><h3>Follow the mechanism</h3><div class="flow-desktop"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 340" role="img" aria-label="Episode 7 simplified mechanism"><defs><pattern id="grid-e7-d" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arr-e7-d" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="#a78bfa"/></marker></defs><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#grid-e7-d)"/><path data-flow-edge class="flow-motion" d="M95 62H190" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e7-d)"/><path data-flow-edge class="flow-motion" d="M240 62H335" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e7-d)"/><path data-flow-edge class="flow-motion" d="M385 62H480" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e7-d)"/><path data-flow-edge class="flow-motion" d="M530 62H625" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e7-d)"/><path data-flow-edge class="flow-motion" d="M240 62H280V250H240" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e7-d)"/><g transform="translate(70 62)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><rect x="-9" y="-12" width="18" height="24" rx="2"/><path d="M-5-5H5M-5 1H5M-5 7H3"/></g></g><text x="70" y="109" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Markdown</text><text x="70" y="129" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Author supplied ledger</text><g transform="translate(215 62)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><path d="M-14-11H14L4 2V12H-4V2Z"/></g></g><text x="215" y="109" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Header</text><text x="215" y="129" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Claim + source role</text><g transform="translate(360 62)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><path d="M-12 0L-3 9L14-10"/></g></g><text x="360" y="109" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Separator</text><text x="360" y="129" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Confirm table shape</text><g transform="translate(505 62)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><circle cx="-6" cy="-3" r="7"/><path d="M0 2L12 14M8 10L12 6"/></g></g><text x="505" y="109" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Expand</text><text x="505" y="129" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Concrete claim tokens</text><g transform="translate(650 62)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><circle cx="0" cy="-11" r="4"/><circle cx="-12" cy="9" r="4"/><circle cx="12" cy="9" r="4"/><path d="M-2-7L-10 5M2-7L10 5M-8 9H8"/></g></g><text x="650" y="109" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Review</text><text x="650" y="129" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Source support still needed</text><g transform="translate(215 250)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><path d="M-14-11H14L4 2V12H-4V2Z"/></g></g><text x="215" y="297" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Unsupported</text><text x="215" y="317" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Claim header error</text></svg></div><div class="flow-mobile"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 650" role="img" aria-label="Episode 7 simplified mechanism"><defs><pattern id="grid-e7-m" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#3b3f4a"/></pattern><marker id="arr-e7-m" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10" fill="none" stroke="#a78bfa"/></marker></defs><rect width="100%" height="100%" fill="#141414"/><rect width="100%" height="100%" fill="url(#grid-e7-m)"/><path data-flow-edge class="flow-motion" d="M48 67V119" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e7-m)"/><path data-flow-edge class="flow-motion" d="M48 169V221" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e7-m)"/><path data-flow-edge class="flow-motion" d="M48 271V323" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e7-m)"/><path data-flow-edge class="flow-motion" d="M48 373V425" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e7-m)"/><path data-flow-edge class="flow-motion" d="M48 169V193H332V535H287" stroke="#a78bfa" stroke-width="1.7" stroke-dasharray="3 7" fill="none" marker-end="url(#arr-e7-m)"/><g transform="translate(48 42)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><rect x="-9" y="-12" width="18" height="24" rx="2"/><path d="M-5-5H5M-5 1H5M-5 7H3"/></g></g><text x="90" y="38" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Markdown</text><text x="90" y="58" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Author supplied ledger</text><g transform="translate(48 144)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><path d="M-14-11H14L4 2V12H-4V2Z"/></g></g><text x="90" y="140" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Header</text><text x="90" y="160" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Claim + source role</text><g transform="translate(48 246)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><path d="M-12 0L-3 9L14-10"/></g></g><text x="90" y="242" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Separator</text><text x="90" y="262" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Confirm table shape</text><g transform="translate(48 348)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><circle cx="-6" cy="-3" r="7"/><path d="M0 2L12 14M8 10L12 6"/></g></g><text x="90" y="344" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Expand</text><text x="90" y="364" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Concrete claim tokens</text><g transform="translate(48 450)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><circle cx="0" cy="-11" r="4"/><circle cx="-12" cy="9" r="4"/><circle cx="12" cy="9" r="4"/><path d="M-2-7L-10 5M2-7L10 5M-8 9H8"/></g></g><text x="90" y="446" text-anchor="start" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Review</text><text x="90" y="466" text-anchor="start" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Source support still needed</text><g transform="translate(260 535)"><circle r="25" fill="#1c1e24" stroke="#555867"/><g stroke="#e9eaee" stroke-width="1.5" fill="none"><path d="M-14-11H14L4 2V12H-4V2Z"/></g></g><text x="260" y="582" text-anchor="middle" fill="#e9eaee" font-family="system-ui,sans-serif" font-size="13">Unsupported</text><text x="260" y="602" text-anchor="middle" fill="#aab0bc" font-family="system-ui,sans-serif" font-size="10.5">Claim header error</text></svg></div><div class="flow-tools"><button type="button" data-flow-motion aria-pressed="false">Pause flow</button><button type="button" data-flow-expand>Expand diagram</button></div><figcaption>Simplified editorial diagram of the inspected mechanism. Moving dots show direction, not observed traffic or a successful run.</figcaption></figure><dialog data-flow-dialog aria-label="Expanded mechanism"><button type="button" data-flow-close>Close expanded diagram</button><div data-flow-expanded-content></div></dialog><script is:inline src="/images/blog/s5e07/flow-ui.js"></script><script is:inline src="/images/blog/s5e07/flow-motion.js"></script>

This diagram follows the ledger boundary, not the full publication workflow. The error outcome is intentionally visible. A useful failure should identify an unsupported claim-table header, rather than leave the author guessing whether the entire article lacks evidence.

## Why the separator was part of the meaning

The parser maintains two states. After a recognised header it waits for a separator row. Once the separator is valid, it accepts subsequent rows as data until a non-table line resets the state. A header-looking sentence or an isolated pipe row is therefore not enough to enter a recognised ledger.

That stateful detail protects more than formatting. Without it, arbitrary text that happened to contain `Claim` could be treated as the start of evidence data. A deterministic contract needs enough structure to distinguish the author declaring a table from the author merely mentioning a word.

The error detector mirrors that idea. It looks for a claim header with an unsupported source column, then confirms it with a separator before reporting the problem. The presence of unrelated tables elsewhere does not satisfy that condition.

<p class="code-source">ledger.py · _unrecognised_source_header_present, state loop · platform a9918f56</p>

```python
awaiting_separator = False
for line in markdown.splitlines():
    cells = _parse_table_cells(line)
    if cells is None:
        awaiting_separator = False
        continue

    if _is_claim_header(cells) and not _is_claim_source_header(cells):
        awaiting_separator = True
        continue

    if _is_separator(cells):
        if awaiting_separator:
            return True
        continue

    awaiting_separator = False

return False
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- The flag begins false, so an ordinary table or paragraph is not already an error.
- Each line is parsed into cells; a non-table line clears the pending header state.
- A Claim header with an unsupported source label sets the flag and waits for the next structural evidence.
- A valid separator while that flag is set confirms a malformed claim-table header and returns true.
- Other content clears the pending state. Reaching the end returns false.
- The caller converts true into a descriptive ValueError; this helper does not decide whether a factual claim is true.

</details>

A naive replacement would have been “raise an error whenever a non-empty document produces zero ledger rows.” That would be easier to explain but wrong for articles with no claim ledger, ordinary numerical tables, or drafts without concrete claims. The implemented detector asks a more precise question: did the author appear to supply this kind of table, but use a source heading the parser cannot interpret?

That precision keeps the gate useful. A stricter error is justified when the author has declared a claim ledger with an unsupported contract. It is not justified merely because every document does not contain the same structure. A check that turns every absence into a failure encourages authors to add meaningless boilerplate just to make it stop.

## Extraction still had to preserve the source relationship

After table recognition, the adapter iterates the recognised rows. Empty source cells are not expanded into evidence entries. Non-empty sources are attached to each concrete claim token extracted from the corresponding claim cell.

<p class="code-source">ledger.py · ledger_rows_for_linter, row expansion · platform a9918f56</p>

```python
rows: list[dict[str, str]] = []
for claim_cell, source in parse_ledger_tables(markdown):
    if not source:
        continue
    for token in claim_linter.extract_concrete_claims(claim_cell):
        rows.append({"claim": token.text, "source": source})
return rows
```

<details class="walkthrough">
<summary>Explain this code line by line</summary>

- The output list starts empty.
- The loop receives paired claim/source cells only from recognised tables.
- An empty source is skipped instead of turned into a source assertion.
- The claim linter extracts concrete tokens from the prose cell.
- Each extracted token gets the same supplied source association.
- Returning these rows supplies the later linter; it does not independently verify the source content.

</details>

This is a mapping operation, not a fact check by itself. A claim cell can contain more than one concrete token, and the same source label can be associated with all of them. That source still needs to support each relevant assertion. One report containing a number somewhere is not enough to justify every number in the sentence.

The adapter also exposes an important ambiguity in ordinary prose. A source cell may describe a historical report, an independently inspected implementation or an intended design. Those are different kinds of support. The article's ledger needs to say which it means; the parser should not silently promote all of them to observed runtime truth.

The new draft checks therefore exercise the transformation with synthetic tables and inspect the retained source. They do not treat “a row was emitted” as evidence that the row's claim is true. This is the same boundary the blog now uses for its own claim ledger: mechanical structure and editorial truth assessment remain separate.

## What the historical checks established

The July handover reports the repair merged through MR !312 and identifies both the branch and merge revisions. It reports 53 passing content-gate tests and a broader slice of 86 passing tests with two skips. Those are historical test results. The retained source and tests make the intended cases inspectable, but this reconstruction does not substitute a fresh local parser probe for the entire original CI environment.

The most meaningful cases are quite specific: a supported synonym is accepted; a real claim table with an unknown source header fails loudly; an unrelated table does not trigger that error; and existing supported ledgers continue to parse. A parser can pass hundreds of other tests while still missing one of these boundary cases.

![The engineer opens an archive service hatch to reveal an empty tray and a separate closed drawer.](/images/blog/s5e07/inline-2.png)

<p class="caption">A clear empty result and a recognisable contract error should not look identical. Conceptual artwork; not a photograph of the publishing system.</p>

There are useful remaining limits. A case-insensitive heading check does not handle every spelling or Unicode variation. The separator rule requires at least three hyphens per cell in the inspected implementation. A simple row splitter can be confused by unsupported pipe syntax. None of these observations means the patch failed its stated scope. They define the supported language so that the next author does not infer a general Markdown parser from a narrow adapter.

The publication boundary remains broader still. A parser pass cannot prove that an agent used the cited source, that a historical report is accurate, that a screenshot belongs to the described day, or that a claim's scope matches its evidence. Those are separate editorial and provenance obligations. The adapter repair helps the gate see the intended evidence; it does not complete those obligations automatically.

## Before parsing, the ledger still had to be the right one

The earlier July 8 handover records a separate failure in the surrounding publishing work: some Season 4 draft numbers had changed, while their older ledger filenames had not. A batch harness paired by episode number and produced two invalid green results. The report says those pairings were corrected by matching the episode titles and reconciling their actual claims.

That is a different boundary from recognising a source-column heading. A parser can correctly read the wrong ledger. Fixing the header vocabulary cannot establish that the supplied evidence belongs to this article. The practical order is to identify the draft and its evidence by verified subject and revision, then parse the ledger, then check whether its sources support the claims. I have kept the pairing failure visible here because a more tolerant parser would otherwise make the surrounding workflow look more complete than the record establishes.

## Lessons I would keep

I would start a parser repair with a real failing input and the expected output. The supported vocabulary should come from observed formats, and the rejection cases should be just as concrete. That keeps a convenience fix from turning into an unbounded guess about author intent.

I would separate “not this kind of table” from “this kind of table, malformed.” Both can produce no usable rows, but they should lead to different feedback. One is ordinary absence; the other is an actionable contract error.

I would also treat status and evidence as different data. A `Verified?` column can be useful in a review record, but its answer cannot replace the source field. Preserving both roles is more honest than accepting a tick as proof.

Finally, I would test the whole adapter boundary while keeping its claim modest. Recognition, separator handling, token expansion and source association all matter. Passing those tests establishes a dependable representation for later review. It does not establish the truth of every represented statement.

## Next in the sequence

The next chapter returns to the graph backlog from Episode 4. The later July records describe a route-level schema-enforcement repair and an opt-in concurrency limit. The interesting question is what survives across the whole route, and which new bottleneck appears when more work finally reaches the database.

<details class="glossary" data-glossary=""><summary>Glossary — plain-English definitions</summary><div class="glossary-tools" hidden=""><label for="glossary-search">Find a term</label><div class="glossary-search-row"><input id="glossary-search" type="search"/><button type="button">Clear</button></div><p aria-live="polite" role="status"></p></div><section class="glossary-term" id="term-ledger"><h3>Ledger</h3><p>A structured mapping of a claim to its supporting source. Episode evidence and limits (retained historical evidence).</p></section><section class="glossary-term" id="term-predicate"><h3>Predicate</h3><p>A function returning whether a condition holds. Episode evidence and limits (retained historical evidence).</p></section><section class="glossary-term" id="term-state-machine"><h3>State machine</h3><p>A parser whose current state changes how the next input is interpreted. Episode evidence and limits (retained historical evidence).</p></section><section class="glossary-term" id="term-separator-row"><h3>Separator row</h3><p>The Markdown row confirming the header structure of a table. Episode evidence and limits (retained historical evidence).</p></section><section class="glossary-term" id="term-concrete-token"><h3>Concrete token</h3><p>A specific checkable part extracted from prose for the linter. Episode evidence and limits (retained historical evidence).</p></section><section class="glossary-term" id="term-fail-loudly"><h3>Fail loudly</h3><p>Report a clear contract error instead of silently returning an ambiguous empty result. Episode evidence and limits (retained historical evidence).</p></section><section class="glossary-term" id="term-source-support"><h3>Source support</h3><p>Whether the cited evidence actually establishes the claim at its stated scope. Episode evidence and limits (retained historical evidence).</p></section></details>

## Sources and limits

The source and claim ledger (retained in review ledger) retains the July 8 handover, adjacent publishing context and the historical parser, linter and tests. The synthetic ledger is a teaching example. Its file label is not a recovered experiment. No production publication is claimed here, and no historical CI pass is silently converted into a fresh browser or truth-verification result.


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
<script is:inline src="/images/blog/s5e07/reader.js"></script>
