import {abs, day, dates, median, shift, type Snapshot} from './model';
import {currencyDigits} from '../core/money';
import {payCycle, recurrences, scheduledDates} from './forecast';
import {nextPayDate, roundUp, spendingPattern, type Reading} from './method';

/**
 * WHAT TO KEEP TODAY, AND WHAT IS LEFT TO SPEND AFTER KEEPING IT.
 *
 * "keep or save 20$ today cause you have enough for your bills, groceries etc" — and "you can safely
 * spend today $$$". Two figures, one calculation, no paragraph.
 *
 * The arithmetic is the one every safe-to-spend feature uses, and nothing here is a model or a guess:
 *
 *   spendable  balance that is not savings, less what is pending
 *   committed  the repeating bills that fall before the horizon ends
 *   typicalDay how much a day costs him, as median size × how often days cost anything
 *   headroom   spendable − committed − buffer − typicalDay × days
 *   keep       headroom ÷ days, never below zero, never above the savings share of his pay,
 *              rounded DOWN to something a person would actually move
 *
 * WHY MEDIAN AND NOT AVERAGE. One large day — a bond, a flight — would drag an average up and quietly
 * suppress every suggestion for a fortnight. The median of the days that cost anything, scaled by how
 * many days do, survives that: it answers "what does a day normally cost" rather than "what did this
 * month cost divided by 30".
 *
 * WHY THE CAP. 50/30/20 puts a fifth of income to savings, and the advice for a tight budget is five to
 * ten per cent rather than nothing. A month with an unusual surplus should not propose a rate that
 * cannot hold — a suggestion he cannot follow twice is worse than one he can follow forever.
 *
 * WHY ROUNDED DOWN, to five whole units of the currency: the figure is never more than the arithmetic
 * supports, and it is a number somebody would actually transfer. ₱47.31 is a calculation; ₱45 is a
 * decision.
 *
 * ZERO IS AN ANSWER. On a day with no headroom the suggestion is zero and says so as a figure, because
 * hiding it would make the absence of advice look like the absence of a feature.
 */
export type Keep = {
  status: 'ok' | 'not_yet';
  /** Where the horizon came from: his own pay dates, or the end of the month when nothing says otherwise. */
  tier: 'payday' | 'month';
  days: number;
  spendableMinor: string;
  committedMinor: string;
  typicalDayMinor: string;
  keepTodayMinor: string;
  spendTodayMinor: string;
  /** When the kept amount is meant to move: each day, on payday, or on the day money lands. */
  when: 'today' | 'payday' | 'paid';
  /** How he spends, and the method that follows from it. */
  reading: Reading;
  evidence: string[];
};

/** The last 60 days are enough to know what a day costs, and recent enough to still be true. */
const WINDOW = 60;

/**
 * @param spendableMinor what is held in accounts that are not savings, already in the snapshot's currency
 * @param bufferMinor money he has asked to keep untouched, which is never suggested away
 */
export function keepToday(s: Snapshot, spendableMinor: string, bufferMinor = '0'): Keep {
  const reading = spendingPattern(s);
  const blank: Keep = {status: 'not_yet', tier: 'month', days: 0, spendableMinor,
    committedMinor: '0', typicalDayMinor: '0', keepTodayMinor: '0', spendTodayMinor: '0',
    when: 'today', reading, evidence: []};
  const spendable = BigInt(spendableMinor), buffer = BigInt(bufferMinor);
  if (buffer < 0n) throw new Error('A buffer cannot be negative.');

  const recorded = s.transactions.filter(t => t.date <= s.asOf).map(t => t.date).sort();
  const first = recorded[0];
  // A week of history is the least that can say what a day costs. Below that there is nothing to advise on.
  if (!first || day(s.asOf) - day(first) < 6) return blank;

  // THE HORIZON. Until his next pay when his payslips say when that is, otherwise to the end of the
  // month — the two real answers to "how long does this have to last".
  const nextPay = nextPayDate(s) ?? undefined;
  const monthEnd = shift(s.asOf.slice(0, 8) + '01', 31).slice(0, 8) + '01';
  const horizon = nextPay ?? shift(monthEnd, -1);
  const days = Math.max(1, day(horizon) - day(s.asOf));
  const tier: Keep['tier'] = nextPay ? 'payday' : 'month';

  // Bills that fall inside the horizon, from payments that have already repeated three times or more.
  const bills = recurrences(s, {requireCoverage: false});
  const committed = bills.reduce((total, bill) =>
    total + BigInt(bill.minor) * BigInt(scheduledDates({next: bill.next, interval: bill.interval,
      ...(bill.monthly ? {monthly: bill.monthly} : {})}, horizon).filter(d => d > s.asOf).length), 0n);

  // Pending purchases are already out of the balance (it sums every row), so they are not taken off again.

  // WHAT A DAY COSTS: median of the days that cost anything, scaled by how often a day does.
  const window = {start: shift(s.asOf, -(WINDOW - 1)), end: s.asOf, label: ''};
  const outgoing = new Map<string, bigint>();
  for (const t of s.transactions) {
    if (t.status !== 'settled' || t.transfer || t.kind === 'transfer' || t.kind === 'savings') continue;
    if (t.date < window.start || t.date > window.end) continue;
    const value = BigInt(t.minor);
    if (value >= 0n) continue;
    outgoing.set(t.date, (outgoing.get(t.date) ?? 0n) + abs(value));
  }
  const span = dates(window).filter(d => d >= first).length;
  const spending = [...outgoing.values()];
  const typicalDay = span > 0 && spending.length > 0
    ? median(spending) * BigInt(spending.length) / BigInt(span) : 0n;

  const headroom = spendable - committed - buffer - typicalDay * BigInt(days);
  const perDay = headroom > 0n ? headroom / BigInt(days) : 0n;

  // The cap: a fifth of what a day of his pay is worth, when his payslips can say.
  const paid = s.pays.filter(p => p.date <= s.asOf).slice(-6);
  const cycleDays = payCycle(s)[0]?.interval ?? 0;
  const capped = paid.length >= 3 && cycleDays > 0
    ? min(perDay, median(paid.map(p => BigInt(p.net))) * 20n / (100n * BigInt(cycleDays)))
    : perDay;

  const step = 5n * 10n ** BigInt(currencyDigits[s.currency] ?? 2);
  const doable = (value: bigint) => value > 0n ? value / step * step : 0n;
  const daily = doable(capped);

  /**
   * THE METHOD DECIDES THE SHAPE OF THE SUGGESTION, never its ceiling: whatever the pattern, nothing is
   * suggested beyond the headroom the arithmetic above found.
   *
   *   pay-yourself-first  one amount, on payday, for the whole cycle — the daily figure × days, so it
   *                       is the same money moved once instead of thirty times.
   *   daily-allowance     the daily figure, today.
   *   round-up            what rounding the last seven days' small purchases up to the next hundred
   *                       would have kept, per day — the size of the leak, and no more than headroom.
   *   baseline-percent    a tenth of what landed in the last seven days, on the day it lands; nothing
   *                       on the days nothing does.
   */
  let keep = daily, when: Keep['when'] = 'today';
  const week = shift(s.asOf, -6);
  if (reading.method === 'pay-yourself-first' && tier === 'payday') {
    keep = doable(daily * BigInt(days)); when = 'payday';
  } else if (reading.method === 'round-up') {
    const limit = 15n * 10n ** BigInt(currencyDigits[s.currency] ?? 2);
    const leaks = s.transactions.filter(t => t.status === 'settled' && !t.transfer && t.kind !== 'savings'
      && t.date >= week && t.date <= s.asOf && BigInt(t.minor) < 0n && abs(BigInt(t.minor)) < limit);
    const kept = leaks.reduce((total, t) => total + roundUp(BigInt(t.minor), s.currency), 0n) / 7n;
    keep = doable(min(kept, daily));
  } else if (reading.method === 'baseline-percent') {
    const landed = s.transactions.filter(t => t.kind === 'income' && t.status === 'settled' && !t.transfer
      && t.date >= week && t.date <= s.asOf && BigInt(t.minor) > 0n)
      .reduce((total, t) => total + BigInt(t.minor), 0n);
    keep = doable(min(landed / 10n, daily * BigInt(days))); when = 'paid';
  }
  const reserved = when === 'today' ? keep * BigInt(days) : keep;
  const spend = spendable - committed - buffer - reserved;

  return {status: 'ok', tier, days, spendableMinor: spendable.toString(),
    committedMinor: committed.toString(), typicalDayMinor: typicalDay.toString(),
    keepTodayMinor: keep.toString(),
    spendTodayMinor: (spend > 0n ? spend / BigInt(days) : 0n).toString(),
    when, reading,
    evidence: [...new Set([...bills.flatMap(b => b.evidence), ...s.savings?.evidence ?? []])]};
}

const min = (a: bigint, b: bigint) => a < b ? a : b;

/**
 * THE PATH. Behind today, what he actually kept; ahead of it, where keeping the suggested amount takes
 * him. Nothing is claimed about what the app would have suggested in the past — that would be a story
 * told backwards — so the line behind is his record and the line ahead is the offer.
 *
 * The pot is walked backwards from what it holds now by unwinding every movement into a savings account
 * and every amount set aside without one, which is exact rather than reconstructed.
 */
export type PathPoint = {date: string; keptMinor: string | null; plannedMinor: string | null};

export function savingsPath(s: Snapshot, potMinor: string, keepTodayMinor: string, days = 30): PathPoint[] {
  const pot = BigInt(potMinor), keep = BigInt(keepTodayMinor);
  if (keep < 0n) throw new Error('A suggestion cannot be negative.');
  const moves = s.transactions.filter(t =>
    (s.savings?.accountIds ?? []).includes(t.accountId)
    || (t.status === 'settled' && !t.transfer && t.kind === 'savings'));
  const since = (date: string) => moves
    .filter(t => t.date > date && t.date <= s.asOf)
    .reduce((total, t) => total + ((s.savings?.accountIds ?? []).includes(t.accountId) ? BigInt(t.minor) : abs(BigInt(t.minor))), 0n);

  const past = dates({start: shift(s.asOf, -days), end: s.asOf, label: ''})
    .map(date => ({date, keptMinor: (pot - since(date)).toString(), plannedMinor: null}));
  const ahead = dates({start: shift(s.asOf, 1), end: shift(s.asOf, days), label: ''})
    .map((date, index) => ({date, keptMinor: null, plannedMinor: (pot + keep * BigInt(index + 1)).toString()}));
  // Today belongs to both lines, so they meet rather than jump.
  return [...past.slice(0, -1), {date: s.asOf, keptMinor: pot.toString(), plannedMinor: pot.toString()}, ...ahead];
}
