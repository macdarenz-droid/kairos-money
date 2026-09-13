# Kairos Money Tracker — Session 2 in progress

## State

Session 1 PASS. Session 2 OPEN pending its final native import/OCR gate and screenshot review. Session 2.5 is accepted and recorded, but cannot begin before Session 2 PASS. Do not start Session 3.

Repository: `macdarenz-droid/kairos-money`. Active local source: `/workspace/scratch/4b0b7f8b9437/kairos-money`, branch `codex/session2-import`. The GitHub connector and local Git have different commit IDs; always use the current remote head as the parent of connector commits.

## Built this session

- Pure detection, CSV/OFX/QIF/positional parsers, date/sign/merchant normalization, exact balance quarantine, fingerprint/near-duplicate reconciliation, coverage union/gaps and deterministic source provenance.
- Real SQLite staging, atomic commit and batch rollback. Entire selected files are encrypted in reserved staging rows until extraction. Normalized documents remain staged after commit to preserve contributions. Correction-created rules become live only on commit and are removed on batch rollback.
- pdf.js legacy build with bundled worker, positional page stitching, safe XLSX XML extraction preserving decimal strings, and a Capacitor-native bundled ML Kit OCR bridge. No INTERNET permission, no model download, no server parsing.
- Actual Android file picker; per-file account/date/balance confirmation; manual column mapping; uncertain row and payslip corrections; explicit review; ledger search/source detail; rollback; coverage map and data health.
- Payslip labels, net-pay linkage, pay-cycle detection, exact take-home/tax ratios and net-pay distribution/variability. Payslips never create a second salary transaction or bank coverage.
- Synthetic fixtures: three layouts per bank account class and payslip, real PDFs, page breaks and four scanned images/image-only PDFs. No fixtures enter production assets; Android instrumentation owns its test assets separately.

## Evidence and continuation

`docs/GATE_SESSION_2.md` is authoritative. Source tests cover all six import orders (15 randomized amounts), overlap, idempotence, balance quarantine, transfers, middle rollback, interrupted commit, pending-to-posted review, payslip linking, formats/golden files and both-theme import UI. Android app and instrumentation compile and lint; actual device gate and screenshots remain to be verified.

1. Finish `npm run check` and ensure generated SCHEMA/CONTRAST/tokens match.
2. Publish source and run `.github/workflows/android.yml`, including `ImportInstrumentedTest` between foundation and export/delete checks.
3. Inspect all four native OCR scans and file-picker → staging → review → commit → rollback evidence, then review new dark/light screenshots. Fix any failure without changing expected behavior to hide it.
4. Deliver the tested signed debug APK and mark Session 2 PASS only with exact evidence. Preserve its acceptance tests unmodified from that point onward.
5. Implement `docs/SESSION_2_5.md` next. The latest revision adds explicit design constraints: in-place dense mapping, one Update accounts sheet, muted staleness and plain result sentences using existing primitives. Then run its regression/mixed-source/supersession/inference/tier/freshness gate before Session 3.

## Known scope and deferred work

Session 2 requires stated opening/closing balances; no-balance exports, headerless/issuer inference, remembered mappings, source hierarchy and adapters, audited changed-amount supersession, weekly freshness and reminders are the mandatory Session 2.5 revision. PDF/OCR remains supported throughout. Direct bank APIs are out of v1; credential scraping is permanently excluded. Optional email ingestion stays off unless every required revision gate passes first.

Transfer automation requires explicit transfer evidence plus a unique reciprocal candidate; ambiguous matches remain visible rather than excluding unrelated purchases. Repeated identical purchases require consistent confirmed occurrence identity across overlaps. Canonical order independence refers to sorted logical ledger/source state, not SQLCipher bytes or import timestamps.

Intelligence, research catalogue, forecasts, fingerprint/charts, release signing, broader device/biometric compatibility and Session 4 performance/accessibility remain deferred. Session 3 must respect integrity tiers and gaps and exclude pending history; Session 4 distinguishes gaps from staleness and labels partial-month fingerprints provisional.
