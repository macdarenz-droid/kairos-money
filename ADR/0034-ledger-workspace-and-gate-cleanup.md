# 0034 — Reuse ledger reads and bound native fixture cleanup

Status: accepted for implementation; native measurements pending.

Run 34847174081 completed both 20,000-row traversals but timed out during synthetic-data removal. Its complete measurement report also shows a 62,376 ms load and slow frames. The previous scoped fixture lifetime and paged row reads remain in place.

The import workspace now obtains pending files and validated documents once, then reconciles that same document set and applies current stored category labels. It stays inside the existing session serialization boundary, has no cross-refresh document cache, and retains the independent ledger API. Invalid source identity still rejects the complete read. Staged and rolled-back documents remain visible as history and remain excluded from committed ledger reconciliation.

Money formatting retains at most 32 Intl.NumberFormat configurations keyed by locale and currency. Values and rendered strings are not cached. Existing bigint whole/fraction calculations remain unchanged, including negative subunits and the maximum exact database amount.

Instrumentation-only cleanup removes at most 256 matching rows per transaction, reports each table/count/duration, verifies exact fixture counts and foreign keys, and retains the baseline user-row count assertion. Neither the 30-second database operation timeout nor the 360-second instrumentation timeout increases. Only synthetic account/batch records are targeted. A later cleanup failure retains its exact phase and any original measurement error. This is test fixture removal, not an alternate product import/delete path.

Startup readiness tolerates a transient UI Automator process failure within the original 30-second readiness budget. Each attempt removes prior XML, requires successful dump exit and complete XML, and verifies the setup page. Raw cold launches are never retried. Available three-sample timings are evaluated even when the final readiness probe fails; both readiness and timing failure remain gate failures.

Source tests cover history/current category equivalence, one document read per refresh, invalid source refusal, exact formatting and bounded configuration eviction. Host tests cover transient/persistent dumper errors, partial XML, no resampling and preservation of the above-limit median alongside readiness failure. These do not establish native performance acceptance.
