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

Local regression: full existing suite 167/167 PASS, plus the two newly added CommBank theme/history tests PASS separately (169 total passing tests). Source lint PASS. Production build result is recorded in the continuation checkpoint. Android CI verification remains required.
