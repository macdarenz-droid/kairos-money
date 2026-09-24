import {useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {currency, format, money, parseDecimal, type Currency} from '../../core/money';
import {localDay} from '../../ingest/reminders';
import type {AdviceRule, Brain} from '../../brain/types';
import {changePercent} from '../../intelligence/visuals/band';
import {useBrain} from '../money';
import {useSession} from '../session';
import {useDisplayCurrency} from '../currency';
import {Button, Input, Row, Sheet, Skeleton, Surface} from '../design/primitives';
import {FlowBar} from '../design/FlowBar';
import {CategorySplit} from '../design/CategorySplit';
import {DebtBurn} from '../design/DebtBurn';
import {Cancellations} from './Cancellations';

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
  if (!brain.data) return <><h2>Still learning</h2><Skeleton label="Reading your money"/></>;
  const b = brain.data;
  const show = (minor: string | bigint) => format(money(BigInt(minor), currency(code)));
  if (b.triage.active) return <Triage brain={b} show={show}/>;
  return <div className="stack insights">
    {b.plan.status !== 'ok' && <h2>Still learning</h2>}
    <Month brain={b} code={currency(code)} show={show}/>
    <WhereItWent brain={b} code={currency(code)} show={show}/>
    <Bills brain={b} show={show} code={currency(code)}/>
    <Advice brain={b} show={show}/>
    <div className="advisor-slot" data-slot="advisor"/>
    <Plan brain={b} show={show}/>
    <SetAside brain={b} code={code} show={show}/>
  </div>;
}
type Part = {brain: Brain; show: (minor: string | bigint) => string};

function Month({brain, code, show}: Part & {code: Currency}) {
  const m = brain.spending.thisMonth, last = brain.spending.lastMonth;
  if (BigInt(m.inMinor) === 0n && BigInt(m.outMinor) === 0n) return null;
  const change = changePercent(m.outMinor, last.outMinor);
  return <section className="stack" aria-label="This month">
    <h2>This month</h2>
    <FlowBar flow={{inMinor: m.inMinor, outMinor: m.outMinor}} code={code} label={`${show(m.leftMinor)} left`}/>
    {change !== null && <p className="meta">Spending {change.startsWith('-') ? 'down' : 'up'} {change.replace('-', '')}% on last month</p>}
  </section>;
}

function WhereItWent({brain, code, show}: Part & {code: Currency}) {
  const s = brain.spending;
  if (!s.categories.length) return null;
  return <section className="stack" aria-label="Where it went">
    <CategorySplit heading="Where it went" code={code} slices={s.categories.map(c => ({name: c.name, minor: c.minor, ids: [...c.evidence]}))}/>
    <div>{s.merchants.map(m => <Row key={m.merchant} trailing={show(m.minor)}>{m.merchant}<p className="meta">{m.count} {m.count === 1 ? 'purchase' : 'purchases'}</p></Row>)}</div>
  </section>;
}

function Bills({brain, show, code}: Part & {code: Currency}) {
  const bills = brain.spending.bills;
  if (!bills.length) return null;
  return <section className="stack" aria-label="Bills and subscriptions">
    <h2>Bills and subscriptions</h2>
    <div>{bills.map(bill => <Row key={bill.merchant} trailing={`${show(bill.yearlyMinor)} a year`}>{bill.merchant}
      <p className="meta">{bill.cancelled ? <span className="tag">Cancelled</span> : bill.nextDate ? `Next ${bill.nextDate}` : ''}</p></Row>)}</div>
    <Cancellations code={code} merchants={bills.map(bill => bill.merchant)}/>
  </section>;
}

function Advice({brain, show}: Part) {
  const session = useSession(), client = useQueryClient();
  if (!brain.advice.length) return null;
  const dismiss = async (rule: AdviceRule) => { await session.run(repo => repo.intelligence.dismissAdvice(rule, localDay())); await client.invalidateQueries({queryKey: ['intelligence']}); };
  return <section className="stack" aria-label="Advice">
    <h2>Advice</h2>
    {brain.advice.map(a => <Surface key={a.rule} className="advice-card">
      <p>{ADVICE[a.rule]}</p>
      <p className="meta">About {show(a.yearlyMinor)} a year</p>
      <Button variant="quiet" onClick={() => void dismiss(a.rule)}>Dismiss</Button>
    </Surface>)}
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
    <Button onClick={() => setOpen(true)}>Money set aside</Button>
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

/** While things are tight: essentials and free help only; plan and advice are hidden. */
export function Triage({brain, show}: Part) {
  const t = brain.triage;
  if (!t.active) return null;
  return <Surface className="surface-muted">
    <h2>Focus on essentials</h2>
    <p>Keep this small. The next essential bill, and the money available for it.</p>
    {t.nextEssential && <Row trailing={show(t.nextEssential.minor)}>{t.nextEssential.merchant}<p className="meta">{t.nextEssential.date}</p></Row>}
    <Row trailing={show(t.availableMinor)}>Available now</Row>
    <p>Free, confidential financial counselling: National Debt Helpline, <a href="tel:1800007007">1800 007 007</a>.</p>
  </Surface>;
}
