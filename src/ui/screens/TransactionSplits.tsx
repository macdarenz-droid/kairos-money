import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {currencyDigits,money,parseDecimal,type Currency} from '../../core/money';
import {splitCategories,validSplit} from '../../ledger/splits';
import {Amount,Button,Input,Row} from '../design/primitives';
import {fillTarget,splitEvenly} from '../proposals/allocate';
import {useSession} from '../session';
function decimal(minor:string,code:Currency){const value=BigInt(minor),digits=currencyDigits[code],unit=10n**BigInt(digits);return `${value/unit}${digits?'.'+(value%unit).toString().padStart(digits,'0'):''}`;}
export function TransactionSplits({id,minor,code}:{id:string;minor:string;code:Currency}){
 const session=useSession(),client=useQueryClient(),[editing,setEditing]=useState(false),[parts,setParts]=useState([{category:'Groceries',amount:''},{category:'Shopping',amount:''}]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[removing,setRemoving]=useState(false);
 const q=useQuery({queryKey:['split',id],enabled:session.state==='ready',queryFn:()=>session.run(r=>r.splits.get(id))});
 if(session.state!=='ready')return null;
 const active=q.data&&validSplit(q.data,minor,code);let remaining:bigint|null=null;
 try{remaining=-BigInt(minor)-parts.reduce((n,p)=>n+parseDecimal(p.amount||'0',code).minor,0n);money(remaining,code);}catch{remaining=null;/* Incomplete input is validated on save. */}
 const refresh=()=>client.invalidateQueries();
 function edit(){setError('');setParts(q.data?.parts.map(p=>({category:p.category,amount:decimal(p.minor,code)}))??[{category:'Groceries',amount:''},{category:'Shopping',amount:''}]);setEditing(true);}
 async function save(){setBusy(true);setError('');try{await session.run(r=>r.splits.save(id,parts.map(p=>({category:p.category,minor:parseDecimal(p.amount,code).minor.toString()}))));await refresh();setEditing(false);}catch(e){setError(e instanceof Error?e.message:'The split could not be saved.');}finally{setBusy(false);}}
 return <section className="stack"><h3>Category split</h3><p className="meta">Divide this expense between categories. It remains one payment with the original amount and source evidence.</p>
 {q.error?<p role="alert">The split could not be read. <Button onClick={()=>void q.refetch()}>Retry</Button></p>:q.isPending?<p>Reading category split…</p>:<>
 {q.data&&!active&&<p role="alert">The saved split no longer matches this payment. It is excluded from analysis until you update or remove it.</p>}
 {!editing&&<>{q.data?.parts.map((p,i)=><Row key={i} trailing={<Amount value={money(BigInt(p.minor),code)} context={p.category}/>}>{p.category}</Row>)}<Button onClick={edit}>{q.data?'Edit category split':'Split this expense'}</Button>{q.data&&<Button onClick={()=>setRemoving(true)}>Remove split</Button>}</>}
 {editing&&<><p>Allocate <Amount value={money(-BigInt(minor),code)} context="original expense total"/> exactly.</p>{parts.map((p,i)=><div className="stack" key={i}><label className="input-label">Category {i+1}<select disabled={busy} value={p.category} onChange={e=>setParts(rows=>rows.map((r,j)=>j===i?{...r,category:e.target.value}:r))}>{splitCategories.map(c=><option key={c}>{c}</option>)}</select></label><Input label={`Amount ${i+1}`} inputMode="decimal" disabled={busy} value={p.amount} onChange={e=>setParts(rows=>rows.map((r,j)=>j===i?{...r,amount:e.target.value}:r))}/>{parts.length>2&&<Button disabled={busy} onClick={()=>setParts(rows=>rows.filter((_,j)=>j!==i))}>Remove part {i+1}</Button>}</div>)}{parts.length<10&&<Button disabled={busy} onClick={()=>setParts(rows=>[...rows,{category:'Shopping',amount:''}])}>Add category part</Button>}<div className="form-actions"><Button disabled={busy} onClick={()=>setParts(rows=>{
   const shares=splitEvenly(-BigInt(minor),rows.length);
   return rows.map((r,i)=>({...r,amount:decimal(shares[i]!.toString(),code)}));
  })}>Split evenly</Button><Button disabled={busy||remaining===null||remaining===0n} onClick={()=>setParts(rows=>{
   const index=fillTarget(rows.map(r=>r.amount));
   return rows.map((r,i)=>i===index?{...r,amount:decimal(((parseDecimal(r.amount||'0',code).minor)+(remaining??0n)).toString(),code)}:r);
  })}>Fill remainder</Button></div><p aria-live="polite">{remaining===null?'Check the amounts.':<>Remaining to allocate: <Amount value={money(remaining,code)} context="remaining to allocate"/></>}</p><Button disabled={busy} onClick={()=>void save()}>Save category split</Button><Button disabled={busy} onClick={()=>{setEditing(false);setError('');}}>Cancel split edit</Button></>}
 {removing&&<div className="stack"><p>Remove the split and use the payment’s single category again?</p><Button disabled={busy} onClick={()=>{setBusy(true);setError('');void session.run(r=>r.splits.remove(id)).then(refresh).then(()=>setRemoving(false)).catch(()=>setError('The split could not be removed.')).finally(()=>setBusy(false));}}>Confirm remove split</Button><Button disabled={busy} onClick={()=>setRemoving(false)}>Keep split</Button></div>}
 </>}{error&&<p role="alert">{error}</p>}</section>;
}
