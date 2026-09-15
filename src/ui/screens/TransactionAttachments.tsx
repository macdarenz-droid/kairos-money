import {useEffect,useState} from 'react';
import {Capacitor} from '@capacitor/core';
import {ReceiptCamera} from './ReceiptCamera';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {FilePicker} from '@capawesome/capacitor-file-picker';
import {Filesystem} from '@capacitor/filesystem';
import {decodeFile} from '../../ingest/review/files';
import {FileSource} from '../../ingest/sources';
import {useSession} from '../session';
import {Button,Input} from '../design/primitives';
import {ImportProgress} from '../design/ImportProgress';
import {checkReceipt,describeReceipt} from '../../ledger/receipt-check';
import {currency} from '../../core/money';
export function TransactionAttachments({target,recordedMinor,code}:{target:string;recordedMinor?:string|undefined;code?:string|undefined}){
 const session=useSession(),client=useQueryClient(),[note,setNote]=useState<string>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[progress,setProgress]=useState('');
 const q=useQuery({queryKey:['transaction-detail',target],queryFn:()=>session.run(r=>r.attachments.read(target)),enabled:session.state==='ready'});
 const refresh=()=>client.invalidateQueries({queryKey:['transaction-detail',target]});
 const [camera,setCamera]=useState(false),[savedReceipt,setSavedReceipt]=useState<{id:string;name:string}>();
 useEffect(()=>{if(session.state!=='ready')setCamera(false);},[session.state]);
 async function saveReceipt(data:string,name:string,signal?:AbortSignal){setSavedReceipt(undefined);const id=crypto.randomUUID(),bytes=decodeFile(data);try{const text=await new FileSource(bytes,name).receiptText(setProgress);if(signal?.aborted)throw new Error('Receipt capture was cancelled.');await session.run(r=>{if(signal?.aborted)throw new Error('Receipt capture was cancelled.');return r.attachments.attach(target,{id,name,data,text});});await refresh();if(!signal?.aborted)setSavedReceipt({id,name});}finally{bytes.fill(0);}}
 async function attach(){setBusy(true);setError('');setProgress('Choose a receipt');try{
  const files=await FilePicker.pickFiles({readData:false,limit:1});const f=files.files[0];if(!f)return;if(f.size>10485760||!f.path)throw new Error('Choose a local receipt below 10 MB.');
  const loaded=await Filesystem.readFile({path:f.path});if(typeof loaded.data!=='string')throw new Error('The receipt could not be read. Save it locally and try again.');
  await saveReceipt(loaded.data,f.name);
  await refresh();
 }catch(e){setError(e instanceof Error?e.message:'The receipt could not be attached.');}finally{setBusy(false);setProgress('');}}
 async function saveNote(){setBusy(true);setError('');try{await session.run(r=>r.attachments.note(target,note??q.data?.note??''));await refresh();}catch(e){setError(e instanceof Error?e.message:'The note could not be saved.');}finally{setBusy(false);}}
 return <section className="stack"><h3>Notes and receipts</h3><Input label="Transaction note" maxLength={2000} value={note??q.data?.note??''} onChange={e=>setNote(e.target.value)}/><Button disabled={busy||q.isPending} onClick={()=>void saveNote()}>Save note</Button><Button disabled={busy} onClick={()=>void attach()}>Attach receipt to this transaction</Button>{Capacitor.isNativePlatform()&&<Button disabled={busy||camera||session.state!=='ready'} onClick={()=>{setSavedReceipt(undefined);setCamera(true);}}>Take receipt photo</Button>}{camera&&session.state==='ready'&&<ReceiptCamera onClose={()=>setCamera(false)} onUse={(data,signal)=>saveReceipt(data,'Receipt-'+new Date().toISOString().slice(0,10)+'.jpg',signal)}/>}<p className="meta">Attach a photo or PDF to this transaction. Text is read on this device. This does not add a purchase or change your balance.</p>{savedReceipt&&<p role="status">{savedReceipt.name} saved in Notes and receipts for this transaction. No new transaction was added.</p>}{busy&&progress&&<ImportProgress message={progress}/>}{q.data?.receipts.map(r=><details key={r.id} open={savedReceipt?.id===r.id||undefined}><summary>{r.name}</summary>
  {recordedMinor!==undefined&&code!==undefined
   ? <p>{describeReceipt(checkReceipt(r.text,recordedMinor,currency(code)),currency(code))}</p>
   : <p className="meta">Attach this photo to a transaction to check its total against what was recorded.</p>}
  <details><summary>Read the text on this photo</summary><pre className="raw-excerpt">{r.text}</pre></details><Button disabled={busy} onClick={()=>void session.run(repo=>repo.attachments.remove(target,r.id)).then(()=>{if(savedReceipt?.id===r.id)setSavedReceipt(undefined);return refresh();}).catch(()=>setError('The receipt could not be removed.'))}>Remove receipt</Button></details>)}{(error||q.error)&&<p role="alert">{error||'Saved notes could not be read.'}</p>}</section>;
}
