import {useEffect,useState} from 'react';
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
const categories=['Groceries','Housing','Utilities','Transport','Health','Eating out','Shopping','Entertainment','Debt','Savings'];
export function ManualSheet({accounts,entry,prefill,onClose}:{accounts:Account[];entry?:ManualEntry;prefill?:RepeatEntryPrefill;onClose:()=>void}){
 const session=useSession(),query=useQueryClient();
 // A remembered account is a preference, not a financial fact: it changes what the form starts with and
 // nothing that is recorded. An explicit choice here is what stores it.
 const preferred=useQuery({queryKey:['preference','preferred-account'],queryFn:()=>session.run(r=>r.preferences.read('preferred-account')),enabled:session.state==='ready'});
 const history=useQuery({queryKey:['manual'],queryFn:()=>session.run(async r=>({entries:await r.manual.list(),totals:await r.manual.today(localDay()),unresolved:await r.manual.unresolved()})),enabled:session.state==='ready'});
 const chips=preferredCategories(history.data?.entries??[]);
 const [id]=useState(entry?.id??crypto.randomUUID()),[kind,setKind]=useState<ManualEntry['kind']>(entry?.kind??prefill?.kind??'expense'),[accountId,setAccount]=useState(entry?.accountId??prefill?.accountId??''),[destinationId,setDestination]=useState(entry?.destinationId??''),[date,setDate]=useState(entry?.date??prefill?.date??localDay()),[amount,setAmount]=useState(()=>{const seed=entry??(prefill?{minor:prefill.minor,accountId:prefill.accountId}:null);if(!seed)return '';const a=accounts.find(a=>a.id===seed.accountId);const digits=new Intl.NumberFormat('en',{style:'currency',currency:a?.currency??'AUD'}).resolvedOptions().maximumFractionDigits??2;const n=BigInt(seed.minor),base=10n**BigInt(digits);return `${n/base}${digits?'.'+(n%base).toString().padStart(digits,'0'):''}`;}),[description,setDescription]=useState(entry?.description??prefill?.description??''),[category,setCategory]=useState(entry?.category??prefill?.category??''),[notes,setNotes]=useState(entry?.notes??''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 // A hand-entered transaction starts on the account he nominated as his main one, not on whichever
 // account happens to sort first. Seeded rather than forced: once the form has an account — his pick or
 // a prefill — this leaves it alone.
 const primary=useQuery({queryKey:['primary-account'],enabled:session.state==='ready',queryFn:()=>session.run(r=>r.notices.defaultAccount())});
 useEffect(()=>{if(!accountId)setAccount(primary.data??accounts[0]?.id??'');},[primary.data,accounts,accountId]);
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
 const session=useSession();
 const data=useQuery({queryKey:['manual'],queryFn:()=>session.run(async r=>({entries:await r.manual.list(),totals:await r.manual.today(localDay()),unresolved:await r.manual.unresolved()})),enabled:session.state==='ready'});
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
 // The "Manual transactions" list lived here: every entry with Notes and receipts, Split expense
 // categories, Edit, Match with statement and Delete stacked underneath it. Those rows are in History
 // now, beside the statement and notification rows they were always the same kind of thing as, and the
 // controls moved into the one transaction that is open. Only the Today summary is left here.
 return null;
}


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
