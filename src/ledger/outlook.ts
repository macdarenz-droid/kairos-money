import { currency, type Currency } from '../core/money';
import type { Account } from '../core/db/repository';
import { coveredDays, coverage, gaps } from '../ingest/reconcile';
import { dayNumber, shiftDay } from '../ingest/normalize';
import type { Batch, LedgerRow } from '../ingest/types';

const liquidTypes = new Set(['checking', 'savings', 'cash']);
type Recurring = { merchant: string; accountId: string; currency: Currency; amount: bigint; cadence: string; nextDate: string };
type Unusual = { row: LedgerRow; baseline: bigint };
export type Outlook = {
  forecasts: { currency: Currency; current: bigint; income30: bigint; spending30: bigint; commitments: bigint; reserve: bigint; safeToSpend: bigint; coveredDays: number; asOf: string }[];
  recurring: Recurring[];
  unusual: Unusual[];
  excludedAccounts: string[];
};

function clippedCoverage(accountId: string, batches: readonly Batch[], start: string, today: string) {
  const ranges = coverage(batches.filter(batch => batch.status === 'committed' && !batch.payslip && batch.context.accountId === accountId).map(batch => batch.context.period));
  const clipped = ranges.flatMap(range => { const left = range.start < start ? start : range.start, right = range.end > today ? today : range.end; return left <= right ? [{ start: left, end: right }] : []; });
  return { ranges, days: coveredDays(clipped), asOf: ranges.filter(range => range.start <= today).map(range => range.end > today ? today : range.end).sort().at(-1) ?? null };
}

function verifiedClosing(accountId: string, batches: readonly Batch[], today: string): Batch | null {
  return batches.filter(batch => batch.status === 'committed' && !batch.payslip && batch.integrityTier === 'A' && batch.context.accountId === accountId && batch.context.period.end <= today)
    .sort((a, b) => b.context.period.end.localeCompare(a.context.period.end) || b.id.localeCompare(a.id))[0] ?? null;
}

function median(values: bigint[]): bigint {
  const sorted = [...values].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  if (!sorted.length) return 0n;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2n;
}

function medianInterval(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[(sorted.length - 1) >> 1]!;
}

function recurringPayments(rows: readonly LedgerRow[], batches: readonly Batch[], today: string): Recurring[] {
  const from = shiftDay(today, -180), fresh = new Set(batches.filter(batch => batch.status === 'committed' && !batch.payslip && batch.context.period.end >= shiftDay(today, -7)).map(batch => batch.context.accountId)), grouped = new Map<string, LedgerRow[]>();
  for (const row of rows) {
    if (row.date < from || row.date > today || !fresh.has(row.accountId) || row.pending || row.transferGroup || BigInt(row.minor) >= 0n || !row.merchant) continue;
    const key = `${row.accountId}\u0000${row.currency}\u0000${row.merchant}`;
    const list = grouped.get(key) ?? []; list.push(row); grouped.set(key, list);
  }
  const result: Recurring[] = [];
  for (const list of grouped.values()) {
    const ordered = [...list].sort((a, b) => a.date.localeCompare(b.date)), intervals = ordered.slice(1).map((row, index) => dayNumber(row.date) - dayNumber(ordered[index]!.date));
    if (intervals.length < 2) continue;
    const cadenceDays = medianInterval(intervals);
    const cadence = cadenceDays >= 6 && cadenceDays <= 9 ? 'weekly' : cadenceDays >= 12 && cadenceDays <= 16 ? 'fortnightly' : cadenceDays >= 26 && cadenceDays <= 34 ? 'about monthly' : '';
    if (!cadence) continue;
    const amounts = ordered.map(row => -BigInt(row.minor)), typical = median(amounts);
    if (typical <= 0n || amounts.some(amount => amount * 100n > typical * 125n || typical * 100n > amount * 125n)) continue;
    const recentIntervals = intervals.slice(-3), tolerance = Math.max(2, Math.floor(cadenceDays / 7)), stable = recentIntervals.every(days => Math.abs(days - cadenceDays) <= tolerance);
    if (!stable) continue;
    const nextDate = shiftDay(ordered.at(-1)!.date, cadenceDays);
    if (nextDate >= today && dayNumber(nextDate) - dayNumber(today) <= 35) result.push({ merchant: ordered.at(-1)!.merchant, accountId: ordered.at(-1)!.accountId, currency: currency(ordered.at(-1)!.currency), amount: typical, cadence, nextDate });
  }
  return result.sort((a, b) => a.nextDate.localeCompare(b.nextDate)).slice(0, 8);
}

function unusualTransactions(rows: readonly LedgerRow[], batches: readonly Batch[], today: string): Unusual[] {
  const start = shiftDay(today, -120), recentStart = shiftDay(today, -14), fresh = new Set<string>();
  for (const batch of batches) if (batch.status === 'committed' && !batch.payslip && batch.context.period.end >= shiftDay(today, -7)) fresh.add(batch.context.accountId);
  const groups = new Map<string, LedgerRow[]>();
  for (const row of rows) if (row.date >= start && row.date < recentStart && !row.pending && !row.transferGroup && BigInt(row.minor) < 0n) {
    const key = `${row.accountId}\u0000${row.currency}\u0000${row.merchant}`; const list = groups.get(key) ?? []; list.push(row); groups.set(key, list);
  }
  const unusual: Unusual[] = [];
  for (const row of rows) {
    if (row.date < recentStart || row.date > today || row.pending || row.transferGroup || BigInt(row.minor) >= 0n || !fresh.has(row.accountId)) continue;
    const key = `${row.accountId}\u0000${row.currency}\u0000${row.merchant}`, history = groups.get(key) ?? [];
    if (history.length < 4) continue;
    const baseline = median(history.map(item => -BigInt(item.minor))), amount = -BigInt(row.minor);
    if (baseline > 0n && amount >= baseline * 2n) unusual.push({ row, baseline });
  }
  return unusual.sort((a, b) => BigInt(a.row.minor) < BigInt(b.row.minor) ? -1 : 1).slice(0, 5);
}

export function moneyOutlook(rows: readonly LedgerRow[], accounts: readonly Account[], batches: readonly Batch[], today: string): Outlook {
  const start = shiftDay(today, -89), eligible = accounts.filter(account => liquidTypes.has(account.type) && !account.archived_at);
  const accountFacts = eligible.map(account => ({ account, ...clippedCoverage(account.id, batches, start, today), closingStatement: verifiedClosing(account.id, batches, today) }));
  const usable = accountFacts.filter(item => {
    if (!item.asOf || !item.closingStatement || dayNumber(today) - dayNumber(item.asOf) > 7 || item.days < 45) return false;
    const closeDate = item.closingStatement.context.period.end;
    return item.asOf <= closeDate || gaps(item.ranges, { start: shiftDay(closeDate, 1), end: item.asOf }).length === 0;
  });
  const excludedAccounts = accountFacts.filter(item => !usable.some(kept => kept.account.id === item.account.id)).map(item => item.account.name);
  const codes = [...new Set(usable.map(item => item.account.currency))];
  const forecasts = codes.map(code => {
    const group = usable.filter(item => item.account.currency === code); let current = 0n, income30 = 0n, spending30 = 0n, commitments = 0n, days = 0, asOf = '';
    for (const item of group) {
      const closeDate = item.closingStatement!.context.period.end;
      current += BigInt(item.closingStatement!.closing);
      for (const row of rows) if (row.accountId === item.account.id && row.date > closeDate && row.date <= item.asOf! && !row.pending) current += BigInt(row.minor);
      const accountRows = rows.filter(row => row.accountId === item.account.id && row.date >= start && row.date <= today && !row.pending && !row.transferGroup);
      const income = accountRows.reduce((sum, row) => sum + (BigInt(row.minor) > 0n ? BigInt(row.minor) : 0n), 0n);
      const spending = accountRows.reduce((sum, row) => sum + (BigInt(row.minor) < 0n ? -BigInt(row.minor) : 0n), 0n);
      commitments += rows.filter(row => row.accountId === item.account.id && row.date <= today && row.pending && !row.transferGroup && BigInt(row.minor) < 0n).reduce((sum, row) => sum - BigInt(row.minor), 0n);
      income30 += income * 30n / BigInt(item.days); spending30 += spending * 30n / BigInt(item.days); days = Math.max(days, item.days); asOf = item.asOf! > asOf ? item.asOf! : asOf;
    }
    const reserve = spending30 * 7n / 30n, projected = current + income30 - spending30 - commitments, safeToSpend = projected - reserve;
    return { currency: currency(code), current, income30, spending30, commitments, reserve, safeToSpend: safeToSpend > 0n ? safeToSpend : 0n, coveredDays: days, asOf };
  });
  return { forecasts, recurring: recurringPayments(rows, batches, today), unusual: unusualTransactions(rows, batches, today), excludedAccounts };
}
