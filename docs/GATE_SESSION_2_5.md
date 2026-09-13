# Session 2.5 gate — OPEN

Session 2 is PASS on `282460630e9ae5419f7224b8cf8e63d174334e40`. Its acceptance files remain unchanged and are checked by SHA-256. Session 3 has not started.

| Criterion | State | Evidence |
|---|---|---|
| Sessions 1–2 source regression | PASS | 100 tests pass, including all 78 frozen baseline tests and 10,000 randomized money sequences. Baseline hash assertion passes. Native rerun pending. |
| Mixed-source order independence | PASS | Actual March PDF and three weekly CSV exports through FileSource, review and SQLite commits in all 24 orders; transactions, provenance and coverage identical. |
| Weekly overlap | PASS | Four overlapping export ranges yield 35 unique transactions and one coverage union. |
| Pending supersession | PASS | Changed amount keeps original ID, settled value and audit; rollback restores pending. PDF corroboration tested in all six source orders. |
| Inference | PASS source; native OPEN | Headerless, split debit/credit and six bank fixtures parse. Ambiguous dates require dense in-place mapping; saved mapping signature checked before reuse. Both-theme interaction tests pass. |
| Integrity tiers | PASS source; native OPEN | A statement balances, B checks every transition in both date directions, C commits visibly unverified and reduces data health. |
| Source boundary | PASS | Disabled CdrSource compiles; downstream dependency test rejects parser imports. |
| Freshness | PASS source; native OPEN | Nine-day staleness muted on Today; overlapping export start is last covered date minus six days. Both-theme sheet tests pass. |
| Multi-file review | PASS source; native OPEN | Shared session identity, one update review and atomic commit/rollback tests; Android picker and dropped files supported. |
| Local reminder | PASS source; native OPEN | Off by default; chosen weekday skips fresh data. Native notification delivery/cancel and permission checks added. |
| Both-theme visual review | OPEN | New native screenshots must be inspected. |
| Running APK | OPEN | Native app/test compilation and full CI gate in progress. |

The optional email watcher stays disabled. PDF and OCR remain supported. Export schema 2 remains backward compatible; database_schema_version separately identifies storage schema 3. See ADR 0005–0007.

## Candidate history

Run 34753760017 (b8d9114) passed 100 source tests, native foundation and unchanged import checks, and the revision UI assertions. Notification delivery passed; immediate cancellation observation failed because Android removal is asynchronous. The next test waits up to five seconds for zero active notifications. Screenshot review accepted mapping, result, staleness and update sheets in both themes; the dark Tier C capture raced the review query (it saw an older coverage label behind the sheet). The next capture waits for the dialog’s own loaded review and enabled commit button. Grouped dropped-file review is added to native coverage.
