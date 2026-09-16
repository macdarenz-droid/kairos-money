import {AllocationBreakdown} from './AllocationBreakdown';
import {displayRatio} from '../../intelligence/visuals';
import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {currency,money} from '../../core/money';
import {localDay} from '../../ingest/reminders';
import {spendingPatterns,countsAsMovement} from '../../intelligence/visuals/spending-patterns';
import {Amount,Button,Row,Sheet,Skeleton,Explain} from '../design/primitives';
import {SourceLine} from '../design/SourceLine';
import {SpendingCalendar} from '../design/SpendingCalendar';
import {FlowBar} from '../design/FlowBar';
import {MonthBalance} from '../design/MonthBalance';
import {CategorySplit} from '../design/CategorySplit';
import {useSession} from '../session';
export function SpendingPatterns(){
 const session=useSession(),[selectedCode,setCode]=useState<string|null>(null),[month,setMonth]=useState('all'),[account,setAccount]=useState('all'),[detail,setDetail]=useState<{title:string;ids:string[];text:string}|null>(null);
 const accounts=useQuery({queryKey:['accounts'],queryFn:()=>session.run(r=>r.accounts()),enabled:session.state==='ready'});
 const codes=[...new Set((accounts.data??[]).filter(a=>!a.archived_at).map(a=>a.currency))];const code=currency(selectedCode??(codes.includes('AUD')?'AUD':codes[0]??'AUD'));
 const today=localDay(),q=useQuery({queryKey:['spending-patterns',today,code],queryFn:()=>session.run(r=>r.intelligence.snapshot(today,code)),enabled:session.state==='ready'&&!!accounts.data,staleTime:0});
 if(session.state!=='ready')return null;
 if(accounts.error||q.error)return <p role="alert">Spending patterns could not be read. <Button onClick={()=>{void accounts.refetch();void q.refetch();}}>Retry</Button></p>;
 if(q.isPending)return <Skeleton label="Reading spending patterns"/>;
 const s=q.data,p=spendingPatterns(s,month,account),show=(title:string,ids:string[],text:string)=>setDetail({title,ids,text});
 const amount=(minor:string,context:string)=><Amount value={money(BigInt(minor),code)} context={context}/>;
 const top=p.merchants[0];
 // Whether a transfer counts depends on what is being looked at, and this is the whole difference between
 // the two views. Across ALL accounts, moving your own money is not spending and never was — counting it
 // would invent an expense that never happened. Looking at ONE account, the same movement genuinely left
 // it: money went out of this account and into another, and a picture of this account that hides that is
 // wrong about how much it holds. So a transfer leg is excluded in the pooled view and included in the
 // single-account view, where it appears negative on the account it left and positive on the one it
 // reached — which is the same leg, read from two sides.
 const counts=(t:{transfer:boolean;kind:string})=>countsAsMovement(t,account);
 // Daily totals for the calendar, from the same rows the rest of this screen counts, so the shape and the
 // lists below can never disagree.
 const daily=s.transactions.filter(t=>t.currency===code&&t.status==='settled'&&counts(t)
   &&(account==='all'||t.accountId===account)).map(t=>({date:t.date,minor:t.minor}));
 // Money in and money out per month, from the same rows the totals below are built from, so the picture
 // and the figures can never tell different stories.
 const byMonth=new Map<string,{received:bigint;spent:bigint}>();
 for(const t of p.rows){
  if(!counts(t))continue;
  const key=t.date.slice(0,7),cell=byMonth.get(key)??{received:0n,spent:0n},value=BigInt(t.minor);
  if(value>0n)cell.received+=value;else cell.spent-=value;
  byMonth.set(key,cell);
 }
 const monthFlows=[...byMonth.entries()].sort((a,b)=>a[0].localeCompare(b[0]))
  .map(([m,cell])=>({month:m,inMinor:cell.received.toString(),outMinor:cell.spent.toString()}));
 const period=month==='all'?(p.start&&p.end?`${p.start} to ${p.end}`:'everything recorded'):month;
 return <section className="stack spending-patterns" aria-label="Your spending patterns"><h2>Your spending patterns</h2>
 <label className="input-label">Spending currency<select value={code} onChange={e=>{setCode(e.target.value);setMonth('all');setAccount('all');}}>{codes.length?codes.map(c=><option key={c}>{c}</option>):<option>AUD</option>}</select></label>
 <label className="input-label">Spending account<select value={account} onChange={e=>{setAccount(e.target.value);setMonth('all');}}><option value="all">All accounts in {code}</option>{(accounts.data??[]).filter(a=>!a.archived_at&&a.currency===code).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
 <label className="input-label">Spending period<select value={month} onChange={e=>setMonth(e.target.value)}><option value="all">All imported dates</option>{p.months.map(m=><option key={m}>{m}</option>)}</select></label>
 {!p.rows.length?<p>No settled transactions in this selection. Import a statement or choose another account or period.</p>:<>
 {/* Picture first, then the one line that says what the picture says, then the depth underneath. Someone
     opening this screen is asking what their money looks like, and no paragraph answers that as fast. */}
 <FlowBar flow={{inMinor:p.credits,outMinor:(BigInt(p.total)+BigInt(p.otherDebits)).toString()}} code={code} label={period}/>
 <MonthBalance months={monthFlows} code={code}/>
 {/* Kinds of spending, once there are kinds. Recorded purchases and fees only: transfers and debits
     awaiting review are not consumption and would distort every block. */}
 <CategorySplit code={code} slices={[...p.spending.reduce((map,t)=>{
   const name=t.category&&t.category!=='Uncategorised'?t.category:'Uncategorised';
   const cell=map.get(name)??{name,minor:0n,ids:[] as string[]};
   cell.minor+=BigInt(t.minor)<0n?-BigInt(t.minor):BigInt(t.minor);cell.ids.push(t.id);map.set(name,cell);return map;
  },new Map<string,{name:string;minor:bigint;ids:string[]}>()).values()].map(c=>({name:c.name,minor:c.minor.toString(),ids:c.ids}))}
  onCategory={name=>{const slice=p.spending.filter(t=>(t.category&&t.category!=='Uncategorised'?t.category:'Uncategorised')===name);
   show(name,slice.map(t=>t.id),`Recorded purchases and fees filed under ${name}.`);}}/>
 <SpendingCalendar days={daily} code={code} onDay={date=>show(date,daily.filter(d=>d.date===date).length?s.transactions.filter(t=>t.date===date&&t.currency===code&&BigInt(t.minor)<0n).map(t=>t.id):[],`Everything recorded on ${date}.`)}/>
 <p className="meta">{p.rows.length} settled transactions · {p.start} to {p.end}. {p.pending} pending entries excluded. Accounts can cover different dates, so these are totals for recorded activity, not a claim that every day is complete.</p>
 <Row trailing={<Button variant="quiet" onClick={()=>show('Recorded spending',p.spending.map(t=>t.id),'Purchases and fees identified from statement text or assigned essential/discretionary categories. Transfers and unclear debits are excluded.')}>{amount(p.total,'recorded purchases and fees')}</Button>}>Recorded purchases and fees</Row>
 {p.refunds.ids.length>0&&<><Row trailing={<Button variant="quiet" onClick={()=>show('Confirmed refunds for selected purchases',p.refunds.ids,`Refunds explicitly linked to these purchases, received through ${today}. This can include later periods or another account in the same currency. They remain credits on their actual posting dates.`)}>{amount(p.refunds.minor,'confirmed refunds for selected purchases')}</Button>}>Refunds linked to these purchases</Row><Row trailing={amount(p.refunds.net,'selected purchases after linked refunds')}>Selected purchases after linked refunds<p className="meta">Refunds through {today}. Merchant and timing charts show original gross payments.</p></Row></>}
 <Row trailing={<Button variant="quiet" onClick={()=>show('Other debits to review',p.review.map(t=>t.id),'Transfers, remittances, cash withdrawals and unclear debits are not automatically called consumption. Confirm their purpose in the ledger.')}>{amount(p.otherDebits,'other debits to review')}</Button>}>Other debits to review</Row>
 {p.repayments.ids.length>0&&<Row trailing={<Button variant="quiet" onClick={()=>show('Repayment-service debits',p.repayments.ids,'Payments labelled Afterpay, ZipPay, Klarna or Humm. These are included in other debits to review, not added again to purchases. Statement payments do not reveal the original purchase date or remaining debt.')}>{amount(p.repayments.minor,'repayment-service debits included in other debits')}</Button>}>Of other debits: repayment services<p>{p.repayments.ids.length} payments; review before classifying</p></Row>}
 <Row trailing={<Button variant="quiet" onClick={()=>show('Recorded credits',p.rows.filter(t=>BigInt(t.minor)>0n&&!t.transfer&&t.kind!=='transfer').map(t=>t.id),'Recorded credits can include salary, refunds and money moved between accounts. This is not a verified income or savings total.')}>{amount(p.credits,'recorded credits excluding matched transfers')}</Button>}>Recorded credits · not all income</Row>
 <Button variant="quiet" onClick={()=>show('Matched transfers',p.transfers.map(t=>t.id),'Both sides of matched transfers are kept outside spending and income summaries.')}>{p.transfers.length} matched transfer entries excluded</Button>
 {top&&<p>Your largest identified merchant total is <strong>{top.name}</strong>: {amount(top.minor,'largest merchant total')} across {top.count} {top.count===1?'payment':'payments'}.</p>}
 <Button variant="quiet" onClick={()=>show('Small recorded purchases',p.small.ids,'Payments at or below this threshold add up. Size alone does not show whether a purchase was impulsive, necessary or planned.')}>
 {p.small.ids.length} payments of {amount(p.small.limit,'small payment threshold')} or less total {amount(p.small.minor,'small payment total')}</Button>
 <h3>Monthly recorded spending</h3><Bars rows={p.monthly.map(m=>({label:m.month,minor:m.minor,ids:m.ids,note:m.complete?'Full month covered for selected accounts':'Partial account coverage or month'}))} code={code} show={show}/>
 <h3>Repeated merchants</h3>{p.merchants.filter(m=>m.count>=2).length?p.merchants.filter(m=>m.count>=2).slice(0,10).map(m=><Row key={m.name} trailing={<Button variant="quiet" onClick={()=>show(m.name,m.ids,`${m.count} recorded purchases/fees under this statement merchant label.`)}>{amount(m.minor,m.name)}</Button>}>{m.name}<p>{m.count} payments</p></Row>):<p>No repeated merchant labels in this selection.</p>}
 <span className="heading-row"><h3>Spending by posting day</h3><Explain title="Spending by posting day"><p>Totals use the date your bank posted each payment, which can differ from the day you actually spent.</p><p>This says nothing about the time of day or why you spent — only when the money moved.</p></Explain></span><Bars rows={p.weekdays.map(d=>({label:d.name,minor:d.minor,ids:d.ids,note:`${d.count} recorded payments`}))} code={code} show={show}/>
 <details><summary>All identified merchant totals</summary>{p.merchants.map(m=><Row key={m.name} trailing={<Button variant="quiet" onClick={()=>show(m.name,m.ids,'Exact recorded payments grouped by statement merchant label.')}>{amount(m.minor,m.name)}</Button>}>{m.name}<p>{m.count} payments</p></Row>)}</details>
 </>}
 {detail&&<Sheet title={detail.title} onClose={()=>setDetail(null)}><p>{detail.text}</p>{s.transactions.filter(t=>detail.ids.includes(t.id)).map(t=><div key={t.id} className="section-gap"><Row trailing={amount(t.minor,t.description)}>{t.rawDescription??t.description}<p>{t.date} · {t.category}</p></Row>{t.refundOf&&<p className="meta">Confirmed refund; excluded from income classification.</p>}<AllocationBreakdown parts={t.allocations} code={t.currency}/>{t.sources?.map((source,i)=><SourceLine key={i} file={source.file} row={source.row} raw={source.raw}/>)}</div>)}{!detail.ids.length&&<p>No matching transactions in this selection.</p>}</Sheet>}
 </section>;
}
function Bars({rows,code,show}:{rows:{label:string;minor:string;ids:string[];note:string}[];code:ReturnType<typeof currency>;show:(title:string,ids:string[],text:string)=>void}){
 const max=rows.reduce((m,r)=>BigInt(r.minor)>m?BigInt(r.minor):m,1n);
 return <div className="stack">{rows.map(row=>{const proportion=Number(displayRatio(row.minor,max.toString()));return <div key={row.label}><Row trailing={<Button variant="quiet" onClick={()=>show(row.label,row.ids,row.note)}><Amount value={money(BigInt(row.minor),code)} context={row.label}/></Button>}>{row.label}<p>{row.note}</p></Row><div className="spending-bar" aria-hidden="true"><span style={{width:`${proportion/10000}%`}}/></div></div>;})}</div>;
}
