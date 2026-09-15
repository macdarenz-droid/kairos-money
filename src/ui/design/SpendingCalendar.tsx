import {useMemo, useState} from 'react';
import {format, money, type Currency} from '../../core/money';
import {Button} from './primitives';

export type DaySpend = {date: string; minor: string};

/**
 * A month of spending, as a shape rather than a list.
 *
 * The app could describe spending in sentences and totals, and a person still could not see it. This is
 * the same data as the rows underneath, drawn so the rhythm is visible at a glance — the heavy days, the
 * quiet stretches, the cluster after payday.
 *
 * Deliberately built from date and amount alone. Categories would make a richer picture, but almost every
 * imported transaction is uncategorised, so a category chart would draw one enormous "Uncategorised" block
 * and teach the reader nothing. A visual that needs data the user does not have is a visual that lies
 * about being useful.
 *
 * One month per screen, because a continuous strip of 181 days is a wall again, in colour instead of text.
 */
export function SpendingCalendar({days, code, onDay}: {days: DaySpend[]; code: Currency; onDay?: (date: string) => void}) {
  const totals = useMemo(() => {
    const map = new Map<string, bigint>();
    for (const day of days) {
      const spent = BigInt(day.minor);
      if (spent >= 0n) continue;                       // Money in is not spending; it does not colour a day.
      map.set(day.date, (map.get(day.date) ?? 0n) - spent);
    }
    return map;
  }, [days]);

  const months = useMemo(() => [...new Set([...totals.keys()].map(d => d.slice(0, 7)))].sort(), [totals]);
  const [index, setIndex] = useState(() => Math.max(0, months.length - 1));
  const month = months[Math.min(index, months.length - 1)];

  if (!month) return <p className="meta">No spending to draw yet. Record a purchase or import a statement.</p>;

  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const length = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const lead = first.getUTCDay();                       // Sunday-first, matching the weekday row below.

  const cells = Array.from({length}, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, '0')}`;
    return {date, day: i + 1, minor: totals.get(date) ?? 0n};
  });
  const peak = cells.reduce((high, c) => (c.minor > high ? c.minor : high), 0n);
  const monthTotal = cells.reduce((sum, c) => sum + c.minor, 0n);

  // Five steps of one hue. The step is the share of the month's heaviest day, so the picture is always
  // scaled to the month being read rather than to an absolute figure that means nothing on its own.
  const step = (minor: bigint) => {
    if (minor <= 0n || peak <= 0n) return 0;
    const share = (minor * 100n) / peak;
    return share <= 20n ? 1 : share <= 40n ? 2 : share <= 60n ? 3 : share <= 80n ? 4 : 5;
  };
  const label = (minor: bigint) => format(money(minor, code));

  return <section className="stack">
    <div className="calendar-head">
      <div className="calendar-nav">
        <Button variant="quiet" disabled={index <= 0} onClick={() => setIndex(i => i - 1)} aria-label="Previous month">‹</Button>
        <h3>{first.toLocaleDateString('en-AU', {month: 'long', year: 'numeric', timeZone: 'UTC'})}</h3>
        <Button variant="quiet" disabled={index >= months.length - 1} onClick={() => setIndex(i => i + 1)} aria-label="Next month">›</Button>
      </div>
      <p className="hero-amount">{label(monthTotal)}</p>
      <p className="meta">spent this month</p>
    </div>

    <div className="calendar-grid" role="grid" aria-label={`Daily spending for ${month}. Darker means more spent.`}>
      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i} className="calendar-weekday" aria-hidden="true">{d}</span>)}
      {Array.from({length: lead}, (_, i) => <span key={`lead${i}`} className="calendar-pad" aria-hidden="true"/>)}
      {cells.map(cell => {
        const level = step(cell.minor);
        const text = cell.minor > 0n ? `${cell.date}, ${label(cell.minor)} spent` : `${cell.date}, nothing spent`;
        return <button key={cell.date} type="button" className={`calendar-day level-${level}`}
          aria-label={text} title={text} onClick={onDay ? () => onDay(cell.date) : undefined}>
          <span aria-hidden="true">{cell.day}</span>
        </button>;
      })}
    </div>

    <div className="calendar-legend" aria-hidden="true">
      <span className="meta">Less</span>
      {[1, 2, 3, 4, 5].map(n => <span key={n} className={`calendar-key level-${n}`}/>)}
      <span className="meta">More</span>
    </div>
    <p className="meta">Each square is a day. Darker means more spent. The heaviest day this month is {label(peak)}.</p>

    <details>
      <summary>Read this month as a list</summary>
      <table className="calendar-table"><caption className="meta">Every day with spending in {month}.</caption>
        <thead><tr><th scope="col">Day</th><th scope="col">Spent</th></tr></thead>
        <tbody>{cells.filter(c => c.minor > 0n).map(c => <tr key={c.date}><th scope="row">{c.date}</th><td>{label(c.minor)}</td></tr>)}</tbody>
      </table>
      {!cells.some(c => c.minor > 0n) && <p className="meta">No spending recorded in this month.</p>}
    </details>
  </section>;
}
