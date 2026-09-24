import {format, money, type Currency} from '../../core/money';
import {displayRatio} from '../../intelligence/visuals';

export type RankedItem = {
  /** What the bar is about — a merchant, or a date and a merchant. */
  name: string;
  minor: string;
  /** One quiet line under the name, such as how many purchases it is. */
  detail?: string;
  /** Opens the transactions behind this bar, where there are any. */
  onOpen?: () => void;
};

/**
 * A LIST OF AMOUNTS, DRAWN AS LENGTHS. "keep, but make it visualisation".
 *
 * Upcoming bills and merchant history were rows of figures — true, readable one at a time, and useless
 * for the only question either of them is asked: which of these is the big one. Lengths answer that
 * without being read.
 *
 * ONE HUE, STEPPED BY MAGNITUDE, like the ring on Today. Colour in this app means an amount; spending it
 * on "this bar is Coles" would take away the one place colour carries meaning, and it would be
 * indistinguishable to a colourblind reader without a legend anyway. The bars are ordered, labelled and
 * measured — the step is reinforcement, never the encoding.
 *
 * Every bar keeps its figure beside it, so nothing is only a picture; a long merchant string wraps under
 * its own name rather than squeezing the number off the row.
 */
export function RankedBars({heading, code, items, order = 'magnitude', shown = 8, trailing}: {
  heading: string; code: Currency; items: readonly RankedItem[];
  order?: 'magnitude' | 'given'; shown?: number; trailing?: React.ReactNode;
}) {
  if (!items.length) return null;
  const size = (item: RankedItem) => { const v = BigInt(item.minor); return v < 0n ? -v : v; };
  const ordered = order === 'magnitude' ? [...items].sort((a, b) => size(b) > size(a) ? 1 : size(b) < size(a) ? -1 : 0) : items;
  const rows = ordered.slice(0, shown);
  const ceiling = rows.reduce((most, item) => size(item) > most ? size(item) : most, 1n);
  // Ranked by amount whatever the row order is, so the darkest step is always the largest bar.
  const rank = new Map([...rows].sort((a, b) => size(b) > size(a) ? 1 : size(b) < size(a) ? -1 : 0)
    .map((item, index) => [item, Math.min(index, 5)]));
  // Dimensionless geometry: millionths of the largest bar, never a currency conversion, so no money
  // becomes a float on the way to a width.
  const width = (item: RankedItem) => `${Number(displayRatio(size(item).toString(), ceiling.toString())) / 10000}%`;

  return <figure className="ranked">
    <figcaption className="list-heading"><h2>{heading}</h2>{trailing}</figcaption>
    <ul className="ranked-list">
      {rows.map(item => <li key={item.name} className="ranked-row">
        <div className="ranked-head">
          <span className="ranked-name">{item.name}</span>
          {item.onOpen
            ? <button type="button" className="button button-quiet ranked-amount" onClick={item.onOpen}
                aria-label={`Transactions behind ${item.name}`}>{format(money(BigInt(item.minor), code))}</button>
            : <span className="amount">{format(money(BigInt(item.minor), code))}</span>}
        </div>
        <span className="ranked-track" aria-hidden="true">
          <span className="ranked-fill" data-rank={rank.get(item)} style={{width: width(item)}}/>
        </span>
        {item.detail && <span className="meta">{item.detail}</span>}
      </li>)}
    </ul>
    {ordered.length > rows.length && <figcaption className="meta">{ordered.length - rows.length} smaller not shown</figcaption>}
  </figure>;
}
