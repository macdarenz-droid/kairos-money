import type { Driver, SqlRow, SqlValue } from './driver';
import { migrations } from './migrate';
import { tableNames } from './schema';
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function validate(value: unknown): Record<string, SqlRow[]> {
  if (!object(value) || value.format !== 'kairos-money' || value.version !== 1 || value.database_schema_version !== migrations.length || !object(value.tables))
    throw new Error('This backup uses an unsupported database version. Restore it with the matching Kairos version first.');
  const tables = value.tables;
  if (Object.keys(tables).length !== tableNames.length || tableNames.some(name => !Object.hasOwn(tables, name))) throw new Error('The backup is missing ledger tables. Nothing was restored.');
  const result: Record<string, SqlRow[]> = {};
  for (const name of tableNames) {
    const rows = tables[name];
    if (!Array.isArray(rows)) throw new Error(`The backup table ${name} is invalid. Nothing was restored.`);
    result[name] = rows.map((row: unknown) => {
      if (!object(row)) throw new Error(`The backup table ${name} contains an invalid row.`);
      const parsed: SqlRow = {};
      for (const [column, cell] of Object.entries(row)) {
        if (cell !== null && typeof cell !== 'string' && !(typeof cell === 'number' && Number.isSafeInteger(cell))) throw new Error(`The backup table ${name} contains an inexact or invalid value.`);
        parsed[column] = cell as SqlValue;
      }
      return parsed;
    });
  }
  return result;
}
export async function restoreSnapshot(driver: Driver, snapshot: unknown): Promise<void> {
  const tables = validate(snapshot);
  await driver.transaction(async () => {
    for (const table of tableNames) {
      if (table !== 'categories' && table !== 'app_settings' && Number((await driver.query(`SELECT COUNT(*) AS count FROM ${table}`))[0]?.count) > 0)
        throw new Error('Restore requires an empty ledger. Export or back up this installation before resetting it.');
      const columns = (await driver.query(`PRAGMA table_info(${table})`)).map(row => String(row.name));
      for (const row of tables[table] ?? []) if (Object.keys(row).length !== columns.length || columns.some(column => !Object.hasOwn(row, column)))
        throw new Error(`The backup table ${table} has incompatible columns. Nothing was restored.`);
    }
    await driver.execute('PRAGMA defer_foreign_keys=ON');
    for (const table of [...tableNames].reverse()) await driver.execute(`DELETE FROM ${table}`);
    for (const table of tableNames) for (const row of tables[table] ?? []) {
      const columns = Object.keys(row);
      await driver.execute(`INSERT INTO ${table} (${columns.map(column => `"${column}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`, columns.map(column => row[column] ?? null));
    }
    if ((await driver.query('PRAGMA foreign_key_check')).length) throw new Error('The backup has broken transaction links. Nothing was restored.');
  });
}
