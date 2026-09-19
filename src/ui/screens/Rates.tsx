import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { currencyDigits, type Currency } from '../../core/money';
import { asRates, decimalToE8, fetchRates } from '../../core/net/rates';
import { rateDays } from '../../core/fx';
import { Button, Input, Row } from '../design/primitives';
import { localDay } from '../../ingest/reminders';
import { useSession } from '../session';
import { useDisplayCurrency } from '../currency';

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
  const [error, setError] = useState(''), [progress, setProgress] = useState(''), [typed, setTyped] = useState<Record<string, string>>({});

  const held = [...new Set(accounts.filter(a => !a.archived_at).map(a => a.currency))] as Currency[];
  // Read again here, only for .isSuccess: pressed before this settles, Update fetched against whatever
  // the picker was defaulting to rather than the setting itself. Same query key as useDisplayCurrency,
  // so this costs nothing beyond the one request already in flight.
  const home = useQuery({ queryKey: ['display-currency'], enabled: session.state === 'ready',
    queryFn: () => session.run(repo => repo.displayCurrency()) });
  const asOf = useQuery({ queryKey: ['rates-as-of'], enabled: session.state === 'ready',
    queryFn: () => session.run(repo => repo.ratesAsOf()) });

  const display = useDisplayCurrency();
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

  /**
   * A RATE HE TYPES IN HIMSELF, because the published one cannot always be reached.
   *
   * The rate service is unreachable from his phone and I cannot see why from here. Waiting on that to
   * show him his own money in his own currency is the app holding his data hostage to somebody else's
   * uptime. A rate is one number; he knows it; he can type it.
   *
   * DATED AT THE LEDGER'S FIRST DAY, so it covers everything he has rather than only what happens from
   * now on — a conversion uses the newest rate on or before a date, and one dated today would convert
   * nothing older than today. That does mean one typed figure values the whole ledger, which a published
   * set never would, so the screen says exactly that rather than leaving it to be discovered.
   *
   * Stored as source 'manual', beside the published ones and distinguishable from them forever.
   */
  const enter = useMutation({
    mutationFn: async (code: string) => {
      const value = (typed[code] ?? '').trim();
      if (!value) throw new Error(`Enter how many ${display} one ${code} is worth.`);
      const rateE8 = decimalToE8(value, `${code}/${display}`);
      const span = await session.run(repo => repo.ledgerSpan());
      const asOf = span?.first ?? localDay();
      await session.run(repo => repo.saveRates([{ asOf, base: code, quote: String(display), rateE8, source: 'manual' }]));
      return code;
    },
    onSuccess: async code => { setError(''); setTyped(rest => ({ ...rest, [code]: '' }));
      await client.invalidateQueries(); notify(`Using your own ${code} rate.`); },
    onError: e => setError(e instanceof Error ? e.message : 'That rate could not be saved.'),
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
    {/* "update button, fix. make subtle more silent. little smaller." It is maintenance, not a thing to
        do — the rates keep themselves once fetched — so it stops competing with the figures. */}
    <Row trailing={<Button variant="quiet" className="rate-update" disabled={refresh.isPending || !home.isSuccess} onClick={() => refresh.mutate()}>
      <RefreshCw size={14}/>{refresh.isPending ? (progress || 'Updating') : 'Update'}</Button>}>
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
    {held.filter(code => code !== display).map(code => <div key={code} className="own-rate">
      <Input label={`1 ${code} in ${display}`} inputMode="decimal" placeholder="0.00"
        value={typed[code] ?? ''} onChange={e => setTyped(rest => ({ ...rest, [code]: e.target.value }))}/>
      <Button disabled={enter.isPending} onClick={() => enter.mutate(code)}>Use my own rate</Button>
    </div>)}
    {error && <p role="alert">{error}</p>}
  </section>;
}
