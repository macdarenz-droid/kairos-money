import { describe, expect, it, vi } from 'vitest';
import { FileSource } from '../src/ingest/sources';
import { hash } from '../src/ingest/normalize';
import { textLines, type TextItem } from '../src/ingest/parse/positional';
import { balance } from '../src/ingest/reconcile';
import type { ImportContext } from '../src/ingest/types';
import { memoryDriver } from './db-helper';
import { migrate } from '../src/core/db/migrate';
import { repository } from '../src/core/db/repository';
import { report } from './westpac-report.test';

/**
 * "when i import something, i dont want to fill up any dates, opening or closing. The app should do that
 * for me." Every kind of file the app takes, inspected before anyone is asked anything.
 */
const RIGHT = { withdrawal: 383.4, deposit: 463, balance: 553.5 };
/** A plain export-style PDF: dated lines with a running balance, and no head stating anything. */
function plainPdf(withBalances = true): { items: TextItem[]; text: string } {
  const items: TextItem[] = [];
  const put = (y: number, x: number, text: string) => items.push({ page: 1, y, x, text, width: text.length * 4.4 });
  put(100, 41.7, 'Date'); put(100, 132.7, 'Description'); put(100, 343.9, 'Withdrawal'); put(100, 435.9, 'Deposit'); if (withBalances) put(100, 524.6, 'Balance');
  const row = (y: number, date: string, what: string, column: 'withdrawal' | 'deposit', amount: string, running: string) => {
    put(y, 41.7, date); put(y, 132.7, what); put(y, RIGHT[column] - amount.length * 4.4, amount); if (withBalances) put(y, RIGHT.balance - running.length * 4.4, running);
  };
  row(130, '07 Mar 2026', 'Synthetic cafe', 'withdrawal', '-$4.00', '$86.00');
  row(160, '05 Mar 2026', 'Synthetic shop', 'withdrawal', '-$10.00', '$90.00');
  return { items, text: textLines(items).map(line => line.items.map(i => i.text).join(' ')).join('\n') };
}
const PAYSLIP = 'Synthetic Pty Ltd payslip\nEmployer: Synthetic Pty Ltd\nPay date: 15/03/2026\nPeriod start: 01/03/2026\nPeriod end: 14/03/2026\nGross: 1000.00\nNet: 800.00\nTax: 200.00\nSuper: 100.00';
vi.mock('../src/ingest/extract', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/ingest/extract')>();
  return { ...actual, extract: async (bytes: Uint8Array, name: string, progress?: (m: string) => void) => {
    if (name === 'synthetic-report.pdf') { const r = report(); return { kind: 'pdf', text: r.text, items: r.items, table: null, ocr: false, issuer: 'westpac' }; }
    if (name === 'synthetic-plain.pdf') { const r = plainPdf(); return { kind: 'pdf', text: r.text, items: r.items, table: null, ocr: false, issuer: null }; }
    if (name === 'synthetic-unbalanced.pdf') { const r = plainPdf(false); return { kind: 'pdf', text: r.text, items: r.items, table: null, ocr: false, issuer: null }; }
    if (name === 'synthetic-payslip.pdf') return { kind: 'pdf', text: PAYSLIP, items: [], table: null, ocr: false, issuer: null };
    return actual.extract(bytes, name, progress);
  } };
});
const context = (period: { start: string; end: string }): ImportContext => ({ accountId: 'a', accountKind: 'checking', currency: 'AUD', period, dateOrder: 'DMY', decimal: '.', creditPositivePurchases: false });
const source = (name: string, text = 'synthetic') => new FileSource(new TextEncoder().encode(text), name);

describe('what a file says about itself', () => {
  it('reads a statement\'s printed period and balances, its account tail, and that it is not a payslip', async () => {
    expect(await source('synthetic-report.pdf').inspect()).toEqual({ start: '2026-02-01', end: '2026-02-03', opening: '100.00', closing: '136.10', read: 'statement', payslip: false, accountTail: '3444' });
  });
  it('works the period out from the rows of an export, and leaves the balances it does not state blank', async () => {
    const csv = source('synthetic.csv', 'Date,Description,Amount\n05/01/2026,Synthetic shop,-10.00\n07/01/2026,Synthetic cafe,-4.00');
    expect(await csv.inspect()).toEqual({ start: '2026-01-05', end: '2026-01-07', opening: '', closing: '', read: 'rows', payslip: false, accountTail: null });
    expect(await source('synthetic-plain.pdf').inspect()).toMatchObject({ start: '2026-03-05', end: '2026-03-07', opening: '', closing: '', read: 'rows' });
  });
  it('gives up rather than guess when a date could be more than one day', async () => {
    // No year anywhere: a wide window makes every year a candidate, and none is chosen.
    expect((await source('synthetic.csv', 'Date,Description,Amount\n05/01,Synthetic shop,-10.00').inspect()).read).toBe('none');
  });
  it('knows a payslip by its labels and takes its window from its own dates', async () => {
    expect(await source('synthetic-payslip.pdf').inspect()).toEqual({ start: '2026-03-01', end: '2026-03-15', opening: '', closing: '', read: 'rows', payslip: true, accountTail: null });
  });
});

describe('a PDF with no stated balances', () => {
  it('is checked by its running balance, as an export is, instead of being refused', async () => {
    const doc = await source('synthetic-plain.pdf').fetch({ context: context({ start: '2026-03-05', end: '2026-03-07' }), opening: '', closing: '', payslip: false });
    expect(doc.integrityTier).toBe('B'); expect(doc.sourceKind).toBe('export');
    expect(balance(doc)).toEqual({ valid: true, difference: 0n });
    expect(doc.rows.map(r => r.minor)).toEqual(['-400', '-1000']);
  });
  it('is continuity-checked only when it carries no balance column, and says so by its tier', async () => {
    const doc = await source('synthetic-unbalanced.pdf').fetch({ context: context({ start: '2026-03-05', end: '2026-03-07' }), opening: '', closing: '', payslip: false });
    expect(doc.integrityTier).toBe('C');
  });
  it('still takes the statement path when the balances are stated', async () => {
    const doc = await source('synthetic-report.pdf').fetch({ context: context({ start: '2026-02-01', end: '2026-02-03' }), opening: '100.00', closing: '136.10', payslip: false });
    expect(doc.integrityTier).toBe('A'); expect(balance(doc).valid).toBe(true);
    expect(new Set(doc.rows.map(r => r.fingerprint)).size).toBe(4);
  });
});

describe('a description of the file, in the owner\'s words', () => {
  async function repo() {
    const { driver } = memoryDriver(); await migrate(driver); const r = repository(driver);
    await r.addAccount({ id: 'a', name: 'Synthetic', institution: 'Synthetic bank', type: 'checking', currency: 'AUD', mask_last4: null, opening_balance_minor: 0n });
    return { r, driver };
  }
  it('is kept beside the batch, shown in its summary, and goes when the batch is forgotten', async () => {
    const { r, driver } = await repo();
    const doc = await source('synthetic-plain.pdf').fetch({ context: context({ start: '2026-03-05', end: '2026-03-07' }), opening: '', closing: '', payslip: false });
    await r.imports.stage(doc);
    await r.imports.setNote(doc.id, '  March everyday export  ');
    expect((await r.imports.summaries()).find(b => b.id === doc.id)?.note).toBe('March everyday export');
    // The evidence itself is untouched: the stored document is byte for byte what was extracted.
    expect(JSON.parse(String((await driver.query("SELECT payload FROM staging_rows WHERE source_row_id='__document__'"))[0]!.payload))).not.toHaveProperty('note');
    await r.imports.setNote(doc.id, '');
    expect((await r.imports.summaries()).find(b => b.id === doc.id)?.note).toBeUndefined();
    await expect(r.imports.setNote(doc.id, 'x'.repeat(201))).rejects.toThrow('200 characters');
    await expect(r.imports.setNote(hash('nowhere'), 'lost')).rejects.toThrow('not found');
    await r.imports.setNote(doc.id, 'March everyday export');
    await r.imports.commit(doc.id); await r.imports.rollback(doc.id); await r.imports.forget(doc.id);
    expect(await driver.query("SELECT key FROM app_settings WHERE key LIKE 'import-note:%'")).toHaveLength(0);
  });
});
