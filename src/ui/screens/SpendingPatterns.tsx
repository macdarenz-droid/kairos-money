import {AllocationBreakdown} from './AllocationBreakdown';
import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {money} from '../../core/money';
import {localDay} from '../../ingest/reminders';
import {spendingPatterns,countsAsMovement} from '../../intelligence/visuals/spending-patterns';
import {Amount,Button,Row,Sheet,Skeleton} from '../design/primitives';
import {SourceLine} from '../design/SourceLine';
import {SpendingCalendar} from '../design/SpendingCalendar';
import {FlowBar} from '../design/FlowBar';
import {MonthBalance} from '../design/MonthBalance';
import {CategorySplit} from '../design/CategorySplit';
import {useSession} from '../session';
import {useDisplayCurrencyState} from '../currency';
export function SpendingPatterns(){
 const session=useSession(),{code,settled}=useDisplayCurrencyState(),[month,setMonth]=useState('all'),[account,setAccount]=useState('all'),[detail,setDetail]=useState<{title:string;ids:string[];text:string}|null>(null);
 const accounts=useQuery({queryKey:['accounts'],queryFn:()=>session.run(r=>r.accounts()),enabled:session.state==='ready'});
 const today=localDay(),q=useQuery({queryKey:['spending-patterns',today,code],queryFn:()=>session.run(r=>r.intelligence.snapshot(today,code)),enabled:session.state==='ready'&&settled&&!!accounts.data,staleTime:0});
 if(session.state!=='ready')return null;
 if(accounts.error||q.error)return <p role="alert">Spending patterns could not be read. <Button onClick={()=>{void accounts.refetch();void q.refetch();}}>Retry</Button></p>;
 if(q.isPending)return <Skeleton label="Reading spending patterns"/>;
 const s=q.data,p=spendingPatterns(s,month,account),show=(title:string,ids:string[],text:string)=>setDetail({title,ids,text});
 const amount=(minor:string,context:string)=><Amount value={money(BigInt(minor),code)} context={context}/>;
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
 <label className="input-label">Spending account<select value={account} onChange={e=>{setAccount(e.target.value);setMonth('all');}}><option value="all">All accounts</option>{(accounts.data??[]).filter(a=>!a.archived_at).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
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
 <Row trailing={<Button variant="quiet" onClick={()=>show('Purchases',p.spending.map(t=>t.id),'Purchases and fees. Transfers and unclear debits are excluded.')}>{amount(p.total,'purchases')}</Button>}>Purchases</Row>
 {p.refunds.ids.length>0&&<><Row trailing={<Button variant="quiet" onClick={()=>show('Confirmed refunds for selected purchases',p.refunds.ids,`Refunds explicitly linked to these purchases, received through ${today}. This can include later periods or another account in the same currency. They remain credits on their actual posting dates.`)}>{amount(p.refunds.minor,'confirmed refunds for selected purchases')}</Button>}>Refunds linked to these purchases</Row><Row trailing={amount(p.refunds.net,'selected purchases after linked refunds')}>Selected purchases after linked refunds<p className="meta">Refunds through {today}. Merchant and timing charts show original gross payments.</p></Row></>}
 <Row trailing={<Button variant="quiet" onClick={()=>show('Unclassified',p.review.map(t=>t.id),'Transfers, remittances, cash withdrawals and unclear debits. Confirm their purpose in the ledger.')}>{amount(p.otherDebits,'unclassified debits')}</Button>}>Unclassified</Row>
 {p.repayments.ids.length>0&&<Row trailing={<Button variant="quiet" onClick={()=>show('Repayments',p.repayments.ids,'Afterpay, ZipPay, Klarna and Humm. Counted inside Unclassified, not added again to Purchases.')}>{amount(p.repayments.minor,'repayments')}</Button>}>Repayments<p>{p.repayments.ids.length} payments</p></Row>}
 <Row trailing={<Button variant="quiet" onClick={()=>show('Credits',p.rows.filter(t=>BigInt(t.minor)>0n&&!t.transfer&&t.kind!=='transfer').map(t=>t.id),'Salary, refunds and money in. Not a verified income total.')}>{amount(p.credits,'credits')}</Button>}>Credits</Row>
 <Button variant="quiet" onClick={()=>show('Transfers',p.transfers.map(t=>t.id),'Both sides are kept out of spending and income.')}>{p.transfers.length} transfers excluded</Button>
 <Button variant="quiet" onClick={()=>show('Small purchases',p.small.ids,'Payments at or below this threshold.')}>
 {p.small.ids.length} payments under {amount(p.small.limit,'small payment threshold')} · {amount(p.small.minor,'small payment total')}</Button>
 <h3>Merchants</h3>{p.merchants.filter(m=>m.count>=2).length?p.merchants.filter(m=>m.count>=2).slice(0,10).map(m=><Row key={m.name} trailing={<Button variant="quiet" onClick={()=>show(m.name,m.ids,`${m.count} payments under this merchant label.`)}>{amount(m.minor,m.name)}</Button>}>{m.name}<p>{m.count} payments</p></Row>):<p>No repeated merchants here.</p>}
 {(()=>{const heaviest=[...p.weekdays].filter(d=>BigInt(d.minor)>0n).sort((a,b)=>BigInt(a.minor)>BigInt(b.minor)?-1:1)[0];
  if(!heaviest)return null;
  return <button type="button" className="fact" onClick={()=>show(heaviest.name,heaviest.ids,`${heaviest.count} payments, by the date your bank posted them.`)}>
   <span className="fact-line"><strong>{heaviest.name}s</strong> cost you most</span>
   <span className="fact-value">{amount(heaviest.minor,`${heaviest.name} total`)}</span></button>;})()}
 <details><summary>All merchants</summary>{p.merchants.map(m=><Row key={m.name} trailing={<Button variant="quiet" onClick={()=>show(m.name,m.ids,'Payments grouped by merchant label.')}>{amount(m.minor,m.name)}</Button>}>{m.name}<p>{m.count} payments</p></Row>)}</details>
 </>}
 {detail&&<Sheet title={detail.title} onClose={()=>setDetail(null)}><p>{detail.text}</p>{s.transactions.filter(t=>detail.ids.includes(t.id)).map(t=><div key={t.id} className="section-gap"><Row trailing={amount(t.minor,t.description)}>{t.rawDescription??t.description}<p>{t.date} · {t.category}</p></Row>{t.refundOf&&<p className="meta">Confirmed refund; excluded from income classification.</p>}<AllocationBreakdown parts={t.allocations} code={t.currency}/>{t.sources?.map((source,i)=><SourceLine key={i} file={source.file} row={source.row} raw={source.raw}/>)}</div>)}{!detail.ids.length&&<p>No matching transactions in this selection.</p>}</Sheet>}
 </section>;
}
