import {describe, expect, it} from 'vitest';
import {memoryDriver} from './db-helper';
import {migrate, migrations} from '../src/core/db/migrate';
import {repository} from '../src/core/db/repository';
import {restoreSnapshot} from '../src/core/db/restore';
import {moveInOrder} from '../src/ledger/account-order';
import {currency} from '../src/core/money';

const account = (id: string, name: string) => ({id, name, institution: 'Synthetic Bank', type: 'checking' as const, currency: currency('AUD'), mask_last4: null, opening_balance_minor: 0n});
const names = async (repo: ReturnType<typeof repository>) => (await repo.accounts()).map(a => a.name);

describe('account order', () => {
  it('keeps the order an existing install already shows when it upgrades', async () => {
    const {driver} = memoryDriver(); await migrate(driver, 7); const repo = repository(driver);
    await repo.addAccount(account('b', 'Bills')); await repo.addAccount(account('a', 'Everyday')); await repo.addAccount(account('c', 'Arrears'));
    // What the app showed before this migration: name order.
    const before = (await driver.query('SELECT name FROM accounts ORDER BY name, id')).map(row => row.name);
    await migrate(driver);
    expect(await names(repo)).toEqual(before);
    expect(await driver.query('SELECT account_id FROM account_order ORDER BY position')).toEqual([{account_id: 'c'}, {account_id: 'b'}, {account_id: 'a'}]);
  });

  it('saves a chosen order, and new accounts join at the end', async () => {
    const {driver} = memoryDriver(); await migrate(driver); const repo = repository(driver);
    for (const [id, name] of [['a', 'Alpha'], ['b', 'Beta'], ['c', 'Gamma']] as const) await repo.addAccount(account(id, name));
    await repo.orderAccounts(['c', 'a', 'b']);
    expect(await names(repo)).toEqual(['Gamma', 'Alpha', 'Beta']);
    await repo.addAccount(account('d', 'Aardvark'));
    expect(await names(repo)).toEqual(['Gamma', 'Alpha', 'Beta', 'Aardvark']);
    await expect(repo.orderAccounts(['c', 'a'])).rejects.toThrow();
    await expect(repo.orderAccounts(['c', 'a', 'b', 'd', 'x'])).rejects.toThrow();
  });

  it('moves one step up or down and stops at either end', () => {
    expect(moveInOrder(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveInOrder(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
    expect(moveInOrder(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(moveInOrder(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c']);
    expect(moveInOrder(['a', 'b', 'c'], 'a', 2)).toEqual(['b', 'c', 'a']);
  });

  it('carries the order through a backup and restore, and still restores an older backup', async () => {
    const source = memoryDriver(); await migrate(source.driver); const from = repository(source.driver);
    for (const [id, name] of [['a', 'Alpha'], ['b', 'Beta']] as const) await from.addAccount(account(id, name));
    await from.orderAccounts(['b', 'a']);
    const backup = JSON.parse(JSON.stringify(await from.exportAll()));
    expect(backup.database_schema_version).toBe(migrations.length);

    const target = memoryDriver(); await migrate(target.driver); const to = repository(target.driver);
    await restoreSnapshot(target.driver, backup);
    expect(await names(to)).toEqual(['Beta', 'Alpha']);

    const older = {...backup, database_schema_version: 7, tables: {...backup.tables}}; delete older.tables.account_order;
    const again = memoryDriver(); await migrate(again.driver); const plain = repository(again.driver);
    await restoreSnapshot(again.driver, older);
    expect(await names(plain)).toEqual(['Alpha', 'Beta']);
  });
});
