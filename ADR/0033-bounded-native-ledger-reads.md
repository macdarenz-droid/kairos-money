# 0033 — Bounded native ledger reads and isolated performance fixtures

Status: accepted for the integrated Session 4 repair; device verification pending.

Run 34843754745 passed native notification policy and previous journeys, then failed in large-ledger cleanup. Cleanup replaced the primary exception. The Android log shows repeated blocking GC near the 192 MB Java heap ceiling; the test retained both parsed 20,000-row fixture representations while the app read the same records. This identifies avoidable retained memory, but does not establish the missing primary assertion or a single exclusive cause.

Parse and seed the synthetic fixture in a method returning only its batch ID, so its JSON objects are eligible for collection before measuring the real app. Do not request GC, enlarge the device heap, reduce the fixture, or relax assertions. Record native phase/heap checkpoints; preserve a primary throwable and attach cleanup errors as suppressed exceptions.

Read large transaction, provenance and ledger-label result sets through the existing driver in 256-row pages. The app's existing session serialization and analysis transaction remain the consistency boundary. Preserve all values and rows, and reject the complete read if any later page fails. Use stable SQL ordering. Transactions read through their primary-key index and stable-sort dates once, retaining SQLite's ID order for ties; repeatedly sorting all joined rows for each page was measurably slower.

This preserves the schema, persisted source payloads, amounts, snapshot date/ID order and application features. It bounds rows per bridge response, not the bytes of a single large text field. JavaScript still holds the full analytical snapshot and import document. Actual Android memory, load and scroll measurements remain required; local Node timings are diagnostic only.

Alternatives: increasing timeouts or heap does not remove unnecessary copies; reducing data or skipping cleanup weakens acceptance; unbounded responses retain a large serialization peak. A byte-streaming native store or on-demand analytics would change more of the established storage contract and is not justified by the masked failure alone.

Validation: complete 274-test source regression, including real SQLite paged-read order/value/Unicode/boundary/failure cases and a guarded production snapshot retaining every transaction and source; existing 20,000-row benchmark and frozen import-order contracts; lint, type/build/schema/signing and 11 runner tests. The modified native test passes syntax parsing; native compilation and execution remain for CI.
