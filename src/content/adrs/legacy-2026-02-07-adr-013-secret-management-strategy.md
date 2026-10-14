---
id: 13
title: "Secret Management Strategy for Rootweaver Platform"
status: accepted
recordedStatus: "accepted"
date: 2026-02-07
tags: ["security", "secrets", "infrastructure", "hashicorp-vault"]
sourceKind: legacy-record
public: true
journeyId: "2026-02-07-legacy-adr-013-secret-management-strategy-for-rootweaver-platform"
---
# ADR-013: Secret Management Strategy for Rootweaver Platform

**Status**: Accepted (Tier 1 implemented — VW-28)
**Date**: 2026-02-07
**Jira**: VW-25 *(internal reference; destination redacted)*
**Author**: Ryan Duffy (with Claude Code research)

---

## Context

The Rootweaver platform currently stores secrets as **plain-text base64-encoded Kubernetes Secrets** committed directly to the `rootweaver-gitops` repository. This creates several critical security risks:

### Current State Assessment

| Risk | Severity | Detail |
|------|----------|--------|
| Secrets in Git history | **Critical** | At least 1 live API key (Perplexity `REDACTED_CREDENTIAL...`) visible in plain text |
| No encryption at rest | **High** | K3s etcd stores secrets unencrypted by default |
| Hardcoded credentials | **High** | Unleash admin password, PostgreSQL passwords in manifests |
| Docker registry tokens | **High** | GitLab API token embedded in base64 Docker config |
| No rotation strategy | **Medium** | No automated or manual secret rotation in place |
| Manual management friction | **Medium** | GitLab token managed with FluxCD disabled annotation |

### Secrets Inventory (7 manifest files)

1. `rootweaver-gitops/infrastructure/rootweaver/secrets.yaml` — ANTHROPIC_API_KEY, SERPER_API_KEY, PERPLEXITY_API_KEY, OPENAI_API_KEY
2. `rootweaver-gitops/infrastructure/prefect/secrets.yaml` — POSTGRES_PASSWORD, GITLAB_TOKEN
3. `rootweaver-gitops/infrastructure/unleash/secrets.yaml` — POSTGRES_PASSWORD, admin credentials
4. `rootweaver-gitops/infrastructure/rootweaver/gitlab-registry-secret.yaml` — Docker registry credentials
5. `rootweaver-gitops/apps/librechat/librechat-secrets.yaml` — LibreChat API keys
6. `infrastructure/rag-platform/secrets.yaml` — RAG platform API keys
7. `eng-intel-platform/infrastructure/base/secrets.yaml` — EIP secrets

### Platform Constraints

- **Single-node K3s cluster** (Desktop: RTX 4080, 62GB RAM)
- **GitOps workflow** with FluxCD auto-reconciliation
- **Resource-constrained** — vLLM uses full GPU, many services already running
- **Single operator** — no team, minimal operational overhead preferred
- **No HA requirement** — single node, downtime acceptable

---

## Decision Drivers

1. **Security**: Secrets must not be readable in git repositories
2. **GitOps compatibility**: Must work with FluxCD reconciliation
3. **Operational simplicity**: Single operator, minimal maintenance burden
4. **Resource efficiency**: Cannot afford heavy infrastructure additions
5. **Open source**: Prefer OSI-approved licenses where possible
6. **Pragmatism**: Right-sized for a homelab/personal platform, not enterprise

---

## Options Evaluated

### Option A: HashiCorp Vault (BSL)

**What it is**: Industry-standard secrets management platform with dynamic secrets, PKI, encryption-as-a-service, and audit logging.

| Aspect | Assessment |
|--------|-----------|
| **License** | BSL 1.1 — free for non-competing commercial use, converts to MPL after 4 years |
| **Features** | Dynamic secrets, PKI, Transit engine, lease-based rotation, audit log |
| **K8s integration** | Sidecar Agent Injector, CSI provider, Vault Secrets Operator (VSO) |
| **Resources** | ~512MB RAM minimum (idle ~18MB), 2+ CPU cores recommended, SSD storage |
| **Operational cost** | **High** — requires unsealing on restart, HA setup complex, backup strategy needed |
| **Maturity** | Battle-tested, massive ecosystem, extensive documentation |

**Verdict**: Overkill for a single-node personal platform. The unsealing ceremony alone (manual or auto-unseal configuration) adds operational burden disproportionate to the benefit. Dynamic secrets and PKI are powerful but unnecessary at this scale.

### Option B: OpenBao (MPL 2.0)

**What it is**: Linux Foundation-hosted fork of Vault's last MPL-licensed version. API-compatible with Vault.

| Aspect | Assessment |
|--------|-----------|
| **License** | MPL 2.0 — truly open source, OSI-approved |
| **Features** | Mirrors Vault: dynamic secrets, PKI, flexible storage backends |
| **K8s integration** | Supported but still maturing |
| **Resources** | Similar to Vault |
| **Operational cost** | **High** — same unsealing complexity as Vault |
| **Maturity** | GA since July 2024 (v2.0), active development (v2.4.4, Nov 2025), ~2,800 GitHub stars |

**Verdict**: Better license than Vault, but same operational complexity. K8s integration still catching up. Worth watching for future, but same overkill concern applies.

### Option C: Infisical (MIT)

**What it is**: Modern secrets management platform with developer-friendly UX, versioning, rotation, and native K8s operator.

| Aspect | Assessment |
|--------|-----------|
| **License** | MIT — fully permissive |
| **Features** | Secret versioning, rotation, environment separation, scanning, dynamic secrets, PKI |
| **K8s integration** | Native operator + ESO compatibility |
| **Resources** | Requires PostgreSQL + Redis (we already have PostgreSQL) |
| **Operational cost** | **Medium** — web UI simplifies management, but another service to maintain |
| **Maturity** | Production-ready, well-funded startup, active development |

**Verdict**: Middle ground — more accessible than Vault but still adds infrastructure. The web UI is nice but adds attack surface. Would require a new NodePort allocation.

### Option D: Sealed Secrets (Bitnami) + SOPS

**What it is**: Two complementary lightweight tools:
- **Sealed Secrets**: K8s controller that encrypts secrets client-side; only the in-cluster controller can decrypt. Encrypted `SealedSecret` resources are safe to commit to git.
- **SOPS** (Secrets OPerationS): Encrypts values within YAML/JSON files using age/PGP/KMS keys. Works at the file level.

| Aspect | Assessment |
|--------|-----------|
| **License** | Apache 2.0 (Sealed Secrets), MPL 2.0 (SOPS) |
| **Features** | Encrypt secrets in git, FluxCD-native decryption, no server-side secret management UI |
| **K8s integration** | **Native** — Sealed Secrets is purpose-built for K8s + GitOps |
| **Resources** | ~50MB RAM for the controller. SOPS is a CLI tool, zero runtime cost. |
| **Operational cost** | **Low** — install controller, seal secrets, commit. FluxCD handles decryption. |
| **Maturity** | Sealed Secrets: 7k+ GitHub stars, Bitnami-maintained. SOPS: Mozilla-originated but note maintenance concerns. |

**Verdict**: Right-sized for this platform. Addresses the core problem (secrets in git) with minimal overhead. FluxCD has native SOPS integration for decryption.

### Option E: External Secrets Operator (ESO) + Backend

**What it is**: K8s operator that syncs secrets from external stores (Vault, AWS SM, GCP SM, etc.) into native K8s Secrets via CRDs.

| Aspect | Assessment |
|--------|-----------|
| **License** | Apache 2.0 |
| **Features** | Bridges any external store to K8s, CRD-based, supports many backends |
| **K8s integration** | **Kubernetes-native** — designed specifically for this |
| **Resources** | Light operator, but requires a backing secret store |
| **Operational cost** | **Medium** — ESO itself is simple, but you still need a backend |
| **Maturity** | De facto standard for K8s secret synchronization |

**Verdict**: ESO is an excellent connector but not a standalone solution — it needs a backing store. Best paired with Vault/OpenBao/Infisical if upgrading later.

---

## Comparison Matrix

| Criteria | Vault | OpenBao | Infisical | Sealed Secrets + SOPS | ESO |
|----------|-------|---------|-----------|----------------------|-----|
| **License** | BSL | MPL 2.0 | MIT | Apache/MPL | Apache |
| **Secrets in git safe** | N/A (external) | N/A (external) | N/A (external) | **Yes** | N/A |
| **FluxCD native** | No | No | No | **Yes** | Partial |
| **RAM overhead** | ~512MB | ~512MB | ~256MB+deps | **~50MB** | ~64MB |
| **Operational complexity** | High | High | Medium | **Low** | Medium |
| **Dynamic secrets** | Yes | Yes | Yes | No | Via backend |
| **Audit logging** | Yes | Yes | Yes | No | No |
| **PKI/certs** | Yes | Yes | Yes | No | No |
| **Single-node friendly** | No | No | Moderate | **Yes** | Yes |
| **Setup time** | Hours | Hours | ~1 hour | **~15 minutes** | ~30 min |

---

## Decision

**Adopt a tiered approach:**

### Tier 1 — Immediate (Sealed Secrets)

Deploy **Bitnami Sealed Secrets** controller to the K3s cluster.

- Install via Helm chart in `kube-system` namespace
- Use `kubeseal` CLI to encrypt all existing secret manifests
- Replace plain `Secret` resources with `SealedSecret` resources in gitops repo
- FluxCD will automatically decrypt and create the real K8s Secrets in-cluster
- **Rotate all exposed API keys** (Perplexity, GitLab token, etc.)
- Scrub git history of plain-text secrets using `git-filter-repo`

### Tier 2 — Near-term (SOPS + age for non-K8s configs)

Add **SOPS with age encryption** for any configuration files that need secrets but aren't K8s manifests (e.g., `.env` files, CI/CD configs).

- Generate an `age` keypair, store the private key securely on the Desktop
- Configure FluxCD's native SOPS decryption provider
- Complementary to Sealed Secrets, not a replacement

### Tier 3 — Future (Vault/OpenBao if needed)

If the platform grows to require **dynamic secrets** (auto-rotating DB credentials), **PKI** (internal TLS certificates), or **audit logging** (compliance), evaluate deploying **OpenBao** (preferred for open-source license) or **Vault**.

- Trigger: When >2 databases need rotating credentials, or internal mTLS is required
- ESO would serve as the bridge between Vault/OpenBao and K8s

---

## Consequences

### Positive

- Secrets are encrypted at rest in git — safe to push to any remote
- Minimal resource overhead (~50MB RAM for Sealed Secrets controller)
- Native FluxCD integration — no workflow changes for deployments
- Operational simplicity — single operator can manage easily
- Clear upgrade path to Vault/OpenBao if needs grow
- Open-source licensed tools throughout

### Negative

- No dynamic secret generation (static secrets only)
- No built-in audit logging of secret access
- No web UI for secret management (CLI-only via `kubeseal`)
- Sealed Secrets controller key must be backed up — losing it means re-sealing everything
- SOPS maintenance status uncertain (Mozilla funding cuts)

### Risks

| Risk | Mitigation |
|------|-----------|
| Sealed Secrets controller key loss | Back up controller key pair to encrypted offline storage |
| SOPS maintenance stalls | age encryption is standalone; SOPS is replaceable |
| Future need outgrows tier 1 | Tier 3 upgrade path defined; ESO bridges to any backend |
| Git history still contains old secrets | `git-filter-repo` to scrub; rotate all exposed keys |

---

## Alternatives Considered

See Options A–E above. Full reasoning for rejection:

- **Vault/OpenBao**: Operational complexity (unsealing, HA, backups) disproportionate to single-node homelab. Reserve for Tier 3.
- **Infisical**: Adds another service + database dependency. Good middle ground but unnecessary when Sealed Secrets solves the core problem.
- **ESO alone**: Connector, not a solution. Needs a backing store.
- **K8s native encryption at rest**: Only encrypts etcd; doesn't solve secrets-in-git problem.

---

## Implementation Notes

### Sealed Secrets Deployment

```yaml
# rootweaver-gitops/infrastructure/kube-system/sealed-secrets/
apiVersion: source.toolkit.fluxcd.io/v1
kind: HelmRepository
metadata:
  name: sealed-secrets
  namespace: flux-system
spec:
  interval: 1h
  url: https://bitnami-labs.github.io/sealed-secrets
---
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: sealed-secrets
  namespace: kube-system
spec:
  interval: 30m
  chart:
    spec:
      chart: sealed-secrets
      version: ">=2.0.0"
      sourceRef:
        kind: HelmRepository
        name: sealed-secrets
        namespace: flux-system
```

### Sealing a Secret

```bash
# Install kubeseal CLI
brew install kubeseal

# Seal an existing secret
kubeseal --format yaml < secret.yaml > sealed-secret.yaml

# The sealed-secret.yaml is safe to commit
git add sealed-secret.yaml
git commit -m "chore(secrets): seal rootweaver secrets with SealedSecrets"
```

### Key Backup

```bash
# Export controller key pair (do this immediately after install)
kubectl get secret -n kube-system -l sealedsecrets.bitnami.com/sealed-secrets-key \
  -o yaml > sealed-secrets-master-key.yaml

# Store encrypted offline (NOT in git)
age -r <your-age-public-key> sealed-secrets-master-key.yaml > sealed-secrets-master-key.yaml.age
```

---

## References

- [HashiCorp Vault](https://developer.hashicorp.com/vault) — Official docs
- [OpenBao](https://openbao.org/) — Linux Foundation Vault fork
- [Infisical](https://infisical.com/) — MIT-licensed secrets platform
- [Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets) — Bitnami K8s encryption
- [SOPS](https://github.com/getsops/sops) — Secrets OPerationS
- [FluxCD SOPS Integration](https://fluxcd.io/flux/guides/mozilla-sops/) — Native decryption
- [Vault vs OpenBao](https://digitalis.io/post/choosing-a-secrets-storage-hashicorp-vault-vs-openbao) — Detailed comparison
- [Open Source Secrets Management 2026](https://infisical.com/blog/open-source-secrets-management-devops) — Landscape overview
- [Vault K8s Integration Methods](https://www.hashicorp.com/en/blog/kubernetes-vault-integration-via-sidecar-agent-injector-vs-csi-provider) — Sidecar vs CSI vs VSO

---

### External Links

| Platform | Link |
|----------|------|
| Jira | VW-25 *(internal reference; destination redacted)* |
| Confluence | ADR-013: Secret Management Strategy *(internal reference; destination redacted)* |
