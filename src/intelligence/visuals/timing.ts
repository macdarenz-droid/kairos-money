import {covered,dates,day,historical,type Snapshot,type Window} from '../model';
import {recurrences} from '../forecast';

/** Observed settled spending, grouped by days since the latest recorded pay. */
export function paydayCurve(snapshot:Snapshot,window:Window){
 const pays=[...new Set(snapshot.pays.filter(p=>p.currency===snapshot.currency&&p.date<=window.end).map(p=>p.date))].sort();
 if(pays.length<3)return {status:'insufficient_data' as const,points:[]};
 const rows=historical(snapshot,window).filter(t=>t.kind==='discretionary'&&BigInt(t.minor)<0n);
 const byDate=new Map<string,typeof rows>();for(const row of rows){const group=byDate.get(row.date)??[];group.push(row);byDate.set(row.date,group);}
 const buckets=Array.from({length:31},(_,offset)=>({offset,days:0,total:0n,ids:[] as string[]}));
 for(const date of dates(window)){
  if(date>snapshot.asOf||!covered(snapshot,date))continue;
  const pay=pays.filter(p=>p<=date).at(-1);if(!pay)continue;
  const offset=day(date)-day(pay);if(offset>=buckets.length)continue;
  const bucket=buckets[offset]!;bucket.days++;
  for(const row of byDate.get(date)??[]){bucket.total-=BigInt(row.minor);bucket.ids.push(row.id);}
 }
 return {status:'ok' as const,points:buckets.map(b=>({offset:b.offset,days:b.days,total:b.total.toString(),average:b.days? (b.total/BigInt(b.days)).toString():null,ids:b.ids.sort()}))};
}

export function subscriptionTimeline(snapshot:Snapshot,window:Window){
 const rows=historical(snapshot,window);
 return recurrences(snapshot).map(r=>({merchant:r.merchant,events:rows.filter(t=>r.evidence.includes(t.id)).map(t=>({id:t.id,date:t.date,minor:(-BigInt(t.minor)).toString()})).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))})).filter(r=>r.events.length);
}
