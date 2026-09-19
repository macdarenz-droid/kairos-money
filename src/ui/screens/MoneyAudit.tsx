import {useQuery} from '@tanstack/react-query';
import {format, money} from '../../core/money';
import {audit, type Purpose, type Step} from '../../intelligence/audit';
import {openDebts} from '../../intelligence/debt';
import {displayRatio} from '../../intelligence/visuals';
import {RankedBars} from '../design/RankedBars';
import {useHoldings, useAnalysis} from '../money';
import {useSession} from '../session';

const PURPOSE: Record<Purpose, string> = {buffer: 'Buffer', debt: 'Debt', savings: 'Savings', investing: 'Investing'};
const STRATEGY = {avalanche: 'Highest rate first', snowball: 'Smallest first'} as const;

/**
 * THE MONEY AUDIT, ON THE SCREEN YOU ARRIVE AT DELIBERATELY.
 *
 * Five things a person would otherwise paste their bank statements into a chatbot to ask — what am I
 * leaking, where should each dollar go, how do I clear the debt, what comes next — answered from the
 * ledger on the device, and drawn rather than written. "financial advisor app, but doesnt explain
 * instead show me in charts... i dont want any explaination. make text simple. logic, deep."
 *
 * Figures and lengths, a label of two or three words each. The one line of prose is the doc.
 *
 * It reads the analysis every other card on Insights already waits for, the debts the Ledger already
 * lists, and what is held to spend, so it costs no second pass over anything.
 */
export function MoneyAudit() {
  const session = useSession();
  const {code, spendableMinor, ready} = useHoldings();
  const report = useAnalysis();
  const debts = useQuery({queryKey: ['debts'], enabled: session.state === 'ready',
    queryFn: () => session.run(repo => repo.debts.list())});
  const snapshot = report.data?.snapshot;
  if (session.state !== 'ready' || !snapshot || !ready || !debts.isSuccess) return null;

  // Open debts in the currency on show, exactly as the debt shape reads them.
  const result = audit(snapshot, {debts: openDebts(debts.data, code), spendableMinor});
  // Not four weeks of history yet: a report about nothing is still a thing on the screen.
  if (result.status !== 'ok') return null;

  const show = (minor: string | bigint) => format(money(BigInt(minor), code));
  const {cashFlow, debt, roadmap, findings, targets} = result;
  const income = BigInt(cashFlow.incomeMinor);
  const kept = BigInt(cashFlow.essentialsMinor) + BigInt(cashFlow.minimumsMinor);
  // Dimensionless: millionths of the month's income, never money on the way to a width.
  const pct = (part: string | bigint, whole: bigint) =>
    whole > 0n ? `${Number(displayRatio((BigInt(part) < 0n ? 0n : BigInt(part)).toString(), whole.toString())) / 10000}%` : '0%';
  const progress = (step: Step) => step.id === 'high-interest'
    ? (BigInt(step.currentMinor) === 0n ? '100%' : '0%')
    : BigInt(step.targetMinor) > 0n
      ? pct(BigInt(step.currentMinor) < BigInt(step.targetMinor) ? step.currentMinor : step.targetMinor, BigInt(step.targetMinor))
      : '0%';
  const stamp = (date: string) =>
    new Date(`${date}T00:00:00Z`).toLocaleDateString('en-AU', {day: 'numeric', month: 'short', timeZone: 'UTC'});

  return <section className="stack money-audit" aria-label="Money audit">
    <div className="list-heading"><h2>Money audit</h2><span className="meta">{result.window.days} days</span></div>

    {findings.length > 0 && <RankedBars heading="A year of this" code={code} order="given"
      items={findings.map(f => ({name: f.label, minor: f.annualMinor, detail: f.detail}))}
      trailing={<span className="meta">per year</span>}/>}

    {cashFlow.status === 'ok' && <>
      <div className="list-heading"><h3>Each month</h3><span className="meta">{show(income)}</span></div>
      <div className="money-band audit-tiles">
        <div className="band-tile"><span className="band-label">Keep</span><span className="band-figure">{show(kept)}</span></div>
        <div className="band-tile"><span className="band-label">Save</span><span className="band-figure">{show(cashFlow.saveMinor)}</span>
          <span className="band-note">{PURPOSE[cashFlow.saveTo]}{cashFlow.automate.date ? ` · ${stamp(cashFlow.automate.date)}` : ''}</span></div>
        <div className="band-tile"><span className="band-label">Spend</span><span className="band-figure">{show(cashFlow.spendMinor)}</span></div>
        <div className="band-tile"><span className="band-label">Cut</span><span className="band-figure">{show(cashFlow.cutMinor)}</span></div>
      </div>
      <div className="audit-bar" role="img"
        aria-label={`Of ${show(income)} a month: ${show(cashFlow.essentialsMinor)} essentials, ${show(cashFlow.minimumsMinor)} debt, ${show(cashFlow.saveMinor)} saved, ${show(cashFlow.spendMinor)} to spend.`}>
        <span className="audit-keep" style={{width: pct(cashFlow.essentialsMinor, income)}}/>
        <span className="audit-debt" style={{width: pct(cashFlow.minimumsMinor, income)}}/>
        <span className="audit-save" style={{width: pct(cashFlow.saveMinor, income)}}/>
        <span className="audit-spend" style={{width: pct(cashFlow.spendMinor, income)}}/>
      </div>
      <p className="meta audit-legend">
        <span><i className="audit-keep"/>Essentials</span><span><i className="audit-debt"/>Debt</span>
        <span><i className="audit-save"/>Save</span><span><i className="audit-spend"/>Spend</span>
      </p>
    </>}

    {debt && <>
      <div className="list-heading"><h3>Debt</h3><span className="meta">{show(debt.owedMinor)} owed</span></div>
      <ul className="audit-steps">
        {[debt.cheaper, debt.other].map((plan, i) => <li key={plan.strategy} className="audit-step" data-status={i === 0 ? 'now' : 'later'}>
          <div className="ranked-head">
            <span className="ranked-name">{STRATEGY[plan.strategy]}{i === 0 && <span className="tag">cheaper</span>}</span>
            <span className="amount">{plan.months === null ? 'never' : `${plan.months} mo`}</span>
          </div>
          <span className="meta">{show(plan.interestMinor)} interest{i === 1 && BigInt(debt.savedMinor) > 0n ? ` · ${show(debt.savedMinor)} more` : ''}</span>
        </li>)}
      </ul>
    </>}

    {targets.length > 0 && <>
      <div className="list-heading"><h3>Pay off by</h3><span className="meta">keep this much</span></div>
      <ul className="audit-steps">
        {targets.map(t => <li key={t.id} className="audit-step" data-status={t.fits ? 'now' : 'later'}>
          <div className="ranked-head">
            <span className="ranked-name">{t.name}{t.fits && <span className="tag">fits</span>}</span>
            <span className="amount">{t.perPayMinor !== null ? `${show(t.perPayMinor)} a pay` : `${show(t.paymentMinor)} a month`}</span>
          </div>
          <span className="meta">{stamp(t.date)} · {show(t.perDayMinor)} a day{t.status === 'past' ? ' · date has passed' : t.fits ? '' : t.earliest ? ` · ${stamp(t.earliest)} fits` : ' · more than is free'}</span>
        </li>)}
      </ul>
    </>}

    <div className="list-heading"><h3>Next steps</h3>{result.income !== 'unknown' && <span className="meta">pay {result.income}</span>}</div>
    <ol className="audit-steps">
      {roadmap.map(step => <li key={step.id} className="audit-step" data-status={step.status}>
        <div className="ranked-head">
          <span className="ranked-name">{step.label}{step.status === 'now' && <span className="tag">now</span>}</span>
          <span className="amount">{step.status === 'unknown' ? '—'
            : step.id === 'high-interest' ? (BigInt(step.currentMinor) === 0n ? 'clear' : `${show(step.currentMinor)}${step.months ? ` · ${step.months} mo` : ''}`)
            : `${show(step.currentMinor)} / ${show(step.targetMinor)}`}</span>
        </div>
        <span className="ranked-track" aria-hidden="true"><span className="ranked-fill audit-fill" style={{width: progress(step)}}/></span>
      </li>)}
    </ol>
  </section>;
}
