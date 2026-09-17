import type {Driver,SqlRow,SqlValue} from '../core/db/driver';
import {queryPages} from '../core/db/query-pages';
import {currency} from '../core/money';
import type {LedgerRow} from './types';

type Source = {batchId:string;sourceId:string;rank:number;merchant:string;mcc:string|null;reference:string;runningBalance?:string;fingerprint:string;issues:string[];duplicateOf:string|null;occurrence:string;createRule:boolean;categoryFrom?:'suggestion';pending:boolean;verified:boolean;confidence:number};

/**
 * Read the committed canonical ledger without rebuilding it from original documents.
 * Scoped to the batches the importer materializes: those holding a staged source document. Records
 * other screens seed under their own batches are theirs to read, not evidence for this ledger. The
 * scope is resolved once here rather than per row, which no staging_rows index would make cheap.
 */
export async function materializedLedger(driver:Driver):Promise<LedgerRow[]> {
 const transactions=await queryPages(driver,`SELECT t.id,t.account_id,t.posted_date,t.amount_minor,t.currency,t.raw_description,
  t.transfer_group_id,t.import_batch_id,t.confidence,t.user_verified,t.status,m.canonical_name,m.mcc,c.name AS category
  FROM transactions t JOIN import_batches b ON b.id=t.import_batch_id
  LEFT JOIN merchants m ON m.id=t.merchant_id LEFT JOIN categories c ON c.id=t.category_id
  WHERE b.status='committed' AND b.parser_version<>'manual-entry-v1'`,[],['id']);
 const provenance=await queryPages(driver,`SELECT s.transaction_id,s.import_batch_id,s.source_row_id,b.source_rank,
  json_extract(s.original_payload,'$.sourceId') AS original_source_id,json_extract(s.original_payload,'$.reference') AS reference,
  json_extract(s.original_payload,'$.merchant') AS merchant,json_extract(s.original_payload,'$.mcc') AS mcc,
  json_extract(s.original_payload,'$.runningBalance') AS running_balance,json_extract(s.original_payload,'$.fingerprint') AS fingerprint,
  json_extract(s.original_payload,'$.issues') AS issues,json_extract(s.original_payload,'$.duplicateOf') AS duplicate_of,
  json_extract(s.original_payload,'$.occurrence') AS occurrence,json_extract(s.original_payload,'$.createRule') AS create_rule,
  json_extract(s.original_payload,'$.categoryFrom') AS category_from,
  json_extract(s.original_payload,'$.pending') AS pending,json_extract(s.original_payload,'$.verified') AS verified,
  json_extract(s.original_payload,'$.confidence') AS confidence
  FROM transaction_sources s JOIN import_batches b ON b.id=s.import_batch_id
  WHERE b.status='committed' AND b.parser_version<>'manual-entry-v1'`,[],['transaction_id','import_batch_id','source_row_id']);
 const scoped=await scopedBatches(driver);
 const sources=new Map<string,Source[]>();
 for(const record of provenance){
  if(!scoped.has(String(record.import_batch_id)))continue;
  collect(sources,record);
 }
 return transactions.filter(record=>scoped.has(String(record.import_batch_id))).map(record=>row(record,sources.get(String(record.id))));
}

/** Build one ledger row from its transaction record and the provenance that supports it. */
function row(record:SqlRow,evidence:Source[]|undefined):LedgerRow {
 const id=String(record.id);
 if(!evidence?.length)throw new Error('Stored transaction evidence is incomplete. Restore a verified encrypted backup.');
 evidence.sort((a,b)=>Number(a.pending)-Number(b.pending)||b.rank-a.rank||Number(b.verified)-Number(a.verified)||b.confidence-a.confidence||a.batchId.localeCompare(b.batchId)||a.sourceId.localeCompare(b.sourceId));
 const chosen=evidence[0]!,status=String(record.status)==='pending'?'pending':'settled';
 return {sourceId:chosen.sourceId,id,accountId:String(record.account_id),date:String(record.posted_date),description:String(record.raw_description),merchant:record.canonical_name===null?chosen.merchant:String(record.canonical_name),minor:String(record.amount_minor),currency:currency(String(record.currency)),reference:chosen.reference,...(chosen.runningBalance===undefined?{}:{runningBalance:chosen.runningBalance}),fingerprint:chosen.fingerprint,issues:chosen.issues,duplicateOf:chosen.duplicateOf,occurrence:chosen.occurrence,createRule:chosen.createRule,...(chosen.categoryFrom===undefined?{}:{categoryFrom:chosen.categoryFrom}),pending:status==='pending',status,confidence:Number(record.confidence),category:record.category===null?null:String(record.category),verified:Number(record.user_verified)===1,mcc:record.mcc===null?chosen.mcc:String(record.mcc),owner:String(record.import_batch_id),transferGroup:record.transfer_group_id===null?null:String(record.transfer_group_id),sources:evidence.map(source=>({batchId:source.batchId,sourceId:source.sourceId})).sort((a,b)=>a.batchId.localeCompare(b.batchId)||a.sourceId.localeCompare(b.sourceId))};
}

/**
 * The batches History shows: a staged source document, an approved bank notification, or something
 * recorded by hand.
 *
 * All three are money that moved, and they were three separate lists on three parts of the screen. A
 * purchase does not become a different KIND of thing because of how it reached the app.
 */
async function scopedBatches(driver:Driver):Promise<Set<string>> {
 return new Set((await driver.query("SELECT import_batch_id FROM staging_rows WHERE source_row_id IN ('__document__','__notice__','__manual__')")).map(record=>String(record.import_batch_id)));
}

/**
 * Evidence for something typed in by hand.
 *
 * A manual entry has no statement behind it — no source row id, no fingerprint from a file, no issues
 * list — and collect() requires all three, because for an imported row their absence means the database
 * has been damaged. Forcing manual rows through it would greet somebody with "Restore a verified
 * encrypted backup" for the ordinary act of writing down a coffee. So their provenance is built here
 * instead, and it says exactly what it is: the person, at a known confidence, with nothing to
 * cross-check against.
 *
 * The transaction id doubles as the fingerprint because for a manual entry it IS one — it is the hash of
 * the entry and its leg, and nothing else can produce it.
 */
function manualSource(record:SqlRow):Source {
 return {batchId:String(record.import_batch_id),sourceId:String(record.source_row_id),rank:Number(record.source_rank),
  merchant:String(record.merchant??''),mcc:null,reference:'',fingerprint:String(record.transaction_id),
  issues:[],duplicateOf:null,occurrence:'',createRule:false,pending:false,verified:true,confidence:10000};
}

/** Validate one provenance record and file it under its transaction. */
function collect(sources:Map<string,Source[]>,record:SqlRow):void {
 let issues:unknown;try{issues=JSON.parse(String(record.issues));}catch{throw new Error('Stored transaction evidence is invalid. Restore a verified encrypted backup.');}
 if(String(record.original_source_id)!==String(record.source_row_id)||!/^[a-f0-9]{64}$/.test(String(record.fingerprint))||!Array.isArray(issues)||issues.some(issue=>typeof issue!=='string'))throw new Error('Stored transaction evidence is invalid. Restore a verified encrypted backup.');
 const transactionId=String(record.transaction_id),list=sources.get(transactionId)??[];
 list.push({batchId:String(record.import_batch_id),sourceId:String(record.source_row_id),rank:Number(record.source_rank),merchant:String(record.merchant),mcc:record.mcc===null?null:String(record.mcc),reference:String(record.reference??''),...(record.running_balance===null?{}:{runningBalance:String(record.running_balance)}),fingerprint:String(record.fingerprint),issues:issues as string[],duplicateOf:record.duplicate_of===null?null:String(record.duplicate_of),occurrence:String(record.occurrence??''),createRule:Number(record.create_rule)===1,...(record.category_from==='suggestion'?{categoryFrom:'suggestion' as const}:{}),pending:Number(record.pending)===1,verified:Number(record.verified)===1,confidence:Number(record.confidence)});
 sources.set(transactionId,list);
}

const provenanceColumns=`s.transaction_id,s.import_batch_id,s.source_row_id,b.source_rank,
 json_extract(s.original_payload,'$.sourceId') AS original_source_id,json_extract(s.original_payload,'$.reference') AS reference,
 json_extract(s.original_payload,'$.merchant') AS merchant,json_extract(s.original_payload,'$.mcc') AS mcc,
 json_extract(s.original_payload,'$.runningBalance') AS running_balance,json_extract(s.original_payload,'$.fingerprint') AS fingerprint,
 json_extract(s.original_payload,'$.issues') AS issues,json_extract(s.original_payload,'$.duplicateOf') AS duplicate_of,
 json_extract(s.original_payload,'$.occurrence') AS occurrence,json_extract(s.original_payload,'$.createRule') AS create_rule,
 json_extract(s.original_payload,'$.pending') AS pending,json_extract(s.original_payload,'$.verified') AS verified,
 json_extract(s.original_payload,'$.confidence') AS confidence`;

/** Ledger ordering as the Transactions list presents it: newest first, stable by id. */
const listOrder='ORDER BY t.posted_date DESC,t.id ASC';
/**
 * Search as the list applies it: description, date and category, case-insensitively.
 *
 * Only when something is actually being searched. The expression is a concatenation of decrypted
 * columns, so no index can serve it and SQLite must build and test a string for every row; an empty
 * term still forced that full scan, which measured 49,351 ms of a 49,702 ms native load for a term
 * the user had not typed. With no term there is nothing to match, so the predicate is left out and
 * the count and the ordered page use the index instead.
 */
const listMatch=(column:string)=>`LOWER(${column}||' '||t.posted_date||' '||COALESCE(c.name,'')) LIKE '%'||LOWER(?)||'%'`;
const searching=(search:string)=>search.trim().length>0;

export type LedgerPage = {rows:LedgerRow[];total:number};

/**
 * Read one window of the ledger rather than all of it.
 *
 * The Transactions list virtualizes to about sixteen visible rows, but reading the whole ledger
 * moved roughly 40,000 rows across the Capacitor SQLite bridge: measured natively, that was 52,310 ms
 * of a 52,491 ms load, while opening the tab cost 22 ms and filtering and virtualization about 180 ms.
 * Search and ordering therefore run in SQL so only the visible window and a count cross the bridge.
 */
export async function materializedPage(driver:Driver,search:string,offset:number,limit:number):Promise<LedgerPage> {
 const scoped=[...await scopedBatches(driver)];
 if(!scoped.length)return {rows:[],total:0};
 const batches=scoped.map(()=>'?').join(',');
 const match=searching(search)?` AND ${listMatch('t.raw_description')}`:'';
 const bounds:SqlValue[]=searching(search)?[...scoped,search]:[...scoped];
 const where=`FROM transactions t JOIN import_batches b ON b.id=t.import_batch_id
  LEFT JOIN categories c ON c.id=t.category_id
  WHERE b.status='committed' AND b.id IN (${batches})${match}`;
 const total=Number((await driver.query(`SELECT COUNT(*) AS total ${where}`,bounds))[0]?.total??0);
 if(!total)return {rows:[],total:0};
 const transactions=await driver.query(`SELECT t.id,t.account_id,t.posted_date,t.amount_minor,t.currency,t.raw_description,
  t.transfer_group_id,t.import_batch_id,t.confidence,t.user_verified,t.status,m.canonical_name,m.mcc,c.name AS category
  FROM transactions t JOIN import_batches b ON b.id=t.import_batch_id
  LEFT JOIN merchants m ON m.id=t.merchant_id LEFT JOIN categories c ON c.id=t.category_id
  WHERE b.status='committed' AND b.id IN (${batches})${match}
  ${listOrder} LIMIT ? OFFSET ?`,[...bounds,Math.max(0,limit),Math.max(0,offset)]);
 if(!transactions.length)return {rows:[],total};
 const ids=transactions.map(record=>String(record.id)),keys=ids.map(()=>'?').join(',');
 const provenance=await driver.query(`SELECT ${provenanceColumns}
  FROM transaction_sources s JOIN import_batches b ON b.id=s.import_batch_id
  WHERE b.status='committed' AND b.parser_version<>'manual-entry-v1' AND b.id IN (${batches}) AND s.transaction_id IN (${keys})
  ORDER BY s.transaction_id,s.import_batch_id,s.source_row_id`,[...scoped,...ids]);
 const sources=new Map<string,Source[]>();
 for(const record of provenance)collect(sources,record);
 // Recorded by hand: its own shape, and the entry id so the row can be opened, edited or removed.
 const manual=await driver.query(`SELECT s.transaction_id,s.import_batch_id,s.source_row_id,b.source_rank,
  json_extract(s.original_payload,'$.id') AS manual_id,json_extract(s.original_payload,'$.description') AS merchant
  FROM transaction_sources s JOIN import_batches b ON b.id=s.import_batch_id
  WHERE b.status='committed' AND b.parser_version='manual-entry-v1' AND b.id IN (${batches}) AND s.transaction_id IN (${keys})
  ORDER BY s.transaction_id,s.import_batch_id,s.source_row_id`,[...scoped,...ids]);
 const entries=new Map<string,string>();
 for(const record of manual){
  const id=String(record.transaction_id);
  sources.set(id,[...(sources.get(id)??[]),manualSource(record)]);
  if(record.manual_id!==null)entries.set(id,String(record.manual_id));
 }
 return {rows:transactions.map(record=>{
  const built=row(record,sources.get(String(record.id)));
  const entry=entries.get(String(record.id));
  return entry===undefined?built:{...built,manualId:entry};
 }),total};
}

export type LedgerHealth = {accountId:string;total:number;uncategorized:number;unmatchedTransfers:number};

/**
 * Per-account counts for data health, aggregated in SQL.
 *
 * `dataHealth` needs only totals, so counting beats transferring rows. Transfer wording is the one
 * part SQL cannot judge: LIKE selects a superset of candidates and the original expression decides,
 * which keeps the result identical to reading every row.
 */
export async function materializedHealth(driver:Driver):Promise<LedgerHealth[]> {
 const scoped=[...await scopedBatches(driver)];
 if(!scoped.length)return [];
 const batches=scoped.map(()=>'?').join(',');
 const scope=`FROM transactions t JOIN import_batches b ON b.id=t.import_batch_id
  LEFT JOIN categories c ON c.id=t.category_id
  WHERE b.status='committed' AND b.parser_version<>'manual-entry-v1' AND b.id IN (${batches})`;
 const totals=await driver.query(`SELECT t.account_id,COUNT(*) AS total,
  SUM(CASE WHEN c.name IS NULL THEN 1 ELSE 0 END) AS uncategorized ${scope} GROUP BY t.account_id`,scoped);
 const candidates=await driver.query(`SELECT t.account_id,t.raw_description ${scope}
  AND t.transfer_group_id IS NULL AND (UPPER(t.raw_description) LIKE '%TRANSFER%' OR UPPER(t.raw_description) LIKE '%TFR%' OR UPPER(t.raw_description) LIKE '%XFER%')`,scoped);
 const unmatched=new Map<string,number>();
 for(const record of candidates)if(/\b(?:TRANSFER|TFR|XFER)\b/i.test(String(record.raw_description))){
  const accountId=String(record.account_id);unmatched.set(accountId,(unmatched.get(accountId)??0)+1);
 }
 return totals.map(record=>({accountId:String(record.account_id),total:Number(record.total),uncategorized:Number(record.uncategorized),unmatchedTransfers:unmatched.get(String(record.account_id))??0}));
}

/**
 * Candidates for bulk categorisation, matched and bounded in SQL.
 *
 * The sheet filters on merchant, date and category and excludes matched transfers, and it already
 * caps selection at 1,000 rows, so reading one bounded window preserves its behaviour without
 * transferring the whole ledger. Merchant is read from the canonical record the rebuild writes for
 * every row, which is the name the sheet displays.
 */
export async function materializedBulk(driver:Driver,search:string,limit=1001):Promise<LedgerPage> {
 const scoped=[...await scopedBatches(driver)];
 if(!scoped.length)return {rows:[],total:0};
 const batches=scoped.map(()=>'?').join(',');
 const match=searching(search)?` AND ${listMatch("COALESCE(m.canonical_name,'')")}`:'';
 const bounds:SqlValue[]=searching(search)?[...scoped,search]:[...scoped];
 const where=`FROM transactions t JOIN import_batches b ON b.id=t.import_batch_id
  LEFT JOIN merchants m ON m.id=t.merchant_id LEFT JOIN categories c ON c.id=t.category_id
  WHERE b.status='committed' AND b.parser_version<>'manual-entry-v1' AND b.id IN (${batches})
  AND t.transfer_group_id IS NULL${match}`;
 const total=Number((await driver.query(`SELECT COUNT(*) AS total ${where}`,bounds))[0]?.total??0);
 if(!total)return {rows:[],total:0};
 const transactions=await driver.query(`SELECT t.id,t.account_id,t.posted_date,t.amount_minor,t.currency,t.raw_description,
  t.transfer_group_id,t.import_batch_id,t.confidence,t.user_verified,t.status,m.canonical_name,m.mcc,c.name AS category
  ${where} ${listOrder} LIMIT ?`,[...bounds,Math.max(0,limit)]);
 const ids=transactions.map(record=>String(record.id)),keys=ids.map(()=>'?').join(',');
 const provenance=await driver.query(`SELECT ${provenanceColumns}
  FROM transaction_sources s JOIN import_batches b ON b.id=s.import_batch_id
  WHERE b.status='committed' AND b.parser_version<>'manual-entry-v1' AND b.id IN (${batches}) AND s.transaction_id IN (${keys})
  ORDER BY s.transaction_id,s.import_batch_id,s.source_row_id`,[...scoped,...ids]);
 const sources=new Map<string,Source[]>();
 for(const record of provenance)collect(sources,record);
 // Recorded by hand: its own shape, and the entry id so the row can be opened, edited or removed.
 const manual=await driver.query(`SELECT s.transaction_id,s.import_batch_id,s.source_row_id,b.source_rank,
  json_extract(s.original_payload,'$.id') AS manual_id,json_extract(s.original_payload,'$.description') AS merchant
  FROM transaction_sources s JOIN import_batches b ON b.id=s.import_batch_id
  WHERE b.status='committed' AND b.parser_version='manual-entry-v1' AND b.id IN (${batches}) AND s.transaction_id IN (${keys})
  ORDER BY s.transaction_id,s.import_batch_id,s.source_row_id`,[...scoped,...ids]);
 const entries=new Map<string,string>();
 for(const record of manual){
  const id=String(record.transaction_id);
  sources.set(id,[...(sources.get(id)??[]),manualSource(record)]);
  if(record.manual_id!==null)entries.set(id,String(record.manual_id));
 }
 return {rows:transactions.map(record=>{
  const built=row(record,sources.get(String(record.id)));
  const entry=entries.get(String(record.id));
  return entry===undefined?built:{...built,manualId:entry};
 }),total};
}
