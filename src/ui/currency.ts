import { useQuery } from '@tanstack/react-query';
import { currency, money, type Currency, type Money } from '../core/money';
import { convert, rateBetween, type Rate } from '../core/fx';
import { localDay } from '../ingest/reminders';
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
 * together. And one FALLBACK, for the screen before anyone has chosen a setting at all: "still in aud.
 * even i used php" was this hook, on a phone that had never opened the currency picker, handing back a
 * literal 'AUD' to eleven different screens because that was the one thing they all agreed to fall back
 * to. His account holds pesos; the screens that happened to already know his accounts (MoneyBand,
 * SpendRing) inferred PHP from them and were right, and everything reading this hook instead — Ledger,
 * Insights, Recorded today — fell back to AUD and was wrong, on the same phone, at the same moment. The
 * fallback is the account itself now: no explicit choice, no accounts yet, and 'AUD' is still what a
 * blank ledger has to show something as — but the moment an account exists, its own currency is what
 * "no choice made" means, everywhere this hook is asked.
 */
export function useDisplayCurrency(): Currency { return useDisplayCurrencyState().code; }

/**
 * The currency, and whether it is SETTLED: the stored choice and the accounts have both been read.
 *
 * Before they have, the hook can only answer with the fallback, and a screen that starts a full pass over
 * the ledger on that answer starts it twice — once in the fallback currency, once more the moment the
 * real one arrives. On the device gate that was the 20,000-row ledger paged twice at unlock, 160 reads
 * where 80 would do, and the History load held at the edge of its budget. Anything that costs a pass over
 * the ledger waits for `settled`; a label can show the fallback for the frame it takes.
 */
export function useDisplayCurrencyState(): { code: Currency; settled: boolean } {
  const session = useSession();
  const home = useQuery({ queryKey: ['display-currency'], enabled: session.state === 'ready',
    queryFn: () => session.run(repo => repo.displayCurrency()) });
  const accounts = useQuery({ queryKey: ['accounts'], enabled: session.state === 'ready',
    queryFn: () => session.run(repo => repo.accounts()) });
  const settled = !home.isPending && !accounts.isPending;
  if (home.data) return { code: currency(home.data), settled };
  const first = (accounts.data ?? []).find(account => !account.archived_at);
  return { code: currency(first?.currency ?? 'AUD'), settled };
}

/**
 * THE SAME AMOUNT, IN THE CURRENCY THE APP IS SET TO — wherever it is shown.
 *
 * "currency working now, but only in today section. not in ledger, not in insights." The tiles converted
 * because MoneyBand had been taught to; the account rows, the History list and the debts each printed
 * whatever currency the row happened to be recorded in, so one screen said PHP and the next said A$.
 *
 * AN AMOUNT CONVERTS AT THE RATE FOR ITS OWN DATE, never at today's, which is why `on` is a parameter and
 * not an assumption: a purchase made in March is worth what it was worth in March. A BALANCE is what is
 * held now, so that one takes today — the caller says which, because only the caller knows.
 *
 * Returns null rather than a wrong number when no rate reaches the pair. The caller shows the amount as it
 * was recorded instead, and the Unconverted notice names the currency that could not be reached.
 */
export function useConverter() {
  const session = useSession();
  const code = useDisplayCurrency();
  const stored = useQuery({ queryKey: ['fx-rates'], enabled: session.state === 'ready',
    queryFn: () => session.run(repo => repo.rates()) });
  const rates: Rate[] = (stored.data ?? []).map(row => ({ asOf: row.asOf, base: currency(row.base),
    quote: currency(row.quote), rateE8: BigInt(row.rateE8), source: row.source }));
  const into = (minor: bigint | string, from: string, on: string = localDay()): Money | null => {
    const held = currency(from);
    const value = money(BigInt(minor), held);
    if (held === code) return value;
    const rate = rateBetween(rates, held, code, on);
    return rate === null ? null : convert(value, code, rate);
  };
  return { code, into };
}
