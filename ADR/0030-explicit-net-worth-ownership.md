# ADR 0030 — Explicit ownership for combined net worth

Combined net worth uses the latest manually recorded value for each holding plus the latest committed Tier A statement closing balance for each imported account the user explicitly includes. Every active account starts in review and must be included or excluded per currency. A selected imported balance with a missing or rolled-back reconciled closing is disclosed as incomplete and contributes nothing until verified evidence returns.

Manual holdings may identify the imported account they represent. One account can be represented by at most one manual holding, its currency must match, and an included imported balance cannot also have a linked manual holding. Both directions are checked transactionally. These rules prevent double counting without guessing whether a named asset and an account are the same money.

Positive imported closings contribute to assets and negative closings to liabilities. The current combined position discloses its latest contributing date and that source dates can differ. Manual holdings retain their dated step history separately. Statement closings are not projected beyond their source date and later transactions are not inferred into an unsupported live balance.

Valuations and account choices remain encrypted settings included in the existing backup, restore and deletion paths. Import rollback keeps the user's choice but removes the unverified balance from the total; an exact reconciled reimport can make it eligible again. No transaction, source, category, balance anchor or coverage row is changed.

Tests cover signed asset/liability totals, explicit review completion, backup/restore, unverified and rolled-back statements, currency and ownership conflicts, source-row immutability, and both-theme interaction. Native ownership capture is added to the combined journey and remains unrun until the full Session 4 gate.
