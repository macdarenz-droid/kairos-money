import type {Document,LedgerRow} from '../types';
import {reconcile} from './index';
/** Node uses the pure implementation; browser work runs outside the UI thread. */
export async function reconcileAsync(documents:readonly Document[]):Promise<LedgerRow[]>{
 if(typeof Worker==='undefined'||documents.reduce((n,d)=>n+d.rows.length,0)<=200)return reconcile(documents);
 const worker=new Worker(new URL('./worker.ts',import.meta.url),{type:'module'});
 let timeout:ReturnType<typeof setTimeout>|undefined;
 try{return await new Promise<LedgerRow[]>((resolve,reject)=>{
  const timer=setTimeout(()=>{worker.terminate();reject(new Error('Reconciliation took too long. Split this import into smaller files.'));},60000);timeout=timer;
  worker.onmessage=(event:MessageEvent<{rows?:LedgerRow[];error?:string}>)=>{clearTimeout(timer);if(event.data.error)reject(new Error(event.data.error));else if(event.data.rows)resolve(event.data.rows);else reject(new Error('Reconciliation returned no ledger. Try importing again.'));};
  worker.onerror=()=>{clearTimeout(timer);reject(new Error('The reconciliation worker stopped. Reopen the import and try again.'));};
  worker.postMessage(documents);
 });}finally{clearTimeout(timeout);worker.terminate();}
}
