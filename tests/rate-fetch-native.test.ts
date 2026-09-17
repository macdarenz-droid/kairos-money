import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const cap = vi.hoisted(() => ({native: true, request: vi.fn()}));
vi.mock('@capacitor/core', () => ({
  Capacitor: {isNativePlatform: () => cap.native},
  CapacitorHttp: {request: (options: unknown) => cap.request(options)},
}));

const {currency} = await import('../src/core/money');
const {fetchRates} = await import('../src/core/net/rates');
const PHP = currency('PHP'), AUD = currency('AUD');

beforeEach(() => { cap.native = true; cap.request.mockReset(); });
afterEach(() => vi.restoreAllMocks());

const answered = (over: Record<string, unknown> = {}) => cap.request.mockResolvedValue({
  status: 200, url: 'https://api.frankfurter.dev/v1/latest?base=PHP&symbols=AUD', headers: {},
  data: JSON.stringify({base: 'PHP', date: '2026-09-16', rates: {AUD: 0.0264}}), ...over});

/**
 * `fetch` inside the WebView is a browser request from https://localhost, so a server that does not name
 * that origin back has its answer discarded before any of our code runs — reported as "Failed to fetch",
 * the same words used for being offline, for DNS and for TLS. His phone showed exactly that on 5G.
 * CapacitorHttp runs in Java, outside the WebView, where CORS does not apply.
 */
describe('reading rates on the phone', () => {
  it('goes out through the native client rather than the WebView', async () => {
    answered();
    const spy = vi.spyOn(globalThis, 'fetch');
    const response = await fetchRates(PHP, [AUD]);
    expect(cap.request).toHaveBeenCalledTimes(1);
    expect(spy).not.toHaveBeenCalled();
    expect(response.rates.AUD).toBe(2640000n);
  });

  /** Read as text, because the rate digits are taken from the characters, never through a float. */
  it('asks for the response as text so the digits stay exact', async () => {
    answered();
    await fetchRates(PHP, [AUD]);
    expect(cap.request.mock.calls[0]?.[0]).toMatchObject({method: 'GET', responseType: 'text'});
  });

  /**
   * Native follows a redirect before this code can object, so the destination is checked afterwards.
   * Naming where it went is the one thing nobody could see before, and it is how the real move was
   * found: his phone reported "redirected to api.frankfurter.dev" and that address is now the one the
   * app asks. The example here is deliberately somewhere nobody owns, so it keeps testing the refusal
   * rather than the old address.
   */
  it('refuses an answer from an address it was not set up for, and names it', async () => {
    answered({url: 'https://rates.example.invalid/v1/latest?base=PHP&symbols=AUD'});
    await expect(fetchRates(PHP, [AUD])).rejects.toThrow(/redirected to https:\/\/rates\.example\.invalid\/v1\/latest/);
  });

  it('accepts the answer when it came from the address it asked', async () => {
    answered();
    await expect(fetchRates(PHP, [AUD])).resolves.toMatchObject({asOf: '2026-09-16'});
  });

  /** The phone's own reason, instead of the browser's one word for every network fault there is. */
  it('reports what the phone said when it could not connect', async () => {
    cap.request.mockRejectedValue(new Error('Unable to resolve host "api.frankfurter.dev"'));
    await expect(fetchRates(PHP, [AUD])).rejects.toThrow(/Unable to resolve host/);
    await expect(fetchRates(PHP, [AUD])).rejects.toThrow(/Could not reach api\.frankfurter\.dev/);
  });

  it('keeps an answer that arrived and said no distinct from never arriving', async () => {
    answered({status: 503, data: 'nope'});
    await expect(fetchRates(PHP, [AUD])).rejects.toThrow('Exchange rates are unavailable right now (503).');
  });

  /** Off the phone there is no native client, so the browser path stays exactly as it was. */
  it('still uses the browser on anything that is not the phone', async () => {
    cap.native = false;
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({base: 'PHP', date: '2026-09-16', rates: {AUD: 0.0264}}), {status: 200}));
    await fetchRates(PHP, [AUD]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(cap.request).not.toHaveBeenCalled();
  });
});
