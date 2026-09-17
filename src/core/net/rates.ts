import { currencyDigits, type Currency } from '../money';
import { type Rate } from '../fx';

/**
 * The ONLY place in Kairos that touches the network.
 *
 * The app shipped with INTERNET removed from its manifest, which made "nothing leaves this device" a fact
 * of the build rather than a promise in a README. The owner has since decided some features should be
 * online. That is his call to make, but it costs the app its strongest guarantee, so the guarantee is
 * replaced rather than dropped: network access lives in this one module, and tests/no-network.test.ts
 * fails the build if any other file reaches for fetch.
 *
 * WHAT MAY LEAVE THE DEVICE: a currency code and a date. That is the whole request.
 *
 * WHAT MAY NOT, AND CANNOT FROM HERE: anything from the ledger. No amount, no balance, no merchant, no
 * account, no transaction. This module cannot read the database — it takes currency codes and returns
 * rates, and that is the entire interface. A rate lookup that carried a balance would be telling a
 * stranger what someone owns.
 */
const HOST = 'https://api.frankfurter.app';

/**
 * European Central Bank reference rates, republished by Frankfurter. No key, no account, no tracking
 * identifier to send, and — the reason it was chosen over the alternatives — every response states the
 * DATE its rates belong to, and historical days can be asked for by date. A source that returned only
 * "the rate now" could not answer what a purchase cost on the day it happened.
 *
 * Those rates are published once per working day, around 16:00 Central European Time. This is not a
 * live market tick and nothing here pretends otherwise: a ledger wants the rate the day settled at, and
 * an intraday quote would make yesterday's coffee a different price by dinner.
 */
export type RateResponse = { asOf: string; base: Currency; rates: Partial<Record<Currency, bigint>> };

/**
 * A published decimal rate, read as an exact integer without ever becoming a float.
 *
 * The obvious route is JSON.parse and multiply, and it loses precision before the multiplication happens:
 * a rate printed as 38.2 is 38.200000000000003 as a double, and every amount converted through it
 * inherits that. The digits are taken from the response text instead, so what is stored is what the
 * source published.
 */
export function decimalToE8(text: string, pair: string): bigint {
  const parts = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!parts) throw new Error(`The rate for ${pair} could not be read.`);
  const [, sign, whole, fraction = ''] = parts;
  // Nine digits: eight to keep, and one to round on. Compared as characters, so no arithmetic here
  // touches a float either.
  const padded = (fraction + '000000000').slice(0, 9);
  const scaled = BigInt(whole + padded.slice(0, 8)) + (padded[8]! >= '5' ? 1n : 0n);
  if (sign === '-' || scaled <= 0n) throw new Error(`The rate for ${pair} is not a positive number.`);
  return scaled;
}

/**
 * @param on an ISO day for a historical rate, or omitted for the latest published set.
 */
export async function fetchRates(base: Currency, quotes: readonly Currency[], on?: string): Promise<RateResponse> {
  const wanted = quotes.filter(q => q !== base);
  if (!wanted.length) return { asOf: on ?? '', base, rates: {} };
  if (on !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(on)) throw new Error('Ask for rates on a calendar date.');

  const url = `${HOST}/${on ?? 'latest'}?from=${base}&to=${wanted.join(',')}`;

  /**
   * A REQUEST THAT NEVER COMPLETED SAYS WHAT WAS TRIED, RATHER THAN "Failed to fetch".
   *
   * That string is the browser's single TypeError for every network-layer failure there is: no route,
   * DNS, TLS, connection refused, blocked by CORS — and, because of `redirect: 'error'` below, a host
   * that has moved. It is printed on the Currency screen verbatim, where it names nothing and offers
   * nothing to do. Someone reading it cannot tell whether their phone is offline or the app is pointed
   * at an address that no longer answers.
   *
   * The redirect is refused deliberately and stays refused: following one would send the request to a
   * host nobody vetted, and the whole point of this module is that exactly one address is reachable
   * from the app. So the refusal is stated instead of hidden.
   */
  let response: Response;
  try {
    response = await fetch(url, { headers: { accept: 'application/json' }, redirect: 'error' });
  } catch {
    throw new Error(`Could not reach ${new URL(HOST).host}. Check the connection; if it is working, the`
      + ` rate service may have moved — this app will not follow a redirect to an address it does not know.`);
  }
  if (!response.ok) throw new Error(`Exchange rates are unavailable right now (${response.status}).`);

  // Read as text, so the rate digits can be taken exactly. The structure is still validated by parsing.
  const text = await response.text();
  const body = JSON.parse(text) as { base?: unknown; date?: unknown; rates?: unknown };
  if (typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) throw new Error('The rate source did not say which day its rates are for.');
  // Without this the app would file today's rates under a date it assumed, which is the same retroactive
  // rewriting that storing rates by date exists to prevent.
  if (body.base !== base) throw new Error('The rate source answered about a different currency.');
  if (typeof body.rates !== 'object' || body.rates === null) throw new Error('The rate source returned no rates.');

  const block = /"rates"\s*:\s*\{([^}]*)\}/.exec(text)?.[1] ?? '';
  const rates: Partial<Record<Currency, bigint>> = {};
  for (const quote of wanted) {
    if (!Object.hasOwn(body.rates as object, quote)) continue;
    const printed = new RegExp(`"${quote}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`).exec(block)?.[1];
    if (printed === undefined) throw new Error(`The rate for ${base}/${quote} could not be read.`);
    rates[quote] = decimalToE8(printed, `${base}/${quote}`);
  }
  if (!Object.keys(rates).length) throw new Error('The rate source knows none of these currencies.');
  return { asOf: body.date, base, rates };
}

/** Shapes a fetched response into rows for storage, all carrying the day the source published them. */
export function asRates(response: RateResponse, source = 'frankfurter/ecb'): Rate[] {
  return (Object.keys(response.rates) as Currency[])
    .filter(quote => Object.hasOwn(currencyDigits, quote))
    .map(quote => ({ asOf: response.asOf, base: response.base, quote, rateE8: response.rates[quote]!, source }));
}
