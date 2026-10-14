---
id: 70
title: "Config-Keyed Client Singletons"
status: accepted
recordedStatus: "Accepted"
date: 2026-06-10
tags: ["rootweaver-core", "singletons"]
sourceKind: source-record
public: true
episode: "season-4-episode-02-the-morning-after-proving-the-fixes-were-real"
journeyId: "2026-06-10-adr-070-share-clients-by-configuration-without-mutating-other-callers"
---
# ADR-070: Config-Keyed Client Singletons

**Status**: Accepted (2026-06-10) · **Driver**: VW-682 (VW-673 audit theme 6) · **MR**: !132 → `c5477bc8`

## Context

`rootweaver-core/utils/clients.py` exposes process-wide singleton clients
(QdrantVectorClient, OllamaLLMClient, VLLMClient) behind feature-flagged `__new__`
overrides. The audit confirmed two defects in the single-instance form:

1. **Constructor args silently ignored** — `__init__` began with
   `if self._initialized: return` *before* reading `host/port/collection/model`,
   so `QdrantVectorClient(collection="X")` after first construction silently kept
   the first config.
2. **Shared-state mutation as a workaround** — callers (ResilientLLMClient,
   `get_llm`/`get_vllm`) compensated by assigning `client._default_model = model`
   directly on the shared instance, bleeding one holder's model override into
   every other holder in the process.

## Decision

**Singleton instances are keyed by their resolved configuration.**

### Before
```python
_instance: Optional[Client] = None          # ONE instance per process
def __new__(cls):  return cls._instance or create()
def __init__(self, host=None, ...):
    if self._initialized: return            # args after first call: ignored
client = Client(); client._default_model = m   # callers mutate shared state
```

### After
```python
_instances: ClassVar[Dict[tuple, Client]] = {}   # one instance PER CONFIG
@staticmethod
def _resolve_config(host=None, ...) -> tuple: ...   # same resolution as __init__
def __new__(cls, *a, **kw):
    key = cls._resolve_config(*a, **kw)
    return cls._instances.setdefault-like(key)      # equal config → shared
client = Client(default_model=m)                    # per-config instance; no mutation
```

Rules:
- Equal resolved config → the same shared instance (singleton benefit preserved).
- Different config → its own instance. Constructor args are always honoured.
- **No caller may assign client-internal state** (`_default_model`, `_base_url`,
  `_default_collection`) on an instance it did not construct. Want a different
  model? Construct with `default_model=`.
- `_resolve_config` is the single arg/env/default resolution used by BOTH
  `__new__` (keying) and `__init__` (state) so key and state cannot diverge.
- The non-singleton feature-flag path (`core.*_singleton` OFF) is unchanged.

## Consequences

- One holder's override can no longer change another holder's behaviour
  (the audit's HIGH: ResilientLLMClient's Ollama fallback model leaked into every
  `get_llm()` consumer).
- `get_qdrant(collection=...)` works correctly at any point in process lifetime.
- Accepted residuals: the registry dict is unbounded but keys are finite config
  tuples in practice; the check-then-set in `__new__` is unlocked (as the old code
  was) — worst case a duplicate construction race, last write wins.
- Tests: `packages/rootweaver-core/tests/test_rootweaver_core_clients_singletons.py`
  pins sharing, isolation, no-bleed, and the `list_models` timeout.

## Related
ADR-066 (feature-flag fail-closed) · VW-682 impl report
`02-Active-Work/Implementation-Reports/2026-Q2/2026-06-10-VW-682-Singleton-Theme-Remediation.md`
