import type {Driver} from '../core/db/driver';
import {currency,type Currency} from '../core/money';
import {day} from '../intelligence/model';
export type Cancellation={merchant:string;currency:Currency;date:string;status:'requested'|'confirmed';note:string};
const key=(merchant:string,code:Currency)=>'cancellation:'+JSON.stringify([code,merchant.trim().toLowerCase()]);
export function cancellationRepository(driver:Driver){
 async function list():Promise<Cancellation[]>{return (await driver.query("SELECT value FROM app_settings WHERE key LIKE 'cancellation:%' ORDER BY key")).map(r=>JSON.parse(String(r.value)) as Cancellation);}
 async function save(value:Cancellation){
  if(!value.merchant.trim()||value.merchant.length>300||!['requested','confirmed'].includes(value.status)||value.note.length>1000)throw new Error('Choose a merchant and cancellation status; keep the note within 1,000 characters.');
  currency(value.currency);day(value.date);
  if(value.status==='confirmed'&&!value.note.trim())throw new Error('Add the provider confirmation reference or a note.');
  await driver.execute('INSERT OR REPLACE INTO app_settings(key,value) VALUES(?,?)',[key(value.merchant,value.currency),JSON.stringify({...value,merchant:value.merchant.trim().toLowerCase(),note:value.note.trim()})]);
 }
 async function remove(merchant:string,code:Currency){await driver.execute('DELETE FROM app_settings WHERE key=?',[key(merchant,code)]);}
 return {list,save,remove};
}
