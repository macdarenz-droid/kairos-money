# 0008 — Import contributions, quarantine and deterministic ledger projection

## Decision

Retain a complete normalized document in encrypted `staging_rows` under reserved `source_row_id=__document__`, plus the individual review rows. Keep it after commit so a ledger can be recomputed from surviving committed documents. Unread files use a separate staged batch and reserved `__file__` payload. Selected bytes are encrypted in SQLite, not copied into unencrypted app files. No schema migration is required: the Session 1 staging/provenance schema already supports these payloads.

A document ID is SHA-256 of account ID and file SHA-256. Transaction fingerprint uses account, date, exact minor units, normalized description head and an explicit occurrence discriminator only for confirmed distinct collisions. Reconciliation sorts contributors deterministically; settled precedes pending, reviewed precedes unreviewed, then extraction confidence and stable source IDs. Every confirmed batch marks its reviewed rows verified, avoiding import-order-dependent verification metadata. Store every source contribution, not just the chosen row.

Before commit, balance mismatch quarantines the complete batch. Low-confidence, pending and probable duplicate rows require individual confirmation. Exact-key collisions are surfaced so distinct identical purchases can be retained. User rules created from corrections remain in staging and become live only in the commit transaction. Rollback removes those batch-owned rules and recomputes the ledger, coverage and payslip links from other committed documents. Namespaced importer-created merchants/categories without remaining references are cleaned up. Unrelated manual transactions and their notes are not deleted.

Coverage rows retain each source range; pure union/gap functions provide the user-visible view. The canonical state for order-independence tests is sorted logical ledger/source/coverage rows, not SQLCipher file bytes, rowids or wall-clock import event timestamps.

## Alternatives and limits

A single `transactions.import_batch_id` cannot safely represent overlaps. Deleting only transactions whose first-import batch matches the rollback target loses or strands shared transactions. Physical encrypted file bytes cannot be order-independent.

Current transfer automation requires unique reciprocal amount/currency/date candidates plus an explicit transfer description. Identical amounts alone can confuse an unrelated salary and purchase. Ambiguity stays visible as unmatched transfer data health rather than silently excluded spend.

A confirmed occurrence discriminator must remain consistent when reviewing repeated identical purchases in overlapping files; real issuer references are preferred. Session 2.5 adds source-precedence and explicit audited pending supersession, including changed amounts, after this gate passes. Do not change the frozen Session 2 acceptance tests during that revision.
