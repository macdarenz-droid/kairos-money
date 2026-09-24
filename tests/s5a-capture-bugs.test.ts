import {describe, expect, it} from 'vitest';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository} from '../src/core/db/repository';
import {hash, normalizeRow} from '../src/ingest/normalize';
import {FileSource} from '../src/ingest/sources';
import {reconcile} from '../src/ingest/reconcile';
import {currency} from '../src/core/money';
import {invert, rateBetween, type Rate} from '../src/core/fx';
import {combinedPosition} from '../src/ledger/net-worth';
import type {Document, ImportContext} from '../src/ingest/types';

const context: ImportContext = {accountId:'a',accountKind:'checking',currency:'AUD',period:{start:'2026-02-01',end:'2026-02-28'},dateOrder:'DMY',decimal:'.',creditPositivePurchases:false};

async function ready() {
  const {driver, raw} = memoryDriver(); await migrate(driver); const repo = repository(driver);
  await repo.addAccount({id:'a',name:'Synthetic',institution:'Synthetic',type:'checking',currency:'AUD',mask_last4:null,opening_balance_minor:0n});
  return {driver, raw, repo};
}

async function accept(repo: Awaited<ReturnType<typeof ready>>['repo'], doc: Document) {
  await repo.imports.stage(doc);
  for (const {row, blocked} of (await repo.imports.review(doc.id)).items) if (blocked) await repo.imports.correct(doc.id, row.sourceId, row, false);
  return repo.imports.commit(doc.id);
}

/** One purchase as a given source family saw it. */
function source(kind: 'statement' | 'export', description: string): Document {
  const fileHash = hash(kind + description);
  return {id: hash(JSON.stringify(['a', fileHash])), hash: fileHash, fileName: kind + '.csv', parser: 'synthetic-' + kind, context,
    opening: '10000', closing: '8750', payslip: null, sourceRank: kind === 'statement' ? 2 : 3, sourceKind: kind, integrityTier: 'A',
    rows: [normalizeRow({sourceId: '0', date: '2026-02-10', description, amount: '12.50', direction: 'debit', confidence: 9800}, context)]};
}

describe('a second source for the same period', () => {
  it('keeps the transaction id, so category edits and notes survive', async () => {
    const {driver, raw, repo} = await ready();
    const one = source('statement', 'SYNTHETIC CAFE NEWTOWN'), two = source('export', 'SYNTHETIC CAFE NEWTOWN AU');
    expect(one.rows[0]!.fingerprint).not.toBe(two.rows[0]!.fingerprint);
    // Import the one whose key sorts later first, so the corroborating source would win a plain tie-break.
    const [first, second] = one.rows[0]!.fingerprint > two.rows[0]!.fingerprint ? [one, two] : [two, one];
    await repo.imports.stage(first); await repo.imports.commit(first.id);
    const [before] = await driver.query('SELECT id FROM transactions');
    const id = String(before!.id);
    await repo.categories.set([id], 'Eating out');
    await repo.attachments.note(id, 'with Sam');

    await repo.imports.stage(second); await repo.imports.commit(second.id);
    const after = await driver.query('SELECT t.id,c.name FROM transactions t LEFT JOIN categories c ON c.id=t.category_id');
    expect(after).toEqual([{id, name: 'Eating out'}]);
    expect((await repo.attachments.read(id)).note).toBe('with Sam');
    raw.close();
  });
});

const notice = (id: string, date: string, minor = '-1250') => ({id, accountId: 'a', date, minor, merchant: 'SYNTHETIC CAFE',
  description: 'You spent at SYNTHETIC CAFE.', source: 'app.synthetic.bank', capturedAt: date + 'T04:00:00Z'});
const noticeId = (id: string) => hash('notice-transaction:' + id);

describe('approved bank notices', () => {
  it('keep their categories and notes when another notice is approved', async () => {
    const {driver, raw, repo} = await ready();
    await repo.notices.approve(notice('n1', '2026-02-10'));
    await repo.categories.set([noticeId('n1')], 'Eating out');
    await repo.attachments.note(noticeId('n1'), 'lunch');
    await repo.notices.approve(notice('n2', '2026-02-12', '-900'));
    const [row] = await driver.query('SELECT c.name FROM transactions t LEFT JOIN categories c ON c.id=t.category_id WHERE t.id=?', [noticeId('n1')]);
    expect(row).toEqual({name: 'Eating out'});
    expect((await repo.attachments.read(noticeId('n1'))).note).toBe('lunch');
    raw.close();
  });

  it('are hidden one for one by settled statement rows, not all by one', async () => {
    const {driver, raw, repo} = await ready();
    await repo.notices.approve(notice('n1', '2026-02-10'));
    await repo.notices.approve(notice('n2', '2026-02-11'));
    const doc = source('statement', 'SYNTHETIC CAFE');
    await repo.imports.stage(doc); await repo.imports.commit(doc.id);
    const rows = await driver.query("SELECT status FROM transactions ORDER BY status");
    expect(rows).toEqual([{status: 'pending'}, {status: 'settled'}]);
    raw.close();
  });
});

describe('a statement that settled a pending row', () => {
  async function superseded() {
    const env = await ready();
    const pending = source('export', 'SYNTHETIC CAFE NEWTOWN');
    pending.integrityTier = 'C';
    pending.rows = [normalizeRow({sourceId: '0', date: '2026-02-09', description: 'SYNTHETIC CAFE NEWTOWN', amount: '12.50', direction: 'debit', confidence: 9800, pending: true}, context)];
    await accept(env.repo, pending);
    const settled = source('statement', 'SYNTHETIC CAFE NEWTOWN');
    await accept(env.repo, settled);
    expect(await env.driver.query("SELECT import_batch_id FROM privacy_log WHERE action='transaction_superseded'")).toEqual([{import_batch_id: settled.id}]);
    await env.repo.imports.rollback(settled.id);
    return {...env, settled};
  }

  it('can be removed from the list after a rollback', async () => {
    const {repo, raw, settled, driver} = await superseded();
    await repo.imports.forget(settled.id);
    expect(await driver.query('SELECT id FROM import_batches WHERE id=?', [settled.id])).toEqual([]);
    expect(await driver.query("SELECT COUNT(*) AS n FROM privacy_log WHERE action='transaction_superseded'")).toEqual([{n: 1}]);
    raw.close();
  });

  it('can be imported again after a rollback', async () => {
    const {repo, raw, settled} = await superseded();
    await expect(accept(repo, settled)).resolves.toMatchObject({alreadyImported: false});
    raw.close();
  });
});

describe('the credit "positive = purchase" switch', () => {
  it('flips the running balance with the amount', () => {
    const card = {...context, accountKind: 'credit' as const, creditPositivePurchases: true};
    const row = normalizeRow({sourceId: '0', date: '2026-02-10', description: 'SYNTHETIC SHOP', amount: '10.00', runningBalance: '110.00', confidence: 10000}, card);
    expect([row.minor, row.runningBalance]).toEqual(['-1000', '-11000']);
  });
});

describe('an export with two identical purchases on one day', () => {
  const options = {context: {...context, period: {start: '2026-02-01', end: '2026-02-28'}}, opening: '', closing: '', payslip: false};
  it('keeps both, with or without a running balance', async () => {
    for (const csv of ['Date,Description,Amount\n10/02/2026,Cafe,-5.00\n10/02/2026,Cafe,-5.00\n11/02/2026,Cafe,-5.00',
      'Date,Description,Amount,Balance\n10/02/2026,Cafe,-5.00,95.00\n10/02/2026,Cafe,-5.00,90.00\n11/02/2026,Cafe,-5.00,85.00']) {
      const doc = await new FileSource(new TextEncoder().encode(csv), 'export.csv', 'CommBank').fetch(options);
      expect(new Set(doc.rows.map(r => r.fingerprint)).size).toBe(3);
      expect(reconcile([doc])).toHaveLength(3);
    }
  });
  it('still recognises the same purchase in an overlapping export', async () => {
    const one = await new FileSource(new TextEncoder().encode('Date,Description,Amount\n10/02/2026,Cafe,-5.00\n10/02/2026,Cafe,-5.00'), 'one.csv', 'CommBank').fetch(options);
    const two = await new FileSource(new TextEncoder().encode('Date,Description,Amount\n09/02/2026,Shop,-1.00\n10/02/2026,Cafe,-5.00\n10/02/2026,Cafe,-5.00'), 'two.csv', 'CommBank').fetch(options);
    expect(reconcile([one, two])).toHaveLength(3);
  });
});

describe('a hand-typed exchange rate', () => {
  it('gives way to a rate published after it', () => {
    const AUD = currency('AUD'), PHP = currency('PHP');
    const rates: Rate[] = [
      {asOf: '2026-02-01', base: AUD, quote: PHP, rateE8: 4000000000n, source: 'manual'},
      {asOf: '2026-03-01', base: PHP, quote: AUD, rateE8: 2600000n, source: 'published'},
    ];
    expect(rateBetween(rates, AUD, PHP, '2026-02-15')).toBe(4000000000n);
    expect(rateBetween(rates, AUD, PHP, '2026-03-02')).toBe(invert(rates[1]!).rateE8);
  });
});

describe('deleting a hand-entered transaction', () => {
  it('removes its notes and receipts too', async () => {
    const {driver, raw, repo} = await ready();
    await repo.addAccount({id:'b',name:'Other',institution:'Synthetic',type:'checking',currency:'AUD',mask_last4:null,opening_balance_minor:0n});
    await repo.manual.save({id: 'm1', kind: 'expense', accountId: 'a', destinationId: null, date: '2026-02-10', minor: '500', description: 'Cafe', category: null, notes: ''});
    await repo.manual.save({id: 'm2', kind: 'transfer', accountId: 'a', destinationId: 'b', date: '2026-02-10', minor: '500', description: 'Move', category: null, notes: ''});
    const ids = (await driver.query('SELECT id FROM transactions')).map(r => String(r.id));
    for (const id of ids) await repo.attachments.note(id, 'kept for tax');
    await repo.manual.remove('m1'); await repo.manual.remove('m2');
    expect(await driver.query("SELECT key FROM app_settings WHERE key LIKE 'ledger-detail:%'")).toEqual([]);
    raw.close();
  });
});

describe('net worth across currencies', () => {
  const AUD = currency('AUD'), PHP = currency('PHP');
  const item = (id: string, code: typeof AUD, minor: string) => ({id, itemId: id, name: id, kind: 'asset' as const, currency: code, date: '2026-02-01', minor});
  it('converts other-currency holdings when a rate exists and names them when none does', () => {
    const values = [item('home', AUD, '100000'), item('land', PHP, '4000000')];
    expect(combinedPosition(values, [], AUD)).toMatchObject({assets: '100000', unconverted: ['PHP']});
    const rates: Rate[] = [{asOf: '2026-01-01', base: PHP, quote: AUD, rateE8: 2500000n, source: 'published'}];
    expect(combinedPosition(values, [], AUD, rates)).toMatchObject({assets: '200000', unconverted: []});
  });
});
