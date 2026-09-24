import {describe, expect, it} from 'vitest';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository, type Repository} from '../src/core/db/repository';
import {hash, normalizeRow} from '../src/ingest/normalize';
import {spendingPatterns} from '../src/intelligence/visuals/spending-patterns';
import type {Document, ImportContext} from '../src/ingest/types';

const context: ImportContext = {accountId: 'a', accountKind: 'checking', currency: 'AUD',
  period: {start: '2026-01-01', end: '2026-01-31'}, dateOrder: 'DMY', decimal: '.', creditPositivePurchases: false};

/** One statement row: money that reached the app by being read off a file. */
function statement(): Document {
  return {id: hash(JSON.stringify(['a', hash('file')])), hash: hash('file'), fileName: 'synthetic.csv',
    parser: 'synthetic', context, opening: '10000', closing: '9000', payslip: null,
    rows: [{...normalizeRow({sourceId: '1', date: '2026-01-02', description: 'Synthetic store',
      amount: '-10.00', confidence: 10000}, context), category: 'Shopping', verified: true}]};
}

async function ledger() {
  const {driver} = memoryDriver(); await migrate(driver); const repo = repository(driver);
  await repo.addAccount({id: 'a', name: 'Synthetic', institution: '', type: 'checking',
    currency: 'AUD', mask_last4: null, opening_balance_minor: 0n});
  return repo;
}
/** Money that reached the app by being typed in. */
const byHand = (repo: Repository, over: {id: string; minor: string; date: string; description: string}) =>
  repo.manual.save({kind: 'expense', accountId: 'a', destinationId: null, category: 'Eating out', notes: '', ...over});

const spent = async (repo: Repository) => spendingPatterns(await repo.intelligence.snapshot('2026-01-31', 'AUD')).total;
const held = async (repo: Repository) => (await repo.accountBalances()).find(b => b.accountId === 'a')!.minor;

/**
 * "all money is the same insight whatever pattern of a user, a manual and automatic type of data that
 * came inside the app is the same kind of data."
 *
 * He is right, and the app already works that way — which I had told him it did not. The snapshot every
 * Insights figure is computed from reads `FROM transactions` with no filter on where a row came from,
 * and a hand-recorded entry is written into that same table. The exclusion I was thinking of lives in
 * materializedLedger, which nothing outside these tests calls.
 *
 * So this is not a fix; it is the rule written down, where a future change to any of those queries has
 * to break a test rather than quietly change what his money adds up to.
 */
describe('money typed in counts exactly as money read off a statement', () => {
  it('reaches the snapshot every Insights figure is computed from', async () => {
    const repo = await ledger();
    const doc = statement(); await repo.imports.stage(doc); await repo.imports.commit(doc.id);
    await byHand(repo, {id: 'by-hand', minor: '1250', date: '2026-01-20', description: 'Synthetic lunch'});

    const snapshot = await repo.intelligence.snapshot('2026-01-31', 'AUD');
    expect(snapshot.transactions.map(t => t.minor).sort()).toEqual(['-1000', '-1250']);
    expect(snapshot.transactions.some(t => t.description === 'Synthetic lunch')).toBe(true);
  });

  it('is added into what was spent, not shown beside it', async () => {
    const repo = await ledger();
    const doc = statement(); await repo.imports.stage(doc); await repo.imports.commit(doc.id);
    expect(await spent(repo)).toBe('1000');
    await byHand(repo, {id: 'by-hand', minor: '1250', date: '2026-01-20', description: 'Synthetic lunch'});
    // 10.00 read off a statement plus 12.50 typed in is 22.50 spent. One total, one kind of money.
    expect(await spent(repo)).toBe('2250');
  });

  it('moves the account balance the same way a statement row does', async () => {
    const repo = await ledger();
    await byHand(repo, {id: 'by-hand', minor: '1250', date: '2026-01-20', description: 'Synthetic lunch'});
    expect(await held(repo)).toBe('-1250');
  });

  /** Every category chart groups on these two fields, so this is what makes it appear in one. */
  it('carries its own category and kind, the way an imported row does', async () => {
    const repo = await ledger();
    await byHand(repo, {id: 'by-hand', minor: '1250', date: '2026-01-20', description: 'Synthetic lunch'});
    const [entry] = (await repo.intelligence.snapshot('2026-01-31', 'AUD')).transactions;
    expect(entry?.category).toBe('Eating out');
    expect(entry?.kind).toBe('discretionary');
    expect(entry?.status).toBe('settled');
    // It counts as spending rather than being parked in "other debits" for review.
    const patterns = spendingPatterns(await repo.intelligence.snapshot('2026-01-31', 'AUD'));
    expect(patterns.total).toBe('1250');
    expect(patterns.otherDebits).toBe('0');
  });

  it('stops being counted twice once its statement row is matched to it', async () => {
    const repo = await ledger();
    await byHand(repo, {id: 'by-hand', minor: '1000', date: '2026-01-02', description: 'Synthetic store'});
    const doc = statement(); await repo.imports.stage(doc); await repo.imports.commit(doc.id);
    // Until they are matched the app holds both, because it has no way to know they are one purchase —
    // and it says so rather than guessing: the entry is reported as unresolved.
    expect(await spent(repo)).toBe('2000');
    expect(Object.keys(await repo.manual.unresolved())).toEqual(['by-hand']);

    const [candidate] = await repo.manual.candidates('by-hand');
    await repo.manual.match('by-hand', candidate!.leg, candidate!.transactionId);
    // One purchase, counted once, with the statement's evidence behind it.
    expect(await spent(repo)).toBe('1000');
    expect(await held(repo)).toBe('-1000');
  });
});
