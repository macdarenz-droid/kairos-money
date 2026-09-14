# Session 4 performance evidence — incomplete

## Measured: the cost is the read, not the render

Run 34875373780 split the load into phases:

| phase | ms |
|---|---|
| tab_open | 22 |
| first_row | 52,310 |
| search_entered | 52,473 |
| total | 52,491 |

The data read is 99.7% of it. Reading a window instead of the whole ledger:

| measurement | before | after |
|---|---|---|
| local 20,000-row workspace | 679 ms | **101 ms** |
| local window at offset 19,800 | n/a | **75 ms** |
| rows crossing the bridge per open | ~40,000 | ~400 plus counts |

Deep windows cost the same as the first, so scrolling does not regress; the benchmark asserts it. Native measurement of the repair is still required.

## What holds the full ledger array, if the bridge is confirmed

Scoped while the phase-split run executed, so the repair can start immediately rather than begin with this survey. Four consumers in `ImportWorkspace` hold all 20,000 rows, and none of them needs the whole array:

| Consumer | Needs | Served instead by |
|---|---|---|
| `filtered` into `WindowedList` | the rows actually on screen, about sixteen | a paged read that applies the search term and ordering in SQL |
| `rows.length` gating "Change categories" | a count | `SELECT COUNT` |
| `Coverage` → `dataHealth(rows.filter(by account))` | a per-account aggregate | an aggregate query per account, not row transfer |
| `BulkCategories rows={rows}` | its own filtered set, already capped at 1,000 | its own bounded query |

The search currently runs in JavaScript over the whole array, so moving display to a paged read means the search term moves into SQL with it. That is the substance of the change, and it is why this is a real refactor rather than a constant to tune.

Not started: the bridge hypothesis is unconfirmed until `first_row_ms` lands. Beginning a four-consumer refactor on an unconfirmed hypothesis would repeat the keyset mistake at considerably higher cost. The existing workspace contract tests, which assert the returned ledger's contents, must keep passing or be extended deliberately rather than relaxed.

## Local elimination while the phase-split run executed

Two of the three candidate phases were ruled out locally, so the phase evidence has less to decide.

`WindowedList` at ledger scale, rendered in jsdom: mount **6 ms** and re-render **2 ms** at 20,000 rows, measured at 5,000/10,000/20,000 with the same inline `id` callback `ImportWorkspace` passes, which changes identity every render and invalidates the offsets memo. Rebuilding a 20,001-element offsets array is simply cheap, and `MeasuredRow` only measures the at most 40 mounted rows, not all 20,000. The renderer is not the cost. (Caveat: jsdom performs no layout, so `getBoundingClientRect` and `ResizeObserver` do not fire; the bounded row count means that cannot account for 52 s either.)

`ImportWorkspace`'s `filtered` is a single O(n log n) filter and sort, memoized on `[rows, search]`. At 20,000 rows that is tens of milliseconds.

What remains is the one link that exists on the device and not locally: transferring roughly 40,000 rows — 20,000 transactions and 20,000 provenance records — across the Capacitor SQLite bridge in about 85 responses of 256 rows. It also explains the earlier document-reconciliation path measuring 58,954 ms: that moved one 20,000-row JSON document across the same bridge. Every read strategy tried so far moves a large payload over it, which is why none of them moved the number.

If `first_row_ms` holds most of the total, that is confirmed, and the repair is to stop loading 20,000 rows to display about sixteen rather than to change the SQL again.

## The native Ledger cost is not in the data layer

Three different read strategies, one native figure:

| Read strategy | Run | 20,000-row Ledger |
|---|---|---|
| Full document reconciliation per read | 34853883508 | 58,954 ms |
| Materialized transaction/provenance reads | 34868920857 | 52,426 ms |
| Keyset-paged materialized reads | 34871468723 | 52,390 ms |

Budget is 10,000 ms. Replacing the entire read strategy twice moved the number by about 11% and then by 36 ms, so the cost is not in the read. Local figures improved genuinely over the same changes (workspace 679 ms to 381 ms, snapshot 468 ms to 305 ms), which is why local measurement alone could not find this.

The measured window spans tab open, data read across the Capacitor bridge, search entry and virtualization as a single number. It is now split into `tab_open_ms`, `first_row_ms` and `search_entered_ms` alongside the unchanged `ledger_load_ms` in `docs/evidence/ledger-20000.json`, so the next run identifies the phase instead of inviting another hypothesis. The 10-second assertion and every other check in that class are unchanged.

## Keyset ledger paging

Run 34868920857 measured the 20,000-row Ledger at **52,426 ms** against a 10,000 ms budget, barely below the 58,954 ms of the last green run. The cause was OFFSET paging in `queryPages`, which is O(rows squared / page) and re-decrypts every rescanned row on the encrypted device database.

Local paging cost at page 256, by strategy and row count:

| rows | OFFSET | keyset |
|---|---|---|
| 10,000 | 26 ms | 10 ms |
| 20,000 | 91 ms | 19 ms |
| 40,000 | 365 ms | 40 ms |

OFFSET quadruples per doubling; keyset doubles. After the change the local 20,000-row workspace is **381 ms** (from 679 ms) and the intelligence snapshot **305 ms** (from 468 ms), with the 256-row native response budget unchanged. Native load and frame timings still require device measurement.

## Materialized-ledger scope repair

Candidate `a7f34a0` failed run **34859716515** functionally, not on timing: the unscoped materialized read raised "Stored transaction evidence is incomplete" and emptied the Ledger. Scoping both reads to batches holding a staged source document restores it.

The scope is resolved once per load. Per-row alternatives were measured on the same machine against a **666 ms** unscoped baseline: correlated `EXISTS` **824 ms**, direct `JOIN` **890 ms**, non-correlated `IN` **4,467 ms**. Resolving it once costs about **700 ms** (679, 690, 699, 716, 744 ms), roughly 5% over baseline and well inside the 5-second source ceiling. The 10-second combined Android budget is untouched. Device load and frame timings still require measurement.

## Green full journey and materialized-ledger repair

Run **34853883508**, candidate **00d17faf**, passed the complete Android journey and cleanup. Startup passed at **1,695 ms median** and **1,977 ms fresh install**. The 40-page PDF completed in **3,972 ms** with visible progress, WebView responsiveness and activity-recreation continuity.

Its 20,000-row report recorded **58,954 ms** Ledger load. At 100%/200% text, the virtual list mounted at most **16 / 10** rows and reached the final record, but raw programmatic-scroll intervals averaged approximately **97.64 / 92.50 ms**, with p95 approximately **183.34 / 166.67 ms**. A green functional class does not make those timings acceptable.

The continuation replaces ordinary Ledger reconstruction from the full original document with paged reads from the committed materialized transaction and source-provenance tables. Import review and correction still use the validated original evidence. Today/coverage reads use compact batch summaries. Row-height observations are applied once per animation frame rather than once per newly mounted row. The latest local complete 20,000-row workspace reads in **603 ms** on Node 24.19.0 and must remain below **5,000 ms**. The Android test now requires Ledger load below **10,000 ms** and still records raw scroll intervals at both text sizes. Replacement Android measurements remain required.

## Latest reviewed measurements and repair

Run **34847174081**, candidate **2a32c37**, completed 20,000-row traversal at 100% and 200% text with **16 / 10** maximum mounted rows and 120 raw frame intervals each. Ledger load was **62,376 ms**; mean intervals **110.97 / 104.58 ms**, maxima **316.67 / 333.33 ms**. The class failed in fixture cleanup, after writing its complete measurement report. These results establish reachability, not acceptable scrolling performance.

Startup raw samples were **2,152 / 2,073 / 1,333 ms**; the independently computed median **2,073 ms** exceeds the unchanged two-second limit. The old runner omitted the aggregate when UI Automator failed after dumping a hierarchy. Readiness now retries only its own probe within 30 seconds, verifies fresh complete XML, and records every attempt. Three measured cold launches are never resampled; their timing verdict survives a readiness failure.

The replacement bounds each cleanup transaction to 256 rows, records per-table removal timings and errors, and checks exact removed counts, foreign keys and the pre-fixture user-row count. The original 30-second operation and 360-second instrumentation bounds remain. The product loads source documents once per Ledger refresh and reuses currency formatter configurations across row renders. No native timing improvement is claimed before the replacement runs.

Evidence: `docs/evidence/session4-gate-34847174081.json`. The prior memory repair enabled the scroll measurements; individual large text fields are still not byte-chunked. Native performance acceptance remains OPEN.

## Previous reviewed Android measurements

Green run **34839763247**, candidate **a6a9c41**: non-debuggable benchmark cold samples **1,833 / 1,574 / 1,575 ms**, median **1,575 ms**, fresh install **1,833 ms**. Both unchanged startup limits pass. A 40-page PDF extracted in **2,842 ms** with visible progress and responsive WebView. Its staged file survived activity recreation before extraction. This does not prove process death during extraction or commit.

The integrated continuation adds `LedgerPerformanceInstrumentedTest`: 20,000 distinct synthetic transactions and source links in the real SQLCipher database, production import ledger read, fewer than 41 mounted rows, middle/final-row reachability at 100%/200% text, and 120 raw requestAnimationFrame intervals while scrolling each size. The fixture is generated only into instrumentation assets and removed from the device ledger afterward. Frame intervals describe programmatic WebView scrolling on the emulator; they require review and are not a physical-device FPS claim. The test has now produced traversal/frame evidence above; its cleanup failure prevents a full class PASS.

## Earlier local measurements

Run `npx vitest run tests/performance.test.ts tests/windowed-list.test.tsx --maxWorkers=1` for the synthetic local benchmark. This measures real pure reconciliation and a real Node SQLite snapshot with 20,000 source links, plus the DOM windowing mechanism. It does not measure Android SQLCipher bridge latency, cold start or dropped frames.

Recorded local run (Node 24.19.0): reconciliation 2,846 ms; SQLite snapshot including complete per-transaction provenance 763 ms. The independent jsdom 20,000-row render/scroll check took 261 ms and kept fewer than 20 row elements mounted while reaching the final record. These are diagnostic timings, not device acceptance thresholds.

PDF.js moved out of the initial bundle: approximately 876 KB to 517 KB minified before the later attachment/worker additions. The separate PDF parser chunk was approximately 377 KB. Final exact bundle sizes remain in the production build output; a bundle warning is not suppressed.

Remaining required evidence: acceptable Android 20,000-row load/scroll performance and successful cleanup; kill during active import and verify recovery with no partial ledger. Cold start and 40-page extraction/progress are now measured above. Browser reconciliation above 200 rows now runs in a dedicated worker. Small inputs and Node tests use the same pure algorithm.

Fixture correction: the first benchmark used numeric merchant suffixes, which normalization intentionally strips, so it did not describe 20,000 distinct transactions. The fixture now uses distinct alphabetic merchant suffixes, and asserts all 20,000 records and source links survive. No acceptance assertion was reduced.
