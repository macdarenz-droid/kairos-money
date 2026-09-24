import {abs, shift, sum} from '../intelligence/model';
import {keepToday, savingsPath} from '../intelligence/savings';
import {scheduledDates} from '../intelligence/forecast';
import {bills, tierFor} from './shared';
import type {BrainInputs, DebtTarget, Today} from './types';

/** The only spend/keep-today figures in the app. */
export function today(input: BrainInputs, targets: readonly DebtTarget[]): Today {
  const s = input.snapshot;
  const keep = keepToday(s, input.holdings.spendableMinor, input.bufferMinor);
  const horizonEnd = shift(s.asOf, keep.days);
  const committed = bills(s).filter(b => !input.cancelled.has(b.merchant)).flatMap(b =>
    scheduledDates({next: b.next, interval: b.interval, ...(b.monthly ? {monthly: b.monthly} : {})}, horizonEnd)
      .filter(date => date > s.asOf)
      .map(date => ({merchant: s.transactions.find(t => t.id === b.evidence.at(-1))?.description ?? b.merchant, minor: b.minor, date, evidence: b.evidence})))
    .sort((a, b) => a.date.localeCompare(b.date) || a.merchant.localeCompare(b.merchant));
  const pending = sum(s.transactions.filter(t => t.status === 'pending' && BigInt(t.minor) < 0n && !t.transfer).map(t => abs(BigInt(t.minor))));
  const pot = BigInt(input.holdings.savedMinor) + BigInt(s.savings?.asideMinor ?? '0');
  const perDay = keep.when === 'today' ? BigInt(keep.keepTodayMinor) : BigInt(keep.keepTodayMinor) / BigInt(Math.max(1, keep.days));
  const r = keep.reading;
  return {
    asOf: s.asOf, currency: s.currency, status: keep.status, tier: tierFor(s, shift(s.asOf, -59), s.asOf),
    spendTodayMinor: keep.spendTodayMinor, keepTodayMinor: keep.keepTodayMinor, when: keep.when,
    horizon: {days: keep.days, until: horizonEnd, source: keep.tier},
    holdings: {spendableMinor: input.holdings.spendableMinor, savedMinor: input.holdings.savedMinor, bufferMinor: input.bufferMinor},
    typicalDayMinor: keep.typicalDayMinor, committedMinor: keep.committedMinor, committed, pendingMinor: pending.toString(),
    method: {status: r.status, pattern: r.pattern, method: r.method, evidence: r.evidence, measures: {
      volatility: r.measures.volatility, leakShare: r.measures.leakShare, smallCount: r.measures.smallCount,
      paydayFront: r.measures.paydayFront, payIrregular: r.measures.payIrregular, payKnown: r.measures.payKnown}},
    savingsPath: {potMinor: pot.toString(), perDayMinor: perDay.toString(), points: keep.status === 'ok' ? savingsPath(s, pot.toString(), perDay.toString()) : []},
    debtTargets: targets.filter(t => t.fits),
    evidence: keep.evidence,
  };
}
