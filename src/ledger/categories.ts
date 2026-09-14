import type {Driver} from '../core/db/driver';
import {sha256} from '@noble/hashes/sha256';
import {bytesToHex} from '@noble/hashes/utils';
export const editableCategories=['Groceries','Housing','Utilities','Transport','Health','Eating out','Shopping','Entertainment','Income','Savings','Debt'] as const;
type Edit={id:string;category:string|null};
const categoryId=(name:string)=>bytesToHex(sha256('category:'+name));
async function apply(driver:Driver,edit:Edit){
 const row=(await driver.query('SELECT id,transfer_group_id FROM transactions WHERE id=?',[edit.id]))[0];
 if(!row||row.transfer_group_id)return;
 const name=edit.category,id=name?categoryId(name):null;
 if(name)await driver.execute('INSERT OR IGNORE INTO categories(id,name,kind) VALUES(?,?,?)',[id,name,name==='Income'?'income':name==='Savings'?'savings':name==='Debt'?'debt':['Groceries','Housing','Utilities','Transport','Health'].includes(name)?'essential':'discretionary']);
 await driver.execute('UPDATE transactions SET category_id=? WHERE id=?',[id,edit.id]);
}
/** User presentation edits are replayed after rebuilding original statement contributions. */
export async function applyCategoryEdits(driver:Driver){
 for(const row of await driver.query("SELECT value FROM app_settings WHERE key LIKE 'category-edit:%' ORDER BY key"))await apply(driver,JSON.parse(String(row.value)) as Edit);
}
export function categoryRepository(driver:Driver){
 async function set(ids:string[],category:string|null){
  const unique=[...new Set(ids)];if(!unique.length||unique.length>1000)throw new Error('Choose between one and 1,000 transactions.');
  if(category!==null&&!editableCategories.some(c=>c===category))throw new Error('Choose a supported category.');
  return driver.transaction(async()=>{
   for(const id of unique){const row=(await driver.query('SELECT id,transfer_group_id FROM transactions WHERE id=?',[id]))[0];if(!row)throw new Error('A selected transaction was removed. Refresh the ledger and select it again.');if(row.transfer_group_id)throw new Error('Matched transfers keep their transfer classification. Remove them from this selection.');
    const sources=await driver.query("SELECT s.transaction_id FROM transaction_sources s JOIN import_batches b ON b.id=s.import_batch_id WHERE s.transaction_id=? AND b.parser_version!='manual-entry-v1'",[id]);if(!sources.length)throw new Error('Edit manual entries from their transaction form.');}
   for(const id of unique){const edit={id,category};await driver.execute('INSERT OR REPLACE INTO app_settings(key,value) VALUES(?,?)',['category-edit:'+id,JSON.stringify(edit)]);await apply(driver,edit);}
  });
 }
 return {set};
}
