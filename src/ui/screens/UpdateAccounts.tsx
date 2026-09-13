import { useState } from 'react';
import type { Account } from '../../core/db/repository';
import type { Batch } from '../../ingest/types';
import { accountFreshness, newestIsStale } from '../../ingest/freshness';
import { Button, Row, Sheet, Surface } from '../design/primitives';
import { ReminderSettings } from './reminders';
export function Freshness({accounts,batches,today,onUpdate}:{accounts:Account[];batches:Batch[];today:string;onUpdate:()=>void}) {
 if(!accounts.length)return null;
 const stale=newestIsStale(accounts.map(a=>a.id),batches,today);
 return <Surface className={stale?'surface-muted':''}><h2>{stale?'Your data needs an update':'Account freshness'}</h2>{accounts.map(a=>{const f=accountFreshness(a.id,batches,today);return <Row key={a.id}><h3>{a.name}</h3><p>{f.asOf?`As of ${f.asOf} · ${f.staleDays} days old`:'No imported coverage yet'}</p></Row>;})}{stale && <p>Amounts from these imports do not describe today’s available money.</p>}<Button onClick={onUpdate}>Update accounts</Button></Surface>;
}
export function UpdateAccounts({accounts,batches,today,onClose,onImport}:{accounts:Account[];batches:Batch[];today:string;onClose:()=>void;onImport:()=>void}) {
 const [copied,setCopied]=useState('');
 return <Sheet title="Update accounts" onClose={onClose}><div className="stack"><p>Download a transaction export from your bank. OFX or QIF is preferred, then CSV or XLSX. PDF statements remain supported.</p>{accounts.map(a=>{const f=accountFreshness(a.id,batches,today);return <section key={a.id}><h3>{a.name}</h3><p>{f.asOf?`Last covered ${f.asOf} · ${f.staleDays} days old`:'No covered dates yet'}</p><p className="export-range">Export {f.rangeText}</p><p className="meta">{f.asOf?'This includes the last covered week so later settlements can be matched.':'Start with this range, or use a longer historical export.'}</p><Button onClick={()=>{void navigator.clipboard.writeText(f.rangeText).then(()=>setCopied(a.name+' range copied.')).catch(()=>setCopied('Select and copy the date range above.'));}}>Copy range</Button></section>;})}{copied && <p role="status">{copied}</p>}<p>Choose multiple files together. They stay in encrypted staging until you review and confirm.</p><Button variant="primary" disabled={!accounts.length} onClick={onImport}>Choose update files</Button><ReminderSettings accounts={accounts} batches={batches} today={today}/></div></Sheet>;
}
