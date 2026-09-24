import type {Currency} from '../core/money';

/** Exact money: a bigint of minor units as a decimal string, as in src/intelligence/model.ts. */
export type Minor = string;
/** A calendar day, YYYY-MM-DD. */
export type Day = string;
/** A ratio in basis points (10000 = 100%), as a decimal string. */
export type BasisPoints = string;
/** Transaction ids a figure rests on, so any claim can be opened and checked. */
export type Evidence = readonly string[];

/** How far a result can be trusted. It labels; it never hides spending (ADR 0025). */
export type Tier = 'verified' | 'recorded' | 'insufficient';

export type Coverage = {
  tier: Tier;
  from: Day | null;
  to: Day | null;
  coveredDays: number;
  totalDays: number;
  /** Stretches with no statement, named on the Ledger coverage line. */
  gaps: readonly {start: Day; end: Day}[];
  /** Currencies held but left out because no rate reaches the display currency. */
  unconverted: readonly Currency[];
};

// ── today ──────────────────────────────────────────────────────────────
export type Pattern = 'steady' | 'sprinter' | 'leaky' | 'irregular';
export type Method = 'pay-yourself-first' | 'daily-allowance' | 'round-up' | 'baseline-percent';
export type MethodReading = {
  status: 'ok' | 'not_yet';
  pattern: Pattern;
  method: Method;
  measures: {
    volatility: BasisPoints;
    leakShare: BasisPoints;
    smallCount: number;
    paydayFront: BasisPoints | null;
    payIrregular: boolean;
    payKnown: boolean;
  };
  evidence: Evidence;
};
export type CommittedBill = {merchant: string; minor: Minor; date: Day; evidence: Evidence};
export type PathPoint = {date: Day; keptMinor: Minor | null; plannedMinor: Minor | null};
export type DebtTarget = {
  id: string;
  name: string;
  date: Day;
  months: number;
  paymentMinor: Minor;
  extraMinor: Minor;
  perPayMinor: Minor | null;
  payInterval: number | null;
  perDayMinor: Minor;
  fits: boolean;
  earliest: Day | null;
  status: 'ok' | 'past';
};
export type Today = {
  asOf: Day;
  currency: Currency;
  status: 'ok' | 'not_yet';
  tier: Tier;
  /** The only spend/keep-today figures in the app. */
  spendTodayMinor: Minor;
  keepTodayMinor: Minor;
  when: 'today' | 'payday' | 'paid';
  horizon: {days: number; until: Day; source: 'payday' | 'month'};
  holdings: {spendableMinor: Minor; savedMinor: Minor; bufferMinor: Minor};
  typicalDayMinor: Minor;
  committedMinor: Minor;
  committed: readonly CommittedBill[];
  /** Pending purchases: already out of the balance, shown so the figure can be explained. */
  pendingMinor: Minor;
  method: MethodReading;
  savingsPath: {potMinor: Minor; perDayMinor: Minor; points: readonly PathPoint[]};
  debtTargets: readonly DebtTarget[];
  evidence: Evidence;
};

// ── attention (at most 3, most urgent first) ─────────────────────────────────────────────────────
export type Due = {date: Day; offset: number; merchant: string; minor: Minor; height: string; beforePay: boolean};
export type DueWindow = {days: number; dues: readonly Due[]; payOffset: number | null; beforePayMinor: Minor};
type AttentionBase = {urgency: 1 | 2 | 3; evidence: Evidence};
export type Attention = AttentionBase & (
  | {kind: 'runway'; days: string; ceilingDays: string}
  | {kind: 'fixed-burden'; basisPoints: BasisPoints}
  | {kind: 'unusual-charge'; merchant: string; minor: Minor; usualMinor: Minor; date: Day}
  | {kind: 'due-soon'; merchant: string; count: number; minor: Minor; date: Day; window: DueWindow}
  | {kind: 'debt-due'; debtId: string; name: string; count: number; minor: Minor; date: Day}
);
export type AttentionKind = Attention['kind'];

// ── spending ───────────────────────────────────────────────────────────
export type MonthFlow = {month: string; inMinor: Minor; outMinor: Minor; leftMinor: Minor; tier: Tier};
export type CategoryShare = {name: string; minor: Minor; share: BasisPoints; evidence: Evidence};
export type MerchantShare = {merchant: string; minor: Minor; count: number; category: string; evidence: Evidence};
export type Bill = {
  merchant: string;
  category: string;
  minor: Minor;
  /** Days between charges, from forecast recurrences. */
  interval: number;
  yearlyMinor: Minor;
  nextDate: Day | null;
  cancelled: boolean;
  evidence: Evidence;
};
export type Total = {minor: Minor; count: number; evidence: Evidence};
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type BandBlock = {start: Day; end: Day; inMinor: Minor; outMinor: Minor; netMinor: Minor; evidence: Evidence; unconfirmed: boolean};
export type Band = {start: Day; end: Day; blocks: readonly BandBlock[]; now: BandBlock; before: BandBlock; comparable: boolean; trend: boolean};
export type DaySpend = {date: Day; minor: Minor};
export type Spending = {
  /** The trailing 30 days that categories, merchants, small purchases, fees and refunds cover. */
  window: {start: Day; end: Day; tier: Tier};
  thisMonth: MonthFlow;
  lastMonth: MonthFlow;
  /** Split-aware: a split row counts under each of its parts. */
  categories: readonly CategoryShare[];
  merchants: readonly MerchantShare[];
  bills: readonly Bill[];
  small: Total;
  fees: Total;
  refunds: Total;
  busiestWeekday: {day: Weekday; minor: Minor} | null;
  /** Per-day spend in the days after pay against the rest of the cycle; null when pay is unknown. */
  paydayEffect: {afterPayDayMinor: Minor; otherDayMinor: Minor; ratio: BasisPoints} | null;
  /** Thirty days to today against the thirty before. */
  band: Band;
  /** The last 7 days, oldest first. */
  days: readonly DaySpend[];
};

// ── plan (full audit shape) ────────────────────────────────────────────
export type Effort = 'low' | 'medium' | 'high';
export type LeakKind = 'subscription' | 'small-purchases' | 'bank-fees' | 'cash-out' | 'lifestyle-creep';
export type Leak = {kind: LeakKind; monthlyMinor: Minor; annualMinor: Minor; count: number; effort: Effort; evidence: Evidence};
export type FindingKind = LeakKind | 'debt-interest' | 'fixed-costs';
export type Finding = {kind: FindingKind; annualMinor: Minor; evidence: Evidence};
export type Purpose = 'buffer' | 'debt' | 'savings' | 'investing';
export type Split = {
  status: 'ok' | 'no_income';
  incomeSource: 'payslips' | 'ledger' | 'none';
  incomeMinor: Minor;
  essentialsMinor: Minor;
  minimumsMinor: Minor;
  discretionaryMinor: Minor;
  savedMinor: Minor;
  freeMinor: Minor;
  keepMinor: Minor;
  keepTo: Purpose;
  spendMinor: Minor;
  cutMinor: Minor;
  automate: {minor: Minor; date: Day | null};
};
export type StepId = 'buffer-1' | 'high-interest' | 'buffer-3' | 'save-20' | 'invest-10';
export type Step = {id: StepId; currentMinor: Minor; targetMinor: Minor; status: 'done' | 'now' | 'later' | 'unknown'; months?: number | null};
export type PayoffPlan = {strategy: 'avalanche' | 'snowball'; months: number | null; interestMinor: Minor; order: readonly string[]; balances: readonly Minor[]; growing: boolean};
export type DebtStrategy = {
  count: number;
  owedMinor: Minor;
  minimumsMinor: Minor;
  extraMinor: Minor;
  interestYearMinor: Minor;
  cheaper: PayoffPlan;
  other: PayoffPlan;
  savedMinor: Minor;
  savedMonths: number | null;
};
export type GoalPerPay = {goalId: string; perPayMinor: Minor | null};
export type PayRise = {employer: string; increaseMinor: Minor; suggestedMinor: Minor; evidence: Evidence};
export type Plan = {
  /** 'hidden' while triage is active. */
  status: 'ok' | 'not_yet' | 'hidden';
  window: {start: Day; end: Day; days: number};
  split: Split;
  findings: readonly Finding[];
  leaks: readonly Leak[];
  roadmap: readonly Step[];
  /** The first step not done, or null when all are. */
  next: StepId | null;
  debt: DebtStrategy | null;
  targets: readonly DebtTarget[];
  goalsPerPay: readonly GoalPerPay[];
  payRise: readonly PayRise[];
  income: 'rising' | 'flat' | 'unknown';
  evidence: Evidence;
};

// ── goals ──────────────────────────────────────────────────────────────
export type Goal = {
  id: string;
  name: string;
  kind: 'goal' | 'sinking' | 'budget';
  targetMinor: Minor;
  fundedMinor: Minor;
  targetDate: Day;
  perPayMinor: Minor | null;
};
export type Goals = {bufferMinor: Minor; items: readonly Goal[]};

// ── advice (at most 3, ranked by yearly impact × ease) ────────────────────────────────────────────────────────
export type AdviceRule =
  | 'cancel-unused-subscription' | 'cut-small-purchases' | 'avoid-bank-fees' | 'reduce-cash-out'
  | 'check-lifestyle-creep' | 'pay-high-interest-first' | 'lower-fixed-costs' | 'build-buffer'
  | 'pay-yourself-first' | 'save-pay-rise';
export type Advice = {
  rule: AdviceRule;
  /** Named exact values the wording may quote; the UI formats them. */
  figures: Readonly<Record<string, Minor>>;
  yearlyMinor: Minor;
  ease: 1 | 2 | 3;
  evidence: Evidence;
};

// ── triage ─────────────────────────────────────────────────────────────
export type TriageReason = 'low-buffer' | 'rising-high-interest-debt' | 'repeated-overdraft-fees';
/** When active, advice and plan are hidden; essentials and free help are shown. */
export type Triage =
  | {active: false}
  | {active: true; reasons: readonly TriageReason[]; nextEssential: CommittedBill | null; availableMinor: Minor; evidence: Evidence};

// ── inputs, read once per (date, display currency) ────────────────────
export type Dismissal = {count: number; last: Day};
export type BrainInputs = {
  snapshot: import('../intelligence/model').Snapshot;
  /** Balances in the display currency: spendable accounts, and savings or investment accounts. */
  holdings: {spendableMinor: Minor; savedMinor: Minor};
  bufferMinor: Minor;
  /** Open debts already in the display currency (see openDebts). */
  debts: readonly import('../intelligence/debt').Debt[];
  scheduled: readonly import('../intelligence/debt').Scheduled[];
  /** Lower-case merchant keys the owner has cancelled. */
  cancelled: ReadonlySet<string>;
  dismissals: Readonly<Partial<Record<AdviceRule, Dismissal>>>;
};

// ── the whole result ───────────────────────────────────────────────────
export type Brain = {
  asOf: Day;
  currency: Currency;
  today: Today;
  attention: readonly Attention[];
  spending: Spending;
  plan: Plan;
  goals: Goals;
  advice: readonly Advice[];
  triage: Triage;
  coverage: Coverage;
  tier: Tier;
};

// ── BrainSummary: what the optional advisor may see ────────────────────
/**
 * Aggregates and rule ids only: no transaction ids, account names or raw descriptions.
 * Merchant names appear only when the owner allows it.
 */
export type SummaryFact = {id: string; value: Minor | BasisPoints | number};
export type BrainSummary = {
  asOf: Day;
  currency: Currency;
  tier: Tier;
  coverage: {coveredDays: number; totalDays: number; gapCount: number};
  today: {status: 'ok' | 'not_yet'; spendTodayMinor: Minor; keepTodayMinor: Minor; horizonDays: number; committedMinor: Minor; method: Method | null};
  attention: readonly {kind: AttentionKind; minor?: Minor; days?: string; basisPoints?: BasisPoints}[];
  spending: {
    thisMonth: Omit<MonthFlow, 'month'>;
    lastMonth: Omit<MonthFlow, 'month'>;
    categories: readonly {name: string; minor: Minor; share: BasisPoints}[];
    merchants?: readonly {merchant: string; minor: Minor; count: number}[];
    billsYearlyMinor: Minor;
    billCount: number;
    smallMinor: Minor;
    feesMinor: Minor;
    refundsMinor: Minor;
  };
  plan: {split: Split; leaks: readonly Omit<Leak, 'evidence'>[]; next: StepId | null; debtCount: number; owedMinor: Minor} | null;
  goals: readonly {kind: Goal['kind']; targetMinor: Minor; fundedMinor: Minor; targetDate: Day}[];
  advice: readonly {rule: AdviceRule; yearlyMinor: Minor; figures: Readonly<Record<string, Minor>>}[];
  triage: boolean;
  /** Every figure the advisor may cite, by id; a point citing any other id is dropped. */
  facts: readonly SummaryFact[];
};
