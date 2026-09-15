# Statement metadata and repeated transaction evidence

Decision: the file source reads explicitly labelled statement periods and balances before asking for corrections. The Westpac Choice positional adapter joins wrapped descriptions and reads amounts by header alignment, across repeated page headers. Unknown layouts retain the existing actionable fallback. Inspection and extraction share one cached read.

Repeated purchases can have identical account/date/amount/merchant fingerprints. For this adapter, only a complete ordered running-balance chain from the stated opening to closing qualifies rows for a stable balance occurrence discriminator. File names and page/row positions are not transaction identities. A broken chain cannot create this evidence. Repeated identical balance occurrences remain ambiguous.

Across sources, equal running balances can corroborate a unique reciprocal candidate. Missing balances do not resolve multiple possible matches. Independently balanced statement entries do not prompt duplicate review merely because the merchant, amount and nearby dates repeat. Explicit duplicate decisions remain subject to every affected statement's balance check. Rollback retains other sources.

Alternatives rejected: summing duplicate fingerprints blindly; assigning per-file row identities; silently trusting every extracted row; disabling reconciliation. These either lose purchases, duplicate overlap, or accept incomplete extraction.

Category uncertainty is separate from extraction uncertainty. An explicit review action can leave only category-only suggestions unassigned. It cannot approve uncertain amounts, dates, collisions or duplicate matches. Final transactional confirmation is still required before history changes. No schema migration is needed; the existing occurrence field and provenance retain the evidence.

Verification: synthetic wrapped multi-page layout, metadata rejection cases, repeated purchases, overlapping provenance in both orders, idempotence, rollback, ambiguous export corroboration, unsafe extraction refusal, and both-theme read-to-confirm interaction tests. The reported real document was also checked privately; it and its contents are excluded from source control.
