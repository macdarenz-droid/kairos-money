# Session 1 gate — OPEN, not approved for Session 2

Status date: 2026-09-13 UTC. PASS requires all Session 1 acceptance criteria to be demonstrated. A FAIL below includes a blocked/unverified required check; it does not imply a fabricated test result.

## Acceptance criteria

| Criterion from the brief | Status | Evidence and remaining check |
|---|---|---|
| APK installs and launches | FAIL | Debug app and instrumentation APKs compile. The software Android 34 emulator timed out before boot (480 seconds, no KVM). No install/launch result is claimed; see docs/evidence/native-run-status.json. |
| Both themes switch instantly with no wrong-theme flash | FAIL | UI interaction tests verify instant theme state changes in both directions. Pre-render bootstrap, native launch colours and appearance persistence are implemented. Pixel-level native launch/resume verification remains required. |
| Every primitive rendered in both themes at `/dev/kitchen-sink` | PASS | Development-only route renders Surface, Row, Amount, Label, Button, Input, Sheet, Tabs, Toast, EmptyState and Skeleton. `tests/ui.test.tsx` renders both themes and opens/closes the sheet. Native/browser visual inspection is still recorded separately as pending. |
| AA contrast verified and reported | PASS | `docs/CONTRAST.md`, generated from palette values. Body text minimum 4.79:1 across both themes/all surfaces; control-boundary minimum 3.21:1. Raw failing tertiary colours are unused for readable text. |
| Migrations run forward and roll back on a populated DB | PASS | `tests/database.test.ts`: all 16 data tables populated; 1→2→1→2 preserves every row, constraints and references enforced; explicit baseline rollback removes tables; forward re-creation works. Native SQLite dialect/integration remains part of the device gate. |
| Money property tests pass | PASS | 10,000 fixed-seed randomized operation sequences; conservation, inverse operations and exact bridge roundtrips, plus currency/boundary/formatting tests. No float money arithmetic; ESLint rejects the unsafe numeric fixture. |
| Database is encrypted, demonstrated by raw unreadable file | FAIL | Host SQLCipher 4.12.0 proof PASS in `docs/evidence/encryption-host.json`: no SQLite header or plaintext sentinel, plain SQLite and wrong key rejected, correct key reads exact values. Actual Android SQLCipher 4.5.3/app-file proof still required. Host proof is not substituted for device evidence. |
| Delete all data leaves zero rows and zero files | FAIL | Confirmed UI intent and native erase invocation pass with a simulated boundary. Host encrypted fixture deletes fully. Production uses Android clearApplicationUserData, but real app-owned file/row counts after that action still require the separate native deletion gate. |

## Build requirements and scope

| Requirement | Status | Evidence |
|---|---|---|
| React 18 / strict TypeScript / Vite / Capacitor 6 and Android | PASS | Pinned package-lock, strict TS build, generated Android project and successful Capacitor sync. |
| New GitHub repository and signed debug artifact on push | FAIL | Workflow is written. The user-created private repository is accessible with write permission. Initial source upload 7dc9ae9 and CI source/build/signature checks passed. Both runs failed before emulator boot because the userdata space requirement exceeded available disk, including with the 2048M setting. A runner cleanup and 16 GiB disk preflight are now added. Successful native workflow/artifact publication remains required; see ci-first-run.json and ci-second-run.json. |
| Debug app and instrumentation build | PASS | Gradle app assembleDebug, assembleDebugAndroidTest and lintDebug succeed. APK signature verifies; 13 packaged web assets match the current build; no internet permission. Lint reports 0 errors and 12 warnings (resource/toolchain guidance). Reports and final build log are in docs/evidence. Device execution remains a separate gate. |
| SQLCipher/Drizzle schema and file migrations | PASS | Production encrypted adapter, all core tables plus staging/provenance/privacy/settings; schema parity tests. Device execution is a separate acceptance check above. |
| Seeded synthetic development fixtures | PASS | `npm run dev:fixtures` creates a clearly fake DB outside production entry points. Duplicate seeding refuses overwrite. |
| Design plan written before UI | PASS | `docs/DESIGN_PLAN.md`; accessible deviations documented before implementation. |
| Tokens, persistent system/default theme and primitives | PASS | `src/ui/design`, generated OKLCH, UI tests and contrast report. Native launch timing still unverified. |
| Today, Ledger, Insights, You and Quick | PASS | Four real empty states and actionable available destinations; Quick filters actions. No fake transaction search/import/intelligence implementation. |
| PIN/biometric/60-second resume lock | FAIL | Native vault, persisted cooldown, optional strong biometrics, UI masking and resume checks implemented; pure lifecycle/UI tests PASS. Real device execution remains required. |
| Working export/delete Settings actions | FAIL | Real SQLite export archive and UI flows PASS; Android document-picker write and OS deletion await device verification. |
| Self-review and no shipped synthetic paths | PASS | Kitchen sink conditional is compiled out of normal production; fixture imports occur only in tests/scripts. Typed lint forbids explicit any and monetary Number conversion outside the checked bridge. See docs/SELF_REVIEW_SESSION_1.md for fixes and review limits. No unfinished implementation stubs in shipped paths. |
| HANDOFF, ADRs, schema, gate report | PASS | Present in repository. This is a continuation checkpoint, not a Session 1 completion claim. |

## Verification boundaries

Local tests use real host SQLite for repository/migration/export behavior and a simulated Capacitor boundary for UI interactions. They do not verify Android Keystore, biometrics, file picker, OS data clearing, or native WebView rendering. Instrumentation and CI cover these remaining checks, but must run successfully before their status changes.

Required next evidence: successful install/start, native encryption instrumentation, both-theme screenshot review including launch/resume, a real document-picker export, external post-deletion file counts, and a successful workflow in the requested GitHub repository.
