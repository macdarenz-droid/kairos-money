import {currencyDigits} from '../core/money';
import {merchantName} from '../ingest/normalize';
import {abs, day, iso, median, shift, sum, type Snapshot, type Transaction} from '../intelligence/model';
import {payCycle, recurrences, type Recurrence} from '../intelligence/forecast';
import {nextPayDate} from '../intelligence/method';
import type {Day, Tier, UpTo3} from './types';

/** One definition of each basic idea; every other brain module asks these. */

/** The first three at most, typed so a fourth cannot ship. */
export const upTo3 = <T>(list: readonly T[]): UpTo3<T> => list.length === 0 ? [] : list.length === 1 ? [list[0]!]
  : list.length === 2 ? [list[0]!, list[1]!] : [list[0]!, list[1]!, list[2]!];

/** The merchant key the rules, the categoriser and the brain share. */
export const merchantKey = (t: Pick<Transaction, 'description'>) => merchantName(t.description);

/** A purchase at or under 15 units of the display currency is small (owner decision 2026-09-24). */
export const SMALL_UNITS = 15n;
export const smallLimit = (s: Snapshot) => SMALL_UNITS * 10n ** BigInt(currencyDigits[s.currency]);

const inView = (s: Snapshot, t: Transaction) => t.currency === s.currency && s.accountIds.includes(t.accountId) && t.date <= s.asOf;

/** Money that left: settled, not a transfer, not money kept. Pending rows and transfers never count. */
export function spendingRows(s: Snapshot, start: Day, end: Day): Transaction[] {
  return s.transactions.filter(t => inView(s, t) && t.status === 'settled' && !t.transfer && t.kind !== 'transfer'
    && t.kind !== 'savings' && BigInt(t.minor) < 0n && t.date >= start && t.date <= end);
}
/** Money that arrived and was not a transfer, including refunds. */
export function inflowRows(s: Snapshot, start: Day, end: Day): Transaction[] {
  return s.transactions.filter(t => inView(s, t) && t.status === 'settled' && !t.transfer && t.kind !== 'transfer'
    && BigInt(t.minor) > 0n && t.date >= start && t.date <= end);
}
export const out = (rows: readonly Transaction[]) => sum(rows.map(t => abs(BigInt(t.minor))));

/** Income: payslips when there are any, otherwise rows of kind income. Refunds are never income. */
export function income(s: Snapshot, start: Day, end: Day): {minor: bigint; source: 'payslips' | 'ledger' | 'none'; evidence: string[]} {
  const slips = s.pays.filter(p => p.currency === s.currency && p.date >= start && p.date <= end);
  if (slips.length) return {minor: sum(slips.map(p => BigInt(p.net))), source: 'payslips', evidence: slips.flatMap(p => p.transactionId ? [p.transactionId] : [])};
  const rows = inflowRows(s, start, end).filter(t => t.kind === 'income');
  const minor = sum(rows.map(t => BigInt(t.minor)));
  return {minor, source: minor > 0n ? 'ledger' : 'none', evidence: rows.map(t => t.id)};
}

/** Every account covered on that day. */
function coveredOn(s: Snapshot, date: Day) {
  return s.accountIds.length > 0 && s.accountIds.every(id => s.coverage.some(c => c.accountId === id && c.start <= date && c.end >= date));
}
/** How far a window can be trusted. It labels; it never hides what was recorded (ADR 0025). */
export function tierFor(s: Snapshot, start: Day, end: Day): Tier {
  let all = true;
  for (let d = day(start); d <= day(end); d++) if (!coveredOn(s, iso(d))) { all = false; break; }
  if (all) return 'verified';
  return s.transactions.some(t => inView(s, t) && t.date >= start && t.date <= end) ? 'recorded' : 'insufficient';
}
export function coveredDays(s: Snapshot, start: Day, end: Day): {covered: number; gaps: {start: Day; end: Day}[]} {
  let covered = 0, open: Day | null = null;
  const gaps: {start: Day; end: Day}[] = [];
  for (let d = day(start); d <= day(end); d++) {
    const date = iso(d);
    if (coveredOn(s, date)) { covered++; if (open) { gaps.push({start: open, end: shift(date, -1)}); open = null; } }
    else if (!open) open = date;
  }
  if (open) gaps.push({start: open, end});
  return {covered, gaps};
}

/** Repeats proved by the payments themselves (forecast.recurrences), with or without statements. */
export const bills = (s: Snapshot): Recurrence[] => recurrences(s, {requireCoverage: false});

/** The pay model: forecast pay cycles and the next pay date. */
export const payModel = (s: Snapshot) => ({cycles: payCycle(s), next: nextPayDate(s)});

/** The one unusual-charge rule: a recent charge at least 3× a merchant's usual, from five or more visits. */
export const UNUSUAL_MULTIPLE = 3n;
export const UNUSUAL_RECENT_DAYS = 7;
export function unusualCharge(s: Snapshot): {row: Transaction; usual: bigint} | null {
  const rows = spendingRows(s, shift(s.asOf, -179), s.asOf);
  const typical = median(rows.map(t => abs(BigInt(t.minor))));
  const byMerchant = new Map<string, Transaction[]>();
  for (const t of rows) { const key = merchantKey(t); if (key) byMerchant.set(key, [...byMerchant.get(key) ?? [], t]); }
  let worst: {row: Transaction; usual: bigint} | null = null;
  for (const list of byMerchant.values()) {
    if (list.length < 5) continue;
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const latest = sorted.at(-1)!;
    if (day(s.asOf) - day(latest.date) > UNUSUAL_RECENT_DAYS) continue;
    const usual = median(sorted.slice(0, -1).map(t => abs(BigInt(t.minor)))), amount = abs(BigInt(latest.minor));
    if (usual <= 0n || amount < usual * UNUSUAL_MULTIPLE || amount - usual < typical) continue;
    if (!worst || amount - usual > abs(BigInt(worst.row.minor)) - worst.usual) worst = {row: latest, usual};
  }
  return worst;
}
