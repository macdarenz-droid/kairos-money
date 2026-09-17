import { useQuery } from '@tanstack/react-query';
import { currency, format, money, type Currency } from '../../core/money';
import { convert, rateBetween, type Rate } from '../../core/fx';
import { localDay } from '../../ingest/reminders';
import { useSession } from '../session';

/**
 * What every account comes to, in one currency.
 *
 * Shown only when the accounts do not already share a currency, because adding up a column of figures
 * that are all AUD and calling the answer AUD is not a conversion, it is a total the list already gives.
 *
 * A BALANCE CONVERTS AT TODAY'S RATE, and that is not a contradiction of the rule that a transaction
 * converts at the rate on its own date. They are different claims. A transaction is a thing that happened
 * on a day, and repricing it later rewrites the past. A balance is what is held right now, and what it is
 * worth right now is exactly today's rate. The same rule — value each thing at the rate in force when it
 * is true — gives a different answer for each.
 *
 * The rate's own date is printed underneath, so the figure is never presented as fresher than it is: on a
 * Sunday it says Friday, because that is the last day rates were published.
 */
export function CombinedTotal({ accounts, balances }: {
  accounts: readonly { id: string; currency: string; archived_at: string | null }[];
  balances: readonly { accountId: string; minor: string }[] | undefined;
}) {
  const session = useSession();
  const home = useQuery({ queryKey: ['display-currency'], enabled: session.state === 'ready',
    queryFn: () => session.run(repo => repo.displayCurrency()) });
  const stored = useQuery({ queryKey: ['fx-rates'], enabled: session.state === 'ready',
    queryFn: () => session.run(repo => repo.rates()) });

  const live = accounts.filter(a => !a.archived_at);
  const codes = [...new Set(live.map(a => a.currency))];
  if (session.state !== 'ready' || codes.length < 2 || !balances) return null;

  const display = currency(home.data ?? codes[0] ?? 'AUD');
  const rates: Rate[] = (stored.data ?? []).map(r => ({
    asOf: r.asOf, base: currency(r.base), quote: currency(r.quote), rateE8: BigInt(r.rateE8), source: r.source }));

  const today = localDay();
  let total = 0n, newest = "";
  const missing: Currency[] = [];
  for (const account of live) {
    const held = BigInt(balances.find(b => b.accountId === account.id)?.minor ?? 0n);
    const code = currency(account.currency);
    if (code === display) { total += held; continue; }
    // Either direction: the source publishes one way and the conversion runs the other, so asking only
    // for base=account, quote=display found nothing and reported every foreign account as "not included".
    const rate = rateBetween(rates, code, display, today);
    // A currency with no rate is left OUT and named, rather than quietly counted as zero or as though it
    // were already in the display currency. A total that silently drops an account is worse than none.
    if (rate === null) { if (!missing.includes(code)) missing.push(code); continue; }
    total += convert(money(held, code), display, rate).minor;
    const dated = rates.filter(r => (r.base === code && r.quote === display) || (r.base === display && r.quote === code))
      .reduce((latest, r) => (r.asOf <= today && r.asOf > latest ? r.asOf : latest), '');
    if (dated > newest) newest = dated;
  }

  return <div className="list-heading combined-total">
    <div>
      <h3>All accounts</h3>
      <p className="meta">{newest ? `At rates from ${newest}` : 'No rates stored yet'}
        {missing.length ? ` · ${missing.join(', ')} not included` : ''}</p>
    </div>
    <span className="amount">{format(money(total, display))}</span>
  </div>;
}
