import {abs,median,type Transaction} from '../../intelligence/model';
import type {MetricFn} from '../model';
import {build,spend,windowRows} from '../metric';

const magnitude=(t:Transaction)=>abs(BigInt(t.minor));

/** 9 — purchases repeated at the same merchant, which is where a small price recurs unnoticed. */
export const repeatedPurchases:MetricFn=(index,window)=>{
 const m=build(index,window,'repeated_purchases','count');
 const repeats=index.recurrence.map(g=>({...g,inWindow:g.dates.filter(d=>d>=window.start&&d<=window.end).length}))
  .filter(g=>g.inWindow>1).sort((a,b)=>b.inWindow-a.inWindow||a.merchant.localeCompare(b.merchant));
 if(!repeats.length)return [m.none('No merchant repeats within this window.')];
 const top=repeats[0]!;
 return [m.ok(String(top.inWindow),{merchant:top.merchant,repeatingMerchants:String(repeats.length),
  band:top.band},top.ids)];
};

/**
 * 10 — small payments, and what they come to together.
 *
 * The threshold is the window's own median purchase rather than a fixed figure, so "small" means small
 * for this person rather than small in the abstract.
 */
export const smallPayments:MetricFn=(index,window)=>{
 const rows=windowRows(index,window).filter(t=>BigInt(t.minor)<0n),m=build(index,window,'small_payments','minor units');
 if(rows.length<2)return [m.none('Too few purchases in this window to describe a usual size.')];
 const threshold=median(rows.map(magnitude))/2n;
 const small=rows.filter(t=>magnitude(t)<=threshold);
 if(!small.length)return [m.none('No purchases fall below half the usual size in this window.')];
 return [m.ok(spend(small).toString(),{payments:String(small.length),thresholdMinor:threshold.toString(),
  shareOfPurchases:(BigInt(small.length)*100n/BigInt(rows.length)).toString()},small.map(t=>t.id))];
};

/** 11 — frequency against size: whether spend is driven by many small purchases or a few large ones. */
export const frequencyVersusSize:MetricFn=(index,window)=>{
 const rows=windowRows(index,window).filter(t=>BigInt(t.minor)<0n),m=build(index,window,'frequency_versus_size','minor units');
 if(!rows.length)return [m.none('No purchases in this window.')];
 const sorted=[...rows].sort((a,b)=>magnitude(b)>magnitude(a)?1:magnitude(b)<magnitude(a)?-1:0);
 const top=sorted.slice(0,Math.max(1,Math.floor(sorted.length/10)));
 const all=spend(rows),concentrated=spend(top);
 return [m.ok(median(rows.map(magnitude)).toString(),{purchases:String(rows.length),
  medianMinor:median(rows.map(magnitude)).toString(),
  largestTenthShare:all>0n?(concentrated*100n/all).toString():'0'},top.map(t=>t.id))];
};

/**
 * 12 — purchases outside the usual range for their merchant.
 *
 * The comparison is per merchant against that merchant's own median, so a large weekly shop is not
 * flagged merely for being large. A merchant needs at least three prior purchases to have a range.
 */
export const rangeAnomalies:MetricFn=(index,window)=>{
 const m=build(index,window,'range_anomalies','count');
 const unusual:Transaction[]=[];
 for(const [,list] of index.byMerchant){
  if(list.length<3)continue;
  const usual=median(list.map(magnitude));
  if(usual<=0n)continue;
  for(const t of list){
   if(t.date<window.start||t.date>window.end)continue;
   if(magnitude(t)*100n>usual*200n)unusual.push(t);
  }
 }
 if(!unusual.length)return [m.none('No purchase exceeds twice its merchant’s usual amount in this window.')];
 unusual.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 return [m.ok(String(unusual.length),{comparison:'Twice the same merchant’s median purchase.',
  merchants:String(new Set(unusual.map(t=>t.description.trim().toLowerCase())).size)},unusual.map(t=>t.id))];
};

/**
 * 13 — this period against the one before it.
 *
 * The prior period must itself be covered, otherwise the comparison is withheld rather than reported
 * against a gap that would read as a fall in spending.
 */
export const periodComparison:MetricFn=(index,window)=>{
 const m=build(index,window,'period_comparison','minor units');
 const month=window.label.match(/^(\d{4})-(\d{2})$/);
 if(!month)return [m.none('Period comparison applies to a calendar month window.')];
 const year=Number(month[1]),index0=Number(month[2]);
 const prior=index0===1?`${year-1}-12`:`${year}-${String(index0-1).padStart(2,'0')}`;
 const current=index.byMonth.get(window.label)??[],previous=index.byMonth.get(prior)??[];
 if(!previous.length)return [m.none(`No covered settled transactions in ${prior} to compare against.`)];
 const now=spend(current),before=spend(previous);
 return [m.ok((now-before).toString(),{priorPeriod:prior,current:now.toString(),previous:before.toString(),
  direction:now>before?'higher':now<before?'lower':'unchanged'},current.map(t=>t.id))];
};
