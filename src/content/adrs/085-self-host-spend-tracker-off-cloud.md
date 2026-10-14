---
id: 85
title: "Self-Host the spend-tracker Off-Cloud: Private Forgejo, k8s Secrets, Code-Only Repo"
status: accepted
recordedStatus: "Accepted"
date: 2026-06-26
tags: ["spend-tracker", "personal-finance", "forgejo", "self-hosting", "data-privacy", "secrets-management", "monzo"]
sourceKind: source-record
public: true
journeyId: "2026-06-26-adr-085-self-host-the-spend-tracker-off-cloud-private-forgejo-k8s-secrets-code-only-repo"
---
# ADR-085 — Self-Host the spend-tracker Off-Cloud: Private Forgejo, k8s Secrets, Code-Only Repo

## Status
Accepted — 2026-06-26

## Context
The `spend-tracker` is a personal "safe to spend today" budget companion: it reads
the live Monzo balance + Flex + month-to-date spend, computes a daily allowance to
payday, and delivers it over WhatsApp (the mautrix-whatsapp bridge in the `matrix`
namespace) and email. It runs on the desktop K3s node via two systemd user timers.

Until 2026-06-26 it was a single **loose, unversioned script** (`~/spend-tracker-daily.py`
on the Mac, scp'd to the desktop). The day it was first put under version control it was
briefly pushed to a **private gitlab.com** repo. Two problems with that:

1. **Data sensitivity vs hosting.** Even though the code carries no secrets, the repo is
   the control surface for a tool that models bank balances and transaction categories.
   gitlab.com is third-party infrastructure (their servers, logs, breach surface). For a
   finance tool the "where does the repo physically live" question is its own trust
   decision, distinct from "are there secrets in the file."
2. **One identifier leaked into code.** `LIVE_SHEET_ID` / `LIVE_SHEET_GID` (the Monzo
   auto-export Google Sheet used as a fallback data source) were hard-coded — link-accessible
   identifiers for transaction data, mildly sensitive once the code is hosted.

The platform already runs a self-hosted **Forgejo** on pi5-node1 (`REDACTED_PRIVATE_IP:30870`),
reachable only over the Tailscale mesh, already used for the obsidian-vault mirror.

## Decision
1. **Host the spend-tracker on the self-hosted private Forgejo**, not gitlab.com.
   Repo: `rduffy/spend-tracker` (private). The gitlab.com copy was deleted. The entire
   repo therefore lives on owned hardware, reachable only over Tailscale.
2. **Code-only repo.** All environment-specific values live in **k8s secrets** in the
   `matrix` namespace — Monzo OAuth, Matrix access token, SMTP, and now the sheet
   `sheet_id`/`sheet_gid` (moved out of code, read lazily via `kget()`). `state.json`
   (runtime balance anchor) is gitignored. A clone contains zero actionable financial data.
3. **Canonical source on the Mac** (`~/spend-tracker/daily.py`); deployed to the desktop
   runtime (`~/spend-tracker/daily.py`) via `scp`. Mac→Forgejo push uses the user's own
   credential entered once (NOT copied programmatically — see Consequences).

This mirrors the spirit of **ADR-061 (workload-level provenance)**: keep the boundary
between code and credentials/identity explicit and auditable.

## Consequences
- **Positive:** financial-data repo off third-party cloud; airtight code/secret split;
  real diffable history replacing ad-hoc `*.bak-vwNNNN` snapshots; off-machine backup on
  owned infra; lazy secret reads keep the happy path free of `kubectl` cost.
- **Negative / accepted:**
  - Forgejo is served over **plain HTTP** on the LAN/Tailscale (no TLS). Acceptable
    because traffic never leaves the private mesh; if exposed further, add TLS.
  - **No automatic credential bootstrap.** A safety control correctly blocks copying the
    stored Forgejo token between machines, so the first Mac push is a one-time manual
    credential entry by the human. This is a feature, not a gap.
  - Forgejo is single-node (pi5) — same backup posture as the vault mirror.

## Alternatives considered
- **Keep it on gitlab.com (private).** Rejected: financial data on third-party infra for
  no offsetting benefit; convention reserves gitlab.com for Rootweaver platform repos.
- **GitHub.** Rejected: allowlist is blog/benchmark/querymind only; never platform/personal-finance.
- **Leave it unversioned with `.bak` snapshots.** Rejected: no real history, no diffs, no backup.
- **SealedSecrets / GitOps-managed secrets.** Overkill for an app that already manages its
  own imperative secret (the token self-rotates via `kubectl apply` from within the script).

## Related
- Jira: VW-1019 (DNS resilience), VW-1021 (message restyle + tooling), VW-1022 (Fixed/Flex
  split + refund netting), VW-1025 (sheet id/gid → secret), VW-1027 (low-balance alert).
- ADR-061 (workload-level provenance). See also `REDACTED_PERSONAL_REFERENCE`.
- Memory: `spend_tracker_repo_forgejo`.
