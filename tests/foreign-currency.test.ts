import {expect,it} from 'vitest';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository} from '../src/core/db/repository';
import {foreignRate} from '../src/ledger/foreign-currency';
import {hash,normalizeRow} from '../src/ingest/normalize';
import type {Document,ImportContext} from '../src/ingest/types';
async function setup(){const {driver}=memoryDriver();await migrate(driver);const repo=repository(driver);await repo.addAccount({id:'a',name:'Synthetic',institution:'',type:'checking',currency:'AUD',mask_last4:null,opening_balance_minor:0n});const context:ImportContext={accountId:'a',accountKind:'checking',currency:'AUD',period:{start:'2026-01-01',end:'2026-01-31'},dateOrder:'DMY',decimal:'.',creditPositivePurchases:false};const doc:Document={id:hash(JSON.stringify(['a',hash('fx-file')])),hash:hash('fx-file'),fileName:'synthetic.csv',parser:'synthetic',context,opening:'10000',closing:'8500',payslip:null,rows:[normalizeRow({sourceId:'1',date:'2026-01-02',description:'Synthetic foreign store',amount:'-15.00',confidence:10000},context)]};await repo.imports.stage(doc);await repo.imports.commit(doc.id);const id=(await repo.imports.ledger())[0]!.id;return {driver,repo,doc,id};}
it('retains exact original amounts through backup and rollback without changing posted money or evidence',async()=>{
 const {repo,doc,id}=await setup(),before=await repo.exportAll();await repo.foreignCurrency.save(id,{originalCurrency:'USD',originalMinor:'1000',note:'Synthetic receipt'});
 const saved=await repo.foreignCurrency.read(id);expect(saved.active).toBe(true);expect(foreignRate(saved.value!).display).toBe('1.500000');
 for(const table of ['transactions','transaction_sources','coverage_ranges'])expect((await repo.exportAll()).tables[table]).toEqual(before.tables[table]);
 const fresh=memoryDriver();await migrate(fresh.driver);const restored=repository(fresh.driver);await restored.restoreBackup(await repo.exportAll());expect(await restored.foreignCurrency.read(id)).toEqual(saved);
 await repo.imports.rollback(doc.id);expect((await repo.foreignCurrency.read(id)).active).toBe(false);await repo.imports.stage(doc);await repo.imports.commit(doc.id);expect(await repo.foreignCurrency.read(id)).toEqual(saved);
 await repo.foreignCurrency.remove(id);expect((await repo.foreignCurrency.read(id)).value).toBeNull();expect((await repo.imports.ledger())[0]?.minor).toBe('-1500');
});
it('handles zero- and three-decimal currencies and credit amounts using exact rational rates',()=>{
 const base={id:'x',postedCurrency:'AUD' as const,postedMinor:'1500',note:'Synthetic'};
 expect(foreignRate({...base,originalCurrency:'JPY',originalMinor:'1000'}).display).toBe('0.015000');
 expect(foreignRate({...base,originalCurrency:'KWD',originalMinor:'3125'}).display).toBe('4.800000');
 expect(foreignRate({...base,postedMinor:'-100',originalCurrency:'USD',originalMinor:'300'}).display).toBe('0.333333');
});
it('rejects invalid edits atomically and marks changed or pending transactions inactive',async()=>{
 const {repo,driver,id}=await setup();const input={originalCurrency:'USD',originalMinor:'1000',note:'Synthetic receipt'};await repo.foreignCurrency.save(id,input);const saved=await repo.foreignCurrency.read(id);
 for(const edit of [{originalMinor:'0'},{originalMinor:'-1'},{originalMinor:'1.5'},{originalCurrency:'AUD'},{originalCurrency:'XYZ'},{note:''}])await expect(repo.foreignCurrency.save(id,{...input,...edit})).rejects.toThrow();
 expect(await repo.foreignCurrency.read(id)).toEqual(saved);
 await driver.execute("UPDATE transactions SET amount_minor=-1600 WHERE id=?",[id]);expect((await repo.foreignCurrency.read(id)).active).toBe(false);
 await driver.execute("UPDATE transactions SET status='pending' WHERE id=?",[id]);await expect(repo.foreignCurrency.save(id,input)).rejects.toThrow('settled');expect((await repo.foreignCurrency.read(id)).active).toBe(false);
 await driver.execute('UPDATE app_settings SET value=? WHERE key=?',[JSON.stringify({...saved.value,originalMinor:'0'}),'foreign-amount:'+id]);await expect(repo.foreignCurrency.read(id)).rejects.toThrow('invalid');
});
