import type { Driver, SqlRow, SqlValue } from './driver';
import { migrations } from './migrate';
import { isSecretKey, SECRET_KEY_SQL, tableIntroduced, tableNames } from './schema';
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
/**
 * A BACKUP MADE BY AN OLDER KAIROS MUST STILL RESTORE.
 *
 * This used to demand the backup's schema version EQUAL the current one, so the moment a migration was
 * added every backup anybody was holding became unrestorable — with a message telling them to go and
 * find an older build of the app. For a ledger whose whole safety net is "back up before you reinstall",
 * that is the net having a hole in exactly the place it is needed.
 *
 * Accepting an older version is safe because it was never the check doing the real work. A backup is
 * only compatible if its ROWS still fit the tables, and that is verified per table, column by column,
 * further down — which is precise where a version number is blunt. Migration 3 added columns to
 * transactions and import_batches, so a backup from before it correctly fails on those two tables by
 * name, instead of everything failing on a number.
 *
 * A table the backup could not have known about — one introduced by a LATER migration than the backup
 * was written at — is left as this phone has it. A table that existed at that version and is absent anyway is a
 * damaged backup and is refused: those two look identical in the file, and treating them the same means
 * either silently losing a ledger or rejecting every backup taken before the newest feature.
 *
 * A table THIS build has never heard of is also a refusal: that backup came from a newer Kairos, its
 * data has nowhere to go, and dropping it quietly would be losing somebody's ledger without saying so.
 */
function validate(value: unknown): Record<string, SqlRow[]> {
  if (!object(value) || value.format !== 'kairos-money' || value.version !== 1 || !object(value.tables)
    || typeof value.database_schema_version !== 'number' || !Number.isInteger(value.database_schema_version)
    || value.database_schema_version < 1)
    throw new Error('This backup could not be read. Nothing was restored.');
  if (value.database_schema_version > migrations.length)
    throw new Error('This backup was made by a newer version of Kairos. Update the app, then restore it.');
  const tables = value.tables;
  const unknown = Object.keys(tables).filter(name => !(tableNames as readonly string[]).includes(name));
  if (unknown.length) throw new Error(`The backup holds tables this version cannot restore: ${unknown.join(', ')}. Nothing was restored.`);
  const result: Record<string, SqlRow[]> = {};
  for (const name of tableNames) {
    if (!Object.hasOwn(tables, name) && (tableIntroduced[name] ?? 1) > value.database_schema_version) continue;
    // Exchange rates joined the export at schema_version 3; an older export never carried them.
    if (!Object.hasOwn(tables, name) && name === 'fx_rates' && !(typeof value.schema_version === 'number' && value.schema_version >= 3)) continue;
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
  if (result['app_settings']?.some(row => isSecretKey(String(row.key))))
    throw new Error('This backup holds a secret key, which never leaves a phone. Nothing was restored.');
  return result;
}
export async function restoreSnapshot(driver: Driver, snapshot: unknown): Promise<void> {
  const tables = validate(snapshot);
  await driver.transaction(async () => {
    for (const table of tableNames) {
      // These fill in before the first account exists (Today's derived tables, fetched or typed rates).
      // A backup that carries them replaces them atomically; they are not ledger data.
      const generated = ['categories', 'app_settings', 'signals', 'profiles', 'insights', 'fx_rates'].includes(table);
      if (!generated && Number((await driver.query(`SELECT COUNT(*) AS count FROM ${table}`))[0]?.count) > 0)
        throw new Error('Restore requires an empty ledger. Export or back up this installation before resetting it.');
      const columns = (await driver.query(`PRAGMA table_info(${table})`)).map(row => String(row.name));
      for (const row of tables[table] ?? []) if (Object.keys(row).length !== columns.length || columns.some(column => !Object.hasOwn(row, column)))
        throw new Error(`The backup table ${table} has incompatible columns. Nothing was restored.`);
    }
    const secrets = await driver.query(`SELECT key,value FROM app_settings WHERE ${SECRET_KEY_SQL}`);
    await driver.execute('PRAGMA defer_foreign_keys=ON');
    // A table the backup never carried stays: ledger tables are empty by now, typed rates are not.
    for (const table of [...tableNames].reverse()) if (Object.hasOwn(tables, table)) await driver.execute(`DELETE FROM ${table}`);
    for (const table of tableNames) for (const row of tables[table] ?? []) {
      const columns = Object.keys(row);
      await driver.execute(`INSERT INTO ${table} (${columns.map(column => `"${column}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`, columns.map(column => row[column] ?? null));
    }
    for (const secret of secrets) await driver.execute('INSERT INTO app_settings(key,value) VALUES(?,?)', [secret.key ?? null, secret.value ?? null]);
    if ((await driver.query('PRAGMA foreign_key_check')).length) throw new Error('The backup has broken transaction links. Nothing was restored.');
  });
}
