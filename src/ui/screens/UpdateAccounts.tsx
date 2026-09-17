import { useState } from 'react';
import type { Account } from '../../core/db/repository';
import type { BatchSummary } from '../../ingest/types';
import { accountFreshness, newestIsStale } from '../../ingest/freshness';
import { Button, Explain, Row, Sheet, Surface } from '../design/primitives';
import { ReminderSettings } from './reminders';
export function Freshness({accounts,batches,today,onUpdate,awaiting=0}:{accounts:Account[];batches:BatchSummary[];today:string;onUpdate:()=>void;awaiting?:number}) {
 if(!accounts.length)return null;
 const stale=newestIsStale(accounts.map(a=>a.id),batches,today);
 // On the home screen this is the one "anything I need to do?" line, so when there is nothing to do it
 // says nothing at all. A list of accounts and their ages is a status report, and a status report nobody
 // asked for is what made this screen unreadable.
 if(!stale)return null;
 // Two paragraphs explaining what a statement is and what the app can therefore know. The state is the
 // message: an age per account, and the one control that fixes it. The button's label is unchanged
 // because the device gate taps it by name.
 return <Surface className="surface-muted"><h2>Statements out of date</h2>
  {awaiting>0&&<p className="meta"><span className="tag">{awaiting} not on a statement yet</span></p>}
  {accounts.map(a=>{const f=accountFreshness(a.id,batches,today);return <Row key={a.id} trailing={<span className="meta">{f.asOf?`${f.staleDays}d`:'None'}</span>}>{a.name}</Row>;})}
  <Button onClick={onUpdate}>Bring my statements up to date</Button></Surface>;
}
export function UpdateAccounts({accounts,batches,today,onClose,onImport}:{accounts:Account[];batches:BatchSummary[];today:string;onClose:()=>void;onImport:()=>void}) {
 const [copied,setCopied]=useState('');
 return <Sheet title="Update accounts" onClose={onClose}><div className="stack"><span className="heading-row"><p>Download a transaction export from your bank.</p><Explain title="Which file to download">
 <p>OFX or QIF is preferred, then CSV or XLSX. PDF statements remain supported.</p>
 <p>Choose multiple files together. They stay in encrypted staging until you review and confirm.</p>
 </Explain></span>{accounts.map(a=>{const f=accountFreshness(a.id,batches,today);return <section key={a.id}><h3>{a.name}</h3><p>{f.asOf?`Last covered ${f.asOf} · ${f.staleDays} days old`:'No covered dates yet'}</p><p className="export-range">Export {f.rangeText}</p><p className="meta">{f.asOf?'Includes the last covered week':'Or use a longer historical export'}</p><Button onClick={()=>{void navigator.clipboard.writeText(f.rangeText).then(()=>setCopied(a.name+' range copied.')).catch(()=>setCopied('Select and copy the date range above.'));}}>Copy range</Button></section>;})}{copied && <p role="status">{copied}</p>}<Button variant="primary" disabled={!accounts.length} onClick={onImport}>Choose update files</Button><ReminderSettings accounts={accounts} batches={batches} today={today}/></div></Sheet>;
}
