import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {currency,currencyDigits,money,parseDecimal,type Currency} from '../../core/money';
import {foreignRate} from '../../ledger/foreign-currency';
import {Amount,Button,Input,Row} from '../design/primitives';
import {useSession} from '../session';
export function ForeignCurrency({id,code}:{id:string;code:Currency}){
 const session=useSession(),client=useQueryClient(),[editing,setEditing]=useState(false),[originalCode,setCode]=useState<string>(code==='USD'?'AUD':'USD'),[amount,setAmount]=useState(''),[note,setNote]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[removing,setRemoving]=useState(false);
 const q=useQuery({queryKey:['foreign-amount',id],enabled:session.state==='ready',queryFn:()=>session.run(r=>r.foreignCurrency.read(id))});
 const value=q.data?.value;const refresh=()=>client.invalidateQueries({queryKey:['foreign-amount',id]});
 function edit(){setError('');if(value){setCode(value.originalCurrency);const unit=10n**BigInt(currencyDigits[value.originalCurrency]),n=BigInt(value.originalMinor);setAmount(`${n/unit}${unit>1n?'.'+(n%unit).toString().padStart(currencyDigits[value.originalCurrency],'0'):''}`);setNote(value.note);}setEditing(true);}
 async function save(){setBusy(true);setError('');try{await session.run(r=>r.foreignCurrency.save(id,{originalCurrency:originalCode,originalMinor:parseDecimal(amount,currency(originalCode)).minor.toString(),note}));await refresh();setEditing(false);}catch(e){setError(e instanceof Error?e.message:'The original amount could not be saved.');}finally{setBusy(false);}}
 return <section className="stack"><h3>Original currency</h3><p className="meta">Record the original amount from the statement or receipt. The account amount remains authoritative; this does not convert other transactions or add a fee.</p>
 {q.isPending?<p>Reading original amount…</p>:q.error?<p role="alert">The original amount could not be read. <Button onClick={()=>void q.refetch()}>Retry</Button> <Button onClick={()=>setRemoving(true)}>Remove unreadable original amount</Button></p>:<>
 {value&&<><Row trailing={<Amount value={money(BigInt(value.originalMinor),value.originalCurrency)} context="recorded original amount"/>}>Original amount · recorded by you</Row><p>{value.note}</p>{q.data?.active?<p>Implied rate: 1 {value.originalCurrency} ≈ {foreignRate(value).display} {value.postedCurrency}. Rounded to six decimals. This may include costs within the posted amount; it is not a live or fee-free market rate.</p>:<p role="alert">The saved amount no longer matches this transaction. Update or remove it before using its exchange rate.</p>}</>}
 {!editing&&<><Button onClick={edit}>{value?'Edit original amount':'Record original amount'}</Button>{value&&<Button onClick={()=>setRemoving(true)}>Remove original amount</Button>}</>}
 {editing&&<><label className="input-label">Original currency<select disabled={busy} value={originalCode} onChange={e=>setCode(e.target.value)}>{Object.keys(currencyDigits).filter(c=>c!==code).map(c=><option key={c}>{c}</option>)}</select></label><Input label="Original positive amount" inputMode="decimal" disabled={busy} value={amount} onChange={e=>setAmount(e.target.value)}/><Input label="Source of original amount" maxLength={500} disabled={busy} value={note} onChange={e=>setNote(e.target.value)}/><Button disabled={busy} onClick={()=>void save()}>Save original amount</Button><Button disabled={busy} onClick={()=>setEditing(false)}>Cancel original amount edit</Button></>}
 </>}
 {removing&&<><p>Remove the original-currency note? The statement payment remains.</p><Button disabled={busy} onClick={()=>{setBusy(true);setError('');void session.run(r=>r.foreignCurrency.remove(id)).then(refresh).then(()=>setRemoving(false)).catch(()=>setError('The original amount could not be removed.')).finally(()=>setBusy(false));}}>Confirm remove original amount</Button><Button disabled={busy} onClick={()=>setRemoving(false)}>Keep original amount</Button></>}
 {error&&<p role="alert">{error}</p>}</section>;
}
