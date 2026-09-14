# Changelog

## 1.0.0-rc.1 — Integrated private-v1 candidate

- Added local CSV, OFX, QIF, XLSX and PDF statement ingestion with mandatory review, reconciliation tiers, overlap handling, rollback and visible source evidence.
- Added encrypted manual expenses, income and transfers; statement matching; bulk categories; exact category splits; notes and receipt attachments; confirmed refunds; and original-currency evidence.
- Added coverage-aware cashflow, merchant and category views, recurring-payment timelines, bills, payday analysis, forecasts, goals, scenarios and explicit imported-account ownership in net worth.
- Added opt-in local money notices, recovery-code acknowledgement, encrypted backup/reset/restore, corruption checks and transactional low-storage rollback evidence.
- Added direct receipt camera review, Android quick-add widget, long-import interruption checks, 20,000-row windowing, 200% text checks and cold-start measurement to the combined native gate.
- Prepared fail-closed private release signing. Release builds require an explicit keystore path, store password, key alias and key password; there is no debug-key or unsigned fallback.

This is a release candidate. Session 4 remains open until the complete Android gate, screenshot review, signing verification and final private APK evidence pass.

## 0.1.0 — Session 1 foundation (gate pending native evidence)

- Added React 18, strict TypeScript, Vite, Capacitor 6 and Android project configuration.
- Added bigint money operations, property tests and an ESLint guard against numeric money arithmetic.
- Added SQLCipher storage boundary, 16 data tables, source provenance, staging and reversible migrations.
- Added local account setup, complete JSON/CSV export and Android application-data deletion.
- Added native PIN/biometric vault and background locking.
- Added dark/light tokens, AA-qualified text aliases, core primitives, four screens and Quick actions.
- Added development-only kitchen sink, synthetic fixtures and Android CI gate.

### Session 1 verification completed — 2026-09-13

Native launch, encryption, PIN/resume lock, document-picker export, OS deletion and fresh setup pass. All 13 theme screenshots reviewed. Source suite remains 19 tests plus 10,000 randomized money sequences. Final tested build: 3b9e8f94.

## 0.2.0 — Import engine (verification in progress)

Adds encrypted multi-file staging, local CSV/OFX/QIF/XLSX/PDF and bundled OCR extraction, mandatory review, exact balance quarantine, deterministic overlap reconciliation, batch rollback, coverage/data health, merchant rules and payslip linkage. Adds actual file and native import tests. Records the mandatory export-first Session 2.5 revision before intelligence; its features are not yet implemented.
