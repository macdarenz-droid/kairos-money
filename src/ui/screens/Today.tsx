import {currency, format, money} from '../../core/money';
import {useBrain} from '../money';
import {useDisplayCurrency} from '../currency';
import {DayStrip} from '../design/DayStrip';
import {Triage} from './Insights';

/** The week as a strip of days, from the brain's seven-day spending. */
export function WeekStrip() {
  const brain = useBrain(), code = currency(useDisplayCurrency());
  const days = brain.data?.spending.days;
  if (!days || days.every(d => d.minor === '0')) return null;
  return <DayStrip days={[...days]} code={code} today={brain.data!.asOf}/>;
}

/** Essentials and free help, on Today too, while triage is active. */
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
