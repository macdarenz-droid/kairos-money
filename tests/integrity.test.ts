import { describe, expect, it } from 'vitest';
import { verifyIntegrity } from '../src/core/db/integrity';
import { migrate } from '../src/core/db/migrate';
import { memoryDriver } from './db-helper';
import type { Driver } from '../src/core/db/driver';

describe('ledger integrity check', () => {
  it('accepts a valid migrated ledger', async () => {
    const { driver } = memoryDriver();
    await migrate(driver);
    await expect(verifyIntegrity(driver)).resolves.toBeUndefined();
  });

  it('rejects a failed SQLite quick check', async () => {
    const { driver } = memoryDriver();
    const damaged: Driver = {
      ...driver,
      async query(sql, values) {
        if (sql === 'PRAGMA quick_check') return [{ quick_check: 'database disk image is malformed' }];
        return driver.query(sql, values);
      },
    };
    await expect(verifyIntegrity(damaged)).rejects.toThrow('encrypted ledger is damaged');
  });

  it('rejects broken transaction links even when SQLite pages are readable', async () => {
    const { driver, raw } = memoryDriver();
    await migrate(driver);
    raw.exec('PRAGMA foreign_keys=OFF');
    raw.exec("INSERT INTO coverage_ranges(id,account_id,period_start,period_end,import_batch_id) VALUES ('broken','missing','2026-01-01','2026-01-31','missing')");
    raw.exec('PRAGMA foreign_keys=ON');
    await expect(verifyIntegrity(driver)).rejects.toThrow('Restore a verified Kairos backup');
  });
});
