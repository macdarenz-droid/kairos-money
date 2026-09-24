import {describe, expect, it} from 'vitest';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository, type Repository} from '../src/core/db/repository';
import {hash, normalizeRow} from '../src/ingest/normalize';
import type {Document, ImportContext} from '../src/ingest/types';

const context = (start: string, end: string): ImportContext => ({accountId: 'a', accountKind: 'checking',
  currency: 'AUD', period: {start, end}, dateOrder: 'DMY', decimal: '.', creditPositivePurchases: false});

/** A statement carrying the bank's own running balance beside every row, as printed: decimals. */
function statement(name: string, period: {start: string; end: string}, tier: 'A' | 'B' | 'C',
                   declared: {opening: string; closing: string},
                   rows: {date: string; amount: string; balance?: string}[]): Document {
  const ctx = context(period.start, period.end);
  return {id: hash(JSON.stringify(['a', hash(name)])), hash: hash(name), fileName: name, parser: 'synthetic',
    context: ctx, opening: declared.opening, closing: declared.closing, payslip: null, sourceRank: 3, sourceKind: 'export', integrityTier: tier,
    rows: rows.map((r, i) => ({
      ...normalizeRow({sourceId: String(i), description: 'Synthetic payee', confidence: 9800,
        date: r.date, amount: r.amount, ...(r.balance === undefined ? {} : {runningBalance: r.balance})}, ctx),
      issues: [], verified: true}))};
}

async function ledger(opening: bigint) {
  const {driver} = memoryDriver(); await migrate(driver); const repo = repository(driver);
  await repo.addAccount({id: 'a', name: 'Synthetic', institution: 'Synthetic bank', type: 'checking',
    currency: 'AUD', mask_last4: null, opening_balance_minor: opening});
  return repo;
}
const balance = async (repo: Repository) => (await repo.accountBalances()).find(b => b.accountId === 'a')!.minor;
const opening = async (repo: Repository) => String((await repo.accounts())[0]!.opening_balance_minor);

/** Held 268.48, spent 12.00 then 66.27, leaving 190.21 — the shape of his own file, in miniature. */
const january = () => statement('january.csv', {start: '2026-01-01', end: '2026-01-31'}, 'B',
  {opening: '26848', closing: '19021'}, [
  {date: '2026-01-02', amount: '-12.00', balance: '256.48'},
  {date: '2026-01-20', amount: '-66.27', balance: '190.21'},
]);
/** The month before it: held 300.00, spent 20.00 then 11.52, leaving the 268.48 January starts from. */
const december = () => statement('december.csv', {start: '2025-12-01', end: '2025-12-31'}, 'B',
  {opening: '30000', closing: '26848'}, [
  {date: '2025-12-11', amount: '-20.00', balance: '280.00'},
  {date: '2025-12-19', amount: '-11.52', balance: '268.48'},
]);

async function commit(repo: Repository, doc: Document) { await repo.imports.stage(doc); await repo.imports.commit(doc.id); }

describe('the balance an import leaves the account showing', () => {
  /**
   * "if i setup 0 acct, and i import latest txn file. then i would see my balance up to date on what i
   * imported on latest date." Opened at zero, the Ledger printed -78.27 — the sum of the movements.
   */
  it('shows what the statement ends at, not what it moved', async () => {
    const repo = await ledger(0n);
    await commit(repo, january());
    expect(await opening(repo)).toBe('26848');
    expect(await balance(repo)).toBe('19021');
  });

  /**
   * "if i import older dates, it will sync and do the math to match my latest acct balance."
   * The older file's opening replaces the newer one's and its movements are added, so the sum
   * telescopes: the latest balance is the same figure it was before the older file arrived.
   */
  it('does not move when an older statement is imported afterwards', async () => {
    const repo = await ledger(0n);
    await commit(repo, january());
    await commit(repo, december());
    expect(await opening(repo)).toBe('30000');
    expect(await balance(repo)).toBe('19021');
  });

  /** Order of arrival is not evidence about money: the same two files land on the same balance. */
  it('lands identically when the older statement arrives first', async () => {
    const repo = await ledger(0n);
    await commit(repo, december());
    await commit(repo, january());
    expect(await opening(repo)).toBe('30000');
    expect(await balance(repo)).toBe('19021');
  });

  /** Rolling one back re-derives from what is left rather than unwinding an increment. */
  it('re-derives when a statement is rolled back, and puts back the typed figure when none is left', async () => {
    const repo = await ledger(500n);
    await commit(repo, january());
    await commit(repo, december());
    await repo.imports.rollback(december().id);
    expect(await opening(repo)).toBe('26848');
    await repo.imports.rollback(january().id);
    expect(await opening(repo)).toBe('500');
    expect(await balance(repo)).toBe('500');
  });

  /**
   * A file whose running balance cannot be checked end to end cannot say what came before it, so it is
   * never the anchor — the figure the account was created with stands.
   */
  it('never anchors on a statement that carries no verified running balance', async () => {
    const repo = await ledger(7500n);
    await commit(repo, statement('loose.csv', {start: '2026-01-01', end: '2026-01-31'}, 'C',
      {opening: '0', closing: '-2000'},
      [{date: '2026-01-02', amount: '-12.00'}, {date: '2026-01-03', amount: '-8.00'}]));
    expect(await opening(repo)).toBe('7500');
    expect(await balance(repo)).toBe('5500');
  });

  /** It is his account and his money: a figure he corrects by hand is not overwritten by the next import. */
  it('leaves an opening balance alone once it has been corrected by hand', async () => {
    const repo = await ledger(0n);
    await commit(repo, january());
    await repo.updateAccount('a', {opening_balance_minor: 40000n});
    await commit(repo, december());
    expect(await opening(repo)).toBe('40000');
  });
});
