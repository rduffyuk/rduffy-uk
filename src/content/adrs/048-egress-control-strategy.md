---
id: 48
title: "Egress Control Strategy — Forward Proxy Now, CNI Migration Later"
status: proposed
recordedStatus: "Proposed"
date: 2026-05-21
tags: ["networking", "security", "networkpolicy", "egress", "vw-409-followup"]
sourceKind: source-record
public: true
journeyId: "2026-05-21-adr-048-egress-control-strategy-forward-proxy-now-cni-migration-later"
---
# ADR-048: Egress Control Strategy — Forward Proxy Now, CNI Migration Later

**Status**: Accepted (2026-05-21) — Phase 1 implemented in commit `edc6193`
**Decision date**: 2026-05-21

> **Note on issue numbers**: This ADR was originally drafted citing "VW-417" / "VW-418" as to-be-filed Jiras. Those keys were taken by unrelated work between draft and filing time. The actual issues are **VW-425** (Squid Phase 1) and **VW-426** (Cilium Phase 2) — references below have been corrected.

---

## Context

During VW-409 backfill work (2026-05-21 evening), we needed `memory-synthesize` Jobs to call OpenAI's `gpt-4o-mini` API to extract facts from 12 backlogged sessions. The Job pods reuse the `app=memory-writer` label for postgres access. The empirical finding:

- `memory-writer-policy` egress permits only Kafka 9092, vault-postgres 5432, FalkorDB 6379, vllm-embedding 8001, otel 4317, kube-DNS 53
- **No rule for internet:443**
- Multi-call test produced a stark signature: first openai call succeeded (kube-router policy-enforcement race during pod start), all subsequent calls returned `Connection refused`

To unblock the backfill, we temporarily patched `memory-writer-policy` to allow `0.0.0.0/0:443 except [RFC1918]`. The backfill succeeded (107 facts, $0.023). But the temporary patch widened the blast radius: ANY pod with `app: memory-writer` or `app: memory-backfill` can now reach ANY public IP on 443.

This ADR decides the **durable** egress-control strategy.

### What standard Kubernetes provides

Vanilla `NetworkPolicy` operates at OSI L3-L4 — IP and port only. **There is no native FQDN selector.** This is confirmed in the official Kubernetes docs. Any FQDN-aware egress requires extra infrastructure.

### Why this matters

Without FQDN egress controls, the only options for the synthesize Job are:
- (a) Accept the wide-open rule (every memory-writer-labelled pod gets internet:443)
- (b) Add infrastructure to enforce FQDN allowlists

Option (a) is the status quo after the temporary patch and is what we want to move OFF.

---

## Decision drivers

1. **Homelab scale, single node** — operational simplicity wins over architectural perfection
2. **Existing CNI is kube-router (flannel)** — disrupting it has real risk
3. **Use case is narrow** — only a handful of LLM provider FQDNs (OpenAI, Anthropic, Google, maybe HuggingFace) need outbound access
4. **Auditability matters** — want a single chokepoint where external API calls can be logged
5. **Future-proof for multi-tenant work** — VW-402 / VW-394 may add more services that need different external APIs
6. **Security posture: defense in depth** — RFC1918 exclusion alone leaves data-exfiltration vector open if any memory-writer-labelled pod is compromised

---

## Considered options

### Option A: Accept the wide-open rule (status quo via temporary patch)
- ✅ Zero work
- ❌ Permanently widens memory-writer blast radius
- ❌ Live memory-writer Deployment doesn't need internet (it embeds via in-cluster vllm-embedding) — granting privilege it never uses
- ❌ No audit trail of external API calls
- **Verdict**: Acceptable as 1-week bridge; rejected as durable answer

### Option B: Squid forward proxy + narrow egress rules (RECOMMENDED for short-term)
- Deploy single Squid pod in dedicated namespace (`egress-proxy`)
- Squid config = explicit FQDN allowlist (api.openai.com, api.anthropic.com, generativelanguage.googleapis.com)
- Squid pod has the only `0.0.0.0/0:443` egress rule in the cluster
- Memory-writer-policy goes back to NO internet (revert temporary patch)
- New egress rule: memory-writer can reach `squid.egress-proxy:3128` only
- Synthesize Job sets `HTTPS_PROXY=http://squid.egress-proxy:3128` env var (httpx + urllib respect natively, zero code change)
- ✅ Single chokepoint, fully auditable (Squid access log)
- ✅ ~80 lines of new YAML, 1 Deployment, ~30MB image
- ✅ Doesn't touch existing CNI
- ✅ Allowlist managed in ConfigMap; easy to extend
- ❌ Single point of failure for ALL external API calls (acceptable at homelab scale)
- ❌ Compromised proxy = total egress takeover (low likelihood at home; mitigated by minimal-image principle)
- ❌ Some legitimate use cases (e.g., service hitting a non-HTTPS port externally) need separate plumbing
- ❌ Pods needing internet must set `HTTPS_PROXY` env explicitly

### Option C: Cilium CNI replacement + FQDN-native policy (RECOMMENDED for long-term)
- Replace kube-router with Cilium as the CNI
- Cilium snoops DNS responses, builds allow-list of IPs per pod per FQDN
- Policies look like: `egress: [{toFQDNs: [{matchName: "api.openai.com"}]}]`
- ✅ Most elegant — transparent, no proxy, no `HTTPS_PROXY` env var
- ✅ Catches IP-direct bypass (compromised pod can't skip DNS to reach random IPs)
- ✅ Cilium also provides eBPF observability, L7-aware policies, gateway API, service mesh-lite
- ❌ CNI migration is a half-day operation with real downtime risk
- ❌ Cilium agent uses ~200 MB RAM per node (acceptable on 64GB node, not free)
- ❌ Requires modern-enough kernel (likely fine on Ubuntu 24.04)
- ❌ Loses some kube-router quirks the cluster has come to depend on (egress NAT behavior, NetworkPolicy semantics)

### Option D: Monzo egress-operator (Envoy-based, K8s-native)
- Same in-cluster proxy idea as Squid but with Envoy + automated per-FQDN deploys via CRDs
- Requires custom CoreDNS image rebuild (vendor's CoreDNS plugin)
- More moving parts than Squid for a homelab
- **Verdict**: Good fit for a 50-engineer team; over-engineered for solo homelab

### Option E: Istio service mesh egress
- Sidecar-injected, VirtualService FQDN routing
- ~100 MB/pod overhead, full control plane
- **Verdict**: Massive overkill for this need

---

## Decision

**Two-phase migration**:

**Phase 1 (now)** — Implement Option B (Squid forward proxy):
1. Deploy Squid in dedicated `egress-proxy` namespace with FQDN allowlist
2. Revert the temporary `0.0.0.0/0:443` patch on `memory-writer-policy`
3. Add narrow egress to `memory-writer-policy`: allow `squid.egress-proxy:3128` only
4. Update synthesize Job to set `HTTPS_PROXY` env var
5. Schedule weekly Squid log review to confirm only allowlisted destinations called
6. Trackable under **VW-425** (filed + IMPLEMENTED 2026-05-21, commit `edc6193`)

**Phase 2 (long-term, target Q3 2026)** — Migrate CNI to Cilium (Option C):
- Once Squid is stable for ~30 days
- Migration plan: snapshot etcd, drain workloads, swap CNI, restore, validate
- Trackable under **VW-426** (filed 2026-05-21, target Q3 2026)
- Drivers for promoting Phase 2:
  - If the number of distinct external API endpoints grows past ~10 (Squid config sprawl)
  - If we get a second cluster node (Cilium scales better than the Squid bottleneck)
  - If we need L7-aware policies (HTTP method/path restrictions)
  - If we want eBPF observability for free

---

## Consequences

### Positive (Phase 1)
- Memory-writer Deployment loses internet privileges it never needed (security tightening, not loosening)
- Single audit point for external API calls (Squid access log → could ship to Loki later)
- New external API integrations need 1 ConfigMap line + pod restart (low ops cost)
- Pattern is well-documented and forgiving for homelab operations

### Negative (Phase 1)
- Squid pod is a single point of failure for ALL external API calls
- Adds a network hop (~1ms latency); negligible for current LLM calls (~1500ms total)
- Pods must explicitly opt in via `HTTPS_PROXY` env var; missed setting = silent failure
- Allowlist drift risk: developers may add allowlist entries without removing them

### Positive (Phase 2 future)
- CNI-native FQDN enforcement (kernel-level, transparent)
- Catches IP-direct bypass attempts
- eBPF observability + L7-aware policies unlock advanced patterns

### Negative (Phase 2 future)
- One-time migration risk
- Cilium agent memory overhead (~200 MB/node)

---

## Acceptance criteria

### Phase 1 (VW-425 — IMPLEMENTED 2026-05-21)
- [ ] `egress-proxy` namespace + Squid Deployment + Service + ConfigMap deployed via gitops
- [ ] Squid allowlist contains: `api.openai.com`, `api.anthropic.com`, `generativelanguage.googleapis.com`
- [ ] `memory-writer-policy` reverts the temporary `0.0.0.0/0:443` rule
- [ ] `memory-writer-policy` adds egress to `squid.egress-proxy:3128`
- [ ] Synthesize Job template sets `HTTPS_PROXY=http://squid.egress-proxy:3128`
- [ ] Smoke test: full re-run of `memory-synthesize` via Squid produces facts identically to today's direct path
- [ ] Squid access log captures each external API call with timestamp + host + request size

### Phase 2 (VW-426 — filed 2026-05-21, target Q3 2026)
- [ ] Migration plan vault doc written
- [ ] Cilium installed in lab cluster (separate test bed) to validate FQDN policy syntax
- [ ] Production cutover with rollback path tested
- [ ] Squid retired after Cilium proves stable for 30 days
- [ ] CILIUM_FQDN_POLICY_VERSION pinned to a known-good release

---

## Open questions for Ryan

1. **Bridge state for the temporary patch**: keep the `0.0.0.0/0:443` patch alive until Phase 1 lands (~few days), OR revert it now and accept that backfill is blocked until Squid is up?
2. **Phase 1 timing**: do you want to implement Squid in the next session, or wait for a deliberate maintenance window?
3. **Allowlist initial contents**: just `api.openai.com` (current need), or add the others proactively (anthropic, gemini) to avoid follow-up changes?

---

## Related

- VW-409 — parent: this issue surfaced during memory-pipeline backfill work
- VW-425 — Squid forward proxy (Phase 1) — **IMPLEMENTED 2026-05-21** in `rootweaver-gitops@edc6193`
- VW-426 — Cilium CNI migration (Phase 2) — filed 2026-05-21, target Q3 2026
- ADR-030 — repo-structure decisions (no overlap)
- ADR-046 — embedder architecture (no overlap)
- Kubernetes NetworkPolicy docs — confirms IP/port-only at L3-L4
- Cilium FQDN policy docs — https://docs.cilium.io/en/stable/security/policy/language/
- Monzo egress-operator — alternative Envoy-based path

---

## Evidence captured during research (2026-05-21)

Empirical multi-call test (before/after patch):

```
Before patch (no internet:443 rule):
  call 0: OK 1195ms
  call 1: FAIL Connection refused
  call 2: FAIL Connection refused
  call 3: FAIL Connection refused
  call 4: FAIL Connection refused

After patch (temporary 0.0.0.0/0:443):
  call 0: OK 1659ms
  call 1: OK 1342ms
  call 2: OK 1550ms
  call 3: OK 986ms
  call 4: OK 855ms
```

The "first-call-works" race is kube-router taking a few hundred ms after pod start to fully attach the iptables rules. Subsequent calls hit the default-deny.

Backfill outcome (proved the fix works end-to-end):
- 12/12 sessions synthesized successfully
- 107 facts written to `memory.facts`
- 62,265 OpenAI tokens
- $0.0233 cost
- `memory.facts` count: 2,641 → 2,744

Decision is therefore data-driven; the unblock proved the underlying gap, the temporary patch confirmed both halves of the egress-allowance hypothesis, and the Squid option scales cleanly from this evidence.
