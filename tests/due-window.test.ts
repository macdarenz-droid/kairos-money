import {describe, expect, it} from 'vitest';
import {dueWindow} from '../src/intelligence/visuals/due';
import type {Recurrence} from '../src/intelligence/forecast';

/**
 * The strip answers two questions: when, and which side of payday. These tests are mostly about the
 * second one, because that is the part a list of amounts cannot express and the part that decides
 * whether a bill is ordinary or a problem.
 */
const bill = (merchant: string, minor: string, next: string, interval = 30): Recurrence =>
  ({merchant, minor, interval, next, evidence: []});

describe('the next thirty days', () => {
  it('is empty when nothing repeats', () => {
    expect(dueWindow([], '2026-09-16', '2026-09-30').dues).toEqual([]);
  });

  it('places each bill by how many days away it is, never by a date the screen has to parse', () => {
    const w = dueWindow([bill('rent', '200000', '2026-09-20')], '2026-09-16', null);
    expect(w.dues).toHaveLength(1);
    expect(w.dues[0]).toMatchObject({offset: 4, merchant: 'rent', minor: '200000'});
  });

  it('scales heights to the largest bill in view, not to a fixed amount', () => {
    // The strip has to read the same whether the biggest bill is 500 or 500,000.
    const w = dueWindow([bill('rent', '200000', '2026-09-20'), bill('music', '50000', '2026-09-22')], '2026-09-16', null);
    expect(w.dues.map(d => d.height)).toEqual(['1000000', '250000']);
  });

  it('draws two bills on one day in the same order every time', () => {
    const a = dueWindow([bill('aaa', '10000', '2026-09-20'), bill('zzz', '90000', '2026-09-20')], '2026-09-16', null);
    const b = dueWindow([bill('zzz', '90000', '2026-09-20'), bill('aaa', '10000', '2026-09-20')], '2026-09-16', null);
    expect(a.dues.map(d => d.merchant)).toEqual(b.dues.map(d => d.merchant));
    expect(a.dues[0]?.merchant).toBe('zzz');   // Largest first at the same date.
  });

  it('marks which bills land before the next pay, because that is the difference that matters', () => {
    const w = dueWindow([bill('rent', '200000', '2026-09-18'), bill('music', '50000', '2026-09-28')],
      '2026-09-16', '2026-09-25');
    expect(w.dues.map(d => d.beforePay)).toEqual([true, false]);
    // Only what lands before pay has to come out of what is held right now.
    expect(w.beforePayMinor).toBe('200000');
    expect(w.payOffset).toBe(9);
  });

  it('counts a bill falling exactly on payday as before it', () => {
    // Money owed on the day it arrives still has to be covered that day; treating it as "after" would
    // be the app rounding in its own favour with someone else's rent.
    const w = dueWindow([bill('rent', '200000', '2026-09-25')], '2026-09-16', '2026-09-25');
    expect(w.dues[0]?.beforePay).toBe(true);
  });

  it('claims nothing about payday when the ledger cannot say when it is', () => {
    // Too few payslips to know. Guessing a pay date would put a line on the chart that means nothing.
    const w = dueWindow([bill('rent', '200000', '2026-09-18')], '2026-09-16', null);
    expect(w.payOffset).toBeNull();
    expect(w.dues[0]?.beforePay).toBe(false);
    expect(w.beforePayMinor).toBe('0');
  });

  it('ignores a pay date beyond the window rather than drawing it off the edge', () => {
    const w = dueWindow([bill('rent', '200000', '2026-09-18')], '2026-09-16', '2026-11-01');
    expect(w.payOffset).toBeNull();
  });

  it('repeats a weekly bill across the window', () => {
    const w = dueWindow([bill('groceries', '8000', '2026-09-18', 7)], '2026-09-16', null);
    expect(w.dues.map(d => d.offset)).toEqual([2, 9, 16, 23, 30]);
  });
});
