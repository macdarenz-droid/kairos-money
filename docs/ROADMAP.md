# Gated roadmap

The user-supplied four-session brief governs this project. Do not advance until the previous session gate is PASS. Every session ends with runnable/installable artifacts, HANDOFF.md, ADRs, regenerated schema and a criterion-by-criterion gate report. No shipped synthetic data, guesses, placeholder implementations or unresolved failing tests.

## Delivery model — revised at the user’s request

The four sessions are delivery milestones, not a requirement to stop after each implementation component. Session 2.5 is the accepted intervening revision. Patch S1 is an urgent dependency brought into the current milestone, not a new series of user-facing sessions. Addendum A stays after shipped v1. This delivery model supersedes the recent per-component push/handoff pattern.

| Milestone | Current state | Completion boundary |
|---|---|---|
| Session 1 — foundation | PASS | Preserve its accepted implementation and acceptance assertions. |
| Session 2 — ingestion | PASS | Preserve PDF/OCR, staging, reconciliation, rollback and payslips. |
| Session 2.5 — export-first revision | PASS | Preserve adapters, bank inference, tiers, pending supersession and freshness. |
| Current milestone — S1 completion and Session 3 closure | PASS — run 34783225808 | Complete all remaining security requirements, prove actual device recovery/backup/restore, reconcile the Session 3 criteria and review its required theme evidence; deliver one accepted APK and complete reports. |
| Session 4 — finished private v1 | IN PROGRESS | Complete visual, product, accessibility, performance and hardening work; deliver the signed private release and final gate. |
| Addendum A — notification capture | DEFERRED until v1 shipped | Separate post-v1 milestone with replay/deduplication acceptance. |

### Current milestone: finish S1 and close Session 3

Already implemented: offline PIN-replacement flow, typed reset, persistent backoff, backup-only recovery code, encrypted backup save and atomic empty-ledger restore. Local backup candidate has 136 passing source tests and passing app/test builds and lint. Candidate `a5a87a9` is in workflow 34762937327; its outcome has not been checked as part of this planning change. A green workflow alone is not proof of the full new reset/restore journey.

Complete together before the next implementation delivery:

1. Authentication-bound device-key protection and safe migration of existing installations. Preserve the independently random database secret and ensure PIN replacement cannot require database re-encryption. Audit the SQLite plugin’s retained secret path as part of this requirement.
2. Mandatory setup-time recovery-code acknowledgement, unlocked code review and the dismissable backup prompt after an import session commits more than 50 transactions. The current first-backup acknowledgement does not satisfy setup-time acknowledgement.
3. Actual Android device-credential recovery followed by mandatory new PIN; force-quit backoff; explicit reset with zero remaining app data/key material; encrypted backup → reset → fresh setup → restore, preserving transactions, import batches, provenance, payslips and coverage. Wrong/missing code must fail. Test through the real system pickers, not just mocks or native store methods.
4. Verify every Session 3 criterion against the implemented engine: research mapping, twelve signals, evidence and confidence, 60-day learning threshold, Drifter path, bounded insights/dismissals, forecasts/goals/scenarios/pay rise and calm distress. Fill genuine gaps only; do not rebuild passing functionality.
5. Review all required new screens in both themes, verify the tested APK and publish the S1 and Session 3 acceptance results together. Both gates remain OPEN until their evidence supports PASS.

### Session 4: one integrated finish-and-release milestone

Internal workstreams may be implemented separately but are not separate user-facing deliveries:

- Visual completion: deterministic Money Fingerprint with month comparison and provisional states; custom charts that distinguish gaps from staleness; final theme/design review using existing primitives and the accepted replacement logo.
- Product completion: onboarding (four steps maximum), opt-in bills/unusual-transaction/subscription/monthly notifications, cash entry, receipts, merchant views, annualiser and monthly changes. Audit all brief-wide features for ownership: bulk categorisation, splits, notes/attachments, recurring cancellation workflow, bills calendar, net-worth manual assets/liabilities, refunds/chargebacks, exact stored FX, widget/quick-add and command actions. Retain implemented features; resolve omissions within this milestone instead of silently dropping them.
- Accessibility and performance: per-screen AA/200% text/screen-reader/reduced-motion/touch-target checks; measured cold start and 20k ledger performance; worker-based long-PDF import with real progress.
- Reliability and private release: corruption, low storage, interrupted import and lock edge cases; reuse and regression-test S1 backup rather than rebuild it; preserve signing-key continuity, version and changelog; complete README and the full end-to-end acceptance journey. No Play Store deliverables.

Original Session 4 acceptance criteria remain binding, including the recorded fresh-install/import/intelligence/forecast/theme journey, kill-mid-import proof, performance measurements, accessibility report and design-drift corrections. Test history must cover enough dates to justify an archetype.

### Checkpoint and evidence policy

- Complete a coherent milestone candidate locally before pushing for its delivery gate. Local implementation commits and focused tests are internal progress, not requests for another user continuation.
- Run the required full regressions, strict build and Android compilation/lint on the integrated candidate. Preserve earlier acceptance assertions. Do not regenerate already accepted fixtures or evidence unnecessarily.
- Push one complete candidate, then check CI at most once. If unfinished, stop immediately with its URL and remaining check. Never poll or wait on external work. A failed candidate is repaired within the same milestone; it does not create another roadmap phase.
- Gate-required APK, screenshot and device evidence is reviewed once at milestone closure. This is the narrowly necessary exception to the earlier blanket prohibition on fetching artifacts after a green run: otherwise the original APK/visual acceptance requirements cannot be completed. Routine green-run jobs/logs remain unnecessary; on red, fetch only the failing job log once. Do not fetch artifacts on every implementation commit.
- End-of-milestone delivery includes the tested installable APK, criterion-by-criterion PASS/FAIL/N/A report, current HANDOFF, relevant ADRs and schema update only if changed. Do not label a source-only or mocked-path pass as device acceptance.
- Session 4 cannot begin until the current milestone is accepted. Addendum A cannot begin until v1 is shipped. Optional email ingestion and the optional questionnaire remain disabled unless their optional scope is deliberately taken up after required gates.

## Session 1 — Foundation

Capacitor 6, React 18, strict TypeScript and Vite; Android CI; SQLCipher and Drizzle; bigint money; the prescribed dark/light design language and primitives; four tabs plus Quick; native app lock; working export/delete. Session 1 is complete and PASS.

## Session 2 — Import

Implement pure detect/extract/parse/normalize/stage/reconcile/review/commit modules. On-device positional PDF extraction with stitched multipage tables, generic CSV/XLSX column mapping, OFX/QIF and ML Kit scan OCR. Per-issuer plugins must retain generic unknown-issuer fallbacks. Synthetic golden files must cover credit/savings/transaction accounts and payslips, three layouts each, scans and a mid-table page break.

Use contextual dates, December/January rollovers, integer amount formats and explicit credit-account sign rules. Merchant aliases/fuzzy matches must surface uncertainty. Reconcile exact and near duplicates, source coverage unions/gaps, batch balances and transfers. Mandatory staging review precedes an atomic commit. Corrections create rules. Rollback must preserve other batches' provenance and corrections.

Payslips include employer, gross/net/tax/super, allowances, deductions, YTD and periods. Net pay links to a ledger credit without double-counting. Pay-cycle detection needs at least three payslips and distinguishes 4-weekly from monthly. Variable income uses a trailing distribution.

Gate: all six import orders have identical canonical ledger bytes; 14-day overlap has no duplicates; repeat files add nothing; balance mismatch quarantines the whole batch; transfers count as neither income nor spend; rollback of batch 2 preserves 1 and 3; coverage gaps are visible and excluded from averages; every failure names what was unreadable and offers a concrete action.

## Session 2.5 — Export-first revision

Mandatory after Session 2 PASS, before Session 3. See `SESSION_2_5.md` for the complete accepted revision: source adapter boundary, CommBank/Westpac export inference, integrity tiers, pending supersession and weekly freshness loop. Preserve every Session 2 acceptance test unmodified. PDF/OCR remains supported.

## Session 3 — Intelligence

Respect the Session 2.5 integrity tiers and gaps; reduce confidence and disclose predominantly Tier C inputs. Exclude pending transactions from historical signals. Write RESEARCH.md first, using primary sources for the named effects in the brief. Separate research mechanisms from unvalidated app heuristics. Signals are versioned with stored inputs and return insufficient_data when coverage or necessary fields are absent. Never invent timestamps, instrument types, planning intent or enjoyment from a statement that lacks them.

Implement the twelve specified signals (buffer, impulse, payday decay, volatility, concentration, subscription drag, fixed burden, savings consistency, friction, late-night share, small leaks and recovery lag), monthly and trailing-90 windows, four axes and six descriptive archetypes. No archetype under 60 covered days. Every insight needs signal, crossed threshold, transaction evidence, one if-then action and a derived dollar scenario. Label projections as assumptions, not causal promises. Rank impact × ease, show at most three, suppress after two dismissals.

Add distribution-aware 30/60/90-day forecasts, safe-to-spend with visible assumptions, goals/sinking funds, pay-rise detection and scenarios. Distress reduces cognitive load to calm triage and free counselling information.

Gate: insight contract/property checks; 20-day still-learning state; source drilldown within two taps; synthetic six-month Drifter path; distress UI test; every behavioural claim mapped to research and unsupported claims removed.

## Session 4 — Finish and release

Charts distinguish coverage gaps from the stale live edge; incomplete-month fingerprints are provisional. Money Fingerprint is the sole expressive visual: deterministic signal vector, monthly comparison, labelled axes. Add custom gap-aware cashflow, category treemap, payday-decay, subscription and net-worth charts. At most four onboarding steps, ending in real import. Opt-in individual notifications with frequency caps. Cash entries, receipts, merchant views, annualiser and monthly changes.

AA in both themes, 200% text, screen-reader amount labels, reduced motion and 44px targets. Cold-start target under two seconds; virtualized 20k ledger; worker-based 40-page PDF with progress. Corruption/low-storage/interrupted-import recovery; encrypted user-chosen backup/restore; lock edge cases. Secret-backed private release signing, versioning and changelog. Play Store data-safety work is removed by the later private-sideload scope.

Gate: full overlapping-statements/payslips E2E; kill-mid-import recovery without partial ledger; measured 20k performance; accessibility report by screen; visual self-review and repairs. Do not generate an archetype from only two payslips/short coverage; the E2E dataset still needs at least 60 covered days.

## Permanent constraints

Local/offline core, no login, no bank APIs, cloud sync, crypto, social or household features in v1. Assisted parsing is off by default and requires that import's redacted-text preview and explicit consent, with every call in a visible log. No analytics. Export and deletion remain available. No shame, diagnosis, manufactured urgency or punishment mechanics. Intelligence reads ledger but never writes it. Ingest writes staging until confirmation.

Keep Linear/Vercel/Height discipline: near-monochrome layers, low-contrast structural borders, one accent, compact type, tabular amounts, left text/right numbers, sentence case, response-only motion. No generic metric-card grid, decorative gradients, all-caps labels or fake chart history.
