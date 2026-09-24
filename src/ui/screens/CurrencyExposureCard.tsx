import {useQuery} from '@tanstack/react-query';
import {convert, rateBetween, type Rate} from '../../core/fx';
import {currency, format, money, type Currency} from '../../core/money';
import {localDay} from '../../ingest/reminders';
import {currencyExposure, type Holding} from '../../intelligence/visuals/exposure';
import {CurrencyExposure} from '../design/CurrencyExposure';
import {useSession} from '../session';
import {useDisplayCurrency} from '../currency';

/**
 * WHAT SHARE OF THE MONEY SITS IN EACH CURRENCY.
 *
 * Only when more than one is actually held. With one currency the answer is "all of it", which is not
 * worth a chart, and this follows the same rule the combined total already does rather than inventing a
 * second one.
 *
 * A BALANCE CONVERTS AT TODAY'S RATE. What is held is held now, and what it is worth now is today's
 * rate; a transaction is a thing that happened on a day and repricing it later rewrites the past. Same
 * rule, different answers — see CombinedTotal, which states it at length.
 *
 * A CURRENCY WITH NO STORED RATE IS LEFT OUT AND NAMED. Counting it as zero would understate the
 * exposure and counting it as though it were already in the display currency would invent one.
 */
export function CurrencyExposureCard() {
  const session = useSession();
  const ready = session.state === 'ready';
  const accounts = useQuery({queryKey: ['accounts'], enabled: ready, queryFn: () => session.run(repo => repo.accounts())});
  const balances = useQuery({queryKey: ['account-balances'], enabled: ready, queryFn: () => session.run(repo => repo.accountBalances())});
  const home = useQuery({queryKey: ['display-currency'], enabled: ready, queryFn: () => session.run(repo => repo.displayCurrency())});
  const stored = useQuery({queryKey: ['fx-rates'], enabled: ready, queryFn: () => session.run(repo => repo.rates())});
  const display = useDisplayCurrency();
  if (!accounts.data || !balances.data || !home.isSuccess || !stored.isSuccess) return null;

  const live = accounts.data.filter(account => !account.archived_at);
  const codes = [...new Set(live.map(account => account.currency))];
  if (codes.length < 2) return null;

  const rates: Rate[] = stored.data.map(rate => ({asOf: rate.asOf, base: currency(rate.base),
    quote: currency(rate.quote), rateE8: BigInt(rate.rateE8), source: rate.source}));

  const today = localDay();
  const holdings: Holding[] = [];
  const missing: Currency[] = [];
  let newest = '';
  for (const account of live) {
    const held = BigInt(balances.data.find(balance => balance.accountId === account.id)?.minor ?? '0');
    const code = currency(account.currency);
    if (code === display) { holdings.push({code, minor: held.toString()}); continue; }
    // Either direction, for the same reason the combined total needs it: one published pair, both ways.
    const rate = rateBetween(rates, code, display, today);
    if (rate === null) { if (!missing.includes(code)) missing.push(code); continue; }
    holdings.push({code, minor: convert(money(held, code), display, rate).minor.toString()});
    const dated = rates.filter(r => (r.base === code && r.quote === display) || (r.base === display && r.quote === code))
      .reduce((latest, r) => (r.asOf <= today && r.asOf > latest ? r.asOf : latest), '');
    if (dated > newest) newest = dated;
  }

  const exposure = currencyExposure(holdings);
  if (!exposure) return null;

  const caption = [`${format(money(BigInt(exposure.totalMinor), display))} held`,
    newest ? `at rates from ${newest}` : null,
    ...exposure.owed.map(owed => `${format(money(BigInt(owed.minor), display))} owed in ${owed.code}`),
    missing.length ? `${missing.join(', ')} not included` : null].filter(Boolean).join(' · ');

  return <section className="stack">
    <div className="list-heading"><h2>Currency exposure</h2><span className="meta">{display}</span></div>
    <CurrencyExposure exposure={exposure} caption={caption}/>
  </section>;
}
