import {useEffect,useState} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Capacitor} from '@capacitor/core';
import {currency} from '../../core/money';
import {defaultNotices,noticeKinds,notificationPlan,type NoticePreferences} from '../../intelligence/notifications';
import {localDay,Reminder} from '../../ingest/reminders';
import {Button,Row} from '../design/primitives';
import {useSession} from '../session';
import {useDisplayCurrencyState} from '../currency';
import {brainQuery} from '../money';
const labels={bill:'Upcoming bills',unusual:'Transactions to review',price:'Recurring price changes',digest:'Monthly review'};
/**
 * ONE READ OF THE LEDGER AT UNLOCK, NOT TWO.
 *
 * The reminder plan needs the same snapshot the Today cards analyse, and it used to take its own: on a
 * 20,000-row ledger that is a second full pass over the table in 256-row pages, started at the same
 * moment as the first, and the two together held the 20,000-row History load at the edge of its budget
 * on the device gate. For the currency on display the plan now reads the analysis through the same query
 * key Today uses, so the ledger is paged once and both wait on it; only an account in another currency
 * still takes a snapshot of its own.
 */
export function NotificationSync(){
 const session=useSession(),client=useQueryClient(),{code:shown,settled}=useDisplayCurrencyState(),[error,setError]=useState('');
 const plan=useQuery({queryKey:['money-notice-plan',shown],enabled:session.state==='ready'&&settled&&Capacitor.isNativePlatform(),queryFn:async()=>{
  const {preferences,accounts}=await session.run(async repo=>({preferences:await repo.notifications.preferences(),accounts:await repo.accounts()}));
  if(!noticeKinds.some(k=>preferences[k]))return [];
  const today=localDay();
  const snapshotFor=async(held:string)=>held===shown
   ?(await client.ensureQueryData(brainQuery(session.run,today,shown))).snapshot
   :session.run(r=>r.intelligence.snapshot(today,currency(held)));
  const plans=await Promise.all([...new Set(accounts.map(a=>a.currency))].map(async held=>notificationPlan(await snapshotFor(held),preferences)));
  const used=new Set<string>();
  return plans.flat().sort((a,b)=>a.date.localeCompare(b.date)||noticeKinds.indexOf(a.kind)-noticeKinds.indexOf(b.kind)||a.key.localeCompare(b.key)).filter(n=>{if(used.has(n.date))return false;used.add(n.date);return true;}).slice(0,4).map(n=>{const [y,m,d]=n.date.split('-').map(Number);return {...n,at:Math.max(new Date(y!,m!-1,d!,9).getTime(),Date.now()+60000)};});
 }});
 useEffect(()=>{if(session.state==='ready'&&Capacitor.isNativePlatform()&&plan.data)void Promise.resolve().then(()=>Reminder.notices({queue:plan.data!})).then(()=>setError('')).catch(()=>setError('Notifications could not be scheduled. Open Kairos again to retry.'));},[session.state,plan.data]);
 return error||plan.error?<p role="status">{error||'Notification records could not be read. Open Kairos again to retry.'}</p>:null;
}
export function NotificationSettings(){
 const session=useSession(),client=useQueryClient(),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const saved=useQuery({queryKey:['money-notice-preferences'],enabled:session.state==='ready',queryFn:()=>session.run(repo=>repo.notifications.preferences())});
 async function toggle(kind:keyof NoticePreferences){
  setBusy(true);setMessage('');
  try{
   const next={...(saved.data??defaultNotices),[kind]:!saved.data?.[kind]};
   if(next[kind]&&!(await Reminder.request()).granted)throw new Error('Notifications are off in Android settings. Your preference was not changed.');
   await session.run(repo=>repo.notifications.save(next));
   await client.invalidateQueries({queryKey:['money-notice-preferences']});
   await client.invalidateQueries({queryKey:['money-notice-plan']});
   setMessage(`${labels[kind]} ${next[kind]?'enabled':'turned off'}.`);
  }catch(e){setMessage(e instanceof Error?e.message:'The preference could not be saved. Try again.');}finally{setBusy(false);}
 }
 return <section className="settings-section"><h2>Notifications</h2><p>Off by default. Based on imported records; refreshed when you open Kairos. At most one money review per day. Lock-screen messages contain no amounts or merchant names.</p>{noticeKinds.map(kind=><Row key={kind} trailing={<Button aria-pressed={saved.data?.[kind]??false} disabled={busy||!saved.data||!Capacitor.isNativePlatform()} onClick={()=>void toggle(kind)}>{saved.data?.[kind]?'On':'Off'}</Button>}>{labels[kind]}</Row>)}<p className="meta">These do not read your bank’s notifications. Delivery depends on Android notification settings.</p>{(message||saved.error)&&<p role="status">{message||'Notification preferences could not be read. Lock and reopen Kairos.'}</p>}</section>;
}
