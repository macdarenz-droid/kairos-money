# Session 4 gate — OPEN

Prerequisite: Session 3 consolidated gate PASS, run 34783225808. This is one integrated private-v1 milestone, not a sequence of component releases.

| Workstream | State | Required acceptance |
|---|---|---|
| Fingerprint and custom charts | IN PROGRESS | Monthly comparison; labelled source axes; unknown/provisional states; gaps distinct from stale edges; dark/light review. Pure geometry inputs and cashflow data have three passing tests; UI remains open. |
| Product completion | OPEN | Four-step maximum real-import onboarding; cash/receipts/merchant/annualiser/monthly changes; bulk categorisation/splits/notes; recurrence cancellation, bills, net worth, refunds, stored FX, widget and Quick actions audited against original brief. |
| Local notifications | OPEN | Individually opt-in, capped, derived from real data. Bank-notification reading remains deferred. |
| Accessibility | OPEN | Per-screen AA, 200% text, source-linked amount labels, 44px targets, reduced motion; recovery code groups visible together. |
| Performance | OPEN | Measured cold start <2s, 20k virtualized ledger, worker-based 40-page PDF with progress. |
| Hardening | OPEN | Corruption, low storage, interrupted-import recovery, lock edge cases; retained S1 backup proof/regressions. |
| Full E2E | OPEN | Fresh install, onboarding, three overlapping statements plus payslips with >=60-day coverage, correct totals/transfers, archetype/insights/forecast, both themes. |
| Private release | OPEN | Continuous signing identity, version/changelog, README, schema/ADRs, final tested APK and handoff. |

Do not mark the session complete from isolated source tests. Frozen earlier acceptance assertions remain binding. No feature omissions are silently deferred.

## CommBank import and loading repair

- PASS private local: supplied PDF extracted with production pdf.js item coordinates; dedicated parser reads every transaction with exact running-balance chain and closing balance. Production document/staging/review/commit/repeat-import/rollback exercised privately.
- PASS targeted source: fourteen targeted tests across CommBank parser/both-theme history flow, progress accessibility, and unchanged Westpac parser/both-theme import path. Synthetic cases cover year rollover, repeated page headings, wrapped amounts, split CR, missing amounts and automatic details.
- Loading uses real extraction messages, no fabricated percentage; ledger icon uses existing tokens, response-only pulsing and static reduced-motion state. No raw private input added to the repository.
- Native visual review remains OPEN for this new indicator. This source repair does not close the Session 4 release gate.

Local regression: full existing suite 167/167 PASS, plus the two newly added CommBank theme/history tests PASS separately (169 total passing tests). Source lint and production build PASS. Workflow 34785441843 source and Android jobs PASS. The new loading indicator still requires actual native visual review.

## Manual everyday tracking

- Implemented: Add transaction on Today, Quick and Ledger; expense/income/atomic same-currency transfers; edit/delete; recorded-today totals; explicit matching against settled statement entries within three days and exact amount.
- PASS source: nine storage tests and two theme interaction tests. Includes encrypted backup round trip, source rollback/reimport, surviving corroboration, refusal to attach two manual purchases to one imported transaction, and invalid-amount preservation.
- Integrity: manual records create no coverage. Source envelopes and confirmed matches are exported/backed up; imports are never modified by deleting a manual entry. Unresolved matches are disclosed and block verified safe-to-spend.
- OPEN native/visual: new Android save/edit/match/delete interaction test with dark/light captures. Existing Android acceptance assertions remain in the run. UI screenshots are not accepted from DOM tests alone.
- Remaining product/accessibility/performance/release work above is unchanged. This is not a component release.

Local regression for the manual-entry candidate: 180 tests across 32 files PASS, including all unchanged prior-session tests. Source lint, strict TypeScript and production build PASS. The bundle-size warning remains part of the open performance workstream. Android compilation/lint and native captures are delegated to the authorized CI gate; they are not claimed from local source results.
