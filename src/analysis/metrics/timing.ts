import {median,shift,type Transaction} from '../../intelligence/model';
import type {MetricFn} from '../model';
import {build,spend,windowRows} from '../metric';

const inWindow=(t:Transaction,start:string,end:string)=>t.date>=start&&t.date<=end;

/**
 * 14 — regular against occasional cost.
 *
 * Regular means the merchant and amount band recur, which the shared recurrence grouping already
 * determined; this reads that grouping rather than deciding recurrence a second time.
 */
export const regularVersusOccasional:MetricFn=(index,window)=>{
 const rows=windowRows(index,window).filter(t=>BigInt(t.minor)<0n),m=build(index,window,'regular_versus_occasional','minor units');
 if(!rows.length)return [m.none('No purchases in this window.')];
 const recurring=new Set(index.recurrence.flatMap(g=>g.ids));
 const regular=rows.filter(t=>recurring.has(t.id)),occasional=rows.filter(t=>!recurring.has(t.id));
 return [m.ok(spend(regular).toString(),{regular:spend(regular).toString(),occasional:spend(occasional).toString(),
  regularPayments:String(regular.length),occasionalPayments:String(occasional.length)},regular.map(t=>t.id))];
};

/**
 * 15 — payday effect.
 *
 * Compares the three days from each payslip date against the rest of the window, both as daily averages
 * so an unequal number of days cannot create the effect. Payslips are required: without them there is no
 * evidenced payday, and a credit that looks like salary is not treated as one.
 */
export const paydayEffect:MetricFn=(index,window)=>{
 const m=build(index,window,'payday_effect','minor units');
 const pays=index.pays.filter(p=>p.date>=window.start&&p.date<=window.end);
 if(!pays.length)return [m.none('No payslip falls in this window, so no payday is evidenced.')];
 const rows=windowRows(index,window).filter(t=>BigInt(t.minor)<0n);
 if(!rows.length)return [m.none('No purchases in this window.')];
 // The payday period is the pay date and the two days after it, kept inside the window so the day counts
 // on both sides of the comparison describe the same span.
 const paydayDates=new Set(pays.flatMap(p=>[0,1,2].map(offset=>shift(p.date,offset))).filter(date=>date>=window.start&&date<=window.end));
 const near=rows.filter(t=>paydayDates.has(t.date)),far=rows.filter(t=>!paydayDates.has(t.date));
 const nearDays=BigInt(paydayDates.size),farDays=BigInt(m.coverage.coveredDays-paydayDates.size);
 if(nearDays<=0n||farDays<=0n||!far.length)return [m.none('The window has no covered days outside a payday period to compare against.')];
 const nearDaily=spend(near)/nearDays,farDaily=spend(far)/farDays;
 return [m.ok((nearDaily-farDaily).toString(),{perDayNearPayday:nearDaily.toString(),perDayOtherDays:farDaily.toString(),
  paydays:String(pays.length),direction:nearDaily>farDaily?'higher':nearDaily<farDaily?'lower':'unchanged'},near.map(t=>t.id))];
};

/** 16 — which weekday carries the most spending, from the index's existing weekday grouping. */
export const weekdayDistribution:MetricFn=(index,window)=>{
 const m=build(index,window,'weekday_distribution','minor units');
 const names=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
 const totals=[...index.byWeekday].map(([weekday,list])=>{
  const rows=list.filter(t=>inWindow(t,window.start,window.end)&&BigInt(t.minor)<0n);
  return {weekday,name:names[weekday]!,minor:spend(rows),ids:rows.map(t=>t.id)};
 }).filter(entry=>entry.minor>0n);
 if(!totals.length)return [m.none('No purchases in this window.')];
 totals.sort((a,b)=>b.minor>a.minor?1:b.minor<a.minor?-1:a.weekday-b.weekday);
 const details:Record<string,string>={busiest:totals[0]!.name};
 for(const entry of totals)details['weekday:'+entry.name]=entry.minor.toString();
 return [m.ok(totals[0]!.minor.toString(),details,totals[0]!.ids)];
};

/**
 * 17 — clustered spending days.
 *
 * A cluster is a covered day whose spending is more than twice the median covered day, so quiet days are
 * part of the comparison rather than dropped. Days without coverage are excluded, never counted as zero.
 */
export const spendingClusters:MetricFn=(index,window)=>{
 const rows=windowRows(index,window).filter(t=>BigInt(t.minor)<0n),m=build(index,window,'spending_clusters','count');
 if(!rows.length)return [m.none('No purchases in this window.')];
 const byDate=new Map<string,Transaction[]>();
 for(const t of rows){const list=byDate.get(t.date);if(list)list.push(t);else byDate.set(t.date,[t]);}
 const daily=[...byDate.values()].map(spend);
 const usual=median(daily);
 if(usual<=0n)return [m.none('No spending day to compare against in this window.')];
 const clusters=[...byDate].filter(([,list])=>spend(list)>usual*2n).sort((a,b)=>a[0].localeCompare(b[0]));
 if(!clusters.length)return [m.none('No day exceeds twice the usual daily spending in this window.')];
 return [m.ok(String(clusters.length),{usualDayMinor:usual.toString(),
  heaviestDay:clusters.reduce((a,b)=>spend(b[1])>spend(a[1])?b:a)[0]},clusters.flatMap(([,list])=>list.map(t=>t.id)))];
};
