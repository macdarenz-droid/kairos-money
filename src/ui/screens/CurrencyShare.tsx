import {useQuery} from '@tanstack/react-query';
import {convert, rateBetween, type Rate} from '../../core/fx';
import {currency, money, type Currency} from '../../core/money';
import {localDay} from '../../ingest/reminders';
import {currencyExposure, sharePercent, type Holding} from '../../intelligence/visuals/exposure';
import {useSession} from '../session';
import {useDisplayCurrency} from '../currency';

type Held = {id: string; currency: string; archived_at: string | null};

/** Share of open-account money per currency, at today's rate; a currency with no rate is named, not counted. */
export function currencyShare(accounts: readonly Held[], balances: readonly {accountId: string; minor: string}[], rates: readonly Rate[], display: Currency, today: string) {
  const holdings: Holding[] = [], missing = new Set<string>();
  for (const account of accounts) {
    if (account.archived_at) continue;
    const minor = balances.find(b => b.accountId === account.id)?.minor ?? '0';
    const from = currency(account.currency);
    if (from === display) { holdings.push({code: from, minor}); continue; }
    const rate = rateBetween(rates, from, display, today);
    if (rate === null) { missing.add(from); continue; }
    holdings.push({code: from, minor: convert(money(BigInt(minor), from), display, rate).minor.toString()});
  }
  const exposure = currencyExposure(holdings);
  if (!exposure) return null;
  return {text: exposure.bands.map(b => `${b.code} ${sharePercent(b.share)}`).join(' · '), missing: [...missing].sort()};
}

/** One line under Currency, only when money is held in more than one. */
export function CurrencyShare() {
  const session = useSession(), display = currency(useDisplayCurrency()), ready = session.state === 'ready';
  const data = useQuery({queryKey: ['currency-share'], enabled: ready, queryFn: () => session.run(async repo => ({accounts: await repo.accounts(), balances: await repo.accountBalances(),
    rates: (await repo.rates()).map(r => ({asOf: r.asOf, base: currency(r.base), quote: currency(r.quote), rateE8: BigInt(r.rateE8), source: r.source}))}))});
  if (!data.data) return null;
  const line = currencyShare(data.data.accounts.map(a => ({id: a.id, currency: a.currency, archived_at: a.archived_at})), data.data.balances, data.data.rates, display, localDay());
  if (!line) return null;
  return <p className="meta">Held in: {line.text}{line.missing.length ? `. No rate yet for ${line.missing.join(', ')}.` : ''}</p>;
}
