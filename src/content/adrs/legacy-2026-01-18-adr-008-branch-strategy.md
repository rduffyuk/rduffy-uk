---
id: 8
title: "Trunk-Based Development with Feature Flags"
status: proposed
recordedStatus: "Proposed"
date: 2026-01-18
tags: []
sourceKind: legacy-record
public: true
journeyId: "2026-01-18-legacy-adr-008-trunk-based-development-with-feature-flags"
---
# ADR-008: Trunk-Based Development with Feature Flags

## Navigation
Home *(internal reference; not included)* | Architecture *(internal reference; not included)* | EIP *(internal reference; not included)*

## Status
Proposed

## Date
2026-01-18

## Context

The current development workflow lacks documented standards for:

1. **Branch strategy**: No formal definition of how feature/dev branches merge to main
2. **Environment promotion**: Unclear relationship between branches and deployments
3. **Feature lifecycle**: No documented approach for feature rollout and rollback

### Current State

- GitOps *(internal reference; not included)* via FluxCD *(internal reference; not included)* auto-deploys from `main` branch
- No consistent pattern for feature development
- Mix of long-lived feature branches and direct commits to main
- Feature flags available via Unleash *(internal reference; not included)* (14+ flags) but not systematically used

### Industry Research (2026)

| Pattern | Adoption | Best For |
|---------|----------|----------|
| Trunk-Based Development | 70%+ (GitOps orgs) | Continuous deployment, small teams |
| GitFlow | Declining | Scheduled releases, large teams |
| Branch-per-environment | Anti-pattern | None (configuration drift risk) |

**Key Finding**: "Stop Using Branches for Deploying to Different GitOps Environments" - branches named `staging`, `production` lead to configuration drift and maintenance burden.

## Decision

**Adopt trunk-based development with feature flags** as the standard branching strategy.

### Core Principles

1. **Single trunk**: `main` is always deployable and represents production state
2. **Short-lived branches**: Feature branches live <2 weeks, merged frequently
3. **Feature flags for rollout**: Use Unleash flags for gradual deployment, not branches
4. **ADRs for architecture**: Significant changes require ADR in PR

### Branch Naming Convention

```
main                           # Production trunk (always deployable)
feature/<ticket>-<description> # Short-lived feature work
fix/<ticket>-<description>     # Bug fixes
docs/<description>             # Documentation updates
refactor/<description>         # Code refactoring (no behavior change)
```

### Workflow

```
Developer → Create feature branch → Implement + Test → PR to main
         → CI runs → Review → Merge → FluxCD auto-deploys
         → Enable via feature flag → Gradual rollout
```

### Feature Flag Integration

| Scenario | Approach |
|----------|----------|
| New capability | Flag disabled by default, enable per-environment |
| Breaking change | Flag for gradual rollout (10% → 50% → 100%) |
| A/B test | Unleash experiment with variants |
| Quick fix | Merge directly (no flag needed if < 1 hour risk window) |

### ADR Requirements

ADR required in PR when:
- Adding new capability/domain
- Changing public API contracts
- Modifying data schemas
- Selecting new technology/library
- Architectural decision affects >3 files

## Consequences

### Positive
- **Faster delivery**: No waiting for long-lived branch merges
- **Reduced drift**: Single source of truth in main
- **Safer rollout**: Feature flags enable instant rollback
- **Better reviews**: Smaller PRs are easier to review

### Negative
- **Discipline required**: Team must commit to short-lived branches
- **Flag management**: Feature flags add configuration overhead

## Alternatives Considered

1. **GitFlow** - Rejected (complexity doesn't match continuous deployment)
2. **Environment Branches** - Rejected (anti-pattern per GitOps best practices)
3. **No Branches** - Rejected (no PR review opportunity)

## References

- [GitOps Workflows - Red Hat](https://developers.redhat.com/articles/2022/07/20/git-workflows-best-practices-gitops-deployments)
- [Stop Using Branches for Environments - Codefresh](https://codefresh.io/blog/stop-using-branches-deploying-different-gitops-environments/)
- [Trunk-Based Development](https://trunkbaseddevelopment.com/)

---

*Canonical source: `eng-intel-platform/docs/adr/008-branch-strategy.md`*

---
*📖 Glossary *(internal reference; not included)**
