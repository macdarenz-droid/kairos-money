import {useCallback, useState} from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import {currency, format, money, parseDecimal, type Currency} from '../../core/money';
import {localDay} from '../../ingest/reminders';
import type {AdviceRule, Brain} from '../../brain/types';
import {changePercent} from '../../intelligence/visuals/band';
import {useBrain} from '../money';
import {useSession} from '../session';
import {useDisplayCurrency} from '../currency';
import {Button, Explain, Input, Row, Sheet, Surface} from '../design/primitives';
import {Loader} from '../design/Motion';
import {FlowBar} from '../design/FlowBar';
import {CategorySplit} from '../design/CategorySplit';
import {DebtBurn} from '../design/DebtBurn';
import {Cancellations} from './Cancellations';
import {AdvisorPanel} from '../advisor/AdvisorPanel';

/** What each advice rule says. The figures come from the brain; the words live here. */
const ADVICE: Record<AdviceRule, string> = {
  'cancel-unused-subscription': 'Check the subscriptions you no longer use.',
  'cut-small-purchases': 'Small buys add up. Try one fewer a week.',
  'avoid-bank-fees': 'Bank fees can often be avoided. Ask your bank.',
  'reduce-cash-out': 'Cash withdrawals cost fees and are hard to track.',
  'check-lifestyle-creep': 'Everyday spending is rising month on month.',
  'pay-high-interest-first': 'Pay extra on the costliest debt first.',
  'lower-fixed-costs': 'Fixed costs take over 60% of income.',
  'build-buffer': 'Build a cushion before other goals.',
  'pay-yourself-first': 'Move savings on payday, before spending.',
  'save-pay-rise': 'Keep half of your pay rise.',
};
const LEAKS: Record<string, string> = {
  subscription: 'Subscriptions', 'small-purchases': 'Small purchases', 'bank-fees': 'Bank fees', 'cash-out': 'Cash out', 'lifestyle-creep': 'Rising spending',
};

/** Insights after the cut (ADR 0046): month, where it went, bills, advice, plan. One brain, no second read. */
export function Insights() {
  const brain = useBrain();
  const code = useDisplayCurrency();
  if (brain.error && !brain.data) return <p role="alert">Insights could not be read.</p>;
  if (!brain.data) return <><h2>Still learning</h2><Loader label="Reading your money"/></>;
  const b = brain.data;
  const show = (minor: string | bigint) => format(money(BigInt(minor), currency(code)));
  // While things are tight, essentials lead and advice and the plan step aside; the facts and Kairos AI stay.
  const tight = b.triage.active;
  return <div className="stack insights">
    {tight && <Triage brain={b} show={show}/>}
    {!tight && b.plan.status !== 'ok' && <h2>Still learning</h2>}
    <Month brain={b} code={currency(code)} show={show}/>
    <WhereItWent brain={b} code={currency(code)} show={show}/>
    <Bills brain={b} show={show} code={currency(code)}/>
    {!tight && <Advice brain={b} show={show}/>}
    <AdvisorPanel brain={b}/>
    {!tight && <><Plan brain={b} show={show}/>
    <SetAside brain={b} code={code} show={show}/></>}
  </div>;
}
type Part = {brain: Brain; show: (minor: string | bigint) => string};

function Month({brain, code, show}: Part & {code: Currency}) {
  const m = brain.spending.thisMonth, last = brain.spending.lastMonth;
  if (BigInt(m.inMinor) === 0n && BigInt(m.outMinor) === 0n) return null;
  const change = changePercent(m.outMinor, last.outMinor);
  return <section className="stack" aria-label="This month">
    <h2>This month</h2>
    <FlowBar flow={{inMinor: m.inMinor, outMinor: m.outMinor}} code={code} label={`${show(m.leftMinor)} left`} titled={false}/>
    {change !== null && <p className="meta">Spending {change.startsWith('-') ? 'down' : 'up'} {change.replace('-', '')}% on last month</p>}
  </section>;
}

function WhereItWent({brain, code, show}: Part & {code: Currency}) {
  const s = brain.spending;
  if (!s.categories.length) return null;
  return <section className="stack" aria-label="Where it went">
    <CategorySplit heading="Where it went" code={code} slices={s.categories.map(c => ({name: c.category, minor: c.minor, ids: [...c.evidence]}))}/>
    {s.merchants.length > 0 && <h3>Top merchants</h3>}
    <div>{s.merchants.map(m => <Row key={m.merchant} trailing={show(m.minor)}>{m.merchant}<p className="meta">{m.count} {m.count === 1 ? 'purchase' : 'purchases'}</p></Row>)}</div>
  </section>;
}

function Bills({brain, show, code}: Part & {code: Currency}) {
  const bills = brain.spending.bills;
  const [later, setLater] = useState<{merchant: string; dates: string[]} | null>(null), [track, setTrack] = useState<string | null>(null);
  const session = useSession(), clearTrack = useCallback(() => setTrack(null), []);
  const records = useQuery({queryKey: ['cancellations'], enabled: session.state === 'ready', queryFn: () => session.run(r => r.cancellations.list())});
  const recorded = new Set((records.data ?? []).filter(r => r.currency === code).map(r => r.merchant));
  if (!bills.length) return null;
  const payments = bills.flatMap(bill => bill.charges.map(c => ({merchant: bill.merchant, date: c.date, id: c.id})));
  return <section className="stack" aria-label="Bills and subscriptions">
    <span className="heading-row"><h2>Bills and subscriptions</h2><Explain title="Track a cancellation">
      <p>Tracking records your progress with the provider; it does not cancel anything. Keep their confirmation and check for a final charge.</p></Explain></span>
    <div>{bills.map(bill => <Row key={bill.merchant} trailing={`${show(bill.yearlyMinor)} a year`}>{bill.merchant}
      <p className="meta">{bill.cancelled ? <span className="tag">Cancelled</span> : bill.nextDate ? `Next ${bill.nextDate}` : ''}</p>
      {!bill.cancelled && !recorded.has(bill.merchant.trim().toLowerCase()) && <Button variant="quiet" className="row-action" aria-label={`Track cancellation · ${bill.merchant}`} onClick={() => setTrack(bill.merchant)}>Track cancellation</Button>}</Row>)}</div>
    <Cancellations code={code} payments={payments} track={track} onTrack={clearTrack}
      review={(merchant, ids) => setLater({merchant, dates: payments.filter(p => ids.includes(p.id)).map(p => p.date).sort()})}/>
    {later && <Sheet title={later.merchant} onClose={() => setLater(null)}>
      <p>These may be final charges. Check them with the provider.</p>
      {later.dates.map(date => <Row key={date}>{date}</Row>)}
    </Sheet>}
  </section>;
}

function Advice({brain, show}: Part) {
  const session = useSession(), client = useQueryClient();
  if (!brain.advice.length) return null;
  const dismiss = async (rule: AdviceRule) => { await session.run(repo => repo.intelligence.dismissAdvice(rule, localDay())); await client.invalidateQueries({queryKey: ['intelligence']}); };
  return <section className="stack" aria-label="Advice">
    <h2>Advice</h2>
    <Surface className="advice-list">{brain.advice.map(a => <Row key={a.rule} trailing={<Button variant="quiet" onClick={() => void dismiss(a.rule)}>Dismiss</Button>}>
      {ADVICE[a.rule]}<p className="meta">About {show(a.yearlyMinor)} a year</p></Row>)}</Surface>
  </section>;
}

function Plan({brain, show}: Part) {
  const p = brain.plan;
  if (p.status !== 'ok') return null;
  return <section className="stack" aria-label="Plan">
    <h2>Plan</h2>
    {p.split.status === 'ok' && <div>
      <Row trailing={show(p.split.keepMinor)}>Keep each month</Row>
      <Row trailing={show(p.split.spendMinor)}>Free to spend each month</Row>
    </div>}
    {p.targets.map(t => <Row key={t.id} trailing={`${show(t.paymentMinor)} a month`}>{t.name}
      <p className="meta">Pay off by {t.date} · {show(t.perDayMinor)} a day{t.fits ? '' : ' · does not fit yet'}</p></Row>)}
    {p.leaks.length > 0 && <div>{p.leaks.map(l => <Row key={l.kind} trailing={`${show(l.annualMinor)} a year`}>{LEAKS[l.kind] ?? l.kind}</Row>)}</div>}
    {p.debt && <DebtBurn balances={p.debt.cheaper.balances} startMinor={p.debt.owedMinor} growing={p.debt.cheaper.growing}
      label={p.debt.cheaper.months === null ? 'Not cleared at this payment' : `Debt clear in ${p.debt.cheaper.months} months`}/>}
  </section>;
}

function SetAside({brain, code, show}: Part & {code: string}) {
  const [open, setOpen] = useState(false);
  const g = brain.goals;
  return <section className="stack" aria-label="Money set aside">
    <h2>Money set aside</h2>
    <Row trailing={show(g.bufferMinor)}>Kept untouched</Row>
    {g.items.map(goal => <Row key={goal.id} trailing={goal.perPayMinor === null ? `${show(goal.fundedMinor)} of ${show(goal.targetMinor)}` : `${show(goal.perPayMinor)} a pay`}>
      {goal.name}<p className="meta">by {goal.targetDate}</p></Row>)}
    <Button aria-label="Edit money set aside" onClick={() => setOpen(true)}>Edit</Button>
    {open && <GoalSheet code={code} bufferMinor={g.bufferMinor} onClose={() => setOpen(false)}/>}
  </section>;
}

function GoalSheet({code, bufferMinor, onClose}: {code: string; bufferMinor: string; onClose: () => void}) {
  const session = useSession(), client = useQueryClient();
  const [name, setName] = useState(''), [target, setTarget] = useState(''), [funded, setFunded] = useState('0'), [date, setDate] = useState('');
  const [kind, setKind] = useState<'goal' | 'sinking' | 'budget'>('goal'), [buffer, setBuffer] = useState(''), [error, setError] = useState('');
  const saved = () => client.invalidateQueries({queryKey: ['intelligence']});
  const c = currency(code);
  return <Sheet title="Money set aside" onClose={onClose}>
    <p>Labels on money you already have. Naming it does not move it.</p>
    <p>Kept untouched now: {format(money(BigInt(bufferMinor), c))}.</p>
    <Input label="Keep this much untouched" value={buffer} inputMode="decimal" onChange={e => setBuffer(e.target.value)} hint="Left out of what you can spend."/>
    <Button onClick={() => void session.run(r => r.intelligence.setBuffer(code, parseDecimal(buffer, c).minor.toString())).then(saved).catch(e => setError(String(e)))}>Save the amount to keep untouched</Button>
    <Input label="What are you saving for?" value={name} onChange={e => setName(e.target.value)}/>
    <Input label="Target amount" value={target} inputMode="decimal" onChange={e => setTarget(e.target.value)}/>
    <Input label="Already put aside for it" value={funded} inputMode="decimal" onChange={e => setFunded(e.target.value)}/>
    <Input label="Target date" type="date" value={date} onChange={e => setDate(e.target.value)}/>
    <label className="input-label">Plan type<select value={kind} onChange={e => setKind(e.target.value as typeof kind)}><option value="goal">Goal</option><option value="sinking">Sinking fund</option><option value="budget">Budget</option></select></label>
    <Button onClick={() => void session.run(r => r.intelligence.saveGoal({id: crypto.randomUUID(), name, target: parseDecimal(target, c).minor.toString(),
      funded: parseDecimal(funded, c).minor.toString(), date, kind, currency: code})).then(saved).then(onClose).catch(e => setError(String(e)))}>Save goal</Button>
    {error && <p role="alert">{error}</p>}
  </Sheet>;
}

/** While things are tight: the next essential bill and the money available for it. */
export function Triage({brain, show}: Part) {
  const t = brain.triage;
  if (!t.active) return null;
  return <Surface className="surface-muted">
    <h2>Focus on essentials</h2>
    <p>Keep this small. The next essential bill, and the money available for it.</p>
    {t.nextEssential && <Row trailing={show(t.nextEssential.minor)}>{t.nextEssential.merchant}<p className="meta">{t.nextEssential.date}</p></Row>}
    <Row trailing={show(t.availableMinor)}>Available now</Row>
  </Surface>;
}
