# Restore eligibility after empty-ledger analysis

Decision: restore eligibility ignores derived signals, profiles and insights in addition to the existing categories and app-settings setup tables. All other tables must be empty. The existing transaction validates, removes and restores the complete table set; foreign-key validation and rollback remain mandatory.

Reason: Today computes signals and a still-learning profile immediately after setup. Those rows do not represent imported finances, so their presence incorrectly prevented the intended fresh-installation restore flow.

Alternatives: deleting analysis tables before the transaction could lose data on failure. Disabling Today analysis during setup would couple restore correctness to navigation order. Restricting the guard to accounts alone could overwrite independent goals, staged imports or rules.

Evidence: real-SQLite tests cover exact restore after initial analysis, refusal with a goal but no accounts, and rollback preserving pre-existing analysis after a simulated storage interruption. Android must additionally prove the full picker, reset and restore sequence before milestone acceptance.
