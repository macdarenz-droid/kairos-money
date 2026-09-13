# Kairos Money — Session 3 under verification

Standing scope: private sideloaded build; targeted edits only; preserve passing work and existing tests. Run local checks and the full regression suite before pushing. After push, check CI at most once and stop if unfinished; no polling. On failure, fetch only the failing job log once. Patch S1 key management/recovery and encrypted backup is next; notification Addendum A follows shipped v1.

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
