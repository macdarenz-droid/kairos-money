import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {analyse,buildIndex} from '../src/analysis/index';
import {observe} from '../src/analysis/observations/index';
import type {Observation} from '../src/analysis/model';
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
const rows=[row({id:'a',minor:'-10000'}),row({id:'b',minor:'-4000',date:'2026-03-12'}),row({id:'c',minor:'-300',date:'2026-03-14'}),
 row({id:'prior',date:'2026-02-10',minor:'-2000'}),row({id:'pay',minor:'500000',kind:'income',date:'2026-03-06'}),
 row({id:'rent',minor:'-200000',kind:'essential',date:'2026-03-02'})];
function run(over:Partial<Snapshot>={}):Observation[]{
 const s=snap(rows,over);
 return observe(buildIndex(s),analyse(s,month),month,{currency:AUD});
}

describe('the declarative-template guard',()=>{
 const source=readFileSync('src/analysis/observations/index.ts','utf8');
 const statements=()=>run().map(o=>o.statement);

 it('asks nothing: no statement or template carries a question mark',()=>{
  for(const statement of statements())expect(statement).not.toContain('?');
  // The templates are checked as prose: interpolations are code, and ?? and ?. are operators rather than
  // questions, so they are stripped before the check instead of being allowed to mask a real one.
  for(const literal of source.match(/statement:[^\n]*/g)??[])
   expect(literal.replace(/\$\{[^}]*\}/g,'')).not.toContain('?');
 });

 it('instructs nothing: no imperative call to action appears in any statement',()=>{
  const imperatives=/\b(try|consider|start|stop|cut|reduce|avoid|switch|swap|set up|you should|you could|why not|make sure|remember to)\b/i;
  for(const statement of statements())expect(statement).not.toMatch(imperatives);
 });

 it('asserts no motive, intent or enjoyment a statement cannot evidence',()=>{
  const motives=/\b(want|wanted|crave|craving|enjoy|enjoyed|indulge|indulgent|splurge|binge|treat yourself|impulse|careless|lazy|wasteful|waste|guilty|bad habit|overspend)\b/i;
  for(const statement of statements())expect(statement).not.toMatch(motives);
 });

 it('carries no shame, diagnosis, urgency or punishment',()=>{
  const tone=/\b(you must|urgent|immediately|failing|failure|problem with you|too much|out of control|worrying|alarming)\b/i;
  for(const statement of statements())expect(statement).not.toMatch(tone);
 });

 it('has no action affordance in the type itself',()=>{
  // The guard is the type, not convention: nothing downstream can render an action it cannot read.
  const model=readFileSync('src/analysis/model.ts','utf8');
  const shape=model.slice(model.indexOf('export type Observation'),model.indexOf('};',model.indexOf('export type Observation')));
  for(const field of ['action','prompt','question','accept','dismiss','cta','experiment'])
   expect(shape).not.toContain(field+':');
 });
});

describe('the six concepts',()=>{
 it('produces each concept at most once and only from computed metrics',()=>{
  const concepts=run().map(o=>o.concept);
  expect(new Set(concepts).size).toBe(concepts.length);
  expect(concepts).toContain('understand');
  expect(concepts).toContain('dignity');
 });

 it('never invents a goal, and connects one the user recorded',()=>{
  expect(run().some(o=>o.concept==='goal_obstacle')).toBe(false);
  const goals:NonNullable<Snapshot['goals']>=[{id:'g',name:'New laptop',targetMinor:'200000',fundedMinor:'50000',targetDate:'2026-12-01',kind:'goal'}];
  const withGoal=run({goals}).find(o=>o.concept==='goal_obstacle')!;
  expect(withGoal).toBeDefined();
  expect(withGoal.statement).toContain('New laptop');
  expect(withGoal.figure).toEqual({minor:'150000',currency:AUD});
 });

 it('keeps a contribution conditional, with its premise beside it',()=>{
  const contribution=run().find(o=>o.concept==='contribution')!;
  expect(contribution.conditional).not.toBeNull();
  expect(contribution.conditional!.premise).toMatch(/^If /);
  expect(contribution.conditional!.perWeekMinor).toBe(contribution.figure&&'minor' in contribution.figure?contribution.figure.minor:'');
 });

 it('keeps what happened separate from what was modelled',()=>{
  const progress=run().find(o=>o.concept==='progress')!;
  expect(progress.progress).not.toBeNull();
  expect(progress.progress!.actualMinor).not.toBe(progress.progress!.scenarioMinor);
  expect(progress.statement).not.toMatch(/\bsaved\b/i);
 });

 it('states coverage limits plainly rather than reading a gap as no spending',()=>{
  const gapped=snap(rows,{coverage:[{accountId:'a',start:'2026-03-01',end:'2026-03-25',tier:'A'}]});
  const observation=observe(buildIndex(gapped),analyse(gapped,month),month,{currency:AUD}).find(o=>o.concept==='dignity')!;
  expect(observation.statement).toContain('no statement coverage');
  expect(observation.statement).toContain('rather than counting them as nothing');
 });

 it('reduces to orientation under distress, withholding conditional arithmetic and goals',()=>{
  const goals:NonNullable<Snapshot['goals']>=[{id:'g',name:'New laptop',targetMinor:'200000',fundedMinor:'0',targetDate:'2026-12-01',kind:'goal'}];
  const s=snap(rows,{goals});
  const calm=observe(buildIndex(s),analyse(s,month),month,{currency:AUD,distress:true}).map(o=>o.concept);
  expect(calm).toEqual(['understand','dignity']);
 });

 it('cites evidence by id, never by row',()=>{
  for(const o of run()){
   expect(JSON.stringify(o)).not.toContain('"sources"');
   for(const id of o.evidence)expect(rows.some(r=>r.id===id)).toBe(true);
  }
 });
});

describe('the sentence about the largest category',()=>{
 it('never presents repeated purchases as belonging to that category',()=>{
  // It read: "Uncategorised came to this much, across 23 purchases at transfer to marc masarate payid
  // phone from commbank app g." Two unrelated metrics joined by a comma, asserting that those purchases
  // were in that category, which they usually are not — and the "merchant" was a transfer description.
  const understand=run().find(o=>o.concept==='understand')!;
  expect(understand.statement).not.toContain('came to this much');
  expect(understand.statement).not.toMatch(/purchases at /);
 });

 it('says the largest kind of spending cannot be named when nothing is categorised',()=>{
  const bare=snap(rows.map(r=>({...r,category:'Uncategorised',kind:'discretionary' as const})));
  const understand=observe(buildIndex(bare),analyse(bare,month),month,{currency:AUD}).find(o=>o.concept==='understand')!;
  expect(understand.statement).toContain('cannot be named');
  // And it does not name "Uncategorised" as though it were a kind of spending.
  expect(understand.statement).not.toMatch(/^Uncategorised was/);
 });
});
