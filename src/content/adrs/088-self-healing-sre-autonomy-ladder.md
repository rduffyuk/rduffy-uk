---
id: 88
title: "Self-Healing SRE — LLM Autonomy Ladder"
status: accepted
recordedStatus: "Accepted"
date: 2026-06-28
tags: []
sourceKind: source-record
public: true
journeyId: "2026-06-28-adr-088-self-healing-sre-a-six-rung-llm-autonomy-ladder"
---
# ADR-088: Self-Healing SRE — LLM Autonomy Ladder

**Status**: Accepted
**Date**: 2026-06-28
**Jira**: VW-1068 (Epic)
**Deciders**: Ryan Duffy

---

## Context

`sre-brain` currently operates at **rung 2** of the autonomy ladder: it consumes Kafka alerts, collects diagnostic context (Kubernetes pod state, Loki logs), invokes an LLM triage engine, and emits a `TriageResult{severity, root_cause_hypothesis, recommended_action, confidence}` to Discord, Jira, and the vault. It takes no remediation action.

The honest frontier: ITBench (IBM/Red Hat, ICML 2025) benchmarks state-of-the-art LLM agents solving only **13.8% of SRE scenarios**. Commercial leaders (Datadog Bits AI, Dynatrace + Azure SRE Agent) sit at rung 3–4 in their own autonomy models and deliberately separate the RCA plane from the execution plane. Production self-healing at full autonomy is unproven at scale.

STRATUS (IBM, NeurIPS 2025) introduces the *Transactional No-Regression (TNR)* safety specification as the prerequisite for any autonomous remediation path: no action may degrade a metric that was passing before the action.

### Forces

- Every rung that adds capability must also add a commensurate guardrail — guardrails are never removed as autonomy increases.
- The freeform `recommended_action` string in `TriageResult` cannot be safely machine-consumed without a typed schema layer.
- RCA quality is currently unverified: the LLM produces a hypothesis with no confirmation step.
- Any execution capability (R4+) requires human oversight until confidence calibration is proven over real incidents.

---

## Decision

Adopt a 6-rung LLM-SRE autonomy ladder. sre-brain advances rungs incrementally, with each rung explicitly gated on the safety substrate of the rungs below it.

### The 6-Rung Ladder

| Rung | Name | sre-brain State | Primary Guardrail |
|------|------|-----------------|-------------------|
| R0 | Safety substrate | 5 tickets backlog (VW-346/347/350/351/340) | Input/output redaction, prompt-injection caps, rate limiting, liveness probe |
| R1 | Typed action catalog | VW-1069 — Backlog | `RemediationAction` enum + Pydantic `extra="forbid"`; NO freeform shell; irreversibility flag per action |
| R2 | LLM root-cause hypothesis | **Current state** | Triage-only; zero writes |
| R3 | Read-only hypothesis verification | VW-1070 — Backlog | Dedicated read-only ServiceAccount; ZERO write RBAC; 10s timeout; degraded-not-blocked on failure |
| R4 | Human-approved remediation | Future | Confidence-gated Discord "Apply fix?" button; irreversibility classification; destructive = never auto |
| R5 | Scoped supervised auto-remediation | Future | TNR; blast-radius pre-compute (≤N pods/services or abort); post-action metric window + auto-rollback; restart/scale only |
| R6 | Feedback loop | Future | First 50 episodes human-labelled before calibration is trusted |

### Safe On-Ramp (this ADR's scope)

The immediately actionable sequence is **R1 then R3** — both are read/schema-only with zero production write risk:

1. **R1 (VW-1069)** — Define `RemediationAction` enum and `TypedRemediation` Pydantic model in `sre-common`. Map `TriageResult.recommended_action` freeform text → typed action via a parser that returns `no-action` on unrecognised input. Unit-test irreversibility classifications. No execution code.

2. **R3 (VW-1070)** — Implement `HypothesisVerifier` agent in `sre-brain`. Runs after `engine.triage()`, before dispatch. Executes `kubectl get pod` (read-only ServiceAccount) and Prometheus metric reads. Injects `evidence: list[str]` and `evidence_weight: float` into `TriageResult`. Falls back to `evidence=[], weight=0.5` on timeout.

R4–R6 are deferred. They are not in scope until R1 + R3 are stable and confidence calibration over real incidents has occurred.

---

## Recurring Guardrail Model (every rung, cumulative)

These constraints accumulate — each rung must satisfy all prior guardrails:

- **TNR (Transactional No-Regression)** — borrowed from STRATUS: no action may degrade a metric that passed before the action. Applies from R5.
- **RCA/execution plane separation** — the verification agent (R3) and any future execution agent (R4+) are distinct processes with distinct service accounts. Neither imports the other's action primitives.
- **Irreversibility classification** — `drain-node`, `delete-pvc`, `rollback-release` are classified `reversible=False` in the R1 catalog and may never be auto-executed (R5 scope: restart-pod and scale-deployment only).
- **Mandatory `--dry-run=server`** — any future write path executes a dry-run first; failure aborts.
- **Blast-radius pre-compute** — before any write (R5+), compute affected pod count; abort if count exceeds configured threshold.
- **Confidence thresholds** — gated per rung; R5 requires `confidence > threshold` AND `evidence_weight > 0.6` from R3.
- **Least-privilege per-agent tooling** — each agent's RBAC capability set is enumerated at deploy time in GitOps manifests; no wildcards.

---

## Frontier Research Backing

| Reference | Finding | Relevance |
|-----------|---------|-----------|
| STRATUS (IBM, NeurIPS 2025) — [arxiv.org/abs/2506.02009](https://arxiv.org/abs/2506.02009) | Multi-agent autonomous remediation; introduces TNR safety spec; reaches supervised auto-remediation in simulation | TNR guardrail model for R5 |
| ITBench (IBM/Red Hat, ICML 2025) — [arxiv.org/abs/2502.05352](https://arxiv.org/abs/2502.05352) | SOTA agents solve only **13.8% of SRE scenarios** | Sets the honest ceiling; justifies incremental/gated approach |
| AIOpsLab (Microsoft) — [microsoft.github.io/AIOpsLab](https://microsoft.github.io/AIOpsLab) | Fault-injection agent eval harness | Future eval harness reference for R3/R4 confidence calibration |
| MicroRemed — [arxiv.org/abs/2511.01166](https://arxiv.org/abs/2511.01166) | End-to-end remediation via Ansible-playbook generation | Playbook-gen as an R5 execution primitive candidate |
| SREGym — [arxiv.org/html/2605.07161v1](https://arxiv.org/html/2605.07161v1) | Live K8s + eBPF eval environment | Eval infra for R5 simulation before production |

---

## Ticket Map

| Jira | Rung | Description |
|------|------|-------------|
| VW-340 | R0 | Kafka consumer liveness probe |
| VW-346 | R0 | Input redaction (`sre_brain/context/redactor.py`) |
| VW-347 | R0 | Prompt-injection defence (input caps + role-sandwich + Pydantic forbid) |
| VW-350 | R0 | Output redaction (same redactor on LLM output before dispatch) |
| VW-351 | R0 | Webhook rate limiting (per-IP token bucket + Content-Length guard) |
| VW-1068 | EPIC | Self-Healing SRE autonomy ladder (this ADR) |
| VW-1069 | R1 | Typed remediation action catalog in sre-common |
| VW-1070 | R3 | Read-only hypothesis verification agent for sre-brain |

---

## Consequences

**Positive**:
- Establishes a clear, safety-gated roadmap grounded in the research frontier.
- R1 + R3 deliver immediate value (better triage output quality, machine-readable action schema) at zero production-write risk.
- Typed action schema (R1) is a prerequisite for every future execution rung — doing it now prevents schema debt.
- Evidence weight (R3) gives confidence-gating for R4/R5 a real signal to gate on.

**Negative / Trade-offs**:
- Full autonomous remediation (R5) is deferred until confidence calibration has occurred over real incidents — this is intentional, not a limitation.
- R3 adds latency to each triage cycle (bounded at 10s by timeout; falls back gracefully).

**Not decided here**:
- Specific confidence thresholds for R4/R5 gating (calibrated empirically over first N production incidents).
- Blast-radius threshold value for R5 (to be set in GitOps config, not hardcoded).
- Whether R5 uses Ansible-playbook generation (MicroRemed pattern) or direct Kubernetes SDK calls.
