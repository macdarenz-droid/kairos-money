import {hash} from '../../ingest/normalize';
import {CategoryMark, relativeDay} from '../design/CategoryMark';
import {TransactionAttachments} from './TransactionAttachments';
import {lazy,Suspense,useEffect,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import type {Account} from '../../core/db/repository';
import type {ManualEntry} from '../../ledger/manual';
import {currency,format,money,parseDecimal} from '../../core/money';
import {localDay} from '../../ingest/reminders';
import {shift as shiftDay} from '../../intelligence/model';
import {useSession} from '../session';
import {Amount,Button,Input,Row,Sheet} from '../design/primitives';
import {preferredCategories,repeatEntryProposals} from '../proposals/derive';
import type {RepeatEntryPrefill} from '../proposals/model';
const TransactionSplits=lazy(()=>import('./TransactionSplits').then(m=>({default:m.TransactionSplits})));
const categories=['Groceries','Housing','Utilities','Transport','Health','Eating out','Shopping','Entertainment','Debt','Savings'];
export function ManualSheet({accounts,entry,prefill,onClose}:{accounts:Account[];entry?:ManualEntry;prefill?:RepeatEntryPrefill;onClose:()=>void}){
 const session=useSession(),query=useQueryClient();
 // A remembered account is a preference, not a financial fact: it changes what the form starts with and
 // nothing that is recorded. An explicit choice here is what stores it.
 const preferred=useQuery({queryKey:['preference','preferred-account'],queryFn:()=>session.run(r=>r.preferences.read('preferred-account')),enabled:session.state==='ready'});
 const history=useQuery({queryKey:['manual'],queryFn:()=>session.run(async r=>({entries:await r.manual.list(),totals:await r.manual.today(localDay()),unresolved:await r.manual.unresolved()})),enabled:session.state==='ready'});
 const chips=preferredCategories(history.data?.entries??[]);
 const [id]=useState(entry?.id??crypto.randomUUID()),[kind,setKind]=useState<ManualEntry['kind']>(entry?.kind??prefill?.kind??'expense'),[accountId,setAccount]=useState(entry?.accountId??prefill?.accountId??accounts[0]?.id??''),[destinationId,setDestination]=useState(entry?.destinationId??''),[date,setDate]=useState(entry?.date??prefill?.date??localDay()),[amount,setAmount]=useState(()=>{const seed=entry??(prefill?{minor:prefill.minor,accountId:prefill.accountId}:null);if(!seed)return '';const a=accounts.find(a=>a.id===seed.accountId);const digits=new Intl.NumberFormat('en',{style:'currency',currency:a?.currency??'AUD'}).resolvedOptions().maximumFractionDigits??2;const n=BigInt(seed.minor),base=10n**BigInt(digits);return `${n/base}${digits?'.'+(n%base).toString().padStart(digits,'0'):''}`;}),[description,setDescription]=useState(entry?.description??prefill?.description??''),[category,setCategory]=useState(entry?.category??prefill?.category??''),[notes,setNotes]=useState(entry?.notes??''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function save(){setBusy(true);setError('');try{const account=accounts.find(a=>a.id===accountId);if(!account)throw new Error('Choose an account first.');await session.run(r=>r.preferences.write('preferred-account',accountId));await session.run(r=>r.manual.save({id,kind,accountId,destinationId:kind==='transfer'?destinationId:null,date,minor:parseDecimal(amount,currency(account.currency)).minor.toString(),description,category:category||null,notes}));await query.invalidateQueries();onClose();}catch(e){setError(e instanceof Error?e.message:'The entry could not be saved.');}finally{setBusy(false);}}
 // Applied in an effect once the preference has loaded, and only when nothing more specific already chose
 // the account. Setting state during render would re-enter the render pass.
 useEffect(()=>{
  if(entry||prefill||!preferred.data)return;
  if(preferred.data!==accountId&&accounts.some(a=>a.id===preferred.data)&&accountId===(accounts[0]?.id??''))setAccount(preferred.data);
 },[preferred.data,entry,prefill,accounts,accountId]);
 return <Sheet title={entry?'Edit transaction':'Add transaction'} onClose={()=>{if(!busy)onClose();}}><form className="stack" onSubmit={e=>{e.preventDefault();void save();}}>
 <label className="input-label">Transaction type<select value={kind} onChange={e=>setKind(e.target.value as ManualEntry['kind'])}><option value="expense">Expense</option><option value="income">Income</option><option value="transfer">Transfer</option></select></label>
 <label className="input-label">{kind==='transfer'?'From account':'Account'}<select value={accountId} onChange={e=>setAccount(e.target.value)}>{accounts.map(a=><option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}</select></label>
 {kind==='transfer'&&<label className="input-label">To account<select required value={destinationId} onChange={e=>setDestination(e.target.value)}><option value="">Choose account</option>{accounts.filter(a=>a.id!==accountId&&a.currency===accounts.find(b=>b.id===accountId)?.currency).map(a=><option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}</select></label>}
 <Input label="Amount" inputMode="decimal" autoFocus required value={amount} onChange={e=>setAmount(e.target.value)}/>
 <div className="form-actions">{[{label:'Today',value:localDay()},{label:'Yesterday',value:shiftDay(localDay(),-1)}].map(chip=>
  <Button key={chip.label} type="button" aria-pressed={date===chip.value} onClick={()=>setDate(chip.value)}>{chip.label}</Button>)}</div>
 <Input label="Date" type="date" required value={date} onChange={e=>setDate(e.target.value)}/><Input label="Description" required maxLength={200} value={description} onChange={e=>setDescription(e.target.value)}/>
 {kind==='expense'&&<>
  {chips.length>0&&<div className="form-actions">{chips.map(c=>
   <Button key={c} type="button" aria-pressed={category===c} onClick={()=>setCategory(c)}>{c}</Button>)}</div>}
  <label className="input-label">Category<select value={category} onChange={e=>setCategory(e.target.value)}><option value="">Uncategorised</option>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
 </>}
 <Input label="Note (optional)" maxLength={2000} value={notes} onChange={e=>setNotes(e.target.value)}/>{error&&<p role="alert">{error}</p>}<Button type="submit" variant="primary" disabled={busy||!accounts.length}>{busy?'Saving…':'Save transaction'}</Button></form></Sheet>;
}
export function ManualHistory({accounts,today=false}:{accounts:Account[];today?:boolean}){
 const session=useSession(),query=useQueryClient(),[edit,setEdit]=useState<ManualEntry>(),[remove,setRemove]=useState<ManualEntry>(),[match,setMatch]=useState<ManualEntry>(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const data=useQuery({queryKey:['manual'],queryFn:()=>session.run(async r=>({entries:await r.manual.list(),totals:await r.manual.today(localDay()),unresolved:await r.manual.unresolved()})),enabled:session.state==='ready'});
 const candidates=useQuery({queryKey:['manual-matches',match?.id],queryFn:()=>session.run(r=>r.manual.candidates(match!.id)),enabled:!!match&&session.state==='ready'});
 async function act(fn:()=>Promise<unknown>){setBusy(true);setError('');try{await fn();await query.invalidateQueries();setRemove(undefined);setMatch(undefined);}catch(e){setError(e instanceof Error?e.message:'The change could not be saved.');}finally{setBusy(false);}}
 if(today)return <section className="section-gap"><h2>Recorded today</h2>
 {/* The money comes first. Someone opening this screen is asking what they spent, not what the app can do. */}
 {data.data?.totals.map(t=>{const spent=BigInt(t.spending)+BigInt(t.awaitingSpending),received=BigInt(t.income)+BigInt(t.awaitingIncome),loose=BigInt(t.awaitingSpending)+BigInt(t.awaitingIncome);
 return <div key={t.currency}><Row trailing={<Amount value={money(spent,currency(t.currency))} context="spent today" hero/>}>Spent today</Row>{received>0n&&<Row trailing={<Amount value={money(received,currency(t.currency))} context="received today"/>}>Received today</Row>}
 {/* Money your bank announced counts here. It is marked, not withheld: a balance that waits weeks for a
     statement before it moves is a balance nobody can use, and confirmation changes how much the app
     trusts a row, not whether the money left. */}
 {loose>0n&&<p className="meta"><span className="tag">Not on a statement yet</span></p>}</div>;})}{data.data&&!data.data.totals.length&&<p>Nothing recorded today yet.</p>}{data.error&&<p role="alert">Today's entries could not be read.</p>}
 {data.data&&Object.keys(data.data.unresolved).length>0&&<p>Some entries may be duplicates. Review them in Ledger before trusting these totals.</p>}
 <RepeatTiles accounts={accounts} entries={data.data?.entries??[]}/>
 </section>;
 return <section className="section-gap"><h2>Manual transactions</h2>
 <RepeatTiles accounts={accounts} entries={data.data?.entries??[]}/>{data.error&&<p role="alert">Manual history could not be read. Try reopening Ledger.</p>}{data.data?.entries.slice().sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id)).map(e=>{const account=accounts.find(a=>a.id===e.accountId);return <div key={e.id} className="section-gap"><Row trailing={account&&<Amount value={money(BigInt(e.minor)*(e.kind==='expense'?-1n:1n),currency(account.currency))} context={`${e.kind} ${e.description}`}/>}><span className="row-lead"><CategoryMark description={e.description} category={e.category}/><span><h3>{e.description}</h3><p>{relativeDay(e.date,localDay())} · {account?.name} · {e.kind}</p></span></span></Row>{data.data?.unresolved[e.id]&&<p role="status">{data.data.unresolved[e.id]} possible statement matches. Review before trusting combined totals.</p>}{e.notes&&<p>{e.notes}</p>}<ReceiptDetails id={e.id} minor={e.minor} code={account?.currency}/>{e.kind==='expense'&&account&&Object.keys(e.links).length===0&&<ManualSplit id={e.id} minor={e.minor} code={account.currency}/>}<div className="form-actions"><Button onClick={()=>setEdit(e)}>Edit</Button><Button onClick={()=>setMatch(e)}>Match with statement</Button><Button variant="danger" onClick={()=>setRemove(e)}>Delete</Button></div>{Object.keys(e.links).length>0&&<p className="meta">A statement match is saved. If that source is rolled back, the manual entry counts again.</p>}</div>;})}
 {edit&&<ManualSheet accounts={accounts} entry={edit} onClose={()=>setEdit(undefined)}/>}
 {remove&&<Sheet title="Delete manual transaction?" onClose={()=>{if(!busy)setRemove(undefined);}}><p>{remove.description}. This removes the manual record only; imported statement entries remain.</p><Button variant="danger" disabled={busy} onClick={()=>void act(()=>session.run(r=>r.manual.remove(remove.id)))}>Delete transaction</Button>{error&&<p role="alert">{error}</p>}</Sheet>}
 {match&&<Sheet title="Match with statement" onClose={()=>{if(!busy)setMatch(undefined);}}><p>Confirm only if these are the same purchase or transfer. Similar amounts can be different transactions.</p>{candidates.data?.map(c=><Row key={c.leg+c.batchId+c.sourceId} trailing={<Button disabled={busy} onClick={()=>void act(()=>session.run(r=>r.manual.match(match.id,c.leg,c.transactionId)))}>Same transaction</Button>}>{c.description}<p>{c.date} · {c.leg==='entry'?'Statement transaction':c.leg==='from'?'Transfer out':'Transfer in'}</p></Row>)}{candidates.data&&!candidates.data.length&&<p>No imported entry with the same account and amount within three days. Import the statement first, or keep these separate.</p>}{Object.keys(match.links).length>0&&<Button disabled={busy} onClick={()=>void act(()=>session.run(r=>r.manual.unmatch(match.id)))}>Remove saved matches</Button>}{(error||candidates.error)&&<p role="alert">{error||'Matches could not be read.'}</p>}</Sheet>}
 </section>;
}
function ReceiptDetails({id,minor,code}:{id:string;minor?:string|undefined;code?:string|undefined}){const [open,setOpen]=useState(false);return <details onToggle={e=>setOpen(e.currentTarget.open)}><summary>Notes and receipts</summary>{open&&<TransactionAttachments target={'manual:'+id} recordedMinor={minor} code={code}/>}</details>;}

function ManualSplit({id,minor,code}:{id:string;minor:string;code:string}){const [open,setOpen]=useState(false);return <details onToggle={e=>setOpen(e.currentTarget.open)}><summary>Split expense categories</summary>{open&&<Suspense fallback={<p>Opening category split…</p>}><TransactionSplits id={hash('manual-transaction:'+id+':entry')} minor={(-BigInt(minor)).toString()} code={currency(code)}/></Suspense>}</details>;}

/**
 * One-tap repeat entry.
 *
 * A tile prefills the form from an entry the user already wrote, dated today. It commits nothing: the sheet
 * opens with Save still to press, so this removes typing rather than the confirmation.
 */
function RepeatTiles({accounts,entries}:{accounts:Account[];entries:ManualEntry[]}){
 const [prefill,setPrefill]=useState<RepeatEntryPrefill>();
 const proposals=repeatEntryProposals(entries,localDay());
 if(!proposals.length||!accounts.length)return null;
 return <div className="section-gap">
  <p className="meta">Record one of these again. Nothing is saved until you confirm.</p>
  <div className="form-actions">{proposals.map(p=>{
   const account=accounts.find(a=>a.id===p.prefill.accountId);
   const label=account?`${p.label}, ${format(money(BigInt(p.prefill.minor),currency(account.currency)))}`:p.label;
   return <Button key={p.id} onClick={()=>setPrefill(p.prefill)} aria-label={`Record ${label} again. ${p.detail}`}>{label}</Button>;
  })}</div>
  {prefill&&<ManualSheet accounts={accounts} prefill={prefill} onClose={()=>setPrefill(undefined)}/>}
 </div>;
}
