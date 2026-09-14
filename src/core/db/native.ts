import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import type { Driver, SqlRow, SqlValue } from './driver';

/**
 * Where device time actually goes, per statement shape.
 *
 * Local SQLite is unencrypted and in process, so it under-reports per-row decryption by orders of
 * magnitude; four separate repairs were aimed correctly at what local measurement showed and missed
 * what the device was doing. This records the shape of each statement and how long it took, never
 * the bound values, so no amount, description or other financial detail is retained.
 */
const profile = new Map<string, { calls: number; ms: number }>();
const shape = (sql: string) => sql.replace(/\s+/g, ' ').trim().slice(0, 70);
function record(sql: string, started: number): void {
  if (profile.size > 300) profile.clear();
  const key = shape(sql), seen = profile.get(key) ?? { calls: 0, ms: 0 };
  seen.calls += 1; seen.ms += Math.round(performance.now() - started);
  profile.set(key, seen);
}
/** Slowest statement shapes since the last reset, for performance measurement on a real device. */
export function queryProfile(limit = 6) {
  return [...profile].map(([sql, seen]) => ({ sql, ...seen })).sort((a, b) => b.ms - a.ms).slice(0, limit);
}
export function resetQueryProfile(): void { profile.clear(); }
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
      async query(sql, params = []) { const started = performance.now(); try { return rows((await db.query(sql, [...params])).values); } finally { record(sql, started); } },
      async execute(sql, params = []) { const started = performance.now(); try { if (params.length) await db.run(sql, [...params], false); else await db.execute(sql, false); } finally { record(sql, started); } },
      async transaction(work) { await db.beginTransaction(); try { const result = await work(); await db.commitTransaction(); return result; } catch (e) { await db.rollbackTransaction(); throw e; } },
    };
    (globalThis as { __kairosQueries?: unknown }).__kairosQueries = { read: queryProfile, reset: resetQueryProfile };
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
