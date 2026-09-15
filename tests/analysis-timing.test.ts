import {describe,expect,it} from 'vitest';
import {analyse,buildIndex,registry} from '../src/analysis/index';
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
const subscription=(n:number)=>Array.from({length:n},(_,i)=>row({id:'sub'+i,description:'Netflix',minor:'-1999',date:'2026-0'+(i<2?'1':i<3?'2':'3')+'-1'+(i%2?'5':'0')}));

describe('costs and timing (14-17)',()=>{
 it('splits regular from occasional using the shared recurrence grouping',()=>{
  const m=get(run([...subscription(4),row({id:'once',description:'Hardware',minor:'-9000',date:'2026-03-12'})]),'regular_versus_occasional');
  expect(m.details.regularPayments).toBe('1');
  expect(m.details.occasionalPayments).toBe('1');
  expect(m.details.occasional).toBe('9000');
 });

 it('requires a payslip before claiming a payday effect, and compares daily averages',()=>{
  const rows=[row({id:'p1',date:'2026-03-06',minor:'-6000'}),row({id:'p2',date:'2026-03-07',minor:'-6000'}),row({id:'q1',date:'2026-03-20',minor:'-1000'})];
  expect(get(run(rows),'payday_effect').status).toBe('insufficient_data');
  const pays:Pay[]=[{id:'p',employer:'Acme',date:'2026-03-06',start:'2026-02-23',end:'2026-03-06',net:'250000',gross:'320000',currency:AUD,transactionId:null}];
  const m=get(run(rows,{pays}),'payday_effect');
  expect(m.status).toBe('ok');
  expect(m.details.paydays).toBe('1');
  expect(m.details.direction).toBe('higher');
  // 12000 over 3 payday days against 1000 over the remaining 28 covered days.
  expect(m.details.perDayNearPayday).toBe('4000');
  expect(m.details.perDayOtherDays).toBe('35');
 });

 it('names the busiest weekday from the shared weekday grouping',()=>{
  const m=get(run([row({id:'mon',date:'2026-03-02',minor:'-9000'}),row({id:'tue',date:'2026-03-03',minor:'-1000'})]),'weekday_distribution');
  expect(m.details.busiest).toBe('Monday');
  expect(m.value).toBe('9000');
 });

 it('counts a clustered day against the usual covered day, not against zero',()=>{
  const rows=[row({id:'a',date:'2026-03-02',minor:'-1000'}),row({id:'b',date:'2026-03-03',minor:'-1000'}),row({id:'spike',date:'2026-03-04',minor:'-9000'})];
  const m=get(run(rows),'spending_clusters');
  expect(m.value).toBe('1');
  expect(m.details.heaviestDay).toBe('2026-03-04');
  expect(m.evidence).toEqual(['spike']);
 });
});

describe('recurrence (18-20)',()=>{
 it('detects a schedule and reports its interval',()=>{
  const m=get(run(subscription(4)),'recurrence_detection');
  expect(m.status).toBe('ok');
  expect(Number(m.value)).toBeGreaterThan(0);
  expect(Object.keys(m.details).some(k=>k.startsWith('every:netflix'))).toBe(true);
 });

 it('compares a new price to the median of earlier ones, not to one previous month',()=>{
  const rows=[...subscription(3),row({id:'risen',description:'Netflix',minor:'-2499',date:'2026-03-28'})];
  const m=get(rows.length?run(rows):[],'recurring_price_change');
  expect(m.status).toBe('ok');
  expect(m.details.direction).toBe('higher');
  expect(m.details.was).toBe('1999');
  expect(m.details.now).toBe('2499');
  expect(m.value).toBe('500');
 });

 it('reads buy-now-pay-later from the recorded instrument, never from a merchant name',()=>{
  const named=[row({id:'looks-bnpl',description:'Afterpay Store',minor:'-4000',date:'2026-03-05'})];
  expect(get(run(named),'bnpl_commitments').status).toBe('insufficient_data');
  const recorded=[row({id:'plan1',instrument:'bnpl',minor:'-2500',date:'2026-03-05'}),row({id:'plan2',instrument:'bnpl',minor:'-2500',date:'2026-03-19'})];
  const m=get(run(recorded),'bnpl_commitments');
  expect(m.value).toBe('5000');
  expect(m.details.instalments).toBe('2');
 });

 it('shares the recurrence grouping instead of recomputing it',()=>{
  // Emptying the shared grouping must silence every capability that depends on recurrence. If any of
  // them regrouped the transactions itself, it would still report a schedule here.
  const index=buildIndex(snap(subscription(4)));
  expect(index.recurrence.length).toBeGreaterThan(0);
  index.recurrence=[];
  const metrics=registry.flatMap(metric=>metric(index,month));
  for(const key of ['recurrence_detection','recurring_price_change','repeated_purchases'])
   expect(get(metrics,key).status).toBe('insufficient_data');
  expect(get(metrics,'regular_versus_occasional').details.regularPayments).toBe('0');
 });
});

describe('instruments and adjustments (21-26)',()=>{
 const foreign={postedMinor:'-15000',postedCurrency:AUD,originalMinor:'-10000',originalCurrency:currency('USD'),note:'Sent home'};

 it('reports money sent in another currency from stored evidence, without claiming a purpose',()=>{
  expect(get(run([row({id:'plain'})]),'remittances').status).toBe('insufficient_data');
  const m=get(run([row({id:'sent',minor:'-15000',foreign})]),'remittances');
  expect(m.value).toBe('15000');
  expect(m.details.currencies).toBe('USD');
  expect(m.details.basis).toContain('not inferred');
 });

 it('uses the stored original amounts and never invents a rate',()=>{
  expect(get(run([row({id:'plain'})]),'foreign_exchange').status).toBe('insufficient_data');
  const m=get(run([row({id:'fx',minor:'-15000',foreign})]),'foreign_exchange');
  expect(m.details['posted:fx']).toBe('-15000 AUD');
  expect(m.details['original:fx']).toBe('-10000 USD');
 });

 it('separates an overdraft fee the user marked from other fees',()=>{
  const m=get(run([row({id:'f1',category:'Bank fee',minor:'-500'}),row({id:'od',category:'Bank fee',minor:'-1500',overdraftFee:true})]),'fees');
  expect(m.value).toBe('2000');
  expect(m.details).toMatchObject({fees:'2',overdraftFees:'1',overdraftMinor:'1500'});
 });

 it('counts confirmed refunds and how many point at a purchase',()=>{
  const m=get(run([row({id:'r',kind:'refund',category:'Refund',minor:'1500',refundOf:'p'}),row({id:'p',minor:'-1500'})]),'refunds_and_chargebacks');
  expect(m.value).toBe('1500');
  expect(m.details).toMatchObject({refunds:'1',linkedToPurchase:'1'});
 });

 it('reads cash from the recorded instrument',()=>{
  const m=get(run([row({id:'c',instrument:'cash',minor:'-2000'})]),'cash_entries');
  expect(m.value).toBe('2000');
 });

 it('withholds a balance that is not verified rather than showing it',()=>{
  expect(get(run([row({id:'a'})],{liquid:{minor:'5000',asOf:'2026-03-31',verified:false,evidence:['a']}}),'account_balances').status).toBe('insufficient_data');
  const m=get(run([row({id:'a'})],{liquid:{minor:'5000',asOf:'2026-03-31',verified:true,evidence:['a']},committedLiability:{minor:'2500',evidence:['a']}}),'account_balances');
  expect(m.value).toBe('5000');
  expect(m.details.committedLiability).toBe('2500');
 });
});
