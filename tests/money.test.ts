import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { add, allocate, currency, format, fromDatabase, money, parseDecimal, serialize, subtract, toDatabase, type Currency } from '../src/core/money';
describe('Exact money', () => {
  it('conserves every cent across 10,000 random operation sequences', () => {
    fc.assert(fc.property(fc.bigInt({ min: -1000000000000n, max: 1000000000000n }), fc.bigInt({ min: -1000000000000n, max: 1000000000000n }), fc.array(fc.bigInt({ min: 0n, max: 100n }), { minLength: 1, maxLength: 20 }), (a, b, weights) => {
      const value = money(a, 'AUD');
      expect(subtract(add(value, money(b, 'AUD')), money(b, 'AUD'))).toEqual(value);
      const parts = allocate(value, [1n, ...weights]);
      expect(parts.reduce((n, p) => n + p.minor, 0n)).toBe(a);
      expect(fromDatabase(toDatabase(value), 'AUD')).toEqual(value);
    }), { numRuns: 10000, seed: 9132026 });
  });
  it.each([['AUD', '123.45', 12345n], ['JPY', '123', 123n], ['KWD', '-0.001', -1n]] as const)('parses %s without a float', (code, value, minor) => expect(parseDecimal(value, code)).toEqual(money(minor, code)));
  it('formats negative subunit values and large amounts exactly', () => {
    expect(format(money(-1n, 'AUD'))).toBe('-$0.01');
    expect(format(money(9007199254740991n, 'AUD'))).toBe('$90,071,992,547,409.91');
    expect(format(money(123n, 'JPY'), 'ja-JP')).toContain('123');
    expect(format(money(123456n, 'EUR'), 'de-DE')).toContain('1.234,56');
  });
  it('rejects invalid and overflowing inputs', () => {
    expect(() => money(9007199254740992n, 'AUD')).toThrow();
    expect(() => fromDatabase(0.1, 'AUD')).toThrow();
    expect(() => parseDecimal('1.001', 'AUD')).toThrow();
    expect(() => parseDecimal('1e3', 'AUD')).toThrow();
    expect(() => money(1n, 'XYZ' as Currency)).toThrow();
    expect(() => currency('XYZ')).toThrow();
    expect(() => add(money(1n, 'AUD'), money(1n, 'PHP'))).toThrow();
    expect(() => allocate(money(1n, 'AUD'), [0n])).toThrow();
    expect(() => allocate(money(1n, 'AUD'), [-1n])).toThrow();
  });
  it('allocates signed remainders deterministically and never to zero weights', () => {
    expect(allocate(money(-5n, 'AUD'), [0n, 1n, 1n]).map(x => x.minor)).toEqual([0n, -3n, -2n]);
    expect(serialize(money(5n, 'PHP'))).toEqual({ minor: '5', currency: 'PHP' });
  });
});
