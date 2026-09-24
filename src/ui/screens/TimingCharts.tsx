import {paydayCurve,subscriptionTimeline} from '../../intelligence/visuals/timing';
import {displayRatio} from '../../intelligence/visuals';
import {day,type Snapshot,type Window} from '../../intelligence/model';
import {money} from '../../core/money';
import {Amount,Button,Row} from '../design/primitives';
export function TimingCharts({snapshot,window,show}:{snapshot:Snapshot;window:Window;show:(title:string,ids:string[],text:string)=>void}){
 const curve=paydayCurve(snapshot,window),timeline=subscriptionTimeline(snapshot,window);
 const ceiling=curve.points.reduce((max,p)=>BigInt(p.average??'0')>max?BigInt(p.average!):max,1n);
 const segments:string[][]=[];let segment:string[]=[];
 for(const p of curve.points){if(p.average===null){if(segment.length)segments.push(segment);segment=[];}else segment.push(`${10+p.offset*980/30},${190-Number(displayRatio(p.average,ceiling.toString()))*180/1000000}`);}if(segment.length)segments.push(segment);
 // "as a new user i dont need these yet... its good that if oneday surprise me with a visualisation".
 // A heading over a sentence explaining why there is no chart is the opposite of that: it takes the room
 // a chart would take and says nothing. Each half appears when it has observations, and not before.
 if(curve.status==='insufficient_data'&&!timeline.length)return null;
 return <>{curve.status!=='insufficient_data'&&<><h2>Spending after payday</h2><Row trailing={<Amount value={money(ceiling,snapshot.currency)} context="payday chart scale maximum"/>}>Scale maximum · {snapshot.currency}</Row><svg viewBox="0 0 1000 200" role="img" aria-label="Discretionary spending from payday through day 30. Missing observations break the line.">{segments.map((points,i)=><polyline key={i} points={points.join(' ')} stroke="var(--accent)" fill="none" strokeWidth="2" vectorEffect="non-scaling-stroke"/>)}</svg><Row trailing={<Amount value={money(0n,snapshot.currency)} context="payday chart scale minimum"/>}>Scale minimum</Row><Row trailing={<span>Day 30</span>}>Day 0 · payday</Row><details><summary>Payday amounts and sources</summary>{curve.points.map(p=><Row key={p.offset} trailing={p.average===null?<span>No covered observations</span>:<Button variant="quiet" onClick={()=>show(`Day ${p.offset} after pay`,p.ids,`Total discretionary spending ${p.total} minor units divided by ${p.days} covered days. Integer average rounds down to the nearest minor unit.`)}><Amount value={money(BigInt(p.average),snapshot.currency)} context={`average spending ${p.offset} days after pay`}/></Button>}>Day {p.offset}<p className="meta">{p.days} covered observations</p></Row>)}</details></>}
 {/* ONE timeline, not one per merchant. It used to draw a separate chart for every recurring payment,
     each with its own axis and its own disclosure underneath — four charts to answer "when do these
     leave", when the whole question is how they sit against each other on the same month. Now they share
     one axis and one scale, a lane each, and the lanes are numbered because these merchant labels are
     bank strings sixty characters long and will not fit beside a plot on a phone. */}
 {timeline.length>0&&<><h2>Recurring payment timeline</h2><p className="meta">{window.start} – {window.end}</p>
  <svg viewBox={`0 0 1000 ${20+timeline.length*52}`} className="timeline" role="img"
    aria-label={`Recurring payments from ${window.start} to ${window.end}. ${timeline.map(g=>`${g.merchant}: ${g.events.length}`).join('. ')}.`}>
   {timeline.map((group,lane)=>{const y=20+lane*52;
    return <g key={group.merchant} role="img" aria-label={`${group.merchant}: ${group.events.length} recorded payments.`}>
     <text x="14" y={y+10} className="timeline-index" aria-hidden="true">{lane+1}</text>
     <line x1="40" y1={y} x2="990" y2={y} stroke="var(--border-default)"/>
     {/* r=12, not 8: this viewBox is 1000 wide inside 371px of phone, so a radius of 8 drew a 6px dot —
         under the 8px floor a mark needs to be seen, let alone aimed at. */}
     {group.events.map(event=><circle key={event.id} r="12" cy={y} fill="var(--accent)"
       cx={40+(day(event.date)-day(window.start))*950/Math.max(1,day(window.end)-day(window.start))}><title>{`${group.merchant} · ${event.date}`}</title></circle>)}
    </g>;})}
  </svg>
  {/* The number ties the row to its lane and is hidden from the spoken name: someone who cannot see the
      chart gains nothing from hearing "3" before every merchant. Each row opens that merchant's payments,
      which is what the per-merchant disclosure used to do. */}
  {timeline.map((group,lane)=><Row key={group.merchant}
    trailing={<Button variant="quiet" onClick={()=>show(group.merchant,group.events.map(e=>e.id),'Recorded payments under this merchant label.')}>{group.events.length}</Button>}>
   <span aria-hidden="true">{lane+1} · </span>{group.merchant}</Row>)}
 </>}</>;
}
