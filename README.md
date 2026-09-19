# Kairos Money Tracker

A private, on-device money tracker with exact money math, an encrypted Android ledger, account setup, app lock, encrypted backup/recovery, export/delete and a quiet two-theme interface. It imports local statements through mandatory review and reversible reconciliation, supports manual history and evidence, and derives coverage-aware charts and insights without sending financial data to a server. Session 4 remains open until its combined native, accessibility, hardening, performance and private-release gate passes.

**Session 1 gate: PASS** on Android 34 AOSP; [verified run](https://github.com/macdarenz-droid/kairos-money/actions/runs/34747556681).

Read `HANDOFF.md` and `docs/GATE_SESSION_4.md` before continuing. A source-test pass is not an Android install/security pass.

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

Output: `android/app/build/outputs/apk/debug/app-debug.apk`. The debug certificate is for development only. CI preserves it through a cache where available. A different signing certificate requires uninstalling the existing debug app; export data before that operation. The private release uses a separate protected signing identity.

Private release builds fail closed unless all four signing values are supplied. Keep the keystore and passwords outside Git:

```sh
export KAIROS_RELEASE_STORE_FILE=/absolute/private/path/kairos-release.jks
export KAIROS_RELEASE_STORE_PASSWORD='...'
export KAIROS_RELEASE_KEY_ALIAS='...'
export KAIROS_RELEASE_KEY_PASSWORD='...'
cd android
./gradlew :app:assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`. Verify that exact artifact with Android build-tools `apksigner` before installation. Reuse the same protected keystore for every later update; losing it prevents an in-place upgrade of the installed app.

The GitHub Actions workflow runs source checks, builds/signs a debug APK, runs native encryption and UI tests on an Android 34 emulator, and publishes the APK only after that gate passes. CI evidence is a separate artifact. A newly created destination repository must be accessible to the connected GitHub app before it can receive this source.

Startup timing uses a separate non-debuggable `benchmark` variant that inherits release behavior and uses the CI development key. It is not a private release APK and is not published for installation. The disposable runner removes that fresh benchmark install before running the debug functional journey. A timing failure does not suppress functional evidence, but still fails the combined gate. The runner refuses physical devices and any emulator that already has Kairos installed.

## Native verification

Use a fresh emulator or test install: the tests intentionally create synthetic financial data. They are not intended to run over a real ledger.

```sh
cd android
./gradlew :app:assembleDebug :app:assembleDebugAndroidTest
cd ..
python scripts/run-native-gate.py
```

The separate deletion test intentionally terminates the app using Android's data-clear API; a host verifier checks that app-owned financial files and database have gone. Screenshots and screen recording are not blocked. FLAG_SECURE was removed at the owner's request, because it also stopped him photographing his own screen to report a problem with it; app content is therefore visible in the recent-apps switcher and to screen recorders. The app lock, the encrypted database and the key protection are unaffected.

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
- `ui/screens`: native lock, accounts, import review, manual records, charts, insights, settings and the development-only kitchen sink.
- `ingest`: offline extraction, parser registry, normalization, encrypted staging, reconciliation and review.
- `ledger`: deterministic categorisation, evidence ownership, transfers, recurring costs, net worth and read-only financial analysis.
- `tests`: property, database, privacy and interaction verification. Synthetic data never enters the production import graph.
- `ADR`: rationale for non-obvious choices. `docs/SCHEMA.md` is regenerated from SQL.

Ingest writes staging only until confirmation. Intelligence consumes a read-only ledger view and does not change imported evidence. SQL writes use the serialized transaction boundary; SQLCipher encryption must never fall back to plain SQLite.

## Privacy and recovery

No account, analytics, financial-data network calls or internet permission. A native PIN protects opening the database; optional strong biometrics can be enabled after setup. On background, financial UI and query caches are cleared. A 60-second background interval requires re-authentication on resume.

Reading bank notifications is off until it is switched on, and it is the one capability here with a cost
worth stating plainly. Android has no permission for a single app's notifications: granting notification
access lets Kairos see every notification on the phone, messages included. Two things bound that. The
listener drops anything from an app the owner has not ticked before it is stored, and nothing is ticked by
default, so a grant on its own captures nothing. Captured notices are held in app-private storage rather
than in the encrypted ledger, deliberately: the ledger's key exists only while Kairos is unlocked, and a
notification arriving on a locked phone could not be written there at all. They are a question — "did you
spend this?" — erased once answered, and a purchase becomes a ledger row only after the owner approves it,
as a pending row the statement later supersedes. The question posted to the notification shade is hidden
while the phone is locked. The access is revoked in Android's settings, not here.

Exports contain readable JSON and per-table CSV inside a ZIP and are written to the Android document location explicitly chosen by the user. Keep those files private. Delete all data clears the app's database, files, preferences and keys, then Android closes it. User-created exports outside the app must be deleted separately.

There is no account-based PIN recovery. Kairos displays a recovery code during setup and can export and restore an authenticated encrypted backup. iOS configuration is prepared, but a Keychain/LocalAuthentication vault implementation is still required; there is no insecure fallback.

## Weekly export workflow

Manual file imports are the only v1 data path. Direct bank API integration is outside v1 because its accredited-provider/server architecture does not fit this local-only app. Kairos will never request internet-banking credentials or use credential-scraping aggregators.

Use **Update accounts** from Today or Quick. For each account, copy the displayed date range into internet banking and download OFX/QIF or CSV/XLSX. The range deliberately repeats the last covered week. Choose or drop multiple files, confirm each file's account and dates, review any uncertain columns/rows, then confirm the update. Nothing auto-commits. PDFs and offline scanned statements remain available for historical periods.

Leave stated balances blank for transaction exports. Tier A verifies a statement's stated balances; Tier B verifies running-balance transitions; Tier C checks coverage continuity and is explicitly balance-unverified. A missing internal period is a coverage gap; an old last-covered date is staleness. Today never presents stale imports as current available money.

Pending transactions are retained as commitments. A matching settlement updates the original ID and records its prior values; ambiguous candidates need review. The import result explains additions, already-known transactions and superseded pending rows. An optional local weekday reminder is off by default and skipped while data is fresh. Android may delay delivery; open the app after reboot to restore scheduling.

The app retains the device and visual acceptance established in earlier sessions. The current combined acceptance contract is tracked in `docs/GATE_SESSION_4.md`; Session 4 must remain one integrated candidate until that contract passes.

**Session 2.5 gate: PASS.** 100 source tests, eight native tests and 39 reviewed screenshots. [Regression report](docs/GATE_SESSION_2_5.md) · [Verified workflow](https://github.com/macdarenz-droid/kairos-money/actions/runs/34754456134). Later Session 4 evidence is recorded in the current gate document and CI artifacts.
