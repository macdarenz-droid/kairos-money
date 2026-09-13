# Kairos Money Tracker

A private, on-device money tracker with exact money math, an encrypted Android ledger, account setup, app lock, export/delete and a quiet two-theme interface. Session 2 adds local file extraction, mandatory import review, reconciliation and reversible commits. Its native acceptance gate remains open; intelligence has not started.

**Session 1 gate: PASS** on Android 34 AOSP; [verified run](https://github.com/macdarenz-droid/kairos-money/actions/runs/34747556681).

Read `HANDOFF.md` and `docs/GATE_SESSION_2.md` before continuing. A source-test pass is not an Android install/security pass.

## Run the UI

Node 22 is required. Dependencies are pinned in package-lock.json.

```sh
npm ci
npm run dev
```

Open the Vite URL. The browser is an explicitly labelled design preview and cannot store financial data. Development primitives are at `/dev/kitchen-sink`. The normal production bundle excludes that route and its synthetic examples.

```sh
npm run check
node scripts/test-money-lint.mjs
npm run dev:fixtures
```

The fixture command creates `fixtures/generated/SYNTHETIC-DEV-ONLY.sqlite`. It is not bundled into the app. Re-running it refuses to overwrite the fixture.

## Build Android

Use JDK 17, Android SDK platform 34/build-tools 34.0.0, and Node 22. The app supports Android 8/API 26 and later with Android System WebView 111 or later.

```sh
npm ci
npm run android:debug
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`. The debug certificate is for development only. CI preserves it through a cache where available. A different signing certificate requires uninstalling the existing debug app; export data before that operation. Release signing is a separate Session 4 task.

The GitHub Actions workflow runs source checks, builds/signs a debug APK, runs native encryption and UI tests on an Android 34 emulator, and publishes the APK only after that gate passes. CI evidence is a separate artifact. A newly created destination repository must be accessible to the connected GitHub app before it can receive this source.

## Native verification

Use a fresh emulator or test install: the tests intentionally create synthetic financial data. They are not intended to run over a real ledger.

```sh
cd android
./gradlew :app:assembleDebug :app:assembleDebugAndroidTest
cd ..
python scripts/run-native-gate.py
```

The separate deletion test intentionally terminates the app using Android's data-clear API; a host verifier checks that app-owned financial files and database have gone. Synthetic screenshots temporarily remove screenshot protection inside the instrumentation harness only; production always sets FLAG_SECURE.

The independent host encryption proof needs `sqlcipher3-binary==0.6.0`:

```sh
python scripts/verify-encryption.py
```

It proves encrypted-file behavior on the host, not native Android execution. Native evidence must be recorded separately.

## Architecture

- `core/money`: immutable bigint Money, parsing, formatting, allocation and exact native-bridge conversion.
- `core/db`: canonical SQL migrations, typed Drizzle query schema, Capacitor SQLite driver, repositories and export.
- `core/crypto`: native vault boundary and resume-time policy. Android implements this in `KairosVaultPlugin` / `VaultStore`.
- `ui/design`: OKLCH tokens, contrast aliases, primitives and persisted theme.
- `ui/screens`: native lock, account setup, settings and development-only kitchen sink.
- `ingest`: offline extraction, parser registry, normalization, encrypted staging, reconciliation and review.
- `ledger`: deterministic categorisation rules and merchant/MCC suggestions.
- `tests`: property, database, privacy and interaction verification. Synthetic data never enters the production import graph.
- `ADR`: rationale for non-obvious choices. `docs/SCHEMA.md` is regenerated from SQL.

Ingest writes staging only until confirmation. Intelligence will consume a read-only ledger interface. SQL writes use the serialized transaction boundary; SQLCipher encryption must never fall back to plain SQLite.

## Privacy and recovery

No account, analytics, financial-data network calls or internet permission. A native PIN protects opening the database; optional strong biometrics can be enabled after setup. On background, financial UI and query caches are cleared. A 60-second background interval requires re-authentication on resume.

Exports contain readable JSON and per-table CSV inside a ZIP and are written to the Android document location explicitly chosen by the user. Keep those files private. Delete all data clears the app's database, files, preferences and keys, then Android closes it. User-created exports outside the app must be deleted separately.

There is no account-based PIN recovery. Encrypted backup/restore is Session 4. iOS configuration is prepared, but a Keychain/LocalAuthentication vault implementation is still required; there is no insecure fallback.

## Export-first revision planned for Session 2.5

Manual file imports are the only v1 data path. Direct bank API integration is outside v1 because its accredited-provider/server architecture does not fit this local-only app. Kairos will never request internet-banking credentials or use credential-scraping aggregators.

After Session 2 passes, Session 2.5 makes weekly OFX/QIF and CSV/XLSX exports the preferred update path, while retaining all PDF/OCR support. The Update accounts flow will name a date range overlapping the previous covered week, so imports can reconcile transactions that settle later. These freshness and export-without-balances features are planned, not yet available in the current Session 2 build. See `docs/SESSION_2_5.md`.
