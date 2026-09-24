import { hash } from '../src/ingest/normalize';
import { expect, it } from 'vitest';
import { encryptBackup, decryptBackup, normalizeRecoveryCode } from '../src/core/crypto/backup';
import { memoryDriver } from './db-helper';
import { migrate } from '../src/core/db/migrate';
import { repository } from '../src/core/db/repository';
import type { Driver } from '../src/core/db/driver';
/** What an older build's Today wrote into the derived tables, which restore must still replace. */
async function olderAnalysis(driver: Driver) {
  await driver.execute("INSERT INTO signals(id,period,key,value,computed_at,version,status,inputs) VALUES('AUD:2026-07:buffer_days','AUD:2026-07','buffer_days',NULL,'2026-07-01',1,'insufficient_data','{}')");
  await driver.execute("INSERT INTO profiles(id,period,archetype,axis_scores,confidence,version,covered_days) VALUES('AUD:2026-07','AUD:2026-07',NULL,'{}',0,1,0)");
}
const code = '2345-6789-ABCD-EFGH-JKLM-NPQR-STUV-WXYZ-2345-6789';
async function seeded() {
  const { driver } = memoryDriver(); await migrate(driver); const repo = repository(driver);
  await repo.addAccount({ id: 'a', name: 'Synthetic backup account', institution: 'Synthetic', type: 'checking', currency: 'AUD', mask_last4: null, opening_balance_minor: 12345n });
  await driver.execute("INSERT INTO import_batches(id,account_id,source_file_hash,file_name,parser_version,period_start,period_end,status,created_at) VALUES ('b','a','hash','Synthetic.csv','test','2026-03-01','2026-03-31','committed','2026-04-01')");
  await driver.execute("INSERT INTO coverage_ranges VALUES ('coverage','a','2026-03-01','2026-03-31','b')");
  await driver.execute("INSERT INTO transactions(id,account_id,posted_date,amount_minor,currency,raw_description,type,fingerprint,import_batch_id,confidence) VALUES ('t','a','2026-03-15',12000,'AUD','Synthetic pay','credit','synthetic-transaction','b',10000)");
  await driver.execute("INSERT INTO transaction_sources VALUES ('t','b','row-1','{}')");
  await driver.execute("INSERT INTO payslips(id,employer,pay_date,period_start,period_end,gross_minor,net_minor,tax_minor,super_minor,currency,linked_transaction_id,import_batch_id) VALUES ('pay','Synthetic employer','2026-03-15','2026-03-01','2026-03-15',15000,12000,3000,1500,'AUD','t','b')");
  await repo.imports.stageFile('Synthetic-file.csv', 'U3ludGhldGlj', hash('Synthetic'), 'session');
  return { repo, driver };
}
it('uses independent random salt and nonce, decrypting only with the full recovery code', async () => {
  const snapshot = { example: 'Synthetic private ledger' };
  const one = await encryptBackup(snapshot, code); const two = await encryptBackup(snapshot, code);
  expect(one).not.toEqual(two); expect(new TextDecoder().decode(one)).not.toContain('Synthetic private');
  expect(await decryptBackup(one, code.toLowerCase().replaceAll('-', ' '))).toEqual(snapshot);
  await expect(decryptBackup(one, code.replace('2345', '2346'))).rejects.toThrow('does not match');
  await expect(decryptBackup(one, '')).rejects.toThrow('complete 40-character');
  expect(() => normalizeRecoveryCode('246810')).toThrow();
});
it('rejects tampering with the salt, nonce, ciphertext and authentication tag', async () => {
  const encrypted = await encryptBackup({ private: true }, code);
  for (const offset of [16, 48, 62, encrypted.length - 1]) { const corrupt = encrypted.slice(); corrupt[offset] = (corrupt[offset] ?? 0) ^ 1; await expect(decryptBackup(corrupt, code)).rejects.toThrow(); }
  await expect(decryptBackup(encrypted.slice(0, -1), code)).rejects.toThrow();
});
it('round-trips all ledger tables, batches, coverage and encrypted-staging contents into a fresh database', async () => {
  const { repo } = await seeded(); const original = await repo.exportAll();
  const bytes = await encryptBackup(original, code); const { driver } = memoryDriver(); await migrate(driver); const fresh = repository(driver);
  await fresh.restoreBackup(await decryptBackup(bytes, code));
  expect((await fresh.exportAll()).tables).toEqual(original.tables);
});
it('refuses to overwrite a populated ledger', async () => {
  const { repo } = await seeded(); const original = await repo.exportAll();
  await expect(repo.restoreBackup(original)).rejects.toThrow('empty ledger');
  expect((await repo.exportAll()).tables).toEqual(original.tables);
});
it('restores after Today has calculated empty-installation signals and profiles', async () => {
  const { repo } = await seeded(); const original = await repo.exportAll();
  const { driver } = memoryDriver(); await migrate(driver); const fresh = repository(driver);
  await olderAnalysis(driver);
  expect(await driver.query('SELECT * FROM signals')).toHaveLength(1);
  expect(await driver.query('SELECT * FROM profiles')).toHaveLength(1);
  await fresh.restoreBackup(original);
  expect((await fresh.exportAll()).tables).toEqual(original.tables);
});
it('still protects a goal-only installation after empty-ledger analysis', async () => {
  const { repo } = await seeded(); const original = await repo.exportAll();
  const { driver } = memoryDriver(); await migrate(driver); const fresh = repository(driver);
  await olderAnalysis(driver);
  await fresh.intelligence.saveGoal({ id: 'g', name: 'Synthetic goal', target: '50000', funded: '0', date: '2026-12-01', kind: 'goal', currency: 'AUD' });
  const before = (await fresh.exportAll()).tables;
  await expect(fresh.restoreBackup(original)).rejects.toThrow('empty ledger');
  expect((await fresh.exportAll()).tables).toEqual(before);
});
it('rejects invalid columns, broken links, missing tables and inexact money without partial writes', async () => {
  const { repo } = await seeded(); const snapshot = await repo.exportAll();
  for (const kind of ['columns','links','tables','money']) {
    const bad = structuredClone(snapshot);
    if (kind === 'columns') bad.tables.accounts![0]!.unexpected = 'bad';
    if (kind === 'links') bad.tables.coverage_ranges![0]!.account_id = 'missing';
    if (kind === 'tables') delete bad.tables.coverage_ranges;
    if (kind === 'money') bad.tables.accounts![0]!.opening_balance_minor = 1.5;
    const { driver } = memoryDriver(); await migrate(driver); const fresh = repository(driver); const before = await fresh.exportAll();
    await expect(fresh.restoreBackup(bad)).rejects.toThrow(); expect((await fresh.exportAll()).tables).toEqual(before.tables);
  }
});
it('rolls back an interrupted restore, including its earlier inserted accounts', async () => {
  const { repo } = await seeded(); const snapshot = await repo.exportAll();
  const { driver } = memoryDriver(); await migrate(driver);
  await olderAnalysis(driver);
  const before = await repository(driver).exportAll();
  const failing: Driver = { ...driver, async execute(sql, values) { if (sql.startsWith('INSERT INTO coverage_ranges')) throw new Error('Synthetic storage interruption'); await driver.execute(sql, values); } };
  await expect(repository(failing).restoreBackup(snapshot)).rejects.toThrow('Synthetic storage interruption');
  expect((await repository(driver).exportAll()).tables).toEqual(before.tables);
});
