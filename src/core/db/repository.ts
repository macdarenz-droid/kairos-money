import {foreignCurrencyRepository} from '../../ledger/foreign-currency';
import {splitRepository} from '../../ledger/splits';
import {cancellationRepository} from '../../ledger/cancellations';
import { manualRepository } from '../../ledger/manual';
import { noticeRepository } from '../../ledger/notices';
import {notificationRepository} from '../../ledger/notifications';
import {categoryRepository} from '../../ledger/categories';
import {preferenceRepository} from '../../ledger/preferences';
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
  const refunds=()=>import('../../ledger/refunds').then(m=>m.refundRepository(driver));
  const netWorth=()=>import('../../ledger/net-worth').then(m=>m.netWorthRepository(driver));
  return {
    refunds:{read:async(id:string)=>(await refunds()).read(id),save:async(creditId:string,purchaseId:string)=>(await refunds()).save(creditId,purchaseId),remove:async(id:string)=>(await refunds()).remove(id)},
    imports: importService(driver),
    manual: manualRepository(driver),
    notices: noticeRepository(driver),
    notifications: notificationRepository(driver),
    cancellations: cancellationRepository(driver),
    netWorth:{list:async()=>(await netWorth()).list(),accountPositions:async()=>(await netWorth()).accountPositions(),chooseAccount:async(accountId:string,choice:'include'|'exclude')=>(await netWorth()).chooseAccount(accountId,choice),save:async(value:import('../../ledger/net-worth').Valuation)=>(await netWorth()).save(value),remove:async(id:string)=>(await netWorth()).remove(id)},
    categories: categoryRepository(driver),
    preferences: preferenceRepository(driver),
    splits: splitRepository(driver),
    foreignCurrency: foreignCurrencyRepository(driver),
    attachments: attachmentRepository(driver),
    restoreBackup: (snapshot: unknown) => restoreSnapshot(driver, snapshot),
    intelligence: intelligenceRepository(driver),
    async accounts() { return db.select().from(accounts).orderBy(asc(accounts.name), asc(accounts.id)); },
    /**
     * What each account actually holds now: the balance it opened with, plus every transaction recorded
     * against it.
     *
     * The Ledger used to print `opening_balance_minor` — the figure typed in when the account was created —
     * under a heading that said "Opening balances". That is literally true and practically useless: the
     * number never moves, so recording a purchase, importing a statement or approving a bank notification
     * all leave it unchanged, and the one screen meant to say how much money there is says how much there
     * used to be.
     *
     * Approved notifications count here. They are still marked unconfirmed until a statement carries the
     * same purchase, because that is honest about the evidence, but a balance that waits weeks for a
     * statement before it moves is a balance nobody can use — banks do not publish statements in real time.
     * Confirmation changes how much the app trusts a row, not whether the money left.
     *
     * Summed in SQL as exact integer minor units; the caller turns it into money.
     */
    async accountBalances(): Promise<{accountId: string; minor: string}[]> {
      const rows = await driver.query(
        `SELECT a.id AS id, a.opening_balance_minor AS opening,
                COALESCE((SELECT SUM(t.amount_minor) FROM transactions t WHERE t.account_id = a.id), 0) AS moved
         FROM accounts a ORDER BY a.name, a.id`);
      return rows.map(row => ({
        accountId: String(row.id),
        minor: (BigInt(String(row.opening ?? 0)) + BigInt(String(row.moved ?? 0))).toString(),
      }));
    },
    /**
     * An account was write-once: created, then permanently whatever it was typed as.
     *
     * A name with a typo stayed wrong, an opening balance entered before the first statement arrived
     * could never be corrected, and an account closed at the bank had no way to stop appearing. All of it
     * is ordinary bookkeeping, and none of it was reachable.
     *
     * Currency is deliberately NOT editable. Every transaction already recorded against this account is
     * stored in its minor units; changing the code would silently reinterpret cents as sen and rewrite
     * the account's whole history. Closing it and opening another is the honest path.
     */
    async updateAccount(id: string, changes: { name?: string; institution?: string; type?: AccountKind; mask_last4?: string | null; opening_balance_minor?: bigint; archived?: boolean }) {
      const [existing] = await db.select().from(accounts).where(eq(accounts.id, id));
      if (!existing) throw new Error('That account no longer exists.');
      const name = changes.name === undefined ? existing.name : changes.name.trim();
      if (!name || name.length > 80) throw new Error('Give the account a name between 1 and 80 characters.');
      if (changes.mask_last4 !== undefined && changes.mask_last4 !== null && !/^\d{4}$/.test(changes.mask_last4)) throw new Error('Use only the last four digits.');
      const code = currency(String(existing.currency));
      await db.update(accounts).set({
        name,
        institution: changes.institution === undefined ? existing.institution : changes.institution.trim(),
        type: changes.type ?? existing.type,
        mask_last4: changes.mask_last4 === undefined ? existing.mask_last4 : changes.mask_last4,
        opening_balance_minor: changes.opening_balance_minor === undefined ? existing.opening_balance_minor : toDatabase(money(changes.opening_balance_minor, code)),
        archived_at: changes.archived === undefined ? existing.archived_at : changes.archived ? new Date().toISOString() : null,
      }).where(eq(accounts.id, id));
    },
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
