import { Capacitor, registerPlugin } from '@capacitor/core';
import { shiftDay } from './normalize';
import { accountFreshness } from './freshness';
import type { Batch } from './types';
export const Reminder = registerPlugin<{ schedule(o:{at:number}):Promise<void>; cancel():Promise<void>; request():Promise<{granted:boolean}>; notices(o:{queue:{kind:string;key:string;at:number}[]}):Promise<void> }>('KairosReminder');
export function nextReminder(weekday:number,accountIds:string[],batches:readonly Batch[],today:string):number|null {
 if(!Number.isInteger(weekday)||weekday<0||weekday>6||!accountIds.length)return null;
 let day=shiftDay(today,1);
 for(let i=0;i<15;i++,day=shiftDay(day,1)) {
  if(new Date(day).getUTCDay()!==weekday)continue;
  if(accountIds.some(id=>accountFreshness(id,batches,day).stale)) { const [year,month,date]=day.split('-').map(Number);return new Date(year!,month!-1,date!,18).getTime(); }
 }
 return null;
}
export async function syncReminder(weekday:number|null,ids:string[],batches:readonly Batch[],today:string) {
 if(!Capacitor.isNativePlatform())return;
 const at=weekday===null?null:nextReminder(weekday,ids,batches,today);
 if(at===null)await Reminder.cancel();else await Reminder.schedule({at});
}
export function localDay(date=new Date()) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
