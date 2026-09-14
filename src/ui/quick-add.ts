import {Capacitor,registerPlugin} from '@capacitor/core';
import {useEffect,useState} from 'react';
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
