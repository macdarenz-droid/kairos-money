export type AxisPosition = {name: string; at: number | null};

/**
 * Where four descriptive axes sit, as marks on a track rather than four numbers in a column.
 *
 * Drawn as a position, deliberately not as a filled meter. A bar that fills from the left reads as a score
 * out of a hundred — how well someone is doing — and these are not that: they describe a pattern the
 * ledger shows, and the app says so in the sentence beside them. A dot on an unfilled track says "here",
 * which is what the number actually means.
 *
 * An axis with no value draws its track and no dot, so a gap in the evidence looks like a gap rather than
 * like a zero.
 */
export function AxisPositions({axes}: {axes: readonly AxisPosition[]}) {
  if (!axes.length) return null;
  const known = axes.filter(axis => axis.at !== null).length;

  return <figure className="axes">
    <div className="axes-grid" role="img"
      aria-label={axes.map(axis => `${axis.name}: ${axis.at === null ? 'unknown' : `${Math.round(axis.at)} of 100`}`).join('. ')}>
      {axes.map(axis => <div key={axis.name} className="axis-row">
        <span className="axis-name">{axis.name}</span>
        <span className="axis-track">
          {axis.at !== null && <span className="axis-mark"
            style={{insetInlineStart: `${Math.min(100, Math.max(0, axis.at))}%`}}/>}
        </span>
        <span className="axis-value meta">{axis.at === null ? 'Unknown' : Math.round(axis.at)}</span>
      </div>)}
    </div>
    <p className="meta">{known === axes.length
      ? 'Where your recorded spending sits on each of these. They describe a pattern, not a score.'
      : `${known} of ${axes.length} of these can be placed from what you have imported. They describe a pattern, not a score.`}</p>
  </figure>;
}
