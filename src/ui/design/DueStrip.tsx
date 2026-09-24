import type {DueWindow} from '../../brain/types';
import {displayRatio} from '../../intelligence/visuals';
import {Explain} from './primitives';

/**
 * The next thirty days as a shape.
 *
 * Ticks, not bars: these are events on a line, not a continuous series, and a bar chart would imply a
 * value for the twenty-odd days where nothing happens. Height is the amount relative to the largest bill
 * in view, so the strip answers "which of these is the big one" at any scale.
 *
 * PAYDAY IS THE ONLY OTHER MARK, and it is the point of the whole picture. Ticks before it come out of
 * what you are holding right now; ticks after it do not. That is the difference between a bill and a
 * problem, and no list of amounts can show it.
 *
 * Marks sit ON the baseline and grow upward, because money leaving is still a quantity and quantities
 * read from a shared floor. Nothing here is coloured by category — the strip is about timing.
 */
export function DueStrip({window: due, label}: {window: DueWindow; label: string}) {
  if (!due.dues.length) return null;
  const x = (offset: number) => (offset * 1000000 / due.days).toString();
  const tallest = due.dues.reduce((m, d) => BigInt(d.minor) > m ? BigInt(d.minor) : m, 1n).toString();
  // Millionths of the tallest due, so the drawing never touches an amount.
  const heights = due.dues.map(d => displayRatio(d.minor, tallest));
  return <figure className="due-strip" aria-label={label}>
    <svg viewBox="0 0 1000000 120000" preserveAspectRatio="none" className="due-plot" aria-hidden="true">
      <line x1="0" y1="118000" x2="1000000" y2="118000" className="due-axis" vectorEffect="non-scaling-stroke"/>
      {due.payOffset !== null && <line x1={x(due.payOffset)} y1="0" x2={x(due.payOffset)} y2="118000"
        className="due-payday" vectorEffect="non-scaling-stroke"/>}
      {due.dues.map((d, i) => <line key={`${d.date}-${d.merchant}`} x1={x(d.offset)} x2={x(d.offset)}
        y1={(118000 - Number(heights[i]) * 110000 / 1000000).toString()} y2="118000"
        className={d.beforePay ? 'due-tick due-tick-before' : 'due-tick'} vectorEffect="non-scaling-stroke"/>)}
    </svg>
    <figcaption>{label} <Explain title="Bills due"><p>Each line is a bill due in this window, taller when larger. The dashed line marks payday.</p></Explain></figcaption>
  </figure>;
}
