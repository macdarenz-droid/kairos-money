import {expect, it} from 'vitest';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository} from '../src/core/db/repository';
import {hash, normalizeRow} from '../src/ingest/normalize';
import type {Document, ImportContext} from '../src/ingest/types';

const context: ImportContext = {accountId: 'a', accountKind: 'checking', currency: 'AUD', period: {start: '2026-02-01', end: '2026-02-28'}, dateOrder: 'DMY', decimal: '.', creditPositivePurchases: false};
function doc(kind: 'statement' | 'export', rows: [string, string, string, 'debit' | 'credit'][], closing: string): Document {
  const fileHash = hash(kind + JSON.stringify(rows));
  return {id: hash(JSON.stringify(['a', fileHash])), hash: fileHash, fileName: kind + '.csv', parser: 'synthetic-' + kind, context, opening: '10000', closing, payslip: null,
    sourceRank: kind === 'statement' ? 2 : 3, sourceKind: kind, integrityTier: 'A',
    rows: rows.map(([date, description, amount, direction], i) => normalizeRow({sourceId: String(i), date, description, amount, direction, confidence: 9800}, context))};
}

it('keeps a refund link when the purchase it points at gets a new id', async () => {
  const {driver, raw} = memoryDriver(); await migrate(driver); const repo = repository(driver);
  await repo.addAccount({id: 'a', name: 'Synthetic', institution: 'Synthetic', type: 'checking', currency: 'AUD', mask_last4: null, opening_balance_minor: 0n});
  const one = doc('statement', [['2026-02-10', 'SYNTHETIC SHOE SHOP', '50.00', 'debit'], ['2026-02-15', 'SYNTHETIC SHOE SHOP REFUND', '20.00', 'credit']], '7000');
  const two = doc('export', [['2026-02-10', 'SYNTHETIC SHOE SHOP AU', '50.00', 'debit'], ['2026-02-15', 'SYNTHETIC SHOE SHOP REFUND', '20.00', 'credit']], '7000');
  for (const d of [one, two]) { await repo.imports.stage(d); await repo.imports.commit(d.id); }
  const ids = async () => Object.fromEntries((await driver.query('SELECT id,amount_minor FROM transactions')).map(r => [String(r.amount_minor), String(r.id)]));
  const before = await ids();
  await repo.refunds.save(before['2000']!, before['-5000']!);
  await repo.imports.rollback(one.id);
  const after = await ids();
  expect(after['-5000']).not.toBe(before['-5000']);
  const view = await repo.refunds.read(after['2000']!);
  expect(view.link?.purchaseId).toBe(after['-5000']);
  expect(await driver.query("SELECT key FROM app_settings WHERE key LIKE 'refund:%'")).toEqual([{key: 'refund:' + after['2000']}]);
  raw.close();
});
