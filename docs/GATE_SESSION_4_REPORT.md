# Session 4 — criterion-by-criterion gate report

Candidate: `3c446b0` on `claude/current-last-gate-x7nats`, PR #1 into `main`.
Gate: run [34912806907](https://github.com/macdarenz-droid/kairos-money/actions/runs/34912806907) — **both jobs PASS** (`source-gate`, `android-gate`).

Verdicts are `PASS` only where a named check or device assertion actually ran in that run. `PASS (automated)` means the device asserted it but a human has not looked at the rendering. `OPEN` means the criterion requires evidence this environment cannot reach. Nothing here is marked PASS on the strength of source code alone.

## What run 34912806907 executed

`source-gate`: `npm ci`, `npm run check` (288 tests in 68 files, lint, strict TypeScript, production build), `node scripts/test-money-lint.mjs`, `python3 scripts/test-native-gate.py` (14 runner tests), `npm run dev:fixtures`, `pip install sqlcipher3-binary==0.6.0`, `python scripts/verify-encryption.py`, and `git diff --exit-code` on `docs/SCHEMA.md docs/CONTRAST.md src/ui/design/tokens.css`. All green.

`android-gate`: APK signature verification, non-debuggable benchmark APK verification, then the full native run on an Android 34 emulator in airplane mode, then `verify-native-ocr.ts`, `verify-android-backup-restore.py` and `verify-android-delete.py`.

### Device instrumentation — 13 classes, 21 tests, all passing

| Class | Tests | Time |
|---|---|---|
| PinRecoveryInstrumentedTest | 3 | 9.07 s |
| FoundationInstrumentedTest | 2 | 18.52 s |
| KeyProtectionInstrumentedTest | 1 | 62.25 s |
| HardeningInstrumentedTest | 1 | 0.27 s |
| ImportInstrumentedTest | 2 | 49.50 s |
| LargeImportInstrumentedTest | 1 | 10.74 s |
| NotificationsInstrumentedTest | 1 | 0.29 s |
| RevisionInstrumentedTest | 2 | 37.79 s |
| IntelligenceInstrumentedTest | 4 | 142.03 s |
| LedgerPerformanceInstrumentedTest | 1 | 50.99 s |
| AccessibilityInstrumentedTest | 1 | 29.38 s |
| AcceptanceInstrumentedTest | 1 | 89.43 s |
| PostDeleteInstrumentedTest | 1 | 1.98 s |

## Criteria

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Cold start within limits | **PASS** | Non-debuggable benchmark variant; `process_cold_median_ms` 681 against a 2,000 ms limit, `fresh_install_ms` 732 against 2,500 ms, `failures: []`. |
| 2 | 20,000-row ledger performance | **PASS** | `LedgerPerformanceInstrumentedTest` passed, so `assertTrue(loadMs < 10000)` was evaluated and held. It had failed at 44,012 ms on the immediately preceding commit; class runtime fell 160.1 s → 51.0 s. Exact phase timings are in the run artifact (see Limits). |
| 3 | Virtualization and end-to-end reachability | **PASS** | Same test: ≤40 mounted rows asserted at 100% and 200% text zoom, middle row beyond 9,000 and final row `aria-posinset="20000"` reached at both sizes, no horizontal overflow. |
| 4 | Native encryption proven on device | **PASS** | `KeyProtectionInstrumentedTest` and `FoundationInstrumentedTest`; `scripts/verify-encryption.py` in source-gate; SQLCipher `cipher_version` checked at open, which fails closed. |
| 5 | Authentication-bound key protection | **PASS** | `KeyProtectionInstrumentedTest` (62.25 s, real Keystore path). |
| 6 | PIN recovery, device credential, backoff, typed reset | **PASS** | `PinRecoveryInstrumentedTest` (3 tests) through the real system flow. |
| 7 | Encrypted backup → reset → fresh setup → restore | **PASS** | `verify-android-backup-restore.py` plus `PostDeleteInstrumentedTest`; transactions, batches, provenance, payslips and coverage preserved. |
| 8 | Delete leaves no app data or key material | **PASS** | `verify-android-delete.py` and `PostDeleteInstrumentedTest`. |
| 9 | Import journeys, including long PDF with progress | **PASS** | `ImportInstrumentedTest` (2), `LargeImportInstrumentedTest`, `RevisionInstrumentedTest` (2); worker-based reconciliation above 200 rows. |
| 10 | Intelligence engine on device | **PASS** | `IntelligenceInstrumentedTest` (4 tests, 142.03 s), with the twelve signals, evidence, confidence and insight contracts asserted in source by `tests/intelligence.test.ts`. |
| 11 | 200% text zoom in both themes, touch targets, no overflow | **PASS (automated)** | `AccessibilityInstrumentedTest`; `text_zoom_themes: ["light","dark"]`. Names, 44 px targets and overflow are asserted programmatically; no human has reviewed the rendering. |
| 12 | Screenshot capture in both themes | **PASS (automated)** | `NativeEvidence.capture` across required screens, then `verify-native-ocr.ts` confirms expected text. The gate itself records `screenshots_require_review: true`. |
| 13 | End-to-end acceptance journey | **PASS** | `AcceptanceInstrumentedTest` (89.43 s). |
| 14 | Notification policy | **PASS** | `NotificationsInstrumentedTest`; opt-in only, offline. |
| 15 | Hardening and lock edge cases | **PASS** | `HardeningInstrumentedTest`; background unlock retained 1 s, locked at 61 s. |
| 16 | Kill during active import, no partial ledger | **PASS** | `RevisionInstrumentedTest` and the prepared database-full fixture asserting the original encrypted record with no partial inserts after reopening. |
| 17 | Release configuration and signing continuity | **PASS** | `scripts/verify-release-config.mjs`: version `1.0.0-rc.1`, versionCode 4, signing secret-backed with no debug fallback; gate verifies the APK signature and that the benchmark APK is not debuggable. |
| 18 | Version, changelog, README | **PASS** | `CHANGELOG.md` and `README.md` (111 lines) present; version consistent with the verified release configuration. |
| 19 | Schema documentation current | **PASS** | `docs/SCHEMA.md` regenerated and `git diff --exit-code` clean in source-gate. |
| 20 | ADRs for this milestone's decisions | **PASS** | `ADR/0031`–`ADR/0036`, the last covering the root-cause fix in this candidate. |
| 21 | No shipped synthetic data | **PASS** | Fixtures are generated into instrumentation assets only and removed from the device ledger after the test; `git diff --exit-code` guards generated files. |
| 22 | Installable APK delivered | **OPEN** | Artifact `kairos-money-debug-3c446b0f…` (33,178,239 bytes, digest `sha256:832ba0c2…`) exists on the run and expires 2026-10-15. This environment cannot download it (see Limits), so it is delivered but unverified by inspection. |
| 23 | Both-theme visual/design review | **OPEN** | Screenshots exist in artifact `kairos-money-gate-3c446b0f…` (30,452,279 bytes, digest `sha256:8d9aea15…`). Human visual review and design-drift correction are judgement calls that require seeing them. |
| 24 | Play Store deliverables | **N/A** | Out of scope by the brief; private release only. |
| 25 | Addendum A — notification capture | **N/A** | Deferred until v1 ships. |

## Limits of this report

Artifact download is blocked in this environment: the GitHub API redirects to `*.blob.core.windows.net`, which the egress proxy refuses by organization policy (`connect_rejected`). I did not attempt to bypass it. Three things therefore remain unread here and are the outstanding closure work:

1. `docs/evidence/ledger-20000.json` — the exact `tab_open_ms`, `first_row_ms`, `search_entered_ms` and frame intervals. The budget assertion passing is the bound (under 10,000 ms); the precise figure is not quoted because it was not read.
2. The both-theme screenshots, for human design review.
3. The signed debug APK, for installation on a real device.

All three are downloadable from the run page by anyone with normal browser access. The remaining criteria above are PASS on checks that actually executed in run 34912806907.

## Honest status

Session 4's **gate is green and its automated acceptance is complete**. The milestone is not closed: criteria 22 and 23 need a human to open the artifact, and the brief requires that device evidence be reviewed once at closure. Nothing above is claimed as device acceptance on the strength of a source-only or mocked path.
