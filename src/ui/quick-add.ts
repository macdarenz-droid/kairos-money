import {Capacitor,registerPlugin} from '@capacitor/core';
import {useEffect,useRef,useState} from 'react';
import type {Repository} from '../core/db/repository';
import {accountForQuickAdd, clearQuickAdds, configureQuickAdd, manualFromQuickAdd, pendingQuickAdds, quickAddAvailable, WIDGET_CATEGORIES} from '../ingest/quick-add';
const Launch=registerPlugin<{
 peek():Promise<{requestId:string|null}>;
 acknowledge(options:{requestId:string}):Promise<{acknowledged:boolean}>;
}>('KairosLaunch');
export function useQuickAddLaunch(ready:boolean,open:(requestId:string)=>void,displayedRequestId:string|null=null){
 const [error,setError]=useState('');
 useEffect(()=>{
  if(!ready||!Capacitor.isNativePlatform())return;
  let active=true;let inspection=0;
  const inspect=()=>{
   const current=++inspection;
   void Promise.resolve().then(()=>active?Launch.peek():undefined).then(result=>{
    if(active&&current===inspection){setError('');if(result?.requestId)open(result.requestId);}
   }).catch(()=>{if(active&&current===inspection)setError('Quick add could not open. Use Add transaction below, or tap the widget again.');});
  };
  window.addEventListener('kairosQuickAdd',inspect);inspect();
  return ()=>{active=false;window.removeEventListener('kairosQuickAdd',inspect);};
 },[ready,open]);
 // Reading does not consume navigation. Confirm only a committed, unlocked
 // entry/account screen; an old acknowledgement cannot clear a newer tap.
 useEffect(()=>{
  if(!ready||!displayedRequestId||!Capacitor.isNativePlatform())return;
  let active=true;
  void Promise.resolve().then(()=>active?Launch.acknowledge({requestId:displayedRequestId}):undefined).catch(()=>{
   if(active)setError('Quick add opened, but its launch could not be confirmed. It may reopen after unlocking.');
  });
  return ()=>{active=false;};
 },[ready,displayedRequestId]);
 return ready?error:'';
}

type OutboxAccount={id:string;name:string;currency:string;archived_at:string|null};
/**
 * THE WIDGET'S OUTBOX, EMPTIED INTO THE LEDGER.
 *
 * Runs when the app is unlocked and again each time it comes back to the front, because the sheet on
 * the home screen cannot tell the app anything: it only writes the store. Each entry becomes a
 * hand-recorded transaction, then is cleared; a currency that fits no open account is left where it is.
 * The same pass writes the sheet's settings — the main account by name and currency, the chips — so the
 * widget always knows where its money goes.
 */
export function useQuickAddOutbox(ready:boolean,run:<T>(fn:(repo:Repository)=>Promise<T>)=>Promise<T>,accounts:readonly OutboxAccount[]|undefined,primaryId:string|null|undefined,onAdded:(count:number)=>void){
 const latest=useRef({run,onAdded});latest.current={run,onAdded};
 const busy=useRef(false);
 useEffect(()=>{
  if(!ready||!quickAddAvailable()||!accounts||primaryId===undefined)return;
  let active=true;
  const drain=async()=>{
   if(busy.current)return;busy.current=true;
   try{
    const open=accounts.filter(a=>a.archived_at===null);
    const main=open.find(a=>a.id===primaryId)??open[0];
    if(main)await configureQuickAdd({accountId:main.id,accountName:main.name,currency:main.currency,categories:[...WIDGET_CATEGORIES]});
    const entries=await pendingQuickAdds();
    const done:string[]=[];
    for(const entry of entries){
     const account=accountForQuickAdd(entry,accounts,primaryId??null);
     if(!account)continue;
     // One unreadable entry stays in the outbox; it must not hold back the rest.
     try{await latest.current.run(repo=>repo.manual.save(manualFromQuickAdd(entry,account)));done.push(entry.id);}catch{continue;}
    }
    if(done.length){await clearQuickAdds(done);if(active)latest.current.onAdded(done.length);}
   }catch{/* The store answers on the next open; nothing is lost by waiting. */}
   finally{busy.current=false;}
  };
  void drain();
  const onVisible=()=>{if(document.visibilityState==='visible')void drain();};
  document.addEventListener('visibilitychange',onVisible);
  return()=>{active=false;document.removeEventListener('visibilitychange',onVisible);};
 },[ready,accounts,primaryId]);
}
