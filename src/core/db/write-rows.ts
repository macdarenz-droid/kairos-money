import type {Driver,SqlValue} from './driver';

/** SQLite's default SQLITE_MAX_VARIABLE_NUMBER is 999. Stay clear of it. */
const parameters=900;

/**
 * Write many rows with as few native calls as possible.
 *
 * A device measurement of the 20,000-row ledger recorded 24 single-row `INSERT OR REPLACE INTO
 * signals` calls costing 39,899 ms of a 46,763 ms screen open, against 28 ms for a bridge read
 * returning 256 joined rows. The rows themselves are tiny, so the cost travels with the number of
 * native write calls rather than the amount of data. Grouping them into one statement per chunk
 * keeps the same rows, the same order and the same replace semantics.
 */
export async function insertRows(driver:Driver,into:string,rows:readonly (readonly SqlValue[])[]):Promise<void>{
 if(!rows.length)return;
 const columns=rows[0]!.length;
 if(!columns)throw new Error('Rows to insert need at least one column.');
 if(rows.some(row=>row.length!==columns))throw new Error('Every inserted row needs the same columns.');
 const tuple='('+Array.from({length:columns},()=>'?').join(',')+')';
 const perStatement=Math.max(1,Math.floor(parameters/columns));
 for(let start=0;start<rows.length;start+=perStatement){
  const chunk=rows.slice(start,start+perStatement);
  await driver.execute(`${into} VALUES ${chunk.map(()=>tuple).join(',')}`,chunk.flat());
 }
}
