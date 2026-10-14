---
id: 66
title: "Feature-Flag Fail-Closed Policy"
status: accepted
recordedStatus: "Accepted"
date: 2026-06-10
tags: ["feature-flags", "unleash", "fail-closed"]
sourceKind: source-record
public: true
journeyId: "2026-06-10-adr-066-feature-flags-fail-closed-safe-by-default-for-llm-experiments"
---
# ADR-066 — Feature-Flag Fail-Closed Policy

## Status

Accepted — 2026-06-10. Implemented under VW-685 (theme 4 of the VW-673 audit); the singleton/global-state interactions land with VW-682.

## Context

The Unleash-backed feature-flag client (`rootweaver_capabilities.feature_flags`) failed OPEN in two ways the VW-673 audit confirmed:

1. **One transient refresh failure discarded a valid snapshot.** Any exception in `_refresh_flags()` (Unleash pod restart, a single timed-out `/client/features` call) set `_use_fallback = True` even though `self._flags` still held the last good flag set. Every check then routed to an empty `LocalFeatureFlagClient`, which returns the caller's default — and the capability pipeline passes `default=True`. Deliberately disabled, resource-intensive capabilities (`multi_hop`, `contradiction_detector`) and any kill-switched feature silently turned ON for up to a full refresh interval during every Unleash blip.
2. **Unknown activation strategies evaluated to enabled.** An unrecognized strategy name fell through to `return True`, so a flag gated by a newer/custom strategy this client can't evaluate behaved as unconditionally on.

A kill switch that re-enables itself during the outage that most needs it is worse than no kill switch — operators reason about flags as if OFF means off.

## Decision

1. **Refresh failure retains the last-good snapshot.** The client only falls back when it has NO snapshot at all (cold start before the first successful refresh). A stale-but-real flag set always beats an empty one; staleness is logged with the snapshot size.
2. **Unknown strategy denies.** If the client cannot prove a flag should be on, it is off. The denial is logged with the strategy name so new strategy types surface fast.
3. **Per-flag defaults stay explicit at the call site.** `is_enabled(flag, default=…)` keeps the caller-supplied default for flags Unleash has never heard of — that is configuration absence, not infrastructure failure, and the capability pipeline's `default=True` for unregistered capabilities remains a deliberate product stance. The fail-closed rules above govern *failure*, not *absence*.
4. **Flag-state transitions must be observable.** Falling back, recovering, and unknown-strategy denials log at WARNING with enough context to alert on.

## Consequences

**Positive**: kill switches hold during Unleash outages; disabled capabilities stay disabled; A/B variants stop flapping to defaults on refresh blips.

**Negative / accepted**: a flag flipped in Unleash DURING an outage is not picked up until refresh succeeds (stale snapshot serves the old value — strictly better than serving the empty set); flags using genuinely new strategy types stay off until the client learns them (loud in logs).

## Enforcement

- Capability tests cover: refresh-failure-with-snapshot retains values; cold-start failure falls back; unknown strategy denies.
- Audit trail: VW-673 master report; impl report under `02-Active-Work/Implementation-Reports/2026-Q2/`.
