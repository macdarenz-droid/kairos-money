import type {Driver} from '../core/db/driver';
import {currency, money, toDatabase, type Currency} from '../core/money';
import {convert, rateBetween, type Rate} from '../core/fx';

/**
 * MONEY BETWEEN PEOPLE.
 *
 * Not a debt, and the difference matters. A lender has a rate, a minimum and a due day; the two thousand
 * a friend covered at dinner has none of those. It had nowhere to live, so it was recorded as an ordinary
 * expense — which makes money you will get back look spent — or not recorded at all.
 *
 * DIRECTION IS A FIELD, NOT A SIGN. The amount is always positive and `direction` says who is holding it.
 * A signed amount is shorter and every read of it has to remember which way positive points; the one
 * place that forgets turns money you are owed into money you owe.
 *
 * Nothing here writes a transaction. Whether cash handed to a friend is also an expense is a judgement
 * the app does not get to make.
 */
export type Direction = 'owed_to_me' | 'owed_by_me';

export type Iou = {
  id: string;
  person: string;
  direction: Direction;
  currency: Currency;
  /** Always positive; `direction` carries which way it goes. */
  amountMinor: string;
  reason: string;
  occurredOn: string;
  transactionId: string | null;
  settledAt: string | null;
};

export type IouInput = Omit<Iou, 'settledAt'>;

/** What one person and you come to, netted — which is the only figure either of you would state aloud. */
export type PersonNet = {
  person: string;
  currency: Currency;
  /** Positive when they owe you, negative when you owe them, zero when it cancels out. */
  netMinor: string;
  owedToMeMinor: string;
  owedByMeMinor: string;
  /** The unsettled entries behind the figure, newest first, so any total can be opened and checked. */
  items: Iou[];
};

function validDate(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
}

function validate(iou: IouInput) {
  if (!/^[a-zA-Z0-9-]{1,80}$/.test(iou.id)) throw new Error('Invalid entry identity.');
  const person = iou.person.trim(), reason = iou.reason.trim();
  if (!person || person.length > 80) throw new Error('Name the person, in up to 80 characters.');
  if (!reason || reason.length > 200) throw new Error('Say what it was for, in up to 200 characters.');
  if (iou.direction !== 'owed_to_me' && iou.direction !== 'owed_by_me') throw new Error('Choose whether they owe you or you owe them.');
  const code = currency(iou.currency);
  if (!/^\d+$/.test(iou.amountMinor) || BigInt(iou.amountMinor) <= 0n) throw new Error('Enter an amount greater than zero.');
  money(BigInt(iou.amountMinor), code);
  if (!validDate(iou.occurredOn)) throw new Error('Choose a valid date.');
  if (iou.transactionId !== null && !/^[a-zA-Z0-9-]{1,120}$/.test(iou.transactionId)) throw new Error('Choose a valid linked transaction.');
  return {...iou, person, reason, currency: code};
}

/**
 * Everyone you are square with disappears from this.
 *
 * Netting per person is what makes the list short enough to read: four dinners and two taxis between the
 * same two people is ONE number, and it is the number either of you would say out loud. The entries are
 * kept underneath so the number can be opened, never replaced by it.
 *
 * SETTLED ENTRIES ARE EXCLUDED from the net and from the items, but not deleted from the table — "did I
 * ever pay that back" is a real question and a deleted row answers it with silence.
 *
 * A person whose entries cancel out exactly is dropped: nought owed in either direction is not a fact
 * that needs a row, and a list that keeps them is a list of people you have finished with.
 */
/**
 * MONEY BETWEEN PEOPLE IS MONEY, so it follows the displayed currency like everything else.
 *
 * This dropped any entry not already in the displayed currency, under a heading that says "Net, PHP".
 * Lend a friend fifty Australian dollars, switch the app to pesos, and the debt disappears — not marked,
 * not converted, gone. Measured before it was touched: one row shown in AUD, nought shown in PHP.
 *
 * Each entry converts at the rate for THE DAY IT HAPPENED, like every other amount in the app. The NET
 * converts; the entries underneath stay exactly as they were recorded, because the detail is kept so the
 * number can be opened rather than replaced by it — and "I lent him fifty dollars" is what happened,
 * whatever it is worth today.
 *
 * An entry in a currency no rate reaches is left out and named by `unreachableCurrencies`, never counted
 * as nought. A debt quietly worth zero is the worst of the three possible answers.
 */
/** One entry in the displayed currency at the rate for its own day, or null when no rate reaches it. */
function shown(iou: Iou, code: Currency, rates: readonly Rate[]): bigint | null {
  const rate = rateBetween(rates, iou.currency, code, iou.occurredOn);
  return rate === null ? null : convert(money(BigInt(iou.amountMinor), iou.currency), code, rate).minor;
}

/** The currencies held between people that no stored rate reaches, so a screen can name them. */
export function unreachableCurrencies(ious: readonly Iou[], code: Currency, rates: readonly Rate[] = []): Currency[] {
  const missing = new Set<Currency>();
  for (const iou of ious) if (iou.settledAt === null && shown(iou, code, rates) === null) missing.add(iou.currency);
  return [...missing].sort();
}

export function netByPerson(ious: readonly Iou[], code: Currency, rates: readonly Rate[] = []): PersonNet[] {
  const people = new Map<string, Iou[]>();
  for (const iou of ious) {
    if (iou.settledAt !== null || shown(iou, code, rates) === null) continue;
    people.set(iou.person, [...(people.get(iou.person) ?? []), iou]);
  }
  const out: PersonNet[] = [];
  for (const [person, items] of people) {
    const total = (direction: Direction) => items.filter(i => i.direction === direction)
      .reduce((sum, i) => sum + shown(i, code, rates)!, 0n);
    const toMe = total('owed_to_me'), byMe = total('owed_by_me');
    const net = toMe - byMe;
    if (net === 0n) continue;
    out.push({person, currency: code, netMinor: net.toString(),
      owedToMeMinor: toMe.toString(), owedByMeMinor: byMe.toString(),
      items: [...items].sort((a, b) => b.occurredOn.localeCompare(a.occurredOn) || a.id.localeCompare(b.id))});
  }
  // Largest first whichever way it goes, then by name — the biggest outstanding amount is the one worth
  // doing something about, and ties settle the same way on every opening.
  return out.sort((a, b) => {
    const x = BigInt(a.netMinor) < 0n ? -BigInt(a.netMinor) : BigInt(a.netMinor);
    const y = BigInt(b.netMinor) < 0n ? -BigInt(b.netMinor) : BigInt(b.netMinor);
    return y > x ? 1 : y < x ? -1 : a.person.localeCompare(b.person);
  });
}

function read(row: Record<string, unknown>): Iou {
  return {
    id: String(row['id']), person: String(row['person']),
    direction: String(row['direction']) === 'owed_by_me' ? 'owed_by_me' : 'owed_to_me',
    currency: currency(String(row['currency'])), amountMinor: String(row['amount_minor']),
    reason: String(row['reason']), occurredOn: String(row['occurred_on']),
    transactionId: row['transaction_id'] === null || row['transaction_id'] === undefined ? null : String(row['transaction_id']),
    settledAt: row['settled_at'] === null || row['settled_at'] === undefined ? null : String(row['settled_at']),
  };
}

export function peopleRepository(driver: Driver) {
  async function list(): Promise<Iou[]> {
    return (await driver.query('SELECT * FROM ious ORDER BY settled_at IS NOT NULL, occurred_on DESC, id')).map(read);
  }
  async function save(input: IouInput) {
    const iou = validate(input);
    return driver.transaction(async () => {
      if (iou.transactionId) {
        const row = (await driver.query('SELECT currency FROM transactions WHERE id=?', [iou.transactionId]))[0];
        if (!row) throw new Error('That transaction no longer exists.');
        if (String(row['currency']) !== iou.currency) throw new Error('An entry and the transaction it points at must be in the same currency.');
      }
      // Settling is its own decision, so editing never resurrects a squared-up entry or quietly closes one.
      const existing = (await driver.query('SELECT settled_at FROM ious WHERE id=?', [iou.id]))[0];
      const settled = existing && existing['settled_at'] !== null && existing['settled_at'] !== undefined ? String(existing['settled_at']) : null;
      await driver.execute(
        'INSERT INTO ious(id,person,direction,currency,amount_minor,reason,occurred_on,transaction_id,settled_at) VALUES(?,?,?,?,?,?,?,?,?) ' +
        'ON CONFLICT(id) DO UPDATE SET person=excluded.person, direction=excluded.direction, currency=excluded.currency, ' +
        'amount_minor=excluded.amount_minor, reason=excluded.reason, occurred_on=excluded.occurred_on, transaction_id=excluded.transaction_id',
        [iou.id, iou.person, iou.direction, iou.currency, toDatabase(money(BigInt(iou.amountMinor), iou.currency)),
          iou.reason, iou.occurredOn, iou.transactionId, settled]);
    });
  }
  /** Squares up every open entry with one person at once, which is how people actually settle. */
  async function settle(person: string, on: string) {
    if (!validDate(on)) throw new Error('Choose a valid date.');
    await driver.execute('UPDATE ious SET settled_at=? WHERE person=? AND settled_at IS NULL', [on, person]);
  }
  async function settleOne(id: string, on: string) {
    if (!validDate(on)) throw new Error('Choose a valid date.');
    await driver.execute('UPDATE ious SET settled_at=? WHERE id=?', [on, id]);
  }
  async function reopen(id: string) { await driver.execute('UPDATE ious SET settled_at=NULL WHERE id=?', [id]); }
  async function remove(id: string) { await driver.execute('DELETE FROM ious WHERE id=?', [id]); }
  return {list, save, settle, settleOne, reopen, remove};
}
