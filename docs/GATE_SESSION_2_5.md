# Session 2.5 gate — PASS

Session 2 is PASS on `282460630e9ae5419f7224b8cf8e63d174334e40`. Its acceptance files remain unchanged and are checked by SHA-256. Session 3 has not started.

| Criterion | State | Evidence |
|---|---|---|
| Sessions 1–2 source regression | PASS | 100 tests pass, including all 78 frozen baseline tests and 10,000 randomized money sequences. Baseline hash assertion passes. All eight native tests pass. |
| Mixed-source order independence | PASS | Actual March PDF and three weekly CSV exports through FileSource, review and SQLite commits in all 24 orders; transactions, provenance and coverage identical. |
| Weekly overlap | PASS | Four overlapping export ranges yield 35 unique transactions and one coverage union. |
| Pending supersession | PASS | Changed amount keeps original ID, settled value and audit; rollback restores pending. PDF corroboration tested in all six source orders. |
| Inference | PASS | Headerless, split debit/credit and six bank fixtures parse. Ambiguous dates require dense in-place mapping; saved mapping signature checked before reuse. Both-theme interaction tests pass. |
| Integrity tiers | PASS | A statement balances, B checks every transition in both date directions, C commits visibly unverified and reduces data health. |
| Source boundary | PASS | Disabled CdrSource compiles; downstream dependency test rejects parser imports. |
| Freshness | PASS | Nine-day staleness muted on Today; overlapping export start is last covered date minus six days. Both-theme sheet tests pass. |
| Multi-file review | PASS | Shared session identity, one update review and atomic commit/rollback tests; Android picker and dropped files supported. |
| Local reminder | PASS | Off by default; chosen weekday skips fresh data. Native notification delivery/cancel and permission checks added. |
| Both-theme visual review | PASS | All 12 revision screenshots reviewed: mapping, Tier C, results, stale Today, update sheet and grouped review in light and dark. |
| Running APK | PASS | Tested signed debug APK from run 34754456134; downloaded archive hashes and APK signature verified. |

The optional email watcher stays disabled. PDF and OCR remain supported. Export schema 2 remains backward compatible; database_schema_version separately identifies storage schema 3. See ADR 0005–0007.

## Candidate history

Run 34753760017 (b8d9114) passed 100 source tests, native foundation and unchanged import checks, and the revision UI assertions. Notification delivery passed; immediate cancellation observation failed because Android removal is asynchronous. The next test waits up to five seconds for zero active notifications. Screenshot review accepted mapping, result, staleness and update sheets in both themes; the dark Tier C capture raced the review query (it saw an older coverage label behind the sheet). The next capture waits for the dialog’s own loaded review and enabled commit button. Grouped dropped-file review is added to native coverage.


## Final evidence — 13 September 2026

Accepted code: `4c5ef38bfaf563aa527a0753233a9adafb1e3582`. [Full workflow](https://github.com/macdarenz-droid/kairos-money/actions/runs/34754456134) PASS: 100 source tests, all frozen Session 2 acceptance hashes, Android build/lint/signature, eight native tests (foundation 2, import/OCR 2, revision 2, export/delete 1, post-delete setup 1). Four offline OCR outputs pass production parser checks. Real document export passes; complete deletion reduces 94 app-owned files to zero. One-second background resume retains unlock; 61 seconds locks.

Run 34753874973 exposed the complementary notification delivery race: Android queued the notification, but the immediate assertion failed before it became active and cleanup cancelled it. The accepted test waits for notification 250 on the account-updates channel, verifies its title, and waits for cancellation. Production reminder behavior is unchanged by this test repair.

All 12 final revision images show the intended screen and theme without system overlays. Tier C explicitly says balance unverified; Today shows nine-day staleness on a muted surface; the sheet requests 29 August–13 September for last coverage 4 September, deliberately overlapping seven covered days. Grouped review shows both files and one confirmation. The supplied K logo is visible in both themes.

APK SHA-256: `5e1b640c2e52e36c7ed4e7f93342a606697c5e18f3aa03ec46fc6f556adde59a`.
APK artifact archive SHA-256: `61860792b3ae5cc7730436f34d6d8acbd62aef1e32ad5a39f7089f806551b63e`.
Evidence artifact archive SHA-256: `a879338cedaeffeecaf5fb1787a222617ac91d03510d5f11ee19b40f8e74ab3b`.

This is an Android 34 emulator-verified debug build. Release signing and wider physical-device testing remain later work. Session 3 has not started.
