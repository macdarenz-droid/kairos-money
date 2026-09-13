# Session 2.5 — Export-first ingestion, source adapters, freshness loop

User revision accepted 2026-09-13. Insert after the Session 2 PASS gate and before Session 3. Session 2 is still in progress; this document records the next session, not a claim that it has started or passed. Keep every Session 2 PDF/OCR parser and acceptance test intact. No intelligence work until this revision passes.

## Product decision

Manual files are the only v1 data path. Prefer on-demand weekly internet-banking exports over waiting for monthly statements. Preference: OFX/QIF, CSV/XLSX, PDF text, scanned PDF/OCR. When an export and a PDF overlap, prefer export fields and retain PDF corroboration/provenance. Historical PDF imports remain supported.

No direct bank API in v1. The user ruled out Australian CDR integration because its accreditation/principal and accredited-system requirements conflict with this project's no-server architecture. This records the supplied product rationale; it is not an independent legal assessment. Credential-based netbank scraping aggregators are permanently excluded.

## Design constraint — latest revision

All new UI follows the existing Linear / Vercel / Height tokens and primitives. No new colours, radii or type sizes. Extend the primitive set where needed rather than styling individual screens locally.

- Column mapping is a dense data view, not a wizard: show raw file rows and assign columns in place; tabular numerals, hairline borders, right-aligned amounts.
- Update accounts is one sheet containing accounts, staleness and export ranges, not a full-screen takeover.
- Today staleness is a muted surface state, never a warning banner or coloured alert.
- Results use plain sentences without confetti, celebration or success animation.
- Sentence case; no all-caps labels, eyebrows, appended arrows or card drop shadows. Verify every new screen in both dark and light themes before completion.

## Required work

1. Add `ingest/sources/TransactionSource`: identity, date-bounded/balance-authoritative/pending-aware capabilities, and fetch returning a common normalized shape. FileSource wraps detect/extract/parse. CdrSource conforms, compiles, is feature-flagged off and throws “not available in this build”; no auth, API calls or credentials. Downstream normalization/staging/reconciliation/review/commit consumes the source output, not file parsers. ADR and dependency test must prove the boundary.
2. Build shape inference first, then dedicated CommBank NetBank and Westpac Online fingerprints as fast paths. Do not assume column positions. Handle headerless files, signed or separate debit/credit, optional running balance and ambiguous dates. Show mapping UI below confidence threshold and persist confirmed mapping per issuer. Each bank gets three synthetic shapes including headerless, separate debit/credit and no balance.
3. Record per-batch integrity: Tier A stated opening/closing reconcile (statements); Tier B every running-balance step reconciles; Tier C no balances, date-range continuity/overlap checked, explicitly unverified. Tier C is usable, never falsely balance-verified. Display tiers in coverage and weight data health accordingly.
4. Promote transaction status to pending/settled. Settled supersedes matching pending: same account and currency, same amount, ±3 days, merchant similarity ≥0.9. Preserve pending ID, update fields and retain audit history. Changed amounts (tips, FX, fuel pre-authorisation) must update rather than duplicate; ambiguous matches require review. Pending is excluded from historical settled analytics but included in safe-to-spend commitments.
5. Update accounts flow from Quick and stale Today: per-account last covered date and days stale; exact plain-language export range overlapping the previous covered week; accept multiple files as one reviewable session; human-readable added/already-known/superseded summary. Optional local weekday reminder, off by default and suppressed when fresh. Today shows per-account as-of dates and a muted stale state when newest account is over seven days stale.
6. Optional email-attachment ingestion stays off. Only attempt after all required gates pass with time remaining; watch only a user-nominated folder and queue for normal review, never auto-commit. Do not add it merely to fill a stub.

## Acceptance gate

| Criterion | Required evidence |
|---|---|
| Session 2 regression | Every Session 2 acceptance test passes unmodified; report alongside new tests. |
| Mixed-source order independence | March PDF plus three weekly March CSV exports: all 24 orders yield identical canonical ledger state. |
| Weekly overlap | Four weekly exports overlapping by seven days: no duplicates and one contiguous coverage union. |
| Supersession | Pending amount changes at settlement: one settled transaction, original ID and auditable history. |
| Inference | Headerless and separate debit/credit parse without input; ambiguous fixture opens mapping UI. |
| Integrity tiers | Tier C commits, visibly unverified, with reduced data health confidence. |
| Adapter | Disabled CdrSource compiles; dependency test proves no downstream file-parser imports. |
| Freshness | Newest account nine days stale: Today muted/stale, exact overlapping export dates shown. |

Output: runnable APK; Sessions 1–2 plus revision regression report; updated SCHEMA.md; source boundary and integrity-tier ADRs; HANDOFF.md. No Session 3 implementation until PASS.

## Carry-forward changes

Session 3: signals respect integrity tiers and gaps; largely Tier C inputs reduce confidence and insights disclose that. Exclude pending transactions from historical signals. Preserve the original research and no-shame constraints.

Session 4: charts distinguish internal coverage gaps from a stale live edge. Money Fingerprint based on an incomplete month is labelled provisional. Preserve the original accessibility, performance and release gates.

README must retain the no-bank-API decision and the weekly overlap/export workflow.
