import {day,median} from '../../intelligence/model';
import type {MetricFn,RecurrenceGroup} from '../model';
import {build} from '../metric';

/** Median gap in days between consecutive occurrences, which is what makes a repeat a schedule. */
function cadence(group:RecurrenceGroup):bigint{
 const days=[...group.dates].sort().map(day);
 const gaps:bigint[]=[];
 for(let i=1;i<days.length;i++)gaps.push(BigInt(days[i]!-days[i-1]!));
 return gaps.length?median(gaps):0n;
}

/** 18 — recurrence detection, reading the grouping built once in the shared pre-pass. */
export const recurrenceDetection:MetricFn=(index,window)=>{
 const m=build(index,window,'recurrence_detection','count');
 const active=index.recurrence.filter(g=>g.dates.some(d=>d>=window.start&&d<=window.end)&&g.ids.length>2);
 if(!active.length)return [m.none('No merchant repeats often enough in this window to describe a schedule.')];
 const ranked=active.map(g=>({group:g,cadence:cadence(g)})).filter(e=>e.cadence>0n)
  .sort((a,b)=>b.group.ids.length-a.group.ids.length||a.group.merchant.localeCompare(b.group.merchant));
 if(!ranked.length)return [m.none('Repeats exist but none has a measurable interval between occurrences.')];
 const details:Record<string,string>={commitments:String(ranked.length)};
 for(const e of ranked.slice(0,10))details['every:'+e.group.merchant]=e.cadence.toString()+' days';
 return [m.ok(String(ranked.length),details,ranked.flatMap(e=>e.group.ids))];
};

/**
 * 19 — a price change on something that recurs.
 *
 * The comparison is the most recent amount against the median of the earlier ones for the same
 * commitment, so a single unusual month does not read as a permanent rise.
 */
export const recurringPriceChange:MetricFn=(index,window)=>{
 const m=build(index,window,'recurring_price_change','minor units');
 const changes=index.recurrence.filter(g=>g.ids.length>2&&g.dates.some(d=>d>=window.start&&d<=window.end)).flatMap(g=>{
  const ordered=g.dates.map((date,i)=>({date,minor:BigInt(g.amounts[i]!),id:g.ids[i]!})).sort((a,b)=>a.date.localeCompare(b.date));
  const latest=ordered[ordered.length-1]!,earlier=ordered.slice(0,-1);
  if(!earlier.length)return [];
  const was=median(earlier.map(e=>e.minor<0n?-e.minor:e.minor)),now=latest.minor<0n?-latest.minor:latest.minor;
  return was>0n&&now!==was?[{merchant:g.merchant,was,now,id:latest.id,change:now-was}]:[];
 });
 if(!changes.length)return [m.none('No recurring commitment changed price in this window.')];
 const largest=changes.reduce((a,b)=>(b.change<0n?-b.change:b.change)>(a.change<0n?-a.change:a.change)?b:a);
 return [m.ok(largest.change.toString(),{merchant:largest.merchant,was:largest.was.toString(),now:largest.now.toString(),
  direction:largest.change>0n?'higher':'lower',changed:String(changes.length)},changes.map(c=>c.id))];
};

/**
 * 20 — buy-now-pay-later commitments and their schedule.
 *
 * BNPL is read from the instrument the user recorded, never inferred from a merchant name: an instalment
 * plan and an ordinary card purchase at the same retailer are not distinguishable from the statement.
 */
export const bnplCommitments:MetricFn=(index,window)=>{
 const m=build(index,window,'bnpl_commitments','minor units');
 const rows=(index.byInstrument.get('bnpl')??[]).filter(t=>t.date>=window.start&&t.date<=window.end);
 if(!rows.length)return [m.none('No transaction in this window is recorded as buy-now-pay-later.')];
 const outstanding=rows.reduce((sum,t)=>sum+(BigInt(t.minor)<0n?-BigInt(t.minor):BigInt(t.minor)),0n);
 const plans=index.recurrence.filter(g=>g.ids.some(id=>rows.some(t=>t.id===id)));
 const details:Record<string,string>={instalments:String(rows.length),plans:String(plans.length)};
 for(const p of plans.slice(0,10))details['every:'+p.merchant]=cadence(p).toString()+' days';
 return [m.ok(outstanding.toString(),details,rows.map(t=>t.id))];
};
