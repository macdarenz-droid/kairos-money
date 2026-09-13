import { describe, expect, it } from 'vitest';
import { getTableColumns } from 'drizzle-orm';
import { migrate } from '../src/core/db/migrate';
import { schema, tableNames } from '../src/core/db/schema';
import { repository } from '../src/core/db/repository';
import { memoryDriver } from './db-helper';
import { seedSynthetic } from './fixtures';
describe('Schema and repository', () => {
  it('migrates a populated database backwards and forwards without losing rows', async () => {
    const { driver, raw } = memoryDriver();
    await migrate(driver, 1); await seedSynthetic(driver);
    const repo = repository(driver); const before = (await repo.exportAll()).tables;
    expect(Object.values(before).every(rows => rows.length > 0)).toBe(true);
    await migrate(driver, 2); await migrate(driver, 1); await migrate(driver, 2);
    expect((await repo.exportAll()).tables).toEqual(before);
    await expect(migrate(driver, 0)).rejects.toThrow('explicit');
    await migrate(driver, 0, true);
    expect(await driver.query("SELECT name FROM sqlite_master WHERE type='table' AND name <> '_migrations'")).toEqual([]);
    expect(await driver.query('SELECT * FROM _migrations')).toEqual([]);
    await migrate(driver); expect((await repo.accounts()).length).toBe(0);
    raw.close();
  });
  it('keeps Drizzle columns aligned with canonical SQL', async () => {
    const { driver, raw } = memoryDriver(); await migrate(driver);
    for (const name of tableNames) {
      const columns = await driver.query(`PRAGMA table_info(${name})`);
      expect(columns.map(c => c.name)).toEqual(Object.keys(getTableColumns(schema[name])));
    }
    raw.close();
  });
  it('creates a real account and queries exact values using Drizzle', async () => {
    const { driver, raw } = memoryDriver(); await migrate(driver); const repo = repository(driver);
    await repo.addAccount({ id: 'a', name: ' Everyday ', institution: 'Bank', type: 'checking', currency: 'AUD', mask_last4: '1234', opening_balance_minor: 9007199254740991n });
    expect((await repo.findAccount('a'))?.opening_balance_minor).toBe(9007199254740991);
    expect((await repo.accounts())[0]?.name).toBe('Everyday');
    await expect(repo.addAccount({ id: 'b', name: '', institution: '', type: 'cash', currency: 'AUD', mask_last4: null, opening_balance_minor: 0n })).rejects.toThrow();
    raw.close();
  });
  it('rolls back failed transactions and enforces financial constraints', async () => {
    const { driver, raw } = memoryDriver(); await migrate(driver); await seedSynthetic(driver);
    await expect(driver.transaction(async () => {
      await driver.execute("UPDATE accounts SET name='Changed' WHERE id='fake-account'");
      await driver.execute("UPDATE transactions SET amount_minor=1 WHERE id='fake-txn'");
    })).rejects.toThrow();
    expect((await driver.query('SELECT name FROM accounts'))[0]?.name).toBe('Synthetic test account');
    await expect(driver.execute('UPDATE accounts SET opening_balance_minor=0.1')).rejects.toThrow();
    await expect(driver.execute('UPDATE accounts SET opening_balance_minor=9007199254740992')).rejects.toThrow();
    await expect(driver.execute("UPDATE profiles SET archetype='Drifter'")).rejects.toThrow();
    await expect(driver.execute("DELETE FROM accounts WHERE id='fake-account'")).rejects.toThrow();
    raw.close();
  });
  it('refuses newer or incomplete migration history', async () => {
    const { driver, raw } = memoryDriver(); await migrate(driver);
    await driver.execute('INSERT INTO _migrations VALUES(99)'); await expect(migrate(driver)).rejects.toThrow('newer');
    await driver.execute('DELETE FROM _migrations WHERE version=99 OR version=1'); await expect(migrate(driver)).rejects.toThrow('incomplete'); raw.close();
  });
});
