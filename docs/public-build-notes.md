---
title: Public build notes
tracking: VW-447
---

# Public build notes

The homepage combines writing, the published decision archive, website commit digests and approved public summaries of private merged work. Platform notes start collapsed and carry the status **Merged**, never an inferred deployment status.

## Publication contract

A private source is configured outside this repository. Only merged, non-draft MRs targeting main and carrying the `public-build-note` label are eligible. The exporter reads their comments through the existing GitLab CLI credential boundary. It accepts only a dedicated public-note comment authored by an explicitly configured human account. Ordinary MR text, bot comments, a label alone and general code approvals are not public-content approval.

The approved comment consists of the marker followed by one JSON object:

```text
<!-- public-build-note:v1 -->
{"id":"short-public-slug","title":"A clear public title","summary":"What changed and why it matters.","category":"Platform","href":"/rootweaver/"}
```

The `id` is a public identifier, not an MR number or private repository name. Categories are Agent tools, Knowledge, Operations, Platform or Website. Optional `detail` adds up to 600 characters. Optional `href` must be a supported public site path. Titles are limited to 90 characters and summaries to 240. Plain text only; unknown keys, markup, external URLs, email addresses, IPv4 addresses and common credential patterns fail validation. These checks are additional controls, not a substitute for reviewing the public wording.

The merge date is reduced to a UTC calendar day. Private source IDs, MR numbers, raw titles, descriptions, branches, diffs and credentials are not exported. No automatic summarizer or private-content fallback is used. A failed request, invalid selected note, duplicate public ID or pagination limit aborts the entire export and preserves the previous manifest.

The latest qualifying comment or edit by an allowed human account supplies the current note. To retract, remove the label or add a newer qualifying comment containing only the marker and `{"withdrawn":true}`. The next successful complete export removes it from the current feed. Retraction cannot erase previously published Git history, caches or third-party copies.

## Local operation

Run from a clean site checkout, using the existing authenticated `glab` CLI:

```sh
node --test tests/public-build-notes.test.mjs
node scripts/export-public-build-notes.mjs --config /absolute/private/sources.json
node scripts/export-public-build-notes.mjs --config /absolute/private/sources.json --apply
```

The private config contains `sources`, each with a numeric `projectId` and numeric `approverIds`. It contains no token. Credentials stay in the existing CLI keyring. Keep the config and all private runtime state outside this public repository. Export logs contain counts only.

The exporter deliberately does not commit, push or merge. The authorized hourly Codex heartbeat handles publication in a dedicated clean checkout, under the active harness identity. It reads this contract, runs the exporter and tests, and does nothing when the manifest is unchanged. On a change it creates a feature branch, stages only the public manifest and required provenance records, signs through `rw-git`, opens a PR, waits for the exact candidate Cloudflare build check, refreshes the export immediately before merging, pins the merge to that SHA, and verifies both production build-info and rendered notes afterward. No private data or credentials enter Cloudflare or the browser.

Source deletion or content withdrawal is applied only after a complete successful source scan. If the final refreshed export differs, update and recheck the candidate rather than merging stale content. A dirty or concurrently used checkout, unknown CI result, source failure or unverified deployment stops publication and needs investigation. Do not overwrite unrelated work. Never merge another PR or change the collector, approval policy, credentials, source list or website design automatically.

## Deployment and rollback

The website consumes the committed `src/data/public-build-notes.json` at build time and validates its schema before rendering. Updating the feed follows the ordinary GitHub-to-Cloudflare production path. The last published feed remains available while the Mac or Codex is unavailable.

Disable the named Codex heartbeat to stop automatic updates. Revert the specific homepage or data-update PR through a checked release to roll back. Fix or withdraw the upstream approved note before resuming, otherwise the next export may restore it.

## Verification

The contract tests cover unapproved and malformed inputs, author identity, forbidden fields and links, retractions, updates, duplicate IDs, date validation, pagination and source failures. A successful empty live scan qualifies the source connection and no-op behavior only; publication of a real private-MR note is not proven until the first approved note passes the complete release path.
