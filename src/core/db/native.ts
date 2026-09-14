import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import type { Driver, SqlRow, SqlValue } from './driver';
import { migrate } from './migrate';
import { verifyIntegrity } from './integrity';
import { repository } from './repository';
import { Vault } from '../crypto/native';
const name = 'kairos-money';
const sqlite = new SQLiteConnection(CapacitorSQLite);
let connection: SQLiteDBConnection | undefined;
let tail: Promise<unknown> = Promise.resolve();
export function serial<T>(work: () => Promise<T>): Promise<T> {
  const next = tail.then(work, work); tail = next.catch(() => undefined); return next;
}
function rows(value: unknown): SqlRow[] {
  if (!Array.isArray(value)) return [];
  return value.map((row: unknown) => {
    if (row === null || typeof row !== 'object') throw new Error('Database returned an invalid row.');
    const result: SqlRow = {};
    for (const [key, cell] of Object.entries(row)) {
      if (cell !== null && typeof cell !== 'string' && typeof cell !== 'number') throw new Error('Database returned an invalid field.');
      if (typeof cell === 'number' && !Number.isSafeInteger(cell)) throw new Error('Database returned an inexact number.');
      result[key] = cell as SqlValue;
    }
    return result;
  });
}
export async function openDatabase() {
  if (connection) throw new Error('Database is already open.');
  await Vault.prepareDatabase();
  const db = await sqlite.createConnection(name, true, 'secret', 1, false);
  try {
    await db.open();
    const cipher = rows((await db.query('PRAGMA cipher_version')).values);
    if (!cipher[0] || !Object.values(cipher[0]).some(v => typeof v === 'string' && /^\d+\./.test(v))) throw new Error('Encrypted storage is unavailable. No financial data was opened.');
    await db.execute('PRAGMA foreign_keys = ON;', false);
    const driver: Driver = {
      async query(sql, params = []) { return rows((await db.query(sql, [...params])).values); },
      async execute(sql, params = []) { if (params.length) await db.run(sql, [...params], false); else await db.execute(sql, false); },
      async transaction(work) { await db.beginTransaction(); try { const result = await work(); await db.commitTransaction(); return result; } catch (e) { await db.rollbackTransaction(); throw e; } },
    };
    await migrate(driver);
    await verifyIntegrity(driver);
    connection = db;
    return repository(driver);
  } catch (e) { await sqlite.closeConnection(name, false).catch(() => undefined); throw e; }
}
export async function closeDatabase(): Promise<void> {
  if (!connection) return;
  await sqlite.closeConnection(name, false); connection = undefined;
}
export async function deleteDatabase(): Promise<void> {
  await closeDatabase();
  await Vault.erase();
}
