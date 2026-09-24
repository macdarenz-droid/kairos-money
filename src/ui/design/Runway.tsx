import {displayRatio} from '../../intelligence/visuals';

/**
 * How long the money lasts, as a length rather than a sentence.
 *
 * The app has computed this since before I arrived — buffer_days — and has never once shown it. It was
 * feeding a personality profile instead.
 *
 * WHY A BAR AND NOT A NUMBER. "23" answers nothing on its own; 23 out of what? The bar carries the
 * comparison in its shape: a track a month wide, and a fill that is obviously short or obviously nearly
 * full before any digit is read. The number is there for the person who wants it, not as the message.
 *
 * ONE HUE, NEVER A TRAFFIC LIGHT. Red-amber-green would make the colour the message and leave anyone who
 * cannot separate those hues with nothing. Urgency is carried by LENGTH, which everyone can see. Under a
 * week the fill takes the warning ink — with the word "days" still beside it, so colour is never the only
 * thing saying so.
 */
export function Runway({days, ceiling}: {days: string; ceiling: string}) {
  const short = BigInt(days) < 7n;
  const fill = displayRatio(days, ceiling);
  return <figure className="runway" aria-label={`${days} days of essential spending in reserve, out of ${ceiling}`}>
    <svg viewBox="0 0 1000000 1" preserveAspectRatio="none" className="runway-plot" aria-hidden="true">
      <rect x="0" y="0" width="1000000" height="1" className="runway-track"/>
      {/* Geometry straight from exact integers: the viewBox IS the millionths displayRatio returns, so
          nothing here divides, rounds, or touches a float. */}
      <rect x="0" y="0" width={fill} height="1" className={short ? 'runway-fill runway-fill-short' : 'runway-fill'}/>
    </svg>
    <figcaption><strong>{days}</strong> days left</figcaption>
  </figure>;
}

/**
 * How much of what comes in is already promised to somebody else.
 *
 * Two lengths against each other, which is the whole point — the ratio is the fact, and a ratio wants a
 * comparison, not two numbers side by side. Promised money takes the muted fill and free money the
 * accent, so the eye lands on the part you can still decide about.
 */
export function FixedFree({basisPoints}: {basisPoints: string}) {
  const fixed = displayRatio(basisPoints, '10000');
  const free = (1000000n - BigInt(fixed)).toString();
  const percent = (BigInt(basisPoints) / 100n).toString();
  return <figure className="fixed-free" aria-label={`${percent}% of recorded income is committed`}>
    <svg viewBox="0 0 1000000 1" preserveAspectRatio="none" className="fixed-free-plot" aria-hidden="true">
      <rect x="0" y="0" width={fixed} height="1" className="fixed-free-committed"/>
      {/* A 2px surface gap between the two fills, so they read as two quantities and not one bar with a
          colour change. The gap is drawn, never assumed. */}
      <rect x={fixed} y="0" width={free} height="1" className="fixed-free-left"/>
    </svg>
    <figcaption><strong>{percent}%</strong> committed</figcaption>
  </figure>;
}
