import type { Currency } from '../core/money';
export type Kind = 'essential'|'discretionary'|'debt'|'income'|'savings'|'transfer'|'unknown'|'refund';
export type Transaction = { id:string; accountId:string; date:string; minor:string; currency:Currency; description:string; rawDescription?:string; refundOf?:string; allocations?:import('./allocations').Allocation[]; category:string; kind:Kind; status:'pending'|'settled'; transfer:boolean; recurring:boolean; instrument?:'card'|'bnpl'|'cash'|'transfer'; hour?:number; outsideRoutine?:boolean; planned?:boolean; overdraftFee?:boolean; sources?:{file:string;row:string;raw:string}[] };
export type Coverage = {accountId:string;start:string;end:string;tier:'A'|'B'|'C'};
export type Pay = {id:string;employer:string;date:string;start:string;end:string;net:string;gross:string;currency:Currency;transactionId:string|null};
export type Snapshot = {asOf:string;currency:Currency;accountIds:string[];transactions:Transaction[];coverage:Coverage[];pays:Pay[];liquid?:{minor:string;asOf:string;verified:boolean;evidence:string[]}; selfReport?:{planning:number;adherence:number;enjoyment:number;awareness:number}; committedLiability?:{minor:string;evidence:string[]}; commitmentsKnown?:boolean; highInterestDebt?:{previous:string;current:string;evidence:string[]}};
export type Window = {start:string;end:string;label:string};
export const keys=['buffer_days','impulse_ratio','payday_decay','spend_volatility','category_concentration','subscription_drag','fixed_burden','savings_consistency','friction_profile','late_night_share','small_leak_index','recovery_lag'] as const;
export type Key=typeof keys[number];
export type Signal={key:Key;version:1;period:string;status:'ok'|'insufficient_data';value:string|null;unit:string;reason:string;confidence:number;unverified:boolean;inputs:{window:Window;coveredDays:number;transactions:Transaction[];coverage:Coverage[];pays:Pay[];liquid:Snapshot['liquid']|null;selfReport:Snapshot['selfReport']|null};evidence:string[];details:Record<string,string>};
export const sum=(xs:bigint[])=>xs.reduce((a,b)=>a+b,0n);
export const abs=(x:bigint)=>x<0n?-x:x;
export function median(xs:bigint[]):bigint {const a=[...xs].sort((x,y)=>x<y?-1:x>y?1:0);return a.length? a.length%2?a[Math.floor(a.length/2)]!:(a[a.length/2-1]!+a[a.length/2]!)/2n:0n;}
export const ratio=(a:bigint,b:bigint)=>b>0n?a*10000n/b:0n;
export function day(s:string):number {if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||Number.isNaN(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)throw new Error('Invalid calendar date.');return Math.floor(Date.parse(s)/86400000);}
export const iso=(d:number)=>new Date(d*86400000).toISOString().slice(0,10);
export const shift=(s:string,n:number)=>iso(day(s)+n);
export function dates(w:Window):string[]{const n=day(w.end)-day(w.start)+1;if(n<1||n>3660)throw new Error('Unsupported date window.');return Array.from({length:n},(_,i)=>shift(w.start,i));}
export function windows(asOf:string):Window[]{const start=asOf.slice(0,7)+'-01';return [{start,end:asOf,label:asOf.slice(0,7)},{start:shift(asOf,-89),end:asOf,label:'trailing-90:'+asOf}];}
export function covered(s:Snapshot,date:string){return s.accountIds.length>0&&s.accountIds.every(id=>s.coverage.some(c=>c.accountId===id&&c.start<=date&&c.end>=date));}
export function historical(s:Snapshot,w:Window){return s.transactions.filter(t=>t.currency===s.currency&&s.accountIds.includes(t.accountId)&&t.status==='settled'&&!t.transfer&&t.kind!=='transfer'&&t.date>=w.start&&t.date<=w.end&&covered(s,t.date));}
export function sqrt(n:bigint):bigint{if(n<0n)throw new Error('Negative variance.');if(n<2n)return n;let x=n,y=(x+1n)/2n;while(y<x){x=y;y=(x+n/x)/2n;}return x;}
export function cv(xs:bigint[]):bigint {if(!xs.length)return 0n;const n=BigInt(xs.length),total=sum(xs);if(total<=0n)return 0n;return sqrt(sum(xs.map(x=>(x*n-total)**2n))*100000000n/n)/total;}
