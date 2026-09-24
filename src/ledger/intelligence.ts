import {validSplit,type Split} from './splits';
import {manualRepository} from './manual';
import type {Driver} from '../core/db/driver';
import {queryPages} from '../core/db/query-pages';
import {currency,money,toDatabase,type Currency} from '../core/money';
import {convert,rateBetween,type Rate as FxRate} from '../core/fx';
import {computeSignals} from '../intelligence/signals';
import {profile,distress} from '../intelligence/profile';
import {insights} from '../intelligence/insights';
import {forecast,payRise,payCycle,goalFunding,recurrences,scheduledDates} from '../intelligence/forecast';
import {day,describeWindows,type Snapshot,type Kind,type Signal,type Transaction} from '../intelligence/model';
/**
 * What a stored signal retains.
 *
 * Signal.inputs carries the whole windowed corpus so the calculation can be re-derived in memory, and
 * every transaction in it carries its own provenance payload. Serialising that per signal wrote
 * 45,721,866 bytes across 24 rows for a 20,000-row ledger, the largest row 5,796,371 bytes, and the
 * column is CHECK(json_valid(inputs)) so SQLite parses each one before SQLCipher encrypts its pages.
 * On the device that measured 37,403 ms of a 43,789 ms screen open, across 24 uniformly slow writes.
 *
 * The ledger already holds those transactions and `evidence` already cites them by id, so the stored
 * row keeps the citation and drops the copy. Nothing reads this column back; it exists for audit and
 * export, and a reference serves that better than 24 duplicates of the same corpus.
 */
function stored(v:Signal){const {transactions,...inputs}=v.inputs;return {...v,inputs:{...inputs,transactionCount:transactions.length}};}
export function intelligenceRepository(driver:Driver){
 async function setting<T>(key:string,fallback:T):Promise<T>{const r=(await driver.query('SELECT value FROM app_settings WHERE key=?',[key]))[0];return r?JSON.parse(String(r.value)) as T:fallback;}
 async function set(key:string,value:unknown){await driver.execute('INSERT OR REPLACE INTO app_settings(key,value) VALUES(?,?)',[key,JSON.stringify(value)]);}
 /**
  * SHOWING AMOUNTS IN A CURRENCY CONVERTS THE MONEY; IT DOES NOT HIDE IT.
  *
  * This selected accounts WHERE currency = the displayed one, which is a FILTER doing a DISPLAY job.
  * Set an AUD account, switch the setting to PHP, and the whole of Today and Insights was built from
  * nothing: no accounts, no transactions, no signals, no reason given. Measured on a real ledger it was
  * one account and one transaction in AUD, zero and zero in PHP.
  *
  * Every active account is read now, and each amount is valued in the displayed currency AT THE RATE FOR
  * ITS OWN DATE — a purchase happened at the rate on the day it happened, and repricing it at today's
  * rate would make last March's trip cost something different every time the app opens. The anchor
  * balance a running total starts from is converted at ITS date for the same reason, so the arithmetic
  * is consistent: everything is valued at the rate in force when it was true.
  *
  * A currency with no stored rate is LEFT OUT AND NAMED in `unconverted`, never counted as zero and
  * never passed through as though it were already in the displayed currency. Both would be inventing a
  * number, and one of them silently.
  */
 async function snapshot(asOf:string,code:string):Promise<Snapshot>{
  const c=currency(code),all=await driver.query('SELECT * FROM accounts WHERE archived_at IS NULL');
  const stored=await driver.query('SELECT as_of,base,quote,rate_e8,source FROM fx_rates');
  const rates:FxRate[]=stored.map(r=>({asOf:String(r.as_of),base:currency(String(r.base)),quote:currency(String(r.quote)),rateE8:BigInt(String(r.rate_e8)),source:String(r.source)}));
  const unconverted=new Set<Currency>();
  /**
   * THE ACCOUNTS IN THE ANALYSIS ARE THE ONES WHOSE MONEY CAN ACTUALLY REACH IT.
   *
   * `covered` counts a day only when EVERY account in the snapshot has statement coverage for it, which
   * is the honest rule: money can move through an account you have no statement for, so a day with a gap
   * in one of them is a day nobody can say what was spent.
   *
   * That rule and "read every account" collided. Taking in an account whose currency has no rate dropped
   * a fixture from 20 covered days to 8 — while that account's money was not in the analysis at all,
   * having gone into `unconverted`. Charging the coverage for an account that is being excluded is
   * incoherent: it makes the figures less trusted on account of money that is not in them.
   *
   * So an account joins the analysis when its currency can be reached at all, and is named rather than
   * counted when it cannot. Once rates exist for everything the rule tightens by itself, which is right:
   * an analysis that really does span every account needs every account covered.
   */
  const accounts=all.filter(a=>{
   const held=currency(String(a.currency));
   if(rateBetween(rates,held,c,asOf)!==null)return true;
   unconverted.add(held);return false;
  });
  const ids=accounts.map(a=>String(a.id));
  /** An exact amount in the displayed currency, or null when no published rate reaches that day. */
  const into=(minor:string,from:Currency,date:string):string|null=>{
   if(from===c)return minor;
   const rate=rateBetween(rates,from,c,date);
   if(rate===null){unconverted.add(from);return null;}
   return convert(money(BigInt(minor),from),c,rate).minor.toString();
  };
  const rows=await queryPages(driver,'SELECT t.*,c.kind AS category_kind,c.name AS category_name,m.canonical_name AS merchant FROM transactions t LEFT JOIN categories c ON c.id=t.category_id LEFT JOIN merchants m ON m.id=t.merchant_id',[],['id']);
  // Use the primary-key index for each bounded read, then stable-sort dates once.
  // Equal dates retain SQLite's id order without repeatedly sorting the full table.
  rows.sort((a,b)=>String(a.posted_date)<String(b.posted_date)?-1:String(a.posted_date)>String(b.posted_date)?1:0);
  const original=new Map<string,{minor:string;currency:Currency}>();
  const metadata=await setting<Record<string,Partial<Pick<Transaction,'instrument'|'hour'|'planned'|'outsideRoutine'|'overdraftFee'>>>>('intelligence:metadata',{});
  const transactions:Transaction[]=rows.filter(r=>ids.includes(String(r.account_id))).map((r):Transaction|null=>{
   const held=currency(String(r.currency)),date=String(r.posted_date),shown=into(String(r.amount_minor),held,date);
   if(shown===null)return null;
   original.set(String(r.id),{minor:String(r.amount_minor),currency:held});
   return {id:String(r.id),accountId:String(r.account_id),date,minor:shown,currency:c,description:String(r.merchant??r.raw_description),rawDescription:String(r.raw_description),category:String(r.category_name??'Uncategorised'),kind:(r.category_kind??'unknown') as Kind,status:r.status==='pending'?'pending':'settled',transfer:r.transfer_group_id!==null,recurring:r.is_recurring===1,...metadata[String(r.id)]};
  }).filter((t):t is Transaction=>t!==null);
  const {refundRepository}=await import('./refunds');
  const refundLinks=(await refundRepository(driver).active()).filter(l=>l.creditDate<=asOf&&l.purchaseDate<=asOf);
  const refundById=new Map(refundLinks.map(l=>[l.creditId,l.purchaseId]));
  for(const t of transactions){const purchaseId=refundById.get(t.id);if(purchaseId){t.refundOf=purchaseId;t.kind='refund';t.category='Refund';}}
  const splits=new Map((await driver.query("SELECT key,value FROM app_settings WHERE key LIKE 'split:%'")).map(r=>[String(r.key).slice(6),JSON.parse(String(r.value)) as Split]));
  // Stored original-currency evidence, attached the same way splits and refunds are. Analysis reads the
  // snapshot, so evidence the user recorded has to reach it or the FX capability has nothing to report.
  const foreign=new Map((await driver.query("SELECT key,value FROM app_settings WHERE key LIKE 'foreign-amount:%'")).map(r=>[String(r.key).slice(15),JSON.parse(String(r.value)) as Transaction['foreign']]));
  for(const t of transactions){const stored=foreign.get(t.id);if(stored)t.foreign=stored;}
  // A split is checked against the amount as recorded, then each part is shown at the same rate; the last
  // part takes the rounding so the parts still add up exactly to the converted total.
  for(const t of transactions){const split=splits.get(t.id),held=original.get(t.id);if(!split||!held||split.id!==t.id||t.status!=='settled'||t.transfer||!validSplit(split,held.minor,held.currency))continue;
   if(held.currency===t.currency){t.allocations=split.parts;continue;}
   const whole=-BigInt(held.minor),shown=-BigInt(t.minor);let used=0n;
   t.allocations=split.parts.map((p,i)=>{const minor=i===split.parts.length-1?shown-used:BigInt(p.minor)*shown/whole;used+=minor;return {...p,minor:minor.toString()};});}
  const coverage=(await driver.query("SELECT c.*,b.integrity_tier FROM coverage_ranges c JOIN import_batches b ON b.id=c.import_batch_id WHERE b.status='committed'")).filter(r=>ids.includes(String(r.account_id))).map(r=>({accountId:String(r.account_id),start:String(r.period_start),end:String(r.period_end),tier:(r.integrity_tier==='A'?'A':r.integrity_tier==='B'?'B':'C') as 'A'|'B'|'C'}));
  // Pay converts at the rate for the day it was paid, like every other amount that happened on a date.
  const pays=(await driver.query('SELECT * FROM payslips ORDER BY pay_date,id')).map(r=>{
   const paid=currency(String(r.currency)),date=String(r.pay_date);
   const net=into(String(r.net_minor),paid,date),gross=into(String(r.gross_minor),paid,date);
   if(net===null||gross===null)return null;
   return {id:String(r.id),employer:String(r.employer),date,start:String(r.period_start),end:String(r.period_end),net,gross,currency:c,transactionId:r.linked_transaction_id===null?null:String(r.linked_transaction_id)};
  }).filter((p):p is NonNullable<typeof p>=>p!==null);
  /**
   * MONEY SET ASIDE WITHOUT A POT TO SET IT IN. Recording a "Savings" expense from a spending account is
   * money kept, not money gone, and for someone with no savings account it is the only record of it.
   * Internal transfers are excluded: money moved into a tracked savings account is already that
   * account's balance, and counting it here as well would double it.
   */
  const aside=transactions.filter(t=>t.status==='settled'&&!t.transfer&&t.kind==='savings'&&t.date<=asOf);
  const asideMinor=aside.reduce((total,t)=>{const v=BigInt(t.minor);return total+(v<0n?-v:v);},0n);
  const s:Snapshot={asOf,currency:c,accountIds:ids,transactions,coverage,pays,
   savings:{asideMinor:asideMinor.toString(),accountIds:accounts.filter(a=>a.type==='savings'||a.type==='investment').map(a=>String(a.id)),evidence:aside.map(t=>t.id)}};if(unconverted.size)s.unconverted=[...unconverted].sort();const reflection=await setting<Snapshot['selfReport']|null>('intelligence:reflection',null);if(reflection)s.selfReport=reflection;
  const provenance=await queryPages(driver,'SELECT s.transaction_id,s.import_batch_id,s.source_row_id,s.original_payload,b.file_name FROM transaction_sources s JOIN import_batches b ON b.id=s.import_batch_id',[],['transaction_id','import_batch_id','source_row_id']);
  const sources=new Map<string,NonNullable<Transaction['sources']>>();
  for(const r of provenance){const id=String(r.transaction_id),group=sources.get(id)??[];group.push({file:String(r.file_name),row:String(r.source_row_id),raw:String(r.original_payload)});sources.set(id,group);}
  for(const t of transactions)t.sources=sources.get(t.id)??[];
  const recurringNames=new Set(recurrences(s).map(r=>r.merchant));for(const t of transactions)if(recurringNames.has(t.description.trim().toLowerCase()))t.recurring=true;
  /**
   * SAVINGS IS NOT SPENDING MONEY. "savings money doesnt mix in overall balance. its a separate money."
   *
   * A savings account used to be counted as liquid, so every figure built on this — safe-to-spend above
   * all — was free to offer his savings as today's money. An app that does that is not advising him.
   */
  const liquidAccounts=accounts.filter(a=>['checking','cash','credit'].includes(String(a.type)));let balance=0n,liability=0n;const evidence:string[]=[];let valid=liquidAccounts.length>0;
  for(const a of liquidAccounts){const anchors=await driver.query("SELECT * FROM import_batches WHERE account_id=? AND status='committed' AND integrity_tier='A' AND period_end<=? AND stated_closing_minor IS NOT NULL ORDER BY period_end DESC,id",[String(a.id),asOf]);const anchor=anchors[0];if(!anchor){valid=false;continue;}const date=String(anchor.period_end);const intervals=coverage.filter(v=>v.accountId===a.id);for(let d=day(date);d<=day(asOf);d++)if(!intervals.some(v=>day(v.start)<=d&&day(v.end)>=d))valid=false;
   // Converted at the anchor's OWN date: it is a fact about that day, and the movements added to it were
   // each valued at their own. An account whose currency has no rate cannot be counted, and saying the
   // liquid figure is unverified is the honest answer rather than leaving it out of a total silently.
   const anchored=into(String(anchor.stated_closing_minor),currency(String(a.currency)),date);
   if(anchored===null){valid=false;continue;}
   let accountBalance=BigInt(anchored);const after=transactions.filter(t=>t.accountId===a.id&&t.date>date&&t.date<=asOf&&t.status==='settled');for(const t of after)accountBalance+=BigInt(t.minor);if(a.type==='credit'){if(accountBalance<0n)liability-=accountBalance;}else balance+=accountBalance;evidence.push(...transactions.filter(t=>t.accountId===a.id&&t.date<=asOf).map(t=>t.id));
   if(intervals.some(v=>v.tier==='C'&&v.end>date))valid=false;
  }
  if(Object.keys(await manualRepository(driver).unresolved()).length)valid=false;
  // Recorded earmarks reach the snapshot so the analysis layer can report a budget against what the user
  // actually set. They are user-entered plans, never an additional ledger balance.
  s.goals=(await driver.query('SELECT id,name,target_minor,funded_minor,target_date,kind,currency FROM goals ORDER BY target_date,id'))
   .map(g=>{
    // A target is a plan for money he has not spent yet, so it is valued as at the day being reported on.
    const set=currency(String(g.currency)),targetMinor=into(String(g.target_minor),set,asOf),fundedMinor=into(String(g.funded_minor),set,asOf);
    if(targetMinor===null||fundedMinor===null)return null;
    return {id:String(g.id),name:String(g.name),targetMinor,fundedMinor,
     targetDate:g.target_date===null?'':String(g.target_date),kind:String(g.kind) as NonNullable<Snapshot['goals']>[number]['kind']};
   }).filter((g):g is NonNullable<typeof g>=>g!==null);
  s.commitmentsKnown=!accounts.some(a=>a.type==='loan');if(valid)s.committedLiability={minor:liability.toString(),evidence};
  if(valid)s.liquid={minor:balance.toString(),asOf,verified:true,evidence};
  return s;
 }
 async function analyse(asOf:string,code:string,extraBill='0',cutPercent=0){return driver.transaction(async()=>{
  // Signals describe how someone spends, so they run over the data's own window rather than one measured
  // back from today. Three months of statements ending in March describe March perfectly well; anchoring
  // to today turned them into "not enough data" while the transactions sat in the ledger. The forecast
  // below still uses asOf, because what is safe to spend *now* really does need data from now.
  const s=await snapshot(asOf,code),all=describeWindows(s,asOf).flatMap(w=>computeSignals(s,w)),signal=all.filter(v=>v.period.startsWith('trailing-90:')),period=asOf.slice(0,7);
  const old=(await driver.query('SELECT archetype FROM profiles WHERE period<? AND id LIKE ? ORDER BY period DESC LIMIT 1',[code+':'+period,code+':%']))[0];const p=profile(s,signal,old?.archetype?String(old.archetype):null),dismissed=await setting<Record<string,number>>('intelligence:dismissals',{}),cards=insights(s,signal,dismissed),buffer=await setting<string>('intelligence:buffer:'+code,'0');
  for(const v of all)await driver.execute('INSERT OR REPLACE INTO signals(id,period,key,value,computed_at,version,status,inputs) VALUES(?,?,?,?,?,?,?,?)',[code+':'+v.period+':'+v.key,code+':'+v.period,v.key,v.value,new Date().toISOString(),1,v.status==='ok'?'ready':'insufficient_data',JSON.stringify(stored(v))]);
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
 /**
  * Everything the brain reads, in one pass and without writing anything (ADR 0042).
  * Balances convert at today's rate; a debt or balance with no rate is left out and named by the snapshot.
  */
 async function inputs(asOf:string,code:string):Promise<import('../brain/types').BrainInputs>{
  const s=await snapshot(asOf,code),c=currency(code);
  const rates:FxRate[]=(await driver.query('SELECT as_of,base,quote,rate_e8,source FROM fx_rates')).map(r=>({asOf:String(r.as_of),base:currency(String(r.base)),quote:currency(String(r.quote)),rateE8:BigInt(String(r.rate_e8)),source:String(r.source)}));
  const rows=await driver.query('SELECT a.id,a.type,a.currency,a.opening_balance_minor AS opening,COALESCE((SELECT SUM(t.amount_minor) FROM transactions t WHERE t.account_id=a.id),0) AS moved FROM accounts a WHERE a.archived_at IS NULL');
  let spendable=0n,saved=0n;
  for(const a of rows){const held=currency(String(a.currency)),rate=rateBetween(rates,held,c,asOf);if(rate===null)continue;
   const value=convert(money(BigInt(String(a.opening??0))+BigInt(String(a.moved??0)),held),c,rate).minor;
   if(a.type==='savings'||a.type==='investment')saved+=value;else spendable+=value;}
  const {debtRepository}=await import('./debts'),{openDebts}=await import('../intelligence/debt');
  const records=await debtRepository(driver).list();
  const cancelled=new Set((await driver.query("SELECT value FROM app_settings WHERE key>='cancellation:' AND key<'cancellation;'")).flatMap(r=>{const v=JSON.parse(String(r.value)) as {merchant:string;currency:string};return v.currency===code?[v.merchant]:[];}));
  return {snapshot:s,holdings:{spendableMinor:spendable.toString(),savedMinor:saved.toString()},bufferMinor:await setting<string>('intelligence:buffer:'+code,'0'),
   debts:openDebts(records,code,{rates,asOf}),scheduled:records.filter(d=>d.closedAt===null&&d.currency===code).map(d=>({id:d.id,name:d.name,minimumMinor:d.minimumMinor,dueDay:d.dueDay})),
   cancelled,dismissals:await setting<import('../brain/types').BrainInputs['dismissals']>('brain:dismissals',{})};
 }
 /** Hides a piece of advice now; a rule dismissed twice stays hidden (see src/brain/advice.ts). */
 async function dismissAdvice(rule:import('../brain/types').AdviceRule,today:string){day(today);const all=await setting<Record<string,{count:number;last:string}>>('brain:dismissals',{});all[rule]={count:(all[rule]?.count??0)+1,last:today};await set('brain:dismissals',all);}
 return {snapshot,analyse,inputs,dismissAdvice,dismiss,saveGoal,setBuffer,annotate,setReflection};
}
