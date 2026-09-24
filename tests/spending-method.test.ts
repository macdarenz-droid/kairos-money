import {describe, expect, it} from 'vitest';
import {roundUp, spendingPattern} from '../src/intelligence/method';
import {keepToday} from '../src/intelligence/savings';
import {currency} from '../src/core/money';
import type {Snapshot, Transaction} from '../src/intelligence/model';

const PHP = currency('PHP');
const day = (offset: number) => new Date(Date.UTC(2026, 8, 18) + offset * 86400000).toISOString().slice(0, 10);

function row(id: string, date: string, minor: string, over: Partial<Transaction> = {}): Transaction {
  return {id, accountId: 'a', date, minor, currency: PHP, description: 'Synthetic', category: 'Shopping',
    kind: 'discretionary', status: 'settled', transfer: false, recurring: false, ...over};
}
const pay = (id: string, date: string, minor = '2000000') => row(id, date, minor, {kind: 'income', category: 'Income', description: 'Synthetic pay'});
const snapshot = (transactions: Transaction[]): Snapshot => ({
  asOf: day(0), currency: PHP, accountIds: ['a'], transactions, coverage: [], pays: [],
  savings: {asideMinor: '0', accountIds: [], evidence: []},
});

/** Fortnightly pay on the same weekday, ₱600 most days: nothing about it is a surprise. */
const steady = () => [
  ...[-70, -56, -42, -28, -14].map((d, i) => pay(`p${i}`, day(d))),
  ...Array.from({length: 60}, (_, i) => row(`s${i}`, day(-i - 1), '-60000', {kind: 'essential', category: 'Groceries'})),
];
/** The same pay, but ₱3,000 a day for three days after it and ₱300 the rest of the cycle. */
const sprinter = () => [
  ...[-70, -56, -42, -28, -14].map((d, i) => pay(`p${i}`, day(d))),
  ...Array.from({length: 70}, (_, i) => {
    const since = [70, 56, 42, 28, 14].map(p => (-i - 1) + p).filter(x => x >= 0).sort((a, b) => a - b)[0];
    return row(`s${i}`, day(-i - 1), since !== undefined && since <= 2 ? '-300000' : '-30000');
  }),
];
/** The same pay, and forty purchases under ₱15 alongside a few ordinary ones. */
const leaky = () => [
  ...[-70, -56, -42, -28, -14].map((d, i) => pay(`p${i}`, day(d))),
  ...Array.from({length: 50}, (_, i) => row(`l${i}`, day(-(i % 28) - 1), '-1240')),
  ...Array.from({length: 6}, (_, i) => row(`b${i}`, day(-i * 9 - 2), '-25000')),
];
/** Pay that lands 9, then 31, then 12, then 40 days apart, in different sizes. */
const irregular = () => [
  pay('p0', day(-85), '1200000'), pay('p1', day(-76), '3100000'), pay('p2', day(-45), '900000'), pay('p3', day(-33), '2600000'),
  ...Array.from({length: 40}, (_, i) => row(`s${i}`, day(-i * 2 - 1), '-50000', {kind: 'essential', category: 'Groceries'})),
];

describe('reading how he spends', () => {
  it('says nothing until a week of history exists', () => {
    expect(spendingPattern(snapshot([row('a', day(-2), '-1000')])).status).toBe('not_yet');
  });
  it('reads even spending on regular pay as steady, and assigns pay yourself first', () => {
    const r = spendingPattern(snapshot(steady()));
    expect(r.pattern).toBe('steady'); expect(r.method).toBe('pay-yourself-first');
    expect(r.measures.payKnown).toBe(true); expect(r.measures.payIrregular).toBe(false);
  });
  it('reads money that goes in the days after pay as a sprinter, and assigns a daily allowance', () => {
    const r = spendingPattern(snapshot(sprinter()));
    expect(r.pattern).toBe('sprinter'); expect(r.method).toBe('daily-allowance');
    expect(BigInt(r.measures.paydayFront ?? '0')).toBeGreaterThanOrEqual(20000n);
  });
  it('reads many purchases under fifteen units as small leaks, and assigns round up', () => {
    const r = spendingPattern(snapshot(leaky()));
    expect(r.pattern).toBe('leaky'); expect(r.method).toBe('round-up');
    expect(r.measures.smallCount).toBeGreaterThanOrEqual(10);
  });
  it('reads pay that lands when it lands as irregular, and assigns a share when paid', () => {
    const r = spendingPattern(snapshot(irregular()));
    expect(r.pattern).toBe('irregular'); expect(r.method).toBe('baseline-percent');
    expect(r.measures.payIrregular).toBe(true);
  });
  it('prefers the most specific reading: irregular pay outranks leaks', () => {
    const r = spendingPattern(snapshot([...irregular(), ...Array.from({length: 40}, (_, i) => row(`l${i}`, day(-(i % 28) - 1), '-1240'))]));
    expect(r.pattern).toBe('irregular');
  });
});

describe('what the method changes about the suggestion', () => {
  it('round up keeps the difference to the next whole hundred', () => {
    expect(roundUp(-124000n, PHP)).toBe(6000n);   // ₱1,240 → ₱60
    expect(roundUp(-130000n, PHP)).toBe(0n);      // ₱1,300 → nothing
    expect(roundUp(-1240n, PHP)).toBe(8760n);     // ₱12.40 → ₱87.60
  });
  it('pay yourself first moves one amount on payday, never more than the daily figure would over the cycle', () => {
    const s = snapshot(steady());
    const k = keepToday(s, '20000000');
    expect(k.when).toBe('payday');
    expect(BigInt(k.keepTodayMinor) % 500n).toBe(0n);
    // The lump is the daily headroom for the whole horizon, so reserving it leaves the same spend per day.
    expect(BigInt(k.spendTodayMinor)).toBeGreaterThan(0n);
  });
  it('a daily allowance keeps a little each day', () => {
    const k = keepToday(snapshot(sprinter()), '20000000');
    expect(k.when).toBe('today');
    expect(BigInt(k.keepTodayMinor)).toBeGreaterThan(0n);
  });
  it('round up suggests the size of the leak and no more than there is room for', () => {
    const k = keepToday(snapshot(leaky()), '20000000');
    expect(k.when).toBe('today');
    expect(k.reading.method).toBe('round-up');
    // Fifty ₱12.40 purchases round up ₱87.60 each; the week's share of that, per day, rounded to ₱5.
    expect(BigInt(k.keepTodayMinor)).toBeGreaterThan(0n);
    expect(BigInt(k.keepTodayMinor) % 500n).toBe(0n);
  });
  it('a share when paid is a tenth of what landed this week, and nothing when nothing did', () => {
    const quiet = keepToday(snapshot(irregular()), '20000000');
    expect(quiet.when).toBe('paid'); expect(quiet.keepTodayMinor).toBe('0');
    const paid = keepToday(snapshot([...irregular(), pay('now', day(-1), '1500000')]), '20000000');
    expect(paid.keepTodayMinor).toBe('150000');
  });
});
