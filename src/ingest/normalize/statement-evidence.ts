import type { Document } from '../types';
import { rowFingerprint } from './index';

// A complete, ordered balance chain distinguishes repeated purchases without
// relying on a file name, page number or an arbitrary per-import row ID.
export function hasStatementBalanceChain(doc: Document): boolean {
  if (doc.payslip || !doc.rows.length || doc.rows.some(row => row.pending || row.runningBalance === undefined)) return false;
  let current = BigInt(doc.opening);
  for (const row of doc.rows) {
    current += BigInt(row.minor);
    if (current !== BigInt(row.runningBalance!)) return false;
  }
  return current === BigInt(doc.closing);
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
