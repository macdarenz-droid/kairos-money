import {AllocationBreakdown} from './AllocationBreakdown';
import {categoryAmounts} from '../../intelligence/allocations';
import {Cancellations} from './Cancellations';
import {activityHistory} from '../../intelligence/visuals/activity';
import {CategorySplit} from '../design/CategorySplit';
import {TimingCharts} from './TimingCharts';
import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useSession} from '../session';
import {useDisplayCurrency} from '../currency';
import {Amount,Button,Explain,Row,Sheet,Skeleton} from '../design/primitives';
import {SourceLine} from '../design/SourceLine';
import {currency,money} from '../../core/money';
import {localDay} from '../../ingest/reminders';
import {computeSignals} from '../../intelligence/signals';
import {dailyCashflow,moneyFingerprint,displayRatio} from '../../intelligence/visuals';
import {historical,type Snapshot,type Window} from '../../intelligence/model';

function monthWindow(today:string,offset:number):Window {
 const date=new Date(today+'T00:00:00Z');date.setUTCDate(1);date.setUTCMonth(date.getUTCMonth()-offset);
 const start=date.toISOString().slice(0,10);date.setUTCMonth(date.getUTCMonth()+1);date.setUTCDate(0);
 return {start,end:date.toISOString().slice(0,10)<today?date.toISOString().slice(0,10):today,label:start.slice(0,7)};
}
function point(index:number,radius:number){const angle=index*Math.PI*2/5-Math.PI/2;return `${120+Math.cos(angle)*radius},${120+Math.sin(angle)*radius}`;}
export function MoneyVisuals(){
 const session=useSession(),code=useDisplayCurrency(),[offset,setOffset]=useState(0),[detail,setDetail]=useState<{title:string;ids:string[];text:string}|null>(null);
 const today=localDay();const q=useQuery({queryKey:['visual-snapshot',today,code],queryFn:()=>session.run(r=>r.intelligence.snapshot(today,code)),enabled:session.state==='ready'});
 if(session.state!=='ready')return null;
 if(q.isPending)return <Skeleton label="Reading monthly history"/>;
 if(q.error)return <p role="alert">Monthly history could not be read. Reopen this screen to try again.</p>;
 const snapshot=q.data,latest=snapshot.transactions.filter(t=>t.date<=today).map(t=>t.date).sort().at(-1)??today,w=monthWindow(latest,offset),previous=monthWindow(latest,offset+1);
 const signalsFor=(window:Window)=>{const dated={...snapshot,asOf:window.end};if(window.end!==snapshot.asOf)delete dated.liquid;return computeSignals(dated,window);};
 const current=moneyFingerprint(signalsFor(w),w.label),prior=moneyFingerprint(signalsFor(previous),previous.label);
 const polygon=(f:typeof current)=>f.axes.every(a=>a.radius!==null)?f.axes.map((a,i)=>point(i,Number(a.radius)*.009)).join(' '):null;
 const shape=polygon(current),old=polygon(prior);const show=(title:string,ids:string[],text:string)=>setDetail({title,ids,text});
 const activity=activityHistory(snapshot,w,previous);
 const tx=historical(snapshot,w);const categories=new Map<string,{minor:bigint;ids:string[]}>();
 for(const t of tx){if(BigInt(t.minor)>=0n)continue;for(const p of categoryAmounts(t)){const row=categories.get(p.category)??{minor:0n,ids:[]};row.minor+=BigInt(p.minor);if(!row.ids.includes(t.id))row.ids.push(t.id);categories.set(p.category,row);}}
 const sorted=[...categories].sort((a,b)=>a[1].minor>b[1].minor?-1:1);
 return <section className="stack money-visuals" aria-label="Monthly money history">
 <h2>Money Fingerprint</h2>
 <label className="input-label">Compare month · {w.label}<input type="range" min="0" max="11" value={offset} aria-valuetext={`${w.label}, compared with ${previous.label}`} onChange={e=>setOffset(Number(e.target.value))}/></label>
 <svg viewBox="0 0 240 240" className="fingerprint" role="img" aria-label={`Money Fingerprint for ${w.label}${current.provisional?', provisional':''}`}>
 {[30,60,90].map(r=><polygon key={r} points={[0,1,2,3,4].map(i=>point(i,r)).join(' ')} fill="none" stroke="var(--border-default)"/>)}
 {current.axes.map((a,i)=><line key={a.key} x1="120" y1="120" x2={point(i,90).split(',')[0]} y2={point(i,90).split(',')[1]} stroke="var(--border-default)"/>)}
 {/* The spokes carried no marking at all, so the shape could not be decoded: five points and no way to
     tell which was which. These names are far too long to set around a 280px plot on a phone, so the
     chart and the list under it share a number instead. */}
 {current.axes.map((a,i)=><text key={`n${a.key}`} className="fingerprint-index"
   x={point(i,107).split(',')[0]} y={point(i,107).split(',')[1]} textAnchor="middle"
   dominantBaseline="middle" aria-hidden="true">{i+1}</text>)}
 {old&&<polygon points={old} fill="none" stroke="var(--text-secondary)" strokeDasharray="4 4"/>}{shape&&<polygon points={shape} fill="var(--accent)" fillOpacity=".12" stroke="var(--accent)"/>}
 {current.axes.map((a,i)=>a.radius===null?null:<circle key={a.key} cx={point(i,Number(a.radius)*.009).split(',')[0]} cy={point(i,Number(a.radius)*.009).split(',')[1]} r="3" fill="var(--accent)"/>)}
 </svg>
 {/* The number is the visual tie to the spoke and is hidden from the accessible name: someone who cannot
     see the chart gains nothing from "1" and would have to hear it before every label. */}
 {current.axes.map((a,i)=><Button key={a.key} variant="quiet" onClick={()=>show(a.label,a.evidence,`${a.reason}${a.value===null?'':` Value: ${a.value}.`}`)}><span aria-hidden="true">{i+1} · </span>{a.label}{a.value===null?' · Unknown':''}</Button>)}
 <h2>Daily cashflow</h2><Cashflow snapshot={snapshot} window={w} show={show}/>
 <TimingCharts snapshot={snapshot} window={w} show={show}/>
 
 <CategorySplit heading="Spending by category" code={currency(code)} slices={sorted.map(([name,row])=>({name,minor:row.minor.toString(),ids:row.ids}))}
  onCategory={name=>{const row=sorted.find(([other])=>other===name)?.[1];show(name,row?.ids??[],'Sum of settled spending in this category on covered days.');}}/>
 {activity.comparable&&activity.changes.length>0&&<h2>What changed</h2>}{activity.comparable&&activity.changes.map(c=><Row key={c.category} trailing={<Button variant="quiet" onClick={()=>show(c.category,c.ids,`Previous month ${c.previous}; selected month ${c.current} minor units. Difference is observed spending, not an inferred cause.`)}><Amount value={money(BigInt(c.difference),currency(code))} context={`change in ${c.category}`}/></Button>}>{c.category}</Row>)}
 {activity.recurring.length>0&&<span className="heading-row"><h2>Recurring costs</h2><Explain title="Recurring costs"><p>Patterns Kairos detected in your own payments, not confirmed contracts. A yearly figure assumes the current amount keeps repeating.</p><p>Removing one here does not cancel anything with the provider.</p></Explain></span>}{activity.recurring.map(r=><Row key={r.merchant} trailing={<Button variant="quiet" onClick={()=>show(r.merchant,r.evidence,`Estimated yearly cost ${r.annual} minor units; current payment ${r.minor}; repeats ${r.monthly?'monthly':`every ${r.interval} days`}. Before cancelling: check the provider and renewal date, save confirmation, then verify the next statement. Removing an expected bill does not cancel a contract.`)}><Amount value={money(BigInt(r.annual),currency(code))} context={`estimated yearly ${r.merchant}`}/></Button>}>{r.merchant}<p className="meta">Estimated yearly · next {r.next}</p></Row>)}
 <Cancellations code={currency(code)} merchants={activity.recurring.map(r=>r.merchant)} payments={historical(snapshot,{start:'1970-01-01',end:today,label:''}).filter(t=>BigInt(t.minor)<0n).map(t=>({merchant:t.description,date:t.date,id:t.id}))} review={(merchant,ids)=>show(merchant,ids,'Settled payments on dates after your recorded cancellation contact or confirmation. These may be final charges; check the provider confirmation and statement before acting.')}/>
 {activity.bills.length>0&&<span className="heading-row"><h2>Upcoming bills</h2><Explain title="Upcoming bills"><p>The next 30 days, worked out from payments that have already repeated. It is an expectation, not a confirmed charge — check dates with the provider.</p></Explain></span>}{activity.bills.map(b=><Row key={b.merchant+b.date} trailing={<Button variant="quiet" onClick={()=>show(b.merchant,b.ids,'Expected from previous settled payments; not confirmation of an upcoming charge.')}><Amount value={money(BigInt(b.minor),currency(code))} context={`expected ${b.merchant}`}/></Button>}>{b.date} · {b.merchant}</Row>)}
 {activity.merchants.length>0&&<h2>Merchant history</h2>}{activity.merchants.map(m=><Row key={m.name} trailing={<Button variant="quiet" onClick={()=>show(m.name,m.ids,`${m.count} settled purchases on covered days in ${w.label}.`)}><Amount value={money(BigInt(m.minor),currency(code))} context={m.name}/></Button>}>{m.name}<p className="meta">{m.count} purchases</p></Row>)}
 {detail&&<Sheet title={detail.title} onClose={()=>setDetail(null)}><p>{detail.text}</p>{snapshot.transactions.filter(t=>detail.ids.includes(t.id)).map(t=><div key={t.id}><Row trailing={<Amount value={money(BigInt(t.minor),t.currency)} context={t.description}/>}><h3>{t.description}</h3><p>{t.date} · {t.category}</p></Row><AllocationBreakdown parts={t.allocations} code={t.currency}/>{t.sources?.map((s,i)=><SourceLine key={i} file={s.file} row={s.row} raw={s.raw}/>)}</div>)}{!detail.ids.length&&<p>No source transactions are available for this value.</p>}</Sheet>}
 </section>;
}
function Cashflow({snapshot,window,show}:{snapshot:Snapshot;window:Window;show:(title:string,ids:string[],text:string)=>void}){
 const rows=dailyCashflow(snapshot,window);const max=rows.reduce((m,r)=>{const v=BigInt(r.net??'0');return (v<0n?-v:v)>m?(v<0n?-v:v):m;},1n);const segments:string[][]=[];let segment:string[]=[];
 rows.forEach((r,i)=>{if(r.net===null){if(segment.length)segments.push(segment);segment=[];}else {const unit=Number(displayRatio(r.net,max.toString()));segment.push(`${10+i*980/Math.max(rows.length-1,1)},${100-unit*80/1000000}`);}});if(segment.length)segments.push(segment);
 return <><Row trailing={<Amount value={money(max,snapshot.currency)} context="cashflow scale maximum"/>}>Scale maximum · {snapshot.currency}</Row><svg viewBox="0 0 1000 200" role="img" aria-label="Daily net cashflow. Hatched areas are coverage gaps; muted areas are stale days."><defs><pattern id="cashflow-gap" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M0 12L12 0" stroke="var(--border-default)"/></pattern></defs>{rows.map((r,i)=>r.net===null?<rect key={r.date} x={Math.max(0,10+(i-.5)*980/Math.max(rows.length-1,1))} y="0" width={980/Math.max(rows.length-1,1)} height="200" fill={r.state==='gap'?'url(#cashflow-gap)':'var(--surface-2)'}><title>{r.date}: {r.state==='gap'?'Missing coverage':r.state==='stale'?'Stale data':'Future'}</title></rect>:null)}<line x1="0" y1="100" x2="1000" y2="100" stroke="var(--border-default)"/>{segments.map((p,i)=><polyline key={i} points={p.join(' ')} stroke="var(--accent)" fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke"/>)}</svg><Row trailing={<Amount value={money(-max,snapshot.currency)} context="cashflow scale minimum"/>}>Scale minimum · {snapshot.currency}</Row><p className="meta">{window.start} to {window.end}. Hatched · no coverage. Muted · stale.</p><details><summary>Daily amounts and sources</summary>{rows.map(r=><Row key={r.date} trailing={r.net===null?<span>{r.state==='stale'?'Stale':r.state==='future'?'Future':'No coverage'}</span>:<Button variant="quiet" onClick={()=>show(r.date,r.evidence,`Income ${r.income}, spending ${r.spending}, net ${r.net} minor units. Covered settled transactions only.`)}><Amount value={money(BigInt(r.net),snapshot.currency)} context={`net cashflow ${r.date}`}/></Button>}>{r.date}</Row>)}</details></>;
}
