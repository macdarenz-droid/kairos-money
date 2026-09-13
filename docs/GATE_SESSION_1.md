# Session 1 gate — OPEN, not approved for Session 2

Status date: 2026-09-13 UTC. PASS requires all Session 1 acceptance criteria to be demonstrated. A FAIL below includes a blocked/unverified required check; it does not imply a fabricated test result.

## Acceptance criteria

| Criterion from the brief | Status | Evidence and remaining check |
|---|---|---|
| APK installs and launches | PASS | Run 34746295447 installs and launches the real APK, completes the app flow and returns to fresh setup after OS deletion. |
| Both themes switch instantly with no wrong-theme flash | FAIL | Theme state, native launch/recreation/resume checks pass. Most screenshots are visually correct, but light-insights.png and today-initial.png show prior frames. Capture timing is being repaired before accepting the full visual evidence; see ci-functional-pass-visual-pending.json. |
| Every primitive rendered in both themes at `/dev/kitchen-sink` | PASS | Development-only route renders Surface, Row, Amount, Label, Button, Input, Sheet, Tabs, Toast, EmptyState and Skeleton. `tests/ui.test.tsx` renders both themes and opens/closes the sheet. Native/browser visual inspection is still recorded separately as pending. |
| AA contrast verified and reported | PASS | `docs/CONTRAST.md`, generated from palette values. Body text minimum 4.79:1 across both themes/all surfaces; control-boundary minimum 3.21:1. Raw failing tertiary colours are unused for readable text. |
| Migrations run forward and roll back on a populated DB | PASS | `tests/database.test.ts`: all 16 data tables populated; 1→2→1→2 preserves every row, constraints and references enforced; explicit baseline rollback removes tables; forward re-creation works. Native SQLite dialect/integration remains part of the device gate. |
| Money property tests pass | PASS | 10,000 fixed-seed randomized operation sequences; conservation, inverse operations and exact bridge roundtrips, plus currency/boundary/formatting tests. No float money arithmetic; ESLint rejects the unsafe numeric fixture. |
| Database is encrypted, demonstrated by raw unreadable file | PASS | Run 34745565390: native foundation tests pass. SQLCipher fixture rejects wrong key and plain SQLite; real app DB lacks a SQLite plaintext header and the synthetic account sentinel while the app reads the exact account amount. See ci-system-ui-overlay.json; visual and export checks remain separate. |
| Delete all data leaves zero rows and zero files | PASS | Run 34746295447: real Settings confirmation invokes clearApplicationUserData. External verifier reports 61 app-owned files before, zero after, no DB and zero rows; fresh setup test then passes. See android-delete.json. |

## Build requirements and scope

| Requirement | Status | Evidence |
|---|---|---|
| React 18 / strict TypeScript / Vite / Capacitor 6 and Android | PASS | Pinned package-lock, strict TS build, generated Android project and successful Capacitor sync. |
| New GitHub repository and signed debug artifact on push | PASS | Private repository source published. Run 34746295447 passes source/build/signature/native checks and publishes the signed debug APK artifact for 489d916b. |
| Debug app and instrumentation build | PASS | Gradle app assembleDebug, assembleDebugAndroidTest and lintDebug succeed. APK signature verifies; 13 packaged web assets match the current build; no internet permission. Lint reports 0 errors and 12 warnings (resource/toolchain guidance). Reports and final build log are in docs/evidence. Device execution remains a separate gate. |
| SQLCipher/Drizzle schema and file migrations | PASS | Production encrypted adapter, all core tables plus staging/provenance/privacy/settings; schema parity tests. Device execution is a separate acceptance check above. |
| Seeded synthetic development fixtures | PASS | `npm run dev:fixtures` creates a clearly fake DB outside production entry points. Duplicate seeding refuses overwrite. |
| Design plan written before UI | PASS | `docs/DESIGN_PLAN.md`; accessible deviations documented before implementation. |
| Tokens, persistent system/default theme and primitives | PASS | `src/ui/design`, generated OKLCH, UI tests and contrast report. Native launch timing still unverified. |
| Today, Ledger, Insights, You and Quick | PASS | Four real empty states and actionable available destinations; Quick filters actions. No fake transaction search/import/intelligence implementation. |
| PIN/biometric/60-second resume lock | PASS | Native PIN launch/retry/unlock and 1-second retained/61-second locked resume tests pass. Unavailable biometrics are clearly disabled; enrolled hardware biometric authentication remains a physical-device compatibility check, not a claimed emulator result. |
| Working export/delete Settings actions | PASS | Real Android document picker saved a ZIP with JSON and all 16 CSV tables, including the exact account amount. Actual OS deletion and fresh setup pass in run 34746295447. |
| Self-review and no shipped synthetic paths | PASS | Kitchen sink conditional is compiled out of normal production; fixture imports occur only in tests/scripts. Typed lint forbids explicit any and monetary Number conversion outside the checked bridge. See docs/SELF_REVIEW_SESSION_1.md for fixes and review limits. No unfinished implementation stubs in shipped paths. |
| HANDOFF, ADRs, schema, gate report | PASS | Present in repository. This is a continuation checkpoint, not a Session 1 completion claim. |

## Verification boundaries

Native functional evidence is PASS on Android 34 AOSP in airplane mode. Both source and Android CI jobs pass. Physical biometric enrollment and broad device compatibility are not claimed. The remaining required work is native visual acceptance: review corrected screenshots after fixing capture of two preceding frames. Session 2 remains closed until that review passes.
