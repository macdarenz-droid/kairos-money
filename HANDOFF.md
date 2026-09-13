Current Session 4 repair: CommBank Smart Access PDF support added after private supplied-file reproduction. Named-month dates, wrapped descriptions/final-line amounts, CR/DR suffixes, page headers and explicit period/balance metadata now parse. Private local production-registry staging/review/commit/idempotence/rollback passed; no private source or extracted payload is committed. Synthetic regression fixtures live in tests/commbank-statement.test.ts.

Import now displays a shared ledger-row animation with actual page/stage text, visible at the top of the sheet. Reduced-motion disables animation. Source UI behaviour is tested in dark/light; actual animation/device visual review remains open. Existing Westpac source/UI tests are unchanged and pass.

User priority in Session 4: Add transaction from Today and Quick for expense/income/transfer, editable/deletable manual history, with import matching to avoid double-counting. This is required before release and independent of deferred notification ingestion. Continue the integrated remaining Session 4 scope after verifying this repair.

# Kairos Money — Session 4 active

Session 3 and the consolidated S1/import repair gate are PASS: workflow 34783225808, tested candidate 50824556acbe40afea58ab1c7c70780bd3b3e6d7. See docs/GATE_SESSION_3.md for exact device and visual evidence. Tested APK is the debug artifact on that run; Session 4 has not produced a release APK yet.

Session 4 starts as one integrated completion milestone. Added pure visual-data modules for deterministic monthly fingerprint axes and exact daily cashflow, retaining unknown axes, Tier C disclosure, partial-month provisional status, pending/transfer exclusion and separate gaps/stale/future states. Three targeted tests and TypeScript compilation pass. These modules are not yet connected to screens; no new UI is claimed as complete.

Next: connect monthly fingerprint/comparison and charts to real repository data; complete product features, accessibility, worker imports, performance and hardening using docs/GATE_SESSION_4.md. Existing recovery-code fields need an all-groups-visible presentation. Preserve prior source/native regressions and schema/provenance integrity. Do not fetch the already-reviewed Session 3 artifacts again.

Manual continuation; Money worker remains disabled, V16 suspended. Bank-notification capture/Addendum A remains after private v1. No trading repositories or automations are in scope.
