import {describe, expect, it} from 'vitest';
import {MAX_SURFACES, surfaces} from '../src/intelligence/surfaces';
import type {Signal, Snapshot, Transaction} from '../src/intelligence/model';
import {currency} from '../src/core/money';

/**
 * These tests are mostly about what does NOT appear. A relevance engine is judged by its silence: one
 * that shows something every time is a decorated screen, not an intelligent one.
 */
const AUD = currency('AUD');
const row = (id: string, date: string, minor: string, description: string): Transaction =>
  ({id, accountId: 'a', date, minor, currency: AUD, description, category: '', kind: 'discretionary',
    status: 'settled', transfer: false, recurring: false});
const snapshot = (transactions: Transaction[] = []): Snapshot =>
  ({asOf: '2026-09-16', currency: AUD, accountIds: ['a'], transactions, coverage: [], pays: []});
const signal = (key: Signal['key'], value: string | null): Signal =>
  ({key, version: 1, period: 'trailing-90:2026-09-16', status: value === null ? 'insufficient_data' : 'ok',
    value, unit: '', reason: '', confidence: 100, unverified: false, evidence: [], details: {},
    inputs: {window: {start: '2026-06-19', end: '2026-09-16', label: 't'}, coveredDays: 90,
      transactions: [], coverage: [], pays: [], liquid: null, selfReport: null}});

describe('what earns screen space', () => {
  it('shows nothing when nothing is true', () => {
    expect(surfaces(snapshot(), [])).toEqual([]);
  });

  it('says nothing about runway while there is plenty of it', () => {
    // 45 days is not news. An app that congratulates you on being fine has to be read every day to
    // find the day it isn't.
    expect(surfaces(snapshot(), [signal('buffer_days', (45n * 10000n).toString())])).toEqual([]);
  });

  it('shows runway once it drops below a month, and raises it under a week', () => {
    const month = surfaces(snapshot(), [signal('buffer_days', (20n * 10000n).toString())]);
    expect(month).toHaveLength(1);
    expect(month[0]).toMatchObject({id: 'runway', urgency: 2, data: {days: '20'}});
    const week = surfaces(snapshot(), [signal('buffer_days', (6n * 10000n).toString())]);
    expect(week[0]).toMatchObject({id: 'runway', urgency: 3});
  });

  it('counts part days down, never up', () => {
    // 6.9 days of money left is 6 days you can count on. Rounding to 7 would be the app being
    // optimistic with someone else's rent.
    const found = surfaces(snapshot(), [signal('buffer_days', '69000')]);
    expect(found[0]?.data['days']).toBe('6');
  });

  it('stays quiet when a signal could not be measured', () => {
    expect(surfaces(snapshot(), [signal('buffer_days', null), signal('fixed_burden', null)])).toEqual([]);
  });

  it('mentions committed income only once it is most of it', () => {
    expect(surfaces(snapshot(), [signal('fixed_burden', '4500')])).toEqual([]);
    expect(surfaces(snapshot(), [signal('fixed_burden', '7200')])[0])
      .toMatchObject({id: 'fixed-burden', urgency: 1, data: {basisPoints: '7200'}});
  });
});

describe('an unusually large charge', () => {
  const regular = (amounts: string[], description = 'Synthetic grocer') =>
    amounts.map((minor, i) => row(`t${i}`, `2026-0${Math.floor(i / 28) + 1}-${String((i % 28) + 1).padStart(2, '0')}`, minor, description));

  it('needs a history before anything counts as unusual', () => {
    // Four visits do not establish a usual price. Calling the fifth one strange would be the app
    // inventing a pattern out of a coincidence.
    expect(surfaces(snapshot(regular(['-2000', '-2100', '-1900', '-90000'])), [])).toEqual([]);
  });

  it('compares a merchant against itself, not against everything', () => {
    const found = surfaces(snapshot(regular(['-2000', '-2100', '-1900', '-2000', '-2050', '-90000'])), []);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({id: 'unusual-charge', urgency: 2,
      data: {merchant: 'Synthetic grocer', minor: '90000', usualMinor: '2000'}});
    expect(found[0]!.evidence).toEqual(['t5']);
  });

  it('ignores a big multiple of a trivial amount', () => {
    // Five times a $2 coffee is $10 — true, and not worth a word, when your typical purchase is $30.
    // The coffees alone would make $10 the biggest thing that ever happened, so the ledger has to
    // contain ordinary spending for the question to mean anything.
    const ledger = [
      ...regular(['-200', '-200', '-210', '-190', '-200', '-1000']),
      ...['-3000', '-2800', '-3200', '-4000', '-2600'].map((m, i) => row(`o${i}`, `2026-03-0${i + 1}`, m, `Synthetic shop ${i}`)),
    ];
    expect(surfaces(snapshot(ledger), [])).toEqual([]);
  });

  it('still reports it when that merchant IS how you spend', () => {
    // The same coffees with nothing else in the ledger: now a fivefold charge is the largest thing
    // that has happened, and staying silent would be the app deciding it knows better.
    expect(surfaces(snapshot(regular(['-200', '-200', '-210', '-190', '-200', '-1000'])), []))
      .toHaveLength(1);
  });

  it('is not fooled by one earlier spike raising the bar', () => {
    // The median holds the line where the mean would not: a single previous large charge must not
    // quietly become the "usual" and hide the next one.
    const found = surfaces(snapshot(regular(['-2000', '-2000', '-2000', '-2000', '-500000', '-90000'])), []);
    expect(found[0]).toMatchObject({data: {usualMinor: '2000', minor: '90000'}});
  });

  it('never reports a transfer between your own accounts', () => {
    const rows = regular(['-2000', '-2000', '-2000', '-2000', '-2000', '-90000'])
      .map(t => ({...t, transfer: true}));
    expect(surfaces(snapshot(rows), [])).toEqual([]);
  });
});

describe('the cap', () => {
  it('never shows more than three things, most urgent first', () => {
    const rows = ['-2000', '-2000', '-2000', '-2000', '-2000', '-90000']
      .map((minor, i) => row(`t${i}`, `2026-01-0${i + 1}`, minor, 'Synthetic grocer'));
    const found = surfaces(snapshot(rows), [
      signal('buffer_days', (3n * 10000n).toString()),
      signal('fixed_burden', '8000'),
    ]);
    expect(found.length).toBeLessThanOrEqual(MAX_SURFACES);
    expect(found.map(s => s.urgency)).toEqual([...found.map(s => s.urgency)].sort((a, b) => b - a));
    expect(found[0]?.id).toBe('runway');
  });

  it('gives the same ledger the same screen every time', () => {
    // A home screen that reorders itself between two identical openings is one you cannot learn.
    const s = snapshot(), sig = [signal('buffer_days', '150000'), signal('fixed_burden', '9000')];
    expect(surfaces(s, sig)).toEqual(surfaces(s, sig));
  });
});

describe('a bill that is nearly due', () => {
  const due = (offsets: number[], payOffset: number | null = null) => ({
    days: 30, payOffset, beforePayMinor: '0',
    dues: offsets.map(offset => ({date: `2026-09-${String(16 + offset).padStart(2, '0')}`, offset,
      merchant: 'Synthetic utility', minor: '50000', height: '1000000', beforePay: false})),
  });

  it('says nothing about a bill three weeks out', () => {
    // Something is due before the next pay in almost every week of everyone's life. A surface that
    // fired on that would be permanent furniture, and permanent furniture is invisible.
    expect(surfaces(snapshot(), [], due([21]))).toEqual([]);
  });

  it('speaks up inside three days, at the highest urgency', () => {
    const found = surfaces(snapshot(), [], due([2]));
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({id: 'due-soon', urgency: 3, data: {count: '1', minor: '50000'}});
  });

  it('adds up everything landing in that window', () => {
    const found = surfaces(snapshot(), [], due([0, 1, 3, 9]));
    expect(found[0]?.data).toMatchObject({count: '3', minor: '150000'});
  });

  it('outranks a low runway, because it has a date on it', () => {
    const found = surfaces(snapshot(), [signal('buffer_days', (20n * 10000n).toString())], due([1]));
    expect(found.map(s => s.id)).toEqual(['due-soon', 'runway']);
  });

  it('is absent entirely when the ledger knows of no repeating payments', () => {
    expect(surfaces(snapshot(), [], undefined)).toEqual([]);
  });
});
