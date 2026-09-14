import {Capacitor,registerPlugin} from '@capacitor/core';
import {useEffect} from 'react';
const Launch=registerPlugin<{consume():Promise<{addTransaction:boolean}>}>('KairosLaunch');
export function useQuickAddLaunch(ready:boolean,open:()=>void){
 useEffect(()=>{if(!ready||!Capacitor.isNativePlatform())return;let active=true;
  const consume=()=>{void Promise.resolve().then(()=>active?Launch.consume():undefined).then(result=>{if(active&&result?.addTransaction)open();}).catch(()=>undefined);};
  window.addEventListener('kairosQuickAdd',consume);consume();return ()=>{active=false;window.removeEventListener('kairosQuickAdd',consume);};
 },[ready,open]);
}
