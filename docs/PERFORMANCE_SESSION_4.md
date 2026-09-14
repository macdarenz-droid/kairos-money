# Session 4 performance evidence — incomplete

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
