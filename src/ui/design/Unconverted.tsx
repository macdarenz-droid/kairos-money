import {useQuery} from '@tanstack/react-query';
import {localDay} from '../../ingest/reminders';
import {Button} from './primitives';
import {useSession} from '../session';

/**
 * WHAT THE FIGURES ON THIS SCREEN HAD TO LEAVE OUT.
 *
 * Amounts convert into whatever currency is chosen, and a currency with no published rate reaching it
 * cannot be converted at all. The honest handling is to exclude that money rather than count it as zero
 * or pass it through as though it were already converted — both invent a number, and one of them
 * silently. The snapshot does exactly that and records what it dropped.
 *
 * Until now nothing read that record, so the outcome was a screen quietly showing less money than the
 * person has, with no reason given. That is the same failure as a button that does nothing: the app
 * knows something the person needs to know and does not say it.
 *
 * Reads the report the screen is already waiting for — same cache key as Surfaces, Intelligence,
 * SpendRing and MoneyBand — so naming the gap costs no extra work.
 */
export function Unconverted({onFix}: {onFix: () => void}) {
  const session = useSession();
  const today = localDay();
  const home = useQuery({queryKey: ['display-currency'], enabled: session.state === 'ready',
    queryFn: () => session.run(repo => repo.displayCurrency())});
  const code = home.data ?? 'AUD';
  const report = useQuery({
    queryKey: ['intelligence', today, code, {extra: '0', cut: 0}],
    queryFn: () => session.run(repo => repo.intelligence.analyse(today, code, '0', 0)),
    enabled: session.state === 'ready' && home.isSuccess,
  });

  const missing = report.data?.snapshot.unconverted ?? [];
  if (!missing.length) return null;
  return <div className="unconverted" role="status">
    <p>{missing.join(' and ')} {missing.length === 1 ? 'is' : 'are'} not included below: no stored rate
      reaches {code}. The figures cover the rest of your money.</p>
    <Button onClick={onFix}>Update rates</Button>
  </div>;
}
