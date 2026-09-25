import { registerPlugin } from '@capacitor/core';
/**
 * The notification bridge. It scheduled a weekly "your statements are out of date" alarm as well, until
 * he took the feature that alarm was about out of the app: "update accounts its just adding or removing
 * money thats it!! ... REMOVE FEATURE IF REDANDUNT." A reminder to do a thing the app no longer has is
 * a notification about nothing, so schedule and cancel went with it. What is left is what the money
 * notifications need: permission, and the queue they are delivered from.
 */
export const Reminder = registerPlugin<{ request():Promise<{granted:boolean}>; status():Promise<{granted:boolean}>; notices(o:{queue:{kind:string;key:string;at:number}[]}):Promise<void> }>('KairosReminder');
export function localDay(date=new Date()) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
