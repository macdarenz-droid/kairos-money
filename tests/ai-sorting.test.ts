import {expect, it} from 'vitest';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository} from '../src/core/db/repository';
import {hash, normalizeRow} from '../src/ingest/normalize';
import type {Document, ImportContext} from '../src/ingest/types';

const context: ImportContext = {accountId: 'acct-7', accountKind: 'checking', currency: 'AUD', period: {start: '2026-02-01', end: '2026-02-28'}, dateOrder: 'DMY', decimal: '.', creditPositivePurchases: false};
const raw = (sourceId: string, date: string, description: string, amount: string) =>
  normalizeRow({sourceId, date, description, amount, direction: 'debit', confidence: 9800}, context);

async function ledger() {
  const {driver, raw: db} = memoryDriver(); await migrate(driver); const repo = repository(driver);
  await repo.addAccount({id: 'acct-7', name: 'Everyday', institution: 'Synthetic', type: 'checking', currency: 'AUD', mask_last4: null, opening_balance_minor: 0n});
  const rows = [raw('0', '2026-02-03', 'CAFE LUNA', '4.50'), raw('1', '2026-02-04', 'CAFE LUNA', '5.20'), raw('2', '2026-02-05', 'BOOK NOOK', '20.00'), raw('3', '2026-02-06', 'MYSTERY CO', '9.00')];
  const fileHash = hash('ai-sorting');
  const doc: Document = {id: hash(JSON.stringify(['acct-7', fileHash])), hash: fileHash, fileName: 's.csv', parser: 'synthetic', context,
    opening: '10000', closing: String(10000 - 450 - 520 - 2000 - 900), payslip: null, sourceRank: 2, sourceKind: 'statement', integrityTier: 'A', rows};
  await repo.imports.stage(doc);
  for (const {row, blocked} of (await repo.imports.review(doc.id)).items) if (blocked) await repo.imports.correct(doc.id, row.sourceId, row, false);
  await repo.imports.commit(doc.id);
  const category = async (description: string) => (await driver.query('SELECT c.name FROM transactions t LEFT JOIN categories c ON c.id=t.category_id WHERE t.raw_description=?', [description])).map(r => r.name);
  return {db, repo, rows, category};
}
const descriptions = (p: {sent: {merchants: {description: string}[]}}) => p.sent.merchants.map(m => m.description).sort();

it('sends only merchants the owner has not decided, and only new ones when asked', async () => {
  const {db, repo, rows, category} = await ledger();
  expect(descriptions(await repo.aiCategories.payload(false))).toEqual(['BOOK NOOK', 'CAFE LUNA', 'MYSTERY CO']);
  await repo.merchantRules.set(rows[2]!.merchant, 'Hobbies & media');
  expect(await category('BOOK NOOK')).toEqual(['Hobbies & media']);
  expect(descriptions(await repo.aiCategories.payload(false))).toEqual(['CAFE LUNA', 'MYSTERY CO']);
  await repo.aiCategories.applyRun([{key: rows[0]!.merchant, category: 'Coffee & snacks', confidence: 'high'}], 'claude-opus-5');
  expect(descriptions(await repo.aiCategories.payload(true))).toEqual(['MYSTERY CO']);
  db.close();
});

it('"All from this merchant" beats Claude, survives a rebuild, and rejects unknown categories', async () => {
  const {db, repo, rows, category} = await ledger();
  await repo.aiCategories.applyRun([{key: rows[0]!.merchant, category: 'Coffee & snacks', confidence: 'high'}], 'claude-opus-5');
  await repo.merchantRules.set(rows[0]!.merchant, 'Eating out');
  expect(await category('CAFE LUNA')).toEqual(['Eating out', 'Eating out']);
  await repo.imports.rebuild();
  expect(await category('CAFE LUNA')).toEqual(['Eating out', 'Eating out']);
  expect((await repo.imports.ledger()).find(r => r.merchant === rows[0]!.merchant)?.categoryFrom).toBeUndefined();
  await expect(repo.merchantRules.set(rows[0]!.merchant, 'Nonsense')).rejects.toThrow();
  await expect(repo.merchantRules.set('NO SUCH MERCHANT', 'Shopping')).rejects.toThrow();
  db.close();
});
