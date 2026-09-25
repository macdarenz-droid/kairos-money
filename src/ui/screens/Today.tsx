import {Button} from '../design/primitives';
import {MomentRing} from '../design/Motion';
import {currency, format, money} from '../../core/money';
import {useBrain} from '../money';
import {useDisplayCurrency} from '../currency';
import {DayStrip} from '../design/DayStrip';
import {Triage} from './Insights';

/** The week as a strip of days, from the brain's seven-day spending. */
export function WeekStrip() {
  const brain = useBrain(), code = currency(useDisplayCurrency());
  const days = brain.data?.spending.days;
  if (!days || days.every(d => d.outMinor === '0')) return null;
  // The brain's outMinor is positive; the strip reads money out as negative, as the ledger signs it.
  return <DayStrip days={days.map(d => ({date: d.date, minor: (-BigInt(d.outMinor)).toString()}))} code={code} today={brain.data!.asOf}/>;
}

/** The essentials card, on Today too, while triage is active. */
export function TodayTriage() {
  const brain = useBrain(), code = currency(useDisplayCurrency());
  if (!brain.data?.triage.active) return null;
  return <Triage brain={brain.data} show={minor => format(money(BigInt(minor), code))}/>;
}

/** A hidden mark device tests wait on: the one brain read for this screen has settled. */
export function BrainMarker() {
  const brain = useBrain();
  if (brain.data) return <span hidden data-brain="ready"/>;
  return brain.error ? <span hidden data-brain="failed"/> : null;
}

/** Today before anything is recorded: one card, one next step. */
export function TodayStart({onStart}: {onStart: () => void}) {
  return <section className="card today-start" aria-label="Get started">
    <span className="still"><MomentRing/></span>
    <h2>Nothing recorded yet</h2>
    <p>Import a statement and Kairos fills this screen.</p>
    <Button variant="primary" onClick={onStart}>Add your first statement</Button>
  </section>;
}
