# Session 4 gate — OPEN

Current complete source regression: **211 tests across 46 files PASS**, preserving frozen acceptance tests. Lint, strict TypeScript, production build and regenerated schema PASS. Added bulk category changes with atomic selection validation, unmodified amounts/source provenance, rollback/reimport replay and backup coverage; clearing categories correctly remains null. Added the four-step first-import guide and real read-file navigation. Native/theme acceptance of these additions remains OPEN; bulk selection is added to the combined capture test. This does not close the outstanding Session 4 workstreams below or create another release.

Further integrated work: payday curve uses only covered observations after at least three recorded pay dates; recurring timeline shows actual settled source payments; recorded net worth supports dated asset/liability values with export/backup/restore and removal. The net-worth chart uses actual dates and step changes, carries source dates visibly, and does not auto-add imported balances. The existing native monthly test now exercises valuation save/remove and captures these charts in both themes; it has not run for this checkpoint. Full release scope remains open.

Latest complete source regression: **206 tests in 44 files PASS** in one run with one worker, including unchanged earlier-session tests. The original import-order property passed in 29.443 seconds within its unchanged 60-second limit. Source lint, strict TypeScript, production build, regenerated schema and diff checks PASS. Local 20k reconciliation 1895 ms and SQLite/provenance snapshot 574 ms; these are not Android performance results. Native and visual acceptance remain OPEN. Recorded net worth is currently manual; integration with verified imported account balances needs explicit holding ownership to prevent double counting before claiming a complete net-worth picture.

Continuation in the same integration: opt-in imported-data notification preferences and native generic-message queue are connected; category treemap geometry and cashflow gap/stale shading are written. No additional full Android gate or component release was launched. Native notification delivery/cancellation/permission handling and actual dark/light chart review remain OPEN. The existing remaining scope below is still binding.

Latest source evidence: 197/198 tests passed in the full run; the unchanged 60-second import-order property timed out under parallel load. All 26 tests in that file passed in isolation (property 32.728 seconds), without changing assertions, seed, run count or timeout. Two additional notification preference theme tests passed, bringing the verified total to 200 distinct tests across combined runs. Fixed a notification boundary rejection and duplicate plugin registration found during integration. Production build and lint passed before the final registration-only correction; final focused checks are recorded in WORKER_STATE. No Android evidence is implied by these source results.

Prerequisite: Session 3 consolidated gate PASS, run 34783225808. This is one integrated private-v1 milestone, not a sequence of component releases.

Current integrated work (not a release): run 34788034278 failed in manual entry after accounts were treated as absent during loading. The application now retains the Add transaction intent until account loading resolves; a source regression reproduces delayed accounts. Native input helpers also wait for the actual input before typing. Existing native assertions are retained. The next full candidate must include the consolidated remaining session work rather than rerunning this repair alone.

Validation of this integration checkpoint: 192 tests in the full source run PASS, plus the subsequently added worker-failure rollback test PASS (193 total). Strict TypeScript, source lint and production build PASS before the final test-only addition. The latest test is included in final lint/type checking. Android compilation and the expanded native/visual assertions have not run for this checkpoint. No new full CI run is requested for this incomplete milestone.

Implemented together since that candidate: monthly fingerprint/comparison with unknown/provisional axes; cashflow and category visuals; merchant history, recurring annual costs, upcoming bills and coverage-qualified monthly changes; receipt-file attachment/OCR and transaction notes; complete recovery-code group display; lazy PDF loading; variable-height ledger windowing; indexed reconciliation/provenance; dedicated large-reconciliation worker with rollback on failure. These features still need actual native/theme acceptance.

Remaining scope is not waived: finish cashflow gap/stale visual distinction, labelled category treemap and payday/subscription/net-worth charts; direct receipt capture, bulk categories/splits/refunds/FX/net-worth/widget ownership; complete onboarding; opt-in local notifications (not bank-notification listening); device performance/40-page import and interruption proof; screen-by-screen accessibility; corruption/low-storage checks; signed private release and full E2E. Local checks cannot mark these PASS.

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
