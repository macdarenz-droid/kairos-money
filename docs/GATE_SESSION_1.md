# Session 1 gate — PASS

Verified 2026-09-13 on Android 34 AOSP in airplane mode. Tested source: `3b9e8f941193b99069ad2edfa0f726bcfb9f13cb`.

[Successful source and Android workflow](https://github.com/macdarenz-droid/kairos-money/actions/runs/34747556681). [Machine-readable evidence and screenshot hashes](evidence/session-1-final.json).

## Acceptance criteria

| Criterion | Status | Evidence |
|---|---|---|
| APK installs and launches | PASS | Actual installation, native app flow and fresh setup after deletion pass. Signed debug APK artifact 10314384347. |
| Both themes switch instantly without wrong-theme flash | PASS | Pre-render web/native theme application, theme state assertions, persisted recreation and launch/resume lock checks. All 13 native screenshots reviewed; correct frames and themes, no obscuring dialogs. This is emulator evidence, not a frame-by-frame timing claim across all hardware. |
| Every primitive rendered in both themes at `/dev/kitchen-sink` | PASS | Development-only route and `tests/ui.test.tsx` cover Surface, Row, Amount, Label, Button, Input, Sheet, Tabs, Toast, EmptyState and Skeleton in both themes, including sheet interaction. |
| AA contrast verified and reported | PASS | `CONTRAST.md`: body minimum 4.79:1, control boundary minimum 3.21:1. Accessible text variants replace failing raw palette text colours. |
| Populated migrations forward and rollback | PASS | All 16 tables populated; 1→2→1→2 preserves rows, baseline rollback and re-creation pass; native database integration passes. |
| Money property tests | PASS | 10,000 randomized operation sequences; exact arithmetic, allocation conservation and bridge roundtrips. Monetary float ESLint rejection checked. |
| Encrypted DB proved unreadable raw | PASS | Native SQLCipher rejects plain SQLite and wrong key; actual app database has neither plaintext SQLite header nor synthetic account sentinel while app reads exact 12345 minor units. |
| Delete all data leaves zero rows and files | PASS | Real Settings confirmation invokes OS deletion: 65 app-owned files before, zero after, no database, zero rows. Fresh PIN setup then passes. User-saved external exports and installed APK are outside app-data deletion. |

## Build requirements

| Requirement | Status | Evidence |
|---|---|---|
| Capacitor 6, React 18, strict TypeScript, Vite, Android and signed debug CI | PASS | Pinned dependencies; source job and Android build/signature job succeed in linked run. APK has no internet permission. |
| SQLCipher, Drizzle, file migrations and synthetic dev fixtures | PASS | Sixteen tables, two migrations, schema parity and native tests. Fixtures are development-only. |
| Exact currency-aware Money type and lint rule | PASS | Source suite and 10,000 randomized sequences. |
| Design plan, tokens, persistent themes and primitives | PASS | DESIGN_PLAN.md precedes UI; CONTRAST.md; source tests and reviewed native screenshots. |
| Four empty-state tabs and Quick | PASS | Today, Ledger, Insights, You and Quick screenshots show actionable available paths without fabricated transactions or analysis. |
| Launch/resume PIN and optional biometrics | PASS | Wrong PIN rejected; launch/recreation locked; 1-second background retains unlock, 61 seconds locks. Unavailable biometrics explained. Enrolled physical biometric compatibility is N/A on this emulator. |
| Working export and delete | PASS | Android document picker saves real ZIP: JSON plus all 16 CSV tables and exact synthetic account amount. Deletion and fresh setup pass. |
| Self-review, HANDOFF, ADRs and current schema | PASS | SELF_REVIEW_SESSION_1.md, HANDOFF.md, ADR/ and SCHEMA.md. No import or intelligence stubs shipped. |

## Test report and limits

19 source tests, 10,000 randomized money sequences, and four native tests pass. Native durations: foundation 34.467s (two tests), acceptance 102.607s, post-delete 6.658s. Separate OS deletion verifier passes. All 13 screenshots are committed under `evidence/android-screens/`; their manual review is recorded separately from the unmodified CI status file's review-required marker.

Historical evidence files describe earlier failures; `session-1-final.json` and the linked final run supersede those checkpoints. Physical biometric enrollment, iOS native support, release signing and Session 4 performance/accessibility expansion are not claimed. Session 2 may now begin.
