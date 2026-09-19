import type {MoneyFlow as Flow} from '../../intelligence/visuals/flow';

/**
 * WHAT CAME IN, WHAT WENT OUT, AND THE GAP.
 *
 * Two stacks facing each other at one shared scale, joined by a single band. The band's TAPER is the
 * whole message: it narrows when less went out than came in and swells when more did, and no pair of
 * totals states that as quickly as a shape that visibly pinches.
 *
 * ONE JUNCTION, NOT CROSSING RIBBONS, because money is fungible — see the module this reads from. A
 * ribbon from "Salary" to "Groceries" would be a fact the ledger does not hold.
 *
 * ONE HUE, ORDERED BY MAGNITUDE. Identity comes from the two labels, never from colour; shade only
 * repeats size, which helps place a thin band on the scale without measuring it against a neighbour.
 *
 * LABELLED SELECTIVELY. The largest band each side is named where it sits; the rest are not, because a
 * name on every band at this width is a paragraph pretending to be a picture.
 */
const H = 560, W = 1000, COLUMN = 70;
/** Display geometry only: these are already dimensionless millionths, never money. */
const y = (millionths: string) => Number(millionths) * H / 1000000;
/**
 * The LARGEST band takes the strongest shade, the same way the treemap does, so "stronger" means
 * "bigger" everywhere in the app rather than something new on each screen. Ranked the other way round —
 * which is how this was first written — the biggest block on the chart came out the palest, and the eye
 * was drawn to the smallest thing on it.
 */
const shade = (rank: number) => `flow-band level-${Math.max(5 - rank, 1)}`;
const clip = (label: string) => label.length > 16 ? `${label.slice(0, 15)}…` : label;

export function MoneyFlow({flow, caption}: {flow: Flow; caption: string}) {
  const inH = y(flow.inHeight), outH = y(flow.outHeight);
  const [mid1, mid2] = [COLUMN + (W - 2 * COLUMN) / 3, W - COLUMN - (W - 2 * COLUMN) / 3];
  // Top edge left to right, down the far side, bottom edge back. The two edges are what taper.
  const band = `M ${COLUMN} 0 C ${mid1} 0 ${mid2} 0 ${W - COLUMN} 0 L ${W - COLUMN} ${outH}`
    + ` C ${mid2} ${outH} ${mid1} ${inH} ${COLUMN} ${inH} Z`;
  const biggest = (bands: Flow['sources']) => bands.find(b => b.rank === 0);
  const left = biggest(flow.sources), right = biggest(flow.destinations);
  return <figure className="money-flow" aria-label={caption}>
    <svg viewBox={`0 0 ${W} ${H}`} className="money-flow-plot" role="img" aria-label={caption}>
      <path d={band} className="flow-link"/>
      {flow.sources.map(b => <rect key={b.id} x="0" y={y(b.top)} width={COLUMN} height={y(b.height)}
        className={shade(b.rank)}/>)}
      {flow.destinations.map(b => <rect key={b.id} x={W - COLUMN} y={y(b.top)} width={COLUMN} height={y(b.height)}
        className={shade(b.rank)}/>)}
      {left && <text x={COLUMN + 14} y={y(b0(left.top, left.height))} className="flow-label">{clip(left.label)}</text>}
      {right && <text x={W - COLUMN - 14} y={y(b0(right.top, right.height))} className="flow-label flow-label-end">{clip(right.label)}</text>}
    </svg>
    <figcaption>{caption}</figcaption>
  </figure>;
}

/** The middle of a band, so a label sits on what it names rather than above it. */
function b0(top: string, height: string) {
  return (BigInt(top) + BigInt(height) / 2n).toString();
}
