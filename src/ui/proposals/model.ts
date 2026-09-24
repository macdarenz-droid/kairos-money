/** The only metric a proposal cites now that the analysis engine is gone (ADR 0046). */
type MetricKey = 'merchant_breakdown';

/**
 * A typing-free prefill offered from what the user already entered or imported.
 *
 * A proposal is form state, never a committed record. Save still commits and still confirms, so "one tap"
 * means one selection without typing, not a skipped confirmation. `evidence` and `source` mean the user can
 * always ask why something is offered and get an answer from their own ledger.
 *
 * It deliberately carries no statement about the user's behaviour: that is what Observation is for, and the
 * two do not merge. A proposal helps with data entry the user has already decided to do.
 */
export type ProposalKind='repeat_entry'|'bulk_category'|'value_update'|'match_candidate';
export type ProposalSource='manual_history'|'analysis_metric'|'stored_evidence'|'preference';

/*
 * `split_fill` and `date_shortcut` were declared here and never derived, because neither is a proposal.
 * A proposal is offered *from the user's own data* and can say why; splitting a total evenly and jumping
 * to yesterday are constant shortcuts that cite nothing, so as proposals they would carry empty evidence
 * and a meaningless source. A union that names kinds nothing produces claims capability that is not there.
 * The split arithmetic lives in ./allocate.ts as plain functions; the date chips stay plain buttons.
 */

export type Proposal<T>={
 id:string;
 kind:ProposalKind;
 label:string;
 detail:string;
 prefill:T;
 evidence:string[];
 source:ProposalSource;
 metric:MetricKey|null;
};

/** What a bulk-category proposal would apply, and to which rows. */
export type BulkCategoryPrefill={ids:string[];category:string;merchant:string};
/**
 * Which purchase a refund credit is offered against.
 *
 * `reason` is evidence, not a verdict. Matching amount and merchant are what make a purchase worth putting
 * first; they are not proof that this credit refunds it, and the surface that renders this must keep saying
 * so. Nothing here is prefilled into a saved record: the user still selects and still confirms.
 */
export type MatchCandidatePrefill={purchaseId:string;creditId:string;reason:string};

/**
 * Which holding to record a new value for.
 *
 * Everything the user already told us carries over — the item, its name, its kind, its currency — and the
 * amount deliberately does not. A holding's previous value is not evidence for its next one, so offering
 * it prefilled would be inventing a financial fact, which is the one thing a proposal must never do. What
 * this removes is the selecting and the currency-checking, not the user's judgement about what it is worth.
 */
export type ValueUpdatePrefill={itemId:string;name:string;kind:'asset'|'liability';currency:string;date:string};

/** What a repeat-entry tile puts into the manual form. Never a saved entry. */
export type RepeatEntryPrefill={kind:'expense'|'income'|'transfer';accountId:string;minor:string;description:string;category:string|null;date:string};
