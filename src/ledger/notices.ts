import type {Driver} from '../core/db/driver';
import {currency, money, toDatabase} from '../core/money';
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
  const records = await noticeRecords(driver);
  // What the owner added to a notice row is kept across the rewrite below.
  const kept = new Map((await driver.query("SELECT t.id,t.category_id,t.notes FROM transactions t JOIN import_batches b ON b.id=t.import_batch_id WHERE b.parser_version='notice-v1'"))
    .map(row => [String(row.id), {category: row.category_id ?? null, notes: String(row.notes ?? '')}]));
  // Each settled statement row stands for one notice at most.
  const claimed = new Set<string>();
  await driver.execute("DELETE FROM transaction_sources WHERE import_batch_id IN (SELECT id FROM import_batches WHERE parser_version='notice-v1')");
  await driver.execute("DELETE FROM transactions WHERE import_batch_id IN (SELECT id FROM import_batches WHERE parser_version='notice-v1')");
  for (const entry of records) {
    // A transfer is two legs sharing one group: out of the account the money left, into the one it
    // reached. Everything else is a single leg. The group id is what makes the rest of the app read this
    // as moving money rather than spending it, so it is never left null on a transfer.
    const group = entry.destinationId ? hash('notice-transfer:' + entry.id) : null;
    const legs = entry.destinationId
      ? [{key: 'from', accountId: entry.accountId, minor: -absolute(entry.minor)},
         {key: 'to', accountId: entry.destinationId, minor: absolute(entry.minor)}]
      : [{key: 'entry', accountId: entry.accountId, minor: BigInt(entry.minor)}];

    for (const leg of legs) {
      const account = (await driver.query('SELECT currency FROM accounts WHERE id=?', [leg.accountId]))[0];
      if (!account) continue;                      // The account was removed; the approval is not a reason to resurrect it.
      const code = currency(String(account.currency));
      const value = money(leg.minor, code);
      const settled = await driver.query(
        "SELECT t.id,t.posted_date FROM transactions t JOIN import_batches b ON b.id=t.import_batch_id WHERE b.parser_version NOT IN ('manual-entry-v1','notice-v1') AND t.status='settled' AND t.account_id=? AND t.amount_minor=? ORDER BY t.posted_date,t.id",
        [leg.accountId, toDatabase(value)]);
      const gap = (row: typeof settled[number]) => Math.abs(dayNumber(String(row.posted_date)) - dayNumber(entry.date));
      const match = settled.filter(row => !claimed.has(String(row.id)) && gap(row) <= 3).sort((x, y) => gap(x) - gap(y))[0];
      if (match) { claimed.add(String(match.id)); continue; }
      // A single notice keeps the id it has always had, so nothing already pointing at one is orphaned by
      // this change; only the two legs of a transfer need ids of their own.
      const id = leg.key === 'entry' ? hash('notice-transaction:' + entry.id) : hash(`notice-transaction:${leg.key}:` + entry.id);
      const prior = kept.get(id);
      await driver.execute(
        'INSERT INTO transactions(id,account_id,posted_date,amount_minor,currency,raw_description,category_id,type,transfer_group_id,is_recurring,fingerprint,import_batch_id,confidence,user_verified,notes,status) VALUES(?,?,?,?,?,?,?,?,?,0,?,?,5000,1,?,?)',
        [id, leg.accountId, entry.date, toDatabase(value), code, entry.merchant, group ? null : prior?.category ?? null,
         value.minor < 0n ? 'debit' : 'credit', group, id, batchId(entry.id), prior?.notes ?? '', 'pending']);
      await driver.execute('INSERT INTO transaction_sources VALUES(?,?,?,?)',
        [id, batchId(entry.id), marker, JSON.stringify({
          ...entry, origin: 'notification', sourceId: marker, merchant: entry.merchant,
          fingerprint: leg.key === 'entry' ? hash('notice-fingerprint:' + entry.id) : hash(`notice-fingerprint:${leg.key}:` + entry.id),
          issues: [], reference: '',
          duplicateOf: null, occurrence: '', createRule: false, mcc: null,
          pending: true, verified: true, confidence: 5000,
        })]);
    }
  }
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
