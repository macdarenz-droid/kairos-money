import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';
import type { Account } from '../../core/db/repository';
import type { Batch } from '../../ingest/types';
import { Reminder, syncReminder } from '../../ingest/reminders';
import { Button } from '../design/primitives';
import { useSession } from '../session';
export function ReminderSettings({accounts,batches,today}:{accounts:Account[];batches:Batch[];today:string}) {
 const session=useSession(),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[weekday,setWeekday]=useState('1');
 const setting=useQuery({queryKey:['update-reminder'],queryFn:()=>session.run(repo=>repo.imports.reminderDay())});
 async function save(enabled:boolean){setBusy(true);try{if(enabled && Capacitor.isNativePlatform() && !(await Reminder.request()).granted)throw new Error('Notifications are off. Enable them in Android settings to use reminders.');const day=enabled?Number(weekday):null;await syncReminder(day,accounts.map(a=>a.id),batches,today);await session.run(repo=>repo.imports.setReminderDay(day));await setting.refetch();setMessage(enabled?'Weekly reminder enabled. Fresh data suppresses the reminder.':'Weekly reminder is off.');}catch(e){setMessage(e instanceof Error?e.message:'Reminder could not be saved.');}finally{setBusy(false);}}
 return <section className="stack"><h3>Local reminder</h3><p>{setting.data==null?'Off by default.':'Enabled.'} Remind me at about 6 pm on the selected weekday, only when an account needs updating.</p><label className="input-label">Reminder weekday<select value={weekday} onChange={e=>setWeekday(e.target.value)}>{['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((day,i)=><option key={day} value={i}>{day}</option>)}</select></label><div className="form-actions"><Button disabled={busy} onClick={()=>void save(false)}>Turn off</Button><Button disabled={busy} onClick={()=>void save(true)}>Save reminder</Button></div>{message&&<p role="status">{message}</p>}</section>;
}
