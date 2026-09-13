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
