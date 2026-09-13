import {currencyDigits} from '../../core/money';
import {covered,cv,dates,day,historical,keys,median,ratio,shift,sum,type Snapshot,type Window,type Signal,type Key} from '../model';
export function computeSignals(s:Snapshot,w:Window):Signal[]{
 const days=dates(w),valid=days.filter(d=>covered(s,d)),rows=historical(s,w),expenses=rows.filter(t=>BigInt(t.minor)<0n),income=sum(rows.filter(t=>t.kind==='income'&&BigInt(t.minor)>0n).map(t=>BigInt(t.minor))),disc=expenses.filter(t=>t.kind==='discretionary'),discTotal=sum(disc.map(t=>-BigInt(t.minor)));
 const unverified=valid.some(d=>s.accountIds.some(id=>!s.coverage.some(c=>c.accountId===id&&c.start<=d&&c.end>=d&&c.tier!=='C')));
 const confidence=Math.floor(valid.length/days.length*(unverified?50:100));
 const inputs={window:w,coveredDays:valid.length,transactions:s.transactions,coverage:s.coverage,pays:s.pays,liquid:s.liquid??null,selfReport:s.selfReport??null};
 const base=(key:Key):Signal=>({key,version:1,period:w.label,status:'insufficient_data',value:null,unit:'basis points',reason:'At least 20 covered days and 80% window coverage are needed.',confidence,unverified,inputs,evidence:rows.map(t=>t.id),details:{}});
 const result=keys.map(base); if(valid.length<20||valid.length*5<days.length*4)return result;
 const set=(key:Key,value:bigint|null,unit:string,reason:string,evidence=rows.map(t=>t.id),details:Record<string,string>={})=>{const r=result.find(x=>x.key===key)!;Object.assign(r,{status:value===null?'insufficient_data':'ok',value:value?.toString()??null,unit,reason:value===null?reason:'',evidence,details});};
 const daily=(kind?:string)=>valid.map(d=>sum(expenses.filter(t=>t.date===d&&(!kind||t.kind===kind)).map(t=>-BigInt(t.minor))));
 const essential=median(daily('essential'));
 set('buffer_days',s.liquid&&s.liquid.asOf===w.end&&s.liquid.verified&&essential>0n?BigInt(s.liquid.minor)*10000n/essential:null,'days × 10000','A verified liquid balance at the window end and non-zero median essential spend are required.',[...expenses.filter(t=>t.kind==='essential').map(t=>t.id),...(s.liquid?.evidence??[])]);
 set('spend_volatility',sum(daily())>0n?cv(daily()):null,'basis points','No settled spending in this window.');
 const cat=new Map<string,bigint>();for(const t of expenses)cat.set(t.category,(cat.get(t.category)??0n)-BigInt(t.minor));const total=sum([...cat.values()]);
 set('category_concentration',total>0n&&!expenses.some(t=>t.kind==='unknown')?sum([...cat.values()].map(v=>v*v))*10000n/(total*total):null,'basis points','Categorise spending before measuring concentration.');
 set('subscription_drag',income>0n?ratio(sum(expenses.filter(t=>t.recurring).map(t=>-BigInt(t.minor))),income):null,'basis points','Recorded net income is required.',rows.filter(t=>t.recurring||t.kind==='income').map(t=>t.id));
 set('fixed_burden',income>0n&&!expenses.some(t=>t.kind==='unknown')?ratio(sum(expenses.filter(t=>['essential','debt'].includes(t.kind)).map(t=>-BigInt(t.minor))),income):null,'basis points','Categorised spending and recorded net income are required.');
 const limit=15n*10n**BigInt(currencyDigits[s.currency]),small=disc.filter(t=>-BigInt(t.minor)<limit),smallTotal=sum(small.map(t=>-BigInt(t.minor)));
 set('small_leak_index',discTotal>0n?BigInt(small.length)*smallTotal:null,'count × minor units','Categorised discretionary spending is required.',small.map(t=>t.id),{count:String(small.length),total:smallTotal.toString(),share:ratio(smallTotal,discTotal).toString(),limit:limit.toString()});
 const ticket=median(disc.map(t=>-BigInt(t.minor)));
 set('impulse_ratio',discTotal>0n&&disc.every(t=>t.planned!==undefined&&t.outsideRoutine!==undefined)?ratio(sum(disc.filter(t=>!t.planned&&!t.recurring&&t.outsideRoutine&&-BigInt(t.minor)<=ticket).map(t=>-BigInt(t.minor))),discTotal):null,'basis points','Explicit planning and routine context are missing; merchant names cannot establish intent.',disc.map(t=>t.id));
 set('late_night_share',discTotal>0n&&disc.every(t=>t.hour!==undefined)?ratio(sum(disc.filter(t=>t.hour!>=22||t.hour!<3).map(t=>-BigInt(t.minor))),discTotal):null,'basis points','Purchase-local times are missing; posting dates are not purchase times.',disc.map(t=>t.id));
 const instruments:Record<string,string>={};for(const instrument of ['card','bnpl','cash','transfer'])instruments[instrument]=ratio(sum(expenses.filter(t=>t.instrument===instrument).map(t=>-BigInt(t.minor))),total).toString();
 set('friction_profile',total>0n&&expenses.every(t=>t.instrument)?BigInt(instruments.card!)+BigInt(instruments.bnpl!):null,'card/BNPL share in basis points','Explicit payment instruments are missing; account type is not an instrument.',expenses.map(t=>t.id),instruments);
 const pays=s.pays.filter(p=>p.currency===s.currency&&p.date<=w.end).sort((a,b)=>a.date.localeCompare(b.date));let early=0n,rest=0n,cycles=0;const cycleEvidence:string[]=[];
 for(let i=0;i<pays.length-1;i++){const p=pays[i]!,next=pays[i+1]!;if(p.date<w.start||next.date>w.end||day(next.date)-day(p.date)<4)continue;const span=dates({start:p.date,end:shift(next.date,-1),label:''});if(!span.every(d=>covered(s,d)))continue;cycles++;for(const t of expenses.filter(t=>t.date>=p.date&&t.date<next.date)){cycleEvidence.push(t.id);if(day(t.date)-day(p.date)<3)early-=BigInt(t.minor);else rest-=BigInt(t.minor);}}
 set('payday_decay',new Set(pays.map(p=>p.employer)).size===1&&cycles>=2&&rest>0n?ratio(early,rest):null,'basis points','A single identifiable income cycle and two complete covered cycles with spending outside days 1–3 are required.',cycleEvidence,{early:early.toString(),rest:rest.toString(),cycles:String(cycles)});
 const monthEnd=shift(w.end.slice(0,7)+'-01',-1),months: {start:string;end:string;label:string}[]=[];let end=monthEnd;for(let i=0;i<6;i++){const start=end.slice(0,7)+'-01';months.unshift({start,end,label:start.slice(0,7)});end=shift(start,-1);}
 const full=months.every(m=>dates(m).every(d=>covered(s,d)));const totals=months.map(m=>{const r=historical(s,m);return {net:sum(r.map(t=>BigInt(t.minor))),spend:sum(r.filter(t=>BigInt(t.minor)<0n).map(t=>-BigInt(t.minor))),rows:r};});
 set('savings_consistency',full?BigInt(totals.filter(m=>m.net>0n).length):null,'months of 6','Six fully covered completed calendar months are required.',totals.flatMap(m=>m.rows.map(t=>t.id)));
 const baseline=median(totals.slice(0,3).map(m=>m.spend));const overspent=totals.findIndex((m,i)=>i>=3&&m.spend>baseline&&m.net<0n);let lag:bigint|null=null;
 if(full&&baseline>0n&&overspent>=0){const from=shift(months[overspent]!.end,1);for(const d of dates({start:from,end:w.end,label:''})){const trail={start:shift(d,-29),end:d,label:''};if(trail.start<from||!dates(trail).every(x=>covered(s,x)))continue;const spent=sum(historical(s,trail).filter(t=>BigInt(t.minor)<0n).map(t=>-BigInt(t.minor)));if(spent<=baseline){lag=BigInt(day(d)-day(from)+1);break;}}}
 set('recovery_lag',lag,'days','A covered overspend month and a subsequent recovered 30-day baseline are required.',historical(s,{start:months[0]!.start,end:w.end,label:''}).map(t=>t.id));
 return result;
}
