import type {Driver} from '../core/db/driver';
import {currency, money, toDatabase} from '../core/money';
import {dayNumber, hash, isoDay} from '../ingest/normalize';

export type NoticeRecord = {
  id: string; accountId: string; date: string; minor: string;
  merchant: string; description: string; source: string; capturedAt: string;
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
  await driver.execute("DELETE FROM transaction_sources WHERE import_batch_id IN (SELECT id FROM import_batches WHERE parser_version='notice-v1')");
  await driver.execute("DELETE FROM transactions WHERE import_batch_id IN (SELECT id FROM import_batches WHERE parser_version='notice-v1')");
  for (const entry of records) {
    const account = (await driver.query('SELECT currency FROM accounts WHERE id=?', [entry.accountId]))[0];
    if (!account) continue;                        // The account was removed; the approval is not a reason to resurrect it.
    const code = currency(String(account.currency));
    const value = money(BigInt(entry.minor), code);
    const settled = await driver.query(
      "SELECT t.posted_date FROM transactions t JOIN import_batches b ON b.id=t.import_batch_id WHERE b.parser_version NOT IN ('manual-entry-v1','notice-v1') AND t.status='settled' AND t.account_id=? AND t.amount_minor=?",
      [entry.accountId, toDatabase(value)]);
    if (settled.some(row => Math.abs(dayNumber(String(row.posted_date)) - dayNumber(entry.date)) <= 3)) continue;
    const id = hash('notice-transaction:' + entry.id);
    await driver.execute(
      'INSERT INTO transactions(id,account_id,posted_date,amount_minor,currency,raw_description,category_id,type,transfer_group_id,is_recurring,fingerprint,import_batch_id,confidence,user_verified,notes,status) VALUES(?,?,?,?,?,?,NULL,?,NULL,0,?,?,5000,1,?,?)',
      [id, entry.accountId, entry.date, toDatabase(value), code, entry.merchant,
       value.minor < 0n ? 'debit' : 'credit', id, batchId(entry.id), '', 'pending']);
    await driver.execute('INSERT INTO transaction_sources VALUES(?,?,?,?)',
      [id, batchId(entry.id), marker, JSON.stringify({
        ...entry, origin: 'notification', sourceId: marker, merchant: entry.merchant,
        fingerprint: hash('notice-fingerprint:' + entry.id), issues: [], reference: '',
        duplicateOf: null, occurrence: '', createRule: false, mcc: null,
        pending: true, verified: true, confidence: 5000,
      })]);
  }
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
  return {approve, remove, records: () => noticeRecords(driver), sync: () => syncNotices(driver)};
}
