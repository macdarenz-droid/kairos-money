# Kairos Money Tracker — Session 1 handoff

## State

**Session 1 PASS. Session 2 has not started.** The final gate is `docs/GATE_SESSION_1.md`.

Private repository: `macdarenz-droid/kairos-money`. Tested source commit `3b9e8f941193b99069ad2edfa0f726bcfb9f13cb`; final evidence/documentation commit does not change application code.

## Built and verified

Capacitor 6 / React 18 / strict TypeScript / Vite Android foundation; encrypted SQLCipher ledger with Drizzle and two reversible migrations across 16 tables; exact bigint money; separately designed dark/light tokens and primitives; Today, Ledger, Insights, You and Quick; account setup; native PIN/optional biometric lock; 60-second background policy; actual document-picker JSON/CSV export and OS deletion. No production synthetic fixtures, import or intelligence stand-ins.

19 source tests and 10,000 random money sequences pass. Four native tests pass; deletion verifies 65 files to zero and fresh setup. All 13 native screenshots reviewed successfully. Full evidence: `docs/evidence/session-1-final.json` and [successful CI run](https://github.com/macdarenz-droid/kairos-money/actions/runs/34747556681).

The installable v0.1.0 debug APK is artifact 10314384347 in that run. SHA-256: `4dbb90ec4a16c2ff679395dba960b33f61fdb6bf8e611818a39886d5df97b060` (18,473,169 bytes). This is development signing, not release signing. Native validation uses Android 34 AOSP in airplane mode; enrolled physical biometrics and all-device compatibility are not claimed.

## Exact next steps — Session 2

1. Read the full import brief, SCHEMA.md and ADRs. Preserve staging-only writes before explicit confirmation and many-to-many transaction provenance.
2. Build pure pipeline contracts and synthetic golden fixtures before parser UI: detect, extract, parse, normalize, stage, reconcile, review, commit. Include three layouts per account/payslip class, a scan and a page break.
3. Prove six-order canonical ledger equality, overlapping duplicate handling, identical-file idempotence, balance quarantine, transfer exclusion and rollback preserving other batches.
4. Connect mandatory review/correction/rule creation, coverage gaps and data health only after the core passes; add payslip extraction, pay-cycle detection and net-pay linking.
5. Run the complete Session 2 acceptance gate and update handoff/schema/ADRs with an installable APK. Do not begin Session 3 before it passes.

## Deferred by the brief

All imports, OCR, dedupe/coverage reconciliation, rules, payslip matching, behavioural signals, archetypes, forecasts, goals UI, fingerprint/charts, notification/cash/receipt features, release signing and encrypted backup/restore. No fake stand-ins are active. iOS needs the native vault implementation before it can run; browser preview intentionally cannot store financial data.

## Risks the next sessions must settle

- Preserve many-to-many source provenance when deduplicating or rolling back overlaps. A single import_batch_id cannot support safe rollback.
- Identical same-day same-amount same-description purchases can collide under the proposed fingerprint; resolve occurrence identity with golden tests before claiming lossless import.
- Define byte-identical **canonical ledger snapshots** for the six import orders. Physical encrypted SQLite file bytes and real import-event timestamps are not order-independent.
- Do not infer impulse intent, time-of-day, instrument, location, awareness or enjoyment when statements lack the inputs. Return insufficient_data. Research mechanisms do not validate the app's invented archetype thresholds or causal dollar promises.
- Account coverage is not the sum of overlapping days across accounts. The profile gate requires genuine covered history, including in the Session 4 E2E fixture.
- Debug certificates are development credentials; switching signing identity can require reinstall. Preserve a stable development certificate before relying on upgrades with real data. Release signing remains separate.
