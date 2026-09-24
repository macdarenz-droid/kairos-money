import {format, money} from '../../core/money';
import {displayRatio} from '../../intelligence/visuals';
import {useBrain} from '../money';
import {useDisplayCurrency} from '../currency';
import {methodWords} from './method-words';

/** Spend today, keep today, and the savings line: behind today what was kept, ahead where keeping leads. */
export function SavingsPath() {
  const code = useDisplayCurrency();
  const brain = useBrain();
  const t = brain.data?.today;
  // Nothing recorded yet, or not a week of it: a chart of nothing is still a thing on the screen.
  if (!t || t.status !== 'ok') return null;
  const keep = t, targets = t.debtTargets;
  const pot = BigInt(t.savingsPath.potMinor);
  const path = t.savingsPath.points;
  const values = path.flatMap(point => [point.keptMinor, point.plannedMinor])
    .filter((value): value is string => value !== null).map(BigInt);
  const top = values.reduce((most, value) => value > most ? value : most, 1n);
  const show = (minor: string | bigint) => format(money(BigInt(minor), code));

  // Dimensionless geometry: displayRatio returns signed millionths of the tallest point, computed in
  // bigint, so the only thing that ever becomes a float is a ratio — never an amount.
  const x = (index: number) => (index * 1000 / (path.length - 1)).toFixed(2);
  const y = (value: string) => {
    const ratio = Number(displayRatio(value, top.toString()));   // millionths of the tallest point
    return (190 - ratio * 180 / 1000000).toFixed(2);
  };
  const line = (pick: (point: typeof path[number]) => string | null) => path
    .map((point, index) => ({point: pick(point), index}))
    .filter((entry): entry is {point: string; index: number} => entry.point !== null)
    .map(entry => `${x(entry.index)},${y(entry.point)}`).join(' ');
  const here = path.findIndex(point => point.date === t.asOf);

  return <section className="stack savings-path" aria-label="Savings">
    <div className="savings-figures">
      <div><span className="band-label">Spend today</span><span className="band-figure">{show(keep.spendTodayMinor)}</span></div>
      <div><span className="band-label">{keep.when === 'payday' ? 'Keep on payday' : keep.when === 'paid' ? 'Keep when paid' : 'Keep today'}</span><span className="band-figure">{show(keep.keepTodayMinor)}</span></div>
    </div>
    {/* How he spends, and the method that follows. Two labels; the figures above are the advice. */}
    <p className="meta savings-method">{methodWords(keep.method)}</p>
    {targets.map(t => <p key={t.id} className="meta savings-debt">Keep {show(t.perDayMinor)} a day · {t.name} by {t.date}</p>)}
    <svg viewBox="0 0 1000 200" className="savings-plot" role="img"
      aria-label={`Savings. ${show(pot)} kept now; ${show(path.at(-1)?.plannedMinor ?? pot.toString())} in ${path.length - 1 - here} days if ${show(keep.keepTodayMinor)} is kept each day.`}>
      <line x1="0" y1="190" x2="1000" y2="190" stroke="var(--border-default)" vectorEffect="non-scaling-stroke"/>
      <polyline points={line(point => point.plannedMinor)} className="savings-planned" fill="none"
        strokeWidth="2" strokeDasharray="5 5" vectorEffect="non-scaling-stroke"/>
      <polyline points={line(point => point.keptMinor)} className="savings-kept" fill="none"
        strokeWidth="2" vectorEffect="non-scaling-stroke"/>
      <circle cx={x(here)} cy={y(pot.toString())} r="5" className="savings-now"/>
    </svg>
    <div className="savings-ends">
      <span className="meta">{show(pot)}</span>
      <span className="meta">{show(path.at(-1)?.plannedMinor ?? pot.toString())}</span>
    </div>
  </section>;
}
