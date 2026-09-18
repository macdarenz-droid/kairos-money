import {splitRepository,validSplit} from './splits';
import {categoryKind,expenseCategories} from './categories';
import type { Driver } from '../core/db/driver';
import { currency, money, toDatabase } from '../core/money';
import { hash, isoDay, dayNumber } from '../ingest/normalize';
export type ManualEntry = { id:string; kind:'expense'|'income'|'transfer'; accountId:string; destinationId:string|null; date:string; minor:string; description:string; category:string|null; notes:string; links:Record<string,{batchId:string;sourceId:string;transactionId?:string}> };
export type ManualInput = Omit<ManualEntry,'links'>;
const marker='__manual__';
export async function manualRecords(driver:Driver):Promise<ManualEntry[]> {
 return (await driver.query("SELECT s.payload FROM staging_rows s JOIN import_batches b ON b.id=s.import_batch_id WHERE s.source_row_id=? AND b.parser_version='manual-entry-v1' AND b.status='committed' ORDER BY b.id",[marker])).map(r=>JSON.parse(String(r.payload)) as ManualEntry);
}
function legs(entry:ManualEntry){return entry.kind==='transfer'?[{key:'from',accountId:entry.accountId,minor:-BigInt(entry.minor)},{key:'to',accountId:entry.destinationId!,minor:BigInt(entry.minor)}]:[{key:'entry',accountId:entry.accountId,minor:BigInt(entry.minor)*(entry.kind==='expense'?-1n:1n)}];}
const batchId=(id:string)=>hash('manual-entry:'+id);
export async function syncManual(driver:Driver):Promise<void>{
 const records=await manualRecords(driver);
 await driver.execute("DELETE FROM transaction_sources WHERE import_batch_id IN (SELECT id FROM import_batches WHERE parser_version='manual-entry-v1')");
 await driver.execute("DELETE FROM transactions WHERE import_batch_id IN (SELECT id FROM import_batches WHERE parser_version='manual-entry-v1')");
 for(const entry of records)for(const leg of legs(entry)){
  const link=entry.links[leg.key];
  const linked=link?(await driver.query('SELECT t.id FROM transaction_sources s JOIN transactions t ON t.id=s.transaction_id WHERE ((s.import_batch_id=? AND s.source_row_id=?) OR t.id=?) AND t.account_id=? AND t.amount_minor=?',[link.batchId,link.sourceId,link.transactionId??'',leg.accountId,toDatabase(money(leg.minor,currency(String((await driver.query('SELECT currency FROM accounts WHERE id=?',[leg.accountId]))[0]!.currency))))]))[0]:undefined;
  if(linked){
   const current=(await driver.query('SELECT posted_date,status,transfer_group_id FROM transactions WHERE id=?',[String(linked.id)]))[0];
   if(current?.status==='settled' && Math.abs(dayNumber(String(current.posted_date))-dayNumber(entry.date))<=3 && (entry.kind!=='transfer'||current.transfer_group_id!==null))continue;
  }
  const account=(await driver.query('SELECT currency FROM accounts WHERE id=?',[leg.accountId]))[0];if(!account)throw new Error('A manual entry account is missing.');
  const category=entry.kind==='transfer'?'Transfer':entry.kind==='income'?'Income':entry.category;
  const categoryId=category?hash('category:'+category):null;
  if(categoryId)await driver.execute('INSERT OR IGNORE INTO categories(id,name,kind) VALUES(?,?,?)',[categoryId,category,entry.kind==='income'?'income':entry.kind==='transfer'?'transfer':categoryKind(category!)]);
  const id=hash('manual-transaction:'+entry.id+':'+leg.key), code=currency(String(account.currency));
  await driver.execute('INSERT INTO transactions(id,account_id,posted_date,amount_minor,currency,raw_description,category_id,type,transfer_group_id,is_recurring,fingerprint,import_batch_id,confidence,user_verified,notes,status) VALUES(?,?,?,?,?,?,?,?,?,0,?,?,10000,1,?,?)',[id,leg.accountId,entry.date,toDatabase(money(leg.minor,code)),code,entry.description,categoryId,leg.minor<0n?'debit':'credit',entry.kind==='transfer'?hash('manual-transfer:'+entry.id):null,id,batchId(entry.id),entry.notes,'settled']);
  await driver.execute('INSERT INTO transaction_sources VALUES(?,?,?,?)',[id,batchId(entry.id),leg.key,JSON.stringify({...entry,leg:leg.key,origin:'manual'})]);
 }
}
export function manualRepository(driver:Driver){
 async function write(entry:ManualEntry){await driver.execute('UPDATE staging_rows SET payload=? WHERE import_batch_id=? AND source_row_id=?',[JSON.stringify(entry),batchId(entry.id),marker]);}
 async function save(input:ManualInput){return driver.transaction(async()=>{
  if(!/^[a-zA-Z0-9-]{1,80}$/.test(input.id))throw new Error('Invalid manual entry identity.');isoDay(input.date);
  if(!['expense','income','transfer'].includes(input.kind))throw new Error('Choose expense, income or transfer.');
  if(!/^\d+$/.test(input.minor)||BigInt(input.minor)<=0n)throw new Error('Enter an amount greater than zero.');
  const description=input.description.trim();if(!description||description.length>200||input.notes.length>2000)throw new Error('Add a description of up to 200 characters and a note of up to 2,000 characters.');
  const from=(await driver.query('SELECT * FROM accounts WHERE id=? AND archived_at IS NULL',[input.accountId]))[0];if(!from)throw new Error('Choose an active account.');money(BigInt(input.minor),currency(String(from.currency)));
  if(input.kind==='transfer') {const to=(await driver.query('SELECT * FROM accounts WHERE id=? AND archived_at IS NULL',[input.destinationId]))[0];if(!to||input.accountId===input.destinationId||to.currency!==from.currency)throw new Error('Choose two different accounts in the same currency.');}
  if(input.category!==null && !expenseCategories.includes(input.category))throw new Error('Choose a supported category.');
  const prior=(await manualRecords(driver)).find(e=>e.id===input.id);
  if(prior&&prior.category!==input.category&&await splitRepository(driver).get(hash('manual-transaction:'+input.id+':entry')))throw new Error('Remove the category split before changing the payment’s single category.');
  const changed=prior && ['kind','accountId','destinationId','date','minor'].some(k=>prior[k as keyof ManualInput]!==input[k as keyof ManualInput]);
  const entry:ManualEntry={...input,description,destinationId:input.kind==='transfer'?input.destinationId:null,links:changed?{}:prior?.links??{}};
  if(!prior){await driver.execute("INSERT INTO import_batches(id,source_file_hash,file_name,parser_version,status,created_at,integrity_tier,source_rank) VALUES(?,?,?,'manual-entry-v1','committed',?,'C',0)",[batchId(entry.id),hash('manual-origin:'+entry.id),'Manual entry',new Date().toISOString()]);await driver.execute('INSERT INTO staging_rows(id,import_batch_id,source_row_id,payload,confidence,issues) VALUES(?,?,?,?,10000,?)',[hash(batchId(entry.id)+marker),batchId(entry.id),marker,JSON.stringify(entry),'[]']);}else await write(entry);
  await syncManual(driver);return entry;
 });}
 async function remove(id:string){return driver.transaction(async()=>{const b=batchId(id);await driver.execute('DELETE FROM app_settings WHERE key=?',['split:'+hash('manual-transaction:'+id+':entry')]);await driver.execute('DELETE FROM app_settings WHERE key=?',['ledger-detail:manual:'+id]);await driver.execute('DELETE FROM transaction_sources WHERE import_batch_id=?',[b]);await driver.execute('DELETE FROM transactions WHERE import_batch_id=?',[b]);await driver.execute('DELETE FROM staging_rows WHERE import_batch_id=?',[b]);await driver.execute("DELETE FROM import_batches WHERE id=? AND parser_version='manual-entry-v1'",[b]);});}
 async function candidates(id:string){const e=(await manualRecords(driver)).find(r=>r.id===id);if(!e)throw new Error('Manual entry not found.');const result:{leg:string;transactionId:string;date:string;description:string;batchId:string;sourceId:string}[]=[];
  for(const leg of legs(e)){const rows=await driver.query("SELECT t.id,t.posted_date,t.raw_description,t.transfer_group_id,s.import_batch_id,s.source_row_id FROM transactions t JOIN transaction_sources s ON s.transaction_id=t.id JOIN import_batches b ON b.id=s.import_batch_id WHERE b.parser_version<>'manual-entry-v1' AND t.status='settled' AND t.account_id=? AND t.amount_minor=?",[leg.accountId,toDatabase(money(leg.minor,currency(String((await driver.query('SELECT currency FROM accounts WHERE id=?',[leg.accountId]))[0]!.currency))))]);
   for(const r of rows)if(Math.abs(dayNumber(String(r.posted_date))-dayNumber(e.date))<=3 && (e.kind!=='transfer'||r.transfer_group_id!==null))result.push({leg:leg.key,transactionId:String(r.id),date:String(r.posted_date),description:String(r.raw_description),batchId:String(r.import_batch_id),sourceId:String(r.source_row_id)});
  }return result;
 }
 async function match(id:string,leg:string,transactionId:string){return driver.transaction(async()=>{
  const candidate=(await candidates(id)).find(c=>c.leg===leg&&c.transactionId===transactionId);if(!candidate)throw new Error('This match changed. Review the transactions again.');
  const entries=await manualRecords(driver);
  for(const other of entries.filter(e=>e.id!==id))for(const link of Object.values(other.links)){const used=await driver.query('SELECT transaction_id FROM transaction_sources WHERE (import_batch_id=? AND source_row_id=?) OR transaction_id=?',[link.batchId,link.sourceId,link.transactionId??'']);if(used.some(r=>r.transaction_id===transactionId))throw new Error('That imported transaction already matches another manual entry.');}
  if(entries.some(e=>e.id!==id&&Object.values(e.links).some(l=>l.batchId===candidate.batchId&&l.sourceId===candidate.sourceId)))throw new Error('That imported transaction already matches another manual entry.');
  const splitId=hash('manual-transaction:'+id+':'+leg),splits=splitRepository(driver),sourceSplit=await splits.get(splitId);
  const source=(await driver.query('SELECT amount_minor,currency FROM transactions WHERE id=?',[splitId]))[0];
  if(sourceSplit&&source&&validSplit(sourceSplit,String(source.amount_minor),String(source.currency))){
   const targetSplit=await splits.get(transactionId);
   if(targetSplit&&JSON.stringify(targetSplit.parts)!==JSON.stringify(sourceSplit.parts))throw new Error('These payments have different category splits. Review or remove one split before matching.');
   const target=(await driver.query('SELECT amount_minor,currency,status,transfer_group_id FROM transactions WHERE id=?',[transactionId]))[0];
   if(!target||target.status!=='settled'||target.transfer_group_id||!validSplit(sourceSplit,String(target.amount_minor),String(target.currency)))throw new Error('The imported payment can no longer receive this expense split.');
   await driver.execute('INSERT OR REPLACE INTO app_settings(key,value) VALUES(?,?)',['split:'+transactionId,JSON.stringify({...sourceSplit,id:transactionId})]);
  }
  const entry=entries.find(e=>e.id===id)!;entry.links[leg]={batchId:candidate.batchId,sourceId:candidate.sourceId,transactionId};await write(entry);await syncManual(driver);
 });}
 async function unmatch(id:string){return driver.transaction(async()=>{const e=(await manualRecords(driver)).find(r=>r.id===id);if(!e)throw new Error('Manual entry not found.');e.links={};await write(e);await syncManual(driver);});}
 async function today(date:string){isoDay(date);
  const rows=await driver.query('SELECT amount_minor,currency,status FROM transactions WHERE posted_date=? AND transfer_group_id IS NULL AND status IN (?,?)',[date,'settled','pending']);
  const totals=new Map<string,{income:bigint;spending:bigint;awaitingIncome:bigint;awaitingSpending:bigint}>();
  for(const r of rows){
   const c=String(r.currency),t=totals.get(c)??{income:0n,spending:0n,awaitingIncome:0n,awaitingSpending:0n};
   const v=BigInt(String(r.amount_minor)),settled=String(r.status)==='settled';
   if(v>0n){if(settled)t.income+=v;else t.awaitingIncome+=v;}
   else{if(settled)t.spending-=v;else t.awaitingSpending-=v;}
   totals.set(c,t);
  }
  return [...totals].map(([currency,t])=>({currency,income:t.income.toString(),spending:t.spending.toString(),
   awaitingIncome:t.awaitingIncome.toString(),awaitingSpending:t.awaitingSpending.toString()}));}
 async function unresolved(){const result:Record<string,number>={};for(const entry of await manualRecords(driver)){const found=new Set<string>();for(const c of await candidates(entry.id)){if((await driver.query('SELECT id FROM transactions WHERE id=?',[hash('manual-transaction:'+entry.id+':'+c.leg)])).length)found.add(c.leg+':'+c.transactionId);}if(found.size)result[entry.id]=found.size;}return result;}
 return {list:()=>manualRecords(driver),save,remove,candidates,match,unmatch,today,unresolved};
}
