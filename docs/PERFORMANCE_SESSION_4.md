# Session 4 performance evidence — incomplete

Run `npx vitest run tests/performance.test.ts tests/windowed-list.test.tsx --maxWorkers=1` for the synthetic local benchmark. This measures real pure reconciliation and a real Node SQLite snapshot with 20,000 source links, plus the DOM windowing mechanism. It does not measure Android SQLCipher bridge latency, cold start or dropped frames.

Recorded local run (Node 24.19.0): reconciliation 2,846 ms; SQLite snapshot including complete per-transaction provenance 763 ms. The independent jsdom 20,000-row render/scroll check took 261 ms and kept fewer than 20 row elements mounted while reaching the final record. These are diagnostic timings, not device acceptance thresholds.

PDF.js moved out of the initial bundle: approximately 876 KB to 517 KB minified before the later attachment/worker additions. The separate PDF parser chunk was approximately 377 KB. Final exact bundle sizes remain in the production build output; a bundle warning is not suppressed.

Remaining required evidence: Android cold start below two seconds; 20,000-row scrolling/frame times at both normal and 200% text; 40-page PDF import with visible progress and responsive UI; kill mid-import and verify recovery with no partial ledger. Browser reconciliation above 200 rows now runs in a dedicated worker. Small inputs and Node tests use the same pure algorithm.

Fixture correction: the first benchmark used numeric merchant suffixes, which normalization intentionally strips, so it did not describe 20,000 distinct transactions. The fixture now uses distinct alphabetic merchant suffixes, and asserts all 20,000 records and source links survive. No acceptance assertion was reduced.
