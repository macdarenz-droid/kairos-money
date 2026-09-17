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
};

export type DebtInput = Omit<DebtRecord, 'closedAt'>;

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
  return {...debt, name, currency: code};
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
  };
}

export function debtRepository(driver: Driver) {
  /** Open debts first, then cleared ones, each by name — what is still owed is what is being asked about. */
  async function list(): Promise<DebtRecord[]> {
    return (await driver.query('SELECT * FROM debts ORDER BY closed_at IS NOT NULL, name, id')).map(read);
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
    });
  }
  async function reopen(id: string) { await driver.execute('UPDATE debts SET closed_at=NULL WHERE id=?', [id]); }
  /** For a debt that was never real — a typo, a duplicate. Clearing one is close(), not this. */
  async function remove(id: string) { await driver.execute('DELETE FROM debts WHERE id=?', [id]); }
  return {list, save, close, reopen, remove};
}
