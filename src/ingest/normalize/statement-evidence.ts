import type { Document } from '../types';
import { rowFingerprint } from './index';

// A complete, ordered balance chain distinguishes repeated purchases without
// relying on a file name, page number or an arbitrary per-import row ID.
//
// THE FILE DECIDES THE DIRECTION. A statement prints oldest first; a transactions report prints newest
// first, and its chain reads from the closing balance back to the opening one. Walking only forwards
// declared a perfectly good report unverifiable, and then every identical purchase in it — five $5.00
// stops at the same servo in one day — collapsed into one, and the balance came out short by exactly
// the purchases that were dropped. Both directions are tried; the arithmetic is the same either way.
export function hasStatementBalanceChain(doc: Document): boolean {
  if (doc.payslip || !doc.rows.length || doc.rows.some(row => row.pending || row.runningBalance === undefined)) return false;
  const chains = (rows: Document['rows']) => {
    let current = BigInt(doc.opening);
    for (const row of rows) {
      current += BigInt(row.minor);
      if (current !== BigInt(row.runningBalance!)) return false;
    }
    return current === BigInt(doc.closing);
  };
  return chains(doc.rows) || chains([...doc.rows].reverse());
}
export function distinguishStatementRows(doc: Document): Document {
  if (!hasStatementBalanceChain(doc)) return doc;
  for (const row of doc.rows) {
    row.occurrence = `statement-balance:${row.runningBalance!}`;
    row.fingerprint = rowFingerprint(row);
  }
  return doc;
}
export function isBalanceOccurrence(value: string): boolean { return /^statement-balance:-?\d+$/.test(value); }

// An export has no balance to tell repeats apart, but a day's list is the same in every export that
// covers it, so the second identical row that day is the same second purchase in each.
export function distinguishRepeats(doc: Document): Document {
  const seen = new Map<string, number>();
  for (const row of doc.rows) {
    const count = (seen.get(row.fingerprint) ?? 0) + 1;
    seen.set(row.fingerprint, count);
    if (count > 1) { row.occurrence = `repeat:${count}`; row.fingerprint = rowFingerprint(row); }
  }
  return doc;
}
export function isRepeatOccurrence(value: string): boolean { return /^repeat:\d+$/.test(value); }
