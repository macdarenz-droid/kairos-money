import {useMemo} from 'react';
import {format, money, type Currency} from '../../core/money';
import {displayRatio} from '../../intelligence/visuals';
import type {DaySpend} from './SpendingCalendar';

/**
 * The last fortnight of spending, with today at the end of it.
 *
 * "What have I spent today" is a number, and a number on its own says nothing: forty dollars is a quiet
 * day or an alarming one depending on the fortnight around it. The strip supplies that context in the
 * space a sentence would have taken, and answers the screen's question in the first column a person's eye
 * lands on.
 *
 * Bars only, one hue, scaled to the heaviest day in view. No target line, no colour change at a threshold:
 * the app does not know what this person's day should cost, and a chart that implies it does is lying.
 *
 * The bars are marks, not controls. Fourteen tappable days would need 616px of touch target on a 411px
 * phone, so they would be 24px wide — below the 44px minimum, and genuinely hard to hit. The plot carries
 * one spoken description and the table underneath carries every figure, which is the accessible route
 * anyway; the hero answers the question the screen asks.
 */
export function DayStrip({days, code, today, span = 14}: {days: DaySpend[]; code: Currency; today: string; span?: number}) {
  const {columns, peak} = useMemo(() => {
    const spent = new Map<string, bigint>();
    for (const entry of days) {
      const value = BigInt(entry.minor);
      if (value >= 0n) continue;                        // Money in is not spending.
      spent.set(entry.date, (spent.get(entry.date) ?? 0n) - value);
    }
    const end = Date.parse(`${today}T00:00:00Z`);
    const window = Array.from({length: span}, (_, i) => new Date(end - (span - 1 - i) * 86400000).toISOString().slice(0, 10));
    let peak = 0n;
    for (const date of window) { const value = spent.get(date) ?? 0n; if (value > peak) peak = value; }
    // Dimensionless geometry: displayRatio returns millionths of the peak, never a currency conversion.
    return {peak, columns: window.map(date => {
      const value = spent.get(date) ?? 0n;
      return {date, spent: value, height: peak > 0n ? Number(displayRatio(value.toString(), peak.toString())) / 10000 : 0};
    })};
  }, [days, today, span]);

  const latest = columns[columns.length - 1]!;
  const show = (value: bigint) => format(money(value, code));
  const weekday = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-AU', {weekday: 'short', timeZone: 'UTC'});

  return <figure className="strip">
    <figcaption>
      <p className="hero-amount">{show(latest.spent)}</p>
      <p>spent today</p>
    </figcaption>

    <div className="strip-plot" role="img"
      aria-label={`Spending on each of the last ${span} days, ending today. The heaviest was ${show(peak)}. Every day is listed in the table below.`}>
      {columns.map(column => <span key={column.date} className="strip-column" data-today={column.date === today || undefined}>
        <span className="strip-bar" style={{height: `${column.height}%`}}/>
        <span className="strip-tick" aria-hidden="true">{column.date === today ? '·' : weekday(column.date).slice(0, 1)}</span>
      </span>)}
    </div>

    <p className="meta">Each bar is a day, tallest is the heaviest. Today is the last one.</p>

    <details>
      <summary>Read these days as a list</summary>
      <div className="table-scroll"><table className="calendar-table"><caption className="meta">Recorded spending for each of the last {span} days.</caption>
        <thead><tr><th scope="col">Day</th><th scope="col">Spent</th></tr></thead>
        <tbody>{columns.map(c => <tr key={c.date}><th scope="row">{c.date === today ? `${c.date} (today)` : c.date}</th><td>{show(c.spent)}</td></tr>)}</tbody>
      </table></div>
    </details>
  </figure>;
}
