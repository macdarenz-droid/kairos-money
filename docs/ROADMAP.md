# Gated roadmap

The user-supplied four-session brief governs this project. Do not advance until the previous session gate is PASS. Every session ends with runnable/installable artifacts, HANDOFF.md, ADRs, regenerated schema and a criterion-by-criterion gate report. No shipped synthetic data, guesses, placeholder implementations or unresolved failing tests.

## Session 1 — Foundation

Capacitor 6, React 18, strict TypeScript and Vite; Android CI; SQLCipher and Drizzle; bigint money; the prescribed dark/light design language and primitives; four tabs plus Quick; native app lock; working export/delete. Session 1 is complete and PASS; Session 2 is next.

## Session 2 — Import

Implement pure detect/extract/parse/normalize/stage/reconcile/review/commit modules. On-device positional PDF extraction with stitched multipage tables, generic CSV/XLSX column mapping, OFX/QIF and ML Kit scan OCR. Per-issuer plugins must retain generic unknown-issuer fallbacks. Synthetic golden files must cover credit/savings/transaction accounts and payslips, three layouts each, scans and a mid-table page break.

Use contextual dates, December/January rollovers, integer amount formats and explicit credit-account sign rules. Merchant aliases/fuzzy matches must surface uncertainty. Reconcile exact and near duplicates, source coverage unions/gaps, batch balances and transfers. Mandatory staging review precedes an atomic commit. Corrections create rules. Rollback must preserve other batches' provenance and corrections.

Payslips include employer, gross/net/tax/super, allowances, deductions, YTD and periods. Net pay links to a ledger credit without double-counting. Pay-cycle detection needs at least three payslips and distinguishes 4-weekly from monthly. Variable income uses a trailing distribution.

Gate: all six import orders have identical canonical ledger bytes; 14-day overlap has no duplicates; repeat files add nothing; balance mismatch quarantines the whole batch; transfers count as neither income nor spend; rollback of batch 2 preserves 1 and 3; coverage gaps are visible and excluded from averages; every failure names what was unreadable and offers a concrete action.

## Session 3 — Intelligence

Write RESEARCH.md first, using primary sources for the named effects in the brief. Separate research mechanisms from unvalidated app heuristics. Signals are versioned with stored inputs and return insufficient_data when coverage or necessary fields are absent. Never invent timestamps, instrument types, planning intent or enjoyment from a statement that lacks them.

Implement the twelve specified signals (buffer, impulse, payday decay, volatility, concentration, subscription drag, fixed burden, savings consistency, friction, late-night share, small leaks and recovery lag), monthly and trailing-90 windows, four axes and six descriptive archetypes. No archetype under 60 covered days. Every insight needs signal, crossed threshold, transaction evidence, one if-then action and a derived dollar scenario. Label projections as assumptions, not causal promises. Rank impact × ease, show at most three, suppress after two dismissals.

Add distribution-aware 30/60/90-day forecasts, safe-to-spend with visible assumptions, goals/sinking funds, pay-rise detection and scenarios. Distress reduces cognitive load to calm triage and free counselling information.

Gate: insight contract/property checks; 20-day still-learning state; source drilldown within two taps; synthetic six-month Drifter path; distress UI test; every behavioural claim mapped to research and unsupported claims removed.

## Session 4 — Finish and release

Money Fingerprint is the sole expressive visual: deterministic signal vector, monthly comparison, labelled axes. Add custom gap-aware cashflow, category treemap, payday-decay, subscription and net-worth charts. At most four onboarding steps, ending in real import. Opt-in individual notifications with frequency caps. Cash entries, receipts, merchant views, annualiser and monthly changes.

AA in both themes, 200% text, screen-reader amount labels, reduced motion and 44px targets. Cold-start target under two seconds; virtualized 20k ledger; worker-based 40-page PDF with progress. Corruption/low-storage/interrupted-import recovery; encrypted user-chosen backup/restore; lock edge cases. Secret-backed release signing, versioning, changelog and Play Store data-safety text.

Gate: full overlapping-statements/payslips E2E; kill-mid-import recovery without partial ledger; measured 20k performance; accessibility report by screen; visual self-review and repairs. Do not generate an archetype from only two payslips/short coverage; the E2E dataset still needs at least 60 covered days.

## Permanent constraints

Local/offline core, no login, no bank APIs, cloud sync, crypto, social or household features in v1. Assisted parsing is off by default and requires that import's redacted-text preview and explicit consent, with every call in a visible log. No analytics. Export and deletion remain available. No shame, diagnosis, manufactured urgency or punishment mechanics. Intelligence reads ledger but never writes it. Ingest writes staging until confirmation.

Keep Linear/Vercel/Height discipline: near-monochrome layers, low-contrast structural borders, one accent, compact type, tabular amounts, left text/right numbers, sentence case, response-only motion. No generic metric-card grid, decorative gradients, all-caps labels or fake chart history.
