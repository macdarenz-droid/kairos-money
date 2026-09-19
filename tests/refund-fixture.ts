import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository} from '../src/core/db/repository';
import {hash,normalizeRow} from '../src/ingest/normalize';
import type {Document,ImportContext} from '../src/ingest/types';
export async function refundFixture(){
 const {driver}=memoryDriver();await migrate(driver);const repo=repository(driver);await repo.addAccount({id:'a',name:'Synthetic',institution:'',type:'checking',currency:'AUD',mask_last4:null,opening_balance_minor:0n});
 const context:ImportContext={accountId:'a',accountKind:'checking',currency:'AUD',period:{start:'2026-01-01',end:'2026-02-28'},dateOrder:'DMY',decimal:'.',creditPositivePurchases:false};
 const rows=[['1','2026-01-02','Synthetic purchase','-100.00'],['2','2026-02-02','Synthetic refund thirty','30.00'],['3','2026-02-03','Synthetic refund seventy','70.00'],['4','2026-02-04','Synthetic credit eighty','80.00']].map(([sourceId,date,description,amount])=>({...normalizeRow({sourceId:sourceId!,date:date!,description:description!,amount:amount!,confidence:10000},context),category:amount!.startsWith('-')?'Shopping':'Income',verified:true}));
 const doc:Document={id:hash(JSON.stringify(['a',hash('refund-fixture')])),hash:hash('refund-fixture'),fileName:'synthetic-refunds.csv',parser:'synthetic',context,opening:'10000',closing:'18000',payslip:null,rows};await repo.imports.stage(doc);await repo.imports.commit(doc.id);const ledger=await repo.imports.ledger();const ids=['Synthetic purchase','Synthetic refund thirty','Synthetic refund seventy','Synthetic credit eighty'].map(name=>ledger.find(t=>t.description===name)!.id);return {repo,driver,doc,purchase:ids[0]!,thirty:ids[1]!,seventy:ids[2]!,eighty:ids[3]!};
}
