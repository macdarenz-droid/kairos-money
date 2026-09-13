import {covered,dates,historical,median,shift,type Snapshot} from './model';
import {recurrences} from './forecast';
import {sha256} from '@noble/hashes/sha256';
import {bytesToHex} from '@noble/hashes/utils';
export const noticeKinds=['bill','unusual','price','digest'] as const;
export type NoticeKind=typeof noticeKinds[number];
export type NoticePreferences=Record<NoticeKind,boolean>;
export const defaultNotices:NoticePreferences={bill:false,unusual:false,price:false,digest:false};
export type Notice={kind:NoticeKind;key:string;date:string};
/** Conservative observed-data prompts. No bank listener or claimed live detection. */
export function notificationPlan(s:Snapshot,p:NoticePreferences):Notice[]{
 const result:Notice[]=[];const add=(kind:NoticeKind,id:string,date:string)=>{if(p[kind])result.push({kind,key:bytesToHex(sha256(kind+':'+s.currency+':'+id)),date});};
 if(!covered(s,s.asOf))return result;
 const rows=historical(s,{start:shift(s.asOf,-179),end:s.asOf,label:'notifications'}).filter(t=>BigInt(t.minor)<0n);
 if(p.bill)for(const r of recurrences(s))if(r.next<=shift(s.asOf,14))add('bill',r.merchant+':'+r.next,shift(r.next,-1)<s.asOf?s.asOf:shift(r.next,-1));
 const prior=rows.filter(t=>t.date<s.asOf);const baseline=median(prior.map(t=>-BigInt(t.minor)));
 if(p.unusual&&prior.length>=20&&baseline>0n)for(const t of rows.filter(t=>t.date===s.asOf&&-BigInt(t.minor)>baseline*3n))add('unusual',t.id,s.asOf);
 if(p.price){const groups=new Map<string,typeof rows>();for(const t of rows){const key=t.description.trim().toLowerCase(),group=groups.get(key)??[];group.push(t);groups.set(key,group);}for(const group of groups.values()){
  group.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));const last=group.at(-1);if(!last||last.date!==s.asOf||group.length<4)continue;
  const earlier=group.slice(-4,-1),typical=median(earlier.map(t=>-BigInt(t.minor)));
  const intervals=earlier.slice(1).map((t,i)=>dates({start:earlier[i]!.date,end:t.date,label:''}).length-1);const latestInterval=dates({start:earlier[2]!.date,end:last.date,label:''}).length-1;
  if(typical>0n&&intervals.every(d=>d>=6&&d<=32&&Math.abs(d-latestInterval)<=3)&&earlier.every(t=>(-BigInt(t.minor)-typical)**2n*10000n<=typical**2n)&&-BigInt(last.minor)*100n>=typical*105n)add('price',last.id,s.asOf);
 }}
 if(p.digest){const end=shift(s.asOf.slice(0,7)+'-01',-1),start=end.slice(0,7)+'-01';if(dates({start,end,label:''}).every(d=>covered(s,d)))add('digest',s.currency+':'+start,s.asOf);}
 return result.sort((a,b)=>a.date.localeCompare(b.date)||noticeKinds.indexOf(a.kind)-noticeKinds.indexOf(b.kind)||a.key.localeCompare(b.key));
}
