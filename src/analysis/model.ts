import type {Currency} from '../core/money';
import type {Coverage,Kind,Pay,Snapshot,Transaction,Window} from '../intelligence/model';

/**
 * Money Analysis contracts.
 *
 * This layer is a sibling of intelligence, not an extension of it: Session 3's twelve signals carry
 * frozen acceptance assertions, so the shared kernel in ../intelligence/model is imported verbatim and
 * never amended. Analysis reads the snapshot the intelligence repository already assembles and never
 * writes to the ledger.
 */
export const metricKeys=[
 // Ledger and reconciliation (1-5)
 'combined_ledger','statement_reconciliation','period_cashflow','transfer_exclusion','credit_sign_rules',
 // Income and classification (6-8)
 'salary_pattern','category_breakdown','merchant_breakdown',
 // Shape of spending (9-13)
 'repeated_purchases','small_payments','frequency_versus_size','range_anomalies','period_comparison',
 // Costs and timing (14-17)
 'regular_versus_occasional','payday_effect','weekday_distribution','spending_clusters',
 // Recurrence (18-20)
 'recurrence_detection','recurring_price_change','bnpl_commitments',
 // Instruments and adjustments (21-26)
 'remittances','foreign_exchange','fees','refunds_and_chargebacks','cash_entries','account_balances',
 // Position (27-30)
 'low_balance_episodes','account_use','surplus','balance_trajectory',
 // Reporting and planning (31-36)
 'evidence_reports','context_questions','budgets','what_ifs','conditional_forecasts','exports_and_recompute',
] as const;
export type MetricKey=typeof metricKeys[number];

/**
 * One capability's result.
 *
 * `evidence` holds transaction ids, never transaction rows. A stored signal that embedded its corpus
 * wrote 45,721,866 bytes per screen open and cost 37,403 ms of a 43,789 ms Ledger load on the device;
 * see ADR/0036. The ledger and transaction_sources remain the single copy of provenance, and a metric
 * cites them.
 */
export type Metric={
 key:MetricKey;version:1;period:string;
 status:'ok'|'insufficient_data';
 value:string|null;
 unit:string;reason:string;
 confidence:number;
 unverified:boolean;
 coverage:{coveredDays:number;gaps:Window[];tierC:boolean};
 evidence:string[];
 details:Record<string,string>;
};

export type Concept='understand'|'goal_obstacle'|'alternatives'|'contribution'|'progress'|'dignity';

/**
 * A quiet observation.
 *
 * The type carries no action, prompt, question or acceptance field, so no surface can render a Try it,
 * Adjust or Not now control, or an experiment workflow. `conditional` keeps a hypothesis explicitly
 * hypothetical and `progress` keeps what actually happened separate from what was only modelled.
 */
export type Observation={
 id:string;metric:MetricKey;concept:Concept;
 statement:string;
 figure:{minor:string;currency:Currency}|{count:number}|null;
 visual:'none'|'sparkline'|'bar'|'range';
 evidence:string[];
 conditional:{premise:string;perWeekMinor:string}|null;
 progress:{actualMinor:string;scenarioMinor:string}|null;
};

/** A recurring commitment, grouped once and shared by the recurrence, BNPL and planning families. */
export type RecurrenceGroup={merchant:string;band:string;ids:string[];dates:string[];amounts:string[]};

/**
 * The single ordered pass every metric reads.
 *
 * Thirty-six metrics each scanning the snapshot would undo the bounded-read work the 20,000-row ledger
 * required. Indices are built once; no metric rescans `snapshot.transactions`.
 */
export type AnalysisIndex={
 snapshot:Snapshot;
 /** Settled, non-transfer, in-currency, owned-account rows — the basis of every historical figure. */
 historical:Transaction[];
 /** Excluded from historical figures but retained so metrics can report them as pending. */
 pending:Transaction[];
 /** Identified transfers, counted as neither income nor spend. */
 transfers:Transaction[];
 byMonth:Map<string,Transaction[]>;
 byWeekday:Map<number,Transaction[]>;
 byMerchant:Map<string,Transaction[]>;
 byCategory:Map<string,Transaction[]>;
 byAccount:Map<string,Transaction[]>;
 byInstrument:Map<string,Transaction[]>;
 recurrence:RecurrenceGroup[];
 /** Covered days per account, as a set of day numbers, for gap-aware windows. */
 coveredDays:Map<string,Set<number>>;
 coverage:Coverage[];
 pays:Pay[];
 kinds:Map<Kind,Transaction[]>;
};

/** A capability. Pure: index in, metrics out, no I/O and no ledger writes. */
export type MetricFn=(index:AnalysisIndex,window:Window)=>Metric[];
