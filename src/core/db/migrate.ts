import up1 from './migrations/0001_foundation.up.sql?raw';
import down1 from './migrations/0001_foundation.down.sql?raw';
import up2 from './migrations/0002_query_indexes.up.sql?raw';
import down2 from './migrations/0002_query_indexes.down.sql?raw';
import up3 from './migrations/0003_export_sources.up.sql?raw';
import down3 from './migrations/0003_export_sources.down.sql?raw';
import type { Driver } from './driver';
export const migrations = [{ version: 1, up: up1, down: down1 }, { version: 2, up: up2, down: down2 }, { version: 3, up: up3, down: down3 }] as const;
export function statements(sql: string): string[] { return sql.split(';').map(s => s.trim()).filter(Boolean); }
export async function migrate(driver: Driver, target: number = migrations.length, allowDestructive = false): Promise<void> {
  if (!Number.isInteger(target) || target < 0 || target > migrations.length) throw new Error('Unsupported schema version.');
  await driver.execute('CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY NOT NULL)');
  const currentRows = await driver.query('SELECT version FROM _migrations ORDER BY version');
  const current = Number(currentRows.at(-1)?.version ?? 0);
  if (current > migrations.length) throw new Error('This data was created by a newer app. Update Kairos to open it.');
  if (currentRows.some((r, i) => r.version !== i + 1)) throw new Error('Migration history is incomplete. Restore an encrypted backup.');
  if (target === 0 && current > 0 && !allowDestructive) throw new Error('Removing the foundation schema requires an explicit destructive rollback.');
  await driver.transaction(async () => {
    if (target >= current) {
      for (const migration of migrations.filter(m => m.version > current && m.version <= target)) {
        for (const sql of statements(migration.up)) await driver.execute(sql);
        await driver.execute('INSERT INTO _migrations(version) VALUES (?)', [migration.version]);
      }
    } else {
      for (const migration of [...migrations].reverse().filter(m => m.version <= current && m.version > target)) {
        for (const sql of statements(migration.down)) await driver.execute(sql);
        await driver.execute('DELETE FROM _migrations WHERE version=?', [migration.version]);
      }
    }
  });
}
