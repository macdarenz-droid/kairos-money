import {afterEach,expect,it,vi} from 'vitest';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository} from '../src/core/db/repository';
import {hash,normalizeRow} from '../src/ingest/normalize';
import type {Document,ImportContext} from '../src/ingest/types';
afterEach(()=>vi.unstubAllGlobals());
it('keeps staging and the live ledger unchanged if a large-import worker fails',async()=>{
 let terminated=0;
 vi.stubGlobal('Worker',class {onerror:(()=>void)|null=null;postMessage(){this.onerror?.();}terminate(){terminated++;}});
 const {driver}=memoryDriver();await migrate(driver);const repo=repository(driver);await repo.addAccount({id:'a',name:'Synthetic',institution:'',type:'checking',currency:'AUD',mask_last4:null,opening_balance_minor:0n});
 const context:ImportContext={accountId:'a',accountKind:'checking',currency:'AUD',period:{start:'2026-03-01',end:'2026-03-31'},dateOrder:'DMY',decimal:'.',creditPositivePurchases:false};
 const rows=Array.from({length:201},(_,i)=>({...normalizeRow({sourceId:String(i),date:'2026-03-01',description:'Synthetic',amount:'-1.00',confidence:10000},context),verified:true}));
 const doc:Document={id:hash(JSON.stringify(['a',hash('worker-source')])),hash:hash('worker-source'),fileName:'Synthetic.csv',parser:'test',context,opening:'0',closing:'0',payslip:null,rows,sourceRank:3,sourceKind:'export',integrityTier:'C'};
 await repo.imports.stage(doc);const before=(await repo.exportAll()).tables;await expect(repo.imports.commit(doc.id)).rejects.toThrow('worker stopped');expect((await repo.exportAll()).tables).toEqual(before);expect(terminated).toBeGreaterThan(0);
});
