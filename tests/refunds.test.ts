import {expect,it} from 'vitest';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository} from '../src/core/db/repository';
import {refundFixture} from './refund-fixture';
import {spendingPatterns} from '../src/intelligence/visuals/spending-patterns';
it('links partial refunds exactly, excludes them from income, and keeps gross purchases and source data intact',async()=>{
 const {repo,purchase,thirty,seventy,eighty}=await refundFixture();const before=await repo.exportAll();await repo.refunds.save(thirty,purchase);await expect(repo.refunds.save(eighty,purchase)).rejects.toThrow('unrefunded');await repo.refunds.save(seventy,purchase);
 expect(await repo.refunds.read(purchase)).toMatchObject({total:'10000',remaining:'0'});for(const table of ['transactions','transaction_sources','coverage_ranges'])expect((await repo.exportAll()).tables[table]).toEqual(before.tables[table]);
 const s=await repo.intelligence.snapshot('2026-02-28','AUD');expect(s.transactions.find(t=>t.id===thirty)).toMatchObject({kind:'refund',refundOf:purchase,minor:'3000'});expect(s.transactions.find(t=>t.id===eighty)?.kind).toBe('income');
 const jan=spendingPatterns(s,'2026-01');expect(jan).toMatchObject({total:'10000',refunds:{minor:'10000',net:'0'}});expect(jan.refunds.ids).toHaveLength(2);expect(jan.merchants[0]?.count).toBe(1);expect(spendingPatterns(s,'2026-02').refunds.minor).toBe('0');
 const earlier=await repo.intelligence.snapshot('2026-01-31','AUD');expect(spendingPatterns(earlier).refunds.minor).toBe('0');
 await repo.refunds.remove(thirty);expect((await repo.intelligence.snapshot('2026-02-28','AUD')).transactions.find(t=>t.id===thirty)?.kind).toBe('income');expect((await repo.refunds.read(purchase)).remaining).toBe('3000');
});
it('retains refund links through encrypted-backup data and source rollback/reimport, with no phantom credits',async()=>{
 const {repo,doc,purchase,thirty}=await refundFixture();await repo.refunds.save(thirty,purchase);const fresh=memoryDriver();await migrate(fresh.driver);const restored=repository(fresh.driver);await restored.restoreBackup(await repo.exportAll());expect(await restored.refunds.read(thirty)).toEqual(await repo.refunds.read(thirty));
 await repo.imports.rollback(doc.id);expect(await repo.refunds.read(thirty)).toMatchObject({saved:true,link:null});expect((await repo.intelligence.snapshot('2026-02-28','AUD')).transactions).toHaveLength(0);await repo.imports.stage(doc);await repo.imports.commit(doc.id);expect((await repo.refunds.read(thirty)).link?.purchaseId).toBe(purchase);
});
it('invalidates changed, pending, transfer and unreadable links and rejects wrong direction or currency',async()=>{
 const {repo,driver,purchase,thirty}=await refundFixture();await expect(repo.refunds.save(purchase,thirty)).rejects.toThrow();await repo.refunds.save(thirty,purchase);
 for(const [sql,restore] of [["amount_minor=3100","amount_minor=3000"],["status='pending'","status='settled'"],["transfer_group_id='synthetic'","transfer_group_id=NULL"],["currency='USD'","currency='AUD'"],["posted_date='2026-01-01'","posted_date='2026-02-02'"]]){
  await driver.execute(`UPDATE transactions SET ${sql} WHERE id=?`,[thirty]);expect((await repo.refunds.read(thirty)).link).toBeNull();if(!sql!.startsWith('amount_minor'))await expect(repo.refunds.save(thirty,purchase)).rejects.toThrow();await driver.execute(`UPDATE transactions SET ${restore} WHERE id=?`,[thirty]);
 }
 await driver.execute('UPDATE app_settings SET value=? WHERE key=?',['{}','refund:'+thirty]);expect(await repo.refunds.read(thirty)).toMatchObject({saved:true,link:null});await repo.refunds.remove(thirty);expect((await repo.refunds.read(thirty)).saved).toBe(false);
});
it('accounts for a refund received into another account without treating it as income or new spending',async()=>{
 const {repo,driver,purchase,thirty}=await refundFixture();await repo.addAccount({id:'b',name:'Other synthetic',institution:'',type:'checking',currency:'AUD',mask_last4:null,opening_balance_minor:0n});await driver.execute("UPDATE transactions SET account_id='b' WHERE id=?",[thirty]);await repo.refunds.save(thirty,purchase);
 const s=await repo.intelligence.snapshot('2026-02-28','AUD');expect(spendingPatterns(s,'2026-01','a').refunds).toMatchObject({minor:'3000',net:'7000'});expect(spendingPatterns(s,'all','b')).toMatchObject({total:'0',credits:'3000',refunds:{minor:'0',net:'0'}});
});
it('keeps payslip-linked salary out of refund matching, including when a payslip is linked later',async()=>{
 const {repo,driver,doc,purchase,thirty}=await refundFixture();await repo.refunds.save(thirty,purchase);
 await driver.execute("INSERT INTO payslips(id,employer,pay_date,period_start,period_end,gross_minor,net_minor,tax_minor,super_minor,currency,linked_transaction_id,import_batch_id) VALUES('synthetic-pay','Synthetic employer','2026-02-02','2026-01-20','2026-02-02',3000,3000,0,0,'AUD',?,?)",[thirty,doc.id]);
 expect((await repo.refunds.read(thirty)).link).toBeNull();await expect(repo.refunds.save(thirty,purchase)).rejects.toThrow();expect((await repo.intelligence.snapshot('2026-02-28','AUD')).transactions.find(t=>t.id===thirty)?.kind).toBe('income');
});
