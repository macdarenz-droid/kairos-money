import {useQuery} from '@tanstack/react-query';
import {convert, rateBetween, type Rate} from '../core/fx';
import {currency, money} from '../core/money';
import {localDay} from '../ingest/reminders';
import {useSession} from './session';
import {useDisplayCurrency} from './currency';

/**
 * WHAT IS HELD, SPLIT THE ONLY WAY THAT MATTERS: money to spend, and money being kept.
 *
 * "savings money doesnt mix in overall balance. its a separate money." Two screens need that split — the
 * tiles and the savings path — and one of them deciding it differently from the other is how a money app
 * starts contradicting itself. One reading, one rule: a savings or investment account is kept, everything
 * else is spendable, and a balance converts at today's rate because a balance is what is held now.
 */
export function useHoldings() {
  const session = useSession();
  const code = useDisplayCurrency();
  const today = localDay();
  const accounts = useQuery({queryKey: ['accounts'], enabled: session.state === 'ready',
    queryFn: () => session.run(repo => repo.accounts())});
  const balances = useQuery({queryKey: ['account-balances'], enabled: session.state === 'ready',
    queryFn: () => session.run(repo => repo.accountBalances())});
  const stored = useQuery({queryKey: ['fx-rates'], enabled: session.state === 'ready',
    queryFn: () => session.run(repo => repo.rates())});

  const rates: Rate[] = (stored.data ?? []).map(row => ({asOf: row.asOf, base: currency(row.base),
    quote: currency(row.quote), rateE8: BigInt(row.rateE8), source: row.source}));
  const live = (accounts.data ?? []).filter(account => !account.archived_at);
  const kept = (account: {type?: string}) => account.type === 'savings' || account.type === 'investment';
  const total = (rows: typeof live) => rows.reduce((sum, account) => {
    const rate = rateBetween(rates, currency(account.currency), code, today);
    if (rate === null) return sum;
    const minor = BigInt(balances.data?.find(row => row.accountId === account.id)?.minor ?? 0n);
    return sum + convert(money(minor, currency(account.currency)), code, rate).minor;
  }, 0n);

  const spending = live.filter(account => !kept(account));
  return {code, live, spending, pots: live.filter(kept),
    spendableMinor: total(spending).toString(), potMinor: total(live.filter(kept)).toString(),
    ready: accounts.isSuccess && balances.isSuccess};
}
