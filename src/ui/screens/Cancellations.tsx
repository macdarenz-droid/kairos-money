import {useEffect,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import type {Currency} from '../../core/money';
import type {Cancellation} from '../../ledger/cancellations';
import {localDay} from '../../ingest/reminders';
import {shiftDay} from '../../ingest/normalize';
import {Button,Input,Row,Sheet} from '../design/primitives';
import {useSession} from '../session';
export function Cancellations({code,payments=[],review,track=null,onTrack}:{code:Currency;payments?:{merchant:string;date:string;id:string}[];review?:(merchant:string,ids:string[])=>void;track?:string|null;onTrack?:()=>void}){
 const session=useSession(),client=useQueryClient(),[edit,setEdit]=useState<Cancellation|null>(null),[remove,setRemove]=useState<Cancellation|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const query=useQuery({queryKey:['cancellations'],enabled:session.state==='ready',queryFn:()=>session.run(r=>r.cancellations.list())});
 // A bill row asks to track its merchant; the editor lives here so records and edits share one place.
 useEffect(()=>{if(track){setError('');setEdit({merchant:track,currency:code,date:localDay(),status:'requested',note:''});onTrack?.();}},[track,code,onTrack]);
 if(session.state!=='ready')return null;
 const rows=(query.data??[]).filter(r=>r.currency===code);
 // Nothing recorded and nothing being edited: the section has no subject, so it does not appear.
 if(!rows.length&&!edit&&!remove&&!query.error)return null;
 const refresh=async()=>{await client.invalidateQueries({queryKey:['cancellations']});await client.invalidateQueries({queryKey:['intelligence']});};
 function start(value:Cancellation){setError('');setEdit(value);}
 async function save(){if(!edit)return;setBusy(true);setError('');try{if(edit.date>localDay())throw new Error('Use the date you contacted the provider, up to today.');await session.run(r=>r.cancellations.save(edit));await refresh();setEdit(null);}catch(e){setError(e instanceof Error?e.message:'The cancellation record could not be saved.');}finally{setBusy(false);}}
 return <section className="stack cancellation-records" aria-label="Cancellation records"> {query.isPending?<p>Reading cancellation records…</p>:query.error?<p role="alert">Cancellation records could not be read. <Button onClick={()=>void query.refetch()}>Retry</Button></p>:<>
 {rows.map(row=>{const later=payments.filter(p=>p.merchant.trim().toLowerCase()===row.merchant&&p.date>row.date);return <Row key={row.merchant} trailing={<div className="stack"><Button onClick={()=>start(row)}>Edit record</Button><Button onClick={()=>{setError('');setRemove(row);}}>Remove record</Button></div>}>{row.merchant}<p>{row.status==='confirmed'?'Provider confirmation recorded':'Cancellation requested'} · {row.date}</p>{row.note&&<p>{row.note}</p>}{later.length&&review?<Button onClick={()=>review(row.merchant,later.map(p=>p.id))}>Review {later.length} later {later.length===1?'payment':'payments'}</Button>:<p>No later payments recorded</p>}</Row>;})}
 </>}
 {edit&&<Sheet title="Cancellation record" onClose={()=>{if(!busy)setEdit(null);}}><div className="stack"><p>{edit.merchant} · {edit.currency}</p><label className="input-label">Progress<select value={edit.status} onChange={e=>setEdit({...edit,status:e.target.value as Cancellation['status']})}><option value="requested">Requested from provider</option><option value="confirmed">Provider confirmed cancellation</option></select></label><div className="form-actions">{[{label:'Today',value:localDay()},{label:'Yesterday',value:shiftDay(localDay(),-1)}].map(chip=>
  <Button key={chip.label} disabled={busy} aria-pressed={edit.date===chip.value} onClick={()=>setEdit({...edit,date:chip.value})}
   aria-label={`Set the contact date to ${chip.label.toLowerCase()}, ${chip.value}`}>{chip.label}</Button>)}</div>
  <Input label="Contact or confirmation date" type="date" value={edit.date} onChange={e=>setEdit({...edit,date:e.target.value})}/><label className="input-label">Confirmation reference or note<textarea maxLength={1000} value={edit.note} onChange={e=>setEdit({...edit,note:e.target.value})}/></label>{error&&<p role="alert">{error}</p>}<Button disabled={busy} onClick={()=>void save()}>Save cancellation record</Button></div></Sheet>}
 {remove&&<Sheet title="Remove cancellation record?" onClose={()=>{if(!busy)setRemove(null);}}><p>Remove the saved progress for {remove.merchant}? Your transactions are unchanged.</p>{error&&<p role="alert">{error}</p>}<Button variant="danger" disabled={busy} onClick={()=>{setBusy(true);void session.run(r=>r.cancellations.remove(remove.merchant,remove.currency)).then(refresh).then(()=>setRemove(null)).catch(()=>setError('The cancellation record could not be removed.')).finally(()=>setBusy(false));}}>Remove cancellation record</Button></Sheet>}
 </section>;
}
