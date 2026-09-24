import {foreignCurrencyRepository} from '../../ledger/foreign-currency';
import {splitRepository} from '../../ledger/splits';
import {debtRepository} from '../../ledger/debts';
import {peopleRepository} from '../../ledger/people';
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
import { accounts, schema, SECRET_KEY_SQL, tableNames } from './schema';
import { queryPages } from './query-pages';
import { privacyRepository } from './privacy';
import { aiCategoryRepository, sortingPayload } from '../../ledger/ai-categories';
import { merchantRuleRepository } from '../../ledger/rules';
import { advisorRepository } from '../../ledger/advisor';
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
  const imports = importService(driver);
  return {
    refunds:{read:async(id:string)=>(await refunds()).read(id),save:async(creditId:string,purchaseId:string)=>(await refunds()).save(creditId,purchaseId),remove:async(id:string)=>(await refunds()).remove(id)},
    imports,
    aiCategories: {...aiCategoryRepository(driver, imports.rebuild), payload: async (onlyNew: boolean) => sortingPayload(driver, await imports.ledger(), onlyNew)},
    merchantRules: merchantRuleRepository(driver, imports.rebuild),
    manual: manualRepository(driver),
    notices: noticeRepository(driver),
    notifications: notificationRepository(driver),
    cancellations: cancellationRepository(driver),
    netWorth:{list:async()=>(await netWorth()).list(),accountPositions:async()=>(await netWorth()).accountPositions(),chooseAccount:async(accountId:string,choice:'include'|'exclude')=>(await netWorth()).chooseAccount(accountId,choice),save:async(value:import('../../ledger/net-worth').Valuation)=>(await netWorth()).save(value),remove:async(id:string)=>(await netWorth()).remove(id)},
    categories: categoryRepository(driver),
    preferences: preferenceRepository(driver),
    splits: splitRepository(driver),
    debts: debtRepository(driver),
    people: peopleRepository(driver),
    foreignCurrency: foreignCurrencyRepository(driver),
    attachments: attachmentRepository(driver),
    restoreBackup: (snapshot: unknown) => restoreSnapshot(driver, snapshot),
    privacy: privacyRepository(driver),
    advisor: advisorRepository(driver),
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
    /**
     * Published rates, kept by the day they belong to.
     *
     * Stored rather than fetched on demand, for two reasons. A rate that is only ever "now" cannot value
     * a purchase from March, and an app that needs the network to show a total is an app that shows
     * nothing on a train.
     */
    /** The currency totals are shown in. Stored, because it is a preference, not a fact about an account. */
    async displayCurrency(): Promise<string | null> {
      const row = (await driver.query("SELECT value FROM app_settings WHERE key='display-currency'"))[0];
      if (!row) return null;
      const saved = JSON.parse(String(row.value)) as {code?: unknown};
      return typeof saved.code === 'string' ? saved.code : null;
    },
    async setDisplayCurrency(code: string) {
      currency(code);
      await driver.execute("INSERT INTO app_settings(key,value) VALUES('display-currency',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        [JSON.stringify({ code })]);
    },
    async saveRates(rows: readonly {asOf: string; base: string; quote: string; rateE8: bigint; source: string}[]) {
      const now = new Date().toISOString();
      for (const row of rows) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(row.asOf)) throw new Error('A rate must be dated.');
        if (row.rateE8 <= 0n) throw new Error('An exchange rate must be greater than zero.');
        currency(row.base); currency(row.quote);
        // Re-fetching a day it already holds overwrites it, so a correction at the source lands, but a
        // day is never duplicated and the ledger never sees two rates for one date.
        await driver.execute(
          'INSERT INTO fx_rates(as_of,base,quote,rate_e8,source,fetched_at) VALUES(?,?,?,?,?,?) ' +
          'ON CONFLICT(as_of,base,quote) DO UPDATE SET rate_e8=excluded.rate_e8, source=excluded.source, fetched_at=excluded.fetched_at',
          [row.asOf, row.base, row.quote, toDatabase(money(row.rateE8, currency(row.base))), row.source, now]);
      }
    },
    async rates(): Promise<{asOf: string; base: string; quote: string; rateE8: string; source: string}[]> {
      const rows = await driver.query('SELECT as_of, base, quote, rate_e8, source FROM fx_rates ORDER BY as_of DESC');
      return rows.map(row => ({ asOf: String(row.as_of), base: String(row.base), quote: String(row.quote),
        rateE8: String(row.rate_e8), source: String(row.source) }));
    },
    /**
     * The first and last day the ledger has anything on, so a rate refresh can cover it.
     *
     * Two aggregates over an indexed column; it is asked for once, when somebody presses Update.
     */
    async ledgerSpan(): Promise<{first: string; last: string} | null> {
      const row = (await driver.query('SELECT MIN(posted_date) AS first, MAX(posted_date) AS last FROM transactions'))[0];
      return row?.first && row.last ? { first: String(row.first), last: String(row.last) } : null;
    },
    /** When the newest stored rate is from, so the app can say how fresh its figures are. */
    async ratesAsOf(): Promise<string | null> {
      const row = (await driver.query('SELECT MAX(as_of) AS latest FROM fx_rates'))[0];
      return row?.latest ? String(row.latest) : null;
    },
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
    /**
     * Every ledger table this database actually has.
     *
     * Which tables EXIST is asked of the database rather than assumed from the list, because a database
     * is not always at the newest schema — a partially migrated one, or one a test walks backwards, has
     * fewer. Exporting a table that is not there yet fails the whole backup with "no such table", which
     * is a strange way to lose a working export.
     */
    async exportAll() {
      return driver.transaction(async () => {
        const tables: Record<string, Record<string, SqlValue>[]> = {};
        const present = new Set((await driver.query("SELECT name FROM sqlite_master WHERE type='table'")).map(row => String(row.name)));
        for (const table of tableNames) if (present.has(table)) {
          // Paged (ADR 0033) and without the reserved secret rows (ADR 0044).
          const where = table === 'app_settings' ? ` WHERE NOT ${SECRET_KEY_SQL}` : '';
          tables[table] = (await queryPages(driver, `SELECT rowid AS "__rowid", * FROM ${table}${where}`, [], ['__rowid'])).map(row => { delete row['__rowid']; return row; });
        }
        return { format: 'kairos-money', version: 1, schema_version: 3, database_schema_version: Number((await driver.query('SELECT MAX(version) AS version FROM _migrations'))[0]?.version ?? 0), exported_at: new Date().toISOString(), tables };
      });
    },
  };
}
export type Repository = ReturnType<typeof repository>;
export type Account = Awaited<ReturnType<Repository['accounts']>>[number];
