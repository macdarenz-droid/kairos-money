# Session 3 gate — OPEN

The full brief is now supplied. Sessions 1–2.5 remain PASS. Implementation and source verification are underway; native and both-theme visual acceptance remain open. No Session 4 work.

| Criterion | State | Evidence |
|---|---|---|
| Research before code | PASS | docs/RESEARCH.md covers all 13 mechanisms; 14 claim mappings in CLAIM_AUDIT.md. App thresholds and projections explicitly unvalidated. |
| Twelve versioned signals, monthly and trailing 90 | PASS source | signal tests retain source inputs, exclude pending/transfers, respect gaps/currencies and expose Tier C uncertainty. |
| Insight five-part contract and derived dollars | PASS source | All four shipped rules tested; integer conditional projections, ranking/cap and dismissal counters. |
| 20-day learning state | PASS source; native OPEN | No archetype before 60 covered days. Native short-history screenshot assertion added. |
| Six-month Drifter and small leaks | PASS source; native OPEN | Synthetic 182-day fixture with explicit payment instruments. Native fixture seeds only the test database, never production assets. |
| Evidence within two taps | OPEN native | Number opens evidence sheet; raw source disclosure is the second tap. |
| Distress and no celebration | PASS source; native OPEN | Low buffer and explicit debt/fees; max one triage insight, free counselling, forecasts/optimisation hidden. |
| Forecasts, goals, pay rise, scenarios | PASS source; native OPEN | Distribution ordering, pending and credit reservation, commitment uncertainty, exact per-pay funding and sustained comparable pay periods. |
| Sessions 1–2.5 regression | PASS last completed run | 120 tests passed, including monthly versus four-weekly cadence and credit liabilities. Frozen baseline unchanged. |
| Both themes and installable APK | OPEN | Local APK/test compilation and lint passed. Native learning/profile/evidence/context/forecast/scenario/goal/reflection/triage coverage added. |

The optional Money Scripts questionnaire stays disabled. Statements do not establish intent/instrument/time/enjoyment; unobserved fields stay unknown. Forecasts require a current verifiable balance; unknown loan commitments block safe-to-spend. One currency is analysed at a time without invented FX rates. Schema columns are unchanged; derived period IDs are currency-namespaced. ADR 0008 and INSIGHT_CATALOGUE.md define exact operational choices.

Run 34756987002: source/build/lint/signature PASS; foundation native 2/2 and OCR PASS. Import interaction stopped before the picker opened: its action was transiently disabled while accounts loaded. Saved screenshot shows Ledger, with no picker or crash. Fix: defer the import workspace during account loading; frozen acceptance test is unchanged. New held-query UI regression verifies the action appears only when usable. Intelligence native gate was not reached.

## Reported statement import defect — local verification

| Check | State | Evidence |
|---|---|---|
| Supported Westpac period and balances filled without typing | PASS source | Explicit labels only; invalid or missing metadata rejected; both-theme interaction tests. |
| Wrapped transactions across pages | PASS source | Dedicated positional fixture; repeated headers and opening/closing rows handled; missing amounts fail explicitly. |
| Repeated purchases, overlap and rollback | PASS source | Complete running-balance evidence; both import orders, same-file idempotence and rollback; ambiguous exports remain reviewable. |
| Leave category-only guesses unassigned | PASS source | Both-theme UI path; uncertain extraction cannot be approved by this action. |
| Actual reported file read through history | PASS private local validation | Extraction, staging, explicit category deferral, transactional commit, repeat import and rollback checked; private input excluded from repository. |
| Full source regression | PASS | 146 tests in 23 files; previous acceptance tests unchanged. |
| Device verification of this candidate | OPEN | Local source checks do not establish Android picker/render acceptance. |

This is a repair within the consolidated milestone. Session 3 and S1 remain open until their remaining requirements pass.

## Consolidated security and continuation candidate

This candidate combines the reported statement repair, mandatory recovery-code acknowledgement, a dismissible backup action after more than 50 added/superseded transactions, and authentication-bound wrapping of the existing random database key. It removes both legacy persistent data-key copies and supplies SQLite through a checksum-pinned memory-only native adapter. No data key crosses the JavaScript bridge.

| Remaining acceptance | State | Required evidence |
|---|---|---|
| Existing database key migration, Android authentication expiry, legacy-copy removal | OPEN native | KeyProtectionInstrumentedTest checks the actual key properties, missing legacy entries, refusal after the 60-second window, and refusal despite a valid app PIN. |
| Frozen Session 2 acceptance files | Preserved | Android credential handling is in the test runner; ImportInstrumentedTest remains byte-identical. |
| Real encrypted backup, reset, restore | OPEN | Save through Android's picker, reset, restore using the recovery code, compare the complete ledger/provenance/coverage; reject a wrong code without mutation. Source round-trip tests alone do not close this. |
| Forgot-PIN system authentication and replacement | OPEN device interaction | Confirm the Android prompt, require a new app PIN, retain the ledger. |
| Recovery setup, backup flow and Session 3 screens in both themes | OPEN visual | Review unobscured screenshots of this candidate's required screens. |
| Session 4 entry | CLOSED pending full milestone | Only all required acceptance evidence, recorded here and in HANDOFF.md, opens Session 4. A green partial workflow is insufficient. |

The continuation contract is docs/V16_CONTINUATION.md. It permits one worker, durable before/after checkpoints, one workflow lookup per invocation, and a changed approach after two equivalent failures. The worker completes this milestone, then proceeds through Session 4 without asking for routine confirmations.

Local source verification for the combined candidate: **154 tests in 25 files PASS**, including all frozen Session 2 hashes, all 24 mixed-source import orders and 10,000 exact-money sequences. Source lint and production build PASS. The full suite used two workers after resource contention caused a timeout in the initial parallel attempt; no timeout or acceptance threshold was loosened.

Android local verification: app APK, instrumentation APK and lint **PASS**. Actual native execution is pending; local compilation is not a device PASS.

Run 34767336001: source gate PASS; Android build/signature and the native PIN, foundation, key-protection, import and Session 2.5 revision suites passed. The Session 3 suite failed before its UI assertions because its test-only database fixture called the authenticated key directly after the 60-second Android authorization window expired. Production prompt handling was not implicated. Repair: launch and unlock the production activity immediately before each of the three fixture phases, so the actual Android credential flow grants the key before test-only SQLCipher seeding. All original Session 3 behavioral and screenshot assertions remain.

Repair validation: 154 source tests in 25 files, source lint and production build PASS. The fresh worker could restore the exact locked npm graph from cache, but its prior Gradle distribution/Android SDK cache was no longer present and external Gradle downloads were unavailable. Therefore exact-patch Android compilation is pending in CI; this is stated as OPEN rather than promoted as a local Android pass.

Run 34770935104: **PASS**. The exact repair compiled and all source/build/lint/signature and native suites passed, including authentication-bound key expiry, the statement-import repair and Session 3 intelligence. Its screenshots remain unreviewed until the consolidated candidate includes the final backup/reset/restore evidence.

## Backup, reset and PIN-recovery acceptance candidate

### Manual repair of run 34774420396

Follow-up run 34776505859: source/build/lint and original native suites passed. The competing database connection is fixed. Forgot-PIN now reaches replacement, then fails full-database equality. Source inspection identifies an unfinished Today analysis when the first snapshot is taken: navigation is rendered before its transaction writes signals/profile timestamps. The test now waits for the completed Money evidence section before the initial snapshot. No table is excluded from the full equality comparison. Empty-ledger row counts exclude setup-created derived signals/profiles, with all those tables still protected by the wrong-code full-database hash. New screenshots are pulled after each backup/recovery stage so reset cannot erase their only copy. Python syntax and diff checks pass; CI will compile and run this test-only repair.

The user subsequently authorized GitHub Actions as the Android validation environment and suspended V16 orchestration for manual continuation. The preserved repair can now run through the existing full CI gate; missing local tooling is no longer a publication blocker. Device and visual acceptance remain required.

The user stopped the recurring worker; it is confirmed disabled. Candidate `38582738d975355263c538900ec1c2423a1d7c80` failed in `ForgotPinInstrumentedTest` at its first database digest, before recovery interaction. The saved failure log identifies `SQLiteException: database is locked` while a second read-only SQLCipher connection opens. Existing native suites and all four OCR parser checks passed before this point; this does not establish backup/recovery acceptance.

The repair reads the existing SQLCipher connection on Capacitor's owning worker in a snapshot transaction, preserving canonical table/column/typed-value hashes without extracting a second data key or opening another connection. The wrong-code check now excludes the actual `_migrations` table from user-row counts and additionally requires the complete fresh-database digest to remain unchanged. After restore, the test proves the new installation's PIN still works, then restores the standard synthetic PIN before the unchanged deletion regression. Failed instrumentation output is printed into the job log as well as saved separately.

Repair validation: 154 source tests in 25 files, source lint, production build, Python syntax and diff whitespace checks PASS. This repair is an Android-unvalidated source checkpoint, not a new application candidate or release. Android compilation and lint require the missing Gradle distribution and Android SDK. No saved distribution was found, and the official Gradle download timed out. Do not promote this checkpoint until that required local validation is available. Real Android recovery/backup/restore and both-theme visual acceptance remain OPEN; Session 4 remains CLOSED.

The next consolidated native sequence retains every existing gate, then adds:

- real Forgot PIN UI -> Android device-credential prompt -> mandatory replacement; the old PIN is refused and a typed digest of every SQLite table remains identical before/after; the standard synthetic gate PIN is restored;
- encrypted backup creation through Android's document picker, with ciphertext checked for absence of the SQLite header and the known synthetic account name;
- locked recovery-sheet reset using the exact `DELETE KAIROS` phrase and Android `clearApplicationUserData`, externally verified as zero app-owned files while the user-chosen backup survives;
- first-run setup after reset, a deliberately wrong recovery code with zero user-ledger rows, then correct restoration through Android's picker;
- exact pre-backup/post-restore SHA-256 comparison over every non-internal table, column, typed value and row, including import provenance and coverage; runtime recovery material and synthetic files are cleaned.

Source lint, all **154 tests in 25 files**, production build and Python harness syntax PASS. Exact Android compilation/execution remains OPEN because this worker no longer has a local Gradle/SDK distribution; the candidate workflow must supply that evidence. Session 4 remains closed, and required screenshots/APK are fetched only after this sequence passes.
