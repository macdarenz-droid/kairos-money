import {describe, expect, it} from 'vitest';
import {RATE_SCALE, convert, invert, rateAsAt, type Rate} from '../src/core/fx';
import {currency, money} from '../src/core/money';
import {asRates, decimalToE8} from '../src/core/net/rates';
import {memoryDriver} from './db-helper';
import {migrate} from '../src/core/db/migrate';
import {repository} from '../src/core/db/repository';

const AUD = currency('AUD'), USD = currency('USD'), PHP = currency('PHP'), JPY = currency('JPY'), KWD = currency('KWD');
/** 0.655 USD per AUD, as the exact integer the module stores. */
const rate = (value: string) => BigInt(value);

describe('converting an amount', () => {
  it('holds the arithmetic in integers from end to end', () => {
    // $100.00 AUD at 0.65500000 = $65.50 USD, exactly.
    expect(convert(money(10000n, AUD), USD, rate('65500000')).minor).toBe(6550n);
  });

  it('respects that currencies do not all have two decimal places', () => {
    // The trap: 10000 AUD minor units is $100.00, and at 96.5 JPY that is ¥9,650 — 9650 minor units,
    // because JPY has none. Multiplying without rescaling gives ¥965,000, a hundredfold error.
    expect(convert(money(10000n, AUD), JPY, rate('9650000000')).minor).toBe(9650n);
    // KWD has three, so $100.00 at 0.213 is 21.300 KWD — 21300 minor units, not 213000.
    expect(convert(money(10000n, AUD), KWD, rate('21300000')).minor).toBe(21300n);
    // And back the other way: ¥1,000 at 0.01 AUD/JPY is $10.00.
    expect(convert(money(1000n, JPY), AUD, rate('1000000')).minor).toBe(1000n);
  });

  it('rounds half away from zero, so a refund mirrors its purchase', () => {
    // One cent at a rate of 0.5 lands on exactly half a cent, which is the case rounding has to decide.
    const up = convert(money(1n, AUD), USD, rate('50000000'));
    const down = convert(money(-1n, AUD), USD, rate('50000000'));
    expect(up.minor).toBe(1n);
    expect(down.minor).toBe(-1n);
  });

  it('stays exact on an amount a float would lose', () => {
    // 90,071,992,547,409.91 in minor units, times one, is itself. A double cannot hold this.
    expect(convert(money(9007199254740991n, AUD), USD, RATE_SCALE).minor).toBe(9007199254740991n);
  });

  it('refuses a rate of zero or less rather than inventing an amount', () => {
    expect(() => convert(money(10000n, AUD), USD, 0n)).toThrow();
    expect(() => convert(money(10000n, AUD), USD, -1n)).toThrow();
  });
});

describe('which rate applies', () => {
  const rates: Rate[] = [
    {asOf: '2026-09-11', base: AUD, quote: PHP, rateE8: rate('3800000000'), source: 't'},
    {asOf: '2026-09-14', base: AUD, quote: PHP, rateE8: rate('3900000000'), source: 't'},
    {asOf: '2026-09-16', base: AUD, quote: PHP, rateE8: rate('4000000000'), source: 't'},
  ];

  it('uses the rate in force on the day the money moved', () => {
    expect(rateAsAt(rates, AUD, PHP, '2026-09-14')!.asOf).toBe('2026-09-14');
  });

  it('carries the last published rate forward across a weekend', () => {
    // Reference rates are published on working days. A Saturday purchase takes Friday's rate — the one
    // that was in force — not Monday's.
    expect(rateAsAt(rates, AUD, PHP, '2026-09-12')!.asOf).toBe('2026-09-11');
    expect(rateAsAt(rates, AUD, PHP, '2026-09-13')!.asOf).toBe('2026-09-11');
  });

  it('never values an earlier day with a later rate', () => {
    // This is the whole point of storing rates by date: today's rate must not reprice last March.
    expect(rateAsAt(rates, AUD, PHP, '2026-09-10')).toBeNull();
  });

  it('has nothing to do when both sides are the same currency', () => {
    expect(rateAsAt(rates, AUD, AUD, '2026-09-16')).toBeNull();
  });
});

describe('a rate read the other way round', () => {
  it('inverts close enough to return the amount it started from', () => {
    const forward: Rate = {asOf: '2026-09-16', base: AUD, quote: USD, rateE8: rate('65500000'), source: 't'};
    const back = invert(forward);
    expect(back.base).toBe(USD);
    expect(back.quote).toBe(AUD);
    const there = convert(money(10000n, AUD), USD, forward.rateE8);
    expect(convert(there, AUD, back.rateE8).minor).toBe(10000n);
  });
});

describe('what comes back from the rate source', () => {
  it('keeps the day the source published, not the day it was asked', () => {
    const rows = asRates({asOf: '2026-09-15', base: AUD, rates: {USD: rate('65500000'), PHP: rate('3800000000')}});
    expect(rows.every(r => r.asOf === '2026-09-15')).toBe(true);
    expect(rows.map(r => r.quote).sort()).toEqual(['PHP', 'USD']);
    expect(rows.every(r => r.source === 'frankfurter/ecb')).toBe(true);
  });
});

describe('reading a published decimal exactly', () => {
  it('keeps the digits the source printed, which a double would not', () => {
    // 38.2 as a JavaScript number is 38.200000000000003. Every amount converted through that inherits
    // the error, so the digits are taken from the response text instead of from a parsed float.
    expect(decimalToE8('38.2', 'AUD/PHP')).toBe(3820000000n);
    expect(decimalToE8('0.65500', 'AUD/USD')).toBe(65500000n);
    expect(decimalToE8('1', 'AUD/AUD')).toBe(100000000n);
    expect(decimalToE8('96.5', 'AUD/JPY')).toBe(9650000000n);
  });

  it('rounds at the ninth decimal rather than truncating toward zero', () => {
    expect(decimalToE8('0.123456785', 'x/y')).toBe(12345679n);
    expect(decimalToE8('0.123456784', 'x/y')).toBe(12345678n);
  });

  it('refuses anything that is not a positive decimal', () => {
    for (const bad of ['', '-1.5', '0', 'abc', '1.2.3', '1e5', ' '])
      expect(() => decimalToE8(bad, 'x/y')).toThrow();
  });
});

describe('rates in the ledger', () => {
  it('stores a rate against its day and reads it back exactly', async () => {
    const {driver} = memoryDriver(); await migrate(driver); const repo = repository(driver);
    await repo.saveRates([
      {asOf: '2026-09-15', base: 'AUD', quote: 'PHP', rateE8: 3820000000n, source: 'test'},
      {asOf: '2026-09-16', base: 'AUD', quote: 'PHP', rateE8: 3900000000n, source: 'test'},
    ]);
    const stored = await repo.rates();
    expect(stored).toHaveLength(2);
    expect(stored[0]!.asOf).toBe('2026-09-16');
    expect(BigInt(stored[0]!.rateE8)).toBe(3900000000n);
    expect(await repo.ratesAsOf()).toBe('2026-09-16');
  });

  it('replaces a day rather than keeping two rates for it', async () => {
    const {driver} = memoryDriver(); await migrate(driver); const repo = repository(driver);
    await repo.saveRates([{asOf: '2026-09-16', base: 'AUD', quote: 'USD', rateE8: 65000000n, source: 'test'}]);
    await repo.saveRates([{asOf: '2026-09-16', base: 'AUD', quote: 'USD', rateE8: 65500000n, source: 'test'}]);
    const stored = await repo.rates();
    expect(stored).toHaveLength(1);
    expect(BigInt(stored[0]!.rateE8)).toBe(65500000n);
  });

  it('refuses an undated or impossible rate', async () => {
    const {driver} = memoryDriver(); await migrate(driver); const repo = repository(driver);
    await expect(repo.saveRates([{asOf: 'whenever', base: 'AUD', quote: 'USD', rateE8: 1n, source: 't'}])).rejects.toThrow();
    await expect(repo.saveRates([{asOf: '2026-09-16', base: 'AUD', quote: 'USD', rateE8: 0n, source: 't'}])).rejects.toThrow();
  });

  it('values a purchase at the rate in force on its own day, not the newest one', async () => {
    const {driver} = memoryDriver(); await migrate(driver); const repo = repository(driver);
    await repo.saveRates([
      {asOf: '2026-09-11', base: 'AUD', quote: 'PHP', rateE8: 3800000000n, source: 't'},
      {asOf: '2026-09-16', base: 'AUD', quote: 'PHP', rateE8: 4000000000n, source: 't'},
    ]);
    const rows = (await repo.rates()).map(r => ({...r, base: currency(r.base), quote: currency(r.quote), rateE8: BigInt(r.rateE8)}));
    const march = rateAsAt(rows, AUD, PHP, '2026-09-12')!;
    expect(march.asOf).toBe('2026-09-11');
    // $100.00 on the 12th is ₱3,800.00 and stays ₱3,800.00 however far the rate moves afterwards.
    expect(convert(money(10000n, AUD), PHP, march.rateE8).minor).toBe(380000n);
  });
});

describe('the display currency', () => {
  it('is remembered, and refuses one the app cannot denominate', async () => {
    const {driver} = memoryDriver(); await migrate(driver); const repo = repository(driver);
    expect(await repo.displayCurrency()).toBeNull();
    await repo.setDisplayCurrency('PHP');
    expect(await repo.displayCurrency()).toBe('PHP');
    await expect(repo.setDisplayCurrency('XYZ')).rejects.toThrow();
  });
});

describe('a balance and a transaction take different rates, for the same reason', () => {
  const rates: Rate[] = [
    {asOf: '2026-09-11', base: AUD, quote: PHP, rateE8: 3800000000n, source: 't'},
    {asOf: '2026-09-16', base: AUD, quote: PHP, rateE8: 4000000000n, source: 't'},
  ];

  it('values what is held now at the newest rate', () => {
    // A balance is a present-tense fact. What $100 is worth today is today's rate.
    const now = rateAsAt(rates, AUD, PHP, '2026-09-16')!;
    expect(now.asOf).toBe('2026-09-16');
    expect(convert(money(10000n, AUD), PHP, now.rateE8).minor).toBe(400000n);
  });

  it('values what happened on a day at that day\'s rate, forever', () => {
    // A transaction is a thing that happened. Repricing it later rewrites the past.
    const then = rateAsAt(rates, AUD, PHP, '2026-09-12')!;
    expect(then.asOf).toBe('2026-09-11');
    expect(convert(money(10000n, AUD), PHP, then.rateE8).minor).toBe(380000n);
  });
});
