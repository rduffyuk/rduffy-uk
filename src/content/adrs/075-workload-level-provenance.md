---
id: 75
title: "Workload-Level Provenance for Autonomous Agent Commits"
status: proposed
recordedStatus: "Proposed"
date: 2026-06-13
tags: ["architecture", "provenance", "attribution", "autonomous-agent", "commit-trailers", "workload"]
sourceKind: source-record
public: true
journeyId: "2026-06-13-adr-075-workload-level-provenance-for-autonomous-agent-commits"
---
# ADR-075: Workload-Level Provenance for Autonomous Agent Commits

**Status**: Proposed (2026-06-13)
**Extends**: [ADR-061-Developer-Agent-Provenance](/adrs/061-developer-agent-provenance/)
**Jira**: VW-804 (impl ticket)

---

## 1. Context

ADR-061 + VW-604 established **who/trust-class provenance**: a commit's signing key tells you whether it was produced in an interactive Claude Code session (human present, Touch-ID) versus an autonomous job. That is sufficient for trust routing and IP attribution.

It is not sufficient for **workload attribution**. When an autonomous agent job commits — a scheduled radar trending run, a dreaming-loop enrichment pass, a nightly ingest sweep — the commit's signing key says only "autonomous Claude". It does not say which subsystem triggered the job or which facet of that subsystem was active. For debugging ("which radar component wrote this?"), for cost accounting ("how many commits did youtube-feed produce this week?"), and for model evaluation (correlating autonomous-commit quality against the generating workload), that granularity is missing.

Ryan approved this design on 2026-06-13. This ADR documents the decision. No keys, hooks, or configuration are changed by the ADR itself; VW-804 tracks the implementation.

### 1.1 Why not a key per workload?

The obvious fix — mint a separate signing key for each workload (`radar-trending`, `dreaming-loop`, etc.) — has three fatal flaws:

1. **Cost**: each key requires a keypair, a GitLab `allowed_signers` entry, and a `provenance.toml` registration. This is a bounded, manual, privileged operation.
2. **Combinatorial explosion**: workloads have facets (`radar` × `youtube-feed`, `radar` × `arxiv-feed`, …). A key per leaf would multiply unboundedly.
3. **Keys express trust class, not workload**: mixing the two signals in the same namespace erodes the clean two-layer model that makes ADR-061 auditable.

The correct place for workload identity is structured **commit trailers** — free-text fields appended by the hook, readable with `git log --grep`, and carrying arbitrary granularity at zero marginal cost.

---

## 2. Decision

Two orthogonal layers, each doing exactly one job:

### Layer 1 — Signing Key = Trust Class (unchanged from ADR-061)

The key registry is **closed to this ADR**; it is reproduced here only for reference:

| Key alias | Email | Trust class | Condition |
|---|---|---|---|
| `claude-bot` (enclave ECDSA `MJdym2…`) | `REDACTED_EMAIL` | Interactive, human-present | Touch-ID available |
| `claude-bot` (file ED25519 `ho0Mfu0…`) | `REDACTED_EMAIL` | Interactive, human-present | Enclave agent unloaded (fallback) |
| `claude-code-autonomous` | `REDACTED_EMAIL` | Autonomous (no human in loop) | `$AI_AGENT_OVERRIDE=claude-code-autonomous` |
| `codex-bot` | codex alias | Autonomous Codex | Codex runtime |
| `hermes-bot` | hermes alias | Autonomous Hermes | Hermes runtime |

No new keys are introduced.

### Layer 2 — Workload Identity = Structured Commit Trailers (NEW)

Every autonomous agent commit MUST carry an `Automation-Source` trailer. `Automation-Component` is optional but encouraged when the subsystem has meaningful facets.

```
Automation-Source: <subsystem>        # required for autonomous commits
Automation-Component: <facet>         # optional — narrow facet within the subsystem
Run-Id: <job/session id>              # already stamped per VW-393; reused here
```

**Examples**:

```
Automation-Source: radar-trending
Automation-Component: youtube-feed
Run-Id: 8d821474-da24-4437-a9df-823c932602d8
```

```
Automation-Source: dreaming-loop
Run-Id: 019e92cc-2ed3-79e1-ad68-6db808e17b2f
```

```
Automation-Source: vault-ingest
Automation-Component: connector-gitlab
Run-Id: c7a3e891-f4b2-47d0-a912-1e0c6f3b2d85
```

### 2.1 Trailer stamping

The existing `prepare-commit-msg` hook (`~/.claude/scripts/inject-commit-trailers.py`) will be extended to read two environment variables and append the trailers when both the agent trust class is `autonomous` and the variables are set:

```
$AUTOMATION_SOURCE       → Automation-Source: <value>
$AUTOMATION_COMPONENT    → Automation-Component: <value>   (if set)
```

**The value is set by the launcher, never self-reported by the agent.** The orchestrator that *starts* the autonomous job — the agent-ops runner (`~/.config/systemd/user/agent-ops-runner.service`) or the scheduling layer (cronjob spec / job definition) — exports `$AUTOMATION_SOURCE`/`$AUTOMATION_COMPONENT` into the session environment before the agent runs, because it (not the agent) authoritatively knows which workload it is launching. This mirrors ADR-061 §2.2 ("declare, never guess") and the VW-584 fix: trust the authoritative launcher, not a value the running process derives about itself. An agent therefore cannot forge or silently change its own workload label — it inherits whatever the launcher set.

The hook MUST be defensive:
- If `$AUTOMATION_SOURCE` is absent on an autonomous commit, emit a warning to stderr but exit 0 (do not block).
- If `$AUTOMATION_SOURCE` is absent on an interactive commit, do nothing silently.

### 2.2 provenance.toml `[automation]` section

`~/.claude/provenance.toml` gains an `[automation]` section enumerating known workload identifiers. This serves as a registry for tooling (linters, dashboards) and human reference — it is not enforced at commit time.

```toml
[automation]
known_sources = [
  "radar-trending",
  "dreaming-loop",
  "vault-ingest",
  "embedding-burst",
  "dlq-reprocessor",
]
```

The `[agents.claude-code-autonomous]` block (already present from VW-604) points to this design. No changes to existing `[agents]` entries.

### 2.3 Enforcement — pre-commit presence-gate (autonomous commits only)

Stamping (§2.1) is fail-open by design, which on its own makes `Automation-Source` merely *best-effort*. To make it **trustworthy rather than decorative**, an autonomous commit must not be allowed to land without it. This is enforced by a **pre-commit gate**, kept separate from the stamping hook:

- The `scripts/git-hooks/pre-commit` hook (in each autonomous-committing repo) detects the trust class of the in-flight commit via the same signal that selects the autonomous identity (`$AI_AGENT_OVERRIDE=claude-code-autonomous`, or the configured autonomous signing key).
- **If the commit is autonomous AND `$AUTOMATION_SOURCE` is unset → reject the commit** (exit non-zero, fail-closed).
- **If the commit is interactive** (human-present `claude-bot`) → the gate is a **no-op**; interactive commits never require a workload label.

Keying enforcement off the *trust class* makes the rule self-maintaining: the moment a commit claims to be autonomous, it is obligated to declare its workload. CI carries the same check as a backstop for the `git commit --no-verify` bypass.

The split is deliberate — two hooks, two jobs: the **stamping** hook (`prepare-commit-msg`) stays fail-open (it only adds metadata and must never break a commit), while the **gate** (`pre-commit`) is fail-closed for the autonomous class only.

---

## 3. Known Gap — Autonomous Signing Key Not Wired (Prerequisite)

`~/.claude/provenance.toml [agents.claude-code-autonomous]` declares `signing_key: ~/.config/provenance/keys/claude-code-autonomous.pub`. At the time this ADR was written (2026-06-13), that public key file is **absent** from the keys directory, and the email alias `REDACTED_EMAIL` does not appear in `~/.config/provenance/allowed_signers`.

VW-604 is marked Done, which indicates the configuration was declared but the key material was never generated and registered.

**Consequence**: Layer 1 (autonomous signing) is effectively inactive. Autonomous commits are either unsigned or fall through to the interactive `claude-bot` key, defeating the trust-class separation that ADR-061 requires.

**Prerequisite before declaring VW-804 done**: generate the ED25519 key pair for `claude-code-autonomous`, register it in `allowed_signers`, add it to GitLab's SSH signing keys, and update `provenance.toml` to point to the generated `.pub` file. This work should be tracked under VW-804 as a sub-task or prerequisite condition.

---

## 4. Consequences

### Positive
- Workload granularity becomes infinite and free: any subsystem can declare `$AUTOMATION_SOURCE` without any key infrastructure changes.
- Queries are greppable without tooling: `git log --grep="Automation-Source: radar-trending"` works today.
- The two-layer model is explicit and complete: key → trust class; trailers → workload. Auditors need only understand two orthogonal lookup dimensions.
- Onboarding a new workload requires setting one environment variable, not a key ceremony.

### Negative / mitigations
- Trailer presence depends on the launcher exporting `$AUTOMATION_SOURCE`. This is **enforced** for the autonomous trust class by the §2.3 pre-commit gate — an autonomous commit without `Automation-Source` is rejected, not merely warned. Residual risk: `git commit --no-verify` bypasses local hooks; mitigated by mirroring the gate in CI and by the periodic audit query `git log --grep="claude-code-autonomous" | grep -v "Automation-Source"`.
- The known gap (§3) means Layer 1 does not function until the autonomous key is generated and registered. This must be closed before VW-804 is marked done.

### Verification model

```bash
# Trust class: who signed this?
git log --show-signature HEAD~5..HEAD

# Workload: which subsystem produced these commits?
git log --grep="Automation-Source: radar-trending" --oneline

# Facet drill-down:
git log --grep="Automation-Component: youtube-feed" --oneline

# All autonomous commits missing a workload trailer (gap audit):
git log --pretty="%H %s" | while read sha msg; do
  git show $sha | grep -q "Automation-Source:" || \
  git show $sha | grep -q "claude-code-autonomous" && echo "MISSING: $sha $msg"
done
```

---

## 5. Phasing & Status

- **This ADR (2026-06-13)**: Design approved and documented. No implementation.
- **VW-804 (Backlog)**: Implementation — extend `inject-commit-trailers.py` (stamp, fail-open); add the §2.3 **pre-commit presence-gate** (fail-closed for the autonomous trust class) + CI backstop; add `[automation]` to `provenance.toml`; generate + register `claude-code-autonomous` key (§3 prerequisite); update the agent-ops runner / scheduling layer to export workload env vars at launch.
- **Post-VW-804**: Update ADR-061 §4 phasing note to reflect that workload-level autonomous commit provenance is shipped.

---

## 6. References

- Parent: [ADR-061-Developer-Agent-Provenance](/adrs/061-developer-agent-provenance/) (VW-585)
- Trust-class key registry: `~/.claude/provenance.toml`
- Hook: `~/.claude/scripts/inject-commit-trailers.py`
- Agent-ops runner: `~/.config/systemd/user/agent-ops-runner.service` (ADR-072, VW-735)
- Known key gap: VW-604 (marked Done; actual key material absent — see §3)
- Impl ticket: VW-804
- Git trailer convention: `Co-authored-by` (same standard basis as ADR-061 §5)
