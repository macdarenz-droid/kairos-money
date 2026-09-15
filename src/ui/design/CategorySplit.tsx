import {useMemo} from 'react';
import {format, money, type Currency} from '../../core/money';
import {categoryTiles} from '../../intelligence/visuals/treemap';

export type CategorySlice = {name: string; minor: string; ids: string[]};

const UNCATEGORISED = 'Uncategorised';

/**
 * Where the money went, by kind, as areas rather than a ranked list of sentences.
 *
 * Shade repeats what area already says — biggest is darkest — which is redundant on purpose: a small tile
 * in a crowded corner is easier to place on the scale by its colour than by comparing its area with a
 * neighbour's. It is the same blue ramp the spending calendar uses, so blue means spending everywhere in
 * the app rather than meaning something new on each screen.
 *
 * The honest part is what happens when most of the money has no category. A treemap of one enormous
 * "Uncategorised" rectangle is not a picture of anything; drawing it anyway would dress a gap up as a
 * finding. So when that block would dominate, the gap is stated first, with what closes it, and the chart
 * shows what is actually known underneath.
 */
export function CategorySplit({slices, code, onCategory}: {
  slices: readonly CategorySlice[]; code: Currency; onCategory?: (name: string) => void;
}) {
  const {known, blank, total, tiles} = useMemo(() => {
    const positive = slices.filter(slice => BigInt(slice.minor) > 0n);
    const blankSlice = positive.find(slice => slice.name === UNCATEGORISED) ?? null;
    const knownSlices = positive.filter(slice => slice.name !== UNCATEGORISED)
      .sort((a, b) => BigInt(a.minor) > BigInt(b.minor) ? -1 : BigInt(a.minor) < BigInt(b.minor) ? 1 : a.name.localeCompare(b.name));
    return {
      known: knownSlices, blank: blankSlice,
      total: positive.reduce((sum, slice) => sum + BigInt(slice.minor), 0n),
      tiles: categoryTiles(knownSlices.map(slice => ({name: slice.name, minor: slice.minor}))),
    };
  }, [slices]);

  if (total <= 0n) return <p className="meta">No spending to divide up yet.</p>;

  const show = (value: bigint) => format(money(value, code));
  const blankMinor = blank ? BigInt(blank.minor) : 0n;
  // Compared as exact minor units; never a percentage computed in floating point.
  const mostlyBlank = blankMinor * 2n > total;
  const step = (rank: number) => Math.max(1, 5 - Math.floor(rank * 5 / Math.max(1, known.length)));

  return <figure className="split">
    <figcaption>
      <h3>What the money went on</h3>
      {mostlyBlank
        ? <p>Most of this — {show(blankMinor)} of {show(total)} — has no category yet, so the picture below
            is only the part that does. Accepting the categories offered when you import, or setting them
            in the ledger, is what fills the rest in.</p>
        : <p>{known.length === 1 ? 'One kind of spending' : `${known.length} kinds of spending`}, largest
            first. {blankMinor > 0n ? `${show(blankMinor)} is still uncategorised and is not drawn.` : ''}</p>}
    </figcaption>

    {!known.length
      ? <p className="meta">Nothing here has a category yet, so there is nothing to draw.</p>
      : <>
        <svg className="split-plot" viewBox="0 0 1000 600" role="img"
          aria-label={`Spending by category. Area is the amount. Largest is ${known[0]!.name} at ${show(BigInt(known[0]!.minor))}. Every category is listed below.`}>
          {tiles.map((tile, rank) => <g key={tile.name}>
            <title>{`${tile.name}: ${show(BigInt(tile.minor))}`}</title>
            <rect x={tile.x} y={tile.y} width={tile.width} height={tile.height}
              className={`split-tile level-${step(rank)}`}/>
            {tile.width > 170 && tile.height > 80 && <text x={tile.x + 22} y={tile.y + 46}
              className={`split-label level-${step(rank)}`}>
              {tile.name.length > Math.floor(tile.width / 20) ? `${tile.name.slice(0, Math.max(1, Math.floor(tile.width / 20) - 2))}…` : tile.name}
            </text>}
          </g>)}
        </svg>
        <p className="meta">Each block is a kind of spending; its size is how much, and stronger colour says the same again.</p>
      </>}

    <div className="table-scroll">
      <table className="calendar-table"><caption className="meta">Every category in this selection.</caption>
        <thead><tr><th scope="col">Kind</th><th scope="col">Spent</th></tr></thead>
        <tbody>
          {known.map(slice => <tr key={slice.name}>
            <th scope="row">{onCategory
              ? <button type="button" className="split-name" onClick={() => onCategory(slice.name)}>{slice.name}</button>
              : slice.name}</th>
            <td>{show(BigInt(slice.minor))}</td>
          </tr>)}
          {blank && <tr><th scope="row">{onCategory
            ? <button type="button" className="split-name" onClick={() => onCategory(UNCATEGORISED)}>{UNCATEGORISED}</button>
            : UNCATEGORISED}</th><td>{show(blankMinor)}</td></tr>}
        </tbody>
      </table>
    </div>
  </figure>;
}
