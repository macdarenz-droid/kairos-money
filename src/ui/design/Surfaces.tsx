import {useQuery} from '@tanstack/react-query';
import {currency, format, money} from '../../core/money';
import {localDay} from '../../ingest/reminders';
import {surfaces} from '../../intelligence/surfaces';
import {dueWindow} from '../../intelligence/visuals/due';
import {DueStrip} from './DueStrip';
import {useSession} from '../session';
import {FixedFree, Runway} from './Runway';

/**
 * The part of the home screen that is usually not there.
 *
 * Renders nothing at all when nothing is true — no heading, no empty state, no "you're all caught up"
 * card. A reassuring empty card is still a thing on the screen, and a thing on the screen that is always
 * there is a thing you stop seeing. The absence IS the message.
 *
 * It shares the intelligence query key with the Intelligence screen, so opening Today does not run the
 * whole analysis a second time.
 */
export function Surfaces() {
  const session = useSession();
  const today = localDay();
  const home = useQuery({queryKey: ['display-currency'], enabled: session.state === 'ready',
    queryFn: () => session.run(repo => repo.displayCurrency())});
  const code = home.data ?? 'AUD';
  // Debts are read separately and cheaply: the analysis is a heavy pass over the ledger, and a list of
  // standing facts the person typed in does not belong inside it.
  const debts = useQuery({queryKey: ['debts'], enabled: session.state === 'ready',
    queryFn: () => session.run(repo => repo.debts.list())});
  const report = useQuery({
    queryKey: ['intelligence', today, code, {extra: '0', cut: 0}],
    queryFn: () => session.run(r => r.intelligence.analyse(today, code, '0', 0)),
    enabled: session.state === 'ready' && home.isSuccess,
  });
  // Silence on error too. A failure to read the ledger is not a reason to shout on the home screen; the
  // screens that exist to show that evidence say so in their own words.
  if (!report.data) return null;
  const forecast = report.data.forecast;
  const due = dueWindow(forecast.recurrences, report.data.snapshot.asOf, forecast.nextPay);
  const owing = (debts.data ?? []).filter(d => d.closedAt === null && d.currency === code && BigInt(d.balanceMinor) > 0n)
    .map(d => ({id: d.id, name: d.name, minimumMinor: d.minimumMinor, dueDay: d.dueDay}));
  const showing = surfaces(report.data.snapshot,
    report.data.signals.filter(s => s.period.startsWith('trailing-90:')), due, owing);
  if (!showing.length) return null;

  const amount = (minor: string) => format(money(BigInt(minor), currency(code)));
  return <section className="surfaces" aria-label="Worth knowing now">
    {showing.map(surface => {
      if (surface.id === 'runway') return <div className="surface-card" key={surface.id}>
        <Runway days={surface.data['days']!} ceiling={surface.data['ceiling']!}/>
      </div>;
      if (surface.id === 'fixed-burden') return <div className="surface-card" key={surface.id}>
        <FixedFree basisPoints={surface.data['basisPoints']!}/>
      </div>;
      if (surface.id === 'debt-due') return <div className="surface-card" key={surface.id}>
        <p>{surface.data['name']} · {amount(surface.data['minor']!)} due {surface.data['date']}</p>
      </div>;
      if (surface.id === 'due-soon') return <div className="surface-card" key={surface.id}>
        {/* The strip, not a list. Which day, and which side of payday, is the whole question. */}
        <DueStrip window={due} label={`${amount(surface.data['minor']!)} due by ${surface.data['date']}`}/>
      </div>;
      return <div className="surface-card" key={surface.id}>
        {/* Stated, not judged. A large charge at a merchant can be perfectly intended, and the app has
            no way of knowing which — so it reports the comparison and stops talking. */}
        <p>{surface.data['merchant']} · {amount(surface.data['minor']!)}</p>
        <p className="meta">usually {amount(surface.data['usualMinor']!)}</p>
      </div>;
    })}
  </section>;
}
