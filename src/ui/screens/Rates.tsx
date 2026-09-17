import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { currency, currencyDigits, type Currency } from '../../core/money';
import { asRates, fetchRates } from '../../core/net/rates';
import { rateDays } from '../../core/fx';
import { Button, Row } from '../design/primitives';
import { useSession } from '../session';

/**
 * Exchange rates, and the one thing the screen must never do: imply they are fresher than they are.
 *
 * Every figure the app converts is only as good as the day its rate belongs to, so that day is stated
 * here rather than left to be assumed. "Updated just now" would be a lie on a Sunday — the source
 * publishes on working days, so a Sunday refresh returns Friday's rates and says so.
 *
 * Rates are fetched, never pushed. Nothing here sends anything: the request carries a currency code and
 * a date, and the module that makes it cannot read the ledger at all.
 */
export function Rates({ accounts, notify }: {
  accounts: readonly { currency: string; archived_at: string | null }[];
  notify: (text: string) => void;
}) {
  const session = useSession(), client = useQueryClient();
  const [error, setError] = useState(''), [progress, setProgress] = useState('');

  const held = [...new Set(accounts.filter(a => !a.archived_at).map(a => a.currency))] as Currency[];
  const home = useQuery({ queryKey: ['display-currency'], enabled: session.state === 'ready',
    queryFn: () => session.run(repo => repo.displayCurrency()) });
  const asOf = useQuery({ queryKey: ['rates-as-of'], enabled: session.state === 'ready',
    queryFn: () => session.run(repo => repo.ratesAsOf()) });

  const display = currency(home.data ?? held[0] ?? 'AUD');
  // Every currency the ledger holds, plus the one it is being shown in, so a refresh covers the whole
  // screen rather than whichever pair happened to be asked for first.
  const wanted = [...new Set([...held, display, ...(['USD', 'PHP', 'AUD'] as Currency[])])]
    .filter(code => Object.hasOwn(currencyDigits, code));

  /**
   * ONE REFRESH HAS TO COVER THE LEDGER, NOT JUST TODAY.
   *
   * This asked for `latest` and nothing else. A conversion uses the newest rate published ON OR BEFORE a
   * transaction's date, so a single tap left exactly one usable day: everything older had no rate and was
   * dropped as unconvertible. Change the display currency, press Update, and most of the ledger vanishes.
   *
   * So it asks for the first of each month the ledger spans as well — see rateDays for why months rather
   * than days. Each day is saved as it arrives, so a refresh that fails halfway keeps what it got instead
   * of discarding the lot; and today is fetched FIRST, because it is the one that makes the newest
   * figures work and the one most likely to be all somebody needs.
   */
  const refresh = useMutation({
    mutationFn: async () => {
      const quotes = wanted.filter(c => c !== display);
      const span = await session.run(repo => repo.ledgerSpan());
      const store = async (response: Awaited<ReturnType<typeof fetchRates>>) => {
        const rows = asRates(response);
        if (rows.length) await session.run(repo => repo.saveRates(rows.map(r => ({ ...r, base: String(r.base), quote: String(r.quote) }))));
        return rows.length;
      };

      const latest = await fetchRates(display, quotes);
      if (!await store(latest)) throw new Error('No rates were returned for these currencies.');

      let covered = 1;
      for (const day of span ? rateDays(span.first, span.last) : []) {
        if (day > latest.asOf) continue;
        setProgress(`Reading ${day.slice(0, 7)}`);
        // A missing month is not a failed refresh: the months that did arrive are worth keeping, and
        // anything still unconvertible is named on the screens that would have shown it.
        try { if (await store(await fetchRates(display, quotes, day))) covered++; } catch { /* keep going */ }
      }
      setProgress('');
      return { asOf: latest.asOf, covered };
    },
    onSuccess: async ({ asOf, covered }) => { setError(''); await client.invalidateQueries();
      notify(covered > 1 ? `Rates updated to ${asOf}, covering ${covered} months.` : `Rates updated to ${asOf}.`); },
    onError: e => { setProgress(''); setError(e instanceof Error ? e.message : 'Rates could not be updated.'); },
  });

  const choose = useMutation({
    mutationFn: (code: string) => session.run(repo => repo.setDisplayCurrency(code)),
    onSuccess: () => client.invalidateQueries(),
  });

  if (session.state !== 'ready') return null;

  return <section className="settings-section" id="settings-currency">
    <h2>Currency</h2>
    <label className="input-label">Show amounts in
      <select value={display} disabled={choose.isPending} onChange={e => choose.mutate(e.target.value)}>
        {wanted.map(code => <option key={code} value={code}>{code}</option>)}
      </select>
    </label>
    {/* Pressed before the stored display currency has loaded, this fetched against whatever the picker
        was defaulting to and the source answered about a different currency. It waits for the setting. */}
    <Row trailing={<Button disabled={refresh.isPending || !home.isSuccess} onClick={() => refresh.mutate()}>
      <RefreshCw size={16}/>{refresh.isPending ? (progress || 'Updating') : 'Update'}</Button>}>
      Rates
      {/* The day the rates belong to, not the moment they were downloaded. */}
      <p>{asOf.data ? `From ${asOf.data}` : 'None yet'}</p>
    </Row>
    {/*
      * Amounts now CONVERT into whatever is chosen here, so holding no account in it is fine. What is
      * not fine is choosing a currency with no stored rate: nothing can be converted into it, and every
      * figure would be missing with no reason given. So the reason is given, next to the choice.
      */}
    {/* A state, not a failure, so it does not compete with the error below for the same role. */}
    {!held.includes(display) && !asOf.data && !error && <p role="status">No rates are stored yet, so amounts
      cannot be converted into {display}. Press Update, or choose a currency you hold an account in.</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
