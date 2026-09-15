# ADR 0028 — Recorded original-currency evidence

The source transaction sheet accepts an original positive amount, supported currency different from the account currency, and a required source note. The user must read the statement or receipt; no ambiguous free-text currency is guessed. Both posted debits and credits are supported. Pending and zero rows cannot be saved.

Store this user-owned evidence in encrypted settings keyed to the canonical transaction identity, including signed posted amount and currency. Ingest rebuilds canonical transactions, so writing only the reserved transaction FX columns would lose edits on reconciliation. Retain metadata across rollback and activate it again only when the settled transaction and posted values match. Backup includes settings. No account amount, source evidence, fee or coverage is rewritten.

The implied rate is the absolute posted major-unit amount divided by the original major-unit amount. Store exact amounts and derive an integer rational; show half-up rounding to six decimals with an explicit approximation label. Currency minor-unit scales matter (JPY zero decimals, KWD three). The ratio can include costs within a posted amount and is not a live or fee-free rate. Do not apply it to other payments or cross-currency totals.

Tests cover conservation, immutable source evidence, backup/rollback/reimport, inactive changed amounts, invalid edits, zero/three-decimal currencies, credits and both-theme editing/removal. Native source-sheet capture is added to the combined journey but remains unrun. Automatic original-amount extraction and broader financial analysis remain separate work; this closes the missing manual storage/editing path only.
