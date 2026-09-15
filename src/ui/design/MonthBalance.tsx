import {useMemo, useState} from 'react';
import {format, money, type Currency} from '../../core/money';
import {displayRatio} from '../../intelligence/visuals';

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
 * one cannot be drawn the same size.
 */
export function MonthBalance({months, code}: {months: MonthFlow[]; code: Currency}) {
  const [picked, setPicked] = useState<string | null>(null);

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

  const selected = columns.find(c => c.month === picked) ?? columns[columns.length - 1]!;
  const show = (value: bigint) => format(money(value, code));
  const name = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-AU', {month: 'long', year: 'numeric', timeZone: 'UTC'});

  return <figure className="balance">
    <figcaption>
      <h3>What each month left you</h3>
      <p>Everything that came in, less everything that went out.</p>
    </figcaption>

    <div className="balance-legend">
      <span><span className="flow-key flow-key-in" aria-hidden="true"/>Money stayed</span>
      <span><span className="flow-key flow-key-out" aria-hidden="true"/>More went out</span>
    </div>

    <div className="balance-plot" role="group"
      aria-label={`What stayed in each of ${columns.length} months, from ${name(columns[0]!.month)} to ${name(columns[columns.length - 1]!.month)}. The figures are in the table below.`}>
      <span className="balance-zero" style={{top: `${zero}%`}} aria-hidden="true"/>
      {columns.map(column => {
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

    <div className="balance-readout" role="status">
      <strong>{name(selected.month)}</strong>
      <span><span className="flow-key flow-key-in" aria-hidden="true"/>{show(selected.received)} came in</span>
      <span><span className="flow-key flow-key-out" aria-hidden="true"/>{show(selected.spent)} went out</span>
      <span>{selected.kept >= 0n ? `${show(selected.kept)} stayed` : `${show(-selected.kept)} more went out than came in`}</span>
    </div>

    <details>
      <summary>Read these months as a table</summary>
      <table className="calendar-table"><caption className="meta">Recorded money in and out, by month.</caption>
        <thead><tr><th scope="col">Month</th><th scope="col">Came in</th><th scope="col">Went out</th><th scope="col">Left</th></tr></thead>
        <tbody>{columns.map(c => <tr key={c.month}><th scope="row">{c.month}</th><td>{show(c.received)}</td><td>{show(c.spent)}</td><td>{show(c.kept)}</td></tr>)}</tbody>
      </table>
    </details>
  </figure>;
}
