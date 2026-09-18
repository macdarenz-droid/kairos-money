import {useEffect,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import type {Account} from '../../core/db/repository';
import type {ManualEntry} from '../../ledger/manual';
import {currency,format,money,parseDecimal} from '../../core/money';
import {convert,rateBetween,type Rate as FxRate} from '../../core/fx';
import {localDay} from '../../ingest/reminders';
import {shift as shiftDay} from '../../intelligence/model';
import {useSession} from '../session';
import {Amount,Button,Input,Row,Sheet} from '../design/primitives';
import {preferredCategories,repeatEntryProposals} from '../proposals/derive';
import type {RepeatEntryPrefill} from '../proposals/model';
import {expenseCategories as categories} from '../../ledger/categories';
/**
 * WHAT HE ASKED FOR, IN HIS WORDS: "add transaction should be bigger and first thing you see when u open
 * the app. and when clicked, open its own tab like what kind of transaction, income, outcome, transfer.
 * u making the app too complicated" — and, pointing at a sheet from another app, "copy similar pop up
 * when adding transaction. not the color though".
 *
 * So the sheet leads with the amount, because that is what someone opened it to type, and the kind of
 * transaction is three buttons you can see at once rather than a dropdown you have to open to find out
 * what the choices are. Account and date sit side by side instead of each taking a line of their own.
 * Cancel and Save are together at the bottom, where a hand holding a phone can reach them.
 *
 * `kind` seeds the type: the Quick action "Transfer between accounts" opened this sheet on Expense, which
 * is why pressing it looked like it had done nothing.
 */
export function ManualSheet({accounts,entry,prefill,kind:initialKind,onClose}:{accounts:Account[];entry?:ManualEntry;prefill?:RepeatEntryPrefill;kind?:ManualEntry['kind'];onClose:()=>void}){
 const session=useSession(),query=useQueryClient();
 // A remembered account is a preference, not a financial fact: it changes what the form starts with and
 // nothing that is recorded. An explicit choice here is what stores it.
 const preferred=useQuery({queryKey:['preference','preferred-account'],queryFn:()=>session.run(r=>r.preferences.read('preferred-account')),enabled:session.state==='ready'});
 const history=useQuery({queryKey:['manual'],queryFn:()=>session.run(async r=>({entries:await r.manual.list(),totals:await r.manual.today(localDay()),unresolved:await r.manual.unresolved()})),enabled:session.state==='ready'});
 const chips=preferredCategories(history.data?.entries??[]);
 const repeats=repeatEntryProposals(history.data?.entries??[],localDay());
 const [id]=useState(entry?.id??crypto.randomUUID()),[kind,setKind]=useState<ManualEntry['kind']>(entry?.kind??prefill?.kind??initialKind??'expense'),[accountId,setAccount]=useState(entry?.accountId??prefill?.accountId??''),[destinationId,setDestination]=useState(entry?.destinationId??''),[date,setDate]=useState(entry?.date??prefill?.date??localDay()),[amount,setAmount]=useState(()=>{const seed=entry??(prefill?{minor:prefill.minor,accountId:prefill.accountId}:null);if(!seed)return '';const a=accounts.find(a=>a.id===seed.accountId);const digits=new Intl.NumberFormat('en',{style:'currency',currency:a?.currency??'AUD'}).resolvedOptions().maximumFractionDigits??2;const n=BigInt(seed.minor),base=10n**BigInt(digits);return `${n/base}${digits?'.'+(n%base).toString().padStart(digits,'0'):''}`;}),[description,setDescription]=useState(entry?.description??prefill?.description??''),[category,setCategory]=useState(entry?.category??prefill?.category??''),[notes,setNotes]=useState(entry?.notes??''),[busy,setBusy]=useState(false),[error,setError]=useState('');
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
 const busyClose=()=>{if(!busy)onClose();};
 return <Sheet title={entry?'Edit transaction':'Add transaction'} onClose={busyClose}><form className="stack" onSubmit={e=>{e.preventDefault();void save();}}>
 {/* WHAT HE CIRCLED ON TODAY: a row of repeat tiles under a sentence explaining them — "remove". He
     had already said it once: "too many buttons... keep one only on main screen and quick search". So
     the shortcut moved to where the shortcut is used. It fills this form in and saves nothing; the Save
     below is still yours to press. */}
 {!entry&&repeats.length>0&&<div className="form-actions">{repeats.map(p=>{
  const held=accounts.find(a=>a.id===p.prefill.accountId);
  const label=held?`${p.label}, ${format(money(BigInt(p.prefill.minor),currency(held.currency)))}`:p.label;
  return <Button key={p.id} type="button" aria-label={`Record ${label} again. ${p.detail}`} onClick={()=>{
   setKind(p.prefill.kind);setAccount(p.prefill.accountId);setDate(p.prefill.date);
   setDescription(p.prefill.description);setCategory(p.prefill.category??'');
   const digits=new Intl.NumberFormat('en',{style:'currency',currency:held?.currency??'AUD'}).resolvedOptions().maximumFractionDigits??2;
   const n=BigInt(p.prefill.minor),base=10n**BigInt(digits);
   setAmount(`${n/base}${digits?'.'+(n%base).toString().padStart(digits,'0'):''}`);
  }}>{label}</Button>;
 })}</div>}
 <Input label="Amount" className="amount-field" inputMode="decimal" autoFocus required value={amount} onChange={e=>setAmount(e.target.value)}/>
 {/* Three buttons, not a dropdown: the choices are the point, and a closed select hides them. */}
 <div className="segmented" role="group" aria-label="Transaction type">{([['expense','Expense'],['income','Income'],['transfer','Transfer']] as const).map(([value,label])=>
  <Button key={value} type="button" aria-pressed={kind===value} onClick={()=>setKind(value)}>{label}</Button>)}</div>
 <div className="split-field">
  <label className="input-label">{kind==='transfer'?'From account':'Account'}<select value={accountId} onChange={e=>setAccount(e.target.value)}>{accounts.map(a=><option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}</select></label>
  <Input label="Date" type="date" required value={date} onChange={e=>setDate(e.target.value)}/>
 </div>
 {kind==='transfer'&&<label className="input-label">To account<select required value={destinationId} onChange={e=>setDestination(e.target.value)}><option value="">Choose account</option>{accounts.filter(a=>a.id!==accountId&&a.currency===accounts.find(b=>b.id===accountId)?.currency).map(a=><option key={a.id} value={a.id}>{a.name} · {a.currency}</option>)}</select></label>}
 <div className="form-actions">{[{label:'Today',value:localDay()},{label:'Yesterday',value:shiftDay(localDay(),-1)}].map(chip=>
  <Button key={chip.label} type="button" aria-pressed={date===chip.value} onClick={()=>setDate(chip.value)}>{chip.label}</Button>)}</div>
 <Input label="Description" required maxLength={200} value={description} onChange={e=>setDescription(e.target.value)}/>
 {kind==='expense'&&<>
  {chips.length>0&&<div className="form-actions">{chips.map(c=>
   <Button key={c} type="button" aria-pressed={category===c} onClick={()=>setCategory(c)}>{c}</Button>)}</div>}
  <label className="input-label">Category<select value={category} onChange={e=>setCategory(e.target.value)}><option value="">Uncategorised</option>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
 </>}
 <Input label="Note (optional)" maxLength={2000} value={notes} onChange={e=>setNotes(e.target.value)}/>{error&&<p role="alert">{error}</p>}
 <div className="sheet-actions"><Button type="button" onClick={busyClose}>Cancel</Button><Button type="submit" variant="primary" disabled={busy||!accounts.length}>{busy?'Saving…':'Save transaction'}</Button></div></form></Sheet>;
}
export function ManualHistory({today=false}:{today?:boolean}){
 const session=useSession();
 const day=localDay();
 const home=useQuery({queryKey:['display-currency'],enabled:session.state==='ready',queryFn:()=>session.run(r=>r.displayCurrency())});
 const stored=useQuery({queryKey:['fx-rates'],enabled:session.state==='ready',queryFn:()=>session.run(r=>r.rates())});
 const display=currency(home.data??'AUD');
 const rates:FxRate[]=(stored.data??[]).map(r=>({asOf:r.asOf,base:currency(r.base),quote:currency(r.quote),rateE8:BigInt(r.rateE8),source:r.source}));
 const data=useQuery({queryKey:['manual'],queryFn:()=>session.run(async r=>({entries:await r.manual.list(),totals:await r.manual.today(localDay()),unresolved:await r.manual.unresolved()})),enabled:session.state==='ready'});
 if(today)return <section className="section-gap"><h2>Recorded today</h2>
 {/* The money comes first. Someone opening this screen is asking what they spent, not what the app can do. */}
 {/*
   * ONE SCREEN, ONE CURRENCY.
   *
   * This printed a "Spent today" row per currency, each in its own — so an AUD purchase read "$100.00"
   * directly underneath tiles reading "PHP 0.00", which is the same screen giving two answers about the
   * same money. Every figure above it follows the display currency, and so does this now: converted at
   * today's rate, summed into one figure, with anything no rate reaches named rather than dropped.
   */}
 {today&&(()=>{
  const missing:string[]=[];let spent=0n,received=0n,loose=0n;
  for(const t of data.data?.totals??[]){
   const held=currency(t.currency),rate=rateBetween(rates,held,display,day);
   if(rate===null){if(!missing.includes(held))missing.push(held);continue;}
   const into=(v:string)=>convert(money(BigInt(v),held),display,rate).minor;
   spent+=into(t.spending)+into(t.awaitingSpending);received+=into(t.income)+into(t.awaitingIncome);
   loose+=into(t.awaitingSpending)+into(t.awaitingIncome);
  }
  return <><Row trailing={<Amount value={money(spent,display)} context="spent today" hero/>}>Spent today</Row>
  {received>0n&&<Row trailing={<Amount value={money(received,display)} context="received today"/>}>Received today</Row>}
  {/* Money your bank announced counts here. It is marked, not withheld: a balance that waits weeks for a
      statement before it moves is a balance nobody can use, and confirmation changes how much the app
      trusts a row, not whether the money left. */}
  {loose>0n&&<p className="meta"><span className="tag">Not on a statement yet</span></p>}
  {missing.length>0&&<p className="meta">{missing.join(' and ')} not included: no stored rate reaches {display}.</p>}</>;
 })()}{data.data&&!data.data.totals.length&&<p>Nothing recorded today yet.</p>}{data.error&&<p role="alert">Today's entries could not be read.</p>}
 {data.data&&Object.keys(data.data.unresolved).length>0&&<p>Some entries may be duplicates. Review them in Ledger before trusting these totals.</p>}
 </section>;
 // The "Manual transactions" list lived here: every entry with Notes and receipts, Split expense
 // categories, Edit, Match with statement and Delete stacked underneath it. Those rows are in History
 // now, beside the statement and notification rows they were always the same kind of thing as, and the
 // controls moved into the one transaction that is open. Only the Today summary is left here.
 return null;
}


