import type {MetricFn} from '../model';
import {build,spend,windowRows} from '../metric';

/** 7 — categories, largest spend first. Uncategorised is reported, never folded into another bucket. */
export const categoryBreakdown:MetricFn=(index,window)=>{
 const rows=windowRows(index,window),m=build(index,window,'category_breakdown','minor units');
 if(!rows.length)return [m.none('No settled transactions in this window.')];
 const byCategory=new Map<string,typeof rows>();
 for(const t of rows){const list=byCategory.get(t.category);if(list)list.push(t);else byCategory.set(t.category,[t]);}
 const ranked=[...byCategory].map(([name,list])=>({name,minor:spend(list),count:list.length}))
  .filter(c=>c.minor>0n).sort((a,b)=>b.minor>a.minor?1:b.minor<a.minor?-1:a.name.localeCompare(b.name));
 if(!ranked.length)return [m.none('No spending to categorise in this window.')];
 const details:Record<string,string>={categories:String(ranked.length)};
 for(const c of ranked.slice(0,10))details['category:'+c.name]=c.minor.toString();
 return [m.ok(ranked[0]!.minor.toString(),{...details,largest:ranked[0]!.name},
  rows.filter(t=>t.category===ranked[0]!.name).map(t=>t.id))];
};

/** 8 — merchants, largest spend first, on the normalized name the index already grouped. */
export const merchantBreakdown:MetricFn=(index,window)=>{
 const m=build(index,window,'merchant_breakdown','minor units');
 const inWindow=[...index.byMerchant].map(([name,list])=>({name,list:list.filter(t=>t.date>=window.start&&t.date<=window.end)}))
  .filter(entry=>entry.list.length>0);
 if(!inWindow.length)return [m.none('No settled transactions in this window.')];
 const ranked=inWindow.map(e=>({name:e.name,minor:spend(e.list),count:e.list.length,ids:e.list.map(t=>t.id)}))
  .filter(e=>e.minor>0n).sort((a,b)=>b.minor>a.minor?1:b.minor<a.minor?-1:a.name.localeCompare(b.name));
 if(!ranked.length)return [m.none('No spending to attribute to a merchant in this window.')];
 const details:Record<string,string>={merchants:String(ranked.length),largest:ranked[0]!.name,visits:String(ranked[0]!.count)};
 for(const e of ranked.slice(0,10))details['merchant:'+e.name]=e.minor.toString();
 return [m.ok(ranked[0]!.minor.toString(),details,ranked[0]!.ids)];
};