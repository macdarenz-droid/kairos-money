import {describe, expect, it} from 'vitest';
import {openingBalance} from '../src/ingest/integrity';
import {normalizeRow} from '../src/ingest/normalize';
import type {Document, ImportContext} from '../src/ingest/types';

const context: ImportContext = {accountId: 'a', accountKind: 'checking', currency: 'AUD',
  period: {start: '2026-01-01', end: '2026-01-31'}, dateOrder: 'DMY', decimal: '.', creditPositivePurchases: false};

/** A statement carrying the bank's own running balance beside every row, as printed: decimals. */
function statement(rows: {date: string; amount: string; balance?: string}[]): Document {
  return {id: 'b', hash: 'h', fileName: 'synthetic.csv', parser: 'synthetic', context,
    opening: '0', closing: '0', payslip: null, sourceRank: 3, sourceKind: 'export', integrityTier: 'B',
    rows: rows.map((r, i) => ({
      ...normalizeRow({sourceId: String(i), description: 'Synthetic payee', confidence: 9800,
        date: r.date, amount: r.amount, ...(r.balance === undefined ? {} : {runningBalance: r.balance})}, context),
      issues: [], verified: true}))};
}

describe('the balance an account held before its first statement row', () => {
  /**
   * An account opened at zero and fed a statement showed the SUM OF THE MOVEMENTS — honest, and the
   * wrong figure: what changed rather than what is there. One row's running balance minus that row's
   * own amount is the balance immediately before it, exactly.
   */
  it('is the first row’s balance less that row’s own amount', () => {
    // Held 100.00, spent 12.00 leaving 88.00, then 8.00 leaving 80.00.
    const doc = statement([
      {date: '2026-01-02', amount: '-12.00', balance: '88.00'},
      {date: '2026-01-03', amount: '-8.00', balance: '80.00'},
    ]);
    expect(openingBalance(doc)).toBe(10000n);
  });

  /** Banks list newest-first as often as oldest-first, and the dates alone cannot settle which. */
  it('reads a statement listed newest first', () => {
    const doc = statement([
      {date: '2026-01-03', amount: '-8.00', balance: '80.00'},
      {date: '2026-01-02', amount: '-12.00', balance: '88.00'},
    ]);
    expect(openingBalance(doc)).toBe(10000n);
  });

  it('comes back out as the closing balance when the movements are added to it', () => {
    const doc = statement([
      {date: '2026-01-02', amount: '-12.00', balance: '88.00'},
      {date: '2026-01-03', amount: '+40.00', balance: '128.00'},
      {date: '2026-01-04', amount: '-8.00', balance: '120.00'},
    ]);
    const opening = openingBalance(doc)!;
    const movements = doc.rows.reduce((total, r) => total + BigInt(r.minor), 0n);
    expect(opening).toBe(10000n);
    expect(opening + movements).toBe(12000n);
  });

  /** A column that does not chain cannot say what came before it, so it says nothing. */
  it('refuses a running balance that does not add up', () => {
    expect(openingBalance(statement([
      {date: '2026-01-02', amount: '-12.00', balance: '88.00'},
      {date: '2026-01-03', amount: '-8.00', balance: '79.99'},
    ]))).toBeNull();
  });

  it('refuses a statement with no running balance at all', () => {
    expect(openingBalance(statement([
      {date: '2026-01-02', amount: '-12.00'},
      {date: '2026-01-03', amount: '-8.00'},
    ]))).toBeNull();
  });

  it('refuses a single row, which chains with nothing', () => {
    expect(openingBalance(statement([{date: '2026-01-02', amount: '-12.00', balance: '88.00'}]))).toBeNull();
  });

  /** An account that was overdrawn before the statement starts is a real answer, not an error. */
  it('reports a negative opening balance as readily as a positive one', () => {
    const doc = statement([
      {date: '2026-01-02', amount: '-12.00', balance: '-22.00'},
      {date: '2026-01-03', amount: '+50.00', balance: '28.00'},
    ]);
    expect(openingBalance(doc)).toBe(-1000n);
  });

  /** Several rows on one day: the running balance defines the order, and the dates cannot. */
  it('follows the balance rather than the dates when a day repeats', () => {
    const doc = statement([
      {date: '2026-01-02', amount: '-12.00', balance: '88.00'},
      {date: '2026-01-02', amount: '-8.00', balance: '80.00'},
      {date: '2026-01-02', amount: '-30.00', balance: '50.00'},
    ]);
    expect(openingBalance(doc)).toBe(10000n);
  });
});
