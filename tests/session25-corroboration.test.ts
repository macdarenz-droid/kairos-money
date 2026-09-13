import { describe, expect, it } from 'vitest';
import { memoryDriver } from './db-helper';
import { migrate } from '../src/core/db/migrate';
import { repository } from '../src/core/db/repository';
import { hash, normalizeRow } from '../src/ingest/normalize';
import type { Document, ImportContext } from '../src/ingest/types';
const context:ImportContext={accountId:'a',accountKind:'checking',currency:'AUD',period:{start:'2026-03-01',end:'2026-03-31'},dateOrder:'DMY',decimal:'.',creditPositivePurchases:false};
async function repo(){const {driver}=memoryDriver();await migrate(driver);const r=repository(driver);await r.addAccount({id:'a',name:'A',institution:'CommBank',type:'checking',currency:'AUD',mask_last4:null,opening_balance_minor:0n});return {r,driver};}
function doc(name:string, rows:{date:string;amount:string;pending?:boolean}[],rank=3):Document {const fileHash=hash(name);return {id:hash(JSON.stringify(['a',fileHash])),hash:fileHash,fileName:name,parser:'synthetic',context,opening:'0',closing:'0',payslip:null,sourceRank:rank,sourceKind:rank===2?'statement':'export',integrityTier:'C',rows:rows.map((r,i)=>({...normalizeRow({sourceId:String(i),description:'Synthetic cafe',confidence:9800,...r},{...context,period:{start:'2026-01-01',end:'2026-12-31'}}),issues:[],verified:true}))};}
describe('Session 2.5 independent reconciliation review',()=>{
 it('keeps one settled transaction when a PDF corroborates its posted date',async()=>{
  const {r}=await repo();
  const pending=doc('pending.csv',[{date:'2026-03-13',amount:'-100',pending:true}]);
  const settled=doc('settled.csv',[{date:'2026-03-15',amount:'-72'}]);
  const statement=doc('statement.pdf',[{date:'2026-03-14',amount:'-72'}],2);
  statement.integrityTier='A'; statement.closing='-7200';
  await r.imports.stage(pending);await r.imports.commit(pending.id);
  const id=(await r.imports.ledger())[0]!.id;
  await r.imports.stage(settled);await r.imports.commit(settled.id);
  expect(await r.imports.ledger()).toHaveLength(1);
  await r.imports.stage(statement);await r.imports.commit(statement.id);
  const rows=await r.imports.ledger();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({id,minor:'-7200',pending:false});
  expect(rows[0]!.sources).toHaveLength(3);
  await r.imports.rollback(statement.id);
  expect(await r.imports.ledger()).toHaveLength(1);
  expect((await r.imports.ledger())[0]).toMatchObject({id,minor:'-7200',pending:false});
 });
 it('commits corroborated settlement identically in all six source orders',async()=>{
  const a=doc('pending.csv',[{date:'2026-03-13',amount:'-100',pending:true}]);
  const b=doc('settled.csv',[{date:'2026-03-15',amount:'-72'}]);
  const c=doc('statement.pdf',[{date:'2026-03-14',amount:'-72'}],2);
  c.integrityTier='A';c.closing='-7200';
  let expected:unknown;
  for(const order of [[a,b,c],[a,c,b],[b,a,c],[b,c,a],[c,a,b],[c,b,a]]) {
   const {r}=await repo();
   for(const source of order) {await r.imports.stage(structuredClone(source));await r.imports.commit(source.id);}
   const rows=await r.imports.ledger();
   expect(rows).toHaveLength(1);
   expect(rows[0]).toMatchObject({id:a.rows[0]!.fingerprint,minor:'-7200',pending:false});
   expected??=rows;expect(rows).toEqual(expected);
  }
 });
});
