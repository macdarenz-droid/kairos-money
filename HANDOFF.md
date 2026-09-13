Current update: run 34782241638 is fully green, including exact native backup/reset/restore, wrong-code refusal and original regressions. All 18 Session 3 theme images reviewed. Final recovery/backup both-theme captures are being added to the existing test flow; Session 4 remains closed until their review. Manual continuation; worker remains disabled.

# Kairos Money — Session 3 under verification

Latest run 34781012976 confirms picker review retention and wrong-code zero-write refusal. Correct restore exposed a fresh-installation bug: generated signals/profiles were counted as user ledger data. The restore guard now permits atomic replacement of derived tables while retaining protection for accounts, transactions, imports, goals and other user tables. New real-SQLite regressions cover analysed empty installations, goal-only refusal and rollback of calculated data. Complete source checks and publish to authorized CI; worker stays off.

Current repair after run 34778870575: reset is now proven (zero app files, external backup preserved). Restore lost its sheet when Android's picker backgrounded Kairos. App now retains that hidden transient view until authenticated resume; real lock/expiry still removes it. Two theme regression tests cover retention, concealment and expiry. Finish source validation and run the full Android gate for wrong-code refusal and exact restoration. Worker remains disabled.

Run 34778108902 passed intelligence, Forgot-PIN and backup-save instrumentation. Its host check found the synthetic recovery-code file missing before reset. The helper now writes through UiAutomation stdin and verifies exact readback; production paths are unchanged. Continue through reset, wrong-code refusal, exact restore and remaining visual acceptance. Worker remains off.

Latest failure: run 34777460743 stopped at intelligence fixture key unwrap (`UserNotAuthenticatedException`) before testing the recovery timing repair. Fixture insertion now uses the authenticated app connection on Capacitor's worker; synthetic data and all assertions are retained. Validate this combined test repair in CI, then finish native recovery/backup and theme evidence. Worker stays disabled.

Run 34776505859 compiled the native repair and passed existing suites; its new recovery hash assertion exposed that the baseline snapshot races Today's asynchronous derived-data transaction. The next test candidate waits for completed Money evidence, retains full-table comparisons and preserves recovery screenshots before reset. Android validation remains in authorized CI. Worker stays off; Session 4 remains closed.

Latest instruction supersedes the local-tool blocker below: the user authorized GitHub Actions for Android compilation, lint and device tests and suspended V16 orchestration during manual work. Promote the preserved database-lock test repair to CI. Keep the worker disabled and continue the original session gates manually.

Current override: the user stopped the Money worker on 2026-09-13; it is confirmed disabled and must stay disabled until explicitly requested. Manual continuation diagnosed run 34774420396: its new Forgot-PIN test opened a competing SQLCipher connection and failed with `database is locked` before recovery began. The source checkpoint replaces that connection with a transaction on the existing Capacitor worker, strengthens wrong-code invariance, and restores the standard test PIN after proving the replacement PIN survives backup restore. No acceptance criterion is removed. Android compilation/lint remain blocked by the missing local Gradle/SDK distribution; restore those tools before promoting the checkpoint to a new candidate. See the manual-repair section of docs/GATE_SESSION_3.md. Session 4 stays closed pending complete native and visual acceptance.

Standing scope: private sideloaded build; targeted edits only; preserve passing work and existing tests. Run local checks and the full regression suite before pushing. Finish complete milestones rather than per-component deliveries. After a milestone-candidate push, check CI at most once and stop if unfinished; no polling. Review required APK/theme artifacts once at milestone closure; no routine green-run logs/jobs. On failure, fetch only the failing job log once. Patch S1 key management/recovery and encrypted backup is next; notification Addendum A follows shipped v1.

Sessions 1–2.5 PASS. Session 3 authorized; the full original brief is now supplied. No specification blocker remains. No Session 4 work.

Current source: /workspace/scratch/8c24bb313ef1/kairos-session3. Remote checkpoint branch: codex/session3-design-research. Preserve the tested Session 2.5 APK until Session 3 passes its native gate.

Built: 13-mechanism research catalogue and claim audit; twelve evidence-limited versioned signals; four axes/six descriptive shapes; four contracted insights with dismissal memory; empirical-distribution forecasts, exact goals/funding, comparable-pay rise detection and conditional scenarios. UI shows missing evidence and Tier C uncertainty; distress hides optimisation and offers free counselling. New monochrome aperture logo replaces the rejected K in this candidate.

Existing SQL tables store derived snapshots, goals and dismissal settings. Intelligence pure modules cannot reach DB/ingest; the ledger repository owns read snapshots and derived writes. Ledger rows remain unchanged. Reports are per-currency. No floats on money. Missing purchase metadata is unknown, with optional explicit context; reflections are not a validated psychology test.

Source regression: 120 tests passed, including the unchanged 100-test Sessions 1–2.5 baseline. Android app, test package and lint compiled locally.

Next: Run the expanded native suite, inspect all new screens in both themes, verify APK hashes/signature and export/delete regression, then publish PASS report and tested APK. See docs/GATE_SESSION_3.md. Do not call Session 3 complete until those checks pass.

Resume-lock repair: run 34757531482 passed foundation, import, revision and intelligence native tests, then failed after activity recreation with database locked. The SQLite plugin has no destruction cleanup; an interrupted transaction can retain its native lock after the WebView disappears. DatabaseLifecycle now rolls back an active transaction and closes the connection on the existing Capacitor worker before it exits. No ledger rewrite or acceptance-test change. Local validation: all 121 source tests, production build, Android app/test compilation and lint PASS. The next unchanged native recreation/resume/export check must confirm the repair; Session 3 remains open.

Picker-return repair: run 34758505857 stopped at the PIN screen after file selection, before the recreation/export check. Capacitor emits active on resume even without an inactive/onStop event. Session handling now records pause directly, preserves the first background timestamp across a later stop, resets it only after a successful reopen, and ignores duplicate active events only for an already authenticated live repository. Cold starts, expired native authentication and the 60-second deadline still require unlock. Three regression cases failed before this change and pass after it. All 124 source tests, lint and the production build pass locally; Android APK/test packaging and lint also pass locally. CI must confirm picker return, recreation, timed resume and export before the repair is accepted. Existing Sessions 1–2.5 acceptance tests remain unchanged.

Export-size repair: run 34759390305 passed foundation, import, revision and intelligence native tests, then crashed opening export with TransactionTooLargeException (1,814,080-byte saved-state parcel). Capacitor duplicated the base64 ZIP in activity state. exportFile now removes base64 from the retained call after decoding and before launching the document picker. The in-memory bytes and existing interrupted-export error remain; no file contents are placed in saved activity state. Existing acceptance tests are unchanged. Local validation PASS: 124 tests, lint, production build, Android APK/test compilation and Android lint. Next CI must confirm the real export and deletion path.


## Patch S1: PIN recovery slice

Export repair `23825ff` passed workflow [34760248303](https://github.com/macdarenz-droid/kairos-money/actions/runs/34760248303). No green-run logs or artifacts were fetched. Session 3 visual acceptance remains open.

Added offline Forgot PIN with device authentication followed by mandatory PIN replacement, and typed permanent reset. A native recovery grant expires after five minutes and is lost on restart; the replacement requirement persists. The database key is unchanged by PIN replacement. Added native store tests for replacement/backoff/interruption and both-theme UI interaction tests. Existing Sessions 1–2.5 acceptance tests remain unchanged. Local validation: all 127 source tests passed; source lint and production build passed; app APK, instrumentation APK and Android lint passed on the final source. New native recovery assertions await CI; real system-prompt recovery and visual acceptance are not yet claimed.

Patch S1 remains OPEN: authentication-bound key wrapping and migration, backup-only recovery code, encrypted backup/restore, post-import backup prompt, and real device recovery/reset acceptance remain outstanding. Current recovery uses the system authentication callback; it must not be reported as authentication-bound cryptographic key protection. Continue those targeted requirements before general Session 4 work.


## Patch S1: encrypted backup slice

PIN recovery commit `b378bbf` passed workflow [34761634388](https://github.com/macdarenz-droid/kairos-money/actions/runs/34761634388). No green-run jobs, logs or artifacts were fetched.

Added a Settings encrypted-backup sheet, native backup-only recovery code and written-code acknowledgement, AES-GCM encrypted save through the existing system save picker, and atomic restore through the file picker into an empty ledger. All tables are included, including provenance, payslips, coverage and staged files. Wrong codes and damaged backups are rejected before writes; invalid rows and interrupted inserts roll back. The existing readable JSON/CSV export is retained.

Patch S1 remains OPEN: authentication-bound device-key wrapping/migration, mandatory code acknowledgement during initial setup, the post-import backup prompt, and real device reset/restore and system-authentication acceptance. Backup/restore currently supports the current schema and a 64 MB limit. Session 3 final visual acceptance remains open. Do not report either gate complete.

Local verification for the encrypted-backup slice: 136 source tests PASS, source lint and production build PASS, Android app/test APK compilation and lint PASS. Both-theme backup UI interaction tests pass; no native screenshot review or physical reset/restore proof is claimed. Existing Sessions 1–2.5 acceptance tests were not edited.


## Delivery consolidation — user-requested planning change

The user explicitly asked to stop fragmenting the four-session brief into user-facing slices. `docs/ROADMAP.md` now consolidates the remaining work into (1) finish all S1 requirements and close Session 3, then (2) complete Session 4 and ship private v1. Addendum A stays post-v1. Internal implementation steps do not each trigger a push or handoff. Required full regressions and device acceptance remain intact. No application code changed in this planning update.

The current backup candidate remains `a5a87a9`, workflow 34762937327; this planning turn did not query its status or inspect artifacts. Next implementation turn: check that candidate once, handle any failure, then complete the remaining current-milestone requirements together before another implementation delivery. Required milestone-closing APK/theme evidence is the specific exception to the earlier green-artifact ban, as otherwise the original acceptance requirements cannot be met. Keep the no-polling rule.

## Blocking statement-import repair — current milestone candidate

A reported Westpac Choice layout failed the generic positional parser and forced manual statement dates. Added a dedicated wrapped-row adapter and explicit period/balance inspection through FileSource. The existing form now fills supported statement details automatically and reuses extraction when the user proceeds to review. The account prerequisite is explained in the empty state.

Full-path validation exposed genuine repeated purchases collapsing under the base fingerprint. Complete statement running-balance evidence now provides stable occurrence identity, while ambiguous matches and broken extraction still require review. Category-only uncertainty can explicitly be left unassigned in one action; other uncertainty remains blocked. Mandatory confirmation, atomic history writes, overlap provenance and rollback remain intact. See ADR/0010-statement-balance-evidence.md.

The uploaded document was tested privately through extraction, staging, category deferral, commit, identical-file reimport and rollback. No personal document, extracted content or private fixture is included in Git. Synthetic tests cover this layout and both-theme interaction. This repair is part of the consolidated candidate, not a new session or a claim that Session 3/S1 is complete. Device acceptance remains required for the candidate.

Statement-repair regression: all 146 source tests across 23 files pass, including the unchanged prior acceptance tests. Source lint passes. Current repair has not been delivered to the installed APK; Android/device acceptance and the remaining consolidated milestone work must not be inferred from these local results.

Final local packaging for this repair: production build, Android app APK, instrumentation APK and Android lint PASS. These are compilation checks; no new native device run or screenshot acceptance is claimed. Keep this checkpoint in the consolidated milestone candidate rather than publishing another component release.

## Consolidated milestone continuation: recovery setup and backup prompt

The prior backup candidate workflow 34762937327 completed successfully (one status lookup; no green logs/jobs/artifacts fetched). Added a mandatory written recovery-code acknowledgement before the session opens the database, including interruption/resume handling. Existing installations without acknowledgement reach this step after authentication. Settings remains the re-view and encrypted-backup entry point. Added a dismissible backup action after an import/update commits more than 50 added or superseded transactions; known duplicates do not count.

All 152 source tests across 25 files pass; source lint and production build pass. Six new tests cover both-theme setup/interruption and 50/51 transaction prompt boundaries. Existing source acceptance tests were not edited. The native foundation UI interaction has added interactions to complete/assert the newly mandatory setup step; all previous assertions remain. Native execution and visual acceptance are still open.

Key-protection review: Capacitor SQLite 6.0.2 retains an independent secret in sqlite_encrypted_shared_prefs, protected by a non-authentication-bound master key in the configured mode. Protecting only VaultStore.dbSecret would therefore be incomplete. Next implementation must remove persistent plugin-secret use together with introducing authentication-bound wrapping of the unchanged random database secret. Use a pinned, fail-closed native adapter for an in-memory SQLCipher session secret; do not claim that toggling the plugin biometric preference migrates existing keys. Verify legacy migration, interrupted migration, cancellation, expiry/lock, PIN replacement and reset together before the single milestone device run. SQLCipher requires usable key bytes in memory: distinguish its random data key from the non-exportable Android wrapping key explicitly in the ADR.

The recovery-code generator was checked after an initial mistaken suspicion: its 32-character alphabet is correctly indexed by the existing mask. No generator change was retained. No component release was pushed, and Session 4 has not started.

Final local check for recovery setup/backup prompting: Android app APK, instrumentation APK and lint PASS on the final source. No native device execution or visual pass is claimed for these additions. Keep the current local checkpoint with the statement-import repair for the consolidated milestone; no new component release was published.

## Authentication-bound migration candidate

Implemented the unchanged random data-key migration to an Android authentication-required wrapping key, checksum-pinned SQLite memory-only secret adapter, synchronous removal of the independent legacy SQLite copy, and native key provisioning without returning the key to JavaScript. Added prompt cancellation/resume regression tests, an Android credential test helper, expiration/key-property/legacy-copy tests, and reset key-alias assertions. ADR/0011-authenticated-database-key.md records the precise data-key/wrapping-key distinction and interrupted migration behavior. No hardware-backed guarantee is made for the emulator.

The next Android gate tests this candidate together with the statement repair, mandatory recovery setup, backup prompting and original native suites. A green workflow alone is not S1 closure: the real backup -> reset -> restore device acceptance and Session 3 visual review still require completion. The continuation worker must complete those missing acceptance items before marking the consolidated gate PASS and beginning Session 4. Never promote an older green run or a compilation-only result.

Final combined candidate local verification: 154 source tests in 25 files, source lint, production build, Android app APK, instrumentation APK and Android lint PASS. The frozen Session 2 import test remains unchanged; a test-only instrumentation runner handles Android credentials. The initial unrestricted parallel test attempt hit resource contention; two workers passed the full unchanged suite. The user requested publishing this useful progress gate and enabling the single hourly V16-adapted continuation worker before ending this turn. Full milestone acceptance remains OPEN as itemized in docs/GATE_SESSION_3.md.

Candidate e57cf27eca6b675abae2d8a4dd74307372467f1c / run 34767336001 passed the source gate, Android build/signature and native suites through Session 2.5. IntelligenceInstrumentedTest then reached its test-only fixture after the Android key's 60-second authorization expired. The focused repair authenticates through the real app immediately before every intelligence fixture phase; assertions and shipped code are unchanged. Post-repair source lint, all 154 tests and production build pass. Exact-patch Android compilation is delegated to the next CI candidate because this worker's Gradle/SDK cache was unavailable; do not treat that as local Android evidence.

The repaired candidate b456368993b4fe6e7e2cb6462e2b57f882828b00 / run 34770935104 is PASS, including the complete existing native suite. Added the remaining consolidated device acceptance harness: actual Forgot-PIN device authentication and replacement with ledger retention, encrypted backup saved via DocumentsUI, locked typed reset, external zero-file verification, wrong-code refusal with zero rows, correct restore via DocumentsUI, and an exact typed digest of every SQLite table before/after. All runtime recovery material is synthetic and cleaned; none enters Git. Source lint, 154 tests, production build and Python syntax pass. The new Android source still needs CI compilation/device execution, followed by one required artifact review. Do not open Session 4 before those pass.
