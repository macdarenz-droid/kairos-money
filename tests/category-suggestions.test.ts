import { expect, it } from 'vitest';
import { hash, normalizeRow } from '../src/ingest/normalize';
import type { Document, ImportContext } from '../src/ingest/types';
import { memoryDriver } from './db-helper';
import { migrate } from '../src/core/db/migrate';
import { repository } from '../src/core/db/repository';

const context: ImportContext = {accountId:'a',accountKind:'checking',currency:'AUD',period:{start:'2025-02-01',end:'2025-02-28'},dateOrder:'DMY',decimal:'.',creditPositivePurchases:false};
// One row the app can read a category from, one it cannot. Both are certain extractions.
const lines=[
 {sourceId:'0',date:'02/02/25',description:'WOOLWORTHS 1234 SYDNEY',amount:'10.00',direction:'debit' as const,runningBalance:'90.00',confidence:9800},
 {sourceId:'1',date:'03/02/25',description:'SQ *SYNTHETIC VENDOR',amount:'10.00',direction:'debit' as const,runningBalance:'80.00',confidence:9800},
];
function staged():Document{
 const sourceHash=hash('suggestions');
 return {id:hash(JSON.stringify(['a',sourceHash])),hash:sourceHash,fileName:'suggestions.pdf',parser:'westpac-choice-v1',context,
  opening:'10000',closing:'8000',payslip:null,sourceRank:2,sourceKind:'statement',integrityTier:'A',
  rows:lines.map(line=>normalizeRow(line,context))};
}
async function ledgerFor(accept:boolean){
 const {driver}=memoryDriver();await migrate(driver);const repo=repository(driver);
 await repo.addAccount({id:'a',name:'Synthetic',institution:'Westpac',type:'checking',currency:'AUD',mask_last4:null,opening_balance_minor:0n});
 const doc=staged();await repo.imports.stage(doc);
 if(accept)await repo.imports.useSuggestedCategories(doc.id);else await repo.imports.leaveCategoriesUnassigned(doc.id);
 await repo.imports.commit(doc.id);
 return (await repo.imports.ledger()).sort((a,b)=>a.date.localeCompare(b.date));
}

it('files the category it already worked out, instead of throwing it away',async()=>{
 // The complaint this exists for: the app reads "WOOLWORTHS" as Groceries, is not certain enough to apply
 // it silently, and the only one-press way past the review used to be the one that discards it. A ledger
 // of uncategorised rows makes every category figure in the app meaningless.
 const accepted=await ledgerFor(true);
 expect(accepted[0]!.category).toBe('Groceries');
 expect(accepted[0]!.categoryFrom).toBe('suggestion');
});

it('invents nothing for a row it cannot read a category from',async()=>{
 const accepted=await ledgerFor(true);
 expect(accepted[1]!.category).toBeNull();
 expect(accepted[1]!.categoryFrom).toBeUndefined();
});

it('still lets a person keep every row uncategorised',async()=>{
 const left=await ledgerFor(false);
 expect(left.map(r=>r.category)).toEqual([null,null]);
});

it('marks an accepted category as suggested, never as one the person confirmed',async()=>{
 const {driver}=memoryDriver();await migrate(driver);const repo=repository(driver);
 await repo.addAccount({id:'a',name:'Synthetic',institution:'Westpac',type:'checking',currency:'AUD',mask_last4:null,opening_balance_minor:0n});
 const doc=staged();await repo.imports.stage(doc);await repo.imports.useSuggestedCategories(doc.id);
 const review=await repo.imports.review(doc.id);
 // Accepting clears the review, so the import can be committed without opening each row.
 expect(review.uncertainCount).toBe(0);
 expect(review.items.every(item=>!item.blocked)).toBe(true);
 // And the provenance survives, so these can be found and changed later.
 expect(review.items.filter(item=>item.row.categoryFrom==='suggestion')).toHaveLength(1);
});

it('never approves an uncertain extraction just because a category was suggested',async()=>{
 const {driver}=memoryDriver();await migrate(driver);const repo=repository(driver);
 await repo.addAccount({id:'a',name:'Synthetic',institution:'Westpac',type:'checking',currency:'AUD',mask_last4:null,opening_balance_minor:0n});
 const doc=staged();doc.rows[0]!.confidence=8000;doc.rows[0]!.issues=['Check the extracted amount.'];
 await repo.imports.stage(doc);await repo.imports.useSuggestedCategories(doc.id);
 expect((await repo.imports.review(doc.id)).uncertainCount).toBe(1);
 await expect(repo.imports.commit(doc.id)).rejects.toThrow('uncertain');
 expect(await repo.imports.ledger()).toHaveLength(0);
});
