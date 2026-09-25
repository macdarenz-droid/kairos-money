import type {Driver} from '../core/db/driver';
import {currency,money,type Currency} from '../core/money';
import {convert,rateBetween,type Rate} from '../core/fx';
export type Valuation={id:string;itemId:string;name:string;kind:'asset'|'liability';currency:Currency;date:string;minor:string;accountId?:string|null};
export type AccountPosition={accountId:string;name:string;type:string;currency:Currency;choice:'review'|'include'|'exclude';date:string|null;minor:string|null;verified:boolean;reason:string};
function validDate(date:string){return /^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date;}
function validate(v:Valuation){
 if(!/^[a-zA-Z0-9-]{1,80}$/.test(v.id)||!/^[a-zA-Z0-9-]{1,80}$/.test(v.itemId)||!v.name.trim()||v.name.length>80||!['asset','liability'].includes(v.kind))throw new Error('Name an asset or liability.');
 if(!validDate(v.date))throw new Error('Choose a valid valuation date.');
 if(!/^\d+$/.test(v.minor))throw new Error('Enter the positive value or amount owed.');money(BigInt(v.minor),currency(v.currency));
 if(v.accountId!==undefined&&v.accountId!==null&&!/^[a-zA-Z0-9-]{1,80}$/.test(v.accountId))throw new Error('Choose a valid linked account.');
}
/** Values in `code`: others convert at their own date's rate; those with no rate are named, never counted as zero. */
function inCurrency<T extends {currency:Currency;date:string|null;minor:string|null}>(values:readonly T[],code:Currency,rates:readonly Rate[]){
 const kept:T[]=[],left=new Set<Currency>();
 for(const v of values){if(v.currency===code||v.minor===null){kept.push(v);continue;}
  const rate=v.date===null?null:rateBetween(rates,v.currency,code,v.date);
  if(rate===null)left.add(v.currency);else kept.push({...v,currency:code,minor:convert(money(BigInt(v.minor),v.currency),code,rate).minor.toString()});}
 return {kept,unconverted:[...left].sort()};
}
export function netWorthHistory(values:Valuation[],code:Currency,rates:readonly Rate[]=[]){
 const rows=inCurrency(values,code,rates).kept.filter(v=>v.currency===code).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 return [...new Set(rows.map(v=>v.date))].map(date=>{
  const latest=new Map<string,Valuation>();for(const row of rows)if(row.date<=date)latest.set(row.itemId,row);
  const items=[...latest.values()];const assets=items.filter(v=>v.kind==='asset').reduce((n,v)=>n+BigInt(v.minor),0n),liabilities=items.filter(v=>v.kind==='liability').reduce((n,v)=>n+BigInt(v.minor),0n);
  return {date,assets:assets.toString(),liabilities:liabilities.toString(),net:(assets-liabilities).toString(),items};
 });
}
export function combinedPosition(values:Valuation[],accounts:AccountPosition[],code:Currency,rates:readonly Rate[]=[]){
 const chosen=inCurrency(accounts.filter(a=>a.choice==='include'&&a.verified&&a.minor!==null),code,rates),valued=inCurrency(values,code,rates);
 const unconverted=[...new Set([...chosen.unconverted,...valued.unconverted])].sort();
 const manual=netWorthHistory(values,code,rates).at(-1),included=chosen.kept;
 let assets=BigInt(manual?.assets??'0'),liabilities=BigInt(manual?.liabilities??'0');for(const a of included){const n=BigInt(a.minor!);if(n>=0n)assets+=n;else liabilities-=n;}
 const dates=[...(manual?[manual.date]:[]),...included.flatMap(a=>a.date?[a.date]:[])].sort();
 return {assets:assets.toString(),liabilities:liabilities.toString(),net:(assets-liabilities).toString(),asOf:dates.at(-1)??null,manual:manual?.items??[],accounts:included,unconverted,complete:unconverted.length===0&&accounts.every(a=>a.choice!=='review'&&(a.choice==='exclude'||a.verified))};
}
export function netWorthRepository(driver:Driver){
 async function list():Promise<Valuation[]>{return (await driver.query("SELECT value FROM app_settings WHERE key LIKE 'net-worth:%' AND key NOT LIKE 'net-worth-account:%' ORDER BY key")).map(r=>JSON.parse(String(r.value)) as Valuation);}
 async function accountPositions():Promise<AccountPosition[]>{
  const accounts=await driver.query('SELECT a.id,a.name,a.type,a.currency FROM accounts a LEFT JOIN account_order o ON o.account_id=a.id WHERE a.archived_at IS NULL ORDER BY o.position IS NULL,o.position,a.name,a.id'),choices=new Map((await driver.query("SELECT key,value FROM app_settings WHERE key LIKE 'net-worth-account:%'")).map(r=>{let choice:unknown;try{choice=JSON.parse(String(r.value));}catch{choice=null;}return [String(r.key).slice(18),choice];}));
  const out:AccountPosition[]=[];for(const a of accounts){const id=String(a.id),anchor=(await driver.query("SELECT period_end,stated_closing_minor FROM import_batches WHERE account_id=? AND status='committed' AND integrity_tier='A' AND stated_closing_minor IS NOT NULL ORDER BY period_end DESC,id DESC LIMIT 1",[id]))[0],choice=choices.get(id);
   out.push({accountId:id,name:String(a.name),type:String(a.type),currency:currency(String(a.currency)),choice:choice==='include'?'include':choice==='exclude'?'exclude':'review',date:anchor?String(anchor.period_end):null,minor:anchor?String(anchor.stated_closing_minor):null,verified:!!anchor,reason:anchor?'Latest reconciled statement closing balance.':'Import a reconciled statement with a closing balance before including this account.'});
  }return out;
 }
 async function save(value:Valuation){validate(value);return driver.transaction(async()=>{
  const rows=await list();if(rows.some(r=>r.id!==value.id&&r.itemId===value.itemId&&(r.currency!==value.currency||r.kind!==value.kind||(r.accountId??null)!==(value.accountId??null))))throw new Error('Keep this item’s currency, type and linked account unchanged.');
  if(rows.some(r=>r.id!==value.id&&r.itemId===value.itemId&&r.date===value.date))throw new Error('This item already has a value on that date. Remove that value before replacing it.');
  if(value.accountId){const account=(await driver.query('SELECT currency FROM accounts WHERE id=? AND archived_at IS NULL',[value.accountId]))[0];if(!account||account.currency!==value.currency)throw new Error('Choose an active account in the same currency.');if(rows.some(r=>r.id!==value.id&&r.accountId===value.accountId&&r.itemId!==value.itemId))throw new Error('That account is already represented by another manual holding.');const choice=(await driver.query('SELECT value FROM app_settings WHERE key=?',['net-worth-account:'+value.accountId]))[0];if(choice&&JSON.parse(String(choice.value))==='include')throw new Error('Exclude the imported account balance before representing it manually.');}
  for(const point of netWorthHistory([...rows.filter(r=>r.id!==value.id),value],value.currency))money(BigInt(point.net),value.currency);
  const saved={...value,name:value.name.trim(),...(value.accountId?{accountId:value.accountId}:{})};await driver.execute('INSERT OR REPLACE INTO app_settings(key,value) VALUES(?,?)',['net-worth:'+value.id,JSON.stringify(saved)]);
 });}
  async function chooseAccount(accountId:string,choice:'include'|'exclude'){return driver.transaction(async()=>{const account=(await accountPositions()).find(a=>a.accountId===accountId);if(!account)throw new Error('Choose an active account.');if(choice==='include'){if(!account.verified)throw new Error('Import a reconciled statement with a closing balance first.');if((await list()).some(v=>v.accountId===accountId))throw new Error('This account is represented by a manual holding. Remove that link before including its imported balance.');}await driver.execute('INSERT OR REPLACE INTO app_settings(key,value) VALUES(?,?)',['net-worth-account:'+accountId,JSON.stringify(choice)]);});}
 async function remove(id:string){await driver.execute('DELETE FROM app_settings WHERE key=?',['net-worth:'+id]);}
 return {list,accountPositions,chooseAccount,save,remove};
}
