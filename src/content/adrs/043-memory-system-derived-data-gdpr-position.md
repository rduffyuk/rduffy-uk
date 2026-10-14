---
id: 43
title: "Memory System Derived-Data GDPR Position"
status: proposed
recordedStatus: "Proposed"
date: 2026-05-17
tags: ["gdpr", "memory", "retention", "compliance", "vw-391"]
sourceKind: source-record
public: true
journeyId: "2026-05-17-adr-043-memory-system-derived-data-gdpr-position"
---
# ADR-043 — Memory System Derived-Data GDPR Position

**Status**: Proposed
**Date**: 2026-05-17
**Jira**: VW-391 *(internal reference; destination redacted)*
**Related design**: 2026-05-17-Long-Term-Memory-Postgres-Design *(internal reference; not included)*

---

## Context

The long-term memory system (VW-391) ingests Claude Code session JSONL transcripts and produces multiple layers of derived data:

1. **Source JSONL** — the raw conversation transcript on disk
2. **`rounds` rows in Postgres** — user/assistant text + tool calls extracted verbatim
3. **`facts` rows in Postgres** — LLM-extracted structured decisions/problems/learnings with reasoning
4. **`artifacts` rows in Postgres** — references to commits, vault docs, Jira issues, k8s applies
5. **`embedding` vectors** — pgvector representations derived from text content
6. **FalkorDB nodes/edges** — entities and relationships derived from facts
7. **`assistant_thinking`** — raw reasoning content (redacted at insert, audit-only)

When a user invokes the right to erasure (GDPR Article 17), **which of these layers must be deleted?** The question is genuinely contested in 2025-2026.

### Regulatory landscape (as of 2026-05-17)

- **Hamburg DPA discussion paper, July 2024**: argued LLM model parameters are not personal data — deletion of training inputs doesn't require deletion of weights ([Hamburg paper](https://datenschutz-hamburg.de/fileadmin/user_upload/HmbBfDI/Datenschutz/Informationen/240715_Discussion_Paper_Hamburg_DPA_KI_Models.pdf))
- **EDPB Opinion 28/2024, December 2024**: rejected Hamburg's view. Anonymity requires that extraction/regurgitation of personal data from the model be impossible. If extraction is possible (which it often is for fact-extraction pipelines), the data remains personal data subject to Article 17 ([DLA Piper analysis](https://privacymatters.dlapiper.com/2025/01/eu-edpb-opinion-on-ai-provides-important-guidance-though-many-questions-remain/))
- **EDPB CEF 2025**: coordinated enforcement framework on right to erasure across all EU regulators, report due February 2026 ([EDPB CEF 2025 launch](https://www.edpb.europa.eu/news/news/2025/cef-2025-launch-coordinated-enforcement-right-erasure_en))
- **OWASP AISVS C08**: explicitly mandates hard-delete + tombstoning for RTBF in vector/memory stores; soft-delete is non-compliant ([OWASP AISVS C08](https://github.com/OWASP/AISVS/blob/main/1.0/en/0x10-C08-Memory-Embeddings-and-Vector-Database.md))
- **Practitioner consensus**: hard-delete is the defensible default ([aicompetence.org RAG forget guide](https://aicompetence.org/teach-rag-to-forget-handle-deletion-requests-fast/))

### Why this matters for THIS project

Ryan personally is **not** subject to GDPR for his own private notes on his own infrastructure (no third-party processing). However:

- The project is planned for public release. Downstream users may operate it in multi-user, team, or service-with-customers contexts where GDPR applies.
- Defaults shape behaviour. Shipping with soft-delete-by-default would create GDPR exposure for everyone who deploys it without revisiting the retention strategy.
- The conservative read costs little and avoids a class of regulatory and reputational risk.

---

## Decision

**We treat all derived data in the memory system as personal data when the source transcript contains personal data, and we cascade-delete it on session erasure.**

Concretely:

1. **`ON DELETE CASCADE` from `sessions`** propagates to `rounds`, `facts`, `fact_corrections`, `artifacts`, `file_snapshots`. A single `DELETE FROM sessions WHERE id = ?` removes the complete derived graph.

2. **pgvector embeddings deleted alongside their parent rows.** Because pgvector columns live ON the same tables as the source text (rounds.embedding, facts.embedding, sessions.summary_embedding), the cascade is automatic. We deliberately did NOT split embeddings into a separate table — that would have broken cascade-delete the way langchain+pgvector does ([langchain discussion #17499](https://github.com/langchain-ai/langchain/discussions/17499)).

3. **FalkorDB nodes/edges reconstructed weekly from Postgres source-of-truth.** Once Postgres cascade-deletes happen, the next reconciliation pass removes the corresponding FalkorDB nodes (no orphan policy: nodes without a Postgres parent are dropped).

4. **7-day grace tombstone** before hard-delete fires, to recover from operator typos. `sessions.tombstoned_at` is set; cron job `memory-tombstone-reaper` runs `DELETE WHERE tombstoned_at < now() - interval '7 days'`. All MCP tools and dashboard queries apply implicit `WHERE tombstoned_at IS NULL` filter so tombstoned sessions are functionally deleted from the moment of mark.

5. **`--immediate` flag bypasses tombstone** for actual GDPR-deadline requests (Article 12 allows one month for response; some operators may need faster).

6. **Redaction at insert** for the `assistant_thinking` column. Reasoning content has documented 19-78% sensitive-value leakage rate ([Leaky Thoughts, arXiv:2506.15674](https://arxiv.org/html/2506.15674v1)). NER-based scrub via existing `ner-consumer` infrastructure removes API keys, emails, phone numbers, named persons, credit card numbers before the row is persisted.

7. **Source JSONL files are NOT auto-deleted** by `memory-forget`. They are user-owned files under `conversation-archives/raw-jsonl/`; deleting them is an explicit user action separate from memory erasure. Documented in operator handbook.

---

## Consequences

### Positive

- **Defensible against regulator inquiry.** Aligned with EDPB Opinion 28/2024 (current most-authoritative interpretation) and OWASP AISVS C08 (industry-standard control framework).
- **Public release is GDPR-safe by default.** Downstream deployers don't have to revisit retention to comply; the strict-by-default position is shipped out of the box.
- **Single command erases a session completely.** `memory-forget --session-id &lt;uuid&gt;` plus 7-day grace covers operator-error recovery. `--immediate` flag covers strict deadline requests.
- **No orphaned vectors.** pgvector embeddings live on the same tables as source text; cascade-delete is automatic and verifiable.
- **Tombstone pattern protects against typo errors** without softening the eventual deletion guarantee.
- **Co-location reduces erasure complexity rather than increases it** (decision validated 2026-05-17 by 3 parallel research agents). The intuition that "separate databases give cleaner GDPR isolation" turns out to be wrong: federated stores require coordinating multi-system DELETEs, while a single `DELETE FROM memory.sessions WHERE id = ?` against a co-located schema is one transaction with deterministic cascade. mem0.ai's security analysis confirms this empirically; OWASP AISVS C08 explicitly allows logical isolation (RBAC + RLS + schemas) to satisfy the isolation requirement. The 7 verified production PKM-plus-LLM-memory systems surveyed (Khoj, Letta, Cognee, Memori, Open Brain, Smart Connections, Notion) all co-locate, and zero anti-precedent postmortems were found. The `memory` schema namespace gives us a clean cascade boundary inside `vault_index` while preserving the cross-schema JOINs (`memory.artifacts.artifact_ref ↔ public.notes.path`) that make `vault_doc_history` and `recall_origin` single-query operations.

### Negative

- **Cascade can be expensive.** A large session may have hundreds of facts and artifacts. CASCADE through pgvector indexes triggers index updates. At Ryan's scale this is negligible; at production scale (millions of facts) it may need partition-aware deletion strategies (out of scope v1).
- **Implicit `WHERE tombstoned_at IS NULL` filter on every query.** Adds query complexity. Mitigated by always using prepared MCP tool wrappers + dashboard views; raw SQL operators must remember the filter.
- **Re-ingestion of a deleted session** produces a new UUID (we don't re-use session_id). Forensic continuity from old commit trailers to the new ingestion is broken by design — this is correct behaviour for GDPR (the erasure was meant to be permanent), but is a forensic-recovery cost.
- **Source JSONL not auto-deleted** is a conscious choice. Some interpretations of GDPR would require deletion of the original record too. We surface this clearly so operators can decide their own JSONL retention policy.

### Open / Acknowledged limitations

- **Entity-level cascade is out of v1 scope.** "Forget everyone named X across all sessions" needs an entity-tag index that doesn't exist yet. Documented as VW-XXX in the implementation plan.
- **Model weights are not in scope.** This memory system does not fine-tune models on the ingested data; the question of "must model weights be retrained?" doesn't apply. If a future capability does fine-tune from this corpus, the ADR must be revisited per the [What Should LLMs Forget? (arXiv:2507.11128)](https://arxiv.org/html/2507.11128v1) literature.
- **Query audit log is not in v1.** Single-user defers this cleanly. Multi-user deployments will need to revisit (GDPR Article 30 record-of-processing implications).
- **Backup retention.** If Postgres backups (Velero / pg_dump CronJobs) retain deleted sessions in older snapshots, full erasure requires either backup-rotation policy alignment or selective restore-and-redelete. Documented in operator handbook.

---

## Alternatives Considered

### Alt 1: Soft delete with `deleted_at` flag, never purge

**Rejected.** Soft-delete is explicitly non-compliant per OWASP AISVS C08 and the Brandur Leach general argument ([Soft Deletion Probably Isn't Worth It](https://brandur.org/soft-deletion)). Creates ongoing GDPR exposure rather than discharging it.

### Alt 2: Cascade-delete source rows but RETAIN derived facts (Hamburg DPA position)

**Rejected.** Hamburg DPA's position has not survived EDPB review. CEF 2025 enforcement push (report Feb 2026) is likely to align EU-wide on the EDPB Opinion 28/2024 position. Building on the contested-and-losing interpretation is unsafe even if Ryan personally is not subject to GDPR.

### Alt 3: Redaction-at-query rather than redaction-at-insert

**Rejected.** Query-time redaction requires trusting the query layer in ways that don't survive prompt injection (an attacker could ask the model to bypass the redactor). Insert-time redaction permanently removes the sensitive substring before it touches persistent storage. Trade-off: insert-time loses the original; query-time risks leak. The leakage risk dominates.

### Alt 4: No `memory-forget` tool, use raw SQL

**Rejected** (after specific discussion with Ryan, 2026-05-17). For personal single-user use the raw `psql -c "DELETE FROM sessions WHERE id = ?"` path would be sufficient. For public release, a typed wrapper script with `--dry-run` preview, `--immediate` flag, and the tombstone safety net is a meaningful safety improvement. Cost is low (~one file, one cron job, one filter column).

---

## How to validate this ADR is being followed

1. **Schema check**: every table with personal-data content has `ON DELETE CASCADE` chain back to `memory.sessions.id`
   ```sql
   SELECT conname, conrelid::regclass FROM pg_constraint
   WHERE contype = 'f' AND confrelid = 'memory.sessions'::regclass
     AND confdeltype = 'c';   -- 'c' = CASCADE
   ```

2. **Embedding co-location check**: every pgvector column lives on a table with `session_id` FK in the `memory` schema
   ```sql
   SELECT table_schema, table_name, column_name
   FROM information_schema.columns
   WHERE udt_name = 'vector' AND table_schema = 'memory';
   -- All results must be on memory.* tables with memory.sessions(id) FK
   ```

3. **Schema namespace check**: every VW-391 table lives in the `memory` schema (so `DROP SCHEMA memory CASCADE` is a clean removal path)
   ```sql
   SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'memory';
   -- Expected: sessions, rounds, facts, fact_corrections, artifacts,
   --           file_snapshots, backfill_progress
   ```

3. **Tombstone filter audit**: every MCP tool query and every dashboard panel applies the `WHERE sessions.tombstoned_at IS NULL` filter. Code review checklist item.

4. **Redactor regression test**: `tests/regression/test_redactor_pii_seed.py` runs in CI on every PR touching `redactor.py`.

5. **Cron evidence**: `memory-tombstone-reaper` cron job runs daily; Prometheus metric `memory_tombstone_reaper_rows_deleted_total` is non-zero whenever tombstoned sessions exist.

---

## When to revisit this ADR

- **CEF 2025 report publishes (Feb 2026)** — adjust the position based on coordinated enforcement direction
- **Project moves to multi-user deployment** — likely need entity-level cascade + query audit log
- **Project adds fine-tuning from the memory corpus** — model weights become in-scope; major re-evaluation
- **EDPB issues clarifying opinion on derived-data deletion** — re-anchor against latest guidance
- **A regulator inquiry occurs** in any deployment of this code — escalate to ADR revision regardless of outcome

---

## References

- [Mem0 AI memory security best practices](https://mem0.ai/blog/ai-memory-security-best-practices) — GDPR-erasure analysis used to validate co-location decision 2026-05-17
- [Letta GitHub](https://github.com/letta-ai/letta) — production precedent for co-located source + memory tables
- [Crunchy Data: Postgres multi-tenancy](https://www.crunchydata.com/blog/designing-your-postgres-database-for-multi-tenancy) — schema-isolation guidance
- [ProvSQL VLDB 2018](http://www.vldb.org/pvldb/vol11/p2034-senellart.pdf) — academic precedent for fine-grained co-located provenance
- [Hamburg DPA Discussion Paper on AI Models (July 2024)](https://datenschutz-hamburg.de/fileadmin/user_upload/HmbBfDI/Datenschutz/Informationen/240715_Discussion_Paper_Hamburg_DPA_KI_Models.pdf)
- [EDPB Opinion 28/2024 (DLA Piper analysis, Jan 2025)](https://privacymatters.dlapiper.com/2025/01/eu-edpb-opinion-on-ai-provides-important-guidance-though-many-questions-remain/)
- [EDPB CEF 2025 launch announcement](https://www.edpb.europa.eu/news/news/2025/cef-2025-launch-coordinated-enforcement-right-erasure_en)
- [EDPB DSR implementation paper (Jan 2025)](https://www.edpb.europa.eu/system/files/2025-01/d2-ai-effective-implementation-of-data-subjects-rights_en.pdf)
- [OWASP AISVS C08: Memory, Embeddings, Vector DB](https://github.com/OWASP/AISVS/blob/main/1.0/en/0x10-C08-Memory-Embeddings-and-Vector-Database.md)
- [Brandur Leach — Soft Deletion Probably Isn't Worth It](https://brandur.org/soft-deletion)
- [aicompetence.org — Teach RAG to forget](https://aicompetence.org/teach-rag-to-forget-handle-deletion-requests-fast/)
- [Leaky Thoughts (arXiv:2506.15674)](https://arxiv.org/html/2506.15674v1)
- [What Should LLMs Forget? (arXiv:2507.11128)](https://arxiv.org/html/2507.11128v1)
- [langchain pgvector cascade-delete discussion #17499](https://github.com/langchain-ai/langchain/discussions/17499)
- [Milvus deletion mechanics](https://medium.com/vector-database/how-milvus-realizes-the-delete-function-727406c27cff)

---

## Decision record metadata

- **Proposed by**: Ryan Duffy (via brainstorming session with Claude Opus 4.7, 2026-05-17)
- **Reviewed by**: pending
- **Accepted on**: pending (proposed status until VW-391 implementation kicks off)
- **Supersedes**: none
