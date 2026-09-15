import {expect,it} from 'vitest';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {intelligenceRepository} from '../src/ledger/intelligence';
import type {Driver} from '../src/core/db/driver';

/**
 * What one Ledger-sized analyse() actually costs, split into database time and main-thread time.
 *
 * Local SQLite is unencrypted and in process, so it under-reports per-row decryption. It does NOT
 * under-report JavaScript CPU, and analyse() had never been measured at scale in either dimension.
 */
it('reports where a 20,000-transaction analyse spends its time',async()=>{
 const {driver,raw}=memoryDriver();
 try{
  await migrate(driver);
  raw.exec("INSERT INTO accounts(id,name,institution,type,currency,opening_balance_minor) VALUES('a','Synthetic','Synthetic','checking','AUD',0)");
  raw.exec("INSERT INTO import_batches(id,account_id,source_file_hash,file_name,parser_version,period_start,period_end,status,created_at,integrity_tier) VALUES('b','a','synthetic','Synthetic.csv','bench','2026-01-01','2026-12-31','committed','2026-12-31','C')");
  raw.exec("INSERT INTO coverage_ranges VALUES('c','a','2026-01-01','2026-12-31','b')");
  raw.exec("INSERT INTO categories(id,name,kind) VALUES('d','Eating out','discretionary')");
  const transaction=raw.prepare("INSERT INTO transactions(id,account_id,posted_date,amount_minor,currency,raw_description,category_id,type,fingerprint,import_batch_id,confidence,status) VALUES(?,'a',?,?,'AUD',?,'d','debit',?,'b',10000,'settled')");
  const source=raw.prepare('INSERT INTO transaction_sources VALUES(?,?,?,?)');
  raw.exec('BEGIN');
  for(let i=0;i<20000;i++){
   const id='row-'+String(i).padStart(5,'0');
   const date='2026-'+String(1+i%12).padStart(2,'0')+'-'+String(1+i%28).padStart(2,'0');
   transaction.run(id,date,-1000-(i%500),'Synthetic merchant '+String.fromCharCode(97+i%26)+(i%97),id);
   source.run(id,'b',String(i),JSON.stringify({sourceId:String(i),reference:'',merchant:'Synthetic merchant',mcc:null,fingerprint:String(i).padStart(64,'0'),issues:[],duplicateOf:null,occurrence:'',createRule:false,pending:false,verified:false,confidence:10000}));
  }
  raw.exec('COMMIT');

  let queries=0,queryMs=0,writes=0,writeMs=0;
  const timed:Driver={
   async query(sql,params){const t=performance.now();try{return await driver.query(sql,params);}finally{queries++;queryMs+=performance.now()-t;}},
   async execute(sql,params){const t=performance.now();try{return await driver.execute(sql,params);}finally{writes++;writeMs+=performance.now()-t;}},
   transaction:driver.transaction,
  };
  const started=performance.now();
  await intelligenceRepository(timed).analyse('2026-12-31','AUD');
  const total=performance.now()-started;
  const report={total_ms:Math.round(total),database_ms:Math.round(queryMs+writeMs),main_thread_ms:Math.round(total-queryMs-writeMs),
   queries,query_ms:Math.round(queryMs),writes,write_ms:Math.round(writeMs)};
  console.log('analyse(20,000 transactions):',JSON.stringify(report));
  // Measurement, not a budget: local SQLite is unencrypted and in process, so these numbers are a
  // floor for the device, not a threshold. The assertion only pins the shape of the work.
  expect(report.writes).toBe(26);
 }finally{raw.close();}
},600000);

it('reports how large a stored signal payload is at 20,000 transactions',async()=>{
 const {driver,raw}=memoryDriver();
 try{
  await migrate(driver);
  raw.exec("INSERT INTO accounts(id,name,institution,type,currency,opening_balance_minor) VALUES('a','Synthetic','Synthetic','checking','AUD',0)");
  raw.exec("INSERT INTO import_batches(id,account_id,source_file_hash,file_name,parser_version,period_start,period_end,status,created_at,integrity_tier) VALUES('b','a','synthetic','Synthetic.csv','bench','2026-01-01','2026-12-31','committed','2026-12-31','C')");
  raw.exec("INSERT INTO coverage_ranges VALUES('c','a','2026-01-01','2026-12-31','b')");
  raw.exec("INSERT INTO categories(id,name,kind) VALUES('d','Eating out','discretionary')");
  const transaction=raw.prepare("INSERT INTO transactions(id,account_id,posted_date,amount_minor,currency,raw_description,category_id,type,fingerprint,import_batch_id,confidence,status) VALUES(?,'a',?,?,'AUD',?,'d','debit',?,'b',10000,'settled')");
  raw.exec('BEGIN');
  for(let i=0;i<20000;i++){
   const id='row-'+String(i).padStart(5,'0');
   transaction.run(id,'2026-'+String(1+i%12).padStart(2,'0')+'-'+String(1+i%28).padStart(2,'0'),-1000-(i%500),'Synthetic merchant '+String.fromCharCode(97+i%26)+(i%97),id);
  }
  raw.exec('COMMIT');
  await intelligenceRepository(driver).analyse('2026-12-31','AUD');
  const rows=await driver.query('SELECT key,length(value) AS value_bytes,length(inputs) AS inputs_bytes FROM signals ORDER BY length(inputs) DESC LIMIT 5');
  const total=(await driver.query('SELECT SUM(length(inputs)+length(value)) AS bytes, COUNT(*) AS n FROM signals'))[0];
  console.log('largest stored signals:',JSON.stringify(rows));
  console.log('signals table payload total:',JSON.stringify(total));
  // A stored signal cites the transactions it was computed from; it does not copy them. Copying them
  // wrote 45,721,866 bytes across these 24 rows, whose CHECK(json_valid(inputs)) SQLite must parse and
  // SQLCipher must encrypt, and that measured 37,403 ms of a 43,789 ms Ledger open on the device.
  // The budget is deliberately far above the citation size and far below a single copied corpus.
  expect(Number(total!.n)).toBe(24);
  expect(Number(total!.bytes)).toBeLessThan(4_000_000);
  expect(Number(rows[0]!.inputs_bytes)).toBeLessThan(500_000);
 }finally{raw.close();}
},600000);
