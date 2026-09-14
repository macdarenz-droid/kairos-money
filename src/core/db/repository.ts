import {foreignCurrencyRepository} from '../../ledger/foreign-currency';
import {splitRepository} from '../../ledger/splits';
import {cancellationRepository} from '../../ledger/cancellations';
import { manualRepository } from '../../ledger/manual';
import {notificationRepository} from '../../ledger/notifications';
import {netWorthRepository} from '../../ledger/net-worth';
import {categoryRepository} from '../../ledger/categories';
import { attachmentRepository } from '../../ledger/attachments';
import { restoreSnapshot } from './restore';
import { intelligenceRepository } from '../../ledger/intelligence';
import { importService } from '../../ingest/service';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import { asc, eq } from 'drizzle-orm';
import { accounts, schema, tableNames } from './schema';
import type { Driver, SqlValue } from './driver';
import { currency, money, toDatabase, type Currency } from '../money';
export type AccountKind = 'checking' | 'savings' | 'credit' | 'cash' | 'loan' | 'investment';
export type NewAccount = { id: string; name: string; institution: string; type: AccountKind; currency: Currency; mask_last4: string | null; opening_balance_minor: bigint };
function values(params: unknown[]): SqlValue[] {
  return params.map(p => { if (p === null || typeof p === 'string' || (typeof p === 'number' && Number.isSafeInteger(p))) return p; throw new Error('Unsupported database parameter.'); });
}
export function repository(driver: Driver) {
  const db = drizzle(async (sql, params: unknown[], method) => {
    if (method === 'run') { await driver.execute(sql, values(params)); return { rows: [] }; }
    const rows = (await driver.query(sql, values(params))).map(row => Object.values(row));
    return { rows: method === 'get' ? (rows[0] ?? []) : rows };
  }, { schema });
  return {
    imports: importService(driver),
    manual: manualRepository(driver),
    notifications: notificationRepository(driver),
    cancellations: cancellationRepository(driver),
    netWorth: netWorthRepository(driver),
    categories: categoryRepository(driver),
    splits: splitRepository(driver),
    foreignCurrency: foreignCurrencyRepository(driver),
    attachments: attachmentRepository(driver),
    restoreBackup: (snapshot: unknown) => restoreSnapshot(driver, snapshot),
    intelligence: intelligenceRepository(driver),
    async accounts() { return db.select().from(accounts).orderBy(asc(accounts.name), asc(accounts.id)); },
    async addAccount(input: NewAccount) {
      const name = input.name.trim();
      if (!name || name.length > 80) throw new Error('Give the account a name between 1 and 80 characters.');
      if (input.mask_last4 !== null && !/^\d{4}$/.test(input.mask_last4)) throw new Error('Use only the last four digits.');
      currency(input.currency);
      await db.insert(accounts).values({ ...input, name, opening_balance_minor: toDatabase(money(input.opening_balance_minor, input.currency)), archived_at: null });
    },
    async findAccount(id: string) { return (await db.select().from(accounts).where(eq(accounts.id, id)))[0]; },
    async exportAll() {
      return driver.transaction(async () => {
        const tables: Record<string, Record<string, SqlValue>[]> = {};
        for (const table of tableNames) tables[table] = await driver.query(`SELECT * FROM ${table} ORDER BY rowid`);
        return { format: 'kairos-money', version: 1, schema_version: 2, database_schema_version: Number((await driver.query('SELECT MAX(version) AS version FROM _migrations'))[0]?.version ?? 0), exported_at: new Date().toISOString(), tables };
      });
    },
  };
}
export type Repository = ReturnType<typeof repository>;
export type Account = Awaited<ReturnType<Repository['accounts']>>[number];
