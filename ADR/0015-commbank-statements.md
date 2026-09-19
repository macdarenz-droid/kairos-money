# 0015 — CommBank statement layout and import activity

Decision: add a narrowly detected CommBank positional parser ahead of the generic PDF parser. Read column anchors from repeated table headers; collect wrapped transaction lines until the next named date; resolve year from the explicit statement period. Separate opening/closing rows from transactions and preserve CR/DR running balances. Reuse the established verified balance-chain provenance identity, so repeated purchases remain distinct and imported sources remain reversible. Reject missing/conflicting amounts.

Alternative rejected: treating each PDF text line as one transaction or guessing fixed column positions. The observed layout places amounts on later lines and embeds dates/descriptions in a single text item. Westpac and OCR paths are unchanged.

Loading: use a reusable token-based ledger activity primitive with actual extraction-stage text. It is indeterminate, not percentage progress. Yield a render frame before synchronous parsing so the status is visible; retain the existing pdf.js worker and per-page yields. Reduced motion renders a static icon. Long-PDF worker hardening remains in Session 4.

Private input validation is local only; versioned tests contain synthetic rows. Schema unchanged.
