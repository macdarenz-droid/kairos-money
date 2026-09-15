import {median} from '../../intelligence/model';
import type {Metric,MetricFn} from '../model';
import {build,spend,windowRows} from '../metric';

/**
 * 33 — budgets, against what the user actually recorded.
 *
 * A budget exists only if the user set one; none is invented, and a goal or sinking fund is not treated as
 * a budget. Spending is compared to the recorded target for the window.
 */
export const budgets:MetricFn=(index,window)=>{
 const m=build(index,window,'budgets','minor units');
 const recorded=(index.snapshot.goals??[]).filter(g=>g.kind==='budget');
 if(!recorded.length)return [m.none('No budget is recorded. A goal or sinking fund is not a budget.')];
 const rows=windowRows(index,window);
 const spent=spend(rows),target=recorded.reduce((sum,g)=>sum+BigInt(g.targetMinor),0n);
 return [m.ok((target-spent).toString(),{budgets:String(recorded.length),target:target.toString(),
  spent:spent.toString(),state:spent>target?'over':'within'},rows.map(t=>t.id))];
};

/**
 * 34 — what-if arithmetic, explicitly hypothetical.
 *
 * States its premise in the details and never claims the amount was saved. The figure is what a stated
 * reduction in discretionary spending would free over the window, at exact bigint precision.
 */
export const whatIfs:MetricFn=(index,window)=>{
 const rows=windowRows(index,window),m=build(index,window,'what_ifs','minor units');
 const discretionary=rows.filter(t=>t.kind==='discretionary'&&BigInt(t.minor)<0n);
 if(!discretionary.length)return [m.none('No discretionary spending in this window to model against.')];
 const base=spend(discretionary);
 return [m.ok((base/10n).toString(),{premise:'If one tenth of discretionary spending in this window had not occurred.',
  basis:base.toString(),hypothetical:'true',
  note:'A modelled amount, not an amount saved.'},discretionary.map(t=>t.id))];
};

/**
 * 35 — a conditional forecast from covered months only.
 *
 * Projects the median of the covered months already observed. Months with gaps are excluded rather than
 * counted as low-spending months, and the result is labelled conditional because it assumes the observed
 * pattern continues.
 */
export const conditionalForecasts:MetricFn=(index,window)=>{
 const m=build(index,window,'conditional_forecasts','minor units');
 const months=[...index.byMonth].filter(([label])=>label<=window.label).sort((a,b)=>a[0].localeCompare(b[0]));
 if(months.length<2)return [m.none('At least two covered months are needed before a pattern can be projected.')];
 const totals=months.map(([,rows])=>spend(rows));
 return [m.ok(median(totals).toString(),{monthsObserved:String(months.length),
  premise:'If the observed pattern of covered months continues.',conditional:'true',
  lowest:totals.reduce((a,b)=>b<a?b:a).toString(),highest:totals.reduce((a,b)=>b>a?b:a).toString()},[])];
};

/**
 * 36 — what an export would carry, and what changed since the last one.
 *
 * The diff itself is `changedMetrics` below, a pure comparison of two stored metric sets. This capability
 * reports what the current set covers so the export is describable before it is written.
 */
export const exportsAndRecompute:MetricFn=(index,window)=>{
 const rows=windowRows(index,window),m=build(index,window,'exports_and_recompute','count');
 if(!rows.length)return [m.none('No settled transactions in this window to export.')];
 return [m.ok(String(rows.length),{coveredDays:String(m.coverage.coveredDays),
  gaps:String(m.coverage.gaps.length),pendingExcluded:String(index.pending.filter(t=>t.date>=window.start&&t.date<=window.end).length)},
  rows.map(t=>t.id))];
};

/**
 * The change between two stored metric sets.
 *
 * Capability 36 is a diff, not a recompute-and-forget: the prior set is retained so the change itself is
 * evidence-linked. Both sides are metrics, which cite the ledger by id rather than copying it (ADR/0036),
 * so retaining a set stays small enough to store.
 */
export type MetricChange={key:Metric['key'];period:string;change:'new'|'changed';from:string|null;to:string|null;evidence:string[]};
export function changedMetrics(previous:Metric[],current:Metric[]):MetricChange[]{
 const before=new Map(previous.map(m=>[m.key+'|'+m.period,m]));
 return current.flatMap((now):MetricChange[]=>{
  const was=before.get(now.key+'|'+now.period);
  if(!was)return [{key:now.key,period:now.period,change:'new',from:null,to:now.value,evidence:now.evidence}];
  if(was.value===now.value&&was.status===now.status)return [];
  return [{key:now.key,period:now.period,change:'changed',from:was.value,to:now.value,evidence:now.evidence}];
 });
}
