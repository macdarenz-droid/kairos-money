import type {Driver} from '../core/db/driver';
import {manualRecords} from './manual';
export type Receipt={id:string;name:string;data:string;text:string};
type Detail={note:string;receipts:Receipt[]};
export function attachmentRepository(driver:Driver){
 const key=(target:string)=>'ledger-detail:'+target;
 async function exists(target:string){if(target.startsWith('manual:'))return (await manualRecords(driver)).some(r=>r.id===target.slice(7));return (await driver.query('SELECT id FROM transactions WHERE id=?',[target])).length>0;}
 async function read(target:string):Promise<Detail>{const r=(await driver.query('SELECT value FROM app_settings WHERE key=?',[key(target)]))[0];return r?JSON.parse(String(r.value)) as Detail:{note:'',receipts:[]};}
 async function update(target:string,change:(value:Detail)=>Detail){return driver.transaction(async()=>{if(!await exists(target))throw new Error('This transaction is no longer in the ledger. Restore its source before editing attachments.');const value=change(await read(target));await driver.execute('INSERT OR REPLACE INTO app_settings(key,value) VALUES(?,?)',[key(target),JSON.stringify(value)]);});}
 async function note(target:string,value:string){if(value.length>2000)throw new Error('Keep notes within 2,000 characters.');return update(target,r=>({...r,note:value}));}
 async function attach(target:string,receipt:Receipt){if(!/^[a-zA-Z0-9-]{1,80}$/.test(receipt.id)||!receipt.name.trim()||receipt.name.length>200||receipt.data.length>13981016||!/^[A-Za-z0-9+/]*={0,2}$/.test(receipt.data)||!receipt.data||receipt.text.length>200000)throw new Error('Choose a readable receipt below 10 MB.');return update(target,r=>{if(r.receipts.length>=5)throw new Error('Keep up to five receipts per transaction.');return {...r,receipts:[...r.receipts.filter(x=>x.id!==receipt.id),receipt]};});}
 async function remove(target:string,id:string){return update(target,r=>({...r,receipts:r.receipts.filter(x=>x.id!==id)}));}
 return {read,note,attach,remove};
}
