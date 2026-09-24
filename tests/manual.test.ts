import {beforeEach,expect,it} from 'vitest';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository,type Repository} from '../src/core/db/repository';
import {hash,normalizeRow} from '../src/ingest/normalize';
import type {ManualInput} from '../src/ledger/manual';
import {encryptBackup,decryptBackup} from '../src/core/crypto/backup';
let repo:Repository;
beforeEach(async()=>{const {driver}=memoryDriver();await migrate(driver);repo=repository(driver);for(const id of ['a','b'])await repo.addAccount({id,name:id,institution:'Synthetic',type:'checking',currency:'AUD',mask_last4:null,opening_balance_minor:0n});});
const entry:ManualInput={id:'manual-1',kind:'expense',accountId:'a',destinationId:null,date:'2026-03-02',minor:'1250',description:'Synthetic cafe',category:'Eating out',notes:'Cash purchase'};
async function statement(name='synthetic'){const context={accountId:'a',accountKind:'checking' as const,currency:'AUD' as const,period:{start:'2026-03-01',end:'2026-03-31'},dateOrder:'DMY' as const,decimal:'.' as const,creditPositivePurchases:false};const source=hash(name);const doc={id:hash(JSON.stringify(['a',source])),hash:source,fileName:name,parser:'synthetic-test',context,opening:'10000',closing:'8750',payslip:null,rows:[normalizeRow({sourceId:'r1',date:entry.date,description:entry.description,amount:'-12.50',confidence:10000},context)]};doc.rows[0]!.verified=true;await repo.imports.stage(doc);await repo.imports.commit(doc.id);return doc.id;}
it('saves, edits and deletes exact manual income and expense without claiming coverage',async()=>{
 await repo.manual.save(entry);expect(await repo.manual.today(entry.date)).toEqual([{currency:'AUD',income:'0',spending:'1250',awaitingIncome:'0',awaitingSpending:'0'}]);expect(await repo.imports.batches()).toHaveLength(0);
 await repo.manual.save({...entry,minor:'2000'});expect((await repo.manual.today(entry.date))[0]!.spending).toBe('2000');
 await repo.manual.save({...entry,id:'income-1',kind:'income',minor:'10000',category:null});expect((await repo.manual.today(entry.date))[0]!.income).toBe('10000');
 const snapshot=await repo.exportAll();expect(snapshot.tables.coverage_ranges).toHaveLength(0);expect(snapshot.tables.staging_rows).toHaveLength(2);
 await repo.manual.remove(entry.id);expect((await repo.manual.today(entry.date))[0]!.spending).toBe('0');
});
it('creates both transfer legs atomically and excludes them from spending and income',async()=>{
 await repo.manual.save({...entry,kind:'transfer',destinationId:'b'});const data=await repo.exportAll();expect(data.tables.transactions).toHaveLength(2);expect(data.tables.transactions!.map(r=>r.amount_minor).sort()).toEqual([-1250,1250]);expect(await repo.manual.today(entry.date)).toEqual([]);
 await expect(repo.manual.save({...entry,kind:'transfer',destinationId:'a'})).rejects.toThrow('two different');expect((await repo.exportAll()).tables.transactions).toHaveLength(2);
});
it('preserves manual entries across import, explicit match, rollback and reimport',async()=>{
 await repo.manual.save(entry);const id=await statement();expect((await repo.manual.today(entry.date))[0]!.spending).toBe('2500');
 const matches=await repo.manual.candidates(entry.id);expect(matches).toHaveLength(1);await repo.manual.match(entry.id,matches[0]!.leg,matches[0]!.transactionId);expect((await repo.manual.today(entry.date))[0]!.spending).toBe('1250');
 await repo.imports.rollback(id);expect((await repo.manual.today(entry.date))[0]!.spending).toBe('1250');expect(await repo.manual.list()).toHaveLength(1);
 await statement();expect((await repo.manual.today(entry.date))[0]!.spending).toBe('1250');
 await repo.manual.remove(entry.id);expect((await repo.manual.today(entry.date))[0]!.spending).toBe('1250');
});
it('refuses matching two separate manual purchases to one imported transaction',async()=>{
 await repo.manual.save(entry);await repo.manual.save({...entry,id:'manual-2'});await statement();const m=(await repo.manual.candidates(entry.id))[0]!;await repo.manual.match(entry.id,m.leg,m.transactionId);
 await expect(repo.manual.match('manual-2',m.leg,m.transactionId)).rejects.toThrow('already matches');
});
it('keeps one count when a matched source is rolled back but a corroborating import survives',async()=>{
 await repo.manual.save(entry);const first=await statement('one');await statement('two');const c=(await repo.manual.candidates(entry.id))[0]!;await repo.manual.match(entry.id,c.leg,c.transactionId);
 await repo.imports.rollback(first);expect((await repo.manual.today(entry.date))[0]!.spending).toBe('1250');
});
it('flags unresolved matches and clears the flag only after explicit confirmation',async()=>{
 await repo.manual.save(entry);await statement();expect((await repo.manual.unresolved())[entry.id]).toBe(1);
 const c=(await repo.manual.candidates(entry.id))[0]!;await repo.manual.match(entry.id,c.leg,c.transactionId);expect(await repo.manual.unresolved()).toEqual({});
 await repo.manual.unmatch(entry.id);expect((await repo.manual.unresolved())[entry.id]).toBe(1);
});
it('restores manual provenance and confirmed matches through an encrypted backup',async()=>{
 await repo.manual.save(entry);const batch=await statement();const c=(await repo.manual.candidates(entry.id))[0]!;await repo.manual.match(entry.id,c.leg,c.transactionId);
 const original=await repo.exportAll();const code='2345-6789-ABCD-EFGH-JKLM-NPQR-STUV-WXYZ-2345-6789';
 const encrypted=await encryptBackup(original,code);const {driver}=memoryDriver();await migrate(driver);const restored=repository(driver);
 await restored.restoreBackup(await decryptBackup(encrypted,code));expect((await restored.exportAll()).tables).toEqual(original.tables);
 await restored.imports.rollback(batch);expect((await restored.manual.today(entry.date))[0]!.spending).toBe('1250');expect(await restored.manual.list()).toHaveLength(1);
});
it('rejects invalid amounts without replacing the previous entry',async()=>{
 await repo.manual.save(entry);for(const minor of ['0','-1','1.5','9007199254740992'])await expect(repo.manual.save({...entry,minor})).rejects.toThrow();
 expect((await repo.manual.today(entry.date))[0]!.spending).toBe('1250');
});
it('protects a matched canonical transaction after its original source is rolled back',async()=>{
 await repo.manual.save(entry);const first=await statement('one');const c=(await repo.manual.candidates(entry.id))[0]!;await repo.manual.match(entry.id,c.leg,c.transactionId);
 await statement('two');await repo.imports.rollback(first);await repo.manual.save({...entry,id:'manual-2'});
 const next=(await repo.manual.candidates('manual-2'))[0]!;await expect(repo.manual.match('manual-2',next.leg,next.transactionId)).rejects.toThrow('already matches');
});
