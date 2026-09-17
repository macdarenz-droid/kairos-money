import {describe, expect, it} from 'vitest';
import {keepToday, savingsPath} from '../src/intelligence/savings';
import {currency} from '../src/core/money';
import type {Snapshot, Transaction} from '../src/intelligence/model';

const PHP = currency('PHP');
const day = (offset: number) => new Date(Date.UTC(2026, 8, 18) + offset * 86400000).toISOString().slice(0, 10);
const TODAY = day(0);

function spend(id: string, date: string, minor: string, over: Partial<Transaction> = {}): Transaction {
  return {id, accountId: 'a', date, minor, currency: PHP, description: 'Synthetic shop', category: 'Groceries',
    kind: 'essential', status: 'settled', transfer: false, recurring: false, ...over};
}
const snapshot = (transactions: Transaction[], over: Partial<Snapshot> = {}): Snapshot => ({
  asOf: TODAY, currency: PHP, accountIds: ['a'], transactions, coverage: [], pays: [],
  savings: {asideMinor: '0', accountIds: [], evidence: []}, ...over,
});

describe('what to keep today', () => {
  it('says nothing at all until a week of history exists', () => {
    expect(keepToday(snapshot([spend('a', day(-2), '-10000')]), '500000').status).toBe('not_yet');
    expect(keepToday(snapshot([]), '500000').status).toBe('not_yet');
  });

  /**
   * He spent ₱1,000 on ten of the twenty-one days he has recorded anything at all, so a typical day
   * costs ₱476 — median size, scaled by how often a day costs anything, over the days he has a record
   * of rather than over a calendar month he was not using the app for.
   */
  it('suggests what is left after a typical day, rounded down to something doable', () => {
    const rows = Array.from({length: 10}, (_, i) => spend(`s${i}`, day(-2 - i * 2), '-100000'));
    const keep = keepToday(snapshot(rows), '5000000');
    expect(keep.status).toBe('ok');
    expect(keep.tier).toBe('month');
    expect(keep.typicalDayMinor).toBe('47619');
    // Divisible by ₱5, and never more than the arithmetic supports.
    expect(BigInt(keep.keepTodayMinor) % 500n).toBe(0n);
    expect(BigInt(keep.keepTodayMinor) * BigInt(keep.days))
      .toBeLessThanOrEqual(5000000n - BigInt(keep.typicalDayMinor) * BigInt(keep.days));
  });

  /** One expensive day must not suppress a fortnight of advice, which is why this is a median. */
  it('is not moved by a single large day', () => {
    const ordinary = Array.from({length: 10}, (_, i) => spend(`s${i}`, day(-2 - i * 2), '-100000'));
    const withShock = [...ordinary, spend('flight', day(-3), '-2000000')];
    const before = keepToday(snapshot(ordinary), '5000000');
    const after = keepToday(snapshot(withShock), '5000000');
    // The shock day raises the typical day by its share of one day in eleven, not by its whole size.
    expect(BigInt(after.typicalDayMinor) - BigInt(before.typicalDayMinor)).toBeLessThan(40000n);
  });

  /** A bill that has arrived three times is money already owed, even in a ledger with no statements. */
  it('reserves a repeating bill due inside the horizon, and keeps nothing when it takes what is there', () => {
    // ₱9,000 every fortnight, last paid eight days ago: the next one lands six days from now.
    const bill = [0, 1, 2].map(i => spend(`b${i}`, day(-36 + i * 14), '-900000', {description: 'Synthetic rent'}));
    const keep = keepToday(snapshot(bill), '1000000');
    expect(keep.committedMinor).toBe('900000');
    expect(keep.keepTodayMinor).toBe('0');
    // With room for the bill and a typical day, the same ledger does suggest something.
    expect(BigInt(keepToday(snapshot(bill), '5000000').keepTodayMinor)).toBeGreaterThan(0n);
  });

  /** Money he asked to keep untouched is not a surplus to be suggested away. */
  it('never suggests the buffer', () => {
    const rows = Array.from({length: 10}, (_, i) => spend(`s${i}`, day(-2 - i * 2), '-100000'));
    const free = keepToday(snapshot(rows), '5000000');
    const reserved = keepToday(snapshot(rows), '5000000', '4000000');
    expect(BigInt(reserved.keepTodayMinor)).toBeLessThan(BigInt(free.keepTodayMinor));
  });

  /** A payslip caps the rate at the savings share of income, so a fat month cannot propose a rate that cannot hold. */
  it('caps the suggestion at a fifth of a day of pay', () => {
    const rows = Array.from({length: 10}, (_, i) => spend(`s${i}`, day(-2 - i * 2), '-100000'));
    const pays = [0, 1, 2, 3].map(i => ({id: `p${i}`, employer: 'Synthetic', date: day(-42 + i * 14),
      start: day(-56 + i * 14), end: day(-43 + i * 14), net: '1400000', gross: '1600000',
      currency: PHP, transactionId: null}));
    const keep = keepToday(snapshot(rows, {pays}), '5000000');
    expect(keep.tier).toBe('payday');
    // ₱14,000 a fortnight is ₱1,000 a day; a fifth of that is ₱200 a day. Regular pay and even spending
    // read as steady, so the method is pay yourself first: the same ₱200 × 14 days, moved once on payday.
    expect(keep.when).toBe('payday');
    expect(keep.keepTodayMinor).toBe((20000n * BigInt(keep.days)).toString());
  });
});

describe('the savings path', () => {
  it('walks the pot backwards through what was kept, and forwards at the suggested rate', () => {
    const kept = spend('put', day(-5), '-50000', {kind: 'savings', category: 'Savings'});
    const path = savingsPath(snapshot([kept]), '200000', '10000', 10);
    const at = (date: string) => path.find(p => p.date === date)!;
    // Before that day the pot was ₱500 smaller; today it is what it is; ahead it rises ₱100 a day.
    expect(at(day(-6)).keptMinor).toBe('150000');
    expect(at(day(-4)).keptMinor).toBe('200000');
    expect(at(TODAY).keptMinor).toBe('200000');
    expect(at(day(1)).plannedMinor).toBe('210000');
    expect(at(day(10)).plannedMinor).toBe('300000');
    // The two lines meet on today rather than jumping.
    expect(at(TODAY).plannedMinor).toBe('200000');
  });

  it('draws a flat line ahead when there is nothing to suggest', () => {
    const path = savingsPath(snapshot([]), '200000', '0', 5);
    expect(path.filter(p => p.plannedMinor !== null).every(p => p.plannedMinor === '200000')).toBe(true);
  });
});
