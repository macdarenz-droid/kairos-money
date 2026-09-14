import {expect,it} from 'vitest';
import {queryPages} from '../src/core/db/query-pages';
import type {Driver} from '../src/core/db/driver';
import {memoryDriver} from './db-helper';

it('preserves SQLite ordering, aliases, bound parameters, exact values and Unicode across bounded native responses',async()=>{
 const {driver,raw}=memoryDriver();
 try{
  raw.exec('CREATE TABLE evidence(id INTEGER PRIMARY KEY, currency TEXT, minor TEXT, note TEXT)');
  const insert=raw.prepare('INSERT INTO evidence VALUES(?,?,?,?)');
  for(let i=0;i<1300;i++)insert.run(i,i%3?'AUD':'USD',String(-9007199254740991n+BigInt(i)),i%2?'Receipt 🧾 café 零':null);
  const responses:number[]=[];
  const bridge:Driver={...driver,async query(sql,values){const rows=await driver.query(sql,values);responses.push(rows.length);if(rows.length>256)throw new Error('Native response exceeded its row budget');return rows;}};
  const sql='SELECT id AS source_id,minor,note FROM evidence WHERE currency=? ORDER BY id DESC';
  expect(await queryPages(bridge,sql,['AUD'])).toEqual(await driver.query(sql,['AUD']));
  expect(responses.length).toBeGreaterThan(1);
  expect(await queryPages(bridge,sql,['PHP'])).toEqual([]);
  // Exact multiples require an empty final page rather than losing or duplicating the boundary row.
  const boundary='SELECT id FROM evidence WHERE id<? ORDER BY id';
  expect(await queryPages(bridge,boundary,[512])).toEqual(await driver.query(boundary,[512]));
 }finally{raw.close();}
});

it('rejects the complete read if a later native page fails',async()=>{
 const {driver,raw}=memoryDriver();
 try{
  raw.exec('CREATE TABLE evidence(id INTEGER PRIMARY KEY)');
  const insert=raw.prepare('INSERT INTO evidence VALUES(?)');for(let i=0;i<300;i++)insert.run(i);
  let reads=0;
  const bridge:Driver={...driver,async query(sql,values){if(++reads===2)throw new Error('Connection closed');return driver.query(sql,values);}};
  await expect(queryPages(bridge,'SELECT id FROM evidence ORDER BY id')).rejects.toThrow('Connection closed');
 }finally{raw.close();}
});

it('loads every transaction and source into the production snapshot without an oversized bridge response',async()=>{
 const {migrate}=await import('../src/core/db/migrate');
 const {intelligenceRepository}=await import('../src/ledger/intelligence');
 const {driver,raw}=memoryDriver();
 try{
  await migrate(driver);
  raw.exec("INSERT INTO accounts(id,name,institution,type,currency,opening_balance_minor) VALUES('page-account','Synthetic','Synthetic','checking','AUD',0)");
  raw.exec("INSERT INTO import_batches(id,source_file_hash,file_name,parser_version,status,created_at) VALUES('page-batch','synthetic','Synthetic only.csv','native-fixture','committed','2026-01-01')");
  const transaction=raw.prepare("INSERT INTO transactions(id,account_id,posted_date,amount_minor,currency,raw_description,type,fingerprint,import_batch_id,confidence,status) VALUES(?,'page-account',?,?,'AUD',?,'debit',?,'page-batch',10000,'settled')");
  const source=raw.prepare("INSERT INTO transaction_sources VALUES(?,'page-batch',?,?)");
  for(let i=0;i<600;i++){
   const id='receipt-'+i,date='2026-01-'+String(1+i%28).padStart(2,'0');
   transaction.run(id,date,-1000-i,'Synthetic café 🧾 '+i,id);
   source.run(id,String(i),JSON.stringify({description:'Synthetic café 🧾 '+i,minor:String(-1000-i)}));
  }
  const expected=await driver.query('SELECT id,amount_minor FROM transactions ORDER BY posted_date,id');
  let maxRows=0;
  const bridge:Driver={...driver,async query(sql,values){const rows=await driver.query(sql,values);maxRows=Math.max(maxRows,rows.length);if(rows.length>256)throw new Error('Oversized native response');return rows;}};
  const snapshot=await intelligenceRepository(bridge).snapshot('2026-01-31','AUD');
  expect(snapshot.transactions.map(t=>[t.id,t.minor])).toEqual(expected.map(t=>[t.id,String(t.amount_minor)]));
  for(const t of snapshot.transactions){
   expect(t.sources).toHaveLength(1);
   expect(t.sources?.[0]?.raw).toBe(JSON.stringify({description:t.rawDescription,minor:t.minor}));
  }
  expect(maxRows).toBeLessThanOrEqual(256);
 }finally{raw.close();}
});

it('reads the ledger and snapshot by key so paging never rescans earlier rows',async()=>{
 const {migrate}=await import('../src/core/db/migrate');
 const {intelligenceRepository}=await import('../src/ledger/intelligence');
 const {repository}=await import('../src/core/db/repository');
 const {driver,raw}=memoryDriver();
 try{
  await migrate(driver);
  raw.exec("INSERT INTO accounts(id,name,institution,type,currency,opening_balance_minor) VALUES('a','Synthetic','Synthetic','checking','AUD',0)");
  raw.exec("INSERT INTO import_batches(id,account_id,source_file_hash,file_name,parser_version,period_start,period_end,status,created_at) VALUES('b','a','synthetic','Synthetic.csv','native-fixture','2026-01-01','2026-01-31','committed','2026-01-01')");
  raw.prepare("INSERT INTO staging_rows(id,import_batch_id,source_row_id,payload,confidence,issues) VALUES('b-doc','b','__document__',?,10000,'[]')").run('{}');
  const transaction=raw.prepare("INSERT INTO transactions(id,account_id,posted_date,amount_minor,currency,raw_description,type,fingerprint,import_batch_id,confidence,status) VALUES(?,'a','2026-01-02',-1000,'AUD','Synthetic','debit',?,'b',10000,'settled')");
  const source=raw.prepare("INSERT INTO transaction_sources VALUES(?,'b',?,?)");
  for(let i=0;i<300;i++){
   const id='row-'+String(i).padStart(4,'0');transaction.run(id,id);
   source.run(id,String(i),JSON.stringify({sourceId:String(i),reference:'',merchant:'Synthetic',mcc:null,fingerprint:String(i).padStart(64,'0'),issues:[],duplicateOf:null,occurrence:'',createRule:false,pending:false,verified:false,confidence:10000}));
  }
  // OFFSET paging is quadratic and re-decrypts discarded rows on the device database.
  const offsets:string[]=[];
  const watched:Driver={...driver,async query(sql,values){if(/\bOFFSET\b/i.test(sql))offsets.push(sql);return driver.query(sql,values);}};
  await intelligenceRepository(watched).snapshot('2026-01-31','AUD');
  await repository(watched).imports.ledger();
  expect(offsets).toEqual([]);
 }finally{raw.close();}
});
