import {AllocationBreakdown} from './AllocationBreakdown';
import {categoryAmounts} from '../../intelligence/allocations';
import {Cancellations} from './Cancellations';
import {activityHistory} from '../../intelligence/visuals/activity';
import {categoryTiles} from '../../intelligence/visuals/treemap';
import {TimingCharts} from './TimingCharts';
import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useSession} from '../session';
import {Amount,Button,Row,Sheet,Skeleton} from '../design/primitives';
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
 const session=useSession(),[code,setCode]=useState('AUD'),[offset,setOffset]=useState(0),[detail,setDetail]=useState<{title:string;ids:string[];text:string}|null>(null);
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
 const sorted=[...categories].sort((a,b)=>a[1].minor>b[1].minor?-1:1),total=sorted.reduce((n,[,r])=>n+r.minor,0n);
 return <section className="stack money-visuals" aria-label="Monthly money history">
 <h2>Money Fingerprint</h2><label className="input-label">History currency<select value={code} onChange={e=>setCode(e.target.value)}>{['AUD','USD','PHP','EUR','GBP','NZD','CAD','SGD','JPY','KWD'].map(c=><option key={c}>{c}</option>)}</select></label>
 <label className="input-label">Compare month · {w.label}<input type="range" min="0" max="11" value={offset} aria-valuetext={`${w.label}, compared with ${previous.label}`} onChange={e=>setOffset(Number(e.target.value))}/></label>
 <p className="meta">{w.label} · solid. {previous.label} · dashed. {current.provisional?'Provisional: incomplete coverage or missing inputs.':'Complete monthly inputs.'} {current.unverified?'Includes balance-unverified data.':''}</p>
 <svg viewBox="0 0 240 240" className="fingerprint" role="img" aria-label={`Money Fingerprint for ${w.label}${current.provisional?', provisional':''}`}>
 {[30,60,90].map(r=><polygon key={r} points={[0,1,2,3,4].map(i=>point(i,r)).join(' ')} fill="none" stroke="var(--border-default)"/>)}
 {current.axes.map((a,i)=><line key={a.key} x1="120" y1="120" x2={point(i,90).split(',')[0]} y2={point(i,90).split(',')[1]} stroke="var(--border-default)"/>)}
 {old&&<polygon points={old} fill="none" stroke="var(--text-secondary)" strokeDasharray="4 4"/>}{shape&&<polygon points={shape} fill="var(--accent)" fillOpacity=".12" stroke="var(--accent)"/>}
 {current.axes.map((a,i)=>a.radius===null?null:<circle key={a.key} cx={point(i,Number(a.radius)*.009).split(',')[0]} cy={point(i,Number(a.radius)*.009).split(',')[1]} r="3" fill="var(--accent)"/>)}
 </svg>
 {!shape&&<p>Missing axes stay unknown. No complete shape is inferred.</p>}
 {current.axes.map(a=><Button key={a.key} variant="quiet" onClick={()=>show(a.label,a.evidence,`${a.reason} ${a.value===null?'Unknown':`Stored signal value: ${a.value}.`} Shape uses a fixed display scale, not a diagnosis or a score of financial worth.`)}>{a.label} · {a.value===null?'Unknown':'View evidence'}</Button>)}
 <h2>Daily cashflow</h2><Cashflow snapshot={snapshot} window={w} show={show}/>
 <TimingCharts snapshot={snapshot} window={w} show={show}/>
 <h2>Spending by category</h2><p className="meta">Settled spending on covered days only. Transfers and pending entries are excluded.</p>
 {total===0n?<p>No covered spending for this month.</p>:<><svg viewBox="0 0 1000 600" role="img" aria-label="Category treemap. Rectangle area represents settled spending; exact amounts and sources follow below.">{categoryTiles(sorted.map(([name,row])=>({name,minor:row.minor.toString()}))).map((tile,i)=><g key={tile.name}><title>{tile.name}</title><rect x={tile.x} y={tile.y} width={tile.width} height={tile.height} fill={`var(--surface-${i%2+2})`} stroke="var(--border-default)"/>{tile.width>150&&tile.height>70&&<text x={tile.x+20} y={tile.y+40} fill="var(--text-primary)" fontSize="32">{tile.name.length>Math.floor(tile.width/20)?tile.name.slice(0,Math.max(1,Math.floor(tile.width/20)-2))+'…':tile.name}</text>}</g>)}</svg>{sorted.map(([name,row])=><Row key={name} trailing={<Button variant="quiet" onClick={()=>show(name,row.ids,'Sum of settled spending in this category on covered days.')}><Amount value={money(row.minor,currency(code))} context={name}/></Button>}>{name}</Row>)}</>}
 <h2>What changed</h2>{!activity.comparable?<p>Two fully covered months are needed for a fair monthly comparison.</p>:activity.changes.map(c=><Row key={c.category} trailing={<Button variant="quiet" onClick={()=>show(c.category,c.ids,`Previous month ${c.previous}; selected month ${c.current} minor units. Difference is observed spending, not an inferred cause.`)}><Amount value={money(BigInt(c.difference),currency(code))} context={`change in ${c.category}`}/></Button>}>{c.category}</Row>)}
 <h2>Recurring costs</h2><p className="meta">Detected patterns, not confirmed contracts. Yearly figures assume the current amount repeats.</p>{!activity.recurring.length&&<p>No supported recurring pattern yet.</p>}{activity.recurring.map(r=><Row key={r.merchant} trailing={<Button variant="quiet" onClick={()=>show(r.merchant,r.evidence,`Estimated yearly cost ${r.annual} minor units; current payment ${r.minor}; repeats ${r.monthly?'monthly':`every ${r.interval} days`}. Before cancelling: check the provider and renewal date, save confirmation, then verify the next statement. Removing an expected bill does not cancel a contract.`)}><Amount value={money(BigInt(r.annual),currency(code))} context={`estimated yearly ${r.merchant}`}/></Button>}>{r.merchant}<p className="meta">Estimated yearly · next {r.next}</p></Row>)}
 <Cancellations code={currency(code)} merchants={activity.recurring.map(r=>r.merchant)} payments={historical(snapshot,{start:'1970-01-01',end:today,label:''}).filter(t=>BigInt(t.minor)<0n).map(t=>({merchant:t.description,date:t.date,id:t.id}))} review={(merchant,ids)=>show(merchant,ids,'Settled payments on dates after your recorded cancellation contact or confirmation. These may be final charges; check the provider confirmation and statement before acting.')}/>
 <h2>Upcoming bills</h2><p className="meta">Next 30 days from observed recurrences. Confirm dates with the provider.</p>{activity.bills.map(b=><Row key={b.merchant+b.date} trailing={<Button variant="quiet" onClick={()=>show(b.merchant,b.ids,'Expected from previous settled payments; not confirmation of an upcoming charge.')}><Amount value={money(BigInt(b.minor),currency(code))} context={`expected ${b.merchant}`}/></Button>}>{b.date} · {b.merchant}</Row>)}
 <h2>Merchant history</h2>{activity.merchants.map(m=><Row key={m.name} trailing={<Button variant="quiet" onClick={()=>show(m.name,m.ids,`${m.count} settled purchases on covered days in ${w.label}.`)}><Amount value={money(BigInt(m.minor),currency(code))} context={m.name}/></Button>}>{m.name}<p className="meta">{m.count} purchases</p></Row>)}
 {detail&&<Sheet title={detail.title} onClose={()=>setDetail(null)}><p>{detail.text}</p>{snapshot.transactions.filter(t=>detail.ids.includes(t.id)).map(t=><div key={t.id}><Row trailing={<Amount value={money(BigInt(t.minor),t.currency)} context={t.description}/>}><h3>{t.description}</h3><p>{t.date} · {t.category}</p></Row><AllocationBreakdown parts={t.allocations} code={t.currency}/>{t.sources?.map((s,i)=><SourceLine key={i} file={s.file} row={s.row} raw={s.raw}/>)}</div>)}{!detail.ids.length&&<p>No source transactions are available for this value.</p>}</Sheet>}
 </section>;
}
function Cashflow({snapshot,window,show}:{snapshot:Snapshot;window:Window;show:(title:string,ids:string[],text:string)=>void}){
 const rows=dailyCashflow(snapshot,window);const max=rows.reduce((m,r)=>{const v=BigInt(r.net??'0');return (v<0n?-v:v)>m?(v<0n?-v:v):m;},1n);const segments:string[][]=[];let segment:string[]=[];
 rows.forEach((r,i)=>{if(r.net===null){if(segment.length)segments.push(segment);segment=[];}else {const unit=Number(displayRatio(r.net,max.toString()));segment.push(`${10+i*980/Math.max(rows.length-1,1)},${100-unit*80/1000000}`);}});if(segment.length)segments.push(segment);
 return <><Row trailing={<Amount value={money(max,snapshot.currency)} context="cashflow scale maximum"/>}>Scale maximum · {snapshot.currency}</Row><svg viewBox="0 0 1000 200" role="img" aria-label="Daily net cashflow. Hatched areas are coverage gaps; muted areas are stale days."><defs><pattern id="cashflow-gap" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M0 12L12 0" stroke="var(--border-default)"/></pattern></defs>{rows.map((r,i)=>r.net===null?<rect key={r.date} x={Math.max(0,10+(i-.5)*980/Math.max(rows.length-1,1))} y="0" width={980/Math.max(rows.length-1,1)} height="200" fill={r.state==='gap'?'url(#cashflow-gap)':'var(--surface-2)'}><title>{r.date}: {r.state==='gap'?'Missing coverage':r.state==='stale'?'Stale data':'Future'}</title></rect>:null)}<line x1="0" y1="100" x2="1000" y2="100" stroke="var(--border-default)"/>{segments.map((p,i)=><polyline key={i} points={p.join(' ')} stroke="var(--accent)" fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke"/>)}</svg><Row trailing={<Amount value={money(-max,snapshot.currency)} context="cashflow scale minimum"/>}>Scale minimum · zero is the centre line</Row><p className="meta">{window.start} to {window.end}. Hatched areas are missing coverage. Muted areas are the stale live edge. Neither is treated as zero spending.</p><details><summary>Daily amounts and sources</summary>{rows.map(r=><Row key={r.date} trailing={r.net===null?<span>{r.state==='stale'?'Stale':r.state==='future'?'Future':'No coverage'}</span>:<Button variant="quiet" onClick={()=>show(r.date,r.evidence,`Income ${r.income}, spending ${r.spending}, net ${r.net} minor units. Covered settled transactions only.`)}><Amount value={money(BigInt(r.net),snapshot.currency)} context={`net cashflow ${r.date}`}/></Button>}>{r.date}</Row>)}</details></>;
}
