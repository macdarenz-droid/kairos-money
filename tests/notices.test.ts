import {expect, it} from 'vitest';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository} from '../src/core/db/repository';
import {noticeRepository, syncNotices, type NoticeRecord} from '../src/ledger/notices';
import {hash, normalizeRow} from '../src/ingest/normalize';
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
