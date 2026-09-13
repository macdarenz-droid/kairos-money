# Kairos Money Tracker — Session 1 continuation checkpoint

## State

Session 1 is still OPEN. Do not begin Session 2. The source implementation and local checks are complete; the remaining native and GitHub gates must be resolved and evidenced first. `docs/GATE_SESSION_1.md` is authoritative about PASS/FAIL boundaries.

Destination: **macdarenz-droid/kairos-money** only. No trading-journal repository was changed. The user created the private repository and connected GitHub read/write access is now verified. The initial README commit is preserved as the parent of the source upload. Check the repository Actions tab for the current Android gate result; a local build pass does not imply a native device pass. Current isolated continuation working tree: `/workspace/scratch/4b0b7f8b9437/kairos-money`. The earlier working folder has separate edits; preserve them. Local Git history and GitHub connector commit IDs differ; use the remote head as the parent for connector updates.

## Built

- Capacitor 6.2.2, React 18.3.1, strict TypeScript, Vite, Zustand UI state, TanStack Query and pinned lockfile. Android application ID `app.kairos.money`; version 0.1.0; SDK 34; Android minimum 26; WebView minimum 111 with offline explanatory error page.
- Immutable bigint money with checked database range, currency-aware add/subtract/allocate/format/parse and ESLint rule. 10,000 randomized operation sequences.
- Sixteen data tables, two canonical SQL migrations, Drizzle typed queries and native SQLite adapter. Added source provenance, staging, privacy/settings, evidence/version fields and reserved rational FX fields.
- Source-only synthetic development fixture; no production fixture loading. Host migration tests populate every table and preserve rows through 1→2→1→2.
- Designed dark/light token sets, AA text aliases, responsive primitives, Today/Ledger/Insights/You, Quick action search, real native account setup and development-only kitchen sink.
- Native Keystore-backed PIN verification and random encryption secret, optional strong biometrics, persisted retry cooldown, 60-second resume policy, screenshot protection, cache/UI clearing and database close on background. Capacitor logging is disabled.
- Complete JSON/per-table CSV ZIP export through Android's save-document UI. Explicit deletion confirmation invokes Android clearApplicationUserData after closing the database; Android closes the app. External exports remain user-owned.
- Android build/emulator CI, native encryption and screenshot instrumentation, and a separate external deletion verifier that includes caches, WebView files and app-owned external files. Android 12+ cloud-backup/device-transfer exclusions complement legacy backup disabling. These require successful execution before the gate becomes PASS.
- Design plan, regenerated SCHEMA.md, CONTRAST.md, five ADRs, README, CHANGELOG and gated ROADMAP.md.

## Verified locally

- `npm run check`: ESLint, 19 unit/property/interaction tests, strict TypeScript, production Vite build, schema generation. See evidence/source-check.log for the final recorded run.
- `node scripts/test-money-lint.mjs`: unsafe numeric money operations rejected; bigint accepted.
- `npm run dev:fixtures`: created `SYNTHETIC-DEV-ONLY.sqlite`; not part of production assets.
- `python3 scripts/verify-encryption.py`: host SQLCipher raw file unreadable without the correct key; deleted fixture leaves no files. This is explicitly not native Android proof.
- Capacitor Android sync succeeds. App debug and instrumentation APKs compile; Android lint has 0 errors and 12 warnings. All 13 packaged web assets match the current production build; the APK has no internet permission. The downloadable APK is debug-signed; see docs/evidence/apk-signature.txt and apk-manifest.json.
- Local software-emulator startup timed out after 480 seconds. There is no KVM acceleration here. No native instrumentation, installation, screenshots, document-picker export or deletion check ran; see docs/evidence/native-run-status.json.

## Latest native verification

Run 34746295447 on 489d916b is green for both source and Android jobs. Both foundation tests, the export/resume acceptance test, OS deletion verification and post-deletion setup test pass. The real document picker saves JSON plus 16 CSV tables. OS deletion leaves zero of 61 app-owned files and no database. Native security/export/delete are proved.

Session 1 remains OPEN only for completion of native visual evidence: `light-insights.png` captures Ledger and `today-initial.png` captures the earlier opening state. These frames are rejected. The capture helper now waits for a committed frame after clearing the synthetic screenshot flag. Monitor the next CI run, review every image, then update the gate and deliver the APK. Do not rerun completed repository setup or alter app functionality to fix a capture timing issue. See `ci-functional-pass-visual-pending.json` and ADR 0007.

## Exact next steps

1. Read `docs/GATE_SESSION_1.md`, `docs/evidence/` and the latest native logs. Do not restart the project or regenerate the Android platform over custom native code.
2. GitHub access and the 108-file initial upload are verified (commit 7dc9ae9). First CI run 34742912479 passed source checks and APK build/signature, then failed before emulator boot: its default partition needed 7.3 GB but only 6.6 GB was free. The second run 34743677323 on 95904f46 also passed source/build/signature, but emulator 37.1.11 still needed 7.3 GB despite the 2048M setting and exited before tests. The current repair removes unused toolchains from the disposable CI runner after APK compilation and requires 16 GiB free before emulator setup. Export/resume/post-delete tests are already committed. Third run 34744181772 on db64c999 passed the disk preflight (28,127,150,080 bytes free), booted Android in 65.9 seconds, installed both APKs and ran instrumentation. The first foundation test completed; the process crashed during the app-flow test. The prior log filter did not capture its cause. Commit ac43e1f1 adds full native log streaming, WebView-provider capture and target exit records. Diagnostic run 34744611430 identified Android exit reason 12 (DEPENDENCY DIED): Google Play Services FontsProvider died after a background ANR and Android killed Kairos as its client. The merged manifest contains a transitive EmojiCompatInitializer. The current repair removes only that unused downloadable font initializer and adds an app-flow guard; see ADR 0006 and ci-fourth-run.json. Monitor the latest workflow; do not repeat sign-in or repository creation.
3. Rebuild if source changes; verify its APK signature. Install the signed debug APK on a fresh Android 34 emulator/device. Run `scripts/run-native-gate.py` using the command in README; inspect each dark/light screenshot. Verify cold-launch theme persistence, PIN retry, biometric availability, 59/60-second background behavior and file-picker export on Android.
4. Pull screenshots before running `scripts/verify-android-delete.py`; successful OS deletion terminates the app and removes its test screenshots. Verify the app-owned database/files are absent, then relaunch and confirm a new PIN setup screen. Exported external files are intentionally outside that deletion scope.
5. Fix any native or visual failures. Repeat only the affected gate plus required source/native checks. Update evidence and mark each criterion based on observed results. Once every Session 1 requirement passes, deliver the APK and final handoff. Only then start Session 2.

## Local runner details

The scratch runner initially lacked Android SDK, full JDK and emulator system libraries. Tooling was prepared under sibling directories `android-sdk`, `jdk-runtime`, `gradle-runtime`, `emulator-libs` and `kairos-avd`. These are environment-only and excluded from the source bundle. The runner has no `/dev/kvm`; the software emulator did time out after 480 seconds. Use an accelerated CI runner or a physical device for the remaining checks.

Final build evidence is copied into docs/evidence/android-build.log. Scratch tool logs include `/tmp/kairos-android-final.log`, `/tmp/kairos-android-build.log`, `/tmp/kairos-android-sync.log`, `/tmp/kairos-native-run.log` and `/tmp/kairos-emulator.log`. `/tmp/kairos-native-run.py` is a scratch harness; CI uses the repository-owned tests/commands instead. Gradle's local JVM needed the existing environment proxy, IPv4 and the system Java trust store (`/etc/ssl/certs/java/cacerts`); certificate checks were kept enabled. CI uses normal JDK 17/Android setup and should not copy scratch proxy settings.

## Deferred by the brief

All imports, OCR, dedupe/coverage reconciliation, rules, payslip matching, behavioural signals, archetypes, forecasts, goals UI, fingerprint/charts, notification/cash/receipt features, release signing and encrypted backup/restore. No fake stand-ins are active. iOS needs the native vault implementation before it can run; browser preview intentionally cannot store financial data.

## Risks the next sessions must settle

- Preserve many-to-many source provenance when deduplicating or rolling back overlaps. A single import_batch_id cannot support safe rollback.
- Identical same-day same-amount same-description purchases can collide under the proposed fingerprint; resolve occurrence identity with golden tests before claiming lossless import.
- Define byte-identical **canonical ledger snapshots** for the six import orders. Physical encrypted SQLite file bytes and real import-event timestamps are not order-independent.
- Do not infer impulse intent, time-of-day, instrument, location, awareness or enjoyment when statements lack the inputs. Return insufficient_data. Research mechanisms do not validate the app's invented archetype thresholds or causal dollar promises.
- Account coverage is not the sum of overlapping days across accounts. The profile gate requires genuine covered history, including in the Session 4 E2E fixture.
- Debug certificates are development credentials; switching signing identity can require reinstall. Preserve a stable development certificate before relying on upgrades with real data. Release signing remains separate.
