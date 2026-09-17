import { currencyDigits, money, type Currency, type Money } from '../money';

/**
 * Exchange rates, and the one honest way to apply them to a ledger.
 *
 * WHY A RATE HAS A DATE. A purchase happened at the rate on the day it happened. Converting it at
 * today's rate means the value of last March silently changes every time the market moves — open the app
 * twice in a week and the same trip cost two different amounts. That is not a display preference, it is
 * the ledger refusing to sit still. So every rate is stored against the day it was published, and a
 * conversion asks for the rate AS AT the transaction's own date.
 *
 * WHY 1e8. A rate is a ratio, not money, so it is not held in minor units — but it must not be a float
 * either, or the error moves into the multiplication. Eight decimal places is enough for every published
 * reference rate and small enough that an amount times a rate cannot overflow a 64-bit integer for any
 * balance a person holds. The scale is exact and the arithmetic is integer throughout.
 */
export const RATE_SCALE = 100000000n;

export type Rate = { asOf: string; base: Currency; quote: Currency; rateE8: bigint; source: string };

/** Half-up on the absolute value, so -0.005 and 0.005 round to the same distance from zero. */
function divideRounded(value: bigint, divisor: bigint): bigint {
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const rounded = (magnitude * 2n + divisor) / (divisor * 2n);
  return negative ? -rounded : rounded;
}

/**
 * Convert an exact amount into another currency at a stated rate.
 *
 * The minor-unit scale differs between currencies — two digits for AUD, none for JPY, three for KWD — so
 * the conversion is not just a multiplication: 10000 AUD minor units (\$100.00) at 96.5 JPY/AUD is 9650
 * JPY minor units (¥9,650), not 965000. Getting this wrong is a hundredfold error, silently.
 */
export function convert(amount: Money, quote: Currency, rateE8: bigint): Money {
  if (rateE8 <= 0n) throw new Error('An exchange rate must be greater than zero.');
  const fromDigits = currencyDigits[amount.currency], toDigits = currencyDigits[quote];
  // Scale the minor units into the target currency's own precision before rounding once, at the end.
  const scaled = amount.minor * rateE8 * 10n ** BigInt(toDigits);
  return money(divideRounded(scaled, RATE_SCALE * 10n ** BigInt(fromDigits)), quote);
}

/**
 * The rate to use for a transaction, which is the most recent one published ON OR BEFORE its date.
 *
 * Reference rates are published on working days, so a Saturday purchase has no rate of its own and takes
 * Friday's — the rate that was in force when the money moved. A LATER rate is never used to value an
 * earlier day, because that is the retroactive rewriting this whole module exists to prevent.
 */
export function rateAsAt(rates: readonly Rate[], base: Currency, quote: Currency, date: string): Rate | null {
  if (base === quote) return null;
  const usable = rates.filter(r => r.base === base && r.quote === quote && r.asOf <= date);
  return usable.length ? usable.reduce((latest, r) => r.asOf > latest.asOf ? r : latest) : null;
}

/** A rate the other way round, so one published pair serves conversions in both directions. */
export function invert(rate: Rate): Rate {
  return { ...rate, base: rate.quote, quote: rate.base, rateE8: divideRounded(RATE_SCALE * RATE_SCALE, rate.rateE8) };
}

/**
 * THE RATE TO GET FROM ONE CURRENCY TO ANOTHER, WHICHEVER DIRECTION WAS PUBLISHED.
 *
 * A published set is one-directional: asking the source for PHP gives PHP→AUD, PHP→USD and so on. The
 * app then asked for AUD→PHP, because that is the direction a conversion runs in — account currency to
 * displayed currency — and got nothing back. `invert` existed for exactly this and was never called from
 * anywhere in src, so every conversion silently found no rate and every foreign amount was dropped and
 * reported as "not included". One fetched pair now serves both ways, which is what a ratio is.
 *
 * Returns the identity scale for a conversion into the same currency, so callers do not special-case it.
 */
export function rateBetween(rates: readonly Rate[], from: Currency, to: Currency, date: string): bigint | null {
  if (from === to) return RATE_SCALE;
  const direct = rateAsAt(rates, from, to, date);
  if (direct) return direct.rateE8;
  const published = rateAsAt(rates, to, from, date);
  return published ? invert(published).rateE8 : null;
}
