import {describe, expect, it} from 'vitest';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository} from '../src/core/db/repository';
import {hash, normalizeRow} from '../src/ingest/normalize';
import type {Document, ImportContext} from '../src/ingest/types';

const context: ImportContext = {accountId:'a',accountKind:'checking',currency:'AUD',period:{start:'2026-02-01',end:'2026-02-28'},dateOrder:'DMY',decimal:'.',creditPositivePurchases:false};

async function ready() {
  const {driver, raw} = memoryDriver(); await migrate(driver); const repo = repository(driver);
  await repo.addAccount({id:'a',name:'Synthetic',institution:'Synthetic',type:'checking',currency:'AUD',mask_last4:null,opening_balance_minor:0n});
  await repo.addAccount({id:'b',name:'Other',institution:'Synthetic',type:'checking',currency:'AUD',mask_last4:null,opening_balance_minor:0n});
  return {driver, raw, repo};
}

/** A settled statement holding one 12.50 purchase on each of the given days. */
function statement(days: string[]): Document {
  const fileHash = hash('statement:' + days.join(','));
  return {id: hash(JSON.stringify(['a', fileHash])), hash: fileHash, fileName: 'statement.csv', parser: 'synthetic-statement', context,
    opening: '10000', closing: (10000n - 1250n * BigInt(days.length)).toString(), payslip: null, sourceRank: 2, sourceKind: 'statement', integrityTier: 'A',
    rows: days.map((date, index) => normalizeRow({sourceId: String(index), date, description: 'SYNTHETIC CAFE ' + index, amount: '12.50', direction: 'debit', confidence: 9800}, context))};
}

async function accept(repo: Awaited<ReturnType<typeof ready>>['repo'], doc: Document) {
  await repo.imports.stage(doc);
  for (const {row, blocked} of (await repo.imports.review(doc.id)).items) if (blocked) await repo.imports.correct(doc.id, row.sourceId, row, false);
  return repo.imports.commit(doc.id);
}

const notice = (id: string, date: string, extra: {destinationId?: string} = {}) => ({id, accountId: 'a', date, minor: '-1250', merchant: 'SYNTHETIC CAFE',
  description: 'You spent at SYNTHETIC CAFE.', source: 'app.synthetic.bank', capturedAt: date + 'T04:00:00Z', ...extra});
const noticeId = (id: string) => hash('notice-transaction:' + id);
const settledOn = async (driver: Awaited<ReturnType<typeof ready>>['driver'], date: string) =>
  String((await driver.query("SELECT id FROM transactions WHERE status='settled' AND posted_date=?", [date]))[0]!.id);

describe('approved notices matched to a statement', () => {
  it('are all hidden when every notice has its own settled row, whatever order they load in', async () => {
    // Both id orders, so one of them loads the later notice first.
    for (const [late, early] of [['na', 'nb'], ['nb', 'na']] as const) {
      const {driver, raw, repo} = await ready();
      await repo.notices.approve(notice(late, '2026-02-12'));
      await repo.notices.approve(notice(early, '2026-02-09'));
      await accept(repo, statement(['2026-02-11', '2026-02-14']));
      expect(await driver.query('SELECT posted_date,status FROM transactions ORDER BY posted_date')).toEqual([
        {posted_date: '2026-02-11', status: 'settled'}, {posted_date: '2026-02-14', status: 'settled'}]);
      raw.close();
    }
  });

  it('hand the notice category, note and receipts to the settled row that replaces it', async () => {
    const {driver, raw, repo} = await ready();
    await repo.notices.approve(notice('n1', '2026-02-10'));
    await repo.categories.set([noticeId('n1')], 'Eating out');
    await repo.attachments.note(noticeId('n1'), 'lunch with Sam');
    await repo.attachments.attach(noticeId('n1'), {id: 'r1', name: 'receipt.png', data: 'aGk=', text: ''});
    await accept(repo, statement(['2026-02-10']));
    const id = await settledOn(driver, '2026-02-10');
    expect(await driver.query('SELECT t.status,c.name FROM transactions t LEFT JOIN categories c ON c.id=t.category_id')).toEqual([{status: 'settled', name: 'Eating out'}]);
    expect(await repo.attachments.read(id)).toEqual({note: 'lunch with Sam', receipts: [{id: 'r1', name: 'receipt.png', data: 'aGk=', text: ''}]});
    raw.close();
  });

  it('hand the edits to the closest settled row, not an earlier purchase of the same amount', async () => {
    const {driver, raw, repo} = await ready();
    await repo.notices.approve(notice('n1', '2026-02-12'));
    await repo.categories.set([noticeId('n1')], 'Eating out');
    await repo.attachments.note(noticeId('n1'), 'lunch with Sam');
    await accept(repo, statement(['2026-02-09', '2026-02-12']));
    expect(await driver.query('SELECT t.posted_date,c.name FROM transactions t LEFT JOIN categories c ON c.id=t.category_id ORDER BY t.posted_date')).toEqual([
      {posted_date: '2026-02-09', name: null}, {posted_date: '2026-02-12', name: 'Eating out'}]);
    expect((await repo.attachments.read(await settledOn(driver, '2026-02-12'))).note).toBe('lunch with Sam');
    expect((await repo.attachments.read(await settledOn(driver, '2026-02-09'))).note).toBe('');
    raw.close();
  });

  it('keep the settled row own edits once the owner has made them', async () => {
    const {driver, raw, repo} = await ready();
    await repo.notices.approve(notice('n1', '2026-02-10'));
    await repo.categories.set([noticeId('n1')], 'Eating out');
    await repo.attachments.note(noticeId('n1'), 'lunch with Sam');
    await accept(repo, statement(['2026-02-10']));
    const id = await settledOn(driver, '2026-02-10');
    await repo.categories.set([id], 'Groceries');
    await repo.attachments.note(id, 'weekly shop');
    await repo.notices.sync();
    expect(await driver.query('SELECT c.name FROM transactions t LEFT JOIN categories c ON c.id=t.category_id')).toEqual([{name: 'Groceries'}]);
    expect((await repo.attachments.read(id)).note).toBe('weekly shop');
    raw.close();
  });
});

describe('removing an approved notice', () => {
  it('removes its category edit, split, notes and receipts too', async () => {
    const {driver, raw, repo} = await ready();
    await repo.notices.approve(notice('n1', '2026-02-10'));
    await repo.notices.approve(notice('n2', '2026-02-11', {destinationId: 'b'}));
    await repo.categories.set([noticeId('n1')], 'Eating out');
    const ids = (await driver.query('SELECT id FROM transactions')).map(r => String(r.id));
    expect(ids).toHaveLength(3);
    for (const id of ids) {
      await repo.attachments.note(id, 'kept for tax');
      await driver.execute('INSERT OR REPLACE INTO app_settings(key,value) VALUES(?,?)', ['split:' + id, '{}']);
    }
    await repo.notices.remove('n1'); await repo.notices.remove('n2');
    expect(await driver.query("SELECT key FROM app_settings WHERE key LIKE 'ledger-detail:%' OR key LIKE 'split:%' OR key LIKE 'category-edit:%'")).toEqual([]);
    raw.close();
  });
});
