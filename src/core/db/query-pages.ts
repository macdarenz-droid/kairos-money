import type {Driver,SqlRow,SqlValue} from './driver';

/** Keep large row sets out of a single native bridge response. Use a stable ORDER BY. */
export async function queryPages(driver:Driver,sql:string,values:readonly SqlValue[]=[]):Promise<SqlRow[]> {
  const result:SqlRow[]=[];
  const size=256;
  for(let offset=0;;offset+=size){
    const page=await driver.query(`SELECT * FROM (${sql}) LIMIT ? OFFSET ?`,[...values,size,offset]);
    result.push(...page);
    if(page.length<size)return result;
  }
}
