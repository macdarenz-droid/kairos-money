import {abs, day, shift, sum, type Snapshot} from '../intelligence/model';
import {categoryAmounts} from '../intelligence/allocations';
import {moneyBand} from '../intelligence/visuals/band';
import {bills, inflowRows, merchantKey, out, payModel, smallLimit, spendingRows, tierFor} from './shared';
import type {Band, Bill, BrainInputs, CategoryShare, Day, MerchantShare, MonthFlow, Spending, Total, Weekday} from './types';

const share = (part: bigint, whole: bigint) => (whole > 0n ? part * 10000n / whole : 0n).toString();
const total = (rows: readonly {id: string; minor: string}[]): Total =>
  ({minor: sum(rows.map(t => abs(BigInt(t.minor)))).toString(), count: rows.length, evidence: rows.map(t => t.id)});

function month(s: Snapshot, start: Day, end: Day): MonthFlow {
  const received = sum(inflowRows(s, start, end).map(t => BigInt(t.minor))), spent = out(spendingRows(s, start, end));
  return {month: start.slice(0, 7), inMinor: received.toString(), outMinor: spent.toString(), leftMinor: (received - spent).toString(), tier: tierFor(s, start, end)};
}

export function spending(input: BrainInputs): Spending {
  const s = input.snapshot, asOf = s.asOf;
  const start = shift(asOf, -29), rows = spendingRows(s, start, asOf), spent = out(rows);

  // Split-aware: a split row counts under each of its parts, so the parts still add up to money out.
  const byCategory = new Map<string, {minor: bigint; ids: string[]}>();
  for (const t of rows) for (const part of categoryAmounts(t)) {
    const entry = byCategory.get(part.category) ?? {minor: 0n, ids: []};
    entry.minor += BigInt(part.minor); entry.ids.push(t.id); byCategory.set(part.category, entry);
  }
  const categories: CategoryShare[] = [...byCategory].map(([name, e]) => ({name, minor: e.minor.toString(), share: share(e.minor, spent), evidence: e.ids}))
    .sort((a, b) => BigInt(b.minor) > BigInt(a.minor) ? 1 : BigInt(b.minor) < BigInt(a.minor) ? -1 : a.name.localeCompare(b.name));

  const byMerchant = new Map<string, typeof rows>();
  for (const t of rows) { const key = merchantKey(t) || t.description; byMerchant.set(key, [...byMerchant.get(key) ?? [], t]); }
  const merchants: MerchantShare[] = [...byMerchant].map(([merchant, list]) => ({merchant, minor: out(list).toString(), count: list.length,
    category: list[0]!.category, evidence: list.map(t => t.id)}))
    .sort((a, b) => BigInt(b.minor) > BigInt(a.minor) ? 1 : BigInt(b.minor) < BigInt(a.minor) ? -1 : a.merchant.localeCompare(b.merchant)).slice(0, 5);

  const billList: Bill[] = bills(s).map(r => {
    const sample = s.transactions.find(t => t.id === r.evidence.at(-1));
    const cancelled = input.cancelled.has(r.merchant);
    return {merchant: sample?.description ?? r.merchant, category: sample?.category ?? 'Uncategorised', minor: r.minor, interval: r.interval,
      yearlyMinor: (BigInt(r.minor) * 365n / BigInt(r.interval)).toString(), nextDate: cancelled ? null : r.next, cancelled, evidence: r.evidence};
  }).sort((a, b) => BigInt(b.yearlyMinor) > BigInt(a.yearlyMinor) ? 1 : BigInt(b.yearlyMinor) < BigInt(a.yearlyMinor) ? -1 : a.merchant.localeCompare(b.merchant));

  // Ninety days for patterns: a weekday and a payday need more than one month to say anything.
  const pattern = spendingRows(s, shift(asOf, -89), asOf);
  const weekdays = new Map<Weekday, bigint>();
  for (const t of pattern) { const w = ((day(t.date) + 4) % 7) as Weekday; weekdays.set(w, (weekdays.get(w) ?? 0n) + abs(BigInt(t.minor))); }
  const busiest = [...weekdays].sort((a, b) => b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : a[0] - b[0])[0];

  const payDays = new Set<Day>([...s.pays.map(p => p.date), ...payModel(s).cycles.flatMap(c => c.pays.map(p => p.date))].filter(d => d >= shift(asOf, -89) && d <= asOf));
  let paydayEffect: Spending['paydayEffect'] = null;
  if (payDays.size) {
    const after = new Set([...payDays].flatMap(d => [d, shift(d, 1), shift(d, 2)]));
    const span = Math.min(90, day(asOf) - day(pattern[0]?.date ?? asOf) + 1);
    const inAfter = sum(pattern.filter(t => after.has(t.date)).map(t => abs(BigInt(t.minor)))), rest = out(pattern) - inAfter;
    const afterDays = BigInt([...after].filter(d => d <= asOf && d >= shift(asOf, -89)).length), otherDays = BigInt(Math.max(1, span)) - afterDays;
    if (afterDays > 0n && otherDays > 0n) {
      const a = inAfter / afterDays, o = rest / otherDays;
      paydayEffect = {afterPayDayMinor: a.toString(), otherDayMinor: o.toString(), ratio: share(a, o)};
    }
  }

  const band = moneyBand(s, asOf, 'today');
  const block = (b: typeof band.now): Band['now'] => ({start: b.start, end: b.end, inMinor: b.inMinor, outMinor: b.outMinor, netMinor: b.netMinor, evidence: b.ids, unconfirmed: b.unconfirmed});
  const toBand: Band = {start: band.start, end: band.end, comparable: band.comparable, trend: band.trend, now: block(band.now), before: block(band.before), blocks: band.blocks.map(block)};

  const days = Array.from({length: 7}, (_, i) => shift(asOf, i - 6)).map(date => ({date, minor: out(spendingRows(s, date, date)).toString()}));
  const thisStart = asOf.slice(0, 8) + '01', lastEnd = shift(thisStart, -1), lastStart = lastEnd.slice(0, 8) + '01';
  const small = rows.filter(t => abs(BigInt(t.minor)) <= smallLimit(s));

  return {
    window: {start, end: asOf, tier: tierFor(s, start, asOf)},
    thisMonth: month(s, thisStart, asOf), lastMonth: month(s, lastStart, lastEnd),
    categories, merchants, bills: billList, small: total(small),
    fees: total(rows.filter(t => t.category === 'Bank fees')),
    refunds: total(inflowRows(s, start, asOf).filter(t => t.kind === 'refund')),
    busiestWeekday: busiest ? {day: busiest[0], minor: busiest[1].toString()} : null,
    paydayEffect, band: toBand, days,
  };
}
