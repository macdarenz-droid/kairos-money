import type {Driver} from '../core/db/driver';

/**
 * Remembered choices, not financial facts.
 *
 * A preference changes what a form starts with; it never changes a recorded amount, date, category or
 * provenance, and nothing here is read back into a ledger figure. The key set is closed so this cannot
 * drift into general-purpose storage, and every value is a short string.
 */
export const preferenceKeys=['preferred-account','preferred-original-currency'] as const;
export type PreferenceKey=typeof preferenceKeys[number];

export function preferenceRepository(driver:Driver){
 async function read(key:PreferenceKey):Promise<string|null>{
  const row=(await driver.query('SELECT value FROM app_settings WHERE key=?',['preference:'+key]))[0];
  return row?String(JSON.parse(String(row.value))):null;
 }
 async function write(key:PreferenceKey,value:string):Promise<void>{
  if(!preferenceKeys.includes(key))throw new Error('Unknown preference.');
  if(value.length>200)throw new Error('That preference value is too long to store.');
  await driver.execute('INSERT OR REPLACE INTO app_settings(key,value) VALUES(?,?)',['preference:'+key,JSON.stringify(value)]);
 }
 async function clear(key:PreferenceKey):Promise<void>{await driver.execute('DELETE FROM app_settings WHERE key=?',['preference:'+key]);}
 return {read,write,clear};
}
