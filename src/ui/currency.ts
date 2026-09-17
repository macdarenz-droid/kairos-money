import { useQuery } from '@tanstack/react-query';
import { currency, type Currency } from '../core/money';
import { useSession } from './session';

/**
 * THE ONE CURRENCY THE APP SHOWS MONEY IN.
 *
 * "remove, replace global currency conversion inside app" — three screens each had their own picker
 * ("History currency", "Net worth currency", and a hard-coded AUD inside the analysis), so the same
 * ledger could report itself in three currencies at once and none of them was the one he had chosen in
 * settings. A display currency is a property of the app, not of a card on it.
 *
 * One query key, so every screen reads the same stored setting and a change invalidates all of them
 * together.
 */
export function useDisplayCurrency(): Currency {
  const session = useSession();
  const home = useQuery({ queryKey: ['display-currency'], enabled: session.state === 'ready',
    queryFn: () => session.run(repo => repo.displayCurrency()) });
  return currency(home.data ?? 'AUD');
}
