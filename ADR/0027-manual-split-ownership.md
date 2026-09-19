# ADR 0027 — Manual expense split ownership

Manual settled expenses use the same exact category allocation format as imported expenses, keyed to their stable projected transaction identity. The manual-history editor is available before matching. Amount changes make mismatched allocations inactive; changing the single category requires removing the split first.

An explicit match copies a valid manual split onto the imported payment inside the existing matching transaction. Different destination allocations require review instead of silent replacement. Validation and writes share one database transaction (no nested driver transaction). The original manual allocation remains for rollback; the imported copy becomes independently editable from its source sheet. Unmatching intentionally restores a separate payment. Deleting a manual record deletes only its allocation, preserving the imported payment and its allocation. Matched manual records direct editing to the statement; remove saved matches to edit a restored manual record after rollback.

No transaction amount, statement provenance or coverage is modified by allocations. Income and transfers cannot receive expense allocations. Backup uses existing encrypted settings. Tests exercise exact conservation, matching, conflict rollback, source rollback/reimport, backup, deletion, stale amounts and both-theme manual-history entry. Android journey added to the combined gate; native execution remains open.

The alternative of moving the only allocation record to the import was rejected because source rollback would lose the user's manual categorisation. Automatically merging different splits was rejected because it would invent allocation intent.
