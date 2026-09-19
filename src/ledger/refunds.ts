import type {Driver,SqlRow} from '../core/db/driver';
export type RefundLink={creditId:string;purchaseId:string;creditMinor:string;purchaseMinor:string;currency:string;creditAccount:string;purchaseAccount:string;creditDate:string;purchaseDate:string};
export type RefundChoice={id:string;minor:string;currency:string;date:string;description:string;account:string};
const choice=(r:SqlRow):RefundChoice=>({id:String(r.id),minor:String(r.amount_minor),currency:String(r.currency),date:String(r.posted_date),description:String(r.raw_description),account:String(r.account_name)});
export function refundRepository(driver:Driver){
 async function state(){
  const rows=await driver.query("SELECT t.*,a.name AS account_name FROM transactions t JOIN accounts a ON a.id=t.account_id WHERE EXISTS (SELECT 1 FROM transaction_sources s JOIN import_batches b ON b.id=s.import_batch_id WHERE s.transaction_id=t.id AND b.parser_version!='manual-entry-v1' AND b.status='committed')");
  const salary=new Set((await driver.query('SELECT linked_transaction_id FROM payslips WHERE linked_transaction_id IS NOT NULL')).map(r=>String(r.linked_transaction_id)));
  const byId=new Map(rows.map(r=>[String(r.id),r]));const stored=await driver.query("SELECT key,value FROM app_settings WHERE key LIKE 'refund:%'");const saved=new Set(stored.map(r=>String(r.key).slice(7)));const links:RefundLink[]=[];
  for(const item of stored){try{const v=JSON.parse(String(item.value)) as RefundLink,c=byId.get(v.creditId),p=byId.get(v.purchaseId);
   if(salary.has(v.creditId)||String(item.key)!=='refund:'+v.creditId||!c||!p||c.status!=='settled'||p.status!=='settled'||c.transfer_group_id||p.transfer_group_id||BigInt(String(c.amount_minor))<=0n||BigInt(String(p.amount_minor))>=0n)continue;
   if(v.creditMinor!==String(c.amount_minor)||v.purchaseMinor!==String(p.amount_minor)||v.currency!==c.currency||v.currency!==p.currency||v.creditAccount!==c.account_id||v.purchaseAccount!==p.account_id||v.creditDate!==c.posted_date||v.purchaseDate!==p.posted_date||v.creditDate<v.purchaseDate)continue;
   links.push(v);
  }catch{/* An unreadable link is inactive and removable from its source credit. */}}
  const totals=new Map<string,bigint>();for(const l of links)totals.set(l.purchaseId,(totals.get(l.purchaseId)??0n)+BigInt(l.creditMinor));
  const active=links.filter(l=>(totals.get(l.purchaseId)??0n)<=-BigInt(l.purchaseMinor));
  return {rows,byId,saved,active,salary};
 }
 async function active(){if(!(await driver.query("SELECT key FROM app_settings WHERE key LIKE 'refund:%' LIMIT 1")).length)return [];return (await state()).active;}
 async function read(id:string){const s=await state(),row=s.byId.get(id),link=s.active.find(l=>l.creditId===id),refunds=s.active.filter(l=>l.purchaseId===id),total=refunds.reduce((n,l)=>n+BigInt(l.creditMinor),0n);
  const candidates=row&&!s.salary.has(id)&&row.status==='settled'&&!row.transfer_group_id&&BigInt(String(row.amount_minor))>0n?s.rows.filter(p=>p.status==='settled'&&!p.transfer_group_id&&p.currency===row.currency&&BigInt(String(p.amount_minor))<0n&&String(p.posted_date)<=String(row.posted_date)&&-BigInt(String(p.amount_minor))-s.active.filter(l=>l.purchaseId===p.id&&l.creditId!==id).reduce((n,l)=>n+BigInt(l.creditMinor),0n)>=BigInt(String(row.amount_minor))).map(choice).sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id)):[];
  return {saved:s.saved.has(id),credit:row&&BigInt(String(row.amount_minor))>0n?choice(row):null,link:link??null,purchase:link?choice(s.byId.get(link.purchaseId)!):null,refunds:refunds.map(l=>choice(s.byId.get(l.creditId)!)),total:total.toString(),remaining:row&&BigInt(String(row.amount_minor))<0n?(-BigInt(String(row.amount_minor))-total).toString():null,candidates};
 }
 async function save(creditId:string,purchaseId:string){return driver.transaction(async()=>{
  const view=await read(creditId);if(!view.candidates.some(p=>p.id===purchaseId))throw new Error('Choose an earlier settled purchase in the same currency with enough unrefunded value.');
  const s=await state(),c=s.byId.get(creditId)!,p=s.byId.get(purchaseId)!;
  const link:RefundLink={creditId,purchaseId,creditMinor:String(c.amount_minor),purchaseMinor:String(p.amount_minor),currency:String(c.currency),creditAccount:String(c.account_id),purchaseAccount:String(p.account_id),creditDate:String(c.posted_date),purchaseDate:String(p.posted_date)};
  await driver.execute('INSERT OR REPLACE INTO app_settings(key,value) VALUES(?,?)',['refund:'+creditId,JSON.stringify(link)]);
  if(!(await state()).active.some(l=>l.creditId===creditId&&l.purchaseId===purchaseId))throw new Error('Other refund links conflict with this purchase. Review those links before saving.');
 });}
 async function remove(id:string){await driver.execute('DELETE FROM app_settings WHERE key=?',['refund:'+id]);}
 return {active,read,save,remove};
}
