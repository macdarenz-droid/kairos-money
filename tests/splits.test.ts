import {expect,it} from 'vitest';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository} from '../src/core/db/repository';
import {hash,normalizeRow} from '../src/ingest/normalize';
import {computeSignals} from '../src/intelligence/signals';
import {spendingPatterns} from '../src/intelligence/visuals/spending-patterns';
import type {Document,ImportContext} from '../src/ingest/types';
const context:ImportContext={accountId:'a',accountKind:'checking',currency:'AUD',period:{start:'2026-01-01',end:'2026-01-31'},dateOrder:'DMY',decimal:'.',creditPositivePurchases:false};
const parts=[{category:'Groceries',minor:'600'},{category:'Shopping',minor:'400'}];
function document():Document{return {id:hash(JSON.stringify(['a',hash('file')])),hash:hash('file'),fileName:'synthetic.csv',parser:'synthetic',context,opening:'10000',closing:'9000',payslip:null,rows:[{...normalizeRow({sourceId:'1',date:'2026-01-02',description:'Synthetic store',amount:'-10.00',confidence:10000},context),category:'Shopping',verified:true}]};}
async function setup(){const {driver}=memoryDriver();await migrate(driver);const repo=repository(driver);await repo.addAccount({id:'a',name:'Synthetic',institution:'',type:'checking',currency:'AUD',mask_last4:null,opening_balance_minor:0n});const doc=document();await repo.imports.stage(doc);await repo.imports.commit(doc.id);const id=(await repo.imports.ledger())[0]!.id;return {driver,repo,doc,id};}
it('allocates exactly without changing payment, sources, coverage or purchase counts, and retains backup/rollback/reimport',async()=>{
 const {repo,doc,id}=await setup();const original=await repo.exportAll();await repo.splits.save(id,parts);
 for(const table of ['transactions','transaction_sources','coverage_ranges'] as const)expect((await repo.exportAll()).tables[table]).toEqual(original.tables[table]);
 const snapshot=await repo.intelligence.snapshot('2026-01-31','AUD');expect(snapshot.transactions).toHaveLength(1);expect(snapshot.transactions[0]!.allocations?.map(p=>p.minor)).toEqual(['600','400']);expect(spendingPatterns(snapshot)).toMatchObject({total:'1000'});expect(spendingPatterns(snapshot).merchants[0]?.count).toBe(1);
 const concentration=computeSignals(snapshot,{start:'2026-01-01',end:'2026-01-31',label:'January'}).find(s=>s.key==='category_concentration');expect(concentration?.value).toBe('5200');
 const fresh=memoryDriver();await migrate(fresh.driver);const restored=repository(fresh.driver);await restored.restoreBackup(await repo.exportAll());expect(await restored.splits.get(id)).toEqual(await repo.splits.get(id));
 await repo.imports.rollback(doc.id);expect((await repo.intelligence.snapshot('2026-01-31','AUD')).transactions).toEqual([]);await repo.imports.stage(doc);await repo.imports.commit(doc.id);expect((await repo.intelligence.snapshot('2026-01-31','AUD')).transactions[0]!.allocations).toHaveLength(2);
 await repo.splits.remove(id);expect((await repo.intelligence.snapshot('2026-01-31','AUD')).transactions[0]!.allocations).toBeUndefined();
});
it('rejects mismatched, nonpositive, unsupported and transfer splits atomically; blocks conflicting bulk categories',async()=>{
 const {repo,driver,id}=await setup();await repo.splits.save(id,parts);const saved=await repo.splits.get(id);
 for(const invalid of [[{category:'Groceries',minor:'900'},{category:'Shopping',minor:'400'}],[{category:'Groceries',minor:'0'},{category:'Shopping',minor:'1000'}],[{category:'Income',minor:'600'},{category:'Shopping',minor:'400'}]])await expect(repo.splits.save(id,invalid)).rejects.toThrow('exactly');
 expect(await repo.splits.get(id)).toEqual(saved);await expect(repo.categories.set([id],'Health')).rejects.toThrow('split');
 await driver.execute("UPDATE transactions SET status='pending' WHERE id=?",[id]);expect((await repo.intelligence.snapshot('2026-01-31','AUD')).transactions[0]!.allocations).toBeUndefined();await expect(repo.splits.save(id,parts)).rejects.toThrow('settled');
 await driver.execute("UPDATE transactions SET status='settled',amount_minor=-1100 WHERE id=?",[id]);expect((await repo.intelligence.snapshot('2026-01-31','AUD')).transactions[0]!.allocations).toBeUndefined();
 await driver.execute("UPDATE transactions SET amount_minor=-1000,transfer_group_id='synthetic-transfer' WHERE id=?",[id]);await expect(repo.splits.save(id,parts)).rejects.toThrow('excluding transfers');expect((await repo.intelligence.snapshot('2026-01-31','AUD')).transactions[0]!.allocations).toBeUndefined();
});
it('preserves manual allocations through statement matching, rollback, backup and deletion without changing money',async()=>{
 const {repo,doc,id}=await setup();
 const entry={id:'manual-split',kind:'expense' as const,accountId:'a',destinationId:null,date:'2026-01-02',minor:'1000',description:'Synthetic store',category:'Shopping',notes:''};
 await repo.manual.save(entry);const manualId=hash('manual-transaction:'+entry.id+':entry');await repo.splits.save(manualId,parts);
 expect((await repo.intelligence.snapshot('2026-01-31','AUD')).transactions.find(t=>t.id===manualId)?.allocations).toHaveLength(2);
 await repo.manual.match(entry.id,'entry',id);
 let snapshot=await repo.intelligence.snapshot('2026-01-31','AUD');expect(snapshot.transactions).toHaveLength(1);expect(snapshot.transactions[0]?.allocations?.map(p=>p.minor)).toEqual(['600','400']);
 await repo.imports.rollback(doc.id);snapshot=await repo.intelligence.snapshot('2026-01-31','AUD');expect(snapshot.transactions).toHaveLength(1);expect(snapshot.transactions[0]?.id).toBe(manualId);expect(snapshot.transactions[0]?.allocations).toHaveLength(2);
 const fresh=memoryDriver();await migrate(fresh.driver);const restored=repository(fresh.driver);await restored.restoreBackup(await repo.exportAll());expect(await restored.splits.get(manualId)).toEqual(await repo.splits.get(manualId));
 await repo.imports.stage(doc);await repo.imports.commit(doc.id);await repo.manual.remove(entry.id);expect(await repo.splits.get(manualId)).toBeNull();expect((await repo.intelligence.snapshot('2026-01-31','AUD')).transactions).toHaveLength(1);expect(await repo.splits.get(id)).not.toBeNull();
});
it('rejects conflicting split matches atomically and excludes outdated manual allocations',async()=>{
 const {repo,id}=await setup();const entry={id:'manual-conflict',kind:'expense' as const,accountId:'a',destinationId:null,date:'2026-01-02',minor:'1000',description:'Synthetic store',category:'Shopping',notes:''};
 await repo.manual.save(entry);const manualId=hash('manual-transaction:'+entry.id+':entry');await repo.splits.save(manualId,parts);await repo.splits.save(id,[{category:'Groceries',minor:'500'},{category:'Shopping',minor:'500'}]);
 await expect(repo.manual.match(entry.id,'entry',id)).rejects.toThrow('different category splits');expect((await repo.manual.list())[0]?.links).toEqual({});expect((await repo.splits.get(id))?.parts[0]?.minor).toBe('500');
 await repo.manual.save({...entry,minor:'1200'});expect((await repo.intelligence.snapshot('2026-01-31','AUD')).transactions.find(t=>t.id===manualId)?.allocations).toBeUndefined();
 await repo.manual.remove(entry.id);await repo.manual.save(entry);expect(await repo.splits.get(manualId)).toBeNull();
});
