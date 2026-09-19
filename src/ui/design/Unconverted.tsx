import {Button} from './primitives';
import {useAnalysis} from '../money';
import {useDisplayCurrency} from '../currency';

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
  const code = useDisplayCurrency();
  const report = useAnalysis();

  const missing = report.data?.snapshot.unconverted ?? [];
  if (!missing.length) return null;
  return <div className="unconverted" role="status">
    <p>{missing.join(' and ')} {missing.length === 1 ? 'is' : 'are'} not included below: no stored rate
      reaches {code}. The figures cover the rest of your money.</p>
    <Button onClick={onFix}>Update rates</Button>
  </div>;
}
