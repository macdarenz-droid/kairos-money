import type { Currency } from '../core/money';
import type { AccountKind } from '../core/db/repository';
export type Period = { start: string; end: string };
export type ImportContext = { accountId: string; accountKind: AccountKind; currency: Currency; period: Period; dateOrder: 'DMY' | 'MDY'; decimal: '.' | ','; creditPositivePurchases: boolean };
export type RawRow = { sourceId: string; date: string; description: string; amount: string; direction?: 'debit' | 'credit'; reference?: string; pending?: boolean; runningBalance?: string; mcc?: string; confidence: number };
export type NormalizedRow = { sourceId: string; accountId: string; date: string; description: string; merchant: string; minor: string; currency: Currency; reference: string; pending: boolean; status?: 'pending' | 'settled'; runningBalance?: string; confidence: number; fingerprint: string; issues: string[]; category: string | null; verified: boolean; duplicateOf: string | null; occurrence: string; createRule: boolean; mcc: string | null; categoryFrom?: 'suggestion' };
export type Payslip = { employer: string; payDate: string; period: Period; currency: Currency; gross: string; net: string; tax: string; super: string; deductions: { name: string; minor: string }[]; allowances: { name: string; minor: string }[]; ytd: Record<string, string> };
export type Document = { id: string; hash: string; fileName: string; parser: string; context: ImportContext; opening: string; closing: string; rows: NormalizedRow[]; payslip: Payslip | null; sessionId?: string; sourceRank?: number; sourceKind?: 'statement' | 'export'; integrityTier?: 'A' | 'B' | 'C'; rawRows?: RawRow[]; sourceText?: string };
export type Batch = Document & { status: 'staged' | 'committed' | 'rolled_back' | 'quarantined' };
export type BatchSummary = Pick<Batch, 'id' | 'fileName' | 'status' | 'integrityTier' | 'sessionId' | 'payslip'> & {
  context: Pick<ImportContext, 'accountId' | 'period'>;
};
export type LedgerRow = NormalizedRow & { id: string; owner: string; transferGroup: string | null;
  sources: { batchId: string; sourceId: string }[];
  /** Set when this row was typed in by hand: the manual entry it came from, so it can be edited or removed. */
  manualId?: string;
  /** Set when this row came from an approved bank notification: the notice's own id, so it can be removed.
   * There is no statement behind it to disagree with, only a notification the owner approved — unlike a
   * statement row, it stays revocable. */
  noticeId?: string };
export class ImportFailure extends Error {
  constructor(public understood: string, public unreadable: string, public excerpt: string, public action: string) { super(`${unreadable} ${action}`); this.name = 'ImportFailure'; }
}

/**
 * The date says exactly one thing; it simply falls outside the window the person declared.
 *
 * Separated from an unreadable or an ambiguous date because THE REMEDY IS DIFFERENT. One message
 * covered both — "The date is ambiguous or outside the statement period. Confirm the statement dates
 * and date format." — and it sent people to the date-format dropdown, which in the case that actually
 * happens is already correct. Naming the date, the boundary it misses and which field to change turns
 * a dead end into one edit.
 */
export class DateOutsidePeriod extends ImportFailure {
  constructor(public readonly date: string, public readonly period: Period) {
    super('The date was read.',
      date < period.start
        ? `${date} is before the statement start ${period.start}.`
        : `${date} is after the statement end ${period.end}.`,
      date,
      date < period.start
        ? `Set the statement start on or before ${date}.`
        : `Set the statement end on or after ${date}.`);
    this.name = 'DateOutsidePeriod';
  }
}

/**
 * The whole file's dates were read, and the declared period leaves some of them out.
 *
 * DateOutsidePeriod names the first row that failed, which is no help when a file spans three months
 * outside the window: fixing that one date only reveals the next. This names the file's own first and
 * last date, so one edit covers every row, and it carries them so the screen can offer that edit.
 */
export class PeriodTooNarrow extends ImportFailure {
  constructor(public readonly span: Period, public readonly period: Period) {
    // Deliberately short. The excerpt above already shows the span and the two date fields above THAT
    // already show the period, so restating either here is the same fact three times on one screen.
    super('The transaction dates were read.',
      `This file covers ${span.start} to ${span.end}.`,
      `${span.start} … ${span.end}`,
      'The statement period set here leaves part of it out.');
    this.name = 'PeriodTooNarrow';
  }
}
