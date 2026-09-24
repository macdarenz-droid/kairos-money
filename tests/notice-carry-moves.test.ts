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

describe('a notice matched to its statement row', () => {
  it('moves its category and note to the settled row and leaves no copy behind to reapply later', async () => {
    const {driver, raw, repo} = await ready();
    await repo.notices.approve(notice('n1', '2026-02-10'));
    await repo.categories.set([noticeId('n1')], 'Eating out');
    await repo.attachments.note(noticeId('n1'), 'lunch with Sam');
    await accept(repo, statement(['2026-02-10']));
    const id = await settledOn(driver, '2026-02-10');
    expect((await driver.query('SELECT key FROM app_settings WHERE key IN (?,?,?,?)', ['category-edit:' + id, 'ledger-detail:' + id, 'category-edit:' + noticeId('n1'), 'ledger-detail:' + noticeId('n1')])).map(r => r.key).sort())
      .toEqual(['category-edit:' + id, 'ledger-detail:' + id].sort());
    raw.close();
  });
});
