import { dayNumber } from '../ingest/normalize';
import type { LedgerRow, Payslip } from '../ingest/types';
export function payCycle(payslips: readonly Payslip[]): 'weekly' | 'fortnightly' | 'monthly' | '4-weekly' | 'irregular' | 'insufficient_data' {
  const dates = [...new Set(payslips.map(p => p.payDate))].sort(); if (dates.length < 3) return 'insufficient_data';
  const intervals = dates.slice(1).map((d, i) => dayNumber(d) - dayNumber(dates[i]!));
  if (intervals.every(d => d >= 6 && d <= 8)) return 'weekly';
  if (intervals.every(d => d >= 13 && d <= 15)) return 'fortnightly';
  if (intervals.every(d => d === 28)) return '4-weekly';
  if (intervals.every(d => d >= 28 && d <= 31) && dates.every(d => Math.abs(Number(d.slice(8)) - Number(dates[0]!.slice(8))) <= 3)) return 'monthly';
  return 'irregular';
}
export function linkNet(p: Payslip, rows: readonly LedgerRow[]): string | null { const found = rows.filter(r => r.currency === p.currency && r.minor === p.net && !r.transferGroup && !r.pending && Math.abs(dayNumber(r.date) - dayNumber(p.payDate)) <= 3); return found.length === 1 ? found[0]!.id : null; }
export function payMetrics(payslips: readonly Payslip[]) {
  if (new Set(payslips.map(p => p.currency)).size > 1) throw new Error('Compare payslips in one currency at a time.');
  const gross = payslips.reduce((s, p) => s + BigInt(p.gross), 0n), net = payslips.reduce((s, p) => s + BigInt(p.net), 0n), tax = payslips.reduce((s, p) => s + BigInt(p.tax), 0n);
  const distribution = payslips.map(p => BigInt(p.net)).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  const median = distribution[Math.floor(distribution.length / 2)] ?? 0n;
  const deviations = distribution.map(v => v > median ? v - median : median - v).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  const variabilityBasisPoints = payslips.length >= 3 && median > 0n ? deviations[Math.floor(deviations.length / 2)]! * 10000n / median : null;
  return { variabilityBasisPoints, takeHomeBasisPoints: gross > 0n ? net * 10000n / gross : null, taxBasisPoints: gross > 0n ? tax * 10000n / gross : null, distribution, cycle: payCycle(payslips) };
}
