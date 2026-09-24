import {expect, it} from 'vitest';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository} from '../src/core/db/repository';
import {noticeRepository, syncNotices, type NoticeRecord} from '../src/ledger/notices';
import {hash, normalizeRow} from '../src/ingest/normalize';
import {applyShadeDecisions} from '../src/ui/notices';
import {forgetNotices} from '../src/ingest/notices';
import {moneyBand} from '../src/intelligence/visuals/band';
import {localDay} from '../src/ingest/reminders';
import type {Document, ImportContext} from '../src/ingest/types';

const context: ImportContext = {accountId:'a',accountKind:'checking',currency:'AUD',period:{start:'2026-02-01',end:'2026-02-28'},dateOrder:'DMY',decimal:'.',creditPositivePurchases:false};
const notice = (over: Partial<NoticeRecord> = {}): NoticeRecord => ({
  id:'notice-1', accountId:'a', date:'2026-02-10', minor:'-1250', merchant:'WOOLWORTHS 1234',
  description:'You spent $12.50 at WOOLWORTHS 1234.', source:'app.synthetic.bank', capturedAt:'2026-02-10T04:15:00Z', ...over});

async function ready() {
 const {driver} = memoryDriver(); await migrate(driver); const repo = repository(driver);
 await repo.addAccount({id:'a',name:'Synthetic',institution:'Westpac',type:'checking',currency:'AUD',mask_last4:null,opening_balance_minor:0n});
 return {driver, repo, notices: noticeRepository(driver)};
}
const rows = (driver: Parameters<typeof syncNotices>[0]) =>
 driver.query('SELECT posted_date,amount_minor,status,raw_description,user_verified FROM transactions ORDER BY posted_date');

/** A statement covering the same purchase, imported the normal way. */
async function importStatement(repo: Awaited<ReturnType<typeof ready>>['repo'], amount: string, date: string) {
 const sourceHash = hash('statement:' + amount + date);
 const doc: Document = {id:hash(JSON.stringify(['a',sourceHash])),hash:sourceHash,fileName:'s.pdf',parser:'westpac-choice-v1',context,
  opening:'10000',closing:String(10000 - Math.round(Number(amount) * 100)),payslip:null,sourceRank:2,sourceKind:'statement',integrityTier:'A',
  rows:[normalizeRow({sourceId:'0',date,description:'WOOLWORTHS 1234 SYDNEY',amount,direction:'debit',runningBalance:((10000 - Math.round(Number(amount) * 100)) / 100).toFixed(2),confidence:9800},context)]};
 await repo.imports.stage(doc); await repo.imports.useSuggestedCategories(doc.id); await repo.imports.commit(doc.id);
}

it('records an approved notification as pending, never as settled history', async () => {
 // A card notification is an authorisation: the amount can still move and it can be reversed. Pending
 // keeps it out of the historical signals, exactly as pending statement rows are kept out.
 const {driver, notices} = await ready();
 await notices.approve(notice());
 const written = await rows(driver);
 expect(written).toHaveLength(1);
 expect(written[0]!.status).toBe('pending');
 expect(written[0]!.amount_minor).toBe(-1250);
 expect(written[0]!.raw_description).toBe('WOOLWORTHS 1234');
});

it('steps aside when the statement arrives carrying the same purchase', async () => {
 const {driver, repo, notices} = await ready();
 await notices.approve(notice());
 expect(await rows(driver)).toHaveLength(1);
 await importStatement(repo, '12.50', '11/02/26');   // one day after the notification
 const written = await rows(driver);
 // One purchase, not two: the imported row is the better evidence and the notification's copy is dropped.
 expect(written).toHaveLength(1);
 expect(written[0]!.status).toBe('settled');
});

it('comes back if that statement import is rolled back', async () => {
 // The approval is kept, not consumed, so undoing an import does not quietly lose the purchase.
 const {driver, repo, notices} = await ready();
 await notices.approve(notice());
 await importStatement(repo, '12.50', '11/02/26');
 expect(await rows(driver)).toHaveLength(1);
 const [batch] = (await repo.imports.summaries()).filter(b => b.fileName === 's.pdf');
 await repo.imports.rollback(batch!.id);
 const written = await rows(driver);
 expect(written).toHaveLength(1);
 expect(written[0]!.status).toBe('pending');
});

it('keeps its own row when the statement shows a different amount', async () => {
 // Tips, fuel holds and foreign conversion all move the figure between authorisation and settlement.
 // A different amount is a different fact, so nothing is silently merged.
 const {driver, repo, notices} = await ready();
 await notices.approve(notice());
 await importStatement(repo, '18.00', '11/02/26');
 expect(await rows(driver)).toHaveLength(2);
});

it('keeps its own row when the statement entry is weeks away', async () => {
 const {driver, repo, notices} = await ready();
 await notices.approve(notice());
 await importStatement(repo, '12.50', '25/02/26');
 expect(await rows(driver)).toHaveLength(2);
});

it('records one row when the same notification is approved twice', async () => {
 const {driver, notices} = await ready();
 await notices.approve(notice());
 await notices.approve(notice());
 expect(await rows(driver)).toHaveLength(1);
 expect(await notices.records()).toHaveLength(1);
});

it('refuses a notification with no amount, and one for an account that is gone', async () => {
 const {notices} = await ready();
 await expect(notices.approve(notice({minor:'0'}))).rejects.toThrow('no amount');
 await expect(notices.approve(notice({accountId:'missing'}))).rejects.toThrow('active account');
});

it('forgets a notification entirely when it is removed', async () => {
 const {driver, notices} = await ready();
 await notices.approve(notice());
 await notices.remove('notice-1');
 expect(await rows(driver)).toHaveLength(0);
 expect(await notices.records()).toHaveLength(0);
});

it('keeps the notification text as the row’s provenance', async () => {
 const {driver, notices} = await ready();
 await notices.approve(notice());
 const [source] = await driver.query('SELECT original_payload FROM transaction_sources');
 const payload = JSON.parse(String(source!.original_payload));
 expect(payload.description).toBe('You spent $12.50 at WOOLWORTHS 1234.');
 expect(payload.origin).toBe('notification');
 expect(payload.source).toBe('app.synthetic.bank');
});

it('shows an approved notification in the ledger a person actually reads', async () => {
 // It was written to the database and then filtered out of every list that displays it, because the
 // ledger's scope only admitted batches holding a staged statement document. The money appeared nowhere
 // but the calendar, which reads the transactions table directly.
 const {repo, notices} = await ready();
 await notices.approve(notice());
 const page = await repo.imports.ledgerPage('', 0, 50);
 expect(page.total).toBe(1);
 expect(page.rows[0]!.merchant).toBe('WOOLWORTHS 1234');
 expect(page.rows[0]!.status).toBe('pending');
 // And it is findable by name, like any other row.
 expect((await repo.imports.ledgerPage('WOOLWORTHS', 0, 50)).total).toBe(1);
});

it('keeps the whole ledger readable when a notification is stored beside statements', async () => {
 // Provenance is validated strictly: a payload the reader cannot parse makes it refuse the entire ledger
 // rather than one row. A notice must therefore be stored in the shape the reader expects.
 const {repo, notices} = await ready();
 await importStatement(repo, '12.50', '25/02/26');
 await notices.approve(notice({id: 'notice-2', date: '2026-02-10', minor: '-9900', merchant: 'SYNTHETIC LATE'}));
 const page = await repo.imports.ledgerPage('', 0, 50);
 expect(page.total).toBe(2);
 expect(await repo.imports.ledger()).toHaveLength(2);
});

it('counts an approved notification on today, without calling it confirmed', async () => {
 // It was absent from the day's spending entirely: today's totals only counted settled rows, and an
 // approved notification is pending until a statement confirms it. Counting it as settled would overstate
 // the day; leaving it out meant the owner saw nothing where he had just approved money.
 const {repo, notices} = await ready();
 await notices.approve(notice({date: '2026-02-10', minor: '-1250'}));
 await notices.approve(notice({id: 'notice-in', date: '2026-02-10', minor: '500'}));
 const [totals] = await repo.manual.today('2026-02-10');
 expect(totals).toMatchObject({currency: 'AUD', spending: '0', income: '0',
   awaitingSpending: '1250', awaitingIncome: '500'});
});

it('counts what no statement has confirmed, for the home screen to say so honestly', async () => {
 // "Kairos only knows about money up to the last statement you imported" stopped being true the moment a
 // notification was approved, and a home screen that says something false about its own knowledge is
 // worse than one that says nothing.
 const {repo, notices} = await ready();
 expect(await repo.notices.awaiting()).toBe(0);
 await notices.approve(notice());
 expect(await repo.notices.awaiting()).toBe(1);
 // Once the statement confirms it, there is nothing outstanding to warn about.
 await importStatement(repo, '12.50', '11/02/26');
 expect(await repo.notices.awaiting()).toBe(0);
});

it('records a transfer between the owner\'s own accounts as one movement, not as spending', async () => {
 const {driver, repo, notices} = await ready();
 await repo.addAccount({id:'b',name:'Trial',institution:'CommBank',type:'savings',currency:'AUD',mask_last4:'3318',opening_balance_minor:0n});

 // The pair the owner actually saw: $3 leaving one bank and arriving at the other.
 await notices.approve(notice({id:'transfer-1', accountId:'a', destinationId:'b', minor:'-300',
   merchant:'Transfer to Trial', description:"WITHDRAWAL-OSKO PAYMENT · You've been paid $3.00"}));

 const written = await driver.query('SELECT account_id,amount_minor,transfer_group_id FROM transactions ORDER BY amount_minor');
 expect(written).toHaveLength(2);
 // Two legs: out of one account and into the other, for the same amount.
 expect(written.map(r => [String(r.account_id), String(r.amount_minor)])).toEqual([['a','-300'],['b','300']]);
 // One group across both. This is the flag the rest of the app reads to know money moved rather than left.
 const groups = new Set(written.map(r => String(r.transfer_group_id)));
 expect(groups.size).toBe(1);
 expect([...groups][0]).not.toBe('null');
});

it('refuses a transfer that is not two real accounts of the same currency', async () => {
 const {repo, notices} = await ready();
 await repo.addAccount({id:'usd',name:'Dollars',institution:'X',type:'checking',currency:'USD',mask_last4:null,opening_balance_minor:0n});
 await expect(notices.approve(notice({id:'t-same', accountId:'a', destinationId:'a', minor:'-300'})))
   .rejects.toThrow(/two different accounts/i);
 await expect(notices.approve(notice({id:'t-gone', accountId:'a', destinationId:'missing', minor:'-300'})))
   .rejects.toThrow(/other side/i);
 await expect(notices.approve(notice({id:'t-fx', accountId:'a', destinationId:'usd', minor:'-300'})))
   .rejects.toThrow(/same currency/i);
});

it('leaves an ordinary notification as the single row it has always been', async () => {
 const {driver, notices} = await ready();
 await notices.approve(notice());
 const written = await driver.query('SELECT account_id,amount_minor,transfer_group_id FROM transactions');
 expect(written).toHaveLength(1);
 expect(written[0]!.transfer_group_id).toBeNull();
});

it('an account balance is what it holds now, not what it opened with', async () => {
 const {driver, repo, notices} = await ready();
 // Exactly the owner's setup: one account opened at $1,000.
 await driver.execute("UPDATE accounts SET opening_balance_minor=100000 WHERE id='a'");

 expect((await repo.accountBalances()).find(b => b.accountId === 'a')?.minor).toBe('100000');

 // A purchase he recorded by hand. Settled, nothing to do with notifications.
 await repo.manual.save({id:'m1', kind:'expense', accountId:'a', destinationId:null, date:'2026-02-10',
   minor:'5000', description:'G', category:null, notes:''});
 expect((await repo.accountBalances()).find(b => b.accountId === 'a')?.minor).toBe('95000');

 // A bank notification he approved. It counts too — waiting for a statement would leave the balance
 // weeks stale, and banks do not publish statements in real time.
 await notices.approve(notice({id:'n1', accountId:'a', minor:'-1250'}));
 expect((await repo.accountBalances()).find(b => b.accountId === 'a')?.minor).toBe('93750');
});

it('money received and approved in the shade reaches the balance, today, and the money band', async () => {
 // "i just received money from someone. the app read it and clicked approved. but didnt reflect on my
 // balance, no money in. no additional balance everywhere." His setup: a dollar bank account that sorts
 // first by name, a peso wallet, and a peso receipt approved in the notification shade.
 const {repo} = await ready();
 await repo.addAccount({id:'w',name:'Wallet',institution:'Synthetic',type:'cash',currency:'PHP',mask_last4:null,opening_balance_minor:100000n});
 const accounts = await repo.accounts();
 expect(accounts[0]!.currency).toBe('AUD');                     // Synthetic sorts before Wallet.
 const postedAt = Date.now();
 const result = await applyShadeDecisions([{id:'notice:in', source:'app.synthetic.wallet', title:'Synthetic Wallet', postedAt, decision:'approved',
   text:'You have received PHP 500.00 from JUAN D. Your new balance is PHP 1,500.00. Ref. No. 1234567890.'}],
   accounts, null, record => repo.notices.approve(record), forgetNotices);
 expect(result).toEqual({approved:1, rejected:0, unrecorded:0});

 // Balance now: the wallet holds ₱1,500, and the bank account is untouched.
 const balances = await repo.accountBalances();
 expect(balances.find(b => b.accountId === 'w')?.minor).toBe('150000');
 expect(balances.find(b => b.accountId === 'a')?.minor).toBe('0');
 // Recorded today, on the phone's own day.
 const today = localDay(new Date(postedAt));
 expect((await repo.manual.today(today)).find(t => t.currency === 'PHP')).toMatchObject({awaitingIncome:'50000', income:'0'});
 // Money in, on the home screen's band, marked as not yet on a statement.
 const {snapshot} = await repo.intelligence.analyse(today, 'PHP');
 const band = moneyBand(snapshot, today);
 expect(band.now.inMinor).toBe('50000');
 expect(band.now.unconfirmed).toBe(true);
});
