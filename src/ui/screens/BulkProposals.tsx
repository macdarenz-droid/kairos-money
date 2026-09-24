import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {useSession} from '../session';
import {Button,Row} from '../design/primitives';
import {bulkCategoryProposals} from '../proposals/derive';

/**
 * One-tap bulk categorisation, offered where the uncategorised rows already are.
 *
 * Statements import the transactions; what recurs forever is categorising them, which is why this is the
 * first proposal built. It only ever offers a category the user already applied to that same merchant, and
 * applying it goes through the same repository call the manual bulk screen uses, with its existing checks
 * on transfers, splits and manual entries. Nothing here bypasses a confirmation: the action is the
 * confirmation, and it is reversible by recategorising.
 */
export function BulkProposals({search=''}:{search?:string}){
 const session=useSession(),client=useQueryClient();
 const [busy,setBusy]=useState('');const [error,setError]=useState('');const [done,setDone]=useState<string[]>([]);
 const rows=useQuery({queryKey:['ledger-bulk',search],queryFn:()=>session.run(r=>r.imports.ledgerBulk(search)),enabled:session.state==='ready'});
 const proposals=bulkCategoryProposals(rows.data?.rows??[]).filter(p=>!done.includes(p.id)).slice(0,3);
 if(!proposals.length)return null;
 async function apply(id:string,ids:string[],category:string){
  setBusy(id);setError('');
  try{
   await session.run(r=>r.categories.set(ids,category));
   setDone(current=>[...current,id]);
   await client.invalidateQueries();
  }catch(e){setError(e instanceof Error?e.message:'Those categories could not be saved.');}
  finally{setBusy('');}
 }
 return <section className="section-gap">
  <div className="list-heading"><h2>Ready to categorise</h2><span className="meta">From merchants you have filed before</span></div>
  {proposals.map(p=><Row key={p.id} trailing={
   <Button variant="primary" disabled={busy!==''} aria-label={`${p.label}. ${p.detail}`}
    onClick={()=>void apply(p.id,p.prefill.ids,p.prefill.category)} busy={busy===p.id} busyLabel="Saving…">{`Set ${p.prefill.category}`}</Button>}>
   <span>{p.label}</span>
   <p className="meta">{p.detail}</p>
  </Row>)}
  {error&&<p role="alert">{error}</p>}
 </section>;
}
