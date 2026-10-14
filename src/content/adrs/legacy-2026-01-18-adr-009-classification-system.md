---
id: 9
title: "Unified Classification System Architecture"
status: proposed
recordedStatus: "Proposed"
date: 2026-01-18
tags: []
sourceKind: legacy-record
public: true
journeyId: "2026-01-18-legacy-adr-009-unified-classification-system-architecture"
---
# ADR-009: Unified Classification System Architecture

## Navigation
Home *(internal reference; not included)* | Architecture *(internal reference; not included)* | Rootweaver *(internal reference; not included)*

## Status
Proposed

## Date
2026-01-18

## Context

Multiple classification needs exist across the platform:

1. **Existing**: `workflow_orchestrator/ai_classifier.py` - JIRA/GitLab event classification
2. **Proposed**: NaaS failure classification for CI/CD analysis
3. **Proposed**: Release notes change categorization
4. **Proposed**: Vault document routing for selective indexing
5. **Future**: Confluence page type classification

### Problem Symptoms

- Classification logic scattered across proposed projects
- No unified taxonomy for categories
- Inconsistent confidence thresholds
- No shared training/evaluation pipeline

## Decision

**Extend existing `ai_classifier.py` into a unified classification system** with domain-specific pattern libraries.

### Architecture

```
INPUT LAYER                    CLASSIFICATION ENGINE
┌─────────────────┐           ┌─────────────────────────────────┐
│ GitLab Webhooks │           │     Pattern Library Registry    │
│ JIRA Events     │──────────►│  ┌───────────┬───────────┐     │
│ Vault Files     │           │  │ Delivery  │ Release   │     │
│ Confluence      │           │  │ Patterns  │ Patterns  │     │
└─────────────────┘           │  └───────────┴───────────┘     │
                              │              │                  │
                              │              ▼                  │
                              │  ┌─────────────────────────────┐│
                              │  │   AIClassifier (Extended)   ││
                              │  │  • Rule-based matching      ││
                              │  │  • LLM fallback             ││
                              │  │  • Confidence scoring       ││
                              │  └─────────────────────────────┘│
                              └─────────────────────────────────┘
                                             │
OUTPUT LAYER                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│              Action Router (Confidence-Gated)                   │
│  HIGH (>0.85): Auto-execute  │  MED (0.6-0.85): Queue+Review   │
│  LOW (<0.6): Human-only      │  UNKNOWN: Flag for training     │
└─────────────────────────────────────────────────────────────────┘
```

### Classification Domains

**Delivery Domain** (CI/CD Failures):
- `test_failure` → create_jira_bug
- `infrastructure` → alert_oncall
- `flaky_test` → flag_for_review

**Release Domain** (Change Categories):
- `feature` → persona tags: product, marketing
- `bugfix` → persona tags: engineering, support
- `breaking` → requires_review: true

**Vault Routing Domain**:
- `architecture` → index to: chromadb, confluence
- `journal` → index to: chromadb only
- `sensitive` → do not index, alert: security_review

### Confidence Thresholds

| Confidence | Action | Example |
|------------|--------|---------|
| > 0.85 | Auto-execute | Clear test failure → Create JIRA bug |
| 0.6 - 0.85 | Queue for review | Ambiguous change → Suggest category |
| < 0.6 | Human-only | Novel pattern → Manual classification |

## Consequences

### Positive
- **Single classification engine**: One codebase, multiple domains
- **Consistent behavior**: Same confidence thresholds and audit logging
- **Extensible**: Add new domains via YAML patterns
- **Gradual rollout**: Feature flags control automation level

### Negative
- **Central dependency**: All domains depend on classifier availability
- **Pattern maintenance**: Multiple YAML files to maintain

## Implementation Plan

1. Create `configs/classification/` directory structure
2. Define YAML schema for pattern libraries
3. Extend `ai_classifier.py` with pattern loading
4. Implement delivery domain patterns
5. Implement release domain patterns
6. Implement vault routing patterns

## References

- [Atlassian Intelligence](https://www.atlassian.com/software/confluence/resources/guides/best-practices/atlassian-ai)
- Internal: `workflow_orchestrator/ai_classifier.py` (385 LOC)
- Internal: ADR-006 (Domain Consolidation)

---

*Canonical source: `eng-intel-platform/docs/adr/009-classification-system.md`*

---
*📖 Glossary *(internal reference; not included)**
