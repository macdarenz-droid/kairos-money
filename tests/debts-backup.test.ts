import {describe, expect, it} from 'vitest';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository} from '../src/core/db/repository';
import {restoreSnapshot} from '../src/core/db/restore';
import {tableNames} from '../src/core/db/schema';

/**
 * A debt survives a backup and a restore.
 *
 * This is the whole reason the frozen export contract was moved. An exchange rate left out of a backup
 * is re-downloaded and nobody notices; a debt is typed in by hand — a balance, a rate, a minimum
 * payment — and if a backup does not carry it, restoring means entering it all again, at exactly the
 * moment somebody has just lost their phone.
 */
async function ledger() {
  const {driver} = memoryDriver();
  await migrate(driver);
  return {driver, repo: repository(driver)};
}
const debt = {id: 'd1', name: 'Synthetic card', account_id: null, currency: 'AUD',
  balance_minor: 300000, annual_rate_bp: 2400, minimum_minor: 10000, due_day: 15,
  opened_at: '2026-01-01', closed_at: null};

describe('debts in a backup', () => {
  it('is one of the tables a backup carries', () => {
    expect(tableNames).toContain('debts');
  });

  it('comes back with its rate and minimum intact', async () => {
    const source = await ledger();
    await source.driver.execute(
      'INSERT INTO debts(id,name,account_id,currency,balance_minor,annual_rate_bp,minimum_minor,due_day,opened_at,closed_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
      Object.values(debt) as never);
    const snapshot = await source.repo.exportAll();
    expect(snapshot.tables['debts']).toHaveLength(1);

    const restored = await ledger();
    await restoreSnapshot(restored.driver, snapshot);
    const [row] = await restored.driver.query('SELECT * FROM debts');
    // Every field, not just the balance: a rate or a minimum lost in transit produces a payoff
    // projection that is quietly wrong rather than obviously missing.
    expect(row).toMatchObject({id: 'd1', balance_minor: 300000, annual_rate_bp: 2400,
      minimum_minor: 10000, due_day: 15});
  });

  it('exports cleanly from a database that has not reached migration 5', async () => {
    // A partially migrated database has no debts table. Asking it for one used to fail the entire
    // backup with "no such table", which is a strange way to lose a working export.
    const {driver} = memoryDriver();
    await migrate(driver, 1);
    const snapshot = await repository(driver).exportAll();
    expect(snapshot.tables['debts']).toBeUndefined();
    expect(snapshot.tables['accounts']).toEqual([]);
  });
});
