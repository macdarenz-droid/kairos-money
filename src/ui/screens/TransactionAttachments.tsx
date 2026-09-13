import {useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {FilePicker} from '@capawesome/capacitor-file-picker';
import {Filesystem} from '@capacitor/filesystem';
import {decodeFile} from '../../ingest/review/files';
import {FileSource} from '../../ingest/sources';
import {useSession} from '../session';
import {Button,Input} from '../design/primitives';
import {ImportProgress} from '../design/ImportProgress';
export function TransactionAttachments({target}:{target:string}){
 const session=useSession(),client=useQueryClient(),[note,setNote]=useState<string>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[progress,setProgress]=useState('');
 const q=useQuery({queryKey:['transaction-detail',target],queryFn:()=>session.run(r=>r.attachments.read(target)),enabled:session.state==='ready'});
 const refresh=()=>client.invalidateQueries({queryKey:['transaction-detail',target]});
 async function attach(){setBusy(true);setError('');setProgress('Choose a receipt');try{
  const files=await FilePicker.pickFiles({readData:false,limit:1});const f=files.files[0];if(!f)return;if(f.size>10485760||!f.path)throw new Error('Choose a local receipt below 10 MB.');
  const loaded=await Filesystem.readFile({path:f.path});if(typeof loaded.data!=='string')throw new Error('The receipt could not be read. Save it locally and try again.');
  const bytes=decodeFile(loaded.data);try{const text=await new FileSource(bytes,f.name).receiptText(setProgress);await session.run(r=>r.attachments.attach(target,{id:crypto.randomUUID(),name:f.name,data:loaded.data as string,text}));}finally{bytes.fill(0);}
  await refresh();
 }catch(e){setError(e instanceof Error?e.message:'The receipt could not be attached.');}finally{setBusy(false);setProgress('');}}
 async function saveNote(){setBusy(true);setError('');try{await session.run(r=>r.attachments.note(target,note??q.data?.note??''));await refresh();}catch(e){setError(e instanceof Error?e.message:'The note could not be saved.');}finally{setBusy(false);}}
 return <section className="stack"><h3>Notes and receipts</h3><Input label="Transaction note" maxLength={2000} value={note??q.data?.note??''} onChange={e=>setNote(e.target.value)}/><Button disabled={busy||q.isPending} onClick={()=>void saveNote()}>Save note</Button><Button disabled={busy} onClick={()=>void attach()}>Attach receipt</Button><p className="meta">Choose a receipt photo or PDF. Text is read on this device and never adds another transaction.</p>{busy&&progress&&<ImportProgress message={progress}/>}{q.data?.receipts.map(r=><details key={r.id}><summary>{r.name}</summary><pre className="raw-excerpt">{r.text}</pre><Button disabled={busy} onClick={()=>void session.run(repo=>repo.attachments.remove(target,r.id)).then(refresh).catch(()=>setError('The receipt could not be removed.'))}>Remove receipt</Button></details>)}{(error||q.error)&&<p role="alert">{error||'Saved notes could not be read.'}</p>}</section>;
}
