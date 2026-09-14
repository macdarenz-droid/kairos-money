import {categoryAmounts} from '../allocations';
import {historical,covered,dates,shift,type Snapshot,type Window} from '../model';
import {recurrences,scheduledDates} from '../forecast';
export function activityHistory(snapshot:Snapshot,current:Window,previous:Window){
 const merchants=new Map<string,{name:string;minor:bigint;count:number;ids:string[]}>();
 for(const row of historical(snapshot,current)){
  if(BigInt(row.minor)>=0n)continue;
  const key=row.description.trim().toLocaleLowerCase('en-AU');const group=merchants.get(key)??{name:row.description,minor:0n,count:0,ids:[]};
  group.minor-=BigInt(row.minor);group.count++;group.ids.push(row.id);merchants.set(key,group);
 }
 const sumCategories=(window:Window)=>{const result=new Map<string,{value:bigint;ids:string[]}>();for(const t of historical(snapshot,window)){if(BigInt(t.minor)>=0n)continue;for(const p of categoryAmounts(t)){const r=result.get(p.category)??{value:0n,ids:[]};r.value+=BigInt(p.minor);if(!r.ids.includes(t.id))r.ids.push(t.id);result.set(p.category,r);}}return result;};
 const a=sumCategories(current),b=sumCategories(previous);
 const complete=(w:Window)=>dates(w).every(d=>d<=snapshot.asOf&&covered(snapshot,d));
 const comparable=complete(current)&&complete(previous)&&current.end===new Date(Date.UTC(Number(current.start.slice(0,4)),Number(current.start.slice(5,7)),0)).toISOString().slice(0,10);
 const changes=comparable?[...new Set([...a.keys(),...b.keys()])].map(category=>({category,current:(a.get(category)?.value??0n).toString(),previous:(b.get(category)?.value??0n).toString(),difference:((a.get(category)?.value??0n)-(b.get(category)?.value??0n)).toString(),ids:[...(a.get(category)?.ids??[]),...(b.get(category)?.ids??[])]})).sort((x,y)=>{const v=BigInt(x.difference),w=BigInt(y.difference);return (v<0n?-v:v)>(w<0n?-w:w)?-1:1;}).slice(0,3):[];
 const recurring=recurrences(snapshot).map(r=>({...r,annual:(BigInt(r.minor)*BigInt(r.monthly?12:365)/BigInt(r.monthly?1:r.interval)).toString()}));
 const bills=recurring.flatMap(r=>scheduledDates(r,shift(snapshot.asOf,30)).map(date=>({date,merchant:r.merchant,minor:r.minor,ids:r.evidence}))).sort((a,b)=>a.date.localeCompare(b.date)||a.merchant.localeCompare(b.merchant));
 return {merchants:[...merchants.values()].sort((a,b)=>a.minor>b.minor?-1:1).map(r=>({...r,minor:r.minor.toString()})),changes,comparable,recurring,bills};
}
