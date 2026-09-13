# 0002 — Canonical SQL migrations and source provenance

Decision: file-based SQL is authoritative for constraints and references. Drizzle declares the typed query shape; a parity test compares all column names and order. A local SQLite proxy adapter bridges Drizzle to Capacitor; it has no network component. Mutating operations are serialized at the application boundary; migrations and exports use database transactions.

Add transaction_sources and staging_rows now. A transaction may be supported by several statements. A single import_batch_id cannot correctly support rollback of an overlapping batch. transaction_sources records each contribution; Session 2 must compute a canonical representative and delete a ledger row only when its last committed source is removed. The compatibility import_batch_id must be derived deterministically, not from insertion order. Coverage retains per-batch source intervals; union and gap views will be derived.

Alternatives: only one batch per transaction; inferred provenance; ORM-only migrations. Those lose rollback history or depend on bridge-specific schema capabilities. SQL migration 2 rolls back without deleting data. Rolling the baseline to zero necessarily drops data and requires explicit destructive authorization at the API boundary.

The brief's fingerprint can collide for two legitimate identical purchases on the same day. Session 2 must resolve transaction occurrence/source identity with golden tests before claiming lossless deduplication. Neither idempotence nor order independence is claimed in this foundation.
