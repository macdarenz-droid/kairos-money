# Session 2 gate — PASS

Session 1 is PASS. Session 2 is verified on Android 34 AOSP. Session 2.5 may now begin; do not begin Session 3. The accepted next revision is `SESSION_2_5.md`, including its latest design constraints.

## Required acceptance evidence

| Criterion | Status | Evidence / remaining work |
|---|---|---|
| All six orders of three overlapping statements give identical canonical state | PASS | `tests/ingest.test.ts`: 15 randomized amounts × six orders, real SQLite, sorted transactions/provenance/coverage equal byte-for-byte. |
| Fourteen-day overlap leaves zero duplicates | PASS | The overlapping 21-day ranges in the order property produce exactly 35 transactions for 35 unique days. |
| Identical file twice adds nothing and says so | PASS | Source service test asserts alreadyImported and zero additions; review UI explicitly says the file is already imported. |
| Every committed batch reconciles or is quarantined | PASS | Exact bigint opening/sum/closing check; mismatching batch status quarantined; commit rejects it. Payslip gross-tax-deductions=net, with allowances included in gross. |
| Transfers appear in neither income nor spending | PASS | Unique reciprocal transfer fixture, same currency/amount within three days; dedicated totals exclusion assertion. Ambiguous or unlabelled same-amount pairs are not guessed as transfers. |
| Rollback batch two preserves batches one and three | PASS | Actual SQLite transactions, sources, coverage, merchants and categories equal the independently imported surviving documents. |
| Missing week is explicit and excluded from averages | PASS | Gap/coverage/average tests; coverage UI spells out missing date ranges and shows a patterned gap. Native coverage screenshots reviewed in both themes. |
| Failures name what could not be read and provide an action | PASS | Native quarantine, stated-balance correction, row correction and successful import/rollback verified in both themes; 14 import screenshots reviewed. |

## Build and regression coverage

- CSV, positional PDF, OFX, QIF, XLSX and on-device bundled ML Kit extraction implemented. Files are encrypted in staging before parsing; no live ledger write occurs before confirmation.
- Nine bank CSV fixtures and twelve actual text PDFs cover checking, savings, credit and payslips in three layouts. Three bank PDFs have mid-table page breaks. Four PNG/image-only PDF pairs exercise OCR eligibility; actual model execution is a native gate.
- Column mapping, staged row and payslip corrections, deferred merchant rules, mandatory review, rollback, coverage and data health UI implemented. No assisted parsing or bank networking.
- Source tests include the original Session 1 suite and Session 2 golden/property/repository/UI paths. Latest counts are recorded in CI, not inferred from an earlier checkpoint.
- Android app and instrumentation compile and lint locally, including the bundled OCR bridge. The fresh-emulator import flow, all four OCR scans and reviewed dark/light screenshots must still pass on the published source.

## Remaining exact work

First published native run `34749487000` on `4c1224ae3044f9d4441380ce2c0a4567e7882795`: 73 source tests passed; APK build, signature, Android lint and both foundation instrumentation tests passed. Both new import tests failed: the scan marker was not recognized and the picker test assumed its file appeared in Recent. Export/resume/deletion checks were not reached. This run is not a passing Session 2 gate.

The repair candidate embeds the fixture font (the previous renderer visibly substituted incorrect glyph spacing), navigates the real picker to Downloads, retains OCR text and picker diagnostics, and exercises review/quarantine/correction/coverage/rollback in both themes. It also rejects balance checks that counted collapsed duplicates twice and validates every affected statement before committing duplicate corrections. The source suite now has 74 tests.

Run the published CI gate; fix any failing source or native check; inspect all new native screenshots in both themes. Record exact tested commit, test counts, APK signature/hash and artifact links. Freeze Session 2 acceptance tests only once PASS, then begin Session 2.5.

Second native run `34750163344` on `9fdfaf83bae1ec1df6f19cbdd2930647bfd3d282`: 74 source tests passed and all four bundled OCR recognition checks passed. File selection still failed; its screenshot and hierarchy proved that the file was present but the test helper did not activate Android's grid item. The next candidate uses a real tap at the accessibility-located label. Feeding the captured OCR coordinates into production parsing also exposed vertical-column jitter and text-order issues, now covered by three additional layout regressions and a native-output parser verifier. Session 2 remains OPEN.

Run `34750695931` on `41a4c715b785e8eb4c951bb8a22340afae49b440`: 77 source tests, Android build/lint/signature, foundation and all four OCR recognition checks passed. Captured OCR output separately passes `verify-native-ocr.ts` for exact bank amounts/dates and payslip values. The picker tap now selects the document, but the multi-file picker remains foreground until its Open action is confirmed. The test now confirms Open and explicitly asserts return to Kairos, retaining a hierarchy and screenshot on failure. Native import, subsequent export/delete regression, and visual review remain OPEN.

Run `34751227338` on `e62d7c24caaf42d9aa5c72de659827192ba176cd` remains FAIL at picker return. Its retained screenshot shows the file was not selected, correcting the prior interpretation that only Open confirmation was missing. The helper now waits for idle, activates the clickable ancestor of the named row, retries after discarded transition input, and retains clickable/resource identifiers in failure diagnostics. No production or expected acceptance behavior changes.

Run `34751641982` on `04146640136f0486d391d84b98faa2dee495c81b`: the picker now returns and the CSV reaches encrypted staging. Import details then fail with “Choose the account this statement belongs to.” Account data can reload after the review component mounts; its initial empty account ID did not match the visibly selected first option. File review now derives the same default account for display and submission, with a delayed-account regression test. No ledger writes occur before review confirmation. Native completion remains OPEN.

## Final passing evidence

- Tested commit: `282460630e9ae5419f7224b8cf8e63d174334e40`. [Workflow 34752125659](https://github.com/macdarenz-droid/kairos-money/actions/runs/34752125659).
- 78 source tests, including 10,000 randomized money sequences; lint, TypeScript, production build and generated schema/token checks PASS.
- Six native tests PASS: two foundation, two import/OCR, one export/resume, one post-delete. Offline OCR output parsed to exact amounts/dates and payslip totals for all four scans.
- Real Android picker → encrypted staging → quarantine → balance/row correction → commit → coverage → rollback PASS in light and dark.
- All 27 screenshots reviewed: 14 import screens and 13 foundation/lock screens. Correct screen/theme, readable controls, no covering system dialogs.
- Native encryption, PIN rejection, timed background lock, real document export, deletion and fresh setup PASS.
- APK SHA-256: `f3eff12e4756800b753ed6f7eb8678d400df30b7837afd6418f42fcb1d114506`. Signature verification passed in CI.
- Evidence artifact 10316382125 SHA-256: `ec6ee3a9747845bc5aaba3d605a7dea521ab1edd26455f7124c93e653c35451c`. APK archive artifact 10316771071 SHA-256: `fe532e663eee89b570cdbf5f5e9ffb8088dc16822e95d59a7d6a36d596d74c89`. Downloaded hashes match GitHub.
- Earlier OPEN/FAIL entries above are historical attempts, superseded by this final result. Baseline acceptance files are frozen in `SESSION_2_BASELINE.json`.
