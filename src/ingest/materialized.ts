import type {Driver} from '../core/db/driver';
import {queryPages} from '../core/db/query-pages';
import {currency} from '../core/money';
import type {LedgerRow} from './types';

type Source = {batchId:string;sourceId:string;rank:number;merchant:string;mcc:string|null;reference:string;runningBalance?:string;fingerprint:string;issues:string[];duplicateOf:string|null;occurrence:string;createRule:boolean;pending:boolean;verified:boolean;confidence:number};

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
  json_extract(s.original_payload,'$.pending') AS pending,json_extract(s.original_payload,'$.verified') AS verified,
  json_extract(s.original_payload,'$.confidence') AS confidence
  FROM transaction_sources s JOIN import_batches b ON b.id=s.import_batch_id
  WHERE b.status='committed' AND b.parser_version<>'manual-entry-v1'`,[],['transaction_id','import_batch_id','source_row_id']);
 const scoped=new Set((await driver.query("SELECT import_batch_id FROM staging_rows WHERE source_row_id='__document__'")).map(record=>String(record.import_batch_id)));
 const sources=new Map<string,Source[]>();
 for(const record of provenance){
  if(!scoped.has(String(record.import_batch_id)))continue;
  let issues:unknown;try{issues=JSON.parse(String(record.issues));}catch{throw new Error('Stored transaction evidence is invalid. Restore a verified encrypted backup.');}
  if(String(record.original_source_id)!==String(record.source_row_id)||!/^[a-f0-9]{64}$/.test(String(record.fingerprint))||!Array.isArray(issues)||issues.some(issue=>typeof issue!=='string'))throw new Error('Stored transaction evidence is invalid. Restore a verified encrypted backup.');
  const transactionId=String(record.transaction_id),list=sources.get(transactionId)??[];
  list.push({batchId:String(record.import_batch_id),sourceId:String(record.source_row_id),rank:Number(record.source_rank),merchant:String(record.merchant),mcc:record.mcc===null?null:String(record.mcc),reference:String(record.reference??''),...(record.running_balance===null?{}:{runningBalance:String(record.running_balance)}),fingerprint:String(record.fingerprint),issues:issues as string[],duplicateOf:record.duplicate_of===null?null:String(record.duplicate_of),occurrence:String(record.occurrence??''),createRule:Number(record.create_rule)===1,pending:Number(record.pending)===1,verified:Number(record.verified)===1,confidence:Number(record.confidence)});
  sources.set(transactionId,list);
 }
 return transactions.filter(record=>scoped.has(String(record.import_batch_id))).map(record=>{
  const id=String(record.id),evidence=sources.get(id);if(!evidence?.length)throw new Error('Stored transaction evidence is incomplete. Restore a verified encrypted backup.');
  evidence.sort((a,b)=>Number(a.pending)-Number(b.pending)||b.rank-a.rank||Number(b.verified)-Number(a.verified)||b.confidence-a.confidence||a.batchId.localeCompare(b.batchId)||a.sourceId.localeCompare(b.sourceId));
  const chosen=evidence[0]!,status=String(record.status)==='pending'?'pending':'settled';
  return {sourceId:chosen.sourceId,id,accountId:String(record.account_id),date:String(record.posted_date),description:String(record.raw_description),merchant:record.canonical_name===null?chosen.merchant:String(record.canonical_name),minor:String(record.amount_minor),currency:currency(String(record.currency)),reference:chosen.reference,...(chosen.runningBalance===undefined?{}:{runningBalance:chosen.runningBalance}),fingerprint:chosen.fingerprint,issues:chosen.issues,duplicateOf:chosen.duplicateOf,occurrence:chosen.occurrence,createRule:chosen.createRule,pending:status==='pending',status,confidence:Number(record.confidence),category:record.category===null?null:String(record.category),verified:Number(record.user_verified)===1,mcc:record.mcc===null?chosen.mcc:String(record.mcc),owner:String(record.import_batch_id),transferGroup:record.transfer_group_id===null?null:String(record.transfer_group_id),sources:evidence.map(source=>({batchId:source.batchId,sourceId:source.sourceId})).sort((a,b)=>a.batchId.localeCompare(b.batchId)||a.sourceId.localeCompare(b.sourceId))};
 });
}
