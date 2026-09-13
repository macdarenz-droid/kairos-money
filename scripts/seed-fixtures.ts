import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { seedSynthetic } from '../tests/fixtures';
import type { Driver, SqlRow } from '../src/core/db/driver';
mkdirSync('fixtures/generated', { recursive: true });
const db = new DatabaseSync('fixtures/generated/SYNTHETIC-DEV-ONLY.sqlite');
if (db.prepare("SELECT name FROM sqlite_master WHERE name='accounts'").get()) throw new Error('Fixture already exists. Remove it explicitly before reseeding.');
db.exec('PRAGMA foreign_keys=ON');
db.exec(readFileSync('src/core/db/migrations/0001_foundation.up.sql', 'utf8'));
db.exec(readFileSync('src/core/db/migrations/0002_query_indexes.up.sql', 'utf8'));
const driver: Driver = {
  async execute(sql, values = []) { db.prepare(sql).run(...values); },
  async query(sql, values = []) { return db.prepare(sql).all(...values) as SqlRow[]; },
  async transaction(work) { db.exec('BEGIN'); try { const result = await work(); db.exec('COMMIT'); return result; } catch (e) { db.exec('ROLLBACK'); throw e; } },
};
await seedSynthetic(driver); db.close();
console.log('Created SYNTHETIC-DEV-ONLY.sqlite outside all shipped entry points.');
