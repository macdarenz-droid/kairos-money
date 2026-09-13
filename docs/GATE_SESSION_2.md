# Session 2 gate — OPEN

Session 1 is PASS. Session 2 implementation is under verification; do not begin Session 2.5 or Session 3 until this gate is PASS. The accepted next revision is `SESSION_2_5.md`, including its latest design constraints.

## Required acceptance evidence

| Criterion | Status | Evidence / remaining work |
|---|---|---|
| All six orders of three overlapping statements give identical canonical state | PASS | `tests/ingest.test.ts`: 15 randomized amounts × six orders, real SQLite, sorted transactions/provenance/coverage equal byte-for-byte. |
| Fourteen-day overlap leaves zero duplicates | PASS | The overlapping 21-day ranges in the order property produce exactly 35 transactions for 35 unique days. |
| Identical file twice adds nothing and says so | PASS | Source service test asserts alreadyImported and zero additions; review UI explicitly says the file is already imported. |
| Every committed batch reconciles or is quarantined | PASS | Exact bigint opening/sum/closing check; mismatching batch status quarantined; commit rejects it. Payslip gross-tax-deductions=net, with allowances included in gross. |
| Transfers appear in neither income nor spending | PASS | Unique reciprocal transfer fixture, same currency/amount within three days; dedicated totals exclusion assertion. Ambiguous or unlabelled same-amount pairs are not guessed as transfers. |
| Rollback batch two preserves batches one and three | PASS | Actual SQLite transactions, sources, coverage, merchants and categories equal the independently imported surviving documents. |
| Missing week is explicit and excluded from averages | PASS | Gap/coverage/average tests; coverage UI spells out missing date ranges and shows a patterned gap. Native visual review remains pending. |
| Failures name what could not be read and provide an action | OPEN | Parser, normalization, balance and review paths are tested. Complete the real Android picker/OCR/import flow and inspect failure/review screens before final acceptance. |

## Build and regression coverage

- CSV, positional PDF, OFX, QIF, XLSX and on-device bundled ML Kit extraction implemented. Files are encrypted in staging before parsing; no live ledger write occurs before confirmation.
- Nine bank CSV fixtures and twelve actual text PDFs cover checking, savings, credit and payslips in three layouts. Three bank PDFs have mid-table page breaks. Four PNG/image-only PDF pairs exercise OCR eligibility; actual model execution is a native gate.
- Column mapping, staged row and payslip corrections, deferred merchant rules, mandatory review, rollback, coverage and data health UI implemented. No assisted parsing or bank networking.
- Source tests include the original Session 1 suite and Session 2 golden/property/repository/UI paths. Latest counts are recorded in CI, not inferred from an earlier checkpoint.
- Android app and instrumentation compile and lint locally, including the bundled OCR bridge. The fresh-emulator import flow, all four OCR scans and reviewed dark/light screenshots must still pass on the published source.

## Remaining exact work

Run the published CI gate; fix any failing source or native check; inspect all new native screenshots in both themes. Record exact tested commit, test counts, APK signature/hash and artifact links. Freeze Session 2 acceptance tests only once PASS, then begin Session 2.5.
