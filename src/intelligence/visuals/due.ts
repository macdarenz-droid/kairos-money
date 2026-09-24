import {day, shift} from '../model';
import {scheduledDates, type Recurrence} from '../forecast';
import {displayRatio} from './index';

/**
 * WHAT LEAVES, AND WHETHER IT LANDS BEFORE OR AFTER YOU GET PAID.
 *
 * The app has known every one of these dates for a long time — recurrences() returns the next date for
 * each repeating payment, and scheduledDates() expands it. Nothing ever drew them. A list of amounts is
 * not the thing anybody needs; the thing anybody needs is WHEN, against the one date that decides
 * whether a bill is fine or a problem.
 *
 * That is the whole reason payday is on this strip. The same ₱2,000 is unremarkable the day after you
 * are paid and a crisis the day before. An amount alone cannot say which.
 */
export const HORIZON_DAYS = 30;

export type Due = {
  date: string;
  /** Days from today, 0-based, so the screen never does date arithmetic. */
  offset: number;
  merchant: string;
  minor: string;
  /** Height as signed millionths of the largest bill in the window. */
  height: string;
  /** True when this falls on or before the next pay date — the ones that have to come out of what you hold now. */
  beforePay: boolean;
};

export type DueWindow = {
  days: number;
  dues: Due[];
  /** Offset of the next pay date, or null when the ledger cannot say when that is. */
  payOffset: number | null;
  /** Everything due before the next pay, which is the figure that actually has to be covered. */
  beforePayMinor: string;
};

/**
 * @param asOf today, as the ledger understands it
 * @param nextPay the next pay date, or null when there are too few payslips to know
 */
export function dueWindow(recurrences: readonly Recurrence[], asOf: string, nextPay: string | null,
  days = HORIZON_DAYS): DueWindow {
  const through = shift(asOf, days);
  const raw = recurrences.flatMap(r =>
    scheduledDates(r, through).map(date => ({date, merchant: r.merchant, minor: r.minor})));
  // Largest first at the same date, then by name, so two bills on one day always draw in the same order.
  raw.sort((a, b) => a.date.localeCompare(b.date)
    || (BigInt(b.minor) > BigInt(a.minor) ? 1 : BigInt(b.minor) < BigInt(a.minor) ? -1 : 0)
    || a.merchant.localeCompare(b.merchant));
  // Heights are relative to the biggest bill in view, not to some fixed amount: the strip answers
  // "which of these is the big one", and it has to work whether the largest is 500 or 500,000.
  const largest = raw.reduce((most, r) => BigInt(r.minor) > most ? BigInt(r.minor) : most, 0n);
  const payOffset = nextPay && nextPay > asOf && day(nextPay) - day(asOf) <= days ? day(nextPay) - day(asOf) : null;
  const dues = raw.map(r => ({
    ...r,
    offset: day(r.date) - day(asOf),
    height: largest > 0n ? displayRatio(r.minor, largest.toString()) : '0',
    beforePay: nextPay === null ? false : r.date <= nextPay,
  }));
  return {days, dues, payOffset,
    beforePayMinor: dues.filter(d => d.beforePay).reduce((total, d) => total + BigInt(d.minor), 0n).toString()};
}
