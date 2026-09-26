import {expect, it} from 'vitest';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository} from '../src/core/db/repository';
import {hash, normalizeRow} from '../src/ingest/normalize';
import type {Document, ImportContext} from '../src/ingest/types';

const N = 300;
const day = (n: number) => new Date(Date.UTC(2025, 9, 1) + n * 86400000).toISOString().slice(0, 10);
// The old cubic matcher took about 6 s per approve here; the linear path takes about 0.2 s.
it('approves quickly beside 300 matching daily purchases', async () => {
  const {driver, raw} = memoryDriver(); await migrate(driver); const repo = repository(driver);
  await repo.addAccount({id:'cba',name:'CommBank',institution:'CommBank',type:'checking',currency:'AUD',mask_last4:null,opening_balance_minor:0n});
  for (let i = 0; i < N; i++) await repo.notices.approve({id: `n-${i}`, accountId: 'cba', date: day(i), minor: '-500', merchant: 'CAFE MIKA',
    description: 'You spent $5.00 at CAFE MIKA.', source: 'com.commbank.netbank', capturedAt: day(i) + 'T01:00:00Z'});
  const context: ImportContext = {accountId:'cba',accountKind:'checking',currency:'AUD',period:{start:day(0),end:day(N + 2)},dateOrder:'DMY',decimal:'.',creditPositivePurchases:false};
  const fileHash = hash('perf');
  const rows = Array.from({length: N}, (_, i) => { const [y, m, d] = day(i + 1).split('-'); return normalizeRow({sourceId: String(i), date: `${d}/${m}/${y}`, description: 'CAFE MIKA SYDNEY', amount: '5.00', direction: 'debit', confidence: 9800}, context); });
  const doc: Document = {id: hash(JSON.stringify(['cba', fileHash])), hash: fileHash, fileName: 'cba.csv', parser: 'synthetic-statement', context,
    opening: String(N * 500), closing: '0', payslip: null, sourceRank: 2, sourceKind: 'statement', integrityTier: 'A', rows};
  await repo.imports.stage(doc);
  for (const {row, blocked} of (await repo.imports.review(doc.id)).items) if (blocked) await repo.imports.correct(doc.id, row.sourceId, row, false);
  let t0 = performance.now(); await repo.imports.commit(doc.id); const commit = performance.now() - t0;
  t0 = performance.now();
  await repo.notices.approve({id: 'n-last', accountId: 'cba', date: day(N + 1), minor: '-500', merchant: 'CAFE MIKA',
    description: 'You spent $5.00 at CAFE MIKA.', source: 'com.commbank.netbank', capturedAt: day(N + 1) + 'T01:00:00Z'});
  const approve = performance.now() - t0;
  expect(commit).toBeLessThan(2000);
  expect(approve).toBeLessThan(2000);
  raw.close();
}, 60000);
