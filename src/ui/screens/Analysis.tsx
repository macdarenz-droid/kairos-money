import {useMemo,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {useSession} from '../session';
import {Amount,Button,DataGrid,Row,Sheet,Skeleton,Surface} from '../design/primitives';
import {currency,format,money} from '../../core/money';
import {localDay} from '../../ingest/reminders';
import {distress} from '../../intelligence/profile';
import {describeWindows,windows} from '../../intelligence/model';
import {analyse,buildIndex} from '../../analysis/index';
import {observe} from '../../analysis/observations/index';
import type {Metric} from '../../analysis/model';

const titles:Record<string,string>={
 combined_ledger:'Across your accounts',statement_reconciliation:'Against your statement',period_cashflow:'In and out',
 transfer_exclusion:'Moved between your accounts',credit_sign_rules:'Debits and credits',salary_pattern:'Pay',
 category_breakdown:'Largest category',merchant_breakdown:'Largest merchant',repeated_purchases:'Repeat purchases',
 small_payments:'Small payments together',frequency_versus_size:'Typical purchase',range_anomalies:'Outside the usual range',
 period_comparison:'Against last period',regular_versus_occasional:'Regular costs',payday_effect:'Around payday',
 weekday_distribution:'Busiest day',spending_clusters:'Heavy days',recurrence_detection:'Recurring commitments',
 recurring_price_change:'A recurring price changed',bnpl_commitments:'Buy now, pay later',remittances:'Sent in another currency',
 foreign_exchange:'Foreign amounts',fees:'Fees',refunds_and_chargebacks:'Refunds',cash_entries:'Cash',
 account_balances:'Balance',low_balance_episodes:'Days at or below zero',account_use:'Accounts used',surplus:'Left after essentials',
 balance_trajectory:'Balance direction',evidence_reports:'Rows a report can evidence',context_questions:'Needs context at import',
 budgets:'Against your budget',what_ifs:'A modelled change',conditional_forecasts:'If the pattern continues',
 exports_and_recompute:'What an export carries',
};

/** Money metrics render as amounts; counts render as plain integers with their unit. */
function reading(metric:Metric,code:string){
 if(metric.status!=='ok'||metric.value===null)return metric.reason||'Not enough evidence';
 if(metric.unit==='minor units')return format(money(BigInt(metric.value),currency(code)));
 return `${metric.value} ${metric.unit}`;
}

export function Analysis(){
 const session=useSession();
 const [code]=useState('AUD'),[detail,setDetail]=useState<{title:string;ids:string[];text:string}|null>(null);
 const today=localDay();
 const q=useQuery({queryKey:['analysis',today,code],queryFn:()=>session.run(r=>r.intelligence.snapshot(today,code)),enabled:session.state==='ready'});
 // Trailing 90 days ending on the last day the ledger covers, not on today. A month-to-date window is
 // below the 20-covered-day threshold for the first three weeks of every month; anchoring to today was
 // worse still, because someone who imports three months of statements ending three months ago has every
 // transaction this screen needs and none of them inside a window measured back from today. Their pattern
 // is not missing, it is just not recent, and those are different things.
 const window=useMemo(()=>q.data?describeWindows(q.data,today)[1]!:windows(today)[1]!,[q.data,today]);
 const result=useMemo(()=>{
  if(!q.data)return null;
  const index=buildIndex(q.data),metrics=analyse(q.data,window);
  // distress() reads the snapshot's own evidence here — recorded overdraft fees and rising high-interest
  // debt. The buffer-days condition belongs to the intelligence report, which owns signal computation and
  // writes its cache; opening this screen must not trigger that.
  return {metrics,observations:observe(index,metrics,window,{currency:currency(code),distress:distress(q.data,[])})};
 },[q.data,window,code]);

 if(session.state==='preview')return <p>Money analysis reads your encrypted ledger in the Android app.</p>;
 if(q.isPending)return <Skeleton label="Reading your money analysis"/>;
 if(q.error||!result)return <p role="alert">Your analysis could not be read. Lock and reopen Kairos before continuing.</p>;
 const {metrics,observations}=result;
 const ready=metrics.filter(m=>m.status==='ok');
 return <section className="section-gap">
  <div className="list-heading"><h2>Money analysis</h2><span className="meta">Trailing 90 days</span></div>
  {observations.map(o=><Surface key={o.id}>
   <p>{o.statement}</p>
   {o.figure&&'minor' in o.figure&&<Amount value={money(BigInt(o.figure.minor),o.figure.currency)} context={o.statement}/>}
   {o.conditional&&<p className="meta">{o.conditional.premise} A modelled amount, not an amount saved.</p>}
   {o.progress&&<DataGrid headings={['What happened','Modelled']} numeric={[0,1]}
     rows={[[format(money(BigInt(o.progress.actualMinor),currency(code))),format(money(BigInt(o.progress.scenarioMinor),currency(code)))]]}/>}
   {o.evidence.length>0&&<Button onClick={()=>setDetail({title:o.statement,ids:o.evidence,text:''})}>Show the transactions behind this</Button>}
  </Surface>)}
  <div className="list-heading"><h2>Measures</h2><span className="meta">{ready.length} of {metrics.length} with enough evidence</span></div>
  {metrics.map(m=><Row key={m.key} trailing={<span className="meta">{reading(m,code)}</span>}>
   <span>{titles[m.key]??m.key}</span>
   <p className="meta">{m.status==='ok'?`${m.coverage.coveredDays} covered days${m.unverified?', balance unverified':''}`:m.reason}</p>
   {m.evidence.length>0&&<Button onClick={()=>setDetail({title:titles[m.key]??m.key,ids:m.evidence,text:`Covered days ${m.coverage.coveredDays}. Gaps ${m.coverage.gaps.length}. Evidence ${m.details.evidenceTotal??m.evidence.length} transactions.`})}>Show evidence</Button>}
  </Row>)}
  {detail&&<Sheet title={detail.title} onClose={()=>setDetail(null)}>
   {detail.text&&<p>{detail.text}</p>}
   {/* These used to be listed as their internal ids, which are hashes. Forty lines of hex answered
       "which transactions?" with something no person can read. The transactions themselves are in the
       snapshot this figure was computed from, so show those. */}
   <p className="meta">The transactions behind this figure.</p>
   {q.data?.transactions.filter(t=>detail.ids.includes(t.id)).slice(0,50).map(t=>
    <Row key={t.id} trailing={<Amount value={money(BigInt(t.minor),t.currency)} context={t.description}/>}>
     {t.description}<p className="meta">{t.date}{t.category?' · '+t.category:' · Uncategorised'}</p></Row>)}
   {detail.ids.length>50&&<p className="meta">Showing the first 50 of {detail.ids.length}.</p>}
   {!q.data?.transactions.some(t=>detail.ids.includes(t.id))&&
    <p className="meta">These records are outside the window shown here, so their lines are not listed.</p>}
  </Sheet>}
 </section>;
}
