---
id: 24
title: "GitLab Flow Branching and Release Strategy"
status: proposed
recordedStatus: "Proposed"
date: 2026-03-10
tags: []
sourceKind: source-record
public: true
journeyId: "2026-03-10-adr-024-gitlab-flow-branching-and-release-strategy"
---
# ADR-024: GitLab Flow Branching and Release Strategy

**Status**: Proposed
**Date**: 2026-03-10
**Jira**: VW-129
**Decision Makers**: Ryan Duffy

## Context

The Rootweaver Platform currently has a functional but immature CI/CD pipeline. Key gaps:

1. **No release versioning** — Images tagged only with `$CI_COMMIT_SHORT_SHA` and `latest`. No semantic versioning, no release tags. Impossible to answer "what version is running in production?"
2. **No environment promotion** — Single `main` branch deploys directly. No staging validation before production. FluxCD watches `latest` tag indiscriminately.
3. **Feature branches don't build** — CI only runs on `main` and MR events. Feature branch images can't be tested in-cluster before merge.
4. **Dual registries without strategy** — Some images go to GitLab Container Registry (rag-gateway, rag-retriever), others to Harbor (vault-nightly-reindex). No consistent policy.
5. **20+ Dockerfiles** — Growing container fleet (journal streaming, arch-review, SRE, arch-viz) needs consistent build/tag/promote patterns.
6. **No rollback mechanism** — Without versioned releases, rollback means "find the commit SHA that worked and redeploy."
7. **Main branch instability** — Tests frequently fail due to environment issues or flaky integration tests. By release time main is far ahead of the last known-good state, leading to cherry-pick hell.
8. **Credential/auth failures** — Pipeline failures from expired tokens, missing variables per environment, and personal access tokens used instead of service accounts.
9. **Mixed deployment models** — Some services deploy via FluxCD auto-reconciliation, others require manual pipeline stages (migrations, GPU changes, infra).

### Current State

```
Developer → feature branch → MR to main → CI builds on main → push :latest → FluxCD deploys
```

- `.gitlab-ci.yml`: 877 lines, 11 stages, builds only on `main`
- Image tags: `$CI_COMMIT_SHORT_SHA` + `latest`
- Registries: GitLab CR (external images) + Harbor :30500 (local images)
- GitOps: FluxCD watches `latest` tag in rootweaver-gitops manifests
- No environment branches, no release tags, no semver
- Tests frequently red on main — nobody knows which commit is deployable
- Auth failures are the #1 cause of pipeline re-runs

### Professional Practice (Workplace Pattern)

At work, the team uses:
- **main** = latest development (all MRs merge here from feature branches)
- **Release tags** = point-in-time snapshots (e.g., `v2.4.1`)
- **Feature branches** → MR → review → merge to main
- **Deploy to prod** via tagged releases (tested, versioned, promoted)
- Multi-environment with version-controlled artifacts
- Mix of auto-deployed (GitOps) and manually-triggered pipeline stages

## Decision

Adopt **GitLab Flow** with a **prod-first baseline approach**: stabilise production with a protected branch and release tag first, then build lower environments underneath. This avoids the risk of changing everything at once and ensures production never gets worse.

### Core Principles

1. **Production is sacred** — Protected branch, MR-only merges, green pipeline required
2. **Main is development** — Allowed to be red temporarily; not the release source
3. **Release branches for stabilisation** — Cut from known-good commit, cherry-pick fixes only
4. **Fail fast on credentials** — Pre-flight auth checks before any real work
5. **Gate vs advisory CI** — Only reliable tests block merges; flaky tests are advisory
6. **Hybrid deployment** — FluxCD for stateless services, manual stages for everything else

---

## 1. Branching Strategy: GitLab Flow (Prod-First)

```
feature/vw-xxx ──► MR ──► main (latest dev, may be red)
                             │
                        release/v1.3.x (cut from known-good commit)
                             │── cherry-picked fixes only
                             │
                         v1.3.0 (tag from release branch)
                             │
                    production (PROTECTED, MR-only, green CI required)
                             │
                         K3s cluster (deployed via FluxCD + manual stages)
```

**Why GitLab Flow over alternatives:**

| Strategy | Pros | Cons | Fit |
|----------|------|------|-----|
| **GitFlow** | Clear release boundaries | Too complex, long-lived branches | No |
| **Trunk-Based** | Simple, fast | No staging gate, assumes main is always green | No — main is often red |
| **GitHub Flow** | Simple feature branches | No environment promotion | No |
| **GitLab Flow** | Environment branches, release tags, MR-driven | Slightly more branches | **Yes** |

### Protected Branch Configuration

```
GitLab → Settings → Repository → Protected Branches

Branch: production
  Allowed to merge:      Maintainers
  Allowed to push:       No one              ← Nobody pushes directly
  Allowed to force push: No                  ← Immutable history
  Pipeline must succeed: Yes                 ← Only green merges
```

### Release Branch Workflow

When main has diverged and tests are red, release branches isolate the stable code:

```
main:           A──B──C──D──E──F──G──H──I   (some red, new features)
                         │              │
                    release/v1.3.x    cherry-pick fix G
                         │──────────────H'
                         │
                     v1.3.0          v1.3.1
```

1. Cut `release/v1.3.x` from a **known-good commit** on main
2. Main keeps accepting MRs (dev doesn't stop)
3. Release branch gets **only cherry-picked fixes** — nothing else
4. CI on release branch must be green to tag
5. MR from release branch → `production` branch

### Hotfix Patterns

| Situation | Pattern | Flow |
|-----------|---------|------|
| Small fix, main is safe | Fix Forward | Fix on main → tag → deploy |
| Main has diverged | Cherry-Pick Back | Fix on main → cherry-pick to release → tag |
| Production down, urgent | Hotfix from Tag | Branch from tag → fix → tag → cherry-pick back to main |

For cherry-pick back (most common):
```bash
git checkout -b release/v1.3.x v1.3.0      # Branch from tag
git cherry-pick <fix-commit-sha>             # Apply just the fix
git tag v1.3.1                               # Patch bump
git push origin release/v1.3.x --tags
# Then MR release/v1.3.x → production
```

**Key rule**: Fixes always land on main first, then cherry-pick to release branch. Prevents "hotfix that never made it to main."

---

## 2. CI Pipeline: Gate vs Advisory Split

The root cause of "main is always red" is treating all CI jobs equally. Split into **gate** (must pass to merge) and **advisory** (informational, can fail):

### Gate Jobs (Block Merge)

These must be fast, deterministic, and reliable:

| Job | Time | Why Gate |
|-----|------|----------|
| `auth:pre-flight` | 10s | Catches credential issues immediately |
| `validate:dockerfiles` | 15s | Hadolint, deterministic |
| `test:unit` | 30s | Fast, no external dependencies |
| `code-quality:ruff` | 15s | Deterministic linting |
| `security:secrets` | 10s | Must never miss committed secrets |

### Advisory Jobs (Can Fail)

These are valuable but too flaky or slow to gate on:

| Job | Time | Why Advisory |
|-----|------|-------------|
| `test:integration` | 5min | Requires Docker services, env-dependent |
| `test:system` | 10min | Requires K3s, network-dependent |
| `test:e2e` | 2min | Requires running cluster |
| `security:bandit` | 30s | High false-positive rate |
| `security:safety` | 30s | Transitive dep vulns shouldn't block |
| `scan:trivy` | 1min | Base image vulns outside our control |

### Promotion Path

As advisory jobs become reliable, promote them to gate:

```
Month 1: Gate = unit + lint + auth + secrets
Month 3: Gate += integration tests (after fixing flaky ones)
Month 6: Gate += system tests (after stabilising K3s test namespace)
```

### Pipeline Rules by Context

```yaml
# Different strictness per branch context
test:integration:
  rules:
    - if: $CI_COMMIT_BRANCH == "production"
      allow_failure: false     # GATE on production — must be green
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
      allow_failure: true      # Advisory on MR — informational only
    - if: $CI_COMMIT_BRANCH == "main"
      allow_failure: true      # Advisory on main — don't block dev
```

---

## 3. Credential Health Framework

### Layer 1: Pre-Flight Auth Check (Fail Fast)

New first stage in every pipeline — validates ALL credentials before any real work:

```yaml
auth:pre-flight:
  stage: auth-check
  script:
    - FAILURES=0
    # Check each credential with clear pass/fail
    - |
      echo -n "GitLab Registry... "
      if docker login -u "$CI_REGISTRY_USER" --password-stdin $CI_REGISTRY <<< "$CI_REGISTRY_PASSWORD" 2>/dev/null; then
        echo "OK"
      else
        echo "FAILED - CI_REGISTRY_PASSWORD may be expired"
        FAILURES=$((FAILURES + 1))
      fi
    # ... repeat for Harbor, K8s, Jira, etc.
    - |
      if [ "$FAILURES" -gt 0 ]; then
        echo "$FAILURES credential(s) failed — see Credential Runbook"
        exit 1
      fi
  rules:
    - if: $CI_COMMIT_BRANCH == "production"
    - if: $CI_COMMIT_BRANCH == "main"
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_TAG =~ /^v\d+\.\d+\.\d+$/
```

### Layer 2: Non-Personal Auth

| Bad (Breaks) | Good (Stable) |
|--------------|---------------|
| Personal Access Token (PAT) | Project/Group Access Token |
| User's Docker login | Harbor Robot Account (no expiry) |
| User's kubeconfig | K8s ServiceAccount + RBAC |
| User's SSH key | Deploy Key (project-scoped) |

### Layer 3: Environment-Scoped Variables

```
GitLab → Settings → CI/CD → Variables

HARBOR_PASSWORD        → All environments
KUBE_TOKEN_DEV         → Scope: dev
KUBE_TOKEN_PROD        → Scope: production, Protected: Yes
```

Protected variables only expose on protected branches — prevents rogue MRs from accessing production credentials.

### Layer 4: Expiry Monitoring

Scheduled pipeline (daily at 06:00) checks token expiry dates and warns if within 7 days:

```yaml
auth:daily-health:
  rules:
    - if: $CI_PIPELINE_SOURCE == "schedule"
  script:
    - python3 scripts/ci/check_credential_expiry.py --warn-days 7
```

### Layer 5: Credential Runbook

Confluence page (VW/Runbooks) documenting every credential:

| Credential | Type | Expiry | Rotation Steps | Last Rotated |
|-----------|------|--------|----------------|-------------|
| `CI_REGISTRY_PASSWORD` | Auto (GitLab) | Never | N/A | N/A |
| `HARBOR_PASSWORD` | Robot account | Never | Harbor UI → Robots | TBD |
| `KUBE_TOKEN` | ServiceAccount | 1 year | `kubectl create token` | TBD |
| `JIRA_API_TOKEN` | API token | Never (until revoked) | Atlassian → API tokens | 2026-02-01 |

---

## 4. Hybrid Deployment Model

### Two Deployment Models

**Model A — FluxCD Auto-Reconcile** (stateless services):
```
git tag v1.3.0 → CI builds → pushes :v1.3.0 to Harbor → FluxCD detects → K3s reconciles
```

**Model B — Manual Pipeline Trigger** (stateful/dangerous changes):
```
git tag v1.3.0 → CI builds → image ready → Human clicks "Run" → pipeline executes
```

### Service Categorisation

| Service | Deploy Model | Rationale |
|---------|-------------|-----------|
| rag-gateway | Flux | Stateless, safe to auto-roll |
| rag-retriever | Flux | Stateless |
| mcp-bridge | Flux | Stateless |
| journal-streaming (7 services) | Flux | Stateless Kafka consumers |
| arch-review pipeline (5 stages) | Flux | KEDA ScaledJobs, stateless |
| NER consumer | Flux | Stateless |
| SRE collector/brain | Flux | Stateless |
| arch-viz frontend | Flux | Static frontend |
| **Qdrant** | **Manual** | Schema migrations, snapshot before change |
| **vLLM** | **Manual** | GPU allocation, model swaps, OOM risk |
| **Kafka topics** | **Manual** | Topic creation is irreversible |
| **NetworkPolicies** | **Manual** | Wrong policy = service outage |
| **Sealed Secrets** | **Manual** | Credential rotation |
| **Cloudflare tunnels** | **Manual** | External access changes |
| **FalkorDB** | **Manual** | Graph schema migrations |

### Pipeline Stages (Hybrid)

```yaml
stages:
  - auth-check       # Pre-flight credential validation
  - validate         # Dockerfile lint, YAML syntax
  - test             # Gate + advisory tests
  - build            # Docker images (triple-tag)
  - scan             # Container vulnerability scanning
  - release          # GitLab Release creation (tag pipelines only)
  - pre-deploy       # Manual: migrations, topic creation (before service deploy)
  - deploy-flux      # Auto: push images, FluxCD reconciles
  - deploy-manual    # Manual: vLLM model swap, infra changes
  - verify           # Manual: smoke tests, health checks
```

In the GitLab UI, release tag pipelines show:

```
auth → validate → test → build → scan → release → pre-deploy → deploy-flux → deploy-manual → verify
(auto)  (auto)   (auto)  (auto)  (auto)  (auto)    [▶ click]     (auto)       [▶ click]    [▶ click]
```

Manual `▶` buttons provide a visual checklist — you can see what's been deployed and what's pending.

### Release Manifest

Each release includes a manifest documenting what gets deployed and how:

```yaml
# deploy/release-manifest.yaml
release: v1.3.0
date: 2026-03-10
deployments:
  flux:
    - name: rag-gateway
      image: harbor:30500/rootweaver/rag-gateway:v1.3.0
    - name: rag-retriever
      image: harbor:30500/rootweaver/rag-retriever:v1.3.0
  manual:
    - name: qdrant-schema-migration
      pipeline_job: deploy:qdrant-migrate
      order: 1
      rollback: "Restore from Qdrant snapshot"
    - name: kafka-topic-creation
      pipeline_job: deploy:kafka-topics
      order: 2
```

### Rollback Strategy Per Model

| Model | Rollback Method |
|-------|----------------|
| Flux auto | Pin previous version in gitops manifest, or `flux suspend`/`resume` |
| Manual pipeline | Re-run previous version's pipeline, or `kubectl rollout undo` |
| Infrastructure | Git revert on gitops repo → FluxCD reconciles to previous state |
| Database migration | Restore from pre-migration snapshot |

---

## 5. Release Tag Strategy: Semantic Versioning

Format: `v{MAJOR}.{MINOR}.{PATCH}` following [semver.org](https://semver.org)

| Change Type | Version Bump | Trigger |
|-------------|-------------|---------|
| Breaking API/schema change | MAJOR | MR label `version::major` |
| New feature, new service | MINOR | MR label `version::minor` |
| Bug fix, config change | PATCH | MR label `version::patch` (default) |

### Image Tagging Strategy: Triple-Tag

Every container image gets three tags:

| Tag | Purpose | Example |
|-----|---------|---------|
| `:{commit-sha}` | Immutable reference to exact code | `:a1b2c3d` |
| `:{branch-slug}` | Latest build from a branch | `:main`, `:feature-vw-129` |
| `:v{semver}` | Release version (on tagged commits only) | `:v1.2.3` |

**Never use `:latest` for production** — it's mutable and non-reproducible.

### Registry Strategy: Consolidate on Harbor

| Registry | Use Case | Rationale |
|----------|----------|-----------|
| **Harbor** (:30500) | All production images | Local, fast pulls, vulnerability scanning, no external dependency |
| **GitLab CR** | CI build artifacts only | Build cache, MR-scoped, auto-cleanup |

---

## 6. Multi-Environment Promotion (Phase 3 — After Prod is Stable)

Only implemented after production branch is stable and credential framework is in place.

### Namespace-Based Separation (Single-Node K3s)

| Environment | Namespace | Image Policy | Promotion |
|-------------|-----------|-------------|-----------|
| **dev** | `rootweaver` | `:main` (auto-update) | Auto on merge to main |
| **staging** | `rootweaver-staging` | `:v*-rc.*` | Auto on RC tag |
| **production** | `rootweaver-prod` | `:v*` (stable only) | MR to production branch |

### GitOps Repository Structure

```
rootweaver-gitops/
├── base/                      # Shared manifests
│   └── rootweaver/
├── environments/
│   ├── dev/                   # Watches :main images
│   ├── staging/               # Watches :v*-rc.* images
│   └── production/            # Watches :v*.*.* stable images
```

---

## 7. Operational Quality: MOPs and MR Reviews

### Method of Procedure (MOP) Standard

Every manual deployment step requires a MOP that passes the **Stranger Test**: can someone who has never seen this system follow it blind and succeed?

**MOP template**: Confluence — MOP Template: Method of Procedure Standard *(internal reference; destination redacted)*

Each MOP step answers six questions:

| Question | Purpose |
|----------|---------|
| **WHO** | Which role executes (SRE, DBA, developer) |
| **WHERE** | Exact terminal, namespace, host |
| **WHAT** | Copy-paste command or exact UI action |
| **EXPECT** | What success looks like (exact output) |
| **FAIL** | What failure looks like and immediate action |
| **ROLLBACK** | How to undo this specific step |

**Quality checklist**: Every MOP must pass 12 items including "No assumed knowledge," "Commands are copy-paste ready," and "Rollback tested in non-prod."

### MR Review Framework

Standard MRs use `.gitlab/merge_request_templates/Default.md`. Production releases use `.gitlab/merge_request_templates/Production Release.md`.

**Key innovations to prevent rubber-stamp reviews:**

1. **Review Focus section** — MR author tells reviewers exactly what to check:
   - **Must verify**: Specific file:line references for critical logic
   - **Can skim**: Mechanical or low-risk changes
   - **Ignore**: Auto-formatted files, generated code, test fixtures

2. **Reviewer checklists by MR type**:
   - **All MRs**: Read Review Focus, check for secrets, verify scope
   - **Features**: Happy path tests, error/edge case tests, performance
   - **Config/Infra**: MOP attached, rollback documented, no breaking changes, NetworkPolicy/RBAC blast radius

3. **Production Release template**: Pre-merge checklist (gate CI, release manifest, MOP, credential pre-flight, rollback plan) and post-merge checklist (tag, verify, smoke test, monitoring, Jira transition, notification)

### Integration with Phases

| Phase | MOP/Review Touchpoint |
|-------|----------------------|
| Phase 0 (Baseline) | Create production MR template, first MOP for `v1.0.0` deployment |
| Phase 0.5 (Credentials) | Credential rotation MOP, credential runbook |
| Phase 2 (Release Process) | Release manifest MOP, production release MR template in use |
| Phase 3 (Lower Environments) | Environment promotion MOP per namespace |

---

## 8. Secret Management: HashiCorp Vault Integration

**Jira**: VW-130

### Problem: Tier 4 Secret Management

Currently all secrets are static — stored in GitLab CI/CD variables, Sealed Secrets, or manual configuration. This causes:
- Credential expiry failures (the #1 pipeline re-run cause)
- No centralised audit trail (who accessed what, when)
- No cross-device secret sharing (Desktop vs MacBook)
- Manual rotation with no tracking

### Solution: Identity-Based Secrets via Vault

Deploy HashiCorp Vault on K3s with **GitLab CI OIDC federation** — pipeline jobs prove identity via JWT, Vault returns short-lived secrets. No stored credentials.

### Secret Management Tiers

| Tier | Method | Current | Target |
|------|--------|---------|--------|
| 4 (Worst) | Static secrets in CI variables | **Here today** | Phase 0.5 fallback |
| 3 | Automated rotation (robot accounts) | — | Phase 0.5 |
| 2 | Dynamic short-lived secrets (Vault) | — | **Phase 1.5** |
| 1 (Best) | Workload identity federation (OIDC) | — | **Phase 1.5** |

### GitLab CI OIDC Flow

```yaml
# .gitlab-ci.yml — zero stored secrets
deploy:
  id_tokens:
    VAULT_ID_TOKEN:
      aud: REDACTED_PRIVATE_URL
  script:
    - export VAULT_TOKEN=$(vault write -field=token auth/jwt/login
        role=gitlab-ci jwt=$VAULT_ID_TOKEN)
    - export HARBOR_PASS=$(vault kv get -field=password secret/gitlab/registry)
    - docker login harbor:30500 -u robot -p $HARBOR_PASS
```

GitLab issues a signed JWT per job → Vault validates signature + bound claims (project ID, branch, ref type) → returns secrets with 5-minute TTL. No credential to expire, leak, or misconfigure.

### Vault Architecture on K3s

| Component | Config |
|-----------|--------|
| **Deployment** | Helm chart, standalone mode, Raft storage |
| **Namespace** | `vault` |
| **NodePort** | 30820 (UI) |
| **Storage** | 1Gi PV, local-path-provisioner |
| **Resources** | ~256MB RAM, 1 CPU |
| **GitOps** | FluxCD HelmRelease in `rootweaver-gitops/infrastructure/vault/` |

### KV v2 Path Structure

```
secret/
├── rootweaver/          # K3s service secrets (Qdrant, Postgres, FalkorDB, Kafka)
├── gitlab/              # CI/CD secrets (Harbor robot, deploy keys)
├── monitoring/          # Grafana API token, Alertmanager webhooks
└── external/            # Cloudflare, Tailscale, Atlassian API tokens
```

### Pod Secret Injection: Vault Secrets Operator (VSO)

VSO syncs Vault secrets to native Kubernetes Secrets — existing pod specs don't change:

```yaml
# rootweaver-gitops — safe to commit (no secret values)
apiVersion: secrets.hashicorp.com/v1beta1
kind: VaultStaticSecret
metadata:
  name: rag-gateway-secrets
  namespace: rootweaver
spec:
  vaultAuthRef: vault-auth
  mount: kv-v2
  path: rootweaver/rag-gateway
  type: kv-v2
  refreshAfter: 60s
  destination:
    name: rag-gateway-secrets    # Creates this K8s Secret
    create: true
```

### Coexistence with Sealed Secrets

| Secret Type | Tool | Rationale |
|-------------|------|-----------|
| Simple K8s secrets (low rotation) | **Sealed Secrets** (keep) | Works, GitOps native, zero overhead |
| CI/CD pipeline secrets | **Vault** (new) | OIDC eliminates stored credentials |
| Dynamic credentials (DB, APIs) | **Vault** (new) | Short-lived, auto-expire, audit trail |
| Cross-device secrets | **Vault** (new) | Centralised, Desktop + MacBook |

### Vault Policy (Least Privilege)

```hcl
# ci-secrets.hcl — GitLab CI can only read
path "secret/data/rootweaver/*" {
  capabilities = ["read"]
}
path "secret/data/gitlab/*" {
  capabilities = ["read"]
}

# admin.hcl — human operator
path "secret/*" {
  capabilities = ["create", "read", "update", "delete", "list"]
}
```

### Unsealing Strategy (Single-Node)

Vault seals on pod restart. For single-node K3s:
- Init container reads unseal key from a local hostPath volume
- Auto-unseals on every pod restart
- Unseal key stored outside K3s (not in a Secret, not in git)
- **Risk accepted**: Physical access to node = access to unseal key (acceptable for homelab)

---

## Consequences

### Positive
- **Reproducible deployments** — Every production deploy has a semver tag
- **Safe rollbacks** — Pin to any previous release tag
- **Professional practice** — Mirrors enterprise GitLab workflows (branching, Vault, MOPs)
- **MR quality gate** — Feature branches validated before merge
- **Credential resilience** — Vault OIDC eliminates stored credentials; pre-flight checks catch failures immediately
- **Main can be messy** — Dev velocity stays high; release branches handle stabilisation
- **Clear deployment audit trail** — Release manifest + manual gates + Vault audit log = who deployed what when
- **Centralised secrets** — Single source of truth across K3s, GitLab CI, Desktop, MacBook

### Negative
- **More pipeline complexity** — Triple-tag builds, release automation, pre-flight checks
- **Cherry-pick overhead** — Fixes go to main first, then to release branch
- **Namespace overhead** — staging/prod namespaces duplicate resources (Phase 3 only)
- **Vault operational burden** — Unsealing on restart, backup, upgrades (mitigated by auto-unseal init container)

### Risks
- **Single-node limitation** — Namespace separation is a compromise vs. true cluster isolation
- **Release branch maintenance** — Must not accumulate; delete after release is deployed
- **Vault single point of failure** — If Vault is down, new pods can't get secrets (mitigated: VSO caches to K8s Secrets)
- **Unseal key security** — Stored on local filesystem; physical access = compromise (accepted for homelab)

---

## Alternatives Considered

### 1. Trunk-Based Development
- Assumes main is always green — doesn't match reality
- Rejected: Main is frequently red due to env/flaky test issues

### 2. GitFlow (Full)
- develop, release, hotfix branches
- Rejected: Overkill for single developer; develop branch adds no value

### 3. Stay with Current (SHA + Latest)
- No changes needed
- Rejected: No versioning, no rollback, credential issues persist, no professional practice alignment

### 4. Fix All Tests First, Then Adopt Strategy
- Make main always green before changing branching model
- Rejected: Chicken-and-egg problem; gate/advisory split solves this incrementally

---

## Implementation Plan (Prod-First)

### Phase 0: Baseline Production (Day 1-2)
- [ ] Audit K3s: document exact images/commits running in production
- [ ] Create `production` branch from current known-good state
- [ ] Tag `v1.0.0` — first release baseline
- [ ] Protect `production` branch in GitLab (no direct push, MR-only, pipeline must pass)
- [ ] Pin gitops manifests to `v1.0.0` (replace `:latest` references)
- [ ] Create production MR template (checklist for release merges)

### Phase 0.5: Credential Health (Day 3-5)
- [ ] Add `auth-check` stage as first pipeline stage
- [ ] Replace personal tokens with robot/service accounts (Harbor, K8s)
- [ ] Set up environment-scoped CI/CD variables
- [ ] Create credential runbook in Confluence (VW/Runbooks)
- [ ] Configure daily scheduled pipeline for credential expiry monitoring

### Phase 1: Gate/Advisory CI Split (Week 1)
- [ ] Classify all CI jobs as gate (must pass) or advisory (can fail)
- [ ] Enable "pipeline must succeed" on `production` branch for gate jobs only
- [ ] Quarantine or fix top 3 flakiest integration tests
- [ ] Add `allow_failure: true` to advisory jobs on MR/main contexts
- [ ] Add `allow_failure: false` to advisory jobs on production context

### Phase 1.5: HashiCorp Vault (Week 1-2) — VW-130
- [ ] Deploy Vault on K3s via Helm (standalone, Raft storage, NodePort 30820)
- [ ] Add HelmRelease to `rootweaver-gitops/infrastructure/vault/`
- [ ] Configure auto-unseal (init container + hostPath unseal key)
- [ ] Enable KV v2 engine, create path structure (`secret/rootweaver/`, `secret/gitlab/`, etc.)
- [ ] Enable JWT auth pointing at gitlab.com, create `gitlab-ci` role with bound claims
- [ ] Write Vault policies (`ci-secrets` read-only, `admin` full access)
- [ ] Migrate top 3 GitLab CI/CD variables to Vault (Harbor, K8s token, Jira API)
- [ ] Update `.gitlab-ci.yml` to use `id_tokens` + `secrets` blocks
- [ ] Deploy Vault Secrets Operator (VSO) for pod secret injection
- [ ] Create first VaultStaticSecret CRD (rag-gateway-secrets)
- [ ] Verify Sealed Secrets coexistence (no migration needed for simple secrets)
- [ ] Create Vault operations MOP (init, unseal, backup, policy changes)

### Phase 2: Release Process + Image Versioning (Week 2-3)
- [ ] Implement triple-tag strategy (SHA + branch-slug + semver)
- [ ] Add `release` stage to `.gitlab-ci.yml`
- [ ] Migrate rag-gateway and rag-retriever to Harbor
- [ ] Set up release branch workflow (`release/vX.Y.x`)
- [ ] Add hybrid pipeline stages (pre-deploy, deploy-flux, deploy-manual, verify)
- [ ] Create release manifest template (`deploy/release-manifest.yaml`)
- [ ] Update FluxCD ImagePolicy to watch semver tags instead of `:latest`

### Phase 3: Lower Environments (Week 4-5)
- [ ] Create `rootweaver-staging` namespace
- [ ] Set up Kustomize overlays (base/dev/staging/prod)
- [ ] Configure FluxCD environment-specific reconciliation
- [ ] Enable feature branch Docker builds (validation only, no push)
- [ ] Add MR version labels (`version::major/minor/patch`)
- [ ] Vault: scope secrets per environment (`secret/rootweaver/dev/`, `secret/rootweaver/prod/`)
- [ ] Vault: bound claims restrict prod secrets to production branch only

### Phase 4: Automation Polish (Week 6+)
- [ ] Automate tag creation from MR labels on merge
- [ ] GitLab Releases page integration (changelog generation)
- [ ] Matrix notification on release creation
- [ ] SBOM attachment to releases
- [ ] Rollback runbook documentation
- [ ] Promote stable advisory tests to gate status
- [ ] Vault: PKI engine for internal TLS cert rotation
- [ ] Vault: Database engine for dynamic PostgreSQL/FalkorDB credentials

---

## References

- [GitLab Flow Best Practices](https://about.gitlab.com/topics/version-control/what-are-gitlab-flow-best-practices/)
- [GitLab Release CI/CD Examples](https://docs.gitlab.com/user/project/releases/release_cicd_examples/)
- [Automatic Semantic Versioning in GitLab CI](https://threedots.tech/post/automatic-semantic-versioning-in-gitlab-ci/)
- [FluxCD Environment Promotion with Git Branches](https://oneuptime.com/blog/post/2026-03-06-use-git-branches-environment-promotion-flux-cd/view)
- [GitOps Promotion Pipeline](https://oneuptime.com/blog/post/2026-02-09-gitops-promotion-pipeline-dev-staging-prod/view)
- [Docker Image Tagging Best Practices](https://www.augmentedmind.de/2022/05/15/docker-image-tag-best-practices/)
- [GitLab Flow vs GitFlow vs Trunk-Based](https://steven-giesel.com/blogPost/ff50f268-c0bf-44d8-a5b8-41554ab50ba8)
- [From Code to Kubernetes: GitLab CI + FluxCD](https://medium.com/@fenari.kostem/from-code-to-kubernetes-building-a-full-gitops-pipeline-with-gitlab-ci-and-fluxcd-aa6188ca517f)
- [Building a Production-Ready CI/CD Pipeline 2026](https://medium.com/@krishnafattepurkar/building-a-production-ready-ci-cd-pipeline-the-complete-2026-guide-b3d6a661ecd8)
