import {Capacitor,registerPlugin} from '@capacitor/core';
import {useEffect,useState} from 'react';
const Launch=registerPlugin<{consume():Promise<{addTransaction:boolean}>}>('KairosLaunch');
export function useQuickAddLaunch(ready:boolean,open:()=>void){
 const [error,setError]=useState('');
 useEffect(()=>{if(!ready||!Capacitor.isNativePlatform())return;let active=true;
  const consume=()=>{void Promise.resolve().then(()=>active?Launch.consume():undefined).then(result=>{if(active){setError('');if(result?.addTransaction)open();}}).catch(()=>{if(active)setError('Quick add could not open. Use Add transaction below, or tap the widget again.');});};
  window.addEventListener('kairosQuickAdd',consume);consume();return ()=>{active=false;window.removeEventListener('kairosQuickAdd',consume);};
 },[ready,open]);
 return ready?error:'';
}
