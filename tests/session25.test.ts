import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync }  from 'node:fs';
import { createHash } from 'node:crypto';
import { memoryDriver } from './db-helper';
import { migrate, migrations } from '../src/core/db/migrate';
import { repository } from '../src/core/db/repository';
import { hash, normalizeRow } from '../src/ingest/normalize';
import { coverage, dataHealth, pendingCommitments, reconcile, totals } from '../src/ingest/reconcile';
import { FileSource, CdrSource, sourceFeatures, MappingRequired } from '../src/ingest/sources';
import { inferExport, parseExport } from '../src/ingest/sources/inference';
import { accountFreshness, newestIsStale } from '../src/ingest/freshness';
import type { Document, ImportContext } from '../src/ingest/types';
const context:ImportContext={accountId:'a',accountKind:'checking',currency:'AUD',period:{start:'2026-03-01',end:'2026-03-31'},dateOrder:'DMY',decimal:'.',creditPositivePurchases:false};
const options={context,opening:'',closing:'',payslip:false};
async function repo(){const {driver}=memoryDriver();await migrate(driver);const r=repository(driver);await r.addAccount({id:'a',name:'A',institution:'CommBank',type:'checking',currency:'AUD',mask_last4:null,opening_balance_minor:0n});return {r,driver};}
function doc(name:string, rows:{date:string;amount:string;pending?:boolean}[],rank=3):Document {const fileHash=hash(name);return {id:hash(JSON.stringify(['a',fileHash])),hash:fileHash,fileName:name,parser:'synthetic',context,opening:'0',closing:'0',payslip:null,sourceRank:rank,sourceKind:rank===2?'statement':'export',integrityTier:'C',rows:rows.map((r,i)=>({...normalizeRow({sourceId:String(i),description:'Synthetic cafe',confidence:9800,...r},{...context,period:{start:'2026-01-01',end:'2026-12-31'}}),issues:[],verified:true}))};}
describe('Session 2.5',()=>{
 it('preserves every frozen Session 2 acceptance file',()=>{const baseline=JSON.parse(readFileSync('docs/SESSION_2_BASELINE.json','utf8')) as Record<string,string>;for(const [p,h] of Object.entries(baseline)) expect(createHash('sha256').update(readFileSync(p)).digest('hex'),p).toBe(h);});
 it('infers headerless and debit/credit tables and refuses ambiguous dates',()=>{
  expect(parseExport([['13/03/2026','Synthetic cafe','-12.00']],context).rows[0]?.amount).toBe('-12.00');
  expect(parseExport([['Credit','Details','Date','Debit'],['','Synthetic cafe','13/03/2026','12.00']],context).rows[0]?.direction).toBe('debit');
  const table=[['Date','Description','Amount'],['03/04/2026','Cafe','-2.00']];const c={...context,period:{start:'2026-01-01',end:'2026-12-31'}};
  expect(()=>parseExport(table,c)).toThrow(MappingRequired);const mapping=inferExport(table,c).mapping;expect(parseExport(table,c,{...mapping,dateOrder:'DMY'}).mapping.dateOrder).toBe('DMY');
 });
 it('commits unverified exports and reduces health confidence',async()=>{const {r,driver}=await repo();const source=new FileSource(new TextEncoder().encode('Date,Description,Amount\n13/03/2026,Cafe,-12.00'),'export.csv','CommBank');const d=await source.fetch(options);expect(d.integrityTier).toBe('C');await r.imports.stage(d);await r.imports.commit(d.id);expect((await driver.query('SELECT integrity_tier FROM import_batches'))[0]?.integrity_tier).toBe('C');expect(dataHealth(await r.imports.ledger(),[context.period],context.period,['C']).score).toBeLessThan(60);});
 it('checks every running balance step in either file direction',async()=>{for(const reverse of [false,true]){const rows=['13/03/2026,Cafe,-12.00,88.00','14/03/2026,Shop,-8.00,80.00'];const source=new FileSource(new TextEncoder().encode('Date,Description,Amount,Balance\n'+(reverse?rows.reverse():rows).join('\n')),'balances.csv');const d=await source.fetch(options);const {r}=await repo();await r.imports.stage(d);expect((await r.imports.review(d.id)).balance.valid).toBe(true);d.hash=hash('broken'+reverse);d.id=hash(JSON.stringify(['a',d.hash]));d.rows[1]!.runningBalance='1';await r.imports.stage(d);await expect(r.imports.commit(d.id)).rejects.toThrow('Balance');}});
 it('settles a changed amount once, keeps the pending ID and stores an audit',async()=>{const {r,driver}=await repo();const a=doc('pending',[{date:'2026-03-13',amount:'-100',pending:true}]),b=doc('settled',[{date:'2026-03-15',amount:'-72'}]);await r.imports.stage(a);await r.imports.commit(a.id);const id=(await r.imports.ledger())[0]!.id;expect(totals(await r.imports.ledger(),'AUD').spending).toBe(0n);expect(pendingCommitments(await r.imports.ledger(),'AUD')).toBe(10000n);await r.imports.stage(b);expect((await r.imports.review(b.id)).supersededCount).toBe(1);await r.imports.commit(b.id);const rows=await r.imports.ledger();expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({id,minor:'-7200',pending:false});expect(await r.imports.audit(id)).toHaveLength(1);expect((await driver.query('SELECT status FROM transactions'))[0]?.status).toBe('settled');await r.imports.rollback(b.id);expect((await r.imports.ledger())[0]).toMatchObject({id,minor:'-10000',pending:true});});
 it('keeps mixed-source ledger identical in all 24 orders',()=>{const rows=Array.from({length:21},(_,i)=>({date:`2026-03-${String(i+1).padStart(2,'0')}`,amount:`-${i+1}`}));const docs=[doc('march.pdf',rows,2),doc('week1.csv',rows.slice(0,7)),doc('week2.csv',rows.slice(7,14)),doc('week3.csv',rows.slice(14))];const permutations=<T,>(a:T[]):T[][]=>a.length?a.flatMap((v,i)=>permutations(a.filter((_,j)=>i!==j)).map(p=>[v,...p])):[[]];const expected=reconcile(docs);for(const order of permutations(docs))expect(reconcile(order)).toEqual(expected);expect(expected).toHaveLength(21);expect(expected.every(r=>r.sources.length===2)).toBe(true);});
 it('unions four overlapping weekly exports without duplicates',()=>{const docs=Array.from({length:4},(_,w)=>{const d=doc(`week${w}`,Array.from({length:14},(_,i)=>({date:new Date(Date.UTC(2026,2,1+w*7+i)).toISOString().slice(0,10),amount:`-${w*7+i+1}`})));d.context={...context,period:{start:d.rows[0]!.date,end:d.rows.at(-1)!.date}};return d;});expect(reconcile(docs)).toHaveLength(35);expect(coverage(docs.map(d=>d.context.period))).toHaveLength(1);});
 it('shows nine-day staleness and deliberately overlaps seven covered days',()=>{const d={...doc('old',[]),status:'committed' as const,context:{...context,period:{start:'2026-03-01',end:'2026-03-22'}}};expect(accountFreshness('a',[d],'2026-03-31')).toMatchObject({stale:true,staleDays:9,exportStart:'2026-03-16',rangeText:'16 March 2026 to 31 March 2026'});expect(newestIsStale(['a'],[d],'2026-03-31')).toBe(true);});
 it('keeps CDR disabled and throws a clear unavailable error',async()=>{expect(sourceFeatures.cdr).toBe(false);await expect(new CdrSource().fetch(options)).rejects.toThrow('not available in this build');});
});

it('parses all six synthetic bank export shapes through FileSource',async()=>{for(const name of readdirSync('fixtures/exports').filter(n=>n!=='ambiguous.csv')){const d=await new FileSource(new Uint8Array(readFileSync('fixtures/exports/'+name)),name,name.startsWith('commbank')?'CommBank':'Westpac').fetch(options);expect(d.rows.map(r=>r.minor)).toEqual(['-1200','-800']);expect(d.parser).toContain(name.startsWith('commbank')?'commbank':'westpac');}});
it('keeps downstream modules outside file parsers',()=>{const walk=(path:string):string[]=>readdirSync(path,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path+'/'+e.name):[path+'/'+e.name]);for(const path of [...walk('src/ui'),...walk('src/ledger'),'src/ingest/service.ts','src/ingest/pipeline.ts',...walk('src/ingest/reconcile'),...walk('src/ingest/normalize')])expect(readFileSync(path,'utf8'),path).not.toMatch(/(?:from|import\()\s*['"][^'"]*\/(?:parse|extract)(?:\/|['"])/);});
it('commits a multi-file session atomically',async()=>{const {r}=await repo();const a=doc('one',[{date:'2026-03-13',amount:'-1'}]),b=doc('two',[{date:'2026-03-14',amount:'-2'}]);await r.imports.stage(a);await r.imports.stage(b);await expect(r.imports.commitSession([a.id,'missing'])).rejects.toThrow();expect(await r.imports.ledger()).toHaveLength(0);await r.imports.commitSession([a.id,b.id]);expect(await r.imports.ledger()).toHaveLength(2);});
// The two numbers move independently, which is the whole point of the pair: migration 4 added the
// fx_rates table, so the database version went to 4 while the export contract stayed at 2. A backup
// written before today still restores.
//
// ONE IS A LITERAL AND ONE IS DERIVED, deliberately. 2 is the export CONTRACT — a promise to every
// backup already written, so it is spelled out and changing it has to be a decision somebody typed.
// The storage version is a FACT about this database, and writing it as a literal only meant editing
// this line on every migration; asserting it equals migrations.length also catches the real bug, a
// migration declared but never applied.
it('keeps the export contract compatible and identifies the storage schema separately',async()=>{const {r}=await repo();const data=await r.exportAll();expect(data.schema_version).toBe(2);expect(data.database_schema_version).toBe(migrations.length);});
