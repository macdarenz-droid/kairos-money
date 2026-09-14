import {validSplit,type Split} from './splits';
import {manualRepository} from './manual';
import type {Driver} from '../core/db/driver';
import {currency,money,toDatabase} from '../core/money';
import {computeSignals} from '../intelligence/signals';
import {profile,distress} from '../intelligence/profile';
import {insights} from '../intelligence/insights';
import {forecast,payRise,payCycle,goalFunding,recurrences,scheduledDates} from '../intelligence/forecast';
import {day,windows,type Snapshot,type Kind,type Transaction} from '../intelligence/model';
export function intelligenceRepository(driver:Driver){
 async function setting<T>(key:string,fallback:T):Promise<T>{const r=(await driver.query('SELECT value FROM app_settings WHERE key=?',[key]))[0];return r?JSON.parse(String(r.value)) as T:fallback;}
 async function set(key:string,value:unknown){await driver.execute('INSERT OR REPLACE INTO app_settings(key,value) VALUES(?,?)',[key,JSON.stringify(value)]);}
 async function snapshot(asOf:string,code:string):Promise<Snapshot>{
  const c=currency(code),accounts=await driver.query('SELECT * FROM accounts WHERE archived_at IS NULL AND currency=?',[c]),ids=accounts.map(a=>String(a.id));
  const rows=await driver.query('SELECT t.*,c.kind AS category_kind,c.name AS category_name,m.canonical_name AS merchant FROM transactions t LEFT JOIN categories c ON c.id=t.category_id LEFT JOIN merchants m ON m.id=t.merchant_id ORDER BY t.posted_date,t.id');
  const metadata=await setting<Record<string,Partial<Pick<Transaction,'instrument'|'hour'|'planned'|'outsideRoutine'|'overdraftFee'>>>>('intelligence:metadata',{});
  const transactions:Transaction[]=rows.filter(r=>ids.includes(String(r.account_id))).map(r=>({id:String(r.id),accountId:String(r.account_id),date:String(r.posted_date),minor:String(r.amount_minor),currency:currency(String(r.currency)),description:String(r.merchant??r.raw_description),rawDescription:String(r.raw_description),category:String(r.category_name??'Uncategorised'),kind:(r.category_kind??'unknown') as Kind,status:r.status==='pending'?'pending':'settled',transfer:r.transfer_group_id!==null,recurring:r.is_recurring===1,...metadata[String(r.id)]}));
  const {refundRepository}=await import('./refunds');
  const refundLinks=(await refundRepository(driver).active()).filter(l=>l.creditDate<=asOf&&l.purchaseDate<=asOf);
  const refundById=new Map(refundLinks.map(l=>[l.creditId,l.purchaseId]));
  for(const t of transactions){const purchaseId=refundById.get(t.id);if(purchaseId){t.refundOf=purchaseId;t.kind='refund';t.category='Refund';}}
  const splits=new Map((await driver.query("SELECT key,value FROM app_settings WHERE key LIKE 'split:%'")).map(r=>[String(r.key).slice(6),JSON.parse(String(r.value)) as Split]));
  for(const t of transactions){const split=splits.get(t.id);if(split&&split.id===t.id&&t.status==='settled'&&!t.transfer&&validSplit(split,t.minor,t.currency))t.allocations=split.parts;}
  const coverage=(await driver.query("SELECT c.*,b.integrity_tier FROM coverage_ranges c JOIN import_batches b ON b.id=c.import_batch_id WHERE b.status='committed'")).filter(r=>ids.includes(String(r.account_id))).map(r=>({accountId:String(r.account_id),start:String(r.period_start),end:String(r.period_end),tier:(r.integrity_tier==='A'?'A':r.integrity_tier==='B'?'B':'C') as 'A'|'B'|'C'}));
  const pays=(await driver.query('SELECT * FROM payslips ORDER BY pay_date,id')).filter(r=>r.currency===c).map(r=>({id:String(r.id),employer:String(r.employer),date:String(r.pay_date),start:String(r.period_start),end:String(r.period_end),net:String(r.net_minor),gross:String(r.gross_minor),currency:c,transactionId:r.linked_transaction_id===null?null:String(r.linked_transaction_id)}));
  const s:Snapshot={asOf,currency:c,accountIds:ids,transactions,coverage,pays};const reflection=await setting<Snapshot['selfReport']|null>('intelligence:reflection',null);if(reflection)s.selfReport=reflection;
  const provenance=await driver.query('SELECT s.transaction_id,s.source_row_id,s.original_payload,b.file_name FROM transaction_sources s JOIN import_batches b ON b.id=s.import_batch_id');
  const sources=new Map<string,NonNullable<Transaction['sources']>>();
  for(const r of provenance){const id=String(r.transaction_id),group=sources.get(id)??[];group.push({file:String(r.file_name),row:String(r.source_row_id),raw:String(r.original_payload)});sources.set(id,group);}
  for(const t of transactions)t.sources=sources.get(t.id)??[];
  const recurringNames=new Set(recurrences(s).map(r=>r.merchant));for(const t of transactions)if(recurringNames.has(t.description.trim().toLowerCase()))t.recurring=true;
  const liquidAccounts=accounts.filter(a=>['checking','savings','cash','credit'].includes(String(a.type)));let balance=0n,liability=0n;const evidence:string[]=[];let valid=liquidAccounts.length>0;
  for(const a of liquidAccounts){const anchors=await driver.query("SELECT * FROM import_batches WHERE account_id=? AND status='committed' AND integrity_tier='A' AND period_end<=? AND stated_closing_minor IS NOT NULL ORDER BY period_end DESC,id",[String(a.id),asOf]);const anchor=anchors[0];if(!anchor){valid=false;continue;}const date=String(anchor.period_end);const intervals=coverage.filter(v=>v.accountId===a.id);for(let d=day(date);d<=day(asOf);d++)if(!intervals.some(v=>day(v.start)<=d&&day(v.end)>=d))valid=false;
   let accountBalance=BigInt(String(anchor.stated_closing_minor));const after=transactions.filter(t=>t.accountId===a.id&&t.date>date&&t.date<=asOf&&t.status==='settled');for(const t of after)accountBalance+=BigInt(t.minor);if(a.type==='credit'){if(accountBalance<0n)liability-=accountBalance;}else balance+=accountBalance;evidence.push(...transactions.filter(t=>t.accountId===a.id&&t.date<=asOf).map(t=>t.id));
   if(intervals.some(v=>v.tier==='C'&&v.end>date))valid=false;
  }
  if(Object.keys(await manualRepository(driver).unresolved()).length)valid=false;
  s.commitmentsKnown=!accounts.some(a=>a.type==='loan');if(valid)s.committedLiability={minor:liability.toString(),evidence};
  if(valid)s.liquid={minor:balance.toString(),asOf,verified:true,evidence};
  return s;
 }
 async function analyse(asOf:string,code:string,extraBill='0',cutPercent=0){return driver.transaction(async()=>{
  const s=await snapshot(asOf,code),all=windows(asOf).flatMap(w=>computeSignals(s,w)),signal=all.filter(v=>v.period.startsWith('trailing-90:')),period=asOf.slice(0,7);
  const old=(await driver.query('SELECT archetype FROM profiles WHERE period<? AND id LIKE ? ORDER BY period DESC LIMIT 1',[code+':'+period,code+':%']))[0];const p=profile(s,signal,old?.archetype?String(old.archetype):null),dismissed=await setting<Record<string,number>>('intelligence:dismissals',{}),cards=insights(s,signal,dismissed),buffer=await setting<string>('intelligence:buffer:'+code,'0');
  for(const v of all)await driver.execute('INSERT OR REPLACE INTO signals(id,period,key,value,computed_at,version,status,inputs) VALUES(?,?,?,?,?,?,?,?)',[code+':'+v.period+':'+v.key,code+':'+v.period,v.key,v.value,new Date().toISOString(),1,v.status==='ok'?'ready':'insufficient_data',JSON.stringify(v)]);
  await driver.execute('INSERT OR REPLACE INTO profiles(id,period,archetype,axis_scores,confidence,version,covered_days) VALUES(?,?,?,?,?,?,?)',[code+':'+period,code+':'+period,p.archetype,JSON.stringify(p.axes),p.confidence,1,p.coveredDays]);
  for(const i of cards)await driver.execute('INSERT OR REPLACE INTO insights(id,created_at,kind,severity,title,body,evidence,state,projected_effect_minor,currency,research_id,action,threshold) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',[i.id,new Date().toISOString(),i.kind,i.triage?'triage':'normal',i.title,i.body,JSON.stringify(i),'new',toDatabase(money(BigInt(i.projectedMinor),s.currency)),code,i.researchId,i.action,i.threshold]);
  const goals=await driver.query('SELECT * FROM goals WHERE currency=? ORDER BY target_date,id',[code]);const cycles=payCycle(s);const goalRows=goals.map(g=>{const due=g.target_date?String(g.target_date):asOf;const payDates:string[]=[];for(const c of cycles){payDates.push(...scheduledDates(c,due));}return {id:String(g.id),name:String(g.name),target_minor:String(g.target_minor),funded_minor:String(g.funded_minor),target_date:String(g.target_date),kind:String(g.kind),perPay:due>=asOf?goalFunding(String(g.target_minor),String(g.funded_minor),due,asOf,payDates):null};});
  return {snapshot:s,signals:all,profile:p,insights:cards,forecast:forecast(s,buffer,{extraBill,cutPercent}),distress:distress(s,signal),payRise:payRise(s),goals:goalRows,buffer};
 });}
 async function dismiss(kind:string){const d=await setting<Record<string,number>>('intelligence:dismissals',{});d[kind]=(d[kind]??0)+1;await set('intelligence:dismissals',d);await driver.execute("UPDATE insights SET state='dismissed' WHERE kind=?",[kind]);}
 async function saveGoal(g:{id:string;name:string;target:string;funded:string;date:string;kind:'goal'|'sinking'|'budget';currency:string}){if(!g.name.trim()||g.name.length>80||BigInt(g.target)<0n||BigInt(g.funded)<0n)throw new Error('Use a goal name and non-negative amounts.');day(g.date);const c=currency(g.currency);await driver.execute('INSERT OR REPLACE INTO goals(id,name,target_minor,target_date,funded_minor,kind,currency) VALUES(?,?,?,?,?,?,?)',[g.id,g.name.trim(),toDatabase(money(BigInt(g.target),c)),g.date,toDatabase(money(BigInt(g.funded),c)),g.kind,c]);}
 async function setBuffer(code:string,minor:string){if(BigInt(minor)<0n)throw new Error('Buffer cannot be negative.');money(BigInt(minor),currency(code));await set('intelligence:buffer:'+code,minor);}
 async function annotate(id:string,data:Partial<Pick<Transaction,'instrument'|'hour'|'planned'|'outsideRoutine'|'overdraftFee'>>){if(data.hour!==undefined&&(!Number.isInteger(data.hour)||data.hour<0||data.hour>23))throw new Error('Use a local hour from 0 to 23.');if(!(await driver.query('SELECT id FROM transactions WHERE id=?',[id])).length)throw new Error('Transaction no longer exists.');const m=await setting<Record<string,typeof data>>('intelligence:metadata',{});m[id]=data;await set('intelligence:metadata',m);}
 async function setReflection(value:NonNullable<Snapshot['selfReport']>|null){if(value&&Object.values(value).some(v=>!Number.isInteger(v)||v<0||v>100))throw new Error('Choose a whole score from 0 to 100.');await set('intelligence:reflection',value);}
 return {snapshot,analyse,dismiss,saveGoal,setBuffer,annotate,setReflection};
}
