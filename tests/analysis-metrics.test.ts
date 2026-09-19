import {describe,expect,it} from 'vitest';
import {analyse} from '../src/analysis/index';
import type {Metric} from '../src/analysis/model';
import type {Coverage,Pay,Snapshot,Transaction} from '../src/intelligence/model';
import {currency} from '../src/core/money';

const AUD=currency('AUD');
const month={start:'2026-03-01',end:'2026-03-31',label:'2026-03'};
function row(over:Partial<Transaction>&{id:string}):Transaction{
 return {accountId:'a',date:'2026-03-10',minor:'-1500',currency:AUD,description:'Cafe Mika',category:'Eating out',kind:'discretionary',status:'settled',transfer:false,recurring:false,...over};
}
function snap(transactions:Transaction[],over:Partial<Snapshot>={}):Snapshot{
 const coverage:Coverage[]=[{accountId:'a',start:'2026-01-01',end:'2026-03-31',tier:'A'}];
 return {asOf:'2026-03-31',currency:AUD,accountIds:['a'],coverage,pays:[],transactions,...over};
}
const get=(metrics:Metric[],key:string)=>metrics.find(m=>m.key===key)!;
const run=(transactions:Transaction[],over:Partial<Snapshot>={})=>analyse(snap(transactions,over),month);

describe('ledger and reconciliation (1-5)',()=>{
 it('nets income against spend exactly, in minor units',()=>{
  const m=get(run([row({id:'a',minor:'-1500'}),row({id:'b',minor:'-250'}),row({id:'c',minor:'400000',kind:'income'})]),'combined_ledger');
  expect(m.status).toBe('ok');
  expect(m.value).toBe('398250');
  expect(m.details.spend).toBe('1750');
  expect(m.details.income).toBe('400000');
 });

 it('reports pending separately instead of counting it',()=>{
  const m=get(run([row({id:'settled'}),row({id:'later',status:'pending',minor:'-99999'})]),'period_cashflow');
  expect(m.value).toBe('-1500');
  expect(m.details.pendingExcluded).toBe('1');
 });

 it('halves transfer legs and says they are excluded from income and spend',()=>{
  const metrics=run([row({id:'out',minor:'-50000',transfer:true}),row({id:'in',minor:'50000',transfer:true}),row({id:'spend'})]);
  const transfers=get(metrics,'transfer_exclusion');
  expect(transfers.value).toBe('50000');
  expect(transfers.details.legs).toBe('2');
  expect(get(metrics,'combined_ledger').value).toBe('-1500');
 });

 it('withholds reconciliation rather than inventing a balance',()=>{
  expect(get(run([row({id:'a'})]),'statement_reconciliation').status).toBe('insufficient_data');
  const verified=get(run([row({id:'a'})],{liquid:{minor:'123456',asOf:'2026-03-31',verified:true,evidence:['a']}}),'statement_reconciliation');
  expect(verified.value).toBe('123456');
  expect(verified.details.verified).toBe('true');
 });

 it('counts debits and credits so an inverted sign convention is visible',()=>{
  const m=get(run([row({id:'d1'}),row({id:'d2'}),row({id:'c1',minor:'2000',kind:'income'})]),'credit_sign_rules');
  expect(m.details).toMatchObject({debits:'2',credits:'1',zero:'0'});
 });
});

describe('income and classification (6-8)',()=>{
 it('takes salary from payslips, not from credits that merely look like salary',()=>{
  const pays:Pay[]=[
   {id:'p1',employer:'Acme',date:'2026-03-06',start:'2026-02-23',end:'2026-03-06',net:'250000',gross:'320000',currency:AUD,transactionId:'pay1'},
   {id:'p2',employer:'Acme',date:'2026-03-20',start:'2026-03-07',end:'2026-03-20',net:'260000',gross:'330000',currency:AUD,transactionId:null},
  ];
  const m=get(run([row({id:'pay1',minor:'250000',kind:'income'})],{pays}),'salary_pattern');
  expect(m.value).toBe('255000');
  expect(m.details).toMatchObject({payslips:'2',employers:'1',linkedToLedger:'1',lowest:'250000',highest:'260000'});
  expect(m.evidence).toEqual(['pay1']);
  const none=get(run([row({id:'looks-like-salary',minor:'250000',kind:'income'})]),'salary_pattern');
  expect(none.status).toBe('insufficient_data');
 });

 it('ranks categories by spend and keeps uncategorised as its own bucket',()=>{
  const m=get(run([
   row({id:'g1',category:'Groceries',minor:'-8000'}),
   row({id:'e1',category:'Eating out',minor:'-3000'}),
   row({id:'u1',category:'Uncategorised',minor:'-500'}),
  ]),'category_breakdown');
  expect(m.details.largest).toBe('Groceries');
  expect(m.value).toBe('8000');
  expect(m.details['category:Uncategorised']).toBe('500');
 });

 it('groups merchants on the normalized name so casing and spacing do not split them',()=>{
  const m=get(run([row({id:'m1',description:'  CAFE MIKA '}),row({id:'m2',description:'cafe mika'})]),'merchant_breakdown');
  expect(m.details.largest).toBe('cafe mika');
  expect(m.details.visits).toBe('2');
  expect(m.value).toBe('3000');
 });
});

describe('shape of spending (9-13)',()=>{
 it('finds repeats at one merchant',()=>{
  const m=get(run([row({id:'r1',date:'2026-03-03'}),row({id:'r2',date:'2026-03-17'}),row({id:'o',description:'Hardware',minor:'-9000'})]),'repeated_purchases');
  expect(m.value).toBe('2');
  expect(m.details.merchant).toBe('cafe mika');
 });

 it('calls a payment small relative to this person, at half the median purchase',()=>{
  const m=get(run([row({id:'big',minor:'-10000'}),row({id:'mid',minor:'-4000'}),row({id:'tiny',minor:'-300'})]),'small_payments');
  expect(m.details.thresholdMinor).toBe('2000');
  expect(m.value).toBe('300');
  expect(m.details.payments).toBe('1');
 });

 it('reports the largest tenth of purchases as a share of spend',()=>{
  const rows=Array.from({length:10},(_,i)=>row({id:'t'+i,minor:String(-1000*(i+1))}));
  const m=get(run(rows),'frequency_versus_size');
  expect(m.details.purchases).toBe('10');
  expect(m.details.largestTenthShare).toBe('18');
 });

 it('compares a purchase to its own merchant, not to all spending',()=>{
  const usual=[row({id:'u1',minor:'-1000'}),row({id:'u2',minor:'-1000'}),row({id:'u3',minor:'-1000'})];
  const m=get(run([...usual,row({id:'spike',minor:'-5000'}),row({id:'other',description:'Rent',minor:'-200000'})]),'range_anomalies');
  expect(m.value).toBe('1');
  expect(m.evidence).toEqual(['spike']);
 });

 it('withholds a period comparison when the prior period is not covered',()=>{
  const uncovered=get(run([row({id:'a'})],{coverage:[{accountId:'a',start:'2026-03-01',end:'2026-03-31',tier:'A'}]}),'period_comparison');
  expect(uncovered.status).toBe('insufficient_data');
  expect(uncovered.reason).toContain('2026-02');
  const compared=get(run([row({id:'now',minor:'-3000'}),row({id:'before',date:'2026-02-10',minor:'-1000'})]),'period_comparison');
  expect(compared.value).toBe('2000');
  expect(compared.details).toMatchObject({priorPeriod:'2026-02',current:'3000',previous:'1000',direction:'higher'});
 });
});

describe('coverage and confidence, shared by all 13',()=>{
 it('returns insufficient_data with a reason when the window is barely covered, never a zero',()=>{
  const thin=analyse(snap([row({id:'a',date:'2026-03-02'})],{coverage:[{accountId:'a',start:'2026-03-01',end:'2026-03-05',tier:'A'}]}),month);
  for(const m of thin){
   expect(m.status).toBe('insufficient_data');
   expect(m.value).toBeNull();
   expect(m.reason).toContain('20 covered days');
  }
  expect(thin[0]!.coverage.gaps.length).toBeGreaterThan(0);
 });

 it('reduces confidence and marks unverified when inputs are predominantly Tier C',()=>{
  const rows=[row({id:'a'})];
  const a=analyse(snap(rows),month);
  const c=analyse(snap(rows,{coverage:[{accountId:'a',start:'2026-01-01',end:'2026-03-31',tier:'C'}]}),month);
  expect(a[0]!.unverified).toBe(false);
  expect(c[0]!.unverified).toBe(true);
  expect(c[0]!.confidence).toBeLessThan(a[0]!.confidence);
 });

 it('is deterministic: the same snapshot produces the same metric bytes',()=>{
  const rows=[row({id:'a'}),row({id:'b',minor:'-700',description:'Other'})];
  expect(JSON.stringify(run(rows))).toBe(JSON.stringify(run(rows)));
 });

 it('cites ids only, never rows, and caps how many it carries',()=>{
  const rows=Array.from({length:200},(_,i)=>row({id:'t'+i,date:'2026-03-'+String(1+i%28).padStart(2,'0'),
   sources:[{file:'S.csv',row:String(i),raw:'x'.repeat(300)}]}));
  for(const m of run(rows)){
   expect(m.evidence.length).toBeLessThanOrEqual(50);
   expect(JSON.stringify(m)).not.toContain('xxx');
  }
  expect(Number(get(run(rows),'combined_ledger').details.evidenceTotal)).toBe(200);
 });
});
