# Kairos Money Tracker — Sessions 1–2.5 PASS; AI assistant patch

## State

Sessions 1–2 PASS. Session 2 passed on commit 282460630e9ae5419f7224b8cf8e63d174334e40, workflow 34752125659: 78 source tests, six native tests and 27 reviewed screenshots. Session 2.5 passed on commit 4c5ef38bfaf563aa527a0753233a9adafb1e3582, workflow 34754456134: 100 source tests, eight native tests and all 39 screenshots reviewed, including 12 new screens in both themes. The user authorized an optional AI assistant extension; the full research-backed Session 3 profile remains future work.

Repository: `macdarenz-droid/kairos-money`. Active local source: `/workspace/kairos-money`; the assistant patch is proposed from a separate branch. The GitHub connector and local Git have different commit IDs; always use the current remote head as the parent of connector commits.

## Built this session

- Pure detection, CSV/OFX/QIF/positional parsers, date/sign/merchant normalization, exact balance quarantine, fingerprint/near-duplicate reconciliation, coverage union/gaps and deterministic source provenance.
- Real SQLite staging, atomic commit and batch rollback. Entire selected files are encrypted in reserved staging rows until extraction. Normalized documents remain staged after commit to preserve contributions. Correction-created rules become live only on commit and are removed on batch rollback.
- pdf.js legacy build with bundled worker, positional page stitching, safe XLSX XML extraction preserving decimal strings, and a Capacitor-native bundled ML Kit OCR bridge. OpenAI chat completions support natural-language ledger questions and per-transaction category suggestions when configured in Settings. The API key is kept in encrypted Android preferences; ledger queries and money calculations remain local.
- Actual Android file picker; per-file account/date/balance confirmation; manual column mapping; uncertain row and payslip corrections; explicit review; ledger search/source detail; rollback; coverage map and data health.
- Payslip labels, net-pay linkage, pay-cycle detection, exact take-home/tax ratios and net-pay distribution/variability. Payslips never create a second salary transaction or bank coverage.
- Synthetic fixtures: three layouts per bank account class and payslip, real PDFs, page breaks and four scanned images/image-only PDFs. No fixtures enter production assets; Android instrumentation owns its test assets separately.

## Evidence and continuation

`docs/GATE_SESSION_2.md` is authoritative. Source tests cover all six import orders (15 randomized amounts), overlap, idempotence, balance quarantine, transfers, middle rollback, interrupted commit, pending-to-posted review, payslip linking, formats/golden files and both-theme import UI. Android app and instrumentation compile and lint; Session 2 device gate and screenshots are verified. Session 2.5 native assertions and all 12 new screenshots are verified; docs/GATE_SESSION_2_5.md records the regression results and APK hashes.

1. Sessions 1, 2 and 2.5 are complete. The verified debug APK includes the approved K logo.
2. Preserve the acceptance baseline in `docs/SESSION_2_BASELINE.json` unmodified.
3. Source boundary, integrity-tier and supersession decisions are in ADR 0005–0007; schema is current.
4. The requested assistant patch partially implements user-facing AI and deterministic forecasting. Full Session 3 research, twelve validated signals and profiles remain future work. Carry integrity/gap/pending constraints forward.

## Known scope and deferred work

Session 2.5 adds no-balance exports, headerless/issuer inference, remembered mappings, source hierarchy and adapters, audited changed-amount supersession, weekly freshness and reminders. Native and visual evidence passed. PDF/OCR remains supported throughout. Direct bank APIs are out of v1; credential scraping is permanently excluded. Optional email ingestion stays off unless every required revision gate passes first.

Transfer automation requires explicit transfer evidence plus a unique reciprocal candidate; ambiguous matches remain visible rather than excluding unrelated purchases. Repeated identical purchases require consistent confirmed occurrence identity across overlaps. Canonical order independence refers to sorted logical ledger/source state, not SQLCipher bytes or import timestamps.

The research catalogue, full twelve-signal behavioural profile, archetypes, fingerprint/charts, release signing, broader device/biometric compatibility and Session 4 performance/accessibility remain deferred. This patch's 30-day cash-flow estimate is not the full Session 3 forecast engine. Session 3 must respect integrity tiers and gaps and exclude pending history; Session 4 distinguishes gaps from staleness and labels partial-month fingerprints provisional.

## Current assistant patch

`docs/AI_ASSISTANT.md` describes optional OpenAI setup, transaction category requests, read-only natural-language ledger questions, recurring/unusual-payment signals and the basic cash-flow outlook. TypeScript typecheck, lint and production web build pass. Android compilation could not be checked because the Gradle distribution download was refused in this environment. Tests were not run.

The full native status, deletion result, artifact IDs and all 39 screenshot SHA-256 hashes are recorded in `docs/evidence/session-2.5-final.json`.
