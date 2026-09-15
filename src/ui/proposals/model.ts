import type {MetricKey} from '../../analysis/model';

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
export type ProposalKind='repeat_entry'|'bulk_category'|'value_update'|'match_candidate'|'split_fill'|'date_shortcut';
export type ProposalSource='manual_history'|'analysis_metric'|'stored_evidence'|'preference';

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
/** What a repeat-entry tile puts into the manual form. Never a saved entry. */
export type RepeatEntryPrefill={kind:'expense'|'income'|'transfer';accountId:string;minor:string;description:string;category:string|null;date:string};
