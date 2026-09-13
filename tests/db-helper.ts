import { DatabaseSync } from 'node:sqlite';
import type { Driver, SqlRow } from '../src/core/db/driver';
export function memoryDriver(): { driver: Driver; raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:'); raw.exec('PRAGMA foreign_keys=ON');
  const driver: Driver = {
    async query(sql, params = []) { return raw.prepare(sql).all(...params) as SqlRow[]; },
    async execute(sql, params = []) { if (params.length) raw.prepare(sql).run(...params); else raw.exec(sql); },
    async transaction(work) { raw.exec('BEGIN IMMEDIATE'); try { const result = await work(); raw.exec('COMMIT'); return result; } catch (e) { raw.exec('ROLLBACK'); throw e; } },
  };
  return { driver, raw };
}
