import { expect, it } from 'vitest';
import { distinguishStatementRows, hasStatementBalanceChain } from '../src/ingest/normalize/statement-evidence';
import { hash, normalizeRow } from '../src/ingest/normalize';
import { balance, reconcile } from '../src/ingest/reconcile';
import type { Document, ImportContext } from '../src/ingest/types';
import { memoryDriver } from './db-helper';
import { migrate } from '../src/core/db/migrate';
import { repository } from '../src/core/db/repository';
const context: ImportContext = {accountId:'a',accountKind:'checking',currency:'AUD',period:{start:'2025-02-01',end:'2025-02-28'},dateOrder:'DMY',decimal:'.',creditPositivePurchases:false};
function statement(name:string, balances=['90.00','80.00']):Document {
 const sourceHash=hash(name);
 return distinguishStatementRows({id:hash(JSON.stringify(['a',sourceHash])),hash:sourceHash,fileName:name,parser:'westpac-choice-v1',context,opening:balances.length===2?'10000':'9000',closing:'8000',payslip:null,sourceRank:2,sourceKind:'statement',integrityTier:'A',rows:balances.map((runningBalance,i)=>normalizeRow({sourceId:String(i),date:'02/02/25',description:'Synthetic cafe',amount:'10.00',direction:'debit',runningBalance,confidence:9800},context))});
}
it('keeps repeated purchases and commits them once, with reversible overlapping provenance',async()=>{
 const full=statement('full'),partial=statement('partial',['80.00']);
 expect(hasStatementBalanceChain(full)).toBe(true); expect(balance(full).valid).toBe(true);
 expect(new Set(full.rows.map(r=>r.fingerprint)).size).toBe(2);
 expect(reconcile([full,partial])).toEqual(reconcile([partial,full]));
 expect(reconcile([full,partial])).toHaveLength(2);
 for(const docs of [[full,partial],[partial,full]]) {
  const {driver}=memoryDriver(); await migrate(driver);const repo=repository(driver);
  await repo.addAccount({id:'a',name:'Synthetic',institution:'Westpac',type:'checking',currency:'AUD',mask_last4:null,opening_balance_minor:0n});
  for(const doc of docs){await repo.imports.stage(structuredClone(doc));const review=await repo.imports.review(doc.id);expect(review.balance.valid).toBe(true);expect(review.uncertainCount).toBe(0);await repo.imports.commit(doc.id);}
  expect(await repo.imports.ledger()).toHaveLength(2);
  expect((await repo.imports.stage(full)).alreadyImported).toBe(true);
  await repo.imports.rollback(partial.id);expect(await repo.imports.ledger()).toHaveLength(2);
 }
});
it('does not promote a duplicated extraction row into a separate purchase',()=>{
 const doc=statement('bad');doc.rows[1]={...doc.rows[0]!,sourceId:'1',occurrence:''};doc.rows[0]!.occurrence='';
 expect(hasStatementBalanceChain(doc)).toBe(false);
 distinguishStatementRows(doc);expect(doc.rows.every(r=>!r.occurrence)).toBe(true);
 expect(balance(doc).valid).toBe(false);
});
it('corroborates an unambiguous export but retains ambiguity when balances are absent',()=>{
 const full=statement('full'),exportDoc=statement('export',['80.00']);exportDoc.sourceKind='export';exportDoc.sourceRank=3;exportDoc.integrityTier='B';
 exportDoc.rows=exportDoc.rows.map(r=>normalizeRow({sourceId:r.sourceId,date:r.date,description:r.description,amount:r.minor==='-1000'?'-10.00':'0',runningBalance:'80.00',confidence:9800},context));
 expect(reconcile([full,exportDoc])).toHaveLength(2);
 expect(reconcile([full,exportDoc])).toEqual(reconcile([exportDoc,full]));
 delete exportDoc.rows[0]!.runningBalance;expect(reconcile([full,exportDoc])).toHaveLength(3);
});
it('leaving categories unassigned never approves an uncertain extraction',async()=>{
 const {driver}=memoryDriver();await migrate(driver);const repo=repository(driver);
 await repo.addAccount({id:'a',name:'Synthetic',institution:'Westpac',type:'checking',currency:'AUD',mask_last4:null,opening_balance_minor:0n});
 const doc=statement('uncertain');doc.rows[0]!.confidence=8000;doc.rows[0]!.issues=['Check the extracted amount.'];
 await repo.imports.stage(doc);await repo.imports.leaveCategoriesUnassigned(doc.id);
 expect((await repo.imports.review(doc.id)).uncertainCount).toBe(1);
 await expect(repo.imports.commit(doc.id)).rejects.toThrow('uncertain');expect(await repo.imports.ledger()).toHaveLength(0);
});
