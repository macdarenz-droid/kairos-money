import type {Driver} from '../core/db/driver';
import {currency,currencyDigits,money,type Currency} from '../core/money';
export type ForeignAmount={id:string;postedMinor:string;postedCurrency:Currency;originalMinor:string;originalCurrency:Currency;note:string};
export function foreignRate(value:ForeignAmount){
 const posted=BigInt(value.postedMinor),absolute=posted<0n?-posted:posted;
 const numerator=absolute*10n**BigInt(currencyDigits[value.originalCurrency]);
 const denominator=BigInt(value.originalMinor)*10n**BigInt(currencyDigits[value.postedCurrency]);
 const scaled=(numerator*1000000n+denominator/2n)/denominator;
 return {numerator:numerator.toString(),denominator:denominator.toString(),display:`${scaled/1000000n}.${(scaled%1000000n).toString().padStart(6,'0')}`};
}
export function foreignCurrencyRepository(driver:Driver){
 async function read(id:string){
  const stored=(await driver.query('SELECT value FROM app_settings WHERE key=?',['foreign-amount:'+id]))[0];
  const value=stored?JSON.parse(String(stored.value)) as ForeignAmount:null;
  if(value){
   if(typeof value!=='object'||typeof value.note!=='string'||!value.note.trim()||value.note.length>500||!/^[-]?\d+$/.test(value.postedMinor)||!/^\d+$/.test(value.originalMinor)||BigInt(value.originalMinor)<=0n||BigInt(value.postedMinor)===0n)throw new Error('The saved original amount is invalid. Restore a valid backup.');
   money(BigInt(value.originalMinor),currency(value.originalCurrency));money(BigInt(value.postedMinor),currency(value.postedCurrency));
   if(value.originalCurrency===value.postedCurrency)throw new Error('The saved currencies must be different.');
  }
  const row=(await driver.query('SELECT amount_minor,currency,status FROM transactions WHERE id=?',[id]))[0];
  return {value,active:!!value&&!!row&&value.id===id&&row.status==='settled'&&value.postedMinor===String(row.amount_minor)&&value.postedCurrency===row.currency};
 }
 async function save(id:string,input:{originalMinor:string;originalCurrency:string;note:string}){return driver.transaction(async()=>{
  const row=(await driver.query('SELECT amount_minor,currency,status FROM transactions WHERE id=?',[id]))[0];
  if(!row||row.status!=='settled'||BigInt(String(row.amount_minor))===0n)throw new Error('Choose a settled, nonzero statement payment or credit.');
  const originalCurrency=currency(input.originalCurrency),postedCurrency=currency(String(row.currency));
  if(originalCurrency===postedCurrency)throw new Error('Choose the original currency, different from the account currency.');
  if(!/^\d+$/.test(input.originalMinor)||BigInt(input.originalMinor)<=0n)throw new Error('Enter a positive original amount.');
  money(BigInt(input.originalMinor),originalCurrency);
  if(!input.note.trim()||input.note.length>500)throw new Error('Record where the original amount came from, up to 500 characters.');
  const value:ForeignAmount={id,postedMinor:String(row.amount_minor),postedCurrency,originalMinor:input.originalMinor,originalCurrency,note:input.note.trim()};
  await driver.execute('INSERT OR REPLACE INTO app_settings(key,value) VALUES(?,?)',['foreign-amount:'+id,JSON.stringify(value)]);
 });}
 async function remove(id:string){await driver.execute('DELETE FROM app_settings WHERE key=?',['foreign-amount:'+id]);}
 return {read,save,remove};
}
