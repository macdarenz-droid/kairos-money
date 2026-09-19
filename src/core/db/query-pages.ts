import type {Driver,SqlRow,SqlValue} from './driver';

/** Keep large row sets out of a single native bridge response. Use a stable ORDER BY. */
const size=256;

/**
 * Page a large read without exceeding the native response budget.
 *
 * Pass `keys` for large traversals. They name ascending output columns of `sql` that together
 * identify a row uniquely, and paging then seeks past the last row already read. Without them the
 * read falls back to OFFSET, which re-reads and discards every earlier row on each page: that costs
 * O(rows^2 / page) and, on the encrypted device database, decrypts those discarded rows again. An
 * offset-paged 20,000-row ledger measured 52 s natively against well under a second on a local
 * unencrypted database, so keys are required for anything ledger-sized. OFFSET remains available for
 * bounded reads and for orderings a key cannot express, such as descending or computed columns.
 */
export async function queryPages(driver:Driver,sql:string,values:readonly SqlValue[]=[],keys:readonly string[]=[]):Promise<SqlRow[]> {
  if(!keys.length)return offsetPages(driver,sql,values);
  const result:SqlRow[]=[];
  const order=keys.join(','),tuple=`(${order})`,placeholders=`(${keys.map(()=>'?').join(',')})`;
  let cursor:SqlValue[]|null=null;
  for(;;){
    const page=await driver.query(`SELECT * FROM (${sql})${cursor?` WHERE ${tuple} > ${placeholders}`:''} ORDER BY ${order} LIMIT ?`,[...values,...(cursor??[]),size]);
    result.push(...page);
    if(page.length<size)return result;
    const last=page[page.length-1]!;
    cursor=keys.map(key=>last[key] as SqlValue);
  }
}

async function offsetPages(driver:Driver,sql:string,values:readonly SqlValue[]):Promise<SqlRow[]> {
  const result:SqlRow[]=[];
  for(let offset=0;;offset+=size){
    const page=await driver.query(`SELECT * FROM (${sql}) LIMIT ? OFFSET ?`,[...values,size,offset]);
    result.push(...page);
    if(page.length<size)return result;
  }
}
