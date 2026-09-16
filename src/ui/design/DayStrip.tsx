import {useMemo} from 'react';
import {format, money, type Currency} from '../../core/money';
import {Explain} from './primitives';
import {displayRatio} from '../../intelligence/visuals';
import type {DaySpend} from './SpendingCalendar';

/**
 * The last week of spending, with today at the end of it.
 *
 * "What have I spent today" is a number, and a number on its own says nothing: forty dollars is a quiet
 * day or an alarming one depending on the fortnight around it. The strip supplies that context in the
 * space a sentence would have taken, and today is the last column, where the eye finishes.
 *
 * It does not print the figure. It used to, as its own hero — and on the only screen it appears on, the
 * block directly above already shows that same amount as the page's headline, with what came in and what
 * is still unconfirmed beside it. Two identical heroes saying "spent today" a screen apart is the
 * duplication this app is supposed to be getting rid of, and when the two are computed from slightly
 * different filters it is worse than duplication: it is two answers to one question.
 *
 * Bars only, one hue, scaled to the heaviest day in view. No target line, no colour change at a threshold:
 * the app does not know what this person's day should cost, and a chart that implies it does is lying.
 *
 * The bars are marks, not controls. Fourteen tappable days would need 616px of touch target on a 411px
 * phone, so they would be 24px wide — below the 44px minimum, and genuinely hard to hit. The plot carries
 * one spoken description that carries every figure, which is the accessible route
 * anyway; the hero answers the question the screen asks.
 */
export function DayStrip({days, code, today, span = 7}: {days: DaySpend[]; code: Currency; today: string; span?: number}) {
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

  const show = (value: bigint) => format(money(value, code));
  // Two letters, not one: with a single initial, Tuesday and Thursday are both "T" and Saturday and Sunday
  // are both "S", so half the row cannot be read. Today keeps its own weekday here and is marked by its
  // colour and the rule under it, rather than by replacing the day with a dot nobody can see.
  const weekday = (date: string) => new Date(`${date}T00:00:00Z`)
    .toLocaleDateString('en-AU', {weekday: 'short', timeZone: 'UTC'}).slice(0, 2);

  return <figure className="strip">
    <figcaption className="heading-row"><h3>The last seven days</h3>
      <Explain title="The last seven days">
        <p>Each bar is a day and the tallest is the heaviest. Today is the last one.</p>
        <p>Only money out is drawn. A day with nothing on it is drawn as nothing.</p>
      </Explain>
    </figcaption>

    <div className="strip-plot" role="img"
      aria-label={`Spending on each of the last ${span} days, ending today. ${columns.map(c => `${weekday(c.date)} ${show(c.spent)}`).join(', ')}. The heaviest was ${show(peak)}.`}>
      {columns.map(column => <span key={column.date} className="strip-column" data-today={column.date === today || undefined}>
        <span className="strip-bar" style={{height: `${column.height}%`}}/>
        <span className="strip-tick" aria-hidden="true">{weekday(column.date)}</span>
      </span>)}
    </div>

  </figure>;
}
