# 0026 — Expense allocations preserve the original payment

Store category splits in encrypted settings, keyed to the canonical imported transaction id with its original signed amount and currency. Permit 2–10 positive essential/discretionary allocations that sum exactly to a settled, non-transfer imported debit. Retain the source transaction, provenance and coverage unchanged. Manual expenses and credits are outside this editor's current scope.

Snapshot readers apply a saved split only while amount, currency and settled/non-transfer status match. Rollback retains metadata for exact reimport; a changed payment makes the old allocation inactive. Backup and deletion include settings through the existing path. Single-category bulk edits reject split payments until their allocation is removed, preventing conflicting edits.

Keep one transaction for cashflow, recurrence detection, merchant counts and original small-purchase counts. Category charts, category comparison and concentration use exact allocation amounts. Essential/discretionary-dependent signals and the payday curve use each payment's relevant portion; discretionary signals count one discretionary portion per source payment. Source drill-downs show the complete payment and its allocations. No fabricated child ledger transactions or duplicated source evidence.

A user-saved expense allocation is explicit spending context for the observed-spending view. Matched transfers remain excluded. Removing a split restores the single category. Existing gate assertions remain; the combined both-theme native journey adds save/removal evidence. Android execution, remaining refunds/FX/net-worth ownership, accessibility, hardening, performance and private-release acceptance remain OPEN.
