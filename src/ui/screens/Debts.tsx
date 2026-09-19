import {useState} from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {ChevronRight} from 'lucide-react';
import {currency, currencyDigits, format, money, parseDecimal} from '../../core/money';
import {compare, openDebts, payoff, plan, ratePercent} from '../../intelligence/debt';
import type {DebtRecord} from '../../ledger/debts';
import {localDay} from '../../ingest/reminders';
import {Amount, Button, Input, Row, Sheet} from '../design/primitives';
import {DebtBurn} from '../design/DebtBurn';
import {useSession} from '../session';
import {useConverter, useDisplayCurrency} from '../currency';

const blank = (code: string) => ({id: '', name: '', accountId: '', currency: code, balance: '', rate: '', minimum: '', dueDay: '', openedAt: localDay(), targetDate: ''});
type Draft = ReturnType<typeof blank>;

function toDraft(debt: DebtRecord): Draft {
  return {id: debt.id, name: debt.name, accountId: debt.accountId ?? '', currency: debt.currency,
    balance: format(money(BigInt(debt.balanceMinor), debt.currency)).replace(/[^\d.,-]/g, ''),
    rate: debt.annualRateBp,
    minimum: format(money(BigInt(debt.minimumMinor), debt.currency)).replace(/[^\d.,-]/g, ''),
    dueDay: debt.dueDay === null ? '' : String(debt.dueDay), openedAt: debt.openedAt, targetDate: debt.targetDate ?? ''};
}

function useDebts() {
  const session = useSession();
  return useQuery({queryKey: ['debts'], enabled: session.state === 'ready',
    queryFn: () => session.run(repo => repo.debts.list())});
}


/**
 * Debts in the Ledger, listed the way accounts are.
 *
 * A debt belongs beside the accounts because it is the same kind of thing: something you hold, with an
 * amount. What it will COST and when it ends are questions, and questions live in Insights.
 */
export function Debts({accounts}: {accounts: {id: string; name: string; currency: string}[]}) {
  const session = useSession(), client = useQueryClient();
  const shown = useConverter();
  const debts = useDebts();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (session.state !== 'ready') return null;
  const rows = debts.data ?? [];
  const open = rows.filter(d => d.closedAt === null), cleared = rows.filter(d => d.closedAt !== null);
  const refresh = () => client.invalidateQueries({queryKey: ['debts']});

  async function save(entry: Draft) {
    setBusy(true); setError('');
    try {
      const code = currency(entry.currency);
      const balance = parseDecimal(entry.balance, code), minimum = parseDecimal(entry.minimum, code);
      if (!/^\d+$/.test(entry.rate)) throw new Error('Enter the annual rate in basis points: 1999 is 19.99%.');
      await session.run(repo => repo.debts.save({
        id: entry.id || crypto.randomUUID(), name: entry.name, accountId: entry.accountId || null,
        currency: code, balanceMinor: balance.minor.toString(), annualRateBp: entry.rate,
        minimumMinor: minimum.minor.toString(), dueDay: entry.dueDay ? Number(entry.dueDay) : null,
        openedAt: entry.openedAt, targetDate: entry.targetDate || null}));
      await refresh(); setDraft(null);
    } catch (e) { setError(e instanceof Error ? e.message : 'The debt could not be saved.'); }
    finally { setBusy(false); }
  }

  return <section className="stack">
    <div className="list-heading"><h2>Debts</h2><span className="meta">Owed now</span></div>
    {open.map(debt => <Row key={debt.id}
      trailing={<Amount value={shown.into(debt.balanceMinor, debt.currency) ?? money(BigInt(debt.balanceMinor), debt.currency)} context={`${debt.name} owed`}/>}>
      <button type="button" className="account-open" onClick={() => { setError(''); setDraft(toDraft(debt)); }}>
        <span className="account-summary"><span><h3>{debt.name}</h3><p className="account-meta">{ratePercent(debt.annualRateBp)}{debt.dueDay === null ? '' : ` · due the ${debt.dueDay}`}{debt.targetDate === null ? '' : ` · by ${debt.targetDate}`}</p></span></span>
        <ChevronRight size={16}/>
      </button>
    </Row>)}
    {!open.length && <p className="meta">No debts recorded.</p>}
    <Button onClick={() => { setError(''); setDraft(blank(accounts[0]?.currency ?? 'AUD')); }}>Add a debt</Button>
    {cleared.length > 0 && <details><summary>Cleared</summary>{cleared.map(debt => <Row key={debt.id}>
      <span className="debt-cleared">{debt.name} · cleared {debt.closedAt}</span>
    </Row>)}</details>}
    {debts.error && <p role="alert">Debts could not be read.</p>}
    {draft && <Sheet title={draft.id ? draft.name : 'Add a debt'} onClose={() => { if (!busy) setDraft(null); }}>
      <div className="stack">
        <Input label="Name" value={draft.name} maxLength={80} onChange={e => setDraft({...draft, name: e.target.value})}/>
        <label className="input-label">Currency<select value={draft.currency} onChange={e => setDraft({...draft, currency: e.target.value})}>{Object.keys(currencyDigits).map(c => <option key={c}>{c}</option>)}</select></label>
        <Input label="Owed now" inputMode="decimal" value={draft.balance} onChange={e => setDraft({...draft, balance: e.target.value})}/>
        <Input label="Annual rate in basis points" hint="1999 is 19.99%." inputMode="numeric" value={draft.rate} onChange={e => setDraft({...draft, rate: e.target.value})}/>
        <Input label="Minimum payment" inputMode="decimal" value={draft.minimum} onChange={e => setDraft({...draft, minimum: e.target.value})}/>
        <Input label="Due day of the month" hint="Leave blank when there is no set date." inputMode="numeric" value={draft.dueDay} onChange={e => setDraft({...draft, dueDay: e.target.value})}/>
        <Input label="Started" type="date" value={draft.openedAt} onChange={e => setDraft({...draft, openedAt: e.target.value})}/>
        {/* The one thing the planner cannot work out: when the person wants this gone. Insights then
            says what keeping to it takes each pay and each day, and whether that fits the month. */}
        <Input label="Pay off by" type="date" hint="Leave blank for no target." value={draft.targetDate} onChange={e => setDraft({...draft, targetDate: e.target.value})}/>
        <label className="input-label">Held on<select value={draft.accountId} onChange={e => setDraft({...draft, accountId: e.target.value})}><option value="">No linked account</option>{accounts.filter(a => a.currency === draft.currency).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        {error && <p role="alert">{error}</p>}
        <Button variant="primary" disabled={busy} onClick={() => void save(draft)}>Save debt</Button>
        {draft.id && <Button disabled={busy} onClick={() => { setBusy(true); void session.run(repo => repo.debts.close(draft.id, localDay())).then(refresh).then(() => setDraft(null)).catch(() => setError('The debt could not be cleared.')).finally(() => setBusy(false)); }}>Mark it cleared</Button>}
      </div>
    </Sheet>}
  </section>;
}

/**
 * WHEN THE DEBTS END, as one falling line.
 *
 * Insights is where a chart you always want to see lives, because you arrive here on purpose. The budget
 * is the only control: everything else on this screen is a consequence of it, and moving it is the one
 * thing that actually changes the answer.
 */
export function DebtShape() {
  const code = useDisplayCurrency();
  const debts = useDebts();
  const [extra, setExtra] = useState('');
  const rows = openDebts(debts.data ?? [], code);
  if (!rows.length) return null;
  const minimums = rows.reduce((total, d) => total + BigInt(d.minimumMinor), 0n);
  let added = 0n;
  try { if (extra.trim()) added = parseDecimal(extra, currency(code)).minor; } catch { added = 0n; }
  const budget = (minimums + (added > 0n ? added : 0n)).toString();
  const owed = rows.reduce((total, d) => total + BigInt(d.balanceMinor), 0n);
  const amount = (minor: string) => format(money(BigInt(minor), currency(code)));

  const single = rows.length === 1;
  const projection = single ? payoff(rows[0]!, budget) : plan(rows, budget, 'avalanche');
  const ordering = single ? null : compare(rows, budget);
  const label = projection.growing
    ? `${amount(budget)} a month does not cover the interest, so this has no end date.`
    : projection.months === null
      ? `${amount(owed.toString())} owed · longer than fifty years at ${amount(budget)} a month`
      : `${amount(owed.toString())} owed · clear in ${projection.months} month${projection.months === 1 ? '' : 's'} · ${amount(projection.interestMinor)} interest`;

  return <section className="stack">
    <div className="list-heading"><h2>Debt</h2><span className="meta">{amount(budget)} a month</span></div>
    <DebtBurn balances={projection.balances} startMinor={owed.toString()} growing={projection.growing} label={label}/>
    <Input label="Pay above the minimums" inputMode="decimal" value={extra} onChange={e => setExtra(e.target.value)}/>
    {/* Only when the choice is worth something. Two orderings that cost the same are not a decision. */}
    {ordering && BigInt(ordering.savedMinor) > 0n &&
      <p className="meta">Clearing the highest rate first saves {amount(ordering.savedMinor)}{ordering.savedMonths ? ` and ${ordering.savedMonths} month${ordering.savedMonths === 1 ? '' : 's'}` : ''}.</p>}
  </section>;
}
