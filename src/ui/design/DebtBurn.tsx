import {displayRatio} from '../../intelligence/visuals';
import {Explain} from './primitives';

/**
 * WHEN THIS IS GONE.
 *
 * A debt is normally shown as a balance and a rate — two numbers that between them answer neither of the
 * questions anybody actually has. The shape does: a line falling to the floor, and the floor is zero. How
 * steep it is IS how fast this is clearing, and where it lands IS the month you are free of it.
 *
 * ONE LINE, ONE HUE. Two strategies drawn over each other would make this a comparison of plans, and a
 * comparison of plans is a thing you go to Insights and ask for; this is the answer to "when". The line
 * carries its own identity from the caption beside it, so no legend is needed and no colour means
 * anything beyond "this is the measured series".
 *
 * WHEN THE PAYMENT DOES NOT COVER THE INTEREST there is no line, because there is no date. Drawing a
 * gently rising curve would dress up "never" as a plan. The plot is left empty and the caption says so in
 * words — an empty plot is a truthful picture of a balance with no end.
 */
export function DebtBurn({balances, startMinor, growing, label}:
  {balances: readonly string[]; startMinor: string; growing: boolean; label: string}) {
  if (growing || !balances.length || BigInt(startMinor) <= 0n) {
    return <figure className="debt-burn" aria-label={label}>
      <figcaption className="debt-burn-none">{label}</figcaption>
    </figure>;
  }
  const steps = balances.length;
  const x = (index: number) => (BigInt(index) * 1000000n / BigInt(steps)).toString();
  // Height above the floor as millionths of what is owed today; the y axis runs downward, so the
  // coordinate is the floor minus that. Every value here comes from exact integers.
  const top = (value: string) => (1000000n - BigInt(displayRatio(value, startMinor))).toString();
  const points = [`0,0`, ...balances.map((value, index) => `${x(index + 1)},${top(value)}`)].join(' ');
  // The x axis spans exactly the months this plan runs for, so the line always lands in the corner and
  // the SHAPE carries how hard the interest is fighting it — the flatter the start, the more of each
  // payment is going to the lender. The number of months is in the caption, where a number belongs; a
  // marker on the last point would only repeat it, and no mark survives the non-uniform scaling that
  // makes a full-width plot possible.
  return <figure className="debt-burn" aria-label={label}>
    <svg viewBox="0 0 1000000 1000000" preserveAspectRatio="none" className="debt-burn-plot" aria-hidden="true">
      <line x1="0" y1="1000000" x2="1000000" y2="1000000" className="debt-burn-floor" vectorEffect="non-scaling-stroke"/>
      <polyline points={points} className="debt-burn-line" vectorEffect="non-scaling-stroke" pathLength="1"/>
    </svg>
    <figcaption>{label} <Explain title="Debt line"><p>Your debt balance month by month at this payment. It reaches the floor when the debt is clear.</p></Explain></figcaption>
  </figure>;
}
