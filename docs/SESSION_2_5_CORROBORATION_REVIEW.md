# Session 2.5 corroboration regression review

Session 2.5 remains in progress. This is focused source evidence, not native or visual gate acceptance.

A separate review reproduced a bug in the in-progress reconciliation code: pending export (-100 on 13 March), settled export (-72 on 15 March), then a corroborating PDF (-72 on 14 March) produced two ledger rows. PDF/export corroboration occurred after supersession candidate selection, making one settlement appear to be two candidates and restoring the pending row.

The repair consolidates corroborating source groups before matching pending to settled rows. Matching requires a unique reciprocal logical candidate and preserves the pending root ID. No UI files were edited by this review.

Added `tests/session25-corroboration.test.ts`: real SQLite commit, all six import orders, original pending ID, settled amount, three provenance sources, and PDF rollback. The PDF fixture uses Tier A with a reconciling closing balance.

Verification on the isolated source snapshot: 37 tests passed across the existing ingestion suite, Session 2.5 suite, and the two new regressions. The frozen Session 2 baseline hash check passed. ESLint passed for the reconciliation file and new test. The focused repair was applied to the active checkout only after confirming that the target file had not changed since the snapshot.

The original continuation is concurrently implementing UI/reminders in the active checkout. This review does not claim the full current checkout compiles, that native tests pass, or that Session 2.5 is complete. Session 3 remains closed.

## Real-file mixed-source gate

Added `scripts/generate-mixed-source-fixtures.py`, the clearly synthetic March PDF and three weekly CSV files in `fixtures/mixed-source/`, and `tests/session25-real-source-orders.test.ts`. The PDF was rendered and visually inspected for clear labels, readable transaction columns, and matching opening/closing balances.

The new test passes all 24 sequential import orders through `FileSource.fetch()`, review, and real SQLite commit. It checks Tier A for the PDF, Tier C for the exports, nine final transactions totalling -4500 minor units, CSV description preference, two sources per transaction, and identical transaction, provenance and coverage tables. Parser output and commit assertions are unmocked; only the pdf.js worker path is configured for Node.

A full check during this continuation passed 89 source tests, lint, TypeScript, production build and schema generation before the additional UI test work landed. The new actual-file test passed separately. Concurrent changes continue, so these results do not close the full Session 2.5 gate or validate a new APK.
