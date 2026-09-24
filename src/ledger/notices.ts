import type {Driver} from '../core/db/driver';
import {currency, money, toDatabase, type Currency, type Money} from '../core/money';
import {applyCategoryEdits} from './categories';
import {dayNumber, hash, isoDay} from '../ingest/normalize';

export type NoticeRecord = {
  id: string; accountId: string; date: string; minor: string;
  merchant: string; description: string; source: string; capturedAt: string;
  /**
   * Set only when two notifications were one transfer between the owner's own accounts. The money leaves
   * `accountId` and arrives here, and both legs carry one transfer group so the app counts it as moving
   * money rather than as spending it. Absent on every ordinary purchase, and absent on rows approved
   * before this existed, which is why it is optional rather than nullable-required.
   */
  destinationId?: string | null;
};

const marker = '__notice__';
const batchId = (id: string) => hash('notice-entry:' + id);

export async function noticeRecords(driver: Driver): Promise<NoticeRecord[]> {
  return (await driver.query(
    "SELECT s.payload FROM staging_rows s JOIN import_batches b ON b.id=s.import_batch_id WHERE s.source_row_id=? AND b.parser_version='notice-v1' AND b.status='committed' ORDER BY b.id",
    [marker])).map(r => JSON.parse(String(r.payload)) as NoticeRecord);
}

/**
 * Writes the approved notifications that the statement has not already accounted for.
 *
 * A bank's push notification is an authorisation, not a settled transaction, so every row written here is
 * pending — which keeps it out of the historical signals, exactly as pending statement rows are. When the
 * real statement arrives carrying the same purchase, the imported row is the better evidence and this one
 * must not sit beside it as a second copy. Same account, same exact amount, within three days of the day
 * the phone showed the notice: the statement wins and nothing is written. The approval is kept either way,
 * so the row reappears if that import is ever rolled back.
 */
export async function syncNotices(driver: Driver): Promise<void> {
  // Date order lets each notice pair with the statement rows around its own day (see claims below).
  const records = (await noticeRecords(driver)).sort((x, y) => x.date === y.date ? (x.id < y.id ? -1 : 1) : x.date < y.date ? -1 : 1);
  // What the owner added to a notice row is kept across the rewrite below.
  const kept = new Map((await driver.query("SELECT t.id,t.category_id,t.notes FROM transactions t JOIN import_batches b ON b.id=t.import_batch_id WHERE b.parser_version='notice-v1'"))
    .map(row => [String(row.id), {category: row.category_id ?? null, notes: String(row.notes ?? '')}]));
  await driver.execute("DELETE FROM transaction_sources WHERE import_batch_id IN (SELECT id FROM import_batches WHERE parser_version='notice-v1')");
  await driver.execute("DELETE FROM transactions WHERE import_batch_id IN (SELECT id FROM import_batches WHERE parser_version='notice-v1')");
  const legs: Leg[] = [];
  for (const entry of records) {
    // A transfer is two legs sharing one group: out of the account the money left, into the one it
    // reached. Everything else is a single leg. The group id is what makes the rest of the app read this
    // as moving money rather than spending it, so it is never left null on a transfer.
    const group = entry.destinationId ? hash('notice-transfer:' + entry.id) : null;
    const parts = entry.destinationId
      ? [{key: 'from', accountId: entry.accountId, minor: -absolute(entry.minor)},
         {key: 'to', accountId: entry.destinationId, minor: absolute(entry.minor)}]
      : [{key: 'entry', accountId: entry.accountId, minor: BigInt(entry.minor)}];
    for (const leg of parts) {
      const account = (await driver.query('SELECT currency FROM accounts WHERE id=?', [leg.accountId]))[0];
      if (!account) continue;                      // The account was removed; the approval is not a reason to resurrect it.
      const code = currency(String(account.currency));
      // A single notice keeps the id it has always had, so nothing already pointing at one is orphaned by
      // this change; only the two legs of a transfer need ids of their own.
      const id = leg.key === 'entry' ? noticeTransactionId(entry.id) : hash(`notice-transaction:${leg.key}:` + entry.id);
      legs.push({id, key: leg.key, entry, group, accountId: leg.accountId, code, value: money(leg.minor, code)});
    }
  }
  const matched = await claims(driver, legs);
  let recategorised = false;
  for (const {id, key, entry, group, accountId, code, value} of legs) {
    const match = matched.get(id);
    if (match) { recategorised = await carry(driver, id, match) || recategorised; continue; }
    const prior = kept.get(id);
    await driver.execute(
      'INSERT INTO transactions(id,account_id,posted_date,amount_minor,currency,raw_description,category_id,type,transfer_group_id,is_recurring,fingerprint,import_batch_id,confidence,user_verified,notes,status) VALUES(?,?,?,?,?,?,?,?,?,0,?,?,5000,1,?,?)',
      [id, accountId, entry.date, toDatabase(value), code, entry.merchant, group ? null : prior?.category ?? null,
       value.minor < 0n ? 'debit' : 'credit', group, id, batchId(entry.id), prior?.notes ?? '', 'pending']);
    await driver.execute('INSERT INTO transaction_sources VALUES(?,?,?,?)',
      [id, batchId(entry.id), marker, JSON.stringify({
        ...entry, origin: 'notification', sourceId: marker, merchant: entry.merchant,
        fingerprint: key === 'entry' ? hash('notice-fingerprint:' + entry.id) : hash(`notice-fingerprint:${key}:` + entry.id),
        issues: [], reference: '',
        duplicateOf: null, occurrence: '', createRule: false, mcc: null,
        pending: true, verified: true, confidence: 5000,
      })]);
  }
  if (recategorised) await applyCategoryEdits(driver);
}

type Leg = {id: string; key: string; entry: NoticeRecord; group: string | null; accountId: string; code: Currency; value: Money};
const noticeTransactionId = (id: string) => hash('notice-transaction:' + id);
const legIds = (id: string) => [noticeTransactionId(id), ...['from', 'to'].map(key => hash(`notice-transaction:${key}:` + id))];

// Pairs notice legs with settled rows (same account, exact amount, within three days): most pairs first, so
// no notice stays pending beside its own row; then fewest days apart, so edits reach the closest row.
async function claims(driver: Driver, legs: Leg[]): Promise<Map<string, string>> {
  const groups = new Map<string, Leg[]>();
  for (const leg of legs) {
    const key = leg.accountId + ' ' + toDatabase(leg.value);
    groups.set(key, [...groups.get(key) ?? [], leg]);
  }
  const paired = new Map<string, string>();
  for (const group of groups.values()) {
    const rows = await driver.query(
      "SELECT t.id,t.posted_date FROM transactions t JOIN import_batches b ON b.id=t.import_batch_id WHERE b.parser_version NOT IN ('manual-entry-v1','notice-v1') AND t.status='settled' AND t.account_id=? AND t.amount_minor=? ORDER BY t.posted_date,t.id",
      [group[0]!.accountId, toDatabase(group[0]!.value)]);
    // best[i][k] pairs the first i legs with the first k rows; both are in date order, and pairs that
    // never cross are enough on a calendar. step: 0 leaves leg i out, 1 leaves row k out, 2 pairs them.
    const best = group.map(() => rows.map(() => ({count: 0, days: 0, step: 0})));
    const at = (i: number, k: number) => i < 0 || k < 0 ? {count: 0, days: 0, step: 0} : best[i]![k]!;
    const better = (x: {count: number; days: number}, y: {count: number; days: number}) => x.count !== y.count ? x.count > y.count : x.days < y.days;
    group.forEach((leg, i) => rows.forEach((row, k) => {
      let pick = {...at(i - 1, k), step: 0};
      if (better(at(i, k - 1), pick)) pick = {...at(i, k - 1), step: 1};
      const gap = Math.abs(dayNumber(String(row.posted_date)) - dayNumber(leg.entry.date));
      const pair = {count: at(i - 1, k - 1).count + 1, days: at(i - 1, k - 1).days + gap, step: 2};
      if (gap <= 3 && better(pair, pick)) pick = pair;
      best[i]![k] = pick;
    }));
    for (let i = group.length - 1, k = rows.length - 1; i >= 0 && k >= 0;) {
      const {step} = best[i]![k]!;
      if (step === 2) paired.set(group[i]!.id, String(rows[k]!.id));
      if (step !== 1) i -= 1;
      if (step !== 0) k -= 1;
    }
  }
  return paired;
}

/** Hands a notice's category, note and receipts to the settled row that replaces it, unless it has its own. */
async function carry(driver: Driver, from: string, to: string): Promise<boolean> {
  let recategorised = false;
  for (const prefix of ['category-edit:', 'ledger-detail:']) {
    const source = (await driver.query('SELECT value FROM app_settings WHERE key=?', [prefix + from]))[0];
    if (!source) continue;
    // A move, not a copy: a copy left under the notice would reapply if the notice ever returned.
    await driver.execute('DELETE FROM app_settings WHERE key=?', [prefix + from]);
    if ((await driver.query('SELECT key FROM app_settings WHERE key=?', [prefix + to])).length) continue;
    const value = prefix === 'category-edit:' ? JSON.stringify({...JSON.parse(String(source.value)) as object, id: to}) : String(source.value);
    await driver.execute('INSERT INTO app_settings(key,value) VALUES(?,?)', [prefix + to, value]);
    recategorised ||= prefix === 'category-edit:';
  }
  return recategorised;
}

const absolute = (minor: string) => BigInt(minor) < 0n ? -BigInt(minor) : BigInt(minor);

const DEFAULT_KEY = 'notice-default-account';

/**
 * The account money is assumed to move through unless something says otherwise.
 *
 * It began as a notification-only fallback, because most bank notifications name no account and every
 * capture was otherwise landing on whichever account happened to sort first — a coin toss, made silently,
 * on real money. It is the same question the rest of the app kept asking: which account is this person's
 * main one. So it is one setting now, not two that can disagree, used as the fallback for a notification
 * AND as the account a hand-entered transaction starts on.
 *
 * Anything more specific still wins: a notice that names its own account, or a different account picked
 * on the form.
 *
 * The stored key still reads "notice-default-account" because that is what is already saved on the
 * owner's phone, and renaming it would silently discard the choice he has already made.
 */
export async function defaultNoticeAccount(driver: Driver): Promise<string | null> {
  const row = (await driver.query('SELECT value FROM app_settings WHERE key=?', [DEFAULT_KEY]))[0];
  if (!row) return null;
  const saved = JSON.parse(String(row.value)) as {accountId?: unknown};
  if (typeof saved.accountId !== 'string') return null;
  // An account that has since been archived or deleted is not offered as a destination for money.
  const live = await driver.query('SELECT id FROM accounts WHERE id=? AND archived_at IS NULL', [saved.accountId]);
  return live.length ? saved.accountId : null;
}

export function noticeRepository(driver: Driver) {
  /** Records one notification the person agreed to. Rejected ones are never offered here. */
  async function approve(entry: NoticeRecord) {
    return driver.transaction(async () => {
      if (!/^[a-zA-Z0-9:_-]{1,120}$/.test(entry.id)) throw new Error('Invalid notification identity.');
      isoDay(entry.date);
      if (!/^-?\d+$/.test(entry.minor) || BigInt(entry.minor) === 0n) throw new Error('A notification with no amount cannot be recorded.');
      const merchant = entry.merchant.trim(), description = entry.description.trim();
      if (!merchant || merchant.length > 200 || description.length > 400) throw new Error('The notification text is too long to record.');
      const account = (await driver.query('SELECT currency FROM accounts WHERE id=? AND archived_at IS NULL', [entry.accountId]))[0];
      if (!account) throw new Error('Choose an active account for these notifications.');
      money(BigInt(entry.minor), currency(String(account.currency)));
      if (entry.destinationId) {
        // Both ends of a transfer have to be real, distinct and in the same currency, for the same reason
        // a manual transfer does: two legs in different currencies is not one movement of money.
        if (entry.destinationId === entry.accountId) throw new Error('A transfer needs two different accounts.');
        const destination = (await driver.query('SELECT currency FROM accounts WHERE id=? AND archived_at IS NULL', [entry.destinationId]))[0];
        if (!destination) throw new Error('Choose an active account for the other side of this transfer.');
        if (destination.currency !== account.currency) throw new Error('Both accounts in a transfer must use the same currency.');
      }
      const record: NoticeRecord = {...entry, merchant, description};
      const prior = (await noticeRecords(driver)).find(r => r.id === entry.id);
      if (prior) return prior;                     // Approving the same notice twice records it once.
      await driver.execute(
        "INSERT INTO import_batches(id,source_file_hash,file_name,parser_version,status,created_at,integrity_tier,source_rank) VALUES(?,?,?,'notice-v1','committed',?,'C',0)",
        [batchId(record.id), hash('notice-origin:' + record.id), 'Bank notification', new Date().toISOString()]);
      await driver.execute('INSERT INTO staging_rows(id,import_batch_id,source_row_id,payload,confidence,issues) VALUES(?,?,?,?,5000,?)',
        [hash(batchId(record.id) + marker), batchId(record.id), marker, JSON.stringify(record), '[]']);
      await syncNotices(driver);
      return record;
    });
  }
  async function remove(id: string) {
    return driver.transaction(async () => {
      const batch = batchId(id);
      for (const tx of legIds(id)) await driver.execute('DELETE FROM app_settings WHERE key IN (?,?,?)', ['split:' + tx, 'ledger-detail:' + tx, 'category-edit:' + tx]);
      await driver.execute('DELETE FROM transaction_sources WHERE import_batch_id=?', [batch]);
      await driver.execute('DELETE FROM transactions WHERE import_batch_id=?', [batch]);
      await driver.execute('DELETE FROM staging_rows WHERE import_batch_id=?', [batch]);
      await driver.execute("DELETE FROM import_batches WHERE id=? AND parser_version='notice-v1'", [batch]);
    });
  }
  /** Names the account a notification lands on when its own text does not identify one. */
  async function setDefaultAccount(accountId: string | null) {
    if (accountId === null) { await driver.execute('DELETE FROM app_settings WHERE key=?', [DEFAULT_KEY]); return; }
    const account = (await driver.query('SELECT id FROM accounts WHERE id=? AND archived_at IS NULL', [accountId]))[0];
    if (!account) throw new Error('Choose an active account.');
    await driver.execute('INSERT OR REPLACE INTO app_settings(key,value) VALUES(?,?)',
      [DEFAULT_KEY, JSON.stringify({accountId})]);
  }
  const defaultAccount = () => defaultNoticeAccount(driver);

  /** Approved notifications still waiting for a statement to confirm them. */
  async function awaiting() {
    const rows = await driver.query(
      "SELECT COUNT(*) AS count FROM transactions t JOIN import_batches b ON b.id=t.import_batch_id WHERE b.parser_version='notice-v1' AND t.status='pending'");
    return Number(rows[0]?.count ?? 0);
  }
  return {approve, remove, awaiting, defaultAccount, setDefaultAccount, records: () => noticeRecords(driver), sync: () => syncNotices(driver)};
}
