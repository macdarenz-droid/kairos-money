import {describe,expect,it} from 'vitest';
import {analyse} from '../src/analysis/index';
import {changedMetrics} from '../src/analysis/metrics/planning';
import {metricKeys,type Metric} from '../src/analysis/model';
import type {Coverage,Snapshot,Transaction} from '../src/intelligence/model';
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
const verified={minor:'100000',asOf:'2026-03-31',verified:true,evidence:['x']};

describe('position (27-30)',()=>{
 it('will not reconstruct a balance without a verified anchor',()=>{
  for(const key of ['low_balance_episodes','balance_trajectory']){
   expect(get(run([row({id:'a'})]),key).status).toBe('insufficient_data');
   expect(get(run([row({id:'a'})]),key).reason).toContain('Tier A');
  }
 });

 it('walks back from the verified balance rather than accumulating from zero',()=>{
  const m=get(run([row({id:'a',date:'2026-03-20',minor:'-40000'})],{liquid:verified}),'balance_trajectory');
  expect(m.status).toBe('ok');
  // Before the 20th the balance was 140,000; at month end it is the verified 100,000.
  expect(m.details.from).toBe('140000');
  expect(m.details.to).toBe('100000');
  expect(m.details.direction).toBe('lower');
 });

 it('counts days the reconstructed balance sat at or below zero',()=>{
  // Walking back from a positive verified balance, a low period is one the later income lifted: before
  // 150,000 arrived on the 20th the reconstructed balance was 100,000 - 150,000.
  const m=get(run([row({id:'wage',date:'2026-03-20',minor:'150000',kind:'income'})],{liquid:verified}),'low_balance_episodes');
  expect(m.status).toBe('ok');
  expect(m.value).toBe('19');
  expect(m.details.firstDay).toBe('2026-03-01');
  expect(m.details.lowestMinor).toBe('-50000');
 });

 it('reports no low day when the reconstruction never reaches zero',()=>{
  const m=get(run([row({id:'spend',date:'2026-03-05',minor:'-150000'})],{liquid:verified}),'low_balance_episodes');
  expect(m.value).toBe('0');
  expect(m.evidence).toEqual([]);
 });

 it('describes surplus as income less unavoidable cost, not the net of everything',()=>{
  const m=get(run([row({id:'pay',minor:'500000',kind:'income'}),row({id:'rent',minor:'-200000',kind:'essential'}),row({id:'fun',minor:'-30000'})]),'surplus');
  expect(m.value).toBe('300000');
  expect(m.details.basis).toContain('Not the net of all movement');
 });

 it('reports which accounts are actually used',()=>{
  const m=get(run([row({id:'a1'}),row({id:'a2'})]),'account_use');
  expect(m.details.accountsUsed).toBe('1');
  expect(m.details['account:a']).toBe('2');
 });
});

describe('reporting and planning (31-36)',()=>{
 it('separates rows a report can evidence from manual entries that have no source row',()=>{
  const m=get(run([row({id:'imported',sources:[{file:'S.csv',row:'1',raw:'{}'}]}),row({id:'manual'})]),'evidence_reports');
  expect(m.details).toMatchObject({transactions:'2',withSourceRow:'1',withoutSourceRow:'1'});
 });

 it('keeps context questions to import review and never phrases them as coaching',()=>{
  const m=get(run([row({id:'u',category:'Uncategorised'}),row({id:'k',kind:'unknown'})]),'context_questions');
  expect(m.value).toBe('2');
  expect(m.details.scope).toBe('import-review');
  // No question, no instruction, anywhere in what this capability emits.
  const text=[m.reason,...Object.values(m.details)].join(' ');
  expect(text).not.toContain('?');
  expect(text).not.toMatch(/\b(should|try|consider|you could|why not)\b/i);
 });

 it('will not invent a budget, and a goal is not a budget',()=>{
  const goal:NonNullable<Snapshot['goals']>=[{id:'g',name:'Rego',targetMinor:'100000',fundedMinor:'0',targetDate:'2026-12-01',kind:'sinking'}];
  expect(get(run([row({id:'a'})],{goals:goal}),'budgets').status).toBe('insufficient_data');
  const budget:NonNullable<Snapshot['goals']>=[{id:'b',name:'Eating out',targetMinor:'20000',fundedMinor:'0',targetDate:'2026-03-31',kind:'budget'}];
  const m=get(run([row({id:'a',minor:'-25000'})],{goals:budget}),'budgets');
  expect(m.details).toMatchObject({target:'20000',spent:'25000',state:'over'});
  expect(m.value).toBe('-5000');
 });

 it('marks a what-if hypothetical and never says an amount was saved',()=>{
  const m=get(run([row({id:'a',minor:'-10000'})]),'what_ifs');
  expect(m.value).toBe('1000');
  expect(m.details.hypothetical).toBe('true');
  expect(m.details.premise).toMatch(/^If /);
  expect(m.details.note).toContain('not an amount saved');
 });

 it('needs two covered months before projecting, and labels the projection conditional',()=>{
  expect(get(run([row({id:'a'})]),'conditional_forecasts').status).toBe('insufficient_data');
  const m=get(run([row({id:'feb',date:'2026-02-10',minor:'-4000'}),row({id:'mar',minor:'-6000'})]),'conditional_forecasts');
  expect(m.details.conditional).toBe('true');
  expect(m.details.monthsObserved).toBe('2');
 });

 it('diffs two stored metric sets instead of recomputing and forgetting',()=>{
  const before=run([row({id:'a',minor:'-1000'})]);
  const after=run([row({id:'a',minor:'-1000'}),row({id:'b',minor:'-2000'})]);
  const changes=changedMetrics(before,after);
  const cashflow=changes.find(c=>c.key==='period_cashflow')!;
  expect(cashflow.change).toBe('changed');
  expect(cashflow.from).toBe('-1000');
  expect(cashflow.to).toBe('-3000');
  expect(changedMetrics(before,before)).toEqual([]);
  // A retained set stays small because metrics cite the ledger rather than copying it (ADR/0036).
  expect(JSON.stringify(before).length).toBeLessThan(200_000);
 });
});

describe('the full set',()=>{
 it('produces all 36 capabilities from one snapshot',()=>{
  const rows=[row({id:'a'}),row({id:'b',minor:'-2000',date:'2026-03-12'}),row({id:'pay',minor:'500000',kind:'income',date:'2026-03-06'})];
  const produced=run(rows,{liquid:verified});
  expect(new Set(produced.map(m=>m.key)).size).toBe(36);
  expect(metricKeys.every(key=>produced.some(m=>m.key===key))).toBe(true);
 });
});
