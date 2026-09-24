import up1 from './migrations/0001_foundation.up.sql?raw';
import down1 from './migrations/0001_foundation.down.sql?raw';
import up2 from './migrations/0002_query_indexes.up.sql?raw';
import down2 from './migrations/0002_query_indexes.down.sql?raw';
import up3 from './migrations/0003_export_sources.up.sql?raw';
import down3 from './migrations/0003_export_sources.down.sql?raw';
import up4 from './migrations/0004_fx_rates.up.sql?raw';
import down4 from './migrations/0004_fx_rates.down.sql?raw';
import up5 from './migrations/0005_debts.up.sql?raw';
import down5 from './migrations/0005_debts.down.sql?raw';
import up6 from './migrations/0006_people.up.sql?raw';
import down6 from './migrations/0006_people.down.sql?raw';
import up7 from './migrations/0007_row_guards.up.sql?raw';
import down7 from './migrations/0007_row_guards.down.sql?raw';
import type { Driver } from './driver';
export const migrations = [{ version: 1, up: up1, down: down1 }, { version: 2, up: up2, down: down2 }, { version: 3, up: up3, down: down3 }, { version: 4, up: up4, down: down4 }, { version: 5, up: up5, down: down5 }, { version: 6, up: up6, down: down6 }, { version: 7, up: up7, down: down7 }] as const;
/**
 * Split a migration into statements.
 *
 * ONE SCAN THAT KNOWS WHERE IT IS. Comments are removed and statements are separated in the same pass,
 * because both jobs need the same piece of knowledge — whether the character in hand is inside a quoted
 * string — and a pass that does not know that gets both wrong.
 *
 * Splitting on every ";" used to cut a statement in half whenever one appeared inside a comment, and the
 * fragments went to SQLite as SQL. It stayed hidden because no migration had ever carried a comment, and
 * it surfaced as a syntax error naming a word out of an English sentence — a long way from the
 * punctuation that caused it. Migrations are where the reasoning behind a schema belongs, and that
 * reasoning is worth nothing if writing it down can corrupt the schema.
 *
 * A ";" or a "--" inside a string literal or a quoted identifier is left exactly alone, for the same
 * reason: what looks like punctuation there is somebody's data.
 */
export function statements(sql: string): string[] {
  const out: string[] = [];
  let current = '', quote: string | null = null;
  for (let i = 0; i < sql.length; i++) {
    const char = sql[i]!;
    if (quote) { current += char; if (char === quote) quote = null; continue; }
    if (char === "'" || char === '"') { quote = char; current += char; continue; }
    if (char === '-' && sql[i + 1] === '-') { while (i < sql.length && sql[i] !== '\n') i++; current += '\n'; continue; }
    // A trigger's body holds its own ";" and ends only at END.
    if (char === ';' && /^\s*CREATE\s+TRIGGER\b/i.test(current) && !/\bEND\s*$/i.test(current)) { current += char; continue; }
    if (char === ';') { out.push(current); current = ''; continue; }
    current += char;
  }
  out.push(current);
  return out.map(s => s.trim()).filter(Boolean);
}
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
