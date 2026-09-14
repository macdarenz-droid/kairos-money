import type {Driver} from '../core/db/driver';
import {currency,money,type Currency} from '../core/money';
export type Valuation={id:string;itemId:string;name:string;kind:'asset'|'liability';currency:Currency;date:string;minor:string};
function validate(v:Valuation){
 if(!/^[a-zA-Z0-9-]{1,80}$/.test(v.id)||!/^[a-zA-Z0-9-]{1,80}$/.test(v.itemId)||!v.name.trim()||v.name.length>80||!['asset','liability'].includes(v.kind))throw new Error('Name an asset or liability.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(v.date)||Number.isNaN(Date.parse(v.date))||new Date(v.date).toISOString().slice(0,10)!==v.date)throw new Error('Choose a valid valuation date.');
 if(!/^\d+$/.test(v.minor))throw new Error('Enter the positive value or amount owed.');money(BigInt(v.minor),currency(v.currency));
}
export function netWorthHistory(values:Valuation[],code:Currency){
 const rows=values.filter(v=>v.currency===code).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 return [...new Set(rows.map(v=>v.date))].map(date=>{
  const latest=new Map<string,Valuation>();for(const row of rows)if(row.date<=date)latest.set(row.itemId,row);
  const items=[...latest.values()];const assets=items.filter(v=>v.kind==='asset').reduce((n,v)=>n+BigInt(v.minor),0n),liabilities=items.filter(v=>v.kind==='liability').reduce((n,v)=>n+BigInt(v.minor),0n);
  return {date,assets:assets.toString(),liabilities:liabilities.toString(),net:(assets-liabilities).toString(),items};
 });
}
export function netWorthRepository(driver:Driver){
 async function list():Promise<Valuation[]>{return (await driver.query("SELECT value FROM app_settings WHERE key LIKE 'net-worth:%' ORDER BY key")).map(r=>JSON.parse(String(r.value)) as Valuation);}
 async function save(value:Valuation){validate(value);return driver.transaction(async()=>{
  const rows=await list();if(rows.some(r=>r.id!==value.id&&r.itemId===value.itemId&&(r.currency!==value.currency||r.kind!==value.kind)))throw new Error('Keep this item’s currency and asset or liability type unchanged.');
  if(rows.some(r=>r.id!==value.id&&r.itemId===value.itemId&&r.date===value.date))throw new Error('This item already has a value on that date. Remove that value before replacing it.');
  for(const point of netWorthHistory([...rows.filter(r=>r.id!==value.id),value],value.currency))money(BigInt(point.net),value.currency);
  await driver.execute('INSERT OR REPLACE INTO app_settings(key,value) VALUES(?,?)',['net-worth:'+value.id,JSON.stringify({...value,name:value.name.trim()})]);
 });}
 async function remove(id:string){await driver.execute('DELETE FROM app_settings WHERE key=?',['net-worth:'+id]);}
 return {list,save,remove};
}
