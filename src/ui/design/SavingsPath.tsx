import {useQuery} from '@tanstack/react-query';
import {format, money} from '../../core/money';
import {localDay} from '../../ingest/reminders';
import {displayRatio} from '../../intelligence/visuals';
import {keepToday, savingsPath} from '../../intelligence/savings';
import {useSession} from '../session';
import {useHoldings} from '../money';

/**
 * THE ADVICE, AS A SHAPE. "i want like a financial advisor app, but doesnt explain instead show me in
 * charts or concept visualisation... i dont want any explaination. make text simple."
 *
 * Two figures and one line. Spend today is what a day can cost without putting the rest of the horizon at
 * risk; keep today is what is spare after that. Behind today the line is what he actually kept — his own
 * record, not a story told backwards about what the app might have said. Ahead of it, dashed because it
 * has not happened, is where keeping the suggested amount takes him.
 *
 * THE GAP IS THE MESSAGE, and it moves on its own: a week of heavier spending flattens the dashed line
 * the next time this is drawn, and a week of keeping raises the solid one to meet it. Nothing scores him,
 * nothing breaks, and there is no streak to lose — the research on micro-saving is clear that a losable
 * streak stops helping the moment it breaks, and that consistency matters more than size.
 *
 * It shares the analysis every other card on Today is already waiting for, so this costs no second pass
 * over the ledger.
 */
export function SavingsPath() {
  const session = useSession();
  const today = localDay();
  const {code, spendableMinor, potMinor, ready} = useHoldings();
  const report = useQuery({
    queryKey: ['intelligence', today, code, {extra: '0', cut: 0}], staleTime: 0,
    enabled: session.state === 'ready',
    queryFn: () => session.run(repo => repo.intelligence.analyse(today, code, '0', 0)),
  });
  const snapshot = report.data?.snapshot;
  if (session.state !== 'ready' || !snapshot || !ready) return null;

  const keep = keepToday(snapshot, spendableMinor, report.data?.buffer ?? '0');
  // Nothing recorded yet, or not a week of it: a chart of nothing is still a thing on the screen.
  if (keep.status !== 'ok') return null;

  const pot = BigInt(potMinor) + BigInt(snapshot.savings?.asideMinor ?? '0');
  const path = savingsPath(snapshot, pot.toString(), keep.keepTodayMinor);
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
  const here = path.findIndex(point => point.date === snapshot.asOf);

  return <section className="stack savings-path" aria-label="Savings">
    <div className="savings-figures">
      <div><span className="band-label">Spend today</span><span className="band-figure">{show(keep.spendTodayMinor)}</span></div>
      <div><span className="band-label">Keep today</span><span className="band-figure">{show(keep.keepTodayMinor)}</span></div>
    </div>
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
