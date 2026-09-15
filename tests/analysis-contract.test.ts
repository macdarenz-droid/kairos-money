import {describe,expect,it} from 'vitest';
import {buildIndex,analyse,registry} from '../src/analysis/index';
import {metricKeys,type Metric} from '../src/analysis/model';
import {day,type Snapshot,type Transaction} from '../src/intelligence/model';
import {currency} from '../src/core/money';

const AUD=currency('AUD');
function row(over:Partial<Transaction>&{id:string}):Transaction{
 return {accountId:'a',date:'2026-03-02',minor:'-1500',currency:AUD,description:'Synthetic merchant',category:'Eating out',kind:'discretionary',status:'settled',transfer:false,recurring:false,...over};
}
function snapshot(over:Partial<Snapshot>={}):Snapshot{
 return {asOf:'2026-03-31',currency:AUD,accountIds:['a'],coverage:[{accountId:'a',start:'2026-03-01',end:'2026-03-31',tier:'A'}],pays:[],transactions:[],...over};
}
const window={start:'2026-03-01',end:'2026-03-31',label:'2026-03'};

describe('the shared pre-pass',()=>{
 it('separates pending and transfers structurally, so no capability has to remember to exclude them',()=>{
  const index=buildIndex(snapshot({transactions:[
   row({id:'settled'}),
   row({id:'pending',status:'pending'}),
   row({id:'transfer-flag',transfer:true}),
   row({id:'transfer-kind',kind:'transfer'}),
  ]}));
  expect(index.historical.map(t=>t.id)).toEqual(['settled']);
  expect(index.pending.map(t=>t.id)).toEqual(['pending']);
  expect(index.transfers.map(t=>t.id).sort()).toEqual(['transfer-flag','transfer-kind']);
  // A transfer is neither income nor spend, so it reaches no spending index.
  for(const map of [index.byMonth,index.byMerchant,index.byCategory,index.byWeekday,index.kinds])
   expect([...map.values()].flat().map(t=>t.id)).toEqual(['settled']);
 });

 it('excludes uncovered dates rather than treating a gap as zero',()=>{
  const index=buildIndex(snapshot({transactions:[row({id:'inside'}),row({id:'outside',date:'2026-02-14'})]}));
  expect(index.historical.map(t=>t.id)).toEqual(['inside']);
  expect(index.coveredDays.get('a')!.has(day('2026-03-15'))).toBe(true);
  expect(index.coveredDays.get('a')!.has(day('2026-02-14'))).toBe(false);
 });

 it('ignores other currencies and accounts the snapshot does not own',()=>{
  const index=buildIndex(snapshot({transactions:[
   row({id:'kept'}),
   row({id:'other-currency',currency:currency('USD')}),
   row({id:'other-account',accountId:'b'}),
  ]}));
  expect(index.historical.map(t=>t.id)).toEqual(['kept']);
 });

 it('groups recurrence once, keyed on normalized merchant and amount band, and shares it',()=>{
  const index=buildIndex(snapshot({transactions:[
   row({id:'r1',description:'  NETFLIX  ',minor:'-1999',date:'2026-03-01'}),
   row({id:'r2',description:'netflix',minor:'-1999',date:'2026-03-15'}),
   row({id:'once',description:'One off shop',minor:'-4200'}),
  ]}));
  const group=index.recurrence.find(g=>g.merchant==='netflix');
  expect(group?.ids).toEqual(['r1','r2']);
  expect(index.recurrence.some(g=>g.merchant==='one off shop')).toBe(false);
 });

 it('makes one pass: reading the index never depends on rescanning the snapshot',()=>{
  const transactions=Array.from({length:500},(_,i)=>row({id:'t'+i,date:'2026-03-'+String(1+i%28).padStart(2,'0')}));
  const source=snapshot({transactions});
  let reads=0;
  const watched=new Proxy(source,{get(target,property,receiver){if(property==='transactions')reads++;return Reflect.get(target,property,receiver);}});
  buildIndex(watched as Snapshot);
  expect(reads).toBe(1);
 });

 it('is deterministic: identical snapshot bytes produce identical index bytes',()=>{
  const transactions=[row({id:'a1'}),row({id:'a2',description:'Other',minor:'-900'})];
  const shape=(s:Snapshot)=>{const i=buildIndex(s);return JSON.stringify({historical:i.historical.map(t=>t.id),recurrence:i.recurrence,months:[...i.byMonth.keys()]});};
  expect(shape(snapshot({transactions}))).toBe(shape(snapshot({transactions})));
 });
});

describe('the metric contract, binding on every capability as it lands',()=>{
 it('enumerates all 36 capabilities exactly once',()=>{
  expect(metricKeys).toHaveLength(36);
  expect(new Set(metricKeys).size).toBe(36);
 });

 it('holds the shared invariants for every metric the registry produces',()=>{
  const index=buildIndex(snapshot({transactions:[row({id:'evidence-row'})]}));
  const produced:Metric[]=registry.flatMap(metric=>metric(index,window));
  // Passes vacuously at phase 5.0 and binds each family as it is added.
  for(const m of produced){
   expect(metricKeys).toContain(m.key);
   expect(m.version).toBe(1);
   expect(m.confidence).toBeGreaterThanOrEqual(0);
   expect(m.confidence).toBeLessThanOrEqual(10000);
   if(m.status==='insufficient_data'){expect(m.value).toBeNull();expect(m.reason.trim()).not.toBe('');}
   // Money stays exact: a value is an integer string, never a float or a Number.
   if(m.value!==null)expect(m.value).toMatch(/^-?\d+$/);
   // Evidence cites the ledger by id and resolves to a real row; it never carries the row itself.
   for(const id of m.evidence)expect(index.snapshot.transactions.some(t=>t.id===id)).toBe(true);
   expect(JSON.stringify(m)).not.toContain('"sources"');
   expect(JSON.stringify(m)).not.toContain('"rawDescription"');
  }
 });

 it('keeps a metric a citation, not a copy, however large the ledger',()=>{
  // ADR/0036: a stored signal that embedded its corpus wrote 45,721,866 bytes per screen open and cost
  // 37,403 ms of a 43,789 ms device Ledger load. A metric must not scale with corpus size.
  const size=(n:number)=>{
   const transactions=Array.from({length:n},(_,i)=>row({id:'t'+i,date:'2026-03-'+String(1+i%28).padStart(2,'0'),sources:[{file:'Synthetic.csv',row:String(i),raw:JSON.stringify({merchant:'Synthetic merchant',minor:'-1500',padding:'x'.repeat(200)})}]}));
   return JSON.stringify(analyse(snapshot({transactions}),window)).length;
  };
  const small=size(50),large=size(500);
  expect(large-small).toBeLessThan(20_000);
 });
});
