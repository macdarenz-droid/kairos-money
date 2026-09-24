import {describe, expect, it} from 'vitest';
import {readFileSync} from 'node:fs';
import {strFromU8, unzipSync} from 'fflate';
import {memoryDriver} from './db-helper';
import {migrate, migrations} from '../src/core/db/migrate';
import {repository} from '../src/core/db/repository';
import {exportArchive} from '../src/core/db/export';
import type {Driver} from '../src/core/db/driver';

async function fresh() {
  const {driver, raw} = memoryDriver(); await migrate(driver);
  return {driver, raw, repo: repository(driver)};
}
/** Counts the rows each bridge call returns, as the native driver would carry them. */
function counting(driver: Driver) {
  const sizes: number[] = [];
  const wrapped: Driver = {...driver, query: async (sql, values) => { const rows = await driver.query(sql, values); sizes.push(rows.length); return rows; }};
  return {driver: wrapped, sizes};
}
const rate = {asOf: '2026-02-02', base: 'PHP', quote: 'AUD', rateE8: 2600000n, source: 'published'};

describe('export and backup', () => {
  it('read every table in pages of at most 256 rows', async () => {
    const {driver, raw} = await fresh();
    for (let i = 0; i < 600; i++) await driver.execute('INSERT INTO app_settings(key,value) VALUES(?,?)', [`bulk:${String(i).padStart(4, '0')}`, '1']);
    const spy = counting(driver);
    const all = await repository(spy.driver).exportAll();
    expect(all.tables['app_settings']!.filter(r => String(r.key).startsWith('bulk:'))).toHaveLength(600);
    expect(Math.max(...spy.sizes)).toBeLessThanOrEqual(256);
    expect(Object.keys(all.tables['app_settings']![0]!)).toEqual(['key', 'value']);
    raw.close();
  });

  it('carry exchange rates at export schema version 3, and restore them', async () => {
    const {repo, raw} = await fresh();
    await repo.saveRates([rate]);
    const all = await repo.exportAll();
    expect(all.schema_version).toBe(3);
    expect(all.tables['fx_rates']).toEqual([expect.objectContaining({as_of: '2026-02-02', base: 'PHP', quote: 'AUD', rate_e8: 2600000})]);
    const target = await fresh();
    await target.repo.saveRates([{...rate, asOf: '2026-01-01'}]); // fetched before the first account
    await target.repo.restoreBackup(all);
    expect((await target.repo.exportAll()).tables['fx_rates']).toEqual(all.tables['fx_rates']);
    raw.close(); target.raw.close();
  });

  it('still restore a version-2 backup, which had no exchange rates', async () => {
    const {repo, raw} = await fresh();
    await repo.addAccount({id: 'a', name: 'Everyday', institution: 'Synthetic', type: 'checking', currency: 'AUD', mask_last4: null, opening_balance_minor: 100n});
    const {fx_rates: _dropped, ...tables} = (await repo.exportAll()).tables;
    const old = {format: 'kairos-money', version: 1, schema_version: 2, database_schema_version: migrations.length, exported_at: '2026-01-01T00:00:00Z', tables};
    const target = await fresh();
    await target.repo.restoreBackup(old);
    expect(await target.repo.accounts()).toHaveLength(1);
    expect(_dropped).toEqual([]);
    const damaged = {...old, schema_version: 3};
    const other = await fresh();
    await expect(other.repo.restoreBackup(damaged)).rejects.toThrow(/fx_rates/);
    raw.close(); target.raw.close(); other.raw.close();
  });
});

describe('secrets never leave the phone', () => {
  it('are left out of the export, the ZIP and the backup', async () => {
    const {driver, repo, raw} = await fresh();
    await driver.execute('INSERT INTO app_settings(key,value) VALUES(?,?)', ['secret:claude-key', JSON.stringify('sk-ant-synthetic')]);
    const all = await repo.exportAll();
    expect(JSON.stringify(all)).not.toContain('sk-ant-synthetic');
    const zip = unzipSync(await exportArchive(repo));
    for (const [name, bytes] of Object.entries(zip)) expect(strFromU8(bytes), name).not.toContain('secret:');
    raw.close();
  });

  it('on this phone survive a restore, and a backup carrying one is refused', async () => {
    const source = await fresh();
    const backup = await source.repo.exportAll();
    const {driver, repo, raw} = await fresh();
    await driver.execute('INSERT INTO app_settings(key,value) VALUES(?,?)', ['secret:claude-key', JSON.stringify('local')]);
    await repo.restoreBackup(backup);
    expect(await driver.query("SELECT value FROM app_settings WHERE key='secret:claude-key'")).toEqual([{value: '"local"'}]);
    const leaked = {...backup, tables: {...backup.tables, app_settings: [...backup.tables['app_settings']!, {key: 'secret:claude-key', value: '"x"'}]}};
    const other = await fresh();
    await expect(other.repo.restoreBackup(leaked)).rejects.toThrow(/secret/i);
    source.raw.close(); raw.close(); other.raw.close();
  });
});

describe('the advisor call log', () => {
  it('records model, tokens, cost and result, and reads them back newest first', async () => {
    const {repo, raw} = await fresh();
    await repo.privacy.logAdvisorCall({model: 'claude-opus-5', inputTokens: 1200, outputTokens: 300, costMicros: 13500n, result: 'ok', at: '2026-02-01T00:00:00Z'});
    await repo.privacy.logAdvisorCall({model: 'claude-haiku-4-5', inputTokens: 10, outputTokens: 0, costMicros: 10n, result: 'refused', at: '2026-02-02T00:00:00Z'});
    expect(await repo.privacy.advisorCalls()).toEqual([
      {id: expect.any(String), at: '2026-02-02T00:00:00Z', model: 'claude-haiku-4-5', inputTokens: 10, outputTokens: 0, costMicros: '10', result: 'refused'},
      {id: expect.any(String), at: '2026-02-01T00:00:00Z', model: 'claude-opus-5', inputTokens: 1200, outputTokens: 300, costMicros: '13500', result: 'ok'},
    ]);
    await expect(repo.privacy.logAdvisorCall({model: 'x', inputTokens: -1, outputTokens: 0, costMicros: 0n, result: 'ok'})).rejects.toThrow();
    raw.close();
  });
});

it('documents the real schema version', () => {
  const doc = readFileSync('docs/SCHEMA.md', 'utf8');
  expect(doc).toContain(`Schema version: ${migrations.length}.`);
  expect(doc).toContain('## ious');
});
