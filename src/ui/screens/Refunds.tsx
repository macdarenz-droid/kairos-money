import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {currency,format,money} from '../../core/money';
import {matchCandidateProposals} from '../proposals/derive';
import {Amount,Button,Explain,Input,Row} from '../design/primitives';
import {useSession} from '../session';
export function Refunds({id,credit}:{id:string;credit:boolean}){
 const session=useSession(),client=useQueryClient(),[editing,setEditing]=useState(false),[search,setSearch]=useState(''),[selected,setSelected]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[removing,setRemoving]=useState(false);
 const q=useQuery({queryKey:['refund',id],enabled:session.state==='ready',queryFn:()=>session.run(r=>r.refunds.read(id))});
 const value=q.data;
 async function act(fn:()=>Promise<unknown>){setBusy(true);setError('');try{await fn();await client.invalidateQueries();setEditing(false);setRemoving(false);}catch(e){setError(e instanceof Error?e.message:'The refund link could not be changed.');}finally{setBusy(false);}}
 const rows=value?.candidates.filter(p=>(p.description+' '+p.date+' '+p.account).toLowerCase().includes(search.toLowerCase()))??[];
 // Ordered by evidence rather than by date, so an exact same-merchant same-amount purchase is not pushed
 // out of reach by anything newer. The full searchable list below is unchanged and remains the way to
 // reach any other eligible purchase.
 const matches=matchCandidateProposals(value?.credit??null,value?.candidates??[]);
 const byId=new Map((value?.candidates??[]).map(p=>[p.id,p]));
 return <section className="stack"><span className="heading-row"><h3>{credit?'Refund link':'Refunds received'}</h3><Explain title={credit?'Refund link':'Refunds received'}>
 <p>Link an actual posted refund to its original purchase. The full credit counts once; the original statement amounts and dates stay intact.</p>
 <p>One credit can link to one purchase; several partial refunds may link to the same purchase.</p>
 </Explain></span>
 {q.isPending?<p>Reading refund links…</p>:q.error?<p role="alert">Refund links could not be read. <Button onClick={()=>void q.refetch()}>Retry</Button></p>:<>
 {credit?<>{value?.saved&&!value.link&&<p role="alert">The saved link no longer matches its source payments. It is inactive until reviewed or removed.</p>}{value?.purchase&&<Row trailing={<Amount value={money(BigInt(value.purchase.minor),currency(value.purchase.currency))} context="original purchase"/>}>{value.purchase.description}<p>{value.purchase.date} · {value.purchase.account}</p></Row>}
 {!editing&&<Button onClick={()=>{setSelected(value?.purchase?.id??'');setEditing(true);setError('');}}>{value?.saved?'Review refund link':'Link this credit as a refund'}</Button>}
 {editing&&<>{matches.length>0&&<div className="section-gap"><p className="meta">Closest evidence first</p>{matches.map(m=>{const p=byId.get(m.prefill.purchaseId)!;return <Row key={m.id} trailing={<Button disabled={busy} aria-pressed={selected===p.id} onClick={()=>setSelected(p.id)}
    aria-label={`Select ${p.description}, ${p.date}, ${p.account}, ${format(money(-BigInt(p.minor),currency(p.currency)))}. ${m.detail}`}>Select</Button>}>{p.description}
    <p>{p.date} · {p.account} · {format(money(-BigInt(p.minor),currency(p.currency)))}</p><p className="meta">{m.detail}</p></Row>;})}</div>}
 <Input label="Find original purchase" value={search} onChange={e=>setSearch(e.target.value)}/>{/* This one stays on the screen. It guards a financial decision the person is about to confirm, and a
     caution behind an info button is a caution nobody reads at the moment it matters. */}
 <p className="meta">A matching amount is not proof of a refund. Confirm only when the statement or receipt identifies the original purchase.</p><label className="input-label">Original purchase<select disabled={busy} value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose purchase</option>{rows.slice(0,100).map(p=><option key={p.id} value={p.id}>{p.date} · {p.description} · {p.account} · {format(money(-BigInt(p.minor),currency(p.currency)))}</option>)}</select></label>{rows.length>100&&<p>Showing 100 purchases. Narrow the search to find another.</p>}{!rows.length&&<p>No eligible purchase. Import its statement first or leave this credit unlinked.</p>}<Button disabled={busy||!selected} onClick={()=>void act(()=>session.run(r=>r.refunds.save(id,selected)))}>Confirm refund link</Button><Button disabled={busy} onClick={()=>setEditing(false)}>Cancel refund linking</Button></>}
 {value?.saved&&<Button disabled={busy} onClick={()=>setRemoving(true)}>Remove refund link</Button>}</>:<>{value?.refunds.length?<>{value.refunds.map(r=><Row key={r.id} trailing={<Amount value={money(BigInt(r.minor),currency(r.currency))} context="linked refund"/>}>{r.description}<p>{r.date} · {r.account}</p></Row>)}<Row trailing={<Amount value={money(BigInt(value.remaining!),currency(value.refunds[0]!.currency))} context="purchase amount after linked refunds"/>}>Purchase amount after linked refunds</Row></>:<p>No confirmed refund linked to this purchase.</p>}</>}
 </>}{removing&&<><p>Remove this link? Both statement transactions remain.</p><Button disabled={busy} onClick={()=>void act(()=>session.run(r=>r.refunds.remove(id)))}>Confirm remove refund link</Button><Button disabled={busy} onClick={()=>setRemoving(false)}>Keep refund link</Button></>}{error&&<p role="alert">{error}</p>}</section>;
}
