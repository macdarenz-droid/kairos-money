import type {Driver} from '../core/db/driver';
import type {Allocation} from '../intelligence/allocations';
export const splitCategories=['Groceries','Housing','Utilities','Transport','Health','Eating out','Shopping','Entertainment'] as const;
export type Split={id:string;currency:string;minor:string;parts:Allocation[]};
export function validSplit(split:Split,minor:string,code:string){return split.minor===minor&&split.currency===code&&BigInt(minor)<0n&&Array.isArray(split.parts)&&split.parts.length>=2&&split.parts.length<=10&&split.parts.every(p=>p&&p.kind===(['Groceries','Housing','Utilities','Transport','Health'].includes(p.category)?'essential':'discretionary')&&/^\d+$/.test(p.minor)&&BigInt(p.minor)>0n&&splitCategories.some(c=>c===p.category))&&split.parts.reduce((n,p)=>n+BigInt(p.minor),0n)===-BigInt(minor);}
export function splitRepository(driver:Driver){
 async function get(id:string):Promise<Split|null>{const r=(await driver.query('SELECT value FROM app_settings WHERE key=?',['split:'+id]))[0];return r?JSON.parse(String(r.value)) as Split:null;}
 async function save(id:string,parts:{category:string;minor:string}[]){return driver.transaction(async()=>{
  const row=(await driver.query('SELECT * FROM transactions WHERE id=?',[id]))[0];if(!row||row.status!=='settled'||row.transfer_group_id||BigInt(String(row.amount_minor))>=0n)throw new Error('Choose a settled imported expense, excluding transfers.');
  if(!(await driver.query("SELECT s.transaction_id FROM transaction_sources s JOIN import_batches b ON b.id=s.import_batch_id WHERE s.transaction_id=? AND b.parser_version!='manual-entry-v1'",[id])).length)throw new Error('Splits currently apply to imported expenses.');
  const split:Split={id,currency:String(row.currency),minor:String(row.amount_minor),parts:parts.map(p=>({...p,kind:['Groceries','Housing','Utilities','Transport','Health'].includes(p.category)?'essential':'discretionary'}))};
  if(!validSplit(split,split.minor,split.currency))throw new Error('Use 2–10 positive category amounts that add up exactly to the payment.');
  await driver.execute('INSERT OR REPLACE INTO app_settings(key,value) VALUES(?,?)',['split:'+id,JSON.stringify(split)]);
 });}
 async function remove(id:string){await driver.execute('DELETE FROM app_settings WHERE key=?',['split:'+id]);}
 return {get,save,remove};
}
