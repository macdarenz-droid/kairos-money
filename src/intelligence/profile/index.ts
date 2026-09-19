import {covered,cv,dates,day,type Snapshot,type Signal} from '../model';
export type Profile={version:1;period:string;archetype:string|null;previous:string|null;movement:string;coveredDays:number;confidence:number;axes:Record<'Control'|'Impulse'|'Friction'|'Volatility',number|null>;reason:string;evidence:string[]};
export function distress(s:Snapshot,signals:Signal[]):boolean {const buffer=signals.find(x=>x.key==='buffer_days');return (buffer?.status==='ok'&&BigInt(buffer.value!)<50000n)||(s.highInterestDebt!==undefined&&BigInt(s.highInterestDebt.current)>BigInt(s.highInterestDebt.previous)&&s.highInterestDebt.evidence.length>0)||s.transactions.filter(t=>t.status==='settled'&&t.overdraftFee&&day(s.asOf)-day(t.date)>=0&&day(s.asOf)-day(t.date)<90).length>=2;}
export function profile(s:Snapshot,signals:Signal[],previous:string|null=null):Profile {
 const first=s.coverage.map(c=>c.start).sort()[0]??s.asOf;const n=dates({start:first,end:s.asOf,label:''}).filter(d=>covered(s,d)).length;
 const get=(key:Signal['key'])=>{const v=signals.find(x=>x.key===key);return v?.status==='ok'?BigInt(v.value!):null;};
 const score=(v:bigint|null)=>v===null?null:Number((v>10000n?10000n:v<0n?0n:v).toString())/100;
 const impulse=[get('impulse_ratio'),get('late_night_share'),get('payday_decay')];const savings=get('savings_consistency');
 const control=s.selfReport&&savings!==null?Math.round((s.selfReport.planning+s.selfReport.adherence+Number(savings.toString())*100/6)/3):null;
 const spendCv=get('spend_volatility'),payValues=s.pays.filter(p=>p.currency===s.currency).map(p=>BigInt(p.net));const incomeCv=payValues.length>=3?cv(payValues):null;
 const axes={Control:control,Impulse:impulse.every(v=>v!==null)?score(impulse.reduce<bigint>((a,v)=>a+(v??0n),0n)/3n):null,Friction:get('friction_profile')===null?null:100-score(get('friction_profile'))!,Volatility:spendCv!==null&&incomeCv!==null?score((spendCv+incomeCv)/2n):null};
 const p:Profile={version:1,period:s.asOf.slice(0,7),archetype:null,previous,movement:'',coveredDays:n,confidence:Math.floor(signals.filter(v=>v.status==='ok').reduce((a,v)=>a+v.confidence,0)/signals.length),axes,reason:'Still learning: at least 60 covered days are needed.',evidence:[...new Set(signals.flatMap(v=>v.evidence))]};
 if(n<60)return p;p.reason='Some observations are still missing. No pattern is assigned from missing inputs.';
 const leak=signals.find(v=>v.key==='small_leak_index'),drag=get('subscription_drag'),decay=get('payday_decay'),buffer=get('buffer_days'),recovery=get('recovery_lag');
 if(buffer!==null&&buffer<50000n&&recovery!==null&&recovery>30n)p.archetype='The Firefighter';
 else if(drag!==null&&drag>=2000n&&s.selfReport&&s.selfReport.awareness<40)p.archetype='The Collector';
 else if(incomeCv!==null&&incomeCv>=5000n&&decay!==null&&decay>=5000n)p.archetype='The Sprinter';
 else if(axes.Friction!==null&&axes.Friction<=30&&leak?.status==='ok'&&BigInt(leak.details.count??'0')>=10n&&BigInt(leak.details.share??'0')>=1000n)p.archetype='The Drifter';
 else if(control!==null&&control>=70&&s.selfReport&&s.selfReport.enjoyment<40&&get('fixed_burden')!==null&&get('fixed_burden')!<5000n)p.archetype='The Clencher';
 else if(control!==null&&control>=70&&axes.Volatility!==null&&axes.Volatility<30)p.archetype='The Anchor';
 if(p.archetype)p.reason=`Descriptive pattern based on ${n} covered days; not a diagnosis.`;
 p.movement=previous&&p.archetype&&previous!==p.archetype?`${previous} to ${p.archetype}`:'';return p;
}
