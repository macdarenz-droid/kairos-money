import { describe, expect, it } from 'vitest';
import { documentFromExtracted } from '../src/ingest/sources';
import { accountTail, looksLikePayslip, statementDetails } from '../src/ingest/parse/statement-details';
import { hasStatementBalanceChain } from '../src/ingest/normalize/statement-evidence';
import { textLines, type TextItem } from '../src/ingest/parse/positional';
import { hash } from '../src/ingest/normalize';
import { balance } from '../src/ingest/reconcile';
import type { ImportContext } from '../src/ingest/types';

/**
 * A Westpac TRANSACTIONS REPORT: not a statement but a window somebody asked for, printed newest first,
 * each transaction on three lines — its description above the dated line, a continuation below — with
 * a Start Balance and an End Balance in the head. The layout is copied; every word and figure is made up.
 */
const RIGHT = { withdrawal: 383.4, deposit: 463, balance: 553.5 };
export function report(): { items: TextItem[]; text: string } {
  const items: TextItem[] = [];
  const put = (page: number, y: number, x: number, text: string, width = text.length * 4.4) => items.push({ page, y, x, text, width });
  const money = (page: number, y: number, column: keyof typeof RIGHT, text: string) => put(page, y, RIGHT[column] - text.length * 4.4, text);
  const header = (page: number) => { put(page, 466.4, 41.7, 'Date'); put(page, 466.4, 132.7, 'Description'); put(page, 466.4, 343.9, 'Withdrawal'); put(page, 466.4, 435.9, 'Deposit'); put(page, 466.4, 524.6, 'Balance'); };
  const row = (page: number, y: number, date: string, above: string, below: string | null, column: 'withdrawal' | 'deposit', amount: string, runningBalance: string, onLine?: string) => {
    put(page, y - 4.8, 132.7, above); put(page, y, 41.7, date); if (onLine) put(page, y, 132.7, onLine);
    money(page, y, column, amount); money(page, y, 'balance', runningBalance); if (below) put(page, y + 4.8, 132.7, below);
  };
  put(1, 131.3, 251.4, 'Westpac Choice'); put(1, 145.7, 241.7, 'Transactions report');
  put(1, 186.3, 36, 'SYNTHETIC HOLDER'); put(1, 186.3, 319.5, 'Account/Card number');
  put(1, 198.3, 36, '1 SYNTHETIC STREET'); put(1, 198.3, 319.5, '111-222 333444');
  put(1, 275.7, 36, 'This report covers transactions from 01-Feb-2026 to 03-Feb-2026 as at 04-Feb-2026 9:00 am.');
  put(1, 332.2, 320.5, 'Start Balance'); put(1, 332.2, 503, '+$100.00'); put(1, 334.9, 36, 'Current balance: +$136.10');
  put(1, 417.2, 320.5, 'End Balance'); put(1, 417.2, 503, '+$136.10');
  header(1);
  row(1, 494.5, '03 Feb 2026', 'DEBIT CARD PURCHASE Synthetic Stream', 'Transaction Fee AUD $0.11', 'withdrawal', '-$3.90', '$136.10', 'Synthetic HKG PHP 169.00 incl. Foreign');
  row(1, 525.1, '02 Feb 2026', 'DEPOSIT Synthetic Employer', 'PAYMENT', 'deposit', '$50.00', '$140.00');
  put(1, 754.3, 36, 'Copyright © Synthetic Banking Corporation'); put(1, 788.1, 36, 'Date created'); put(1, 788.1, 96, ': 04-Feb-2026 9:00 am');
  header(2);
  // Two purchases, one description, one amount, one day: the shape that used to collapse into one.
  row(2, 494.5, '01 Feb 2026', 'DEBIT CARD PURCHASE Synthetic Cafe', 'SYNTHETIC TOWN AUS', 'withdrawal', '-$5.00', '$90.00');
  row(2, 525.1, '01 Feb 2026', 'DEBIT CARD PURCHASE Synthetic Cafe', 'SYNTHETIC TOWN AUS', 'withdrawal', '-$5.00', '$95.00');
  put(2, 600, 36, 'Things you should know'); put(2, 754.3, 36, 'Copyright © Synthetic Banking Corporation');
  return { items, text: textLines(items).map(line => line.items.map(i => i.text).join(' ')).join('\n') };
}
const context: ImportContext = { accountId: 'a', accountKind: 'checking', currency: 'AUD', period: { start: '2026-02-01', end: '2026-02-03' }, dateOrder: 'DMY', decimal: '.', creditPositivePurchases: false };
const extracted = (fixture = report()) => ({ kind: 'pdf' as const, text: fixture.text, items: fixture.items, table: null, ocr: false, issuer: 'westpac' });

describe('a Westpac transactions report', () => {
  it('states its own period and balances, and they are read', () => {
    expect(statementDetails(report().text)).toEqual({ start: '2026-02-01', end: '2026-02-03', opening: '100.00', closing: '136.10' });
    // The report also says "Westpac Choice", and the statement wording it lacks must not be demanded of it.
    expect(statementDetails('Westpac Choice Transactions report This report covers transactions from 01-Feb-2026 to 03-Feb-2026 Start Balance -$12.00 End Balance +$3.00')).toEqual({ start: '2026-02-01', end: '2026-02-03', opening: '-12.00', closing: '3.00' });
    expect(statementDetails('Westpac Choice Transactions report This report covers transactions from 01-Feb-2026 to 03-Feb-2026 Start Balance +$1.00')).toBeNull();
    expect(statementDetails('Westpac Choice Transactions report This report covers transactions from 03-Feb-2026 to 01-Feb-2026 Start Balance +$1.00 End Balance +$1.00')).toBeNull();
  });
  it('names the account by its last four digits, and is not a payslip', () => {
    expect(accountTail(report().text)).toBe('3444');
    expect(accountTail('Copyright © Synthetic Banking Corporation ABN 11 222 333 444')).toBeNull();
    expect(looksLikePayslip(report().text)).toBe(false);
    expect(looksLikePayslip('Employer: Synthetic Pty Ltd\nPay date: 15/03/2026\nGross: 1000.00\nNet: 800.00')).toBe(true);
  });
  it('reads every row, newest first, with the lines above and below each date joined to it', () => {
    const doc = documentFromExtracted(extracted(), hash('report'), 'synthetic-report.pdf', context, '100.00', '136.10', false);
    expect(doc.parser).toBe('positional-table-v1');
    expect(doc.rows.map(r => [r.date, r.minor, r.runningBalance])).toEqual([
      ['2026-02-03', '-390', '13610'], ['2026-02-02', '5000', '14000'], ['2026-02-01', '-500', '9000'], ['2026-02-01', '-500', '9500']]);
    expect(doc.rows[0]!.description).toBe('DEBIT CARD PURCHASE Synthetic Stream Synthetic HKG PHP 169.00 incl. Foreign Transaction Fee AUD $0.11');
    expect(doc.rows[1]!.description).toBe('DEPOSIT Synthetic Employer PAYMENT');
  });
  it('verifies the balance chain from the end back to the start, so two identical purchases stay two', () => {
    const doc = documentFromExtracted(extracted(), hash('report'), 'synthetic-report.pdf', context, '100.00', '136.10', false);
    expect(hasStatementBalanceChain(doc)).toBe(true);
    expect(doc.rows.every(r => r.occurrence.startsWith('statement-balance:'))).toBe(true);
    expect(new Set(doc.rows.map(r => r.fingerprint)).size).toBe(4);
    expect(balance({ ...doc, integrityTier: 'A' })).toEqual({ valid: true, difference: 0n });
  });
  it('marks nothing when the chain does not hold, and the collapse then shows up as a mismatch', () => {
    const doc = documentFromExtracted(extracted(), hash('report'), 'synthetic-report.pdf', context, '100.00', '131.10', false);
    expect(hasStatementBalanceChain(doc)).toBe(false);
    expect(doc.rows.every(r => r.occurrence === '')).toBe(true);
    expect(new Set(doc.rows.map(r => r.fingerprint)).size).toBe(3);
    expect(balance({ ...doc, integrityTier: 'A' }).valid).toBe(false);
  });
});
