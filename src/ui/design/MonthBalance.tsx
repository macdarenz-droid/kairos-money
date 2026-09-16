import {useMemo, useState} from 'react';
import {format, money, type Currency} from '../../core/money';
import {displayRatio} from '../../intelligence/visuals';
import {Button, Explain} from './primitives';

/**
 * Six months to a page. A tappable column needs 44px, and a 411px phone minus the screen's own padding
 * leaves 371px: six columns fit with room to spare, nine do not — at nine they are 39px and too small to
 * hit. Paging is also how a person actually reads this; a year of columns at once is a wall again.
 */
const PAGE = 6;

export type MonthFlow = {month: string; inMinor: string; outMinor: string};

/**
 * What each month left behind, as columns growing out of a single zero line.
 *
 * The obvious chart here is two lines — money in, money out — and it does not work. Income and spending
 * are usually within a quarter of each other, so on an honest axis that starts at zero both lines sit
 * squashed together near the top and the only thing worth seeing, the distance between them, is a sliver.
 * Truncating the axis to open that gap up is the oldest lie in charting.
 *
 * So the subtraction is the mark. Above the line, in copper, is what stayed. Below it, in blue, is how
 * much more went out than came in. One glance answers the question the two lines were being read for, and
 * both original figures are still there in the readout and the table, supporting the picture rather than
 * replacing it.
 *
 * Above and below share one scale — the same denominator for both signs — so a short month and a heavy
 * one cannot be drawn the same size. That scale is taken from every month on record, not from the page on
 * screen, so turning the page never silently rescales the picture.
 */
export function MonthBalance({months, code}: {months: MonthFlow[]; code: Currency}) {
  const [picked, setPicked] = useState<string | null>(null);

  const [page, setPage] = useState<number | null>(null);

  const {columns, zero} = useMemo(() => {
    const ordered = [...months].sort((a, b) => a.month.localeCompare(b.month));
    const rows = ordered.map(m => {
      const received = BigInt(m.inMinor) > 0n ? BigInt(m.inMinor) : 0n;
      const spent = BigInt(m.outMinor) > 0n ? BigInt(m.outMinor) : 0n;
      return {month: m.month, received, spent, kept: received - spent};
    });
    let highest = 0n, deepest = 0n;
    for (const row of rows) {
      if (row.kept > highest) highest = row.kept;
      if (-row.kept > deepest) deepest = -row.kept;
    }
    const span = highest + deepest;
    // One denominator for both directions: displayRatio gives dimensionless millionths, never currency.
    const share = (value: bigint) => span > 0n ? Number(displayRatio(value.toString(), span.toString())) / 10000 : 0;
    return {columns: rows.map(row => ({...row, height: Math.abs(share(row.kept))})), zero: span > 0n ? share(highest) : 100};
  }, [months]);

  if (!columns.length) return <p className="meta">No months with activity yet.</p>;

  const pages = Math.max(1, Math.ceil(columns.length / PAGE));
  const index = Math.min(page ?? pages - 1, pages - 1);
  const shown = columns.slice(Math.max(0, columns.length - (pages - index) * PAGE), columns.length - (pages - index - 1) * PAGE);
  const selected = shown.find(c => c.month === picked) ?? shown[shown.length - 1]!;
  const show = (value: bigint) => format(money(value, code));
  const name = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-AU', {month: 'long', year: 'numeric', timeZone: 'UTC'});

  return <figure className="balance">
    <figcaption className="heading-row">
      <h3>Monthly balance</h3>
      <Explain title="Monthly balance">
        <p>Everything that came in, less everything that went out.</p>
        <p>Above the line is what stayed. Below it is how much more went out than came in. Both directions
          share one scale, taken from every month on record, so turning the page never rescales the picture.</p>
      </Explain>
    </figcaption>

    <div className="balance-legend">
      <span><span className="flow-key flow-key-in" aria-hidden="true"/>Stayed</span>
      <span><span className="flow-key flow-key-out" aria-hidden="true"/>Overspent</span>
    </div>

    <div className="balance-plot" role="group"
      aria-label={`What stayed in each month from ${name(shown[0]!.month)} to ${name(shown[shown.length - 1]!.month)}.`}>
      <span className="balance-zero" style={{top: `${zero}%`}} aria-hidden="true"/>
      {shown.map(column => {
        const kept = column.kept >= 0n;
        return <button key={column.month} type="button" className="balance-column" aria-pressed={column.month === selected.month}
          aria-label={`${name(column.month)}: ${show(column.received)} in, ${show(column.spent)} out, ${kept ? `${show(column.kept)} stayed` : `${show(-column.kept)} more went out`}`}
          onClick={() => setPicked(column.month)}>
          <span className={`balance-bar ${kept ? 'balance-bar-kept' : 'balance-bar-short'}`}
            style={kept ? {bottom: `${100 - zero}%`, height: `${column.height}%`} : {top: `${zero}%`, height: `${column.height}%`}}/>
          <span className="balance-tick" aria-hidden="true">{column.month.slice(5)}</span>
        </button>;
      })}
    </div>

    {pages > 1 && <div className="balance-pager">
      <Button variant="quiet" disabled={index <= 0} onClick={() => { setPage(index - 1); setPicked(null); }} aria-label="Earlier months">‹</Button>
      <span className="meta">{name(shown[0]!.month)} – {name(shown[shown.length - 1]!.month)}</span>
      <Button variant="quiet" disabled={index >= pages - 1} onClick={() => { setPage(index + 1); setPicked(null); }} aria-label="Later months">›</Button>
    </div>}

    <div className="balance-readout" role="status">
      <strong>{name(selected.month)}</strong>
      <span><span className="flow-key flow-key-in" aria-hidden="true"/>In {show(selected.received)}</span>
      <span><span className="flow-key flow-key-out" aria-hidden="true"/>Out {show(selected.spent)}</span>
      <span>{selected.kept >= 0n ? `Left ${show(selected.kept)}` : `Over ${show(-selected.kept)}`}</span>
    </div>

  </figure>;
}
