import {useState} from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {currency, currencyDigits, money, parseDecimal} from '../../core/money';
import {netByPerson, type Direction, type Iou} from '../../ledger/people';
import {localDay} from '../../ingest/reminders';
import {Amount, Button, Input, Row, Sheet} from '../design/primitives';
import {PersonBalance} from '../design/PersonBalance';
import {useSession} from '../session';

const blank = (code: string) => ({id: '', person: '', direction: 'owed_to_me' as Direction, currency: code,
  amount: '', reason: '', occurredOn: localDay()});
type Draft = ReturnType<typeof blank>;

/**
 * MONEY BETWEEN PEOPLE, in the Ledger.
 *
 * Netted per person, because four dinners and two taxis between the same two people is ONE number, and
 * it is the number either of you would say out loud. The entries stay underneath so the number can be
 * opened; they are never replaced by it.
 *
 * People you are square with are simply not here. There is no "settled" section standing permanently on
 * the screen — a settled entry is findable, but it is not news.
 */
export function People() {
  const session = useSession(), client = useQueryClient();
  const home = useQuery({queryKey: ['display-currency'], enabled: session.state === 'ready',
    queryFn: () => session.run(repo => repo.displayCurrency())});
  const code = home.data ?? 'AUD';
  const entries = useQuery({queryKey: ['ious'], enabled: session.state === 'ready',
    queryFn: () => session.run(repo => repo.people.list())});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (session.state !== 'ready') return null;

  const rows = entries.data ?? [];
  const nets = netByPerson(rows, currency(code));
  const largest = nets.reduce((most, n) => { const size = BigInt(n.netMinor) < 0n ? -BigInt(n.netMinor) : BigInt(n.netMinor); return size > most ? size : most; }, 1n);
  const refresh = () => client.invalidateQueries({queryKey: ['ious']});

  async function save(entry: Draft) {
    setBusy(true); setError('');
    try {
      const value = parseDecimal(entry.amount, currency(entry.currency));
      await session.run(repo => repo.people.save({id: entry.id || crypto.randomUUID(), person: entry.person,
        direction: entry.direction, currency: value.currency, amountMinor: value.minor.toString(),
        reason: entry.reason, occurredOn: entry.occurredOn, transactionId: null}));
      await refresh(); setDraft(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'The entry could not be saved.'); }
    finally { setBusy(false); }
  }
  async function settle(person: string) {
    setBusy(true); setError('');
    try { await session.run(repo => repo.people.settle(person, localDay())); await refresh(); setOpen(null); }
    catch { setError('That could not be settled.'); }
    finally { setBusy(false); }
  }

  const detail = (item: Iou) => `${item.occurredOn} · ${item.reason}`;
  return <section className="stack">
    <div className="list-heading"><h2>Between people</h2><span className="meta">Net, {code}</span></div>
    {/* NOT a Row. A Row sizes its leading cell to its content, and three rows of different widths put
        three diverging centres in three different places — which is the one thing this chart cannot
        survive. The bar spans the full row so every centre is the same centre. */}
    {nets.map(person => <button type="button" key={person.person} className="person-line"
      onClick={() => { setError(''); setOpen(open === person.person ? null : person.person); }}>
      <span className="person-head">
        <h3>{person.person}</h3>
        <Amount value={money(BigInt(person.netMinor), person.currency)} context={`net with ${person.person}`}/>
      </span>
      <PersonBalance netMinor={person.netMinor} largestMinor={largest.toString()}/>
      <span className="meta">{BigInt(person.netMinor) > 0n ? 'owes you' : 'you owe'}{person.items.length > 1 ? ` · ${person.items.length} entries` : ''}</span>
    </button>)}
    {!nets.length && <p className="meta">Nothing outstanding with anyone.</p>}
    {open && <div className="stack">
      {nets.find(n => n.person === open)?.items.map(item => <Row key={item.id}
        trailing={<Amount value={money(BigInt(item.amountMinor) * (item.direction === 'owed_to_me' ? 1n : -1n), item.currency)} context={detail(item)}/>}>
        {detail(item)}
      </Row>)}
      <Button disabled={busy} onClick={() => void settle(open)}>Settle up with {open}</Button>
    </div>}
    <Button onClick={() => { setError(''); setDraft(blank(code)); }}>Record money between people</Button>
    {error && !draft && <p role="alert">{error}</p>}
    {entries.error && <p role="alert">Entries could not be read.</p>}
    {draft && <Sheet title="Money between people" onClose={() => { if (!busy) setDraft(null); }}>
      <div className="stack">
        <Input label="Person" value={draft.person} maxLength={80} onChange={e => setDraft({...draft, person: e.target.value})}/>
        <label className="input-label">Which way<select value={draft.direction} onChange={e => setDraft({...draft, direction: e.target.value as Direction})}>
          <option value="owed_to_me">They owe me</option><option value="owed_by_me">I owe them</option></select></label>
        <Input label="Amount" inputMode="decimal" value={draft.amount} onChange={e => setDraft({...draft, amount: e.target.value})}/>
        <label className="input-label">Currency<select value={draft.currency} onChange={e => setDraft({...draft, currency: e.target.value})}>{Object.keys(currencyDigits).map(c => <option key={c}>{c}</option>)}</select></label>
        <Input label="What it was for" value={draft.reason} maxLength={200} onChange={e => setDraft({...draft, reason: e.target.value})}/>
        <Input label="When" type="date" value={draft.occurredOn} onChange={e => setDraft({...draft, occurredOn: e.target.value})}/>
        {error && <p role="alert">{error}</p>}
        <Button variant="primary" disabled={busy} onClick={() => void save(draft)}>Save</Button>
      </div>
    </Sheet>}
  </section>;
}
