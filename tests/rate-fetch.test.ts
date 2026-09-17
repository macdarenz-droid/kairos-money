import {afterEach, describe, expect, it, vi} from 'vitest';
import {currency} from '../src/core/money';
import {fetchRates} from '../src/core/net/rates';

const PHP = currency('PHP'), AUD = currency('AUD'), USD = currency('USD');
const answer = (body: unknown, init: ResponseInit = {}) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), {status: 200, ...init}));
afterEach(() => vi.restoreAllMocks());

/**
 * The network path had no test at all, and the screen it feeds showed "Failed to fetch" — the browser's
 * one TypeError for every network-layer failure there is. He read that on his phone and it told him
 * nothing: not whether he was offline, not whether the address still answers.
 */
describe('what the rate fetch says when it does not come back', () => {
  it('names the host it could not reach, rather than the browser’s word for it', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(fetchRates(PHP, [AUD, USD])).rejects.toThrow(/Could not reach api\.frankfurter\.app/);
  });

  /**
   * A redirect is refused on purpose — following one would send the request to a host nobody vetted —
   * and `redirect: 'error'` makes the browser raise the SAME TypeError as being offline. So the refusal
   * has to be said out loud, because it is the likeliest reason a request that used to work stops.
   */
  it('says a redirect is refused, since that failure is indistinguishable from being offline', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(fetchRates(PHP, [AUD])).rejects.toThrow(/will not follow a redirect/);
  });

  /** An answer that arrived and said no is a different thing, and still says so with its status. */
  it('keeps an HTTP failure distinct from never arriving', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', {status: 503}));
    await expect(fetchRates(PHP, [AUD])).rejects.toThrow('Exchange rates are unavailable right now (503).');
  });

  /** His own setting: amounts shown in PHP, so PHP is the base every other rate is asked against. */
  it('asks for the display currency as the base and reads the rates exactly', async () => {
    const spy = answer({base: 'PHP', date: '2026-09-16', rates: {AUD: 0.0264, USD: 0.0177}});
    const response = await fetchRates(PHP, [AUD, USD]);
    expect(String(spy.mock.calls[0]?.[0])).toBe('https://api.frankfurter.app/latest?from=PHP&to=AUD,USD');
    expect(response.asOf).toBe('2026-09-16');
    expect(response.rates.AUD).toBe(2640000n);
    expect(response.rates.USD).toBe(1770000n);
  });

  /** A source answering about a different currency would file PHP rates under the wrong base. */
  it('refuses an answer about a currency it did not ask about', async () => {
    answer({base: 'EUR', date: '2026-09-16', rates: {AUD: 1.6}});
    await expect(fetchRates(PHP, [AUD])).rejects.toThrow('answered about a different currency');
  });

  it('refuses an answer that does not say which day it is for', async () => {
    answer({base: 'PHP', rates: {AUD: 0.0264}});
    await expect(fetchRates(PHP, [AUD])).rejects.toThrow('did not say which day');
  });
});
