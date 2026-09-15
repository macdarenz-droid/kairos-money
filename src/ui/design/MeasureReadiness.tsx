import {useMemo} from 'react';

export type MeasureState = {key: string; title: string; ready: boolean; reason: string};

/**
 * How much of what Kairos measures it can actually tell you yet, as a shape rather than a roll-call.
 *
 * This replaces a list of thirty-six rows. Every one of them printed the same sentence — "at least 20
 * covered days and 80% window coverage are needed" — as its subtitle and again as its value, so a screen
 * that had nothing to say said it seventy-two times and took a long scroll to do it. The measures are the
 * engine underneath the app; they were never meant to be read one by one.
 *
 * So: one square per measure, filled when it has the evidence it needs. The count answers "how much can
 * this app tell me" at a glance, and the squares fill in as statements arrive, which is the one thing a
 * list of identical sentences could never show. What is missing is said once per distinct reason, with
 * how many measures are waiting on it, instead of once per measure.
 */
export function MeasureReadiness({measures}: {measures: readonly MeasureState[]}) {
  const {ready, waiting} = useMemo(() => {
    const byReason = new Map<string, number>();
    for (const measure of measures) {
      if (measure.ready) continue;
      const reason = measure.reason.trim() || 'Not enough evidence yet.';
      byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
    }
    return {
      ready: measures.filter(measure => measure.ready).length,
      // Commonest blocker first: it is the one thing worth doing something about.
      waiting: [...byReason.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    };
  }, [measures]);

  if (!measures.length) return null;

  return <figure className="readiness">
    <figcaption>
      <p className="hero-amount">{ready} of {measures.length}</p>
      <p>{ready === 0
        ? 'things Kairos measures can be answered from your statements yet'
        : ready === measures.length
          ? 'things Kairos measures are answered from your statements'
          : 'things Kairos measures can be answered from your statements'}</p>
    </figcaption>

    <div className="readiness-grid" role="img"
      aria-label={`${ready} of ${measures.length} measures have the evidence they need.`}>
      {measures.map(measure => <span key={measure.key}
        className={measure.ready ? 'readiness-cell is-ready' : 'readiness-cell'}/>)}
    </div>

    {/* Once per distinct reason, with a count — not once per measure. */}
    {waiting.map(([reason, count]) => <p key={reason} className="meta">
      {count === 1 ? 'One measure is' : `${count} measures are`} waiting: {reason}
    </p>)}
  </figure>;
}
