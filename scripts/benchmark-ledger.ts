import {performance} from 'node:perf_hooks';
import {memoryDriver} from '../tests/db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository} from '../src/core/db/repository';
import {normalizeRow,hash,shiftDay} from '../src/ingest/normalize';
import {reconcile} from '../src/ingest/reconcile';
import type {Document,ImportContext} from '../src/ingest/types';
export async function benchmarkLedger(){
const context:ImportContext={accountId:'synthetic',accountKind:'checking',currency:'AUD',period:{start:'2026-01-01',end:'2026-12-31'},dateOrder:'DMY',decimal:'.',creditPositivePurchases:false};
const rows=Array.from({length:20000},(_,i)=>normalizeRow({sourceId:String(i),date:shiftDay('2026-01-01',i%365),description:'Synthetic merchant '+i.toString(16).split('').map(c=>String.fromCharCode(65+Number.parseInt(c,16))).join(''),amount:'-10.00',reference:String(i),confidence:10000},context));
const document:Document={id:hash('synthetic benchmark'),hash:hash('synthetic file'),fileName:'Synthetic benchmark.csv',parser:'benchmark-only',context,opening:'0',closing:'-20000000',payslip:null,rows,sourceRank:3,sourceKind:'export',integrityTier:'C'};
const start=performance.now(),ledger=reconcile([document]),reconcileMs=performance.now()-start;
if(ledger.length!==20000)throw new Error('Benchmark lost transactions');
const {driver,raw}=memoryDriver();await migrate(driver);const repo=repository(driver);await repo.addAccount({id:'synthetic',name:'Synthetic only',institution:'Synthetic',type:'checking',currency:'AUD',mask_last4:null,opening_balance_minor:0n});
raw.exec("INSERT INTO import_batches(id,account_id,source_file_hash,file_name,parser_version,period_start,period_end,status,created_at,integrity_tier,source_rank) VALUES('b','synthetic','synthetic','Synthetic benchmark.csv','benchmark-only','2026-01-01','2026-12-31','committed','2026-12-31','C',3)");
raw.prepare("INSERT INTO staging_rows(id,import_batch_id,source_row_id,payload,confidence,issues) VALUES('b-document','b','__document__',?,10000,'[]')").run(JSON.stringify(document));
const insert=raw.prepare("INSERT INTO transactions(id,account_id,posted_date,amount_minor,currency,raw_description,type,fingerprint,import_batch_id,confidence,status) VALUES(?,'synthetic',?,-1000,'AUD',?,'debit',?,'b',10000,'settled')");
const source=raw.prepare("INSERT INTO transaction_sources VALUES(?,'b',?,?)");
await driver.transaction(async()=>{for(const t of ledger){insert.run(t.id,t.date,t.description,t.fingerprint);source.run(t.id,t.sourceId,JSON.stringify(t));}});
const readStart=performance.now(),snapshot=await repo.intelligence.snapshot('2026-12-31','AUD'),readMs=performance.now()-readStart;
if(snapshot.transactions.length!==20000||snapshot.transactions.some(t=>t.sources?.length!==1))throw new Error('Snapshot evidence mismatch');
const workspaceStart=performance.now(),workspace=await repo.imports.workspace(),workspaceMs=performance.now()-workspaceStart;
if(workspace.ledger.length!==20000||workspace.batches.length!==1||workspace.ledger.some(t=>t.sources.length!==1))throw new Error('Materialized workspace mismatch');
raw.close();return {fixture:'synthetic only',rows:20000,reconciliation_ms:Math.round(reconcileMs),sqlite_snapshot_with_provenance_ms:Math.round(readMs),materialized_ledger_workspace_ms:Math.round(workspaceMs),runtime:process.version,scope:'Local Node SQLite; Android cold start and frame times still require device measurement'};
}
