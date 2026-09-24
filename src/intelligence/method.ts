import {abs, cv, day, dates, median, shift, sum, type Snapshot, type Transaction} from './model';
import {currencyDigits} from '../core/money';
import {payCycle} from './forecast';

/**
 * HOW HE SPENDS, AND THEREFORE HOW HE SHOULD SAVE.
 *
 * "the app should able to tell exactly how the user spends. then assign the appropriate method."
 *
 * Four patterns, read off the ledger, each with the saving method the research says works for it:
 *
 *   steady     regular pay, even spending      → pay yourself first: one fixed amount on payday.
 *                                                Automation is the strongest finding in the whole
 *                                                literature; people who move money on payday save
 *                                                more, and more reliably, than people who plan to.
 *   sprinter   the money goes in the first     → daily allowance: what is left, spread evenly to the
 *              days after pay                    next pay, and a small amount kept each day. Spending
 *                                                surges ~33% on payday among the present-biased; a
 *                                                per-day envelope is the counter to it.
 *   leaky      many small purchases            → round-up: each small purchase rounded up to the next
 *                                                whole hundred, the difference kept. Consistency beats
 *                                                size, and a leak is closed at the size of the leak.
 *   irregular  pay arrives when it arrives     → baseline and percentage: live on the lowest recent
 *                                                month, keep a share of every payment on the day it
 *                                                lands. The one method that does not assume a payday.
 *
 * Every measure is computed without the coverage gate, because a ledger typed in by hand has no
 * coverage and this must work for him from the first week. Thresholds reuse the ones the signals
 * already use — a "small" purchase is under 15 whole units, the same limit as small_leak_index.
 */
export type Pattern = 'steady' | 'sprinter' | 'leaky' | 'irregular';
export type Method = 'pay-yourself-first' | 'daily-allowance' | 'round-up' | 'baseline-percent';

export type Reading = {
  status: 'ok' | 'not_yet';
  pattern: Pattern;
  method: Method;
  /** Two words each. The whole of what the screen says about it. */
  label: string;
  methodLabel: string;
  measures: {
    /** Coefficient of variation of daily spend, basis points. */
    volatility: string;
    /** Share of discretionary spend in purchases under 15 units, basis points. */
    leakShare: string;
    smallCount: number;
    /** Per-day spend in the three days after pay against the rest of the cycle, basis points. */
    paydayFront: string | null;
    /** Whether pay timing or size is unpredictable. */
    payIrregular: boolean;
    payKnown: boolean;
  };
  evidence: string[];
};

export const LABELS: Record<Pattern, string> = {
  steady: 'Steady', sprinter: 'Payday sprinter', leaky: 'Small leaks', irregular: 'Irregular pay',
};
export const METHODS: Record<Method, string> = {
  'pay-yourself-first': 'Pay yourself first', 'daily-allowance': 'Daily allowance',
  'round-up': 'Round up', 'baseline-percent': 'Keep a share when paid',
};
const FOR: Record<Pattern, Method> = {
  steady: 'pay-yourself-first', sprinter: 'daily-allowance', leaky: 'round-up', irregular: 'baseline-percent',
};

const WINDOW = 90;

/** Money that left, on a day, that was not a transfer or savings. */
function outgoing(s: Snapshot, start: string): Transaction[] {
  return s.transactions.filter(t => t.status === 'settled' && !t.transfer && t.kind !== 'transfer'
    && t.kind !== 'savings' && t.date >= start && t.date <= s.asOf && BigInt(t.minor) < 0n);
}

/** Pay dates: payslips when there are any, otherwise the days income landed in the ledger. */
function payDates(s: Snapshot): string[] {
  const slips = s.pays.filter(p => p.date <= s.asOf).map(p => p.date);
  if (slips.length) return [...new Set(slips)].sort();
  return [...new Set(s.transactions
    .filter(t => t.kind === 'income' && t.status === 'settled' && !t.transfer && t.date <= s.asOf && BigInt(t.minor) > 0n)
    .map(t => t.date))].sort();
}

/**
 * THE NEXT PAY DATE, FROM WHATEVER SAYS SO. Payslips when they exist; otherwise the cadence of income
 * landing in the ledger — a hand-typed ledger records pay as a transaction, not a payslip, and a horizon
 * that only listened to payslips would never see it. Three arrivals with a steady gap are a cadence.
 */
export function nextPayDate(s: Snapshot): string | null {
  const slips = payCycle(s).map(c => c.next).filter(next => next > s.asOf).sort();
  if (slips.length) return slips[0]!;
  const dates = payDates(s);
  if (dates.length < 3) return null;
  const gaps = dates.slice(1).map((d, i) => BigInt(day(d) - day(dates[i]!)));
  if (cv(gaps) > 3000n) return null;
  const gap = Number(median(gaps).toString());   // a count of days, not money
  if (gap < 1 || gap > 40) return null;
  let next = shift(dates[dates.length - 1]!, gap);
  while (next <= s.asOf) next = shift(next, gap);
  return next;
}

export function spendingPattern(s: Snapshot): Reading {
  const start = shift(s.asOf, -(WINDOW - 1));
  const rows = outgoing(s, start);
  const first = s.transactions.filter(t => t.date <= s.asOf).map(t => t.date).sort()[0];
  const measures: Reading['measures'] = {volatility: '0', leakShare: '0', smallCount: 0,
    paydayFront: null, payIrregular: false, payKnown: false};
  const blank: Reading = {status: 'not_yet', pattern: 'sprinter', method: 'daily-allowance',
    label: LABELS.sprinter, methodLabel: METHODS['daily-allowance'], measures, evidence: []};
  if (!first || day(s.asOf) - day(first) < 6 || !rows.length) return blank;

  // Volatility: every day since the first record counts, including the ones nothing happened on.
  const byDay = new Map<string, bigint>();
  for (const t of rows) byDay.set(t.date, (byDay.get(t.date) ?? 0n) + abs(BigInt(t.minor)));
  const days = dates({start: first > start ? first : start, end: s.asOf, label: ''});
  measures.volatility = cv(days.map(d => byDay.get(d) ?? 0n)).toString();

  // Leaks: the share of discretionary money that went in purchases under 15 whole units.
  const limit = 15n * 10n ** BigInt(currencyDigits[s.currency] ?? 2);
  const disc = rows.filter(t => t.kind === 'discretionary' || t.kind === 'unknown');
  const small = disc.filter(t => abs(BigInt(t.minor)) <= limit);
  const discTotal = sum(disc.map(t => abs(BigInt(t.minor))));
  measures.smallCount = small.length;
  measures.leakShare = discTotal > 0n ? (sum(small.map(t => abs(BigInt(t.minor)))) * 10000n / discTotal).toString() : '0';

  // Pay: known when there are dates; irregular when the gaps or the amounts wander.
  const pays = payDates(s).filter(d => d >= start);
  const cycle = payCycle(s);
  measures.payKnown = pays.length >= 2;
  if (cycle.length) measures.payIrregular = cycle.some(c => c.irregular);
  else if (pays.length >= 3) {
    const gaps = pays.slice(1).map((d, i) => BigInt(day(d) - day(pays[i]!)));
    measures.payIrregular = cv(gaps) > 3000n;
  }
  if (!measures.payIrregular && pays.length >= 3) {
    const amounts = pays.map(d => sum(s.transactions
      .filter(t => t.kind === 'income' && t.date === d && BigInt(t.minor) > 0n).map(t => BigInt(t.minor))));
    if (amounts.every(a => a > 0n) && cv(amounts) > 3000n) measures.payIrregular = true;
  }

  // Front-loading: per-day spend in days 0–2 after each pay against per-day spend on the other days.
  if (pays.length >= 2) {
    let early = 0n, earlyDays = 0n, rest = 0n, restDays = 0n;
    for (const d of days) {
      const spent = byDay.get(d) ?? 0n;
      const since = pays.filter(p => p <= d).map(p => day(d) - day(p)).sort((a, b) => a - b)[0];
      if (since === undefined) continue;
      if (since <= 2) { early += spent; earlyDays++; } else { rest += spent; restDays++; }
    }
    if (earlyDays > 0n && restDays > 0n && rest > 0n)
      measures.paydayFront = ((early * 10000n / earlyDays) * 10000n / (rest * 10000n / restDays)).toString();
  }

  // Most specific first. A pattern has to be earned by the numbers; the last is the one that needs none.
  let pattern: Pattern;
  if (measures.payIrregular) pattern = 'irregular';
  else if (BigInt(measures.leakShare) >= 2500n && measures.smallCount >= 10) pattern = 'leaky';
  else if (measures.paydayFront !== null && BigInt(measures.paydayFront) >= 20000n) pattern = 'sprinter';
  else if (measures.payKnown && BigInt(measures.volatility) < 15000n) pattern = 'steady';
  else pattern = 'sprinter';

  const method = FOR[pattern];
  return {status: 'ok', pattern, method, label: LABELS[pattern], methodLabel: METHODS[method], measures,
    evidence: [...new Set([...rows.map(t => t.id), ...small.map(t => t.id)])]};
}

/** The round-up of one purchase to the next whole hundred units: ₱1,240 keeps ₱60; ₱1,300 keeps nothing. */
export function roundUp(minor: bigint, currency: keyof typeof currencyDigits): bigint {
  const hundred = 100n * 10n ** BigInt(currencyDigits[currency] ?? 2);
  const value = abs(minor);
  const rem = value % hundred;
  return rem === 0n ? 0n : hundred - rem;
}

export {median};
