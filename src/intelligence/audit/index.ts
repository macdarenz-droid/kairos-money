import {abs, day, ratio, shift, sum, type Snapshot, type Transaction} from '../model';
import {kindAmount} from '../allocations';
import {currencyDigits} from '../../core/money';
import {payCycle, payRise, recurrences} from '../forecast';
import {addMonths, compare, monthsUntil, paymentFor, payoff, type Debt, type Plan} from '../debt';
import {nextPayDate} from '../method';
import {FIXED_BURDEN_BP} from '../surfaces';

/**
 * THE MONEY AUDIT: five questions a person would paste their finances into a chatbot to ask, answered
 * on the device from the ledger itself, with nothing leaving the phone.
 *
 *   Money audit    — every leak, missed opportunity and mistake, ranked by what it costs a year.
 *   Money leaks    — subscriptions, small purchases, fees, cash that vanished, lifestyle creep.
 *   Cash flow      — every unit of income given a purpose: keep, save, spend, and what to cut.
 *   Debt           — the cheapest order to clear what is owed, and what the other order costs.
 *   Wealth roadmap — buffer, high-interest debt, bigger buffer, savings rate, investing: the standard
 *                    order, with where this ledger stands on each step.
 *
 * NOT ONE PERSON'S LEDGER. Every threshold here is a published rule of thumb or a ratio of this
 * ledger's own figures, never a number read off a particular statement: 20% of income to savings and
 * 10% to investing (50/30/20), 10% a year as the line for "high-interest", three months of essentials
 * as the buffer, and the same 15-unit "small purchase" the signals already use. Anyone's ledger fits.
 *
 * NO COVERAGE GATE, for the same reason the money band and the savings advice have none: a ledger
 * typed in by hand or built from approved notifications has no statement coverage and must still get
 * an answer. What it needs instead is four weeks of history, so a normalised month means something.
 *
 * EVERY FIGURE IS EXACT MONEY OR A RATIO, as decimal strings. Nothing here is a float, and nothing here
 * is a sentence: the screen draws these, and the doc explains them once.
 */
export const WINDOW_DAYS = 90;
export const MIN_DAYS = 28;
/** 50/30/20: a fifth of income to savings. */
export const SAVE_SHARE_BP = 2000n;
/** A tenth of income to investing once the earlier steps are done. */
export const INVEST_SHARE_BP = 1000n;
/** At or above this annual rate a debt costs more than saving earns; it is cleared before saving. */
export const HIGH_RATE_BP = 1000n;
/** Lifestyle spend per day up by a fifth on the two months before is lifestyle creep. */
export const CREEP_BP = 2000n;
/** Months of essential spending the buffer steps aim for. */
export const FIRST_BUFFER_MONTHS = 1n;
export const FULL_BUFFER_MONTHS = 3n;

export type Effort = 'low' | 'medium' | 'high';
export type LeakKind = 'subscription' | 'small-purchases' | 'bank-fees' | 'cash-out' | 'lifestyle-creep';
export type Leak = {
  kind: LeakKind;
  /** Two or three words. The whole of what the screen says about it. */
  label: string;
  monthlyMinor: string;
  annualMinor: string;
  count: number;
  /** What changing it costs the person: a tap, a habit, or a way of living. */
  effort: Effort;
  evidence: string[];
};

export type FindingKind = LeakKind | 'debt-interest' | 'fixed-costs';
export type Finding = {kind: FindingKind; label: string; annualMinor: string; detail: string; evidence: string[]};

export type Purpose = 'buffer' | 'debt' | 'savings' | 'investing';
export type CashFlow = {
  status: 'ok' | 'no_income';
  /** Where the monthly income figure came from, so the screen can say so if it must. */
  incomeSource: 'payslips' | 'ledger' | 'none';
  incomeMinor: string;
  essentialsMinor: string;
  minimumsMinor: string;
  discretionaryMinor: string;
  /** What is already being set aside each month: savings and investing rows. */
  savedMinor: string;
  /** Income less essentials less minimums. Negative when the month does not cover itself. */
  freeMinor: string;
  /** What each month should keep back, and where it should go. */
  saveMinor: string;
  saveTo: Purpose;
  /** What is left to spend after keeping. */
  spendMinor: string;
  /** What the leaks that need no cancellation add up to: small purchases, fees, creep. */
  cutMinor: string;
  /** Pay yourself first: the amount to move on the next pay date, if one can be found. */
  automate: {minor: string; date: string | null};
};

export type StepId = 'buffer-1' | 'high-interest' | 'buffer-3' | 'save-20' | 'invest-10';
export type Step = {
  id: StepId;
  label: string;
  currentMinor: string;
  targetMinor: string;
  status: 'done' | 'now' | 'later' | 'unknown';
  /** For the debt step: months to clear on the plan, or null when it never clears. */
  months?: number | null;
};

export type DebtStrategy = {
  count: number;
  owedMinor: string;
  minimumsMinor: string;
  extraMinor: string;
  /** Interest the balances cost over a year at today's rates, before any payment. */
  interestYearMinor: string;
  cheaper: Plan;
  other: Plan;
  savedMinor: string;
  savedMonths: number | null;
};

/**
 * A DEBT WITH A DATE ON IT. "I want to pay my debt in full amount, So im going to set the amount how
 * much. Then the app will analyse my transaction, all of them ... Then it will tell me something like:
 * try to keep ($) amount of money, to add to your savings for debt repayment."
 *
 * The payment is exact — the smallest that clears the balance by the date at its rate — and whether it
 * FITS is read off the same month the cash flow is built from: what is free after essentials and the
 * minimums. When it does not fit, the soonest date the free money would clear it is stated instead of
 * a payment nobody can make.
 */
export type Target = {
  id: string;
  name: string;
  date: string;
  /** Whole months left to pay in. */
  months: number;
  /** Each month, never below the lender's minimum; and the part of it above the minimum. */
  paymentMinor: string;
  extraMinor: string;
  /** The same payment as a share of each pay, when a pay cycle is known, and of each day. */
  perPayMinor: string | null;
  payInterval: number | null;
  perDayMinor: string;
  /** The extra sits inside the month's free money. */
  fits: boolean;
  /** When it does not fit: the soonest date the free money clears it, or null when even that never does. */
  earliest: string | null;
  status: 'ok' | 'past';
};

export type Audit = {
  status: 'ok' | 'not_yet';
  window: {start: string; end: string; days: number};
  findings: Finding[];
  leaks: Leak[];
  cashFlow: CashFlow;
  debt: DebtStrategy | null;
  /** The debts the person put a date on, and what keeping to it takes. */
  targets: Target[];
  roadmap: Step[];
  /** Whether pay has risen, held, or cannot be told: the "increase income" lever, stated not advised. */
  income: 'rising' | 'flat' | 'unknown';
  evidence: string[];
};

export const LEAK_LABELS: Record<LeakKind, string> = {
  subscription: 'Subscriptions', 'small-purchases': 'Small purchases', 'bank-fees': 'Bank fees',
  'cash-out': 'Cash out', 'lifestyle-creep': 'Lifestyle creep',
};
export const STEP_LABELS: Record<StepId, string> = {
  'buffer-1': 'One month buffer', 'high-interest': 'High-interest debt', 'buffer-3': 'Three month buffer',
  'save-20': 'Save a fifth', 'invest-10': 'Invest a tenth',
};

type Options = {
  debts?: readonly Debt[];
  /** What is held to spend now, in the snapshot's currency. */
  spendableMinor?: string;
};

/** Settled money that moved in or out on the accounts in view, not between them. */
function moved(s: Snapshot, start: string, end: string): Transaction[] {
  return s.transactions.filter(t => t.currency === s.currency && s.accountIds.includes(t.accountId)
    && t.status === 'settled' && !t.transfer && t.kind !== 'transfer' && t.date >= start && t.date <= end);
}
const spent = (rows: readonly Transaction[]) => rows.filter(t => BigInt(t.minor) < 0n);
/** A window's total, stated as a month of thirty days. */
const monthly = (total: bigint, days: number) => days > 0 ? total * 30n / BigInt(days) : 0n;
const annual = (perMonth: bigint) => perMonth * 12n;
const share = (whole: bigint, bp: bigint) => whole * bp / 10000n;

export function audit(s: Snapshot, options: Options = {}): Audit {
  const first = s.transactions.filter(t => t.date <= s.asOf).map(t => t.date).sort()[0];
  const earliest = first && first > shift(s.asOf, -(WINDOW_DAYS - 1)) ? first : shift(s.asOf, -(WINDOW_DAYS - 1));
  const span = first ? day(s.asOf) - day(earliest) + 1 : 0;
  // Whole thirty-day blocks, so a bill paid twice in 45 days is not read as 1.33 a month.
  const days = span >= 30 ? span - span % 30 : span;
  const start = days ? shift(s.asOf, -(days - 1)) : earliest;
  const blank: Audit = {
    status: 'not_yet', window: {start, end: s.asOf, days}, findings: [], leaks: [],
    cashFlow: {status: 'no_income', incomeSource: 'none', incomeMinor: '0', essentialsMinor: '0', minimumsMinor: '0',
      discretionaryMinor: '0', savedMinor: '0', freeMinor: '0', saveMinor: '0', saveTo: 'buffer', spendMinor: '0',
      cutMinor: '0', automate: {minor: '0', date: null}},
    debt: null, targets: [], roadmap: [], income: 'unknown', evidence: [],
  };
  if (!first || days < MIN_DAYS) return blank;

  const rows = moved(s, start, s.asOf), expenses = spent(rows);
  const debts = (options.debts ?? []).filter(d => BigInt(d.balanceMinor) > 0n);

  // INCOME: payslips when there are any, otherwise what landed as income in the ledger.
  const slips = s.pays.filter(p => p.currency === s.currency && p.date >= start && p.date <= s.asOf);
  const incomeTotal = slips.length
    ? sum(slips.map(p => BigInt(p.net)))
    : sum(rows.filter(t => t.kind === 'income' && BigInt(t.minor) > 0n).map(t => BigInt(t.minor)));
  const incomeSource = slips.length ? 'payslips' : incomeTotal > 0n ? 'ledger' : 'none';
  const income = monthly(incomeTotal, days);

  // WHAT THE MONTH IS MADE OF. Uncategorised spending counts as discretionary: nothing has claimed it
  // as a necessity, and a plan that quietly treated it as fixed would be inventing a bill.
  const essentials = monthly(sum(expenses.map(t => kindAmount(t, 'essential'))), days);
  const discretionary = monthly(sum(expenses.map(t => kindAmount(t, 'discretionary') + kindAmount(t, 'unknown'))), days);
  const debtPaid = monthly(sum(expenses.map(t => kindAmount(t, 'debt'))), days);
  const saved = monthly(sum(expenses.map(t => kindAmount(t, 'savings'))), days);
  const invested = monthly(sum(expenses.filter(t => t.category === 'Investing').map(t => abs(BigInt(t.minor)))), days);
  const minimums = debts.length ? sum(debts.map(d => BigInt(d.minimumMinor))) : debtPaid;

  // LEAKS, each one a shape the research names and the ledger can show.
  const leaks: Leak[] = [];
  const disc = expenses.filter(t => t.kind === 'discretionary' || t.kind === 'unknown');
  const subs = recurrences(s, {requireCoverage: false}).filter(r => {
    const sample = s.transactions.find(t => t.id === r.evidence[0]);
    // Only a chosen repeat is a subscription; an uncategorised one could be rent or a loan.
    return sample?.kind === 'discretionary';
  });
  if (subs.length) {
    const perMonth = sum(subs.map(r => BigInt(r.minor) * 30n / BigInt(r.interval)));
    leaks.push({kind: 'subscription', label: LEAK_LABELS.subscription, monthlyMinor: perMonth.toString(),
      annualMinor: annual(perMonth).toString(), count: subs.length, effort: 'low', evidence: subs.flatMap(r => r.evidence)});
  }
  // Fees and cash withdrawals are leaks of their own below, not purchases, and not a way of living.
  const lifestyle = disc.filter(t => t.category !== 'Bank fees' && t.category !== 'Cash withdrawal');
  const limit = 15n * 10n ** BigInt(currencyDigits[s.currency] ?? 2);
  const small = lifestyle.filter(t => abs(BigInt(t.minor)) < limit);
  if (small.length >= 5) {
    const perMonth = monthly(sum(small.map(t => abs(BigInt(t.minor)))), days);
    leaks.push({kind: 'small-purchases', label: LEAK_LABELS['small-purchases'], monthlyMinor: perMonth.toString(),
      annualMinor: annual(perMonth).toString(), count: small.length, effort: 'medium', evidence: small.map(t => t.id)});
  }
  for (const [kind, category, effort] of [['bank-fees', 'Bank fees', 'low'], ['cash-out', 'Cash withdrawal', 'medium']] as const) {
    const hits = expenses.filter(t => t.category === category);
    if (!hits.length) continue;
    const perMonth = monthly(sum(hits.map(t => abs(BigInt(t.minor)))), days);
    leaks.push({kind, label: LEAK_LABELS[kind], monthlyMinor: perMonth.toString(), annualMinor: annual(perMonth).toString(),
      count: hits.length, effort, evidence: hits.map(t => t.id)});
  }
  // Creep: the last thirty days of lifestyle spending against the sixty before them, per day.
  if (days >= 90) {
    const recentStart = shift(s.asOf, -29), priorStart = shift(s.asOf, -89);
    const perDay = (from: string, to: string) => {
      const inside = lifestyle.filter(t => t.date >= from && t.date <= to);
      return sum(inside.map(t => abs(BigInt(t.minor)))) / BigInt(day(to) - day(from) + 1);
    };
    const recent = perDay(recentStart, s.asOf), prior = perDay(priorStart, shift(recentStart, -1));
    if (prior > 0n && ratio(recent - prior, prior) >= CREEP_BP) {
      const perMonth = (recent - prior) * 30n;
      leaks.push({kind: 'lifestyle-creep', label: LEAK_LABELS['lifestyle-creep'], monthlyMinor: perMonth.toString(),
        annualMinor: annual(perMonth).toString(), count: lifestyle.filter(t => t.date >= recentStart).length, effort: 'high',
        evidence: lifestyle.filter(t => t.date >= priorStart).map(t => t.id)});
    }
  }
  leaks.sort((a, b) => BigInt(b.annualMinor) > BigInt(a.annualMinor) ? 1 : BigInt(b.annualMinor) < BigInt(a.annualMinor) ? -1 : a.kind.localeCompare(b.kind));

  // FINDINGS: the leaks, plus the two mistakes that are not leaks but cost money every year anyway.
  const findings: Finding[] = leaks.map(l => ({kind: l.kind, label: l.label, annualMinor: l.annualMinor,
    detail: l.kind === 'subscription' || l.kind === 'small-purchases' || l.kind === 'bank-fees' || l.kind === 'cash-out'
      ? `${l.count} in ${days} days` : `${l.count} in 30 days`, evidence: l.evidence}));
  const interestYear = sum(debts.map(d => BigInt(d.balanceMinor) * BigInt(d.annualRateBp) / 10000n));
  const highRate = debts.filter(d => BigInt(d.annualRateBp) >= HIGH_RATE_BP);
  if (interestYear > 0n) findings.push({kind: 'debt-interest', label: 'Debt interest', annualMinor: interestYear.toString(),
    detail: `${debts.length} ${debts.length === 1 ? 'debt' : 'debts'}`, evidence: []});
  const fixed = essentials + minimums;
  if (income > 0n && ratio(fixed, income) > FIXED_BURDEN_BP) {
    const over = fixed - share(income, FIXED_BURDEN_BP);
    findings.push({kind: 'fixed-costs', label: 'Fixed costs over 60% of income', annualMinor: annual(over).toString(),
      detail: `${ratio(fixed, income) / 100n}% of income`, evidence: expenses.filter(t => kindAmount(t, 'essential') > 0n).map(t => t.id)});
  }
  findings.sort((a, b) => BigInt(b.annualMinor) > BigInt(a.annualMinor) ? 1 : BigInt(b.annualMinor) < BigInt(a.annualMinor) ? -1 : a.kind.localeCompare(b.kind));

  // THE ROADMAP decides where kept money goes, so it is read before the cash-flow plan is written.
  const spendable = BigInt(options.spendableMinor ?? s.liquid?.minor ?? '0');
  const owedHigh = sum(highRate.map(d => BigInt(d.balanceMinor)));
  const steps: Step[] = [
    {id: 'buffer-1', label: STEP_LABELS['buffer-1'], currentMinor: spendable.toString(),
      targetMinor: (essentials * FIRST_BUFFER_MONTHS).toString(), status: essentials > 0n ? 'later' : 'unknown'},
    {id: 'high-interest', label: STEP_LABELS['high-interest'], currentMinor: owedHigh.toString(), targetMinor: '0', status: 'later'},
    {id: 'buffer-3', label: STEP_LABELS['buffer-3'], currentMinor: spendable.toString(),
      targetMinor: (essentials * FULL_BUFFER_MONTHS).toString(), status: essentials > 0n ? 'later' : 'unknown'},
    {id: 'save-20', label: STEP_LABELS['save-20'], currentMinor: saved.toString(),
      targetMinor: share(income, SAVE_SHARE_BP).toString(), status: income > 0n ? 'later' : 'unknown'},
    {id: 'invest-10', label: STEP_LABELS['invest-10'], currentMinor: invested.toString(),
      targetMinor: share(income, INVEST_SHARE_BP).toString(), status: income > 0n ? 'later' : 'unknown'},
  ];
  let current: Step | null = null;
  for (const step of steps) {
    if (step.status === 'unknown') continue;
    const done = step.id === 'high-interest' ? BigInt(step.currentMinor) === 0n : BigInt(step.currentMinor) >= BigInt(step.targetMinor);
    if (done) step.status = 'done';
    else if (!current) { step.status = 'now'; current = step; }
  }
  let saveTo: Purpose = !current ? 'investing'
    : current.id === 'high-interest' ? 'debt' : current.id === 'save-20' ? 'savings' : current.id === 'invest-10' ? 'investing' : 'buffer';

  // CASH FLOW: every unit of income with a purpose. Keep what must be kept; put a fifth aside, or as
  // much of the free money as there is when a fifth is not there; spend the rest. The kept fifth is the
  // published rule; where it goes is the roadmap's current step.
  const free = income - fixed;
  const target = share(income, SAVE_SHARE_BP);
  let save = free <= 0n ? 0n : (target > saved ? target : saved) < free ? (target > saved ? target : saved) : free;

  // TARGETS: a date the person put on a debt outranks the roadmap's order, because it is the one thing
  // on this screen they asked for by name. Each is costed exactly; what fits is kept for it.
  const pays = payCycle(s);
  const payEvery = pays.length ? Math.min(...pays.map(c => c.interval)) : null;
  const room = free > 0n ? free : 0n;
  // Earliest date first, each taking its extra out of what the earlier ones left.
  let left = room;
  const targets: Target[] = debts.filter(d => d.targetDate).sort((a, b) => a.targetDate!.localeCompare(b.targetDate!) || a.id.localeCompare(b.id)).map(d => {
    const months = monthsUntil(s.asOf, d.targetDate!);
    const payment = BigInt(paymentFor(d, months) ?? d.balanceMinor);
    const extra = payment > BigInt(d.minimumMinor) ? payment - BigInt(d.minimumMinor) : 0n;
    const fits = income > 0n && extra <= left;
    if (fits) left -= extra;
    const reach = fits ? null : payoff(d, (BigInt(d.minimumMinor) + left).toString()).months;
    const target: Target = {id: d.id, name: d.name, date: d.targetDate!, months, paymentMinor: payment.toString(), extraMinor: extra.toString(),
      perPayMinor: payEvery ? (payment * BigInt(payEvery) / 30n).toString() : null, payInterval: payEvery,
      perDayMinor: (payment / 30n).toString(), fits, earliest: reach === null ? null : addMonths(s.asOf, reach), status: months < 1 ? 'past' : 'ok'};
    return target;
  }).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const wanted = sum(targets.filter(t => t.fits).map(t => BigInt(t.extraMinor)));
  if (wanted > 0n) { saveTo = 'debt'; if (wanted > save) save = wanted < room ? wanted : room; }
  const spend = free - save > 0n ? free - save : 0n;
  const cut = sum(leaks.filter(l => l.kind === 'small-purchases' || l.kind === 'bank-fees' || l.kind === 'lifestyle-creep').map(l => BigInt(l.monthlyMinor)));
  const payday = nextPayDate(s);
  const interval = payday ? Math.min(31, day(payday) - day(s.asOf)) : 30;
  const cashFlow: CashFlow = {
    status: income > 0n ? 'ok' : 'no_income', incomeSource, incomeMinor: income.toString(), essentialsMinor: essentials.toString(),
    minimumsMinor: minimums.toString(), discretionaryMinor: discretionary.toString(), savedMinor: saved.toString(),
    freeMinor: free.toString(), saveMinor: save.toString(), saveTo, spendMinor: spend.toString(), cutMinor: cut.toString(),
    // A lump on payday: the month's keep, scaled to the days until the next pay lands.
    automate: {minor: payday ? (save * BigInt(interval) / 30n).toString() : save.toString(), date: payday},
  };

  // DEBT: minimums on everything, and the kept amount on top when the roadmap says debt comes first.
  let debt: DebtStrategy | null = null;
  if (debts.length) {
    const extra = saveTo === 'debt' ? save : 0n;
    const both = compare(debts, (minimums + extra).toString());
    const cheaper = BigInt(both.savedMinor) > 0n ? both.avalanche : both.snowball;
    const other = cheaper === both.avalanche ? both.snowball : both.avalanche;
    debt = {count: debts.length, owedMinor: sum(debts.map(d => BigInt(d.balanceMinor))).toString(),
      minimumsMinor: minimums.toString(), extraMinor: extra.toString(), interestYearMinor: interestYear.toString(),
      cheaper, other, savedMinor: abs(BigInt(both.savedMinor)).toString(),
      savedMonths: both.savedMonths === null ? null : Math.abs(both.savedMonths)};
    const high = steps.find(step => step.id === 'high-interest')!;
    if (high.status === 'now') high.months = cheaper.months;
  }

  const rises = payRise(s);
  const cycles = s.pays.filter(p => p.currency === s.currency && p.date <= s.asOf).length;
  return {
    status: 'ok', window: {start, end: s.asOf, days}, findings, leaks, cashFlow, debt, targets, roadmap: steps,
    income: rises.length ? 'rising' : cycles >= 6 ? 'flat' : 'unknown',
    evidence: [...new Set(rows.map(t => t.id))],
  };
}
