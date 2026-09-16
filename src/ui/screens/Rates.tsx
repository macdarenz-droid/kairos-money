import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { currency, currencyDigits, type Currency } from '../../core/money';
import { asRates, fetchRates } from '../../core/net/rates';
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
  const [error, setError] = useState('');

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

  const refresh = useMutation({
    mutationFn: async () => {
      const response = await fetchRates(display, wanted.filter(c => c !== display));
      const rows = asRates(response);
      if (!rows.length) throw new Error('No rates were returned for these currencies.');
      await session.run(repo => repo.saveRates(rows.map(r => ({ ...r, base: String(r.base), quote: String(r.quote) }))));
      return response.asOf;
    },
    onSuccess: async day => { setError(''); await client.invalidateQueries(); notify(`Rates updated to ${day}.`); },
    onError: e => setError(e instanceof Error ? e.message : 'Rates could not be updated.'),
  });

  const choose = useMutation({
    mutationFn: (code: string) => session.run(repo => repo.setDisplayCurrency(code)),
    onSuccess: () => client.invalidateQueries(),
  });

  if (session.state !== 'ready') return null;

  return <section className="settings-section">
    <h2>Currency</h2>
    <label className="input-label">Show amounts in
      <select value={display} disabled={choose.isPending} onChange={e => choose.mutate(e.target.value)}>
        {wanted.map(code => <option key={code} value={code}>{code}</option>)}
      </select>
    </label>
    <Row trailing={<Button disabled={refresh.isPending} onClick={() => refresh.mutate()}>
      <RefreshCw size={16}/>{refresh.isPending ? 'Updating' : 'Update'}</Button>}>
      Rates
      {/* The day the rates belong to, not the moment they were downloaded. */}
      <p>{asOf.data ? `From ${asOf.data}` : 'None yet'}</p>
    </Row>
    {error && <p role="alert">{error}</p>}
  </section>;
}
