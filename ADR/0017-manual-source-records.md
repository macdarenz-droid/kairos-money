# Manual source records

Decision: retain manual input independently from the live transaction projection. Use the existing encrypted source envelope tables with an explicit `manual-entry-v1` discriminator and `__manual__` payload; these are not statement files and establish no coverage or balance authority. No storage migration is required.

Alternatives: direct transaction-only writes lose edits during source rebuilds; automatic same-amount matching risks erasing distinct purchases; a new source-table migration is cleaner naming but expands the established backup/restore contract unnecessarily for this representation.

Expense and income create one exact-integer leg. Same-currency transfers create equal/opposite legs atomically, excluded from spending/income. Editing, deleting and explicit matching are transactional. Imported records are never modified by manual matching. Links retain source identity and canonical transaction identity so corroboration survives rollback; losing every supporting source restores the manual projection. A statement match requires same account, exact amount, settled status and dates within three days; transfer matches also require imported transfer classification. The user confirms identity.

Unresolved possible matches are disclosed in Ledger/Today and prevent verified safe-to-spend. Manual input alone never establishes complete statement coverage. Backup/export/delete retain the canonical envelope and source links. Source tests cover preservation, rollback, duplicate-match refusal and encrypted backup; Android and visual acceptance remain explicit gate items.
