import type {Driver} from '../core/db/driver';
import {currency, money, toDatabase, type Currency} from '../core/money';

/**
 * DEBTS, AS RECORDS RATHER THAN AS A CATEGORY NAME.
 *
 * The balance is held POSITIVE and means "owed", which is the opposite of how an account holds a credit
 * balance. That is deliberate and documented in migration 0005: every question asked of this table reads
 * naturally with a positive amount owed, and a sign that flips halfway through a projection is how
 * interest ends up subtracted.
 *
 * Nothing here writes a transaction. A debt is a standing fact the person tells the app; the ledger is
 * still only ever built from statements and from entries they recorded deliberately.
 */
export type DebtRecord = {
  id: string;
  name: string;
  /** The account it is held on, when there is one. Null is honest for money owed to a person. */
  accountId: string | null;
  currency: Currency;
  /** What is owed, positive, in minor units. */
  balanceMinor: string;
  /** Basis points: 1999 is 19.99%. */
  annualRateBp: string;
  minimumMinor: string;
  /** Day of the month a payment is due, or null when the lender sets none. */
  dueDay: number | null;
  openedAt: string;
  closedAt: string | null;
  /** The day the person wants it gone by, or null when no target is set. */
  targetDate: string | null;
};

export type DebtInput = Omit<DebtRecord, 'closedAt' | 'targetDate'> & {targetDate?: string | null};

/**
 * A ceiling on the rate, so a typo cannot turn into a projection.
 *
 * 1,000% a year is far above any lender and far below the number somebody gets by typing a rate into the
 * basis-points box. It is a guard against fat fingers, not a judgement about what is a fair rate.
 */
export const MAX_RATE_BP = 100000n;

function validDate(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
}

function validate(debt: DebtInput) {
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(debt.id)) throw new Error('Invalid debt identity.');
  const name = debt.name.trim();
  if (!name || name.length > 80) throw new Error('Give the debt a name between 1 and 80 characters.');
  const code = currency(debt.currency);
  for (const [field, value] of [['balance', debt.balanceMinor], ['minimum payment', debt.minimumMinor]] as const) {
    if (!/^\d+$/.test(value)) throw new Error(`Enter the ${field} as a whole amount that is not negative.`);
    money(BigInt(value), code);
  }
  if (!/^\d+$/.test(debt.annualRateBp) || BigInt(debt.annualRateBp) > MAX_RATE_BP) throw new Error('Enter the annual rate in basis points, up to 100000 (1000%).');
  if (debt.dueDay !== null && (!Number.isInteger(debt.dueDay) || debt.dueDay < 1 || debt.dueDay > 31)) throw new Error('Choose a due day between 1 and 31, or leave it blank.');
  if (!validDate(debt.openedAt)) throw new Error('Choose a valid date for when this debt started.');
  if (debt.accountId !== null && !/^[a-zA-Z0-9-]{1,80}$/.test(debt.accountId)) throw new Error('Choose a valid linked account.');
  const targetDate = debt.targetDate ?? null;
  if (targetDate !== null && !validDate(targetDate)) throw new Error('Choose a valid date to pay this off by, or leave it blank.');
  return {...debt, name, currency: code, targetDate};
}

function read(row: Record<string, unknown>): DebtRecord {
  return {
    id: String(row['id']), name: String(row['name']),
    accountId: row['account_id'] === null || row['account_id'] === undefined ? null : String(row['account_id']),
    currency: currency(String(row['currency'])),
    balanceMinor: String(row['balance_minor']), annualRateBp: String(row['annual_rate_bp']),
    minimumMinor: String(row['minimum_minor']),
    dueDay: row['due_day'] === null || row['due_day'] === undefined ? null : Number(row['due_day']),
    openedAt: String(row['opened_at']),
    closedAt: row['closed_at'] === null || row['closed_at'] === undefined ? null : String(row['closed_at']),
    targetDate: null,
  };
}
/**
 * THE TARGET LIVES BESIDE THE DEBT, in the encrypted settings, the way every later fact about a record
 * does here. A debt is a standing fact the lender would recognise; the day the person wants it gone is
 * their own, and it comes and goes without the debt changing.
 */
const targetKey = (id: string) => 'debt-target:' + id;

export function debtRepository(driver: Driver) {
  /** Open debts first, then cleared ones, each by name — what is still owed is what is being asked about. */
  async function list(): Promise<DebtRecord[]> {
    const targets = new Map((await driver.query("SELECT key,value FROM app_settings WHERE key LIKE 'debt-target:%'")).flatMap(r => {
      const value: unknown = JSON.parse(String(r['value']));
      return typeof value === 'string' && validDate(value) ? [[String(r['key']).slice('debt-target:'.length), value] as const] : [];
    }));
    return (await driver.query('SELECT * FROM debts ORDER BY closed_at IS NOT NULL, name, id')).map(read)
      .map(debt => ({...debt, targetDate: targets.get(debt.id) ?? null}));
  }
  async function writeTarget(id: string, target: string | null) {
    if (target) await driver.execute('INSERT OR REPLACE INTO app_settings(key,value) VALUES(?,?)', [targetKey(id), JSON.stringify(target)]);
    else await driver.execute('DELETE FROM app_settings WHERE key=?', [targetKey(id)]);
  }
  async function save(input: DebtInput) {
    const debt = validate(input);
    return driver.transaction(async () => {
      if (debt.accountId) {
        const account = (await driver.query('SELECT currency FROM accounts WHERE id=? AND archived_at IS NULL', [debt.accountId]))[0];
        if (!account) throw new Error('Choose an active account.');
        if (String(account['currency']) !== debt.currency) throw new Error('A debt and the account it is held on must be in the same currency.');
      }
      // Editing must not silently clear a debt that was already paid off, so closed_at is carried over
      // rather than written here; close() and reopen() are the only two things that move it.
      const existing = (await driver.query('SELECT closed_at FROM debts WHERE id=?', [debt.id]))[0];
      await driver.execute(
        'INSERT INTO debts(id,name,account_id,currency,balance_minor,annual_rate_bp,minimum_minor,due_day,opened_at,closed_at) VALUES(?,?,?,?,?,?,?,?,?,?) ' +
        'ON CONFLICT(id) DO UPDATE SET name=excluded.name, account_id=excluded.account_id, currency=excluded.currency, ' +
        'balance_minor=excluded.balance_minor, annual_rate_bp=excluded.annual_rate_bp, minimum_minor=excluded.minimum_minor, ' +
        'due_day=excluded.due_day, opened_at=excluded.opened_at',
        [debt.id, debt.name, debt.accountId, debt.currency,
          toDatabase(money(BigInt(debt.balanceMinor), debt.currency)), Number(debt.annualRateBp),
          toDatabase(money(BigInt(debt.minimumMinor), debt.currency)), debt.dueDay,
          debt.openedAt, existing ? (existing['closed_at'] === null || existing['closed_at'] === undefined ? null : String(existing['closed_at'])) : null]);
      await writeTarget(debt.id, debt.targetDate);
    });
  }
  /** Cleared, not deleted: what a debt cost is part of the record. */
  async function close(id: string, on: string) {
    if (!validDate(on)) throw new Error('Choose a valid date for when this debt was cleared.');
    return driver.transaction(async () => {
      const existing = (await driver.query('SELECT opened_at FROM debts WHERE id=?', [id]))[0];
      if (!existing) throw new Error('That debt no longer exists.');
      if (on < String(existing['opened_at'])) throw new Error('A debt cannot be cleared before it started.');
      await driver.execute('UPDATE debts SET closed_at=?, balance_minor=0 WHERE id=?', [on, id]);
      // Cleared is cleared: a target for a debt that is gone would only ever say "done".
      await writeTarget(id, null);
    });
  }
  async function reopen(id: string) { await driver.execute('UPDATE debts SET closed_at=NULL WHERE id=?', [id]); }
  /** For a debt that was never real — a typo, a duplicate. Clearing one is close(), not this. */
  async function remove(id: string) { await driver.transaction(async () => { await driver.execute('DELETE FROM debts WHERE id=?', [id]); await writeTarget(id, null); }); }
  return {list, save, close, reopen, remove};
}
