# User category edits after import

Confirmed category changes are stored independently under encrypted app_settings keys category-edit:<canonical-transaction-id>. Original import documents, money, fingerprints and transaction_sources are not edited. Rebuilding committed contributions replays a category override only when its canonical transaction exists. Rolling back the last source removes the transaction; reimporting restores the user's category. Backup, export and deletion already include the metadata.

Bulk changes validate the complete selection before writing, inside one database transaction. Missing rows reject the operation. Matched transfers retain their transfer classification. Manual transactions use their existing editor. The UI caps a selection at 1,000 imported rows, paginates the selection view, and requires a save action. Clearing a category must remain visibly uncategorised, including when the source supplied a category.

Alternatives rejected: changing original statement payloads would obscure provenance; applying a merchant rule alone would change unrelated purchases; adding transaction copies would corrupt totals. Splits and refunds require their own amount-conserving provenance model and are not implemented by category overrides.
