import {describe, expect, it} from 'vitest';
import {memoryDriver} from './db-helper';
import {migrate, migrations} from '../src/core/db/migrate';
import {repository} from '../src/core/db/repository';
import {restoreSnapshot} from '../src/core/db/restore';

/**
 * A BACKUP IS ONLY A SAFETY NET IF IT STILL WORKS LATER.
 *
 * Restoring used to demand the backup's schema version EQUAL the app's, so the moment a migration
 * landed every backup anybody was holding became unrestorable — and the advice this app gives before a
 * reinstall is "back up first". That is the net having a hole exactly where it is needed.
 */
async function fresh() {
  const {driver} = memoryDriver();
  await migrate(driver);
  return {driver, repo: repository(driver)};
}
const snapshot = (tables: Record<string, unknown[]>, version = migrations.length) =>
  ({format: 'kairos-money', version: 1, database_schema_version: version, tables});
const empty = () => Object.fromEntries((['accounts', 'import_batches', 'coverage_ranges', 'categories',
  'merchants', 'rules', 'transactions', 'transaction_sources', 'staging_rows', 'payslips', 'goals',
  'signals', 'profiles', 'insights', 'privacy_log', 'app_settings'] as const).map(name => [name, []]));

describe('restoring a backup from an older Kairos', () => {
  it('accepts a backup written before the newest migration existed', async () => {
    const {driver} = await fresh();
    await expect(restoreSnapshot(driver, snapshot(empty(), 1))).resolves.toBeUndefined();
  });

  it('restores its rows rather than merely tolerating the file', async () => {
    const {driver, repo} = await fresh();
    const tables = {...empty(), accounts: [{id: 'a', name: 'Everyday', institution: 'Synthetic Bank',
      type: 'checking', currency: 'AUD', mask_last4: null, opening_balance_minor: 1000, archived_at: null}]};
    await restoreSnapshot(driver, snapshot(tables, 1));
    expect(await repo.accounts()).toHaveLength(1);
  });

  it('still refuses a backup from a NEWER Kairos', async () => {
    // Its data has nowhere to go. Dropping it quietly would be losing a ledger without saying so.
    const {driver} = await fresh();
    await expect(restoreSnapshot(driver, snapshot(empty(), migrations.length + 1)))
      .rejects.toThrow(/newer version/i);
  });

  it('still refuses a damaged backup that is missing a table it should have', async () => {
    // The relaxation must not become "any missing table is fine". A table that existed at the backup's
    // own version and is absent anyway is corruption, and looks identical in the file to a table that
    // had not been invented yet — which is the whole reason the introduction version is recorded.
    const {driver} = await fresh();
    const damaged = empty();
    delete (damaged as Record<string, unknown[]>)['coverage_ranges'];
    await expect(restoreSnapshot(driver, snapshot(damaged))).rejects.toThrow(/coverage_ranges/);
  });

  it('refuses a backup holding a table this build cannot place', async () => {
    const {driver} = await fresh();
    await expect(restoreSnapshot(driver, snapshot({...empty(), invented: []})))
      .rejects.toThrow(/cannot restore/i);
  });

  it('refuses a version that is not a whole number at all', async () => {
    const {driver} = await fresh();
    for (const version of [0, -1, 1.5, Number.NaN])
      await expect(restoreSnapshot(driver, snapshot(empty(), version))).rejects.toThrow(/could not be read/i);
  });
});
